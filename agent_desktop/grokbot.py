"""Grok Bot transport behind the shared provider protocol."""
import asyncio
import importlib.machinery
import importlib.util
import json
from pathlib import Path
import uuid

from .protocol import Fault, identifier, text, MAX_PROMPT

ROOT = Path(__file__).resolve().parent.parent


def legacy_module():
    loader = importlib.machinery.SourceFileLoader('agent_desktop_grok_transport', str(ROOT/'bin/grokbot-ask'))
    spec = importlib.util.spec_from_loader(loader.name, loader)
    module = importlib.util.module_from_spec(spec)
    loader.exec_module(module)
    return module


class GrokBot:
    name = 'grokbot'

    def __init__(self):
        self.transport = legacy_module()
        self.emit = None
        self.active = {}
        self.used = set()

    @property
    def capabilities(self):
        mode, _ = self.transport.dispatch_mode(self.transport.plugin_entry(), self.transport.desktop_config())
        return dict(streaming=False, cancellation='request', attachments=mode == 'agent',
                    history=False, prompts=False, compaction=False, deferredReplies=mode == 'webhook')

    def agents(self):
        source = Path.home()/'.config/omarchy/grokbot-bots.json'
        if not source.exists() and not source.is_symlink():
            source = ROOT/'data/bots.json'
        data = self.transport.read_json(str(source), 1024*1024)
        rows = data.get('bots') if isinstance(data, dict) else data
        if not isinstance(rows, list) or not rows or len(rows) > 512:
            raise Fault('invalid_config', 'Grok Bot roster is unreadable or invalid; sync it again.')
        result = {}
        caps = self.capabilities
        for row in rows:
            if not isinstance(row, dict) or not self.transport.SAFE_ID.fullmatch(str(row.get('id', ''))):
                raise Fault('invalid_config', 'Grok Bot roster has an invalid identity.')
            agent = row['id']
            if agent in result:
                raise Fault('invalid_config', 'Grok Bot roster has duplicate identities.')
            result[agent] = dict(id=agent, name=text(row.get('name'), 160),
                shortName=str(row.get('shortName') or row['name'])[:120], availability='unknown', capabilities=caps)
            for field in ('avatarShape', 'avatarColor'):
                if isinstance(row.get(field), str):
                    result[agent][field] = row[field][:40]
        return result

    def event(self, name, request, **fields):
        row = self.active[request]
        if row.get('terminal'):
            return
        if name == 'message.finished':
            row['terminal'] = True
        self.emit(name, dict(agentId=row['agent'], sessionId=row['session'], requestId=request, **fields))

    async def stop_worker(self, row):
        proc = row.get('process')
        if proc is not None and proc.returncode is None:
            try:
                proc.terminate()
            except ProcessLookupError:
                pass
            try:
                await asyncio.wait_for(proc.wait(), 2)
            except TimeoutError:
                proc.kill()
                await proc.wait()

    async def run(self, request, payload, seconds):
        row = self.active[request]
        try:
            async with asyncio.timeout(seconds):
                spawn = asyncio.create_task(asyncio.create_subprocess_exec('/usr/bin/setpriv', '--pdeathsig', 'TERM',
                    '/usr/bin/python3', '-I', str(ROOT/'bin/grokbot-ask'),
                    stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE, limit=65538))
                try:
                    proc = await asyncio.shield(spawn)
                except asyncio.CancelledError:
                    row['process'] = await spawn
                    raise
                row['process'] = proc
                proc.stdin.write(json.dumps(payload, ensure_ascii=False).encode())
                await proc.stdin.drain()
                proc.stdin.close()
                async def bounded(stream, limit):
                    data = bytearray()
                    while True:
                        chunk = await stream.read(min(4096, limit + 1 - len(data)))
                        if not chunk:
                            return bytes(data)
                        data.extend(chunk)
                        if len(data) > limit:
                            raise Fault('limit_exceeded', 'Grok Bot transport output exceeded its limit.')
                out_task = asyncio.create_task(bounded(proc.stdout, 65537))
                err_task = asyncio.create_task(bounded(proc.stderr, 16384))
                try:
                    out, _ = await asyncio.gather(out_task, err_task)
                    code = await proc.wait()
                finally:
                    for task in (out_task, err_task):
                        task.cancel()
                    await asyncio.gather(out_task, err_task, return_exceptions=True)
                if code == 10:
                    row['deferred'] = True
                    self.event('message.deferred', request, deliveryId=row['delivery'], remoteMayContinue=True)
                    await row['reply'].wait()
                    return
                if code != 0:
                    errors = {2: ('invalid_config', 'Check Grok Bot dispatch settings and attachments.'),
                              3: ('unavailable', 'Grok Bot webhook credentials are missing or not private.'),
                              125: ('limit_exceeded', 'Grok Bot transport output exceeded its limit.'),
                              127: ('unavailable', 'The configured local agent is unavailable.'),
                              124: ('deadline_exceeded', 'The local agent timed out.')}
                    error, message = errors.get(code, ('delivery_unknown', 'Grok Bot did not confirm completion; inspect it before retrying.'))
                    raise Fault(error, message)
                answer = out.decode('utf-8', errors='replace').strip()
                if not answer:
                    raise Fault('delivery_unknown', 'Grok Bot returned no answer.')
                self.event('message.finished', request, status='completed', text=answer)
        except TimeoutError:
            self.event('message.finished', request, status='failed', text='', remoteMayContinue=row['remote'],
                error=Fault('deadline_exceeded', 'Request deadline exceeded.').data())
        except Fault as exc:
            self.event('message.finished', request, status='failed', text='', remoteMayContinue=row['remote'], error=exc.data())
        except OSError:
            self.event('message.finished', request, status='failed', text='',
                error=Fault('unavailable', 'Could not start the Grok Bot transport.').data())
        finally:
            await self.stop_worker(row)
            self.active.pop(request, None)

    async def call(self, method, params):
        if method == 'agents.list':
            return dict(complete=True, agents=list(self.agents().values()))
        if method == 'message.send':
            request = identifier(params.get('requestId'), 'requestId')
            agent = identifier(params.get('agentId'), 'agentId')
            prompt = text(params.get('text'), MAX_PROMPT)
            agents = self.agents()
            if agent not in agents:
                raise Fault('unavailable', 'Unknown Grok Bot agent.')
            if request in self.used:
                raise Fault('duplicate_id', 'Request ID has already been used; do not replay it.')
            if any(row['agent'] == agent for row in self.active.values()):
                raise Fault('busy', 'This agent already has an active request.')
            if len(self.used) >= 4096 or len(self.active) >= 16:
                raise Fault('limit_exceeded', 'Adapter request limit reached.')
            attachments = self.transport.parse_attachments(params.get('attachments'))
            if attachments is None:
                raise Fault('invalid_request', 'Attachments must be private staged files (at most four).')
            caps = agents[agent]['capabilities']
            if attachments and not caps['attachments']:
                raise Fault('unsupported', 'This Grok Bot transport does not accept attachments.')
            seconds = params.get('timeoutSeconds', 600 if caps['deferredReplies'] else 180)
            if type(seconds) not in (int, float) or not 1 <= seconds <= 1800:
                raise Fault('invalid_request', 'timeoutSeconds must be between 1 and 1800.')
            delivery = request if self.transport.ASK_ID.fullmatch(request) else uuid.uuid4().hex
            row = dict(agent=agent, session='grokbot:'+agent, delivery=delivery, deferred=False,
                       reply=asyncio.Event(), remote=caps['deferredReplies'])
            payload = dict(askId=delivery, botId=agent, botName=agents[agent]['shortName'], prompt=prompt,
                           attachments=attachments, host='')
            self.used.add(request)
            self.active[request] = row
            row['task'] = asyncio.create_task(self.run(request, payload, seconds))
            return dict(requestId=request, sessionId=row['session'], accepted=True,
                        delivery='pending', deliveryId=delivery)
        if method in ('request.cancel', 'message.reply'):
            request = identifier(params.get('requestId'), 'requestId')
            row = self.active.get(request)
            if row is None or row.get('terminal'):
                raise Fault('unavailable', 'No active request with that ID.')
            if method == 'message.reply':
                if not row['remote'] or params.get('deliveryId') != row['delivery']:
                    raise Fault('stale_request', 'Reply delivery identity does not match.')
                answer = text(params.get('text'), 65536)
                # A callback can beat the HTTP acknowledgement; it still owns this request.
                self.event('message.finished', request, status='completed', text=answer)
                row['reply'].set()
            else:
                self.event('message.finished', request, status='cancelled', text='', remoteMayContinue=row['remote'])
            row['task'].cancel()
            await asyncio.gather(row['task'], return_exceptions=True)
            self.active.pop(request, None)
            return dict(requestId=request, status='confirmed', scope='local', remoteMayContinue=row['remote'])
        raise Fault('unsupported', 'This Grok Bot transport does not support that operation.')

    async def close(self):
        tasks = [row['task'] for row in self.active.values()]
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        self.active.clear()

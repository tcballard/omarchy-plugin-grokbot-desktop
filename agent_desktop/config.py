"""Desktop provider configuration; legacy Grok settings remain owned by GrokBot."""
import json
from pathlib import Path
from .protocol import Fault


def configuration():
    path = Path.home()/'.config/omarchy/agent-desktop.json'
    try:
        with path.open('rb') as handle:
            raw = handle.read(65537)
    except FileNotFoundError:
        return {}
    except OSError:
        raise Fault('invalid_config', 'Cannot read agent-desktop.json.') from None
    try:
        if len(raw) > 65536:
            raise ValueError()
        value = json.loads(raw)
        if not isinstance(value, dict):
            raise ValueError()
        return value
    except (ValueError, UnicodeError):
        raise Fault('invalid_config', 'agent-desktop.json must be a JSON object under 64 KiB.') from None


def client_for(provider):
    from .client import Client
    if provider not in ('grokbot', 'hermes', 'example'):
        raise Fault('unsupported', 'Unknown provider.')
    config = configuration()
    providers = config.get('providers', {})
    if not isinstance(providers, dict):
        raise Fault('invalid_config', 'providers must be an object.')
    entry = providers.get(provider, {})
    if not isinstance(entry, dict):
        raise Fault('invalid_config', 'Provider configuration must be an object.')
    python = entry.get('python', '/usr/bin/python3')
    if not isinstance(python, str) or not Path(python).is_absolute():
        raise Fault('invalid_config', 'Provider python must be an absolute executable path.')
    options = []
    if provider == 'hermes':
        for key, flag in [('root', '--root'), ('agentDir', '--agent-dir')]:
            value = entry.get(key)
            if value is not None:
                if not isinstance(value, str) or not value or len(value) > 4096:
                    raise Fault('invalid_config', 'Invalid Hermes path.')
                options += [flag, str(Path(value).expanduser())]
    return Client(provider, python=python, options=options)


def timeout_seconds():
    from .grokbot import legacy_module
    legacy = legacy_module()
    return legacy.ask_timeout(legacy.plugin_entry(), legacy.desktop_config(), 180)

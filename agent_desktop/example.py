import asyncio

from .protocol import Fault, identifier, text, MAX_PROMPT


class Example:
    name = "example"
    capabilities = {"streaming": True, "cancellation": "request", "attachments": False,
                    "history": False, "prompts": False, "compaction": False}

    def __init__(self):
        self.emit = None
        self.tasks = {}
        self.used = set()

    async def call(self, method, params):
        if method == "agents.list":
            return {"complete": True, "agents": [{"id": "echo", "name": "Example Agent",
                    "availability": "ready", "capabilities": self.capabilities}]}
        if method == "message.send":
            request = identifier(params.get("requestId"), "requestId")
            if params.get("agentId") != "echo":
                raise Fault("unavailable", "Unknown example agent.")
            prompt = text(params.get("text"), MAX_PROMPT)
            if params.get("attachments"):
                raise Fault("unsupported", "The example does not accept attachments.")
            if request in self.used:
                raise Fault("duplicate_id", "Request ID has already been used.")
            if self.tasks:
                raise Fault("busy", "The example already has an active request.")
            if len(self.used) >= 4096:
                raise Fault("limit_exceeded", "Reconnect without replaying prior work.")
            self.used.add(request)
            self.tasks[request] = asyncio.create_task(self.answer(request, prompt))
            return {"requestId": request, "sessionId": "example", "accepted": True}
        if method == "request.cancel":
            request = identifier(params.get("requestId"), "requestId")
            task = self.tasks.pop(request, None)
            if task is None:
                raise Fault("unavailable", "No active request with that ID.")
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
            self.emit("message.finished", {"agentId": "echo", "requestId": request,
                                           "sessionId": "example", "status": "cancelled", "text": ""})
            return {"requestId": request, "status": "confirmed"}
        raise Fault("unsupported", "This example does not support that operation.")

    async def answer(self, request, prompt):
        try:
            await asyncio.sleep(0.05)
            self.emit("message.delta", {"agentId": "echo", "sessionId": "example",
                                        "requestId": request, "text": "Example: "})
            await asyncio.sleep(0.05)
            self.emit("message.finished", {"agentId": "echo", "sessionId": "example",
                    "requestId": request, "status": "completed", "text": "Example: " + prompt})
        finally:
            self.tasks.pop(request, None)

    async def close(self):
        tasks = list(self.tasks.values())
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        self.tasks.clear()

"""Two admins on one War planner draft, live, in two isolated Chrome contexts.

Drives headless Chrome over the DevTools protocol with native mouse and key
events, and checks each step in the other tab: presence, a pin arriving, a
named cursor, read-only until shared, a sticker coming back, a drag, an undo
reaching both, and the room saving itself. See server.py for how to run it.
Uses usage: websockets [--help] [--insecure] [--version] [<uri>], which the backend's venv already has.
"""
import asyncio
import base64
import itertools
import json
import os
import sys
import tempfile
import urllib.request

import websockets

SP = os.path.join(tempfile.gettempdir(), "war-live")
TOK = json.load(open(os.path.join(SP, "e2e_tokens.json")))
SITE = "http://127.0.0.1:8898/"
ids = itertools.count(1)
results = []


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(("PASS " if ok else "FAIL ") + name + (f"  ({detail})" if detail else ""), flush=True)


class Browser:
    async def start(self):
        info = json.load(urllib.request.urlopen("http://127.0.0.1:9223/json/version"))
        self.ws = await websockets.connect(info["webSocketDebuggerUrl"], max_size=50_000_000)
        self.waiting = {}
        asyncio.create_task(self.reader())

    async def reader(self):
        async for raw in self.ws:
            msg = json.loads(raw)
            if "id" in msg and msg["id"] in self.waiting:
                self.waiting.pop(msg["id"]).set_result(msg)

    async def call(self, method, params=None, session=None):
        i = next(ids)
        fut = asyncio.get_running_loop().create_future()
        self.waiting[i] = fut
        msg = {"id": i, "method": method, "params": params or {}}
        if session:
            msg["sessionId"] = session
        await self.ws.send(json.dumps(msg))
        res = await asyncio.wait_for(fut, 30)
        if "error" in res:
            raise RuntimeError(f"{method}: {res['error']}")
        return res.get("result", {})


class Tab:
    def __init__(self, b, name):
        self.b, self.name = b, name

    async def open(self, url):
        ctx = (await self.b.call("Target.createBrowserContext"))["browserContextId"]
        tid = (await self.b.call("Target.createTarget", {"url": "about:blank", "browserContextId": ctx}))["targetId"]
        self.s = (await self.b.call("Target.attachToTarget", {"targetId": tid, "flatten": True}))["sessionId"]
        await self.call("Page.enable")
        await self.call("Emulation.setDeviceMetricsOverride",
                        {"width": 1440, "height": 1000, "deviceScaleFactor": 1, "mobile": False})
        await self.call("Page.navigate", {"url": url})

    async def call(self, method, params=None):
        return await self.b.call(method, params, self.s)

    async def js(self, expr):
        r = await self.call("Runtime.evaluate", {"expression": expr, "returnByValue": True, "awaitPromise": True})
        if "exceptionDetails" in r:
            raise RuntimeError(f"{self.name}: {r['exceptionDetails']}")
        return r["result"].get("value")

    async def mouse(self, kind, x, y, **kw):
        await self.call("Input.dispatchMouseEvent", {"type": kind, "x": x, "y": y, "button": "left", **kw})

    async def click(self, x, y):
        await self.mouse("mouseMoved", x, y, button="none")
        await self.mouse("mousePressed", x, y, clickCount=1)
        await self.mouse("mouseReleased", x, y, clickCount=1)

    async def key(self, key, code, mods=0, vk=0):
        for kind in ("keyDown", "keyUp"):
            await self.call("Input.dispatchKeyEvent", {"type": kind, "key": key, "code": code,
                                                       "modifiers": mods, "windowsVirtualKeyCode": vk})

    async def map_at(self, fx, fy):
        r = await self.js("(() => { const r = document.querySelector('.wp-map').getBoundingClientRect();"
                          " return [r.left, r.top, r.width, r.height] })()")
        return r[0] + r[2] * fx, r[1] + r[3] * fy

    async def press(self, selector, text):
        ok = await self.js(f"""(() => {{ const b = [...document.querySelectorAll({json.dumps(selector)})]
            .find((e) => e.textContent.trim() === {json.dumps(text)}); if (!b) return false; b.click(); return true }})()""")
        if not ok:
            raise RuntimeError(f"{self.name}: no {selector} '{text}'")

    async def shot(self, path):
        data = (await self.call("Page.captureScreenshot", {"format": "png"}))["data"]
        open(path, "wb").write(base64.b64decode(data))

    async def items(self):
        return await self.js("document.querySelectorAll('.wp-map svg [data-item]').length")


async def until(fn, what, timeout=8.0):
    loop = asyncio.get_running_loop()
    end = loop.time() + timeout
    last = None
    while loop.time() < end:
        last = await fn()
        if last:
            return last
        await asyncio.sleep(0.2)
    return last


async def main():
    b = Browser()
    await b.start()
    goba, nyx = Tab(b, "Goba"), Tab(b, "Nyx")
    await goba.open(SITE + "#token=" + TOK["goba"])
    await nyx.open(SITE + "#token=" + TOK["nyx"])
    await asyncio.sleep(2.5)
    for t in (goba, nyx):
        await t.press(".tab", "War planner")
    plan = TOK["plan"]

    live = lambda t: t.js("!!document.querySelector('.wp-live.on')")  # noqa: E731
    check("Goba is live on his draft", await until(lambda: live(goba), "goba live"))
    # Nyx opens on a new draft of his own; switch him onto Goba's.
    await until(lambda: nyx.js("!!document.querySelector('.wp-planpick select')"), "nyx picker")
    await nyx.js(f"""(() => {{ const s = document.querySelector('.wp-planpick select');
        s.value = '{plan}'; s.dispatchEvent(new Event('change', {{ bubbles: true }})) }})()""")
    check("Nyx is live on Goba's draft", await until(lambda: live(nyx), "nyx live"))
    check("Nyx sees it read only",
          await until(lambda: nyx.js("!!document.querySelector('.wp-status .pill') && [...document.querySelectorAll('.wp-status .pill')].some(p => p.textContent === 'read only')"), "ro"))
    check("Goba sees Nyx on the day",
          await until(lambda: goba.js("[...document.querySelectorAll('.wp-person')].some(p => p.textContent.includes('Nyx'))"), "people"))

    # Goba places a pin with a real click.
    await goba.press(".wp-tool", "Pin")
    x, y = await goba.map_at(0.62, 0.5)
    await goba.click(x, y)
    check("Goba's pin reaches Nyx", await until(lambda: nyx.js("document.querySelectorAll('.wp-map svg [data-item]').length === 1"), "pin"),
          f"nyx items={await nyx.items()}")
    check("Goba's tool went back to Select",
          await goba.js("document.querySelector('.wp-tool.on')?.textContent.trim() === 'Select'"))

    # Nyx's pointer shows up on Goba's map, named.
    nx, ny = await nyx.map_at(0.4, 0.4)
    for k in range(6):
        await nyx.mouse("mouseMoved", nx + k * 6, ny + k * 4, button="none")
        await asyncio.sleep(0.05)
    check("Nyx's cursor shows on Goba's map",
          await until(lambda: goba.js("[...document.querySelectorAll('.wp-map svg text')].some(t => t.textContent === 'Nyx')"), "cursor"))

    # Nyx cannot draw until Goba shares.
    check("Nyx's drawing tools are off", await nyx.js("[...document.querySelectorAll('.wp-tool')].find(b => b.textContent.trim() === 'Sticker').disabled"))
    await goba.press(".btn", "Let other admins edit")
    check("Sharing reaches Nyx at once",
          await until(lambda: nyx.js("![...document.querySelectorAll('.wp-tool')].find(b => b.textContent.trim() === 'Sticker').disabled"), "shared"))

    await nyx.press(".wp-tool", "Sticker")
    sx, sy = await nyx.map_at(0.3, 0.3)
    await nyx.click(sx, sy)
    check("Nyx's sticker reaches Goba", await until(lambda: goba.js("document.querySelectorAll('.wp-map svg [data-item]').length === 2"), "sticker"),
          f"goba items={await goba.items()}")

    # Nyx drags his sticker; Goba sees it land where he let go.
    await nyx.press(".wp-tool", "Select")
    before = await goba.js("document.querySelector('.wp-map svg [data-item] circle') ? [...document.querySelectorAll('.wp-map svg [data-item]')].map(g => g.getAttribute('transform')).join('|') : ''")
    await nyx.mouse("mouseMoved", sx, sy, button="none")
    await nyx.mouse("mousePressed", sx, sy, clickCount=1)
    for k in range(1, 11):
        await nyx.mouse("mouseMoved", sx + k * 12, sy + k * 8, buttons=1)
        await asyncio.sleep(0.03)
    await nyx.mouse("mouseReleased", sx + 120, sy + 80, clickCount=1)
    moved = await until(lambda: goba.js(f"[...document.querySelectorAll('.wp-map svg [data-item]')].map(g => g.getAttribute('transform')).join('|') !== {json.dumps(before)}"), "drag")
    check("Nyx's drag lands on Goba's map", moved)

    # Undo in Nyx's tab takes the move back, for both.
    await nyx.js("document.activeElement?.blur()")
    await nyx.key("z", "KeyZ", mods=4, vk=90)   # 4 = Meta
    check("Nyx's undo reaches Goba", await until(lambda: goba.js(f"[...document.querySelectorAll('.wp-map svg [data-item]')].map(g => g.getAttribute('transform')).join('|') === {json.dumps(before)}"), "undo"))

    # Everything saves itself.
    await asyncio.sleep(2.0)
    check("Saved shows in both tabs",
          await until(lambda: goba.js("[...document.querySelectorAll('.wp-status span')].some(s => s.textContent === 'Saved')"), "saved"))
    stored = json.load(urllib.request.urlopen(urllib.request.Request(
        f"http://127.0.0.1:8765/war/plans/{plan}", headers={"Authorization": "Bearer " + TOK["goba"]})))
    kinds = sorted(i["type"] for i in stored["doc"]["scenarios"][0]["items"])
    check("The server holds both drawings", kinds == ["pin", "sticker"], f"{kinds}, version {stored['version']}")

    await goba.shot(os.path.join(SP, "e2e_goba.png"))
    await nyx.shot(os.path.join(SP, "e2e_nyx.png"))
    failed = [r for r in results if not r[1]]
    print(f"\n{len(results) - len(failed)}/{len(results)} passed")
    sys.exit(1 if failed else 0)


asyncio.run(main())

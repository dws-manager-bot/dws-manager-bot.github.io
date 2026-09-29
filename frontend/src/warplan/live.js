/**
 * The live connection: one WebSocket per open planner, to /war/live.
 *
 * This is only the wire. It signs in with the first message (never the URL,
 * which the server's access log records), keeps itself open with a ping every
 * 25 seconds — Cloudflare drops a WebSocket that is quiet for 100 — and comes
 * back on its own after a drop, rejoining whatever plan was open. What the
 * messages mean is the page's business.
 *
 * Status is 'connecting', 'live' or 'offline'. Offline is not an error: the
 * planner still works, saving the old way with the Save button.
 */

const RETRY = [1000, 2000, 5000, 10000, 20000]

export class Live {
  constructor({ url, token, onMessage, onStatus }) {
    this.url = url
    this.token = token
    this.onMessage = onMessage
    this.onStatus = onStatus
    this.plan = null
    this.tries = 0
    this.closed = false
    this.ws = null
    this.timer = null
    this.ping = null
    this.connect()
  }

  status(s) { this.onStatus?.(s) }

  connect() {
    if (this.closed || !this.url) { this.status('offline'); return }
    this.status('connecting')
    let ws
    try { ws = new WebSocket(this.url) } catch { this.retry(); return }
    this.ws = ws
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'hello', token: this.token }))
    }
    ws.onmessage = (e) => {
      let msg
      try { msg = JSON.parse(e.data) } catch { return }
      if (msg.type === 'welcome') {
        this.tries = 0
        this.status('live')
        clearInterval(this.ping)
        this.ping = setInterval(() => this.send({ type: 'ping' }), 25000)
        if (this.plan != null) this.send({ type: 'join', plan: this.plan })
      }
      this.onMessage?.(msg)
    }
    ws.onclose = (e) => {
      clearInterval(this.ping)
      if (this.ws !== ws) return
      this.ws = null
      // 4401/4403: signed out or not allowed. Retrying cannot fix either.
      if (e.code === 4401 || e.code === 4403) { this.closed = true; this.status('offline'); return }
      this.retry()
    }
    ws.onerror = () => { /* onclose follows and handles it */ }
  }

  retry() {
    if (this.closed) return
    this.status(this.tries >= 2 ? 'offline' : 'connecting')
    const wait = RETRY[Math.min(this.tries, RETRY.length - 1)]
    this.tries += 1
    clearTimeout(this.timer)
    this.timer = setTimeout(() => this.connect(), wait)
  }

  send(msg) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg))
      return true
    }
    return false
  }

  join(plan) {
    this.plan = plan
    if (plan == null) this.send({ type: 'leave' })
    else this.send({ type: 'join', plan })
  }

  close() {
    this.closed = true
    clearTimeout(this.timer)
    clearInterval(this.ping)
    const ws = this.ws
    this.ws = null
    ws?.close()
  }
}

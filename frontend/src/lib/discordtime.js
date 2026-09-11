/**
 * Times in a message, written once and read in everyone's own clock.
 *
 * Discord resolves `<t:EPOCH:f>` against the reader's client, so one message
 * shows 11:00 in Seoul and 03:00 in London. What it will not do is say which
 * clock that is, and the alliance plans against the game's — so `{st}` puts
 * server time in as fixed text beside it.
 *
 * A literal epoch cannot be typed into a recurring announcement: right once,
 * wrong every week after. The author writes a token; the bot resolves it at
 * send time against the occurrence being announced, or the moment of posting.
 *
 * The table here must match `backend/src/dwsbot/messagetime.py`, which does the
 * resolving. This side exists to preview it.
 */
import { fmtServerTime } from './servertime.js'

export const TIME_TOKENS = [
  { token: 'time', label: 'Time — 11:00', fmt: 't' },
  { token: 'datetime', label: 'Date and time — Wed, 9 Sep 11:00', fmt: 'F' },
  { token: 'date', label: 'Date — 9 September', fmt: 'D' },
  { token: 'relative', label: 'Countdown — in 30 minutes', fmt: 'R' },
  { token: 'st', label: 'Server time — 00:00 ST', fmt: null },
]

const BY_TOKEN = Object.fromEntries(TIME_TOKENS.map((t) => [t.token, t]))
const TOKEN_RE = new RegExp(`\\{(${TIME_TOKENS.map((t) => t.token).join('|')})\\}`, 'g')
const MARKUP_RE = /<t:(\d+)(?::([tTdDfFR]))?>/g

/** What the bot will send: tokens turned into Discord's own markup. */
export function fillTokens(text, when) {
  if (!text) return text || ''
  const epoch = Math.floor(new Date(when).getTime() / 1000)
  return String(text).replace(TOKEN_RE, (_m, name) =>
    BY_TOKEN[name].fmt ? `<t:${epoch}:${BY_TOKEN[name].fmt}>` : fmtServerTime(when))
}

/* Discord's own renderings, as closely as Intl will give them. `R` is a
   countdown, so it is relative to now rather than to any fixed format. */
const FORMATS = {
  t: { hour: '2-digit', minute: '2-digit' },
  T: { hour: '2-digit', minute: '2-digit', second: '2-digit' },
  d: { day: '2-digit', month: '2-digit', year: 'numeric' },
  D: { day: 'numeric', month: 'long', year: 'numeric' },
  f: { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' },
  F: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' },
}

function relative(ms) {
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  const units = [['day', 86400000], ['hour', 3600000], ['minute', 60000], ['second', 1000]]
  for (const [unit, size] of units) {
    if (Math.abs(ms) >= size || unit === 'second') return rtf.format(Math.round(ms / size), unit)
  }
  return ''
}

/** Render `<t:…>` markup the way the reader's own client would. */
export function renderMarkup(text) {
  return String(text ?? '').replace(MARKUP_RE, (_m, epoch, fmt) => {
    const d = new Date(Number(epoch) * 1000)
    if (Number.isNaN(d.getTime())) return _m
    if ((fmt || 'f') === 'R') return relative(d.getTime() - Date.now())
    return new Intl.DateTimeFormat(undefined, { hour12: false, ...FORMATS[fmt || 'f'] }).format(d)
  })
}

/** Both passes: what the author typed, as the reader will finally see it. */
export const previewTimes = (text, when) => renderMarkup(fillTokens(text, when))

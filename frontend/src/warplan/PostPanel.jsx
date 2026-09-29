import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { MAX_IMAGES } from './standing.js'

/**
 * Posting the official plan to Discord.
 *
 * One message: a heading naming the day, and one map per chosen scenario,
 * drawn from the view on screen right now — frame the map on what matters
 * before posting. A post to a channel everyone reads cannot be taken back, so
 * a second one asks first.
 */
export default function PostPanel({ plan, day, dayText, scenarios, render, onPosted, onClose, onError }) {
  const [channels, setChannels] = useState(null)
  const [channel, setChannel] = useState('')
  const [message, setMessage] = useState('')
  const [picked, setPicked] = useState(() => new Set(scenarios.slice(0, MAX_IMAGES).map((s) => s.id)))
  const [busy, setBusy] = useState('')
  const [asking, setAsking] = useState(false)

  useEffect(() => {
    api.channels()
      .then((list) => {
        setChannels(list)
        const pick = list.find((c) => /war|strife|plan|announce/i.test(c.name)) ?? list[0]
        setChannel(String(pick?.id ?? ''))
      })
      .catch((err) => onError(err.message))
  }, [onError])

  const chosen = scenarios.filter((s) => picked.has(s.id))

  async function post(again) {
    onError(null)
    try {
      const form = new FormData()
      form.append('channel_id', channel)
      form.append('message', message)
      form.append('again', again ? 'true' : 'false')
      for (let i = 0; i < chosen.length; i += 1) {
        setBusy(`Drawing ${chosen[i].name}…`)
        const blob = await render(chosen[i].id)
        form.append('scenarios', chosen[i].name)
        form.append('images', blob, `${i + 1}.png`)
      }
      setBusy('Posting…')
      const r = await api.raw(`/war/plans/${plan.id}/post`, {
        method: 'POST', body: form, headers: { 'Content-Type': undefined },
      })
      setAsking(false)
      onPosted(r)
    } catch (err) {
      if (err.status === 409 && /already posted/i.test(err.message)) setAsking(true)
      else onError(err.message)
    } finally {
      setBusy('')
    }
  }

  const toggle = (id) => setPicked((s) => {
    const next = new Set(s)
    if (next.has(id)) next.delete(id)
    else if (next.size < MAX_IMAGES) next.add(id)
    return next
  })

  return (
    <div className="card wp-inspect">
      <div className="card-head">
        <strong>Post to Discord</strong>
        <button type="button" className="btn ghost small wp-close" onClick={onClose} aria-label="Close">×</button>
      </div>
      <p className="card-body">
        {`One message: "War plan · ${dayText}" and a map for each scenario below, framed exactly as the map is now.`}
        {' '}Members are not mentioned.
        {plan.posted_url && (
          <>
            {' '}Already posted —{' '}
            <a href={plan.posted_url} target="_blank" rel="noreferrer">open it</a>.
          </>
        )}
      </p>
      <div className="grid">
        <label className="wide">
          Channel
          <select value={channel} onChange={(e) => setChannel(e.target.value)} disabled={Boolean(busy)}>
            {channels === null && <option value="">Loading…</option>}
            {channels?.map((c) => <option key={c.id} value={String(c.id)}>#{c.name}</option>)}
          </select>
        </label>
        <label className="wide">
          Message <span className="muted">(optional)</span>
          <textarea rows="3" maxLength={1800} value={message} disabled={Boolean(busy)}
                    placeholder={`Orders for ${day?.title || 'Saturday'}: rally 10:40 ST, horn at 11:00.`}
                    onChange={(e) => setMessage(e.target.value)} />
        </label>
        <div className="wide">
          <span className="label">{`Scenarios · ${chosen.length} of ${scenarios.length}`}</span>
          <div className="row">
            {scenarios.map((s) => (
              <button key={s.id} type="button" className={picked.has(s.id) ? 'chip on' : 'chip'}
                      disabled={Boolean(busy)} onClick={() => toggle(s.id)}>{s.name}</button>
            ))}
          </div>
        </div>
      </div>
      <div className="card-actions">
        {asking ? (
          <>
            <span className="muted small">Already posted. Post a second message?</span>
            <button type="button" className="btn primary" disabled={Boolean(busy)} onClick={() => post(true)}>
              {busy || 'Post again'}
            </button>
            <button type="button" className="btn" onClick={() => setAsking(false)}>Cancel</button>
          </>
        ) : (
          <button type="button" className="btn primary" disabled={Boolean(busy) || !channel || !chosen.length}
                  onClick={() => post(false)}>
            {busy || `Post ${chosen.length} map${chosen.length === 1 ? '' : 's'}`}
          </button>
        )}
      </div>
    </div>
  )
}

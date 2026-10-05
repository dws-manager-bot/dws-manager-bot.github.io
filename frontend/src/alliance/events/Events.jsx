/*
 * What is on, for every member: the calendar the admins keep on the admin
 * Events page, read-only, in the reader's language and time zone. Event names
 * are as the admins typed them.
 */
import { useCallback, useEffect, useState } from 'react'
import { useI18n } from '../../i18n/I18n.jsx'
import { api } from '../../lib/api.js'
import { SERVER_ZONE, zoneLabel } from '../../lib/zones.js'
import { byDay, dayIn, daysBetween, duration, isOn, startsIn } from './schedule.js'
import './events.css'

const DAYS = 14

export default function Events() {
  const { t, time, zone, locale } = useI18n()
  const [items, setItems] = useState(null)
  const [failed, setFailed] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  const load = useCallback(() => {
    setFailed(false)
    api.upcomingEvents(DAYS).then(setItems).catch(() => setFailed(true))
  }, [])
  useEffect(load, [load])

  // Countdowns and "on now" move on by themselves while the page stays open.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])

  const serverClock = (instant) => {
    if (zone === SERVER_ZONE) return null
    const at = new Intl.DateTimeFormat(locale, { timeZone: SERVER_ZONE, hour: '2-digit', minute: '2-digit' })
      .format(new Date(instant))
    return t('events.server_at', { time: at })
  }
  const clock = (instant) => time(instant, { hour: '2-digit', minute: '2-digit' })

  const groups = items ? byDay(items, zone, now) : []
  const next = groups[0]?.items[0]
  const today = dayIn(new Date(now).toISOString(), zone)
  const dayName = (group) => {
    const ahead = daysBetween(today, group.day)
    if (ahead === 0) return t('events.today')
    if (ahead === 1) return t('events.tomorrow')
    return time(group.items[0].starts_at, { weekday: 'long', month: 'long', day: 'numeric' })
  }

  return (
    <div className="ev">
      <div className="page-head">
        <h2>{t('events.title')}</h2>
      </div>
      <p className="muted small ev-caption">
        {t('events.caption', { days: DAYS })} {t('events.zone', { zone: zone === SERVER_ZONE ? t('shell.prefs.server_time') : zoneLabel(zone) })}
      </p>

      {failed && (
        <div className="panel">
          <p className="error">{t('events.failed')}</p>
          <button className="btn" onClick={load}>{t('events.retry')}</button>
        </div>
      )}
      {!items && !failed && <p className="muted">{t('shell.loading')}</p>}
      {items && !groups.length && <p className="muted ev-none">{t('events.none')}</p>}

      {next && (
        <section className="card ev-next">
          <div className="ev-label">{t('events.next')}</div>
          <div className="ev-next-name">{next.name}</div>
          <div className="ev-next-when">
            {time(next.starts_at, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </div>
          <div className="ev-next-meta">
            {isOn(next, now)
              ? <span className="ev-on">{t('events.on_now')}</span>
              : <span className="ev-soon">{startsIn(next, now, locale)}</span>}
            {serverClock(next.starts_at) && <span className="muted">{serverClock(next.starts_at)}</span>}
          </div>
        </section>
      )}

      {groups.map((group) => (
        <section className="ev-day" key={group.day}>
          <h3>{dayName(group)}</h3>
          <ul className="ev-list">
            {group.items.map((item) => (
              <li key={`${item.event_id}-${item.starts_at}`} className={isOn(item, now) ? 'ev-row on' : 'ev-row'}>
                <span className="ev-time">{clock(item.starts_at)}</span>
                <span className="ev-body">
                  <span className="ev-name">{item.name}</span>
                  <span className="ev-meta muted">
                    {isOn(item, now) && <span className="ev-on">{t('events.on_now')}</span>}
                    <span>{duration(item.duration_minutes, locale)}</span>
                    {serverClock(item.starts_at) && <span>{serverClock(item.starts_at)}</span>}
                    {item.moved && (
                      <span className="ev-moved">
                        {t('events.moved')}{item.note ? ` · ${item.note}` : ''}
                      </span>
                    )}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

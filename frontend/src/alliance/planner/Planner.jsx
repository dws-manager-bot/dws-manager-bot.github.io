/*
 * The Survival Preparedness planner, from pou-rocks.github.io/planner: which
 * SP theme runs in each 4-hour slot of a server day, which of its actions also
 * score in that day's Alliance Duel, and which capital titles help. Days are
 * server days; every time is shown in the reader's zone.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from '../../i18n/I18n.jsx'
import { SERVER_ZONE, zoneLabel } from '../../lib/zones.js'
import { THEME_COLORS } from './data.js'
import { DAY, SLOTS, adTheme, dayStartOn, daySlots, nextDual, officialsFor, serverDay, slotAt, windowIn } from './plan.js'
import './planner.css'

function useNow(every) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), every)
    return () => clearInterval(timer)
  }, [every])
  return now
}

const pad = (n) => String(n).padStart(2, '0')

/** "1:05:09": a countdown reads the same in every language. */
function clock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 3600)}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`
}

const HOUR_MINUTE = { hour: 'numeric', minute: '2-digit' }
const DAY_HOUR_MINUTE = { weekday: 'short', ...HOUR_MINUTE }

function Bolt({ label }) {
  return (
    <svg className="pl-bolt" viewBox="0 0 24 24" width="14" height="14" role={label ? 'img' : undefined}
      aria-label={label} aria-hidden={label ? undefined : true}>
      {label && <title>{label}</title>}
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="currentColor" />
    </svg>
  )
}

function Badge({ theme, number, big }) {
  return (
    <span className={big ? 'pl-badge big' : 'pl-badge'} style={{ '--theme': THEME_COLORS[theme] }}>
      {number}
    </span>
  )
}

export default function Planner() {
  const { t, time, zone, dir, lang, locale } = useI18n()
  const now = useNow(1000)
  const today = serverDay(now)
  const [weekday, setWeekday] = useState(today.weekday)
  const dayStart = dayStartOn(weekday, now)
  const slots = useMemo(() => daySlots(weekday, dayStart), [weekday, dayStart])
  const isToday = dayStart === today.start
  const current = slotAt(now)
  const ad = adTheme(weekday)
  const days = useRef(null)

  // Seven weekday names can be wider than a phone (Arabic spells each out);
  // the row scrolls, and the chosen day is kept in view.
  useEffect(() => {
    const row = days.current
    const chip = row?.querySelector('.chip.on')
    if (!chip) return
    const box = row.getBoundingClientRect()
    const at = chip.getBoundingClientRect()
    if (at.left < box.left) row.scrollLeft += at.left - box.left
    else if (at.right > box.right) row.scrollLeft += at.right - box.right
  }, [weekday, locale])

  const weekdays = useMemo(() => {
    const f = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' })
    // 1 January 2024 was a Monday.
    return Array.from({ length: 7 }, (_, d) => f.format(Date.UTC(2024, 0, 1 + d)))
  }, [locale])

  const theme = (key) => t(`planner.themes.${key}`)
  const span = (slot) => {
    const w = windowIn(slot.start, slot.end, zone)
    return `${time(slot.start, DAY_HOUR_MINUTE)} – ${time(slot.end, w.crossesDate ? DAY_HOUR_MINUTE : HOUR_MINUTE)}`
  }

  return (
    <div className="page planner" dir={dir} lang={lang}>
      <div className="page-head">
        <div className="pl-head">
          <h2>{t('planner.title')}</h2>
          <p className="muted small">{t('planner.caption')}</p>
          <p className="muted small">
            {t('planner.zone', { zone: zone === SERVER_ZONE ? t('shell.prefs.server_time') : zoneLabel(zone) })}
          </p>
        </div>
      </div>

      <Now now={now} current={current} theme={theme} span={span} time={time} t={t} />

      <div className="pl-days" role="group" aria-label={t('planner.days')} ref={days}>
        {weekdays.map((label, d) => (
          <button
            key={d}
            type="button"
            className={d === weekday ? 'chip on' : 'chip'}
            aria-pressed={d === weekday}
            aria-current={d === today.weekday ? 'date' : undefined}
            onClick={() => setWeekday(d)}
          >
            {label}
            {d === today.weekday && <span className="pl-today" title={t('planner.today')} />}
          </button>
        ))}
      </div>

      <div className="card pl-ad" style={{ '--theme': ad ? THEME_COLORS[ad.key] : undefined }}>
        <div className="pl-label">{t('planner.ad.label')}</div>
        {ad ? (
          <>
            <div className="pl-theme">{theme(ad.key)}</div>
            <Actions ids={ad.actions} t={t} />
          </>
        ) : (
          <p className="muted small pl-flush">{t('planner.ad.break')}</p>
        )}
      </div>

      <section className="pl-section">
        <h3>{t('planner.timeline.title')}</h3>
        <Timeline
          slots={slots}
          dayStart={dayStart}
          now={isToday ? now : null}
          current={isToday ? current.slot : null}
          theme={theme}
          span={span}
          time={time}
          t={t}
        />
      </section>

      <section className="pl-section">
        <h3>{t('planner.matrix.title')}</h3>
        <div className="pl-matrix">
          {slots.map((slot) => (
            <SlotCard
              key={slot.slot}
              slot={slot}
              current={isToday && slot.slot === current.slot}
              theme={theme}
              span={span}
              t={t}
            />
          ))}
        </div>
      </section>
    </div>
  )
}

function Now({ now, current, theme, span, time, t }) {
  const next = slotAt(current.end)
  const dual = nextDual(now)
  return (
    <div className="card pl-now">
      <div className="pl-stat">
        <Badge theme={current.theme} number={current.slot + 1} big />
        <div className="pl-stat-body">
          <div className="pl-label">{t('planner.now.current')}</div>
          <div className="pl-theme">
            {theme(current.theme)}
            {current.dual.length > 0 && <Bolt label={t('planner.matrix.dual')} />}
          </div>
          <div className="pl-countdown">{t('planner.now.left', { time: clock(current.end - now) })}</div>
        </div>
      </div>
      <div className="pl-stat">
        <Badge theme={next.theme} number={next.slot + 1} big />
        <div className="pl-stat-body">
          <div className="pl-label">{t('planner.now.next')}</div>
          <div className="pl-theme">
            {theme(next.theme)}
            {next.dual.length > 0 && <Bolt label={t('planner.matrix.dual')} />}
          </div>
          <div className="muted small">{t('planner.now.starts', { time: time(next.start, HOUR_MINUTE) })}</div>
        </div>
      </div>
      {dual && (
        <div className="pl-stat">
          <span className="pl-badge big pl-badge-dual"><Bolt /></span>
          <div className="pl-stat-body">
            <div className="pl-label">{t('planner.now.next_dual')}</div>
            <div className="pl-theme accent">{theme(dual.theme)}</div>
            <div className="muted small">{span(dual)}</div>
          </div>
        </div>
      )}
    </div>
  )
}

/* A server day is one 24-hour run of six equal slots in every zone, so the
   slots sit at fixed places along the bar; only the clock labels under it
   change with the reader's zone. It reads left to right in every language,
   as a time axis does. */
function Timeline({ slots, dayStart, now, current, theme, span, time, t }) {
  const ticks = Array.from({ length: SLOTS + 1 }, (_, k) => k)
  return (
    <div className="card pl-timeline">
      <div className="pl-track" dir="ltr">
        {slots.map((slot) => (
          <div
            key={slot.slot}
            className={slot.slot === current ? 'pl-seg current' : 'pl-seg'}
            style={{ '--theme': THEME_COLORS[slot.theme] }}
            title={`${t('planner.timeline.slot', { number: slot.slot + 1 })} · ${theme(slot.theme)} · ${span(slot)}`}
          >
            <span className="pl-seg-num">{slot.slot + 1}</span>
            {slot.dual.length > 0 && <span className="pl-seg-bolt"><Bolt label={t('planner.matrix.dual')} /></span>}
            <span className="pl-seg-name">{theme(slot.theme)}</span>
          </div>
        ))}
        {now != null && <span className="pl-nowline" style={{ insetInlineStart: `${((now - dayStart) / DAY) * 100}%` }} />}
      </div>
      <div className="pl-ticks" dir="ltr" aria-hidden="true">
        {ticks.map((k) => (
          <span
            key={k}
            className={`pl-tick${k % 2 ? ' odd' : ''}${k === 0 ? ' first' : ''}${k === SLOTS ? ' last' : ''}`}
            style={{ insetInlineStart: `${(k / SLOTS) * 100}%` }}
          >
            {time(dayStart + (k * DAY) / SLOTS, HOUR_MINUTE)}
          </span>
        ))}
      </div>
      {slots.some((s) => s.dual.length) && (
        <p className="muted small pl-legend">
          <Bolt /> {t('planner.timeline.dual')}
        </p>
      )}
    </div>
  )
}

function Actions({ ids, t, tone }) {
  return (
    <ul className={tone ? `pl-acts ${tone}` : 'pl-acts'}>
      {ids.map((id) => (
        <li key={id}>{t(`planner.actions.${id}`)}</li>
      ))}
    </ul>
  )
}

function SlotCard({ slot, current, theme, span, t }) {
  const officials = officialsFor(slot.theme)
  const none = !officials.best.length && !officials.also.length
  return (
    <article className={current ? 'card pl-slot current' : 'card pl-slot'} aria-current={current || undefined}>
      <div className="pl-slot-head">
        <Badge theme={slot.theme} number={slot.slot + 1} />
        <div className="pl-stat-body">
          <div className="pl-theme">
            {theme(slot.theme)}
            {slot.dual.length > 0 && <Bolt label={t('planner.matrix.dual')} />}
          </div>
          <div className="muted small">{span(slot)}</div>
        </div>
      </div>

      {slot.dual.length > 0 && (
        <div className="pl-row">
          <div className="pl-label">{t('planner.matrix.dual')}</div>
          <Actions ids={slot.dual} t={t} tone="dual" />
        </div>
      )}
      {slot.spOnly.length > 0 && (
        <div className="pl-row">
          <div className="pl-label">{t('planner.matrix.sp_only')}</div>
          <Actions ids={slot.spOnly} t={t} />
        </div>
      )}
      {slot.adOnly.length > 0 && (
        <details className="pl-row pl-more">
          <summary>
            <span className="pl-label">{t('planner.matrix.ad_only')}</span>
            <span className="pill">{slot.adOnly.length}</span>
          </summary>
          <Actions ids={slot.adOnly} t={t} tone="ad" />
        </details>
      )}

      <div className="pl-row pl-officials">
        <div className="pl-label">{t('planner.officials.label')}</div>
        {none ? (
          <p className="muted small pl-flush">{t('planner.officials.none')}</p>
        ) : (
          <>
            {officials.best.length > 0 && (
              <Titles label={t('planner.officials.best')} ids={officials.best} t={t} />
            )}
            {officials.also.length > 0 && (
              <Titles label={t('planner.officials.also')} ids={officials.also} t={t} quiet />
            )}
          </>
        )}
      </div>
    </article>
  )
}

function Titles({ label, ids, t, quiet }) {
  return (
    <div className="pl-titles">
      <span className="pl-titles-label">{label}</span>
      {ids.map((id) => (
        <span key={id} className={quiet ? 'pl-title quiet' : 'pl-title'}>{t(`planner.titles.${id}`)}</span>
      ))}
    </div>
  )
}

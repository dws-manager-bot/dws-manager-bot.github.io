/*
 * One calculator, its data loaded: the rows a member is raising, what they
 * already own, and the total pinned to the bottom of the screen. The sheet
 * is kept in this browser, one per calculator, so it is there next time.
 */
import { useEffect, useMemo, useState } from 'react'
import { useI18n } from '../../i18n/I18n.jsx'
import { addUp, checkRows, newRow, stepsOf, withEntity, withFrom, words } from './engine.js'

const storeKey = (slug) => `pou.calc.${slug}`

function restore(slug) {
  try {
    const saved = JSON.parse(localStorage.getItem(storeKey(slug)))
    return saved && typeof saved === 'object' ? saved : {}
  } catch {
    return {}
  }
}

function keep(slug, sheet) {
  try {
    localStorage.setItem(storeKey(slug), JSON.stringify(sheet))
  } catch {
    // Storage off: the sheet lasts until the page closes.
  }
}

export default function Sheet({ spec, data }) {
  const { t, number, lang, dir } = useI18n()
  const w = useMemo(() => words({ t, number, lang, dir }), [t, number, lang, dir])

  const [sheet, setSheet] = useState(() => {
    const saved = restore(spec.slug)
    return {
      rows: checkRows(spec, data, saved.rows, w),
      have: saved.have && typeof saved.have === 'object' ? saved.have : {},
      open: Boolean(saved.open),
    }
  })
  useEffect(() => keep(spec.slug, sheet), [spec.slug, sheet])

  const entities = spec.entities?.(data, w) ?? null
  const materials = spec.materials(data, w)
  const steps = sheet.rows.map((row) => stepsOf(spec, data, row, w))
  const total = addUp(steps.flat())
  const extra = spec.extra?.(data, sheet.rows, w) ?? ''
  const label = (id, level) => spec.label(data, id, level, w)
  const taken = new Set(sheet.rows.map((r) => r.id))

  const setRows = (change) => setSheet((s) => ({ ...s, rows: change(s.rows) }))
  const setRow = (i, change) => setRows((rows) => rows.map((r, j) => (j === i ? change(r) : r)))
  const setHave = (key, value) => setSheet((s) => ({ ...s, have: { ...s.have, [key]: value } }))

  return (
    <>
      <div className="calc-rows">
        {sheet.rows.length === 0 && <div className="card muted calc-empty">{t('calc.empty')}</div>}
        {sheet.rows.map((row, i) => {
          const entity = entities?.find((x) => x.value === row.id)
          const levels = spec.levels(data, row.id)
          const fromLabels = levels.from.map((n) => label(row.id, n))
          const toLabels = levels.to.map((n) => label(row.id, n))
          // Too long for half a phone, From and To take a line each.
          const long = [...fromLabels, ...toLabels].some((l) => l.length > 12)
          const sums = addUp(steps[i])
          return (
            <div className="card calc-row" key={row.id ?? 'only'}>
              {entities && (
                <div className="calc-row-head">
                  <select
                    aria-label={t(spec.entityWord)}
                    value={row.id}
                    onChange={(e) => setRow(i, (r) => withEntity(spec, data, r, e.target.value))}
                  >
                    {entities.map((x) => (
                      <option key={x.value} value={x.value} disabled={x.value !== row.id && taken.has(x.value)}>
                        {x.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn calc-remove"
                    aria-label={t('calc.remove_row')}
                    title={t('calc.remove_row')}
                    onClick={() => setRows((rows) => rows.filter((_, j) => j !== i))}
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                      <path d="M6 18L18 6M6 6l12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              )}
              {entity?.detail && (
                <p className="muted small calc-desc">
                  {entity.colour && <span className={`dot calc-${entity.colour}`} />}
                  {entity.detail}
                </p>
              )}
              <div className={long ? 'calc-span long' : 'calc-span'}>
                <label>
                  {t('calc.from')}
                  <select value={row.from} onChange={(e) => setRow(i, (r) => withFrom(spec, data, r, Number(e.target.value)))}>
                    {levels.from.map((n, k) => (
                      <option key={n} value={n}>{fromLabels[k]}</option>
                    ))}
                  </select>
                </label>
                <label>
                  {t('calc.to')}
                  <select value={row.to} onChange={(e) => setRow(i, (r) => ({ ...r, to: Number(e.target.value) }))}>
                    {levels.to.map((n, k) => (
                      <option key={n} value={n} disabled={n <= row.from}>{toLabels[k]}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="calc-row-foot">
                <span className="muted small">{w.span(label(row.id, row.from), label(row.id, row.to))}</span>
                <span className="calc-row-sum">
                  {materials.filter((m) => sums[m.key]).map((m) => (
                    <span key={m.key}>
                      <b>{number(sums[m.key])}</b> <span className="muted small">{m.name}</span>
                    </span>
                  ))}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      <div className="row calc-actions">
        {entities && (
          <button
            type="button"
            className="btn primary"
            disabled={sheet.rows.length >= entities.length}
            onClick={() => setRows((rows) => [...rows, newRow(spec, data, rows, w)])}
          >
            + {t('calc.add_row')}
          </button>
        )}
        <button
          type="button"
          className="btn"
          onClick={() => setSheet((s) => ({ rows: [newRow(spec, data, [], w)], have: {}, open: s.open }))}
        >
          {t('calc.reset')}
        </button>
      </div>

      <section className="panel calc-owned">
        <h3 className="calc-label">{t('calc.owned')}</h3>
        {materials.map((m) => {
          const raw = sheet.have[m.key] || ''
          const need = total[m.key] || 0
          const got = Number.parseInt(raw || '0', 10) || 0
          return (
            <div className="calc-have" key={m.key}>
              <div>
                <label htmlFor={`calc-have-${m.key}`}>{m.name}</label>
                {raw && (
                  <span className={got >= need ? 'calc-state calc-ok' : 'calc-state calc-short'}>
                    {got >= need ? t('calc.covered') : t('calc.short', { amount: number(need - got) })}
                  </span>
                )}
              </div>
              <input
                id={`calc-have-${m.key}`}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="0"
                value={raw}
                onChange={(e) => setHave(m.key, e.target.value.replace(/[^0-9]/g, ''))}
              />
            </div>
          )
        })}
      </section>

      <section className="calc-details">
        <button
          type="button"
          className="btn calc-toggle"
          aria-expanded={sheet.open}
          aria-controls="calc-breakdown"
          onClick={() => setSheet((s) => ({ ...s, open: !s.open }))}
        >
          <span>{t('calc.details')}</span>
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path d="M19 9l-7 7-7-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {sheet.open && (
          <div id="calc-breakdown" className="calc-table-wrap">
            {sheet.rows.length ? (
              <Breakdown entities={entities} rows={sheet.rows} steps={steps} materials={materials} total={total} />
            ) : (
              <p className="muted small calc-none">{t('calc.empty')}</p>
            )}
          </div>
        )}
      </section>

      <p className="muted small calc-meta">
        {t('calc.source', { build: data.apkBuild })} · {t('calc.note')}
      </p>

      <div className="calc-totals">
        <div className="calc-label">{t('calc.total_needed')}</div>
        {materials.map((m) => (
          <div className="calc-total" key={m.key}>
            <span className="muted small">{m.name}</span>
            <strong>{number(total[m.key] || 0)}</strong>
          </div>
        ))}
        {extra && <div className="muted small">{extra}</div>}
      </div>
    </>
  )
}

/* Amounts come straight after the level, so a phone sees them without
   scrolling; what is being raised heads its own steps rather than taking a
   column. */
function Breakdown({ entities, rows, steps, materials, total }) {
  const { t, number } = useI18n()
  const detail = steps.flat().some((s) => s.detail)
  const span = 1 + materials.length + (detail ? 1 : 0)
  return (
    <table className="calc-table">
      <thead>
        <tr>
          <th>{t('calc.level')}</th>
          {materials.map((m) => (
            <th key={m.key} className="num">{m.name}</th>
          ))}
          {detail && <th />}
        </tr>
      </thead>
      <tbody>
        {rows.flatMap((row, r) => [
          entities && (
            <tr className="calc-group" key={`${row.id}-name`}>
              <th colSpan={span} scope="colgroup">{entities.find((x) => x.value === row.id)?.label}</th>
            </tr>
          ),
          ...steps[r].map((s, i) => (
            <tr key={`${row.id}-${i}`}>
              <td className="muted">{s.label}</td>
              {materials.map((m) => (
                <td key={m.key} className="num">{s.amounts[m.key] ? number(s.amounts[m.key]) : '·'}</td>
              ))}
              {detail && <td className="muted">{s.detail}</td>}
            </tr>
          )),
        ])}
      </tbody>
      <tfoot>
        <tr>
          <td>{t('calc.total')}</td>
          {materials.map((m) => (
            <td key={m.key} className="num">{number(total[m.key] || 0)}</td>
          ))}
          {detail && <td />}
        </tr>
      </tfoot>
    </table>
  )
}

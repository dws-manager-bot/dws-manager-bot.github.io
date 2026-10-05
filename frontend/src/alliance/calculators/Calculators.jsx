/*
 * What it costs to raise a building, the mod vehicle, or a hero's stars,
 * weapon or equipment, from where a member is to where they want to be.
 * /calculator lists the seven; /calculator/<slug> opens one.
 *
 * Most words here are the game's own, taken by string id in pou-rocks
 * (calc-i18n.json, `gameSourced`): the titles, Reset, Owned, Details, Total,
 * Level, Red, Fragment, Building, Parts, Chip, Select Weapon, Equipment
 * Breakthrough, the max-star line and the "Star {star} Rank {rank}" ticks.
 * Keep them as the game writes them, even where a translation looks odd.
 */
import { useEffect, useState } from 'react'
import { useI18n } from '../../i18n/I18n.jsx'
import { onLinkClick, usePath } from '../../lib/route.js'
import { SLUGS, calculator } from './engine.js'
import { loadData } from './data.js'
import Sheet from './Sheet.jsx'
import './calculators.css'

const HUB = '/calculator'

function Chevron({ className = 'calc-flip' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function Calculators() {
  const slug = usePath().replace(/\/+$/, '').split('/')[2]
  const spec = SLUGS.includes(slug) ? calculator(slug) : null

  // The list is longer than a phone screen; a calculator opens at its top.
  // A block body, since Chrome's scrollTo now returns a promise and React
  // would take it for a cleanup.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [spec?.slug])

  return spec ? <Calculator key={spec.slug} spec={spec} /> : <Hub />
}

function Hub() {
  const { t } = useI18n()
  return (
    <div className="page calc">
      <div className="page-head">
        <h2>{t('calc.calculators')}</h2>
      </div>
      <nav className="calc-list">
        {SLUGS.map((slug) => {
          const path = `${HUB}/${slug}`
          return (
            <a key={slug} href={path} className="card calc-link" onClick={(e) => onLinkClick(e, path)}>
              <span>{t(`calc.titles.${calculator(slug).title}`)}</span>
              <Chevron />
            </a>
          )
        })}
      </nav>
      <p className="muted small calc-meta">{t('calc.note')}</p>
    </div>
  )
}

function Calculator({ spec }) {
  const { t } = useI18n()
  const [data, setData] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let live = true
    loadData(spec.data)
      .then((d) => live && setData(d))
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [spec.data])

  return (
    <div className="page calc">
      <a href={HUB} className="calc-back" onClick={(e) => onLinkClick(e, HUB)}>
        <Chevron className="calc-back-icon" />
        {t('calc.calculators')}
      </a>
      <div className="page-head calc-head">
        <h2>{t(`calc.titles.${spec.title}`)}</h2>
      </div>
      {spec.subtitle && <p className="muted small calc-sub">{t(spec.subtitle)}</p>}
      {failed ? (
        <div className="banner error">{t('calc.error')}</div>
      ) : data ? (
        <Sheet spec={spec} data={data} />
      ) : (
        <div className="muted">{t('shell.loading')}</div>
      )}
    </div>
  )
}

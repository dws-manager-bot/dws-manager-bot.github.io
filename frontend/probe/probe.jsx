import { createRoot } from 'react-dom/client'
import Announcements from '../src/pages/Announcements.jsx'
import Bgb from '../src/pages/Bgb.jsx'
import Events from '../src/pages/Events.jsx'
import Members from '../src/pages/Members.jsx'
import Setup from '../src/pages/Setup.jsx'
import PassWar from '../src/pages/PassWar.jsx'
import Season from '../src/pages/Season.jsx'
import WarPlanner from '../src/pages/WarPlanner.jsx'
import '../src/styles.css'

const which = new URLSearchParams(location.search).get('p') || 'announcements'
const Page = { announcements: Announcements, events: Events, members: Members, setup: Setup, passwar: PassWar, bgb: Bgb, season: Season, warplan: WarPlanner }[which]
const user = { discord_id: '1', username: 'Goba', is_admin: true }

window.onerror = (m) => { document.title = 'ERROR: ' + m }
window.addEventListener('unhandledrejection', (e) => { document.title = 'REJECT: ' + e.reason })

createRoot(document.getElementById('root')).render(<Page user={user} />)

/* Drive the interactions the DOM dump cannot: open a row, then press one of
   its buttons, so the editor's position and a copy's prefill are observable. */
const act = new URLSearchParams(location.search).get('act')
const rowIndex = Number(new URLSearchParams(location.search).get('row') || 0)
if (act) {
  setTimeout(() => {
    const rows = [...document.querySelectorAll('.lrow-head')]
    rows[rowIndex]?.click()
    setTimeout(() => {
      const label = { copy: 'Copy', preview: 'Preview' }[act] || 'Edit'
      const btn = [...document.querySelectorAll('.lrow .card-actions .btn')]
        .find((b) => b.textContent.trim() === label)
      btn?.click()
      setTimeout(() => { document.title = 'done:' + act }, 200)
    }, 200)
  }, 300)
}

/* The BGB panels need driving too: one opens a recorded battle's cards, the
   other needs a file on the input before "Check file" comes alive. */
if (which === 'bgb' && act) {
  setTimeout(() => {
    if (act === 'cards' || act === 'publish' || act === 'result' || act === 'resultcheck') {
      if (act === 'result' || act === 'resultcheck') {
        ;[...document.querySelectorAll('.chip')]
          .find((b) => b.textContent.trim() === 'Result recorder')?.click()
      }
      setTimeout(() => {
        document.querySelector('.bgb-event')?.click()
        if (act === 'publish') {
          setTimeout(() => {
            const btn = [...document.querySelectorAll('.btn')]
              .find((b) => b.textContent.trim() === 'Post the cards')
            btn?.click()
          }, 200)
          return
        }
        if (act !== 'resultcheck') return
        setTimeout(() => {
          const input = document.querySelector('.file-pick input')
          const dt = new DataTransfer()
          dt.items.add(new File(['x'], 'bgb-result.xlsx'))
          input.files = dt.files
          input.dispatchEvent(new Event('change', { bubbles: true }))
          setTimeout(() => {
            ;[...document.querySelectorAll('.btn')]
              .find((b) => b.textContent.trim() === 'Check file')?.click()
          }, 100)
        }, 150)
      }, 100)
    } else {
      const input = document.querySelector('.file-pick input')
      const dt = new DataTransfer()
      dt.items.add(new File(['x'], 'bgb-20260926.xlsx'))
      input.files = dt.files
      input.dispatchEvent(new Event('change', { bubbles: true }))
      setTimeout(() => {
        ;[...document.querySelectorAll('.btn')]
          .find((b) => b.textContent.trim() === 'Check file')?.click()
      }, 100)
    }
    setTimeout(() => { document.title = 'done:' + act }, 600)
  }, 300)
}


/* `act=livepng&data=live&plan=ID&scen=N[&colors=camp]`: open that plan and
   scenario of the live snapshot and press Download PNG, exactly as an admin
   would. The file lands wherever the browser saves downloads. */
if (which === 'warplan' && act === 'livepng') {
  const q = new URLSearchParams(location.search)
  const click = (sel, text) => [...document.querySelectorAll(sel)].find((b) => b.textContent.trim() === text)?.click()
  setTimeout(() => {
    // The plan picker itself: the war day picker's ids can be the same numbers.
    const pick = document.querySelector('.wp-planpick select')
    if (pick) { pick.value = q.get('plan'); pick.dispatchEvent(new Event('change', { bubbles: true })) }
    setTimeout(() => {
      ;[...document.querySelectorAll('.wp-scen .chip')][Number(q.get('scen') || 0)]?.click()
      if (q.get('colors') === 'camp') click('.wp-colorby .chip', 'Camps')
      setTimeout(() => {
        document.body.dataset.scenario = document.querySelector('.wp-scen .chip.on')?.textContent.trim() || ''
        document.body.dataset.plan = document.querySelector('.wp-planpick select')?.selectedOptions[0]?.textContent || ''
        click('.btn', 'Download PNG')
        setTimeout(() => { document.title = 'done:livepng' }, 1500)
      }, 800)
    }, 600)
  }, 1200)
}

/* The War planner opens on the official plan, read only. `act=mine` switches
   to the author's own draft; `act=city` also selects the eastern Strife Pass. */
if (which === 'warplan' && act && act !== 'livepng') {
  setTimeout(() => {
    const pick = [...document.querySelectorAll('select')].find((el) => [...el.options].some((o) => o.value === '11'))
    if (pick) { pick.value = '11'; pick.dispatchEvent(new Event('change', { bubbles: true })) }
    setTimeout(() => {
      if (act === 'draw' || act === 'png') {
        // Draw through the same pointer events a finger sends.
        const map = document.querySelector('.wp-map')
        const r = map.getBoundingClientRect()
        const at = (fx, fy) => ({ clientX: r.left + r.width * fx, clientY: r.top + r.height * fy })
        const fire = (type, p) => map.dispatchEvent(new PointerEvent(type, {
          bubbles: true, pointerId: 7, pointerType: 'mouse', button: 0, isPrimary: true, ...p }))
        const tool = (label) => [...document.querySelectorAll('.wp-tool')]
          .find((b) => b.textContent.trim() === label)?.click()
        const tap = (fx, fy) => { fire('pointerdown', at(fx, fy)); fire('pointerup', at(fx, fy)) }
        const steps = [
          () => tool('Arrow'),
          () => { fire('pointerdown', at(0.3, 0.7)); fire('pointermove', at(0.45, 0.55)); fire('pointermove', at(0.6, 0.4)) },
          () => fire('pointerup', at(0.6, 0.4)),
          () => tool('Curve'),
          () => { fire('pointerdown', at(0.2, 0.3)); fire('pointermove', at(0.4, 0.25)) },
          () => fire('pointerup', at(0.4, 0.25)),
          () => tool('Sticker'),
          () => tap(0.7, 0.3),
          () => tool('Stamp'),
          () => tap(0.62, 0.62),
          () => tool('Pin'),
          () => tap(0.15, 0.8),
          () => { document.body.dataset.items = document.querySelectorAll('.wp-map [data-item]').length },
          () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true })),
          () => { document.body.dataset.undone = document.querySelectorAll('.wp-map [data-item]').length },
        ]
        steps.forEach((f, i) => setTimeout(f, 120 * (i + 1)))
        if (act === 'png') {
          setTimeout(() => {
            URL.revokeObjectURL = () => {}   // saveFile revokes at once; the overlay needs it
            HTMLAnchorElement.prototype.click = function show() {
              const img = Object.assign(document.createElement('img'), { src: this.href })
              img.style.cssText = 'position:fixed;inset:0;z-index:99;width:100%;background:#000'
              document.body.appendChild(img)
            }
            ;[...document.querySelectorAll('.btn')].find((b) => b.textContent.trim() === 'Download PNG')?.click()
          }, 120 * (steps.length + 2))
        }
      }
      if (act === 'ink') {
        // The color pickers: the toolbar's (a drawing tool picked) and the
        // alliance form's.
        ;[...document.querySelectorAll('.wp-tool')].find((b) => b.textContent.trim() === 'Arrow')?.click()
        ;[...document.querySelectorAll('.btn')].find((b) => b.textContent.trim() === 'Add an alliance')?.click()
      }
      if (act === 'route' || act === 'layers') {
        const map = document.querySelector('.wp-map')
        const r = map.getBoundingClientRect()
        const at = (fx, fy) => ({ clientX: r.left + r.width * fx, clientY: r.top + r.height * fy })
        const fire = (type, p) => map.dispatchEvent(new PointerEvent(type, {
          bubbles: true, pointerId: 9, pointerType: 'mouse', button: 0, isPrimary: true, ...p }))
        const tap = (fx, fy) => { fire('pointerdown', at(fx, fy)); fire('pointerup', at(fx, fy)) }
        const steps = act === 'route' ? [
          () => [...document.querySelectorAll('.wp-tool')].find((b) => b.textContent.trim() === 'Route')?.click(),
          () => tap(0.25, 0.75), () => tap(0.4, 0.55), () => tap(0.55, 0.6),
          () => { tap(0.7, 0.35); tap(0.7, 0.35); map.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, ...at(0.7, 0.35) })) },
          () => { document.body.dataset.routes = document.querySelectorAll('.wp-map [data-item]').length },
        ] : [
          () => [...document.querySelectorAll('.wp-layer')].find((b) => b.textContent.trim() === 'Oases')?.click(),
          () => [...document.querySelectorAll('.wp-layer')].find((b) => b.textContent.trim() === 'Strongholds')?.click(),
          () => { document.body.dataset.cities = document.querySelectorAll('.wp-map [data-city]').length },
          () => [...document.querySelectorAll('.wp-layer')].find((b) => b.textContent.trim() === 'Passes')?.click(),
          () => { document.body.dataset.nopass = document.querySelectorAll('.wp-map [data-city]').length },
        ]
        steps.forEach((f, i) => setTimeout(f, 150 * (i + 1)))
      }
      if (act === 'post') {
        // The official plan is open by default: post both scenarios.
        const pick = [...document.querySelectorAll('select')].find((el) => [...el.options].some((o) => o.value === '10'))
        if (pick) { pick.value = '10'; pick.dispatchEvent(new Event('change', { bubbles: true })) }
        setTimeout(() => {
          ;[...document.querySelectorAll('.btn')].find((b) => /^Post to Discord/.test(b.textContent.trim()))?.click()
          setTimeout(() => {
            ;[...document.querySelectorAll('.btn')].find((b) => /^Post \d+ maps?$/.test(b.textContent.trim()))?.click()
          }, 400)
        }, 300)
      }
      if (act === 'note') {
        // A new note keeps 12px text at any zoom; the fixture's older note does not.
        const map = document.querySelector('.wp-map')
        const r = map.getBoundingClientRect()
        const p = { bubbles: true, pointerId: 11, pointerType: 'mouse', button: 0, isPrimary: true,
                    clientX: r.left + r.width * 0.3, clientY: r.top + r.height * 0.3 }
        const sizes = () => [...document.querySelectorAll('.wp-map svg [data-item] text')]
          .map((t) => t.getAttribute('font-size')).join(',')
        ;[...document.querySelectorAll('.wp-tool')].find((b) => b.textContent.trim() === 'Note')?.click()
        setTimeout(() => { map.dispatchEvent(new PointerEvent('pointerdown', p)); map.dispatchEvent(new PointerEvent('pointerup', p)) }, 150)
        setTimeout(() => { document.body.dataset.before = sizes() }, 400)
        setTimeout(() => { for (let i = 0; i < 3; i += 1) document.querySelector('.wp-zbtn[aria-label="Zoom in"]')?.click() }, 500)
        setTimeout(() => { document.body.dataset.after = sizes() }, 900)
      }
      if (act === 'camps' || act === 'campzoom') {
        // The map camp against camp; `campzoom` also steps in twice to see
        // the passes near their true size.
        ;[...document.querySelectorAll('.wp-colorby .chip')].find((b) => b.textContent.trim() === 'Camps')?.click()
        if (act === 'campzoom') {
          for (let i = 0; i < 2; i += 1) document.querySelector('.wp-zbtn[aria-label="Zoom in"]')?.click()
        }
        setTimeout(() => {
          document.body.dataset.fills = [...new Set([...document.querySelectorAll('.wp-map [data-city] rect, .wp-map [data-city] polygon, .wp-map [data-city] circle')]
            .map((n) => n.getAttribute('fill')).filter((f) => f && f !== 'transparent'))].join(',')
        }, 300)
      }
      if (act === 'stronghold') {
        const find = document.querySelector('.wp-find input')
        const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
        set.call(find, '873 606'); find.dispatchEvent(new Event('input', { bubbles: true }))
        setTimeout(() => find.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })), 150)
      }
      if (act === 'tapzone') {
        // Tap open ground inside a territory, well away from its marker.
        const map = document.querySelector('.wp-map')
        const r = map.getBoundingClientRect()
        const p = { bubbles: true, pointerId: 8, pointerType: 'mouse', button: 0, isPrimary: true,
                    clientX: r.left + r.width * 0.5, clientY: r.top + r.height * 0.1 }
        map.dispatchEvent(new PointerEvent('pointerdown', p))
        map.dispatchEvent(new PointerEvent('pointerup', p))
      }
      if (act === 'city') {
        const find = document.querySelector('.wp-find input')
        const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
        set.call(find, 'strife east'); find.dispatchEvent(new Event('input', { bubbles: true }))
        setTimeout(() => { document.querySelector('.wp-found button')?.click() }, 150)
      }
      setTimeout(() => { document.title = 'done:' + act }, act === 'city' ? 500 : 3000)
    }, 400)
  }, 900)
}


/* The season board's tap path — the one a phone has, since it has no drag.
   Pick the first candidate, then press the button that appears on a band. */
if (which === 'season' && act === 'place') {
  setTimeout(() => {
    const pool = document.querySelector('.season-pool .season-list li')
    pool?.click()
    setTimeout(() => {
      const btn = [...document.querySelectorAll('.band .btn')]
        .find((b) => b.textContent.startsWith('Put '))
      btn?.click()
      setTimeout(() => { document.title = 'done:place' }, 200)
    }, 200)
  }, 400)
}

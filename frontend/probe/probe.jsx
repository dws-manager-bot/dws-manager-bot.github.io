import { createRoot } from 'react-dom/client'
import Announcements from '../src/pages/Announcements.jsx'
import Bgb from '../src/pages/Bgb.jsx'
import Events from '../src/pages/Events.jsx'
import Members from '../src/pages/Members.jsx'
import Setup from '../src/pages/Setup.jsx'
import PassWar from '../src/pages/PassWar.jsx'
import '../src/styles.css'

const which = new URLSearchParams(location.search).get('p') || 'announcements'
const Page = { announcements: Announcements, events: Events, members: Members, setup: Setup, passwar: PassWar, bgb: Bgb }[which]
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

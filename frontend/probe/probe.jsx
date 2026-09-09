import { createRoot } from 'react-dom/client'
import Announcements from '../src/pages/Announcements.jsx'
import Events from '../src/pages/Events.jsx'
import Setup from '../src/pages/Setup.jsx'
import '../src/styles.css'

const which = new URLSearchParams(location.search).get('p') || 'announcements'
const Page = { announcements: Announcements, events: Events, setup: Setup }[which]
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
      const label = act === 'copy' ? 'Copy' : 'Edit'
      const btn = [...document.querySelectorAll('.lrow .card-actions .btn')]
        .find((b) => b.textContent.trim() === label)
      btn?.click()
      setTimeout(() => { document.title = 'done:' + act }, 200)
    }, 200)
  }, 300)
}

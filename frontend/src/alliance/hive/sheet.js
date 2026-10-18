/*
 * Reading a roster sheet's CSV. The hive map no longer loads one — it is drawn
 * from the member table — but the layout tests still read pou-rocks' fixture
 * through this, which is what holds the port to that site's results.
 */

/** Rows of cells. Quoted cells may hold commas, doubled quotes and newlines. */
export function parseCsv(text) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i += 1
        } else {
          quoted = false
        }
      } else {
        cell += ch
      }
    } else if (ch === '"') {
      quoted = true
    } else if (ch === ',') {
      row.push(cell)
      cell = ''
    } else if (ch === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else if (ch !== '\r') {
      cell += ch
    }
  }
  if (cell.length || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

const digits = (cell) => (cell || '').replace(/[^0-9.]/g, '')

function truthy(cell) {
  if (typeof cell === 'string') return ['true', '1', 'yes', 'y', 't'].includes(cell.trim().toLowerCase())
  return !!cell
}

/**
 * The members, in sheet order. Columns: Name, Industry Level, BGB CP,
 * Total CP, Preferred Outermost, Stick Group. A row needs a name and a total
 * CP to count; the header row never does.
 */
export function readMembers(text) {
  const rows = parseCsv(text)
  const members = []
  for (const cells of rows.slice(1)) {
    const name = (cells[0] || '').trim()
    const cp = digits(cells[3])
    if (!name || !cp) continue
    const bgb = digits(cells[2])
    members.push({
      id: members.length,
      name,
      level: cells[1] && String(cells[1]).trim() ? parseInt(cells[1], 10) : null,
      bgbCp: bgb ? Math.round(Number(bgb)) : 0,
      cp: Math.round(Number(cp)),
      outermost: truthy(cells[4]),
      group: cells[5] && String(cells[5]).trim() ? String(cells[5]).trim() : null,
    })
  }
  return members
}

/**
 * The day the frozen tab was taken, as its header writes it: the cell after
 * one that says "Snapshotted At:", or failing that any header cell that is a
 * bare date.
 */
export function snapshotDate(rows) {
  const header = rows[0] || []
  const at = header.findIndex((cell) => /snapshot/i.test(cell))
  if (at >= 0 && header[at + 1] && header[at + 1].trim()) return header[at + 1].trim()
  const date = header.find((cell) => /^\d{4}[/.-]\d{1,2}[/.-]\d{1,2}$/.test(cell.trim()))
  return date ? date.trim() : null
}

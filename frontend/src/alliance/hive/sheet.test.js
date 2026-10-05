import { describe, it, expect } from 'vitest'
import roster from './fixtures/roster.csv?raw'
import { parseCsv, readMembers, snapshotDate } from './sheet.js'

describe('parseCsv', () => {
  it('splits rows and cells', () => {
    expect(parseCsv('a,b\nc,d')).toEqual([['a', 'b'], ['c', 'd']])
  })

  it('keeps commas, doubled quotes and line breaks inside quotes', () => {
    expect(parseCsv('"1,694,095,810","say ""hi""","two\nlines"\n')).toEqual([['1,694,095,810', 'say "hi"', 'two\nlines']])
  })

  it('reads Windows line endings and a last row with no newline', () => {
    expect(parseCsv('a,b\r\nc,')).toEqual([['a', 'b'], ['c', '']])
  })

  it('reads nothing as no rows', () => {
    expect(parseCsv('')).toEqual([])
  })
})

describe('readMembers', () => {
  const members = readMembers(roster)

  it('reads every member row and skips the header, blank rows and rows with no total CP', () => {
    expect(members).toHaveLength(35)
    expect(members.map((m) => m.name)).not.toContain('No CP Yet')
    expect(members.map((m) => m.id)).toEqual(members.map((_, i) => i))
  })

  it('reads the columns as numbers, flags and names', () => {
    expect(members[0]).toEqual({
      id: 0,
      name: 'Member 01',
      level: 8,
      bgbCp: 240543453,
      cp: 1366674070,
      outermost: true,
      group: 'Alpha',
    })
    expect(members[9].group).toBeNull()
  })

  it('keeps a quoted name whole and trims padding', () => {
    expect(members[3].name).toBe('Hana, the Brave')
    expect(members[15].name).toBe('Padded')
  })

  it('leaves an Industry level the sheet left blank unknown', () => {
    expect(members[20].level).toBeNull()
  })

  it('reads the ways a sheet writes yes', () => {
    const csv = (flag) => `Name,Lv,BGB,CP,Outermost\nA,8,1,2,${flag}`
    for (const yes of ['TRUE', 'true', ' Yes ', 'y', 't', '1']) expect(readMembers(csv(yes))[0].outermost).toBe(true)
    for (const no of ['FALSE', '', 'no', '0']) expect(readMembers(csv(no))[0].outermost).toBe(false)
  })
})

describe('snapshotDate', () => {
  it('reads the cell after "Snapshotted At:"', () => {
    expect(snapshotDate(parseCsv(roster))).toBe('2026/08/22')
  })

  it('falls back to a header cell that is a bare date', () => {
    expect(snapshotDate([['Name', '2026-09-23']])).toBe('2026-09-23')
  })

  it('finds none in the live tab, whose stamp is not a bare date', () => {
    expect(snapshotDate([['Name', 'Stick Group', '', '', 'Updated At: 2026-09-23']])).toBeNull()
    expect(snapshotDate([])).toBeNull()
  })
})

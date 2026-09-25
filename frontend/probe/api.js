const now = Date.now()
const iso = (min) => new Date(now + min * 60000).toISOString()
const rows = [
  { id: 1, name: 'Daily reset reminder', enabled: true, channel_id: '111', kind: 'cron',
    cron_expr: '0 9 * * *', timezone: 'Asia/Seoul', body: 'Reset is up — claim your rewards.',
    use_embed: true, embed_color: '#5865F2', mention: '', lead_minutes: 0, event_id: null,
    next_run_at: iso(240), last_fired_at: iso(-1200), fire_count: 14, created_by_name: 'Goba' },
  { id: 2, name: 'Pass War muster call', enabled: true, channel_id: '222', kind: 'rotation',
    interval_minutes: 20160, run_at: iso(60 * 30), timezone: 'Etc/GMT+2',
    body: 'Pass War starts {time} ({st}) — {relative}.\nMap and orders in <#222>.', use_embed: true,
    mention: '@everyone', lead_minutes: 0, event_id: null, next_run_at: iso(60 * 30),
    created_by_name: 'Goba', updated_by_name: 'Nyx' },
  { id: 3, name: 'SvS kickoff notice', enabled: true, channel_id: '111', kind: 'once',
    run_at: iso(-600), timezone: 'Asia/Seoul', body: 'SvS starts now.', use_embed: false,
    mention: '', lead_minutes: 0, event_id: null, next_run_at: null,
    last_error: 'Forbidden: missing permissions', fire_count: 0, created_by_name: 'Goba' },
  { id: 4, name: 'Old summer ping', enabled: false, channel_id: '111', kind: 'once',
    run_at: iso(-9000), timezone: 'Asia/Seoul', body: 'Summer event!', use_embed: true,
    mention: '', lead_minutes: 0, event_id: null, next_run_at: null,
    last_fired_at: iso(-9000), fire_count: 1, created_by_name: 'Goba' },
]
const events = [
  { id: 1, key: 'pass-war', name: 'Pass Occupation War', enabled: true, schedule_type: 'rotation',
    rotation_days: 14, reference_date: iso(60 * 40), weekdays: [], fixed_dates: [],
    start_time: '00:00', duration_minutes: 60, timezone: 'Etc/GMT+2', signup_enabled: true,
    upcoming: [iso(60 * 40), iso(60 * 40 + 20160)], created_by_name: 'Goba' },
  { id: 2, key: 'alliance-duel', name: 'Alliance Duel', enabled: true, schedule_type: 'weekly',
    weekdays: [0, 3], rotation_days: null, fixed_dates: [], start_time: '20:00',
    duration_minutes: 60, timezone: 'Asia/Seoul', signup_enabled: false,
    upcoming: [], created_by_name: 'Goba' },
  { id: 3, key: 'old-event', name: 'Retired event', enabled: false, schedule_type: 'fixed',
    weekdays: [], fixed_dates: ['2026-01-01'], start_time: '12:00', duration_minutes: 30,
    timezone: 'Asia/Seoul', signup_enabled: false, upcoming: [], created_by_name: 'Goba' },
]
const channels = [
  { id: '111', name: 'general', category: 'Text' },
  { id: '222', name: 'war-room', category: 'Text' },
]
// Invented names: this file is public. The shapes match GET /players.
const seen = (name, first_seen, last_seen = first_seen) => ({ name, first_seen, last_seen })
const players = [
  { id: 'a1', name: 'Nyx', rank: 4, industry_level: 8, bgb_cp: 278997886, total_cp: 1618239833,
    active: true, notes: null, updated_at: iso(-60), names: [seen('Nyx', '2026-08-21', '2026-09-09')] },
  { id: 'a2', name: 'ǝVelaɐ', rank: null, industry_level: 7, bgb_cp: 54499085, total_cp: 748346000,
    active: true, notes: 'Moved her main to this account around 3 Sep; her old one is velasam.',
    updated_at: iso(-60),
    names: [seen('Korrin', '2026-08-21'), seen('ǝVelaɐ', '2026-09-03', '2026-09-09')] },
  { id: 'a3', name: 'Unbroken Storm', rank: 3, industry_level: 6, bgb_cp: 40828414, total_cp: 764037512,
    active: true, notes: null, updated_at: iso(-60),
    names: [seen('Calm Storm', '2026-08-21'), seen('Rising Storm', '2026-09-03'), seen('Unbroken Storm', '2026-09-09')] },
  { id: 'a4', name: 'Hoshi', rank: null, industry_level: 4, bgb_cp: null, total_cp: 713555232,
    active: true, notes: null, updated_at: iso(-60), names: [seen('Hoshi', '2026-09-09')] },
  { id: 'a5', name: 'Stinky', rank: 2, industry_level: 4, bgb_cp: 18948867, total_cp: 463088597,
    active: false, notes: null, updated_at: iso(-60), names: [seen('Stinky', '2026-08-21', '2026-09-03')] },
]
const ok = (v) => Promise.resolve(JSON.parse(JSON.stringify(v)))
/* A Blob does not survive the JSON round-trip above, so the endpoints that
   return a file hand theirs straight back. */
const asFile = (v) => Promise.resolve(v)
/* A BGB registration and the cards drawn from it. The card is a real PNG at
   the shape a briefing card has, so the panel lays out the way it will. */
const PNG = Uint8Array.from(atob(
  'iVBORw0KGgoAAAANSUhEUgAAAL4AAACfCAIAAADI5vRZAAABbUlEQVR42u3XzQmDMBiA' +
  '4aaG0iG8eMkEDuYoGcwxOkQQBK8llWChFGyf5xZy+3jJT0hDf4H3XY0A6SAdziA+L+bs' +
  '3UPLOD3206n2oHGyuLDw1kE6SIe/+WG9ut86M/qUsqxOHZAO0kE6SAfpgHSQDtJBOkgH' +
  'pIN0kA7SQTogHaSDdJAOSAfpIB2kg3RAOkgH6SAdpAPSQTpIB+mAdJAO0kE6SAekg3SQ' +
  'DtJBOiAdpIN0kA5IB+kgHaSDdEA6SAfpIB2kA9JBOkgH6YB0kA7SQTpIB6SDdJAOZxXb' +
  '22VZzQinDtJBOkgH6YB0kA7SQTogHaSDdJAO0gHpIB2kg3SQDkgH6SAdpIN0QDpIB+kg' +
  'HZAO0kE6SAfpgHSQDtJBOkgHpIN0kA7SAekgHaSDdJAOSAfpIB2kg3RAOkgH6SAdkA7S' +
  'QTpIB+mAdJAO0kE6SAekg3SQDtIB6SAdvixW6zn3hsIRIQ1awYWFdJAOP2sDlSsPdAX+' +
  'QYYAAAAASUVORK5CYII='), (c) => c.charCodeAt(0))
const seat = (name, cp) => ({ player_id: name, name, team: 'A', role: 'starter', bgb_cp: cp })
const merc = (name, cp) => ({ player_id: null, name, team: 'A', role: 'starter', bgb_cp: cp, mercenary: true })
const teamA = {
  team: 'A', warnings: [],
  starters: [seat('Kagura Forger', 176699474), seat('Emeraldream', 173470331),
             seat('・Celine・', 172309865), seat('Anya Forger', 111212361),
             seat('\\Aaryan', 104369720), merc('人間です', 64884228),
             merc('ウルフなう', 45472553), seat('ひなた¥', 34591756)],
  substitutes: [seat('ProTein', 29633012), seat('meimei', 18267041)],
}
const teamB = { ...teamA, team: 'B', starters: teamA.starters.slice(0, 4), substitutes: [] }

/* A result read off the mail, in the shape the API returns: four fought, one was
   listed with a zero, one is not in the ranking at all, and the substitutes
   never came on. The two starters who did not fight are the no-shows. */
const outcome = (s, i, score, listed) => ({
  registration_id: 100 + i, name: s.name, team: 'A', role: s.role, bgb_cp: s.bgb_cp,
  score, listed, participated: Boolean(score),
  no_show: s.role === 'starter' && !score,
})
const outcomes = [
  outcome(teamA.starters[0], 0, 2_000_000, true),
  outcome(teamA.starters[1], 1, 1_412_000, true),
  outcome(teamA.starters[2], 2, 993_700, true),
  outcome(teamA.starters[3], 3, 651_600, true),
  outcome(teamA.starters[4], 4, 0, true),            // listed, never fought
  outcome(teamA.starters[5], 5, null, false),        // not in the ranking at all
  ...teamA.substitutes.map((s, i) =>
    outcome({ ...s, role: 'substitute' }, 10 + i, null, false)),
]
const resultTeamA = {
  team: 'A', outcomes,
  fought: outcomes.filter((o) => o.participated).length,
  listed_zero: outcomes.filter((o) => o.listed && !o.participated).length,
  absent: outcomes.filter((o) => !o.listed).length,
  total_score: outcomes.reduce((n, o) => n + (o.score || 0), 0),
}
const noShows = outcomes.filter((o) => o.no_show)

export const api = {
  listAnnouncements: () => ok(rows),
  listEvents: () => ok(events),
  channels: () => ok(channels),
  createAnnouncement: (p) => ok({ ...p, id: 99 }),
  updateAnnouncement: (id, p) => ok({ ...p, id }),
  deleteAnnouncement: () => ok({}),
  testAnnouncement: () => ok({ sent: true }),
  createEvent: (p) => ok({ ...p, id: 99, upcoming: [] }),
  updateEvent: (id, p) => ok({ ...p, id, upcoming: [] }),
  deleteEvent: () => ok({}),
  previewSchedule: () => ok({ description: 'Every day at 09:00', next_runs: [iso(240), iso(1680)] }),
  previewEvent: () => ok([iso(60 * 40)]),
  listOccurrences: () => ok([]),
  overrideOccurrence: () => ok({}),
  clearOccurrence: () => ok([]),
  guidedSetup: () => ok({}),
  roles: () => ok([]),
  listPlayers: () => ok(players),
  rosterTemplate: () => asFile({ blob: new Blob(['template']), name: 'pou-roster.xlsx' }),
  previewRosterImport: () => ok({
    as_of: '2026-09-25', fingerprint: 'abc123', unchanged: 88, problems: [],
    rows: [{ line: 2, id: 'a1', name: 'Nyx' }],
    updated: [{ player_id: 'a1', name: 'Nyx', fields: { bgb_cp: [278997886, 291000000] } },
              { player_id: 'a3', name: 'Unbroken Storm', fields: { total_cp: [764037512, 781204551], industry_level: [6, 7] } }],
    renamed: [{ player_id: 'a2', was: 'Korrin', name: 'ǝVelaɐ', fields: { bgb_cp: [54499085, 56120400] } }],
    added: [{ player_id: null, name: 'Newcomer', line: 44, fields: { bgb_cp: [null, 17250000] } }],
    left: [{ player_id: 'a5', name: 'Stinky' }, { player_id: 'a6', name: 'Wanderer' }],
    returning: [],
  }),
  applyRosterImport: (p) => ok({ ...p, as_of: '2026-09-25', unchanged: 88, problems: [],
    updated: [1, 2], renamed: [1], added: [1], left: [1], returning: [] }),
  bgbLanguages: () => ok([
    { code: 'en', native: 'English', english: 'English' },
    { code: 'ko', native: '한국어', english: 'Korean' },
    { code: 'ja', native: '日本語', english: 'Japanese' },
    { code: 'zh', native: '繁體中文', english: 'Chinese (Traditional)' },
    { code: 'zh_cn', native: '中文', english: 'Chinese (Simplified)' },
    { code: 'th', native: 'ไทย', english: 'Thai' },
    { code: 'vi', native: 'Tiếng Việt', english: 'Vietnamese' },
    { code: 'id', native: 'Bahasa Indonesia', english: 'Indonesian' },
    { code: 'tr', native: 'Türkçe', english: 'Turkish' },
    { code: 'de', native: 'Deutsch', english: 'German' },
    { code: 'it', native: 'Italiano', english: 'Italian' },
    { code: 'fr', native: 'Français', english: 'French' },
    { code: 'es', native: 'Español', english: 'Spanish' },
    { code: 'pt', native: 'Português', english: 'Portuguese' },
    { code: 'ar', native: 'اللغة العربية', english: 'Arabic' },
  ]),
  bgbEvents: () => ok([
    { id: 4, battle_date: '2026-09-27', starters: { A: 20, B: 20 }, substitutes: { A: 6, B: 10 } },
    { id: 3, battle_date: '2026-09-13', starters: { A: 20, B: 18 }, substitutes: { A: 10, B: 4 },
      results_at: '2026-09-13T14:00:00Z' },
  ]),
  bgbRoster: () => ok([teamA, teamB]),
  bgbResultTemplate: () => asFile({ blob: new Blob(['sheet']), name: 'pou-bgb-result.xlsx' }),
  previewBgbResult: () => ok({
    event_id: 4, battle_date: '2026-09-27', fingerprint: 'r1', recorded: false,
    rows: [{ line: 2, id: 100, score: 2000000 }],
    teams: [resultTeamA], no_shows: noShows, problems: [],
  }),
  applyBgbResult: () => ok({
    event_id: 4, battle_date: '2026-09-27', fingerprint: 'r1', recorded: true,
    rows: [], teams: [resultTeamA], no_shows: noShows, problems: [],
  }),
  bgbTemplate: () => asFile({ blob: new Blob(['sheet']), name: 'pou-bgb-roster.xlsx' }),
  previewBgbRoster: () => ok({
    battle_date: '2026-09-26', fingerprint: 'abc123', problems: [], replaces: 30, event_id: null,
    rows: [{ team: 'A', line: 2, id: 'a1', name: 'Kagura Forger', role: 'starter' }],
    teams: [teamA, teamB],
    cp_changes: [{ player_id: 'a1', name: 'Kagura Forger', before: 174888788, after: 176699474 }],
  }),
  applyBgbRoster: () => ok({
    battle_date: '2026-09-26', fingerprint: 'abc123', problems: [], replaces: 0, event_id: 4,
    rows: [], teams: [teamA, teamB], cp_changes: [],
  }),
  bgbCard: () => asFile({ blob: new Blob([PNG], { type: 'image/png' }), name: 'lineup_teamA.png' }),
  bgbCards: () => asFile({ blob: new Blob(['zip']), name: 'bgb-20260926-cards.zip' }),
  createPlayer: (p) => ok({ ...p, id: 'new', active: true, updated_at: iso(0), names: [seen(p.name, '2026-09-23')] }),
  updatePlayer: (id, p) => ok({ ...players.find((x) => x.id === id), ...p }),
  deletePlayer: () => ok(null),
  me: () => ok({ username: 'Goba', is_admin: true }),
  health: () => ok({ status: 'ok' }),
  // /lineups returns a list; /lineups/<slug> a single plan.
  raw: (path) => ok(String(path).split('/').length > 2 ? {} : []),
}
export const getToken = () => 'x'
export const clearToken = () => {}
export const consumeTokenFromUrl = () => null
export const loginUrl = () => '#'

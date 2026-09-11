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
const ok = (v) => Promise.resolve(JSON.parse(JSON.stringify(v)))
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
  me: () => ok({ username: 'Goba', is_admin: true }),
  health: () => ok({ status: 'ok' }),
  // /lineups returns a list; /lineups/<slug> a single plan.
  raw: (path) => ok(String(path).split('/').length > 2 ? {} : []),
}
export const getToken = () => 'x'
export const clearToken = () => {}
export const consumeTokenFromUrl = () => null
export const loginUrl = () => '#'

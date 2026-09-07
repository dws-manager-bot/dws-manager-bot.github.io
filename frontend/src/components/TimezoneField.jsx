/**
 * Which clock a schedule is read against.
 *
 * Free text with suggestions rather than a closed list: the API accepts any
 * IANA zone and rejects the rest by name, so a list here would only get in the
 * way of someone who needs a fourth. The three that matter are one keystroke
 * away.
 *
 * Etc/GMT+2 inverts the sign, as the Etc zones do: it is UTC−2, which is game
 * server time, and it has no daylight saving — matching the game.
 */
import { zoneLabel } from '../lib/tz.js'

export default function TimezoneField({ value, onChange, label = 'Times are in' }) {
  const offset = zoneLabel(value)
  return (
    <label>
      {label}
      <input
        list="tz-options"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Asia/Seoul"
      />
      <datalist id="tz-options">
        <option value="Asia/Seoul">Korea</option>
        <option value="Etc/GMT+2">Game server time (ST)</option>
        <option value="UTC">UTC</option>
      </datalist>
      <small className="muted">
        {offset && `${offset} · `}every time on this form is read against it.
        {' '}Etc/GMT+2 is server time — 00:00 ST is 11:00 KST.
      </small>
    </label>
  )
}

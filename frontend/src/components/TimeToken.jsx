import InsertPicker from './InsertPicker.jsx'
import { TIME_TOKENS } from '../lib/discordtime.js'

/**
 * A time the bot fills in when it posts, so every reader sees their own clock.
 *
 * A fixed timestamp would be right once and wrong every week after, which is
 * why these are tokens rather than dates: the bot resolves them against the
 * occurrence being announced, at the moment it announces it.
 */
export default function TimeToken({ textareaRef, value, onChange }) {
  return (
    <InsertPicker
      placeholder="Insert a time…"
      options={TIME_TOKENS.map((t) => ({ value: `{${t.token}}`, label: t.label }))}
      textareaRef={textareaRef}
      value={value}
      onChange={onChange}
    />
  )
}

/**
 * Dropping a channel link into a message.
 *
 * Discord's own syntax is <#123…>, which renders for every reader as a
 * clickable #channel they can click through to. Nobody should have to go and
 * find a snowflake to write one, so this inserts it where the caret is and
 * hands focus straight back.
 */
export default function ChannelLink({ channels, textareaRef, value, onChange }) {
  if (!channels?.length) return null

  const insert = (id) => {
    const token = `<#${id}>`
    const el = textareaRef.current
    const text = value || ''
    if (!el) {
      onChange(text + token)
      return
    }
    const start = el.selectionStart ?? text.length
    const end = el.selectionEnd ?? start
    onChange(text.slice(0, start) + token + text.slice(end))
    // Next frame: React has to render the new value before a caret position
    // in it means anything.
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(start + token.length, start + token.length)
    })
  }

  return (
    <select
      className="link-insert"
      value=""
      onChange={(e) => { if (e.target.value) insert(e.target.value) }}
      aria-label="Insert a link to a channel"
    >
      <option value="">Link a channel…</option>
      {channels.map((c) => (
        <option key={c.id} value={c.id}>#{c.name}</option>
      ))}
    </select>
  )
}

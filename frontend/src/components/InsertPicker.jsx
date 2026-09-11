/**
 * Dropping something into a message at the caret.
 *
 * Both things worth inserting — a channel link and a time — are syntax nobody
 * should have to remember, let alone assemble by hand from a snowflake or an
 * epoch. Pick from a list, and it lands where you were typing with focus
 * handed straight back.
 */
export default function InsertPicker({ placeholder, options, textareaRef, value, onChange }) {
  if (!options?.length) return null

  const insert = (token) => {
    const text = value || ''
    const el = textareaRef?.current
    if (!el) {
      onChange(text + token)
      return
    }
    const start = el.selectionStart ?? text.length
    const end = el.selectionEnd ?? start
    onChange(text.slice(0, start) + token + text.slice(end))
    // Next frame: React has to render the new value before a caret position
    // inside it means anything.
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
      aria-label={placeholder}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}

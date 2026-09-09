/**
 * The form for one row, opened where that row is.
 *
 * It used to live at the bottom of the page, which meant editing the third of
 * twelve announcements sent you scrolling past nine others and back. Rendered
 * against the row it belongs to, the thing being changed stays on screen.
 */
export default function EditorPanel({ title, onSubmit, onCancel, busy, saveLabel = 'Save', children }) {
  return (
    <form className="panel editor" onSubmit={onSubmit}>
      <h3>{title}</h3>
      {children}
      <div className="card-actions">
        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? 'Saving…' : saveLabel}
        </button>
        <button className="btn" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}

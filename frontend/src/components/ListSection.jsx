/**
 * A named group of rows.
 *
 * "Scheduled" is the list; the other two are answers to questions that would
 * otherwise be asked of every row individually — why is this one not going out,
 * and where did the ones I turned off go. A group nobody needs to look at
 * collapses; one holding something broken does not.
 */
export default function ListSection({ title, note, tone, count, open, onToggle, children }) {
  if (!count) return null
  const collapsible = typeof onToggle === 'function'
  return (
    <section className={`lgroup${tone ? ` ${tone}` : ''}`}>
      {collapsible ? (
        <button
          type="button"
          className="lgroup-head"
          aria-expanded={open}
          onClick={onToggle}
        >
          <span className="lgroup-title">{title}</span>
          <span className="pill">{count}</span>
          {note && <span className="muted small">{note}</span>}
          <span className="lrow-chev" aria-hidden="true">›</span>
        </button>
      ) : (
        <div className="lgroup-head static">
          <span className="lgroup-title">{title}</span>
          <span className="pill">{count}</span>
          {note && <span className="muted small">{note}</span>}
        </div>
      )}
      {(!collapsible || open) && <div className="cards rows">{children}</div>}
    </section>
  )
}

/**
 * One line in a list that opens.
 *
 * The summary carries only what a page is scanned for — whether it is on, what
 * it is called, where it acts and when it next fires. Everything else waits
 * behind the disclosure, which is what lets twenty announcements fit on a
 * screen instead of four.
 *
 * The whole summary is the button, so there is nothing small to hit; the body
 * is unmounted while closed, so a list of many rows costs one row each.
 */
export default function ListRow({
  id, enabled = true, title, where, warn, when, whenNote, open, onToggle, children,
}) {
  return (
    <div className={`lrow${open ? ' open' : ''}${enabled ? '' : ' off'}`}>
      <button
        type="button"
        className="lrow-head"
        aria-expanded={open}
        aria-controls={`lrow-body-${id}`}
        onClick={onToggle}
      >
        <span className={`dot lrow-dot ${enabled ? 'ok' : 'off'}`} />
        <span className="lrow-title">{title}</span>
        <span className="lrow-meta">
          {where && <span className="lrow-where">{where}</span>}
          {warn && <span className="lrow-warn">{warn}</span>}
          <span className="lrow-when">
            {when}
            {whenNote && <span className="muted"> · {whenNote}</span>}
          </span>
        </span>
        <span className="lrow-chev" aria-hidden="true">›</span>
      </button>

      {open && <div className="lrow-body" id={`lrow-body-${id}`}>{children}</div>}
    </div>
  )
}

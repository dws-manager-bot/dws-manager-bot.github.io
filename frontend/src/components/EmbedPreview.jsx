/**
 * How the announcement will look in Discord.
 *
 * Deliberately mimics Discord's own embed chrome rather than the backoffice
 * theme — the point is to answer "will this read well over there", so it has
 * to look like over there.
 *
 * The markdown subset is the one the bot actually supports in an embed
 * description: bold, italic, inline code, and line breaks. Anything else is
 * shown literally, which is also what Discord does.
 */

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;' }
const escape = (s) => s.replace(/[&<>]/g, (c) => ESCAPES[c])

function renderMarkdown(text) {
  return escape(text)
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
    .replace(/__([^_]+)__/g, '<u>$1</u>')
    .replace(/\n/g, '<br>')
}

const MENTION_LABEL = { '@everyone': '@everyone', '@here': '@here' }

export default function EmbedPreview({ announcement, sample }) {
  const a = announcement
  const color = a.use_embed ? (a.embed_color || '#5865F2') : null

  const body = (
    <div
      className="dc-desc"
      dangerouslySetInnerHTML={{ __html: renderMarkdown(a.body || '') }}
    />
  )

  return (
    <div className="dc">
      <div className="dc-head">
        <span className="dc-avatar" aria-hidden="true">P</span>
        <span className="dc-name">PoU Bot</span>
        <span className="dc-badge">APP</span>
        <span className="dc-time">now</span>
      </div>

      {a.mention && (
        <div className="dc-mention">{MENTION_LABEL[a.mention] ?? a.mention}</div>
      )}

      {a.use_embed ? (
        <div className="dc-embed" style={{ borderLeftColor: color }}>
          {a.title && <div className="dc-title">{a.title}</div>}
          {body}
          {sample?.moved && (
            <div className="dc-field">
              <div className="dc-field-name">⏰ Rescheduled</div>
              <div className="dc-field-value">
                Rescheduled — was {sample.originalLabel}
                {sample.note && <><br />{sample.note}</>}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="dc-plain">
          {a.title && <div className="dc-title-plain">{a.title}</div>}
          {body}
          {sample?.moved && (
            <blockquote className="dc-quote">
              Rescheduled — was {sample.originalLabel}
              {sample.note && <><br />{sample.note}</>}
            </blockquote>
          )}
        </div>
      )}

      <p className="dc-note muted small">
        {a.use_embed
          ? 'Embed. The ping sits above it — a mention inside an embed does not notify anyone.'
          : 'Plain text. Switch on “Send as embed” for the card layout.'}
      </p>
    </div>
  )
}

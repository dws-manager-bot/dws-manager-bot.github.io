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
 *
 * Channel links and times are the exceptions worth resolving: <#123…> is a
 * snowflake in the box and a blue #channel over there, and {time} is a token in
 * the box and each reader's own clock over there. Leaving either raw would make
 * the preview the one place the message looks wrong.
 */
import { previewTimes } from '../lib/discordtime.js'

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;' }
const escape = (s) => s.replace(/[&<>]/g, (c) => ESCAPES[c])

function renderMarkdown(text, channelName) {
  return escape(text)
    // After escaping, so the angle brackets to match are the escaped ones.
    .replace(/&lt;#(\d+)&gt;/g, (_m, id) =>
      `<span class="dc-chan">#${escape(channelName(id))}</span>`)
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
    .replace(/__([^_]+)__/g, '<u>$1</u>')
    .replace(/\n/g, '<br>')
}

const MENTION_LABEL = { '@everyone': '@everyone', '@here': '@here' }

export default function EmbedPreview({ announcement, sample, channels, when }) {
  const a = announcement
  const color = a.use_embed ? (a.embed_color || '#5865F2') : null

  /* The moment the tokens resolve against. The bot uses the occurrence being
     announced; here that is the next one where it is known, and now where it
     is not — enough to show the shape of the sentence. */
  const at = when || new Date().toISOString()
  const times = (text) => previewTimes(text, at)

  // A channel the bot cannot post to is absent from the list but still links
  // fine in Discord, so name what is known and keep the shape of the rest.
  const channelName = (id) =>
    channels?.find((c) => String(c.id) === String(id))?.name ?? 'channel'

  const body = (
    <div
      className="dc-desc"
      dangerouslySetInnerHTML={{ __html: renderMarkdown(times(a.body) || '', channelName) }}
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
          {a.title && <div className="dc-title">{times(a.title)}</div>}
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
          {a.title && <div className="dc-title-plain">{times(a.title)}</div>}
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

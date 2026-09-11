import InsertPicker from './InsertPicker.jsx'

/**
 * A link to a channel, in Discord's own `<#id>` syntax, which renders for every
 * reader as a clickable #channel they can click through to.
 */
export default function ChannelLink({ channels, textareaRef, value, onChange }) {
  return (
    <InsertPicker
      placeholder="Link a channel…"
      options={(channels || []).map((c) => ({ value: `<#${c.id}>`, label: `#${c.name}` }))}
      textareaRef={textareaRef}
      value={value}
      onChange={onChange}
    />
  )
}

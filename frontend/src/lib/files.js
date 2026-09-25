/**
 * Handing the browser a file it never fetched as a page.
 *
 * Every download here comes back through `fetch` rather than a plain link,
 * because the API wants the bearer token and an <a href> cannot carry one. So
 * the bytes arrive as a blob and this is what turns one into a saved file.
 */
export function save(blob, name) {
  const url = URL.createObjectURL(blob)
  const link = Object.assign(document.createElement('a'), { href: url, download: name })
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

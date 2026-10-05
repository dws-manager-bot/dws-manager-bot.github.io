/*
 * Turns a message key into the page's words. Messages are plain strings with
 *   {name}          a value the page passes in, or else one of the game's own
 *                   words from terms.json ({alliance}, {state}, {commander})
 *   {term:value}    a game word that holds a number, like {industry_lv:level},
 *                   which puts the passed `level` into "Lv.{0} Industry"
 *   <tag>…</tag>    words the page wraps in an element, like a link
 * A message can also be { one, other, … }, chosen by `count` with the
 * language's own plural rules (Arabic has six forms, Korean one).
 */

import { cloneElement, isValidElement } from 'react'

const TOKEN = /<(\w+)>([\s\S]*?)<\/\1>|\{(\w+)(?::(\w+))?\}/g

function lookup(messages, key) {
  let node = messages
  for (const part of key.split('.')) {
    if (node == null || typeof node !== 'object') return undefined
    node = node[part]
  }
  return node
}

export function translator({ lang, locale, messages, fallback, terms }) {
  const words = terms?.[lang] ?? {}
  const plurals = new Intl.PluralRules(locale)

  function message(key, params) {
    let m = lookup(messages, key)
    if (m === undefined) m = lookup(fallback, key)
    if (m && typeof m === 'object' && typeof params?.count === 'number') {
      m = m[plurals.select(params.count)] ?? m.other
    }
    return typeof m === 'string' ? m : undefined
  }

  // A value passed in wins over a game word of the same name.
  function value(name, inner, params) {
    if (params && name in params) return params[name]
    if (name in words) {
      const word = words[name]
      return inner && params && inner in params ? word.replace('{0}', params[inner]) : word
    }
    return `{${name}}`
  }

  /** The message as parts: strings, and elements for tags and element values. */
  function parts(key, params = {}) {
    const m = message(key, params)
    if (m === undefined) return [key]
    const out = []
    let last = 0
    for (const match of m.matchAll(TOKEN)) {
      if (match.index > last) out.push(m.slice(last, match.index))
      const [, tag, chunk, name, inner] = match
      if (tag) {
        const wrap = params[tag]
        const inside = inline(chunk, params)
        out.push(typeof wrap === 'function' ? wrap(inside) : inside.join(''))
      } else {
        out.push(value(name, inner, params))
      }
      last = match.index + match[0].length
    }
    if (last < m.length) out.push(m.slice(last))
    return merge(out)
  }

  // A tag's words may hold values too, but never another tag.
  function inline(words, params) {
    return merge(words.split(/(\{\w+(?::\w+)?\})/).filter(Boolean).map((piece) => {
      const ref = /^\{(\w+)(?::(\w+))?\}$/.exec(piece)
      return ref ? value(ref[1], ref[2], params) : piece
    }))
  }

  /** Plain text: tags dropped to their words, every value as text. */
  const t = (key, params) => parts(key, params).map((p) => (typeof p === 'object' ? text(p) : String(p))).join('')
  t.rich = parts
  t.has = (key) => lookup(messages, key) !== undefined || lookup(fallback, key) !== undefined
  t.lang = lang
  t.locale = locale
  return t
}

/* Neighbouring strings joined, so a sentence stays one text node where it
   can; elements keyed by place, since React renders the parts as a list. */
function merge(list) {
  const out = []
  for (const p of list) {
    if ((typeof p === 'string' || typeof p === 'number') && typeof out[out.length - 1] === 'string') {
      out[out.length - 1] += String(p)
    } else if (isValidElement(p) && p.key == null) {
      out.push(cloneElement(p, { key: out.length }))
    } else {
      out.push(typeof p === 'number' ? String(p) : p)
    }
  }
  return out
}

function text(node) {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node !== 'object') return String(node)
  if (Array.isArray(node)) return node.map(text).join('')
  return text(node.props?.children)
}

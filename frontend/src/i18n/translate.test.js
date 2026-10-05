import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { translator } from './translate.js'

const TERMS = {
  en: { alliance: 'Alliance', state: 'State', industry_lv: 'Lv.{0} Industry' },
  ko: { alliance: '연맹', state: '전투구역', industry_lv: '산업 {0}레벨' },
}

const en = {
  greet: 'Hello, {name}.',
  join: 'Join {state} {home}!',
  level: '{industry_lv:level}',
  tries: { one: 'Try again in {count} minute.', other: 'Try again in {count} minutes.' },
  back: 'Come back to <link>My application</link> later.',
  only_en: 'Only in English',
  nested: { deep: { key: 'Found it' } },
}
const ko = {
  greet: '{name}님, 안녕하세요.',
  join: '{state} {home}에 오세요!',
  level: '{industry_lv:level}',
  tries: { other: '{count}분 후에 다시 시도하세요.' },
  back: '나중에 <link>내 신청서</link>로 돌아오세요.',
  nested: { deep: { key: '찾았다' } },
}

const t = translator({ lang: 'ko', locale: 'ko', messages: ko, fallback: en, terms: TERMS })
const tEn = translator({ lang: 'en', locale: 'en', messages: en, fallback: en, terms: TERMS })

describe('translator', () => {
  it('fills in the values it is given', () => {
    expect(t('greet', { name: 'ǝYamɐ' })).toBe('ǝYamɐ님, 안녕하세요.')
  })

  it("puts in the game's own word for a term, in the page's language", () => {
    expect(t('join', { home: 413 })).toBe('전투구역 413에 오세요!')
    expect(tEn('join', { home: 413 })).toBe('Join State 413!')
  })

  it("fills a value into a game word that holds one, like the industry level", () => {
    expect(t('level', { level: 7 })).toBe('산업 7레벨')
    expect(tEn('level', { level: 7 })).toBe('Lv.7 Industry')
  })

  it("chooses the plural form by the language's rules", () => {
    expect(tEn('tries', { count: 1 })).toBe('Try again in 1 minute.')
    expect(tEn('tries', { count: 15 })).toBe('Try again in 15 minutes.')
    expect(t('tries', { count: 1 })).toBe('1분 후에 다시 시도하세요.')
  })

  it('reads keys through nesting', () => {
    expect(t('nested.deep.key')).toBe('찾았다')
  })

  it('falls back to English for a message not translated yet, then to the key', () => {
    expect(t('only_en')).toBe('Only in English')
    expect(t('no.such.key')).toBe('no.such.key')
  })

  it('says whether a message exists', () => {
    expect(t.has('greet')).toBe(true)
    expect(t.has('errors.nothing')).toBe(false)
  })

  it('drops markup tags from plain text, keeping their words', () => {
    expect(t('back')).toBe('나중에 내 신청서로 돌아오세요.')
  })

  it('wraps tagged words in an element for rich text', () => {
    const parts = t.rich('back', { link: (chunk) => createElement('a', { href: '/my' }, chunk) })
    expect(parts[0]).toBe('나중에 ')
    expect(parts[1].type).toBe('a')
    expect(parts[1].props.href).toBe('/my')
    expect(parts[1].props.children).toEqual(['내 신청서'])
    expect(parts[2]).toBe('로 돌아오세요.')
  })

  it('puts an element given as a value into rich text', () => {
    const name = createElement('strong', null, 'ǝYamɐ')
    const parts = t.rich('greet', { name })
    expect(parts[0].type).toBe('strong')
    expect(parts[0].props.children).toBe('ǝYamɐ')
    expect(parts[1]).toBe('님, 안녕하세요.')
  })

  it('gives every element in rich text a key, so React can list them', () => {
    const parts = t.rich('back', { link: (chunk) => createElement('a', { href: '/my' }, chunk) })
    expect(parts.filter((p) => typeof p === 'object').every((p) => p.key != null)).toBe(true)
  })
})

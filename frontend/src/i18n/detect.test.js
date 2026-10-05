import { describe, it, expect } from 'vitest'
import { fromTag, pickLanguage } from './detect.js'

describe('fromTag', () => {
  it('maps a device language to one of the site languages', () => {
    expect(fromTag('ko-KR')).toBe('ko')
    expect(fromTag('ja')).toBe('ja')
    expect(fromTag('pt-BR')).toBe('pt')
    expect(fromTag('es-419')).toBe('es')
    expect(fromTag('ar-EG')).toBe('ar')
    expect(fromTag('ru-RU')).toBe('ru')
    expect(fromTag('EN-us')).toBe('en')
  })

  it('tells Simplified from Traditional Chinese by script or region', () => {
    expect(fromTag('zh-CN')).toBe('zh-Hans')
    expect(fromTag('zh')).toBe('zh-Hans')
    expect(fromTag('zh-Hans-SG')).toBe('zh-Hans')
    expect(fromTag('zh-TW')).toBe('zh-Hant')
    expect(fromTag('zh-HK')).toBe('zh-Hant')
    expect(fromTag('zh-Hant')).toBe('zh-Hant')
  })

  it('reads the old code some Android phones still send for Indonesian', () => {
    expect(fromTag('in-ID')).toBe('id')
  })

  it('has nothing for a language the site does not offer', () => {
    expect(fromTag('pl-PL')).toBeNull()
    expect(fromTag('')).toBeNull()
    expect(fromTag(null)).toBeNull()
  })
})

describe('pickLanguage', () => {
  it('takes a language named in the link first, then one chosen before', () => {
    expect(pickLanguage({ query: 'ja', saved: 'ko', device: ['de'] })).toBe('ja')
    expect(pickLanguage({ saved: 'ko', device: ['de'] })).toBe('ko')
  })

  it("then follows the device's languages, in its order of preference", () => {
    expect(pickLanguage({ device: ['pl-PL', 'tr-TR', 'en-US'] })).toBe('tr')
  })

  it('is English when nothing points elsewhere', () => {
    expect(pickLanguage({ device: ['pl-PL'] })).toBe('en')
    expect(pickLanguage()).toBe('en')
  })

  it('ignores a link or saved choice that names no site language', () => {
    expect(pickLanguage({ query: 'xx', saved: 'klingon', device: ['fr-CA'] })).toBe('fr')
  })
})

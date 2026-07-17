import { describe, expect, it } from 'vitest'
import { buildSystemPrompt } from './prompt-builder'
import { mergePersonaProfile } from './personas'

describe('buildSystemPrompt', () => {
  it('includes builtin persona and structured user overrides', () => {
    const profile = mergePersonaProfile('feibi', {
      userCallName: '小柯',
      relationship: '青梅竹马',
      personalityBias: 'shy',
      tonePreference: 'tsundere',
      extraNotes: '喜欢聊美食'
    })
    const prompt = buildSystemPrompt('feibi', profile)
    expect(prompt).toContain('菲比')
    expect(prompt).toContain('小柯')
    expect(prompt).toContain('青梅竹马')
    expect(prompt).toContain('害羞内敛')
    expect(prompt).toContain('傲娇')
    expect(prompt).toContain('喜欢聊美食')
    expect(prompt).toContain('不要主动提及你是 AI')
  })
})

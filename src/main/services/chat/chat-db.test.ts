import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getPath: () => tmpdir()
  }
}))

import {
  closeChatDb,
  createConversation,
  deleteConversation,
  getConversationMessages,
  getPersonaProfile,
  getRecentContextMessages,
  insertMessage,
  listConversations,
  openChatDbForTest,
  renameConversation,
  updateMessage,
  updatePersonaProfile
} from './chat-db'

describe('chat-db', () => {
  let dir: string

  afterEach(() => {
    closeChatDb()
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  function setup(): void {
    dir = mkdtempSync(join(tmpdir(), 'chat-db-'))
    openChatDbForTest(join(dir, 'chat.db'))
  }

  it('returns merged default persona and persists overrides', () => {
    setup()
    const defaults = getPersonaProfile('doro')
    expect(defaults.userCallName).toBe('主人')
    const updated = updatePersonaProfile('doro', {
      userCallName: '指挥官',
      relationship: '战友',
      personalityBias: 'confident',
      tonePreference: 'playful',
      extraNotes: '多讲冷笑话'
    })
    expect(updated.userCallName).toBe('指挥官')
    expect(getPersonaProfile('doro').extraNotes).toBe('多讲冷笑话')
  })

  it('manages conversations and messages per pet', () => {
    setup()
    const a = createConversation('feibi', '菲比日常')
    const b = createConversation('guga', '咕嘎出击')
    expect(listConversations('feibi').map((c) => c.id)).toEqual([a.id])
    expect(listConversations('guga').map((c) => c.id)).toEqual([b.id])

    insertMessage({
      conversationId: a.id,
      role: 'user',
      content: '你好呀'
    })
    const assistant = insertMessage({
      conversationId: a.id,
      role: 'assistant',
      content: '菲比在听哦～'
    })
    expect(getConversationMessages(a.id)).toHaveLength(2)
    expect(listConversations('feibi')[0].lastMessagePreview).toContain('菲比')

    updateMessage(assistant.id, { content: '菲比改口啦', status: 'complete' })
    expect(getRecentContextMessages(a.id, 10)).toHaveLength(2)

    renameConversation(a.id, '新标题')
    expect(listConversations('feibi')[0].title).toBe('新标题')

    expect(deleteConversation(a.id)).toBe(true)
    expect(listConversations('feibi')).toHaveLength(0)
  })

  it('keeps insertion order when messages share the same timestamp', () => {
    setup()
    const conversation = createConversation('nuonuo', '顺序测试')
    const timestamp = 123456
    insertMessage({
      id: 'z-user',
      conversationId: conversation.id,
      role: 'user',
      content: '先说的话',
      createdAt: timestamp
    })
    insertMessage({
      id: 'a-assistant',
      conversationId: conversation.id,
      role: 'assistant',
      content: '后回复的话',
      createdAt: timestamp
    })

    expect(
      getConversationMessages(conversation.id).map((message) => message.role)
    ).toEqual(['user', 'assistant'])
    expect(
      getRecentContextMessages(conversation.id).map((message) => message.role)
    ).toEqual(['user', 'assistant'])
  })
})

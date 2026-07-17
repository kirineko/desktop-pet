import Database from 'better-sqlite3'
import { app } from 'electron'
import { randomUUID } from 'crypto'
import { join } from 'path'
import type {
  ChatMessageRecord,
  ChatMessageRole,
  ConversationRecord,
  PersonaProfile,
  PersonaProfileFields,
  PetId
} from '../../../shared/types'
import { PET_IDS } from '../../../shared/types'
import { mergePersonaProfile, sanitizePersonaFields } from './personas'

let db: Database.Database | null = null

export function getChatDb(dbPath?: string): Database.Database {
  if (db && !dbPath) return db
  const path = dbPath ?? join(app.getPath('userData'), 'chat.db')
  const database = new Database(path)
  database.pragma('journal_mode = WAL')
  database.exec(`
    CREATE TABLE IF NOT EXISTS persona_profiles (
      pet_id TEXT PRIMARY KEY,
      user_call_name TEXT NOT NULL,
      relationship TEXT NOT NULL,
      personality_bias TEXT NOT NULL,
      tone_preference TEXT NOT NULL,
      extra_notes TEXT NOT NULL DEFAULT '',
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      pet_id TEXT NOT NULL,
      title TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      last_message_preview TEXT
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'complete',
      error_code TEXT,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_conversations_pet
      ON conversations(pet_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_messages_conversation
      ON messages(conversation_id, created_at ASC);
  `)
  if (!dbPath) db = database
  return database
}

function rowToPersona(row: Record<string, unknown>): PersonaProfile {
  return {
    petId: row.pet_id as PetId,
    userCallName: String(row.user_call_name),
    relationship: String(row.relationship),
    personalityBias: row.personality_bias as PersonaProfile['personalityBias'],
    tonePreference: row.tone_preference as PersonaProfile['tonePreference'],
    extraNotes: String(row.extra_notes ?? ''),
    updatedAt: Number(row.updated_at)
  }
}

function rowToConversation(row: Record<string, unknown>): ConversationRecord {
  return {
    id: String(row.id),
    petId: row.pet_id as PetId,
    title: String(row.title),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    lastMessagePreview:
      row.last_message_preview == null
        ? null
        : String(row.last_message_preview)
  }
}

function rowToMessage(row: Record<string, unknown>): ChatMessageRecord {
  return {
    id: String(row.id),
    conversationId: String(row.conversation_id),
    role: row.role as ChatMessageRole,
    content: String(row.content),
    createdAt: Number(row.created_at),
    status: row.status as ChatMessageRecord['status'],
    errorCode:
      row.error_code == null
        ? null
        : (row.error_code as ChatMessageRecord['errorCode'])
  }
}

export function getPersonaProfile(petId: PetId): PersonaProfile {
  if (!PET_IDS.includes(petId)) {
    throw new Error('无效的宠物 ID')
  }
  const row = getChatDb()
    .prepare('SELECT * FROM persona_profiles WHERE pet_id = ?')
    .get(petId) as Record<string, unknown> | undefined
  if (!row) return mergePersonaProfile(petId, null, 0)
  return mergePersonaProfile(petId, rowToPersona(row), Number(row.updated_at))
}

export function updatePersonaProfile(
  petId: PetId,
  fields: Partial<PersonaProfileFields>
): PersonaProfile {
  if (!PET_IDS.includes(petId)) {
    throw new Error('无效的宠物 ID')
  }
  const sanitized = sanitizePersonaFields(fields)
  const now = Date.now()
  getChatDb()
    .prepare(
      `INSERT INTO persona_profiles (
        pet_id, user_call_name, relationship, personality_bias,
        tone_preference, extra_notes, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(pet_id) DO UPDATE SET
        user_call_name = excluded.user_call_name,
        relationship = excluded.relationship,
        personality_bias = excluded.personality_bias,
        tone_preference = excluded.tone_preference,
        extra_notes = excluded.extra_notes,
        updated_at = excluded.updated_at`
    )
    .run(
      petId,
      sanitized.userCallName,
      sanitized.relationship,
      sanitized.personalityBias,
      sanitized.tonePreference,
      sanitized.extraNotes,
      now
    )
  return getPersonaProfile(petId)
}

export function listConversations(petId: PetId): ConversationRecord[] {
  const rows = getChatDb()
    .prepare(
      `SELECT * FROM conversations
       WHERE pet_id = ?
       ORDER BY updated_at DESC, created_at DESC`
    )
    .all(petId) as Record<string, unknown>[]
  return rows.map(rowToConversation)
}

export function createConversation(
  petId: PetId,
  title?: string
): ConversationRecord {
  if (!PET_IDS.includes(petId)) {
    throw new Error('无效的宠物 ID')
  }
  const now = Date.now()
  const id = randomUUID()
  const resolvedTitle =
    typeof title === 'string' && title.trim()
      ? title.trim().slice(0, 64)
      : `新对话 ${new Date(now).toLocaleString('zh-CN', {
          month: 'numeric',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })}`
  getChatDb()
    .prepare(
      `INSERT INTO conversations (
        id, pet_id, title, created_at, updated_at, last_message_preview
      ) VALUES (?, ?, ?, ?, ?, NULL)`
    )
    .run(id, petId, resolvedTitle, now, now)
  return getConversation(id)!
}

export function getConversation(id: string): ConversationRecord | null {
  const row = getChatDb()
    .prepare('SELECT * FROM conversations WHERE id = ?')
    .get(id) as Record<string, unknown> | undefined
  return row ? rowToConversation(row) : null
}

export function renameConversation(
  id: string,
  title: string
): ConversationRecord | null {
  const trimmed = title.trim().slice(0, 64)
  if (!trimmed) return getConversation(id)
  getChatDb()
    .prepare(
      `UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?`
    )
    .run(trimmed, Date.now(), id)
  return getConversation(id)
}

export function deleteConversation(id: string): boolean {
  const database = getChatDb()
  const tx = database.transaction(() => {
    database.prepare('DELETE FROM messages WHERE conversation_id = ?').run(id)
    return database.prepare('DELETE FROM conversations WHERE id = ?').run(id)
  })
  return tx().changes > 0
}

export function getConversationMessages(
  conversationId: string
): ChatMessageRecord[] {
  const rows = getChatDb()
    .prepare(
      `SELECT * FROM messages
       WHERE conversation_id = ?
       ORDER BY created_at ASC, rowid ASC`
    )
    .all(conversationId) as Record<string, unknown>[]
  return rows.map(rowToMessage)
}

/** 取最近 N 条完整消息作为模型上下文（不含 system）。 */
export function getRecentContextMessages(
  conversationId: string,
  limit = 24
): ChatMessageRecord[] {
  const rows = getChatDb()
    .prepare(
      `SELECT * FROM messages
       WHERE conversation_id = ?
         AND role IN ('user', 'assistant')
         AND status IN ('complete', 'streaming')
       ORDER BY created_at DESC, rowid DESC
       LIMIT ?`
    )
    .all(conversationId, limit) as Record<string, unknown>[]
  return rows.map(rowToMessage).reverse()
}

export function insertMessage(input: {
  id?: string
  conversationId: string
  role: ChatMessageRole
  content: string
  status?: ChatMessageRecord['status']
  errorCode?: ChatMessageRecord['errorCode']
  createdAt?: number
}): ChatMessageRecord {
  const id = input.id ?? randomUUID()
  const createdAt = input.createdAt ?? Date.now()
  const status = input.status ?? 'complete'
  const database = getChatDb()
  const tx = database.transaction(() => {
    database
      .prepare(
        `INSERT INTO messages (
          id, conversation_id, role, content, created_at, status, error_code
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.conversationId,
        input.role,
        input.content,
        createdAt,
        status,
        input.errorCode ?? null
      )
    const preview =
      input.role === 'system'
        ? null
        : input.content.trim().slice(0, 80) || null
    if (preview != null) {
      database
        .prepare(
          `UPDATE conversations
           SET updated_at = ?, last_message_preview = ?
           WHERE id = ?`
        )
        .run(createdAt, preview, input.conversationId)
    } else {
      database
        .prepare(`UPDATE conversations SET updated_at = ? WHERE id = ?`)
        .run(createdAt, input.conversationId)
    }
  })
  tx()
  return getMessage(id)!
}

export function getMessage(id: string): ChatMessageRecord | null {
  const row = getChatDb()
    .prepare('SELECT * FROM messages WHERE id = ?')
    .get(id) as Record<string, unknown> | undefined
  return row ? rowToMessage(row) : null
}

export function updateMessage(
  id: string,
  patch: {
    content?: string
    status?: ChatMessageRecord['status']
    errorCode?: ChatMessageRecord['errorCode'] | null
  }
): ChatMessageRecord | null {
  const current = getMessage(id)
  if (!current) return null
  const content = patch.content ?? current.content
  const status = patch.status ?? current.status
  const errorCode =
    patch.errorCode === undefined ? current.errorCode : patch.errorCode
  const database = getChatDb()
  const now = Date.now()
  const tx = database.transaction(() => {
    database
      .prepare(
        `UPDATE messages
         SET content = ?, status = ?, error_code = ?
         WHERE id = ?`
      )
      .run(content, status, errorCode ?? null, id)
    if (current.role !== 'system') {
      database
        .prepare(
          `UPDATE conversations
           SET updated_at = ?, last_message_preview = ?
           WHERE id = ?`
        )
        .run(now, content.trim().slice(0, 80) || null, current.conversationId)
    }
  })
  tx()
  return getMessage(id)
}

export function closeChatDb(): void {
  if (db) {
    db.close()
    db = null
  }
}

/** 测试用：用指定路径初始化，并清空单例引用。 */
export function openChatDbForTest(dbPath: string): Database.Database {
  if (db) {
    db.close()
    db = null
  }
  db = getChatDb(dbPath)
  return db
}

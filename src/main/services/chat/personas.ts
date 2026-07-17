import type {
  ChatPersonalityBias,
  ChatTonePreference,
  PersonaProfile,
  PersonaProfileFields,
  PetId
} from '../../../shared/types'
import { PET_LABELS } from '../../../shared/types'

export interface BuiltinPersona {
  petId: PetId
  displayName: string
  coreIdentity: string
  speechStyle: string
  defaultFields: PersonaProfileFields
}

const DEFAULT_FIELDS: PersonaProfileFields = {
  userCallName: '主人',
  relationship: '亲密伙伴',
  personalityBias: 'caring',
  tonePreference: 'gentle',
  extraNotes: ''
}

export const BUILTIN_PERSONAS: Record<PetId, BuiltinPersona> = {
  feibi: {
    petId: 'feibi',
    displayName: PET_LABELS.feibi,
    coreIdentity:
      '你是菲比，一只有点天然又认真负责的像素小猫娘桌宠。你戴着歪歪的小帽子，喜欢陪用户一起做事，偶尔会害羞，但会认真倾听。',
    speechStyle:
      '语气温柔、略带天然呆，会用「呀」「哦」「呢」等软软语气词。可以适度使用第一人称「菲比」。偶尔用 *轻轻歪头* 这样的动作描写。',
    defaultFields: {
      ...DEFAULT_FIELDS,
      personalityBias: 'caring',
      tonePreference: 'gentle'
    }
  },
  guga: {
    petId: 'guga',
    displayName: PET_LABELS.guga,
    coreIdentity:
      '你是咕嘎，一只精力旺盛、爱叫唤的像素小鸟桌宠。你行动力强，喜欢用「咕嘎」表达情绪，对用户忠诚又活泼。',
    speechStyle:
      '语气短促有力、节奏快，常穿插「咕嘎」「咕！」等拟声。可以适度使用第一人称「咕嘎」。偶尔用 *扑棱翅膀* 这样的动作描写。',
    defaultFields: {
      ...DEFAULT_FIELDS,
      personalityBias: 'mischievous',
      tonePreference: 'energetic'
    }
  },
  doro: {
    petId: 'doro',
    displayName: PET_LABELS.doro,
    coreIdentity:
      '你是 Doro，一只元气满满、略带戏感的像素桌宠。你喜欢嘿嘿笑，爱开玩笑，但关键时刻会认真陪着用户。',
    speechStyle:
      '语气轻松俏皮，喜欢用「嘿嘿」「芜湖」一类口头禅。可以适度使用第一人称「Doro」。偶尔用 *得意地叉腰* 这样的动作描写。',
    defaultFields: {
      ...DEFAULT_FIELDS,
      personalityBias: 'confident',
      tonePreference: 'playful'
    }
  },
  nuonuo: {
    petId: 'nuonuo',
    displayName: PET_LABELS.nuonuo,
    coreIdentity:
      '你是糯糯，一只软绵绵、有点困困的像素桌宠。你说话慢悠悠，喜欢贴贴，给人安心感。',
    speechStyle:
      '语气软糯缓慢，常用省略号和「嗯…」「呼…」。可以适度使用第一人称「糯糯」。偶尔用 *揉揉眼睛* 这样的动作描写。',
    defaultFields: {
      ...DEFAULT_FIELDS,
      personalityBias: 'sleepy',
      tonePreference: 'soft'
    }
  }
}

export const PERSONALITY_LABELS: Record<ChatPersonalityBias, string> = {
  caring: '体贴温柔',
  mischievous: '古灵精怪',
  shy: '害羞内敛',
  confident: '自信开朗',
  sleepy: '软软困困'
}

export const TONE_LABELS: Record<ChatTonePreference, string> = {
  gentle: '温柔',
  energetic: '元气',
  tsundere: '傲娇',
  soft: '软糯',
  playful: '俏皮'
}

export function getBuiltinPersona(petId: PetId): BuiltinPersona {
  return BUILTIN_PERSONAS[petId]
}

export function mergePersonaProfile(
  petId: PetId,
  overrides: Partial<PersonaProfileFields> | null | undefined,
  updatedAt = 0
): PersonaProfile {
  const builtin = getBuiltinPersona(petId)
  return {
    petId,
    ...builtin.defaultFields,
    ...(overrides ?? {}),
    updatedAt
  }
}

export function sanitizePersonaFields(
  fields: Partial<PersonaProfileFields>
): PersonaProfileFields {
  const clamp = (value: unknown, max: number, fallback: string): string => {
    if (typeof value !== 'string') return fallback
    return value.trim().slice(0, max)
  }

  const personality = fields.personalityBias
  const tone = fields.tonePreference

  return {
    userCallName: clamp(fields.userCallName, 32, DEFAULT_FIELDS.userCallName),
    relationship: clamp(fields.relationship, 64, DEFAULT_FIELDS.relationship),
    personalityBias:
      personality && personality in PERSONALITY_LABELS
        ? personality
        : DEFAULT_FIELDS.personalityBias,
    tonePreference:
      tone && tone in TONE_LABELS ? tone : DEFAULT_FIELDS.tonePreference,
    extraNotes: clamp(fields.extraNotes, 500, '')
  }
}

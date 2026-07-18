/**
 * 결재 문서 양식의 영속 경계와 런타임 parser.
 *
 * DS-1은 자유 geometry가 아니라 결재 plugin의 안정적인 band/element key와
 * discriminated union만 정의한다. 저장/편집 기능은 후속 슬라이스의 책임이다.
 */
import type { PaperSize } from './PrintLayout'

export const DOCUMENT_TEMPLATE_SCHEMA_VERSION = 1 as const

export type TemplateStatus = 'DRAFT' | 'ACTIVE'
export type BandKind = 'HEADER' | 'BODY' | 'FOOTER'

export type DocElement =
  | { key: string; type: 'TITLE' }
  | { key: string; type: 'META_ROWS' }
  | { key: string; type: 'APPROVAL_GRID' }
  | { key: string; type: 'CONTENT_PARAGRAPHS' }
  | { key: string; type: 'FIELD_TABLE' }
  | { key: string; type: 'ATTACHMENT_TABLE' }
  | { key: string; type: 'CLOSING' }

export interface Band {
  key: string
  kind: BandKind
  elements: DocElement[]
}

export interface DocumentPayload {
  paper: 'A4_PORTRAIT'
  bands: Band[]
}

export interface TemplateEnvelope {
  schemaVersion: typeof DOCUMENT_TEMPLATE_SCHEMA_VERSION
  id?: string
  status?: TemplateStatus
  revision: number
  docType: string
  name: string
  document: DocumentPayload
}

export type DocumentTemplate = TemplateEnvelope

export interface DocumentTemplateParseError {
  code:
  | 'INVALID_ENVELOPE'
  | 'UNKNOWN_VERSION'
  | 'INVALID_PAPER'
  | 'INVALID_BAND'
  | 'INVALID_ELEMENT'
  | 'DUPLICATE_KEY'
  | 'INVALID_BAND_PLACEMENT'
  | 'INVALID_ELEMENT_COUNT'
  message: string
}

export type DocumentTemplateParseResult =
  | { ok: true; value: TemplateEnvelope }
  | { ok: false; error: DocumentTemplateParseError }

const ELEMENT_TYPES = [
  'TITLE',
  'META_ROWS',
  'APPROVAL_GRID',
  'CONTENT_PARAGRAPHS',
  'FIELD_TABLE',
  'ATTACHMENT_TABLE',
  'CLOSING',
] as const

const MAX_REQUEST_BYTES = 64 * 1024
const MAX_DEPTH = 16
const MAX_BANDS = 32
const MAX_ELEMENTS_PER_BAND = 64
const MAX_KEY_LENGTH = 100
const MAX_DOC_TYPE_LENGTH = 40

type ElementType = (typeof ELEMENT_TYPES)[number]

const ALLOWED_BANDS: Record<ElementType, BandKind> = {
  TITLE: 'HEADER',
  META_ROWS: 'HEADER',
  APPROVAL_GRID: 'HEADER',
  CONTENT_PARAGRAPHS: 'BODY',
  FIELD_TABLE: 'BODY',
  ATTACHMENT_TABLE: 'BODY',
  CLOSING: 'FOOTER',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown, maxLength = MAX_KEY_LENGTH): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength
}

function depthOf(value: unknown, depth = 0): number {
  if (!isRecord(value) && !Array.isArray(value)) return depth
  const children = Array.isArray(value) ? value : Object.values(value)
  return children.reduce((max, child) => Math.max(max, depthOf(child, depth + 1)), depth)
}

function failure(
  code: DocumentTemplateParseError['code'],
  message: string,
): DocumentTemplateParseResult {
  return { ok: false, error: { code, message } }
}

function parseElement(value: unknown): DocElement | DocumentTemplateParseError {
  if (!isRecord(value) || !isNonEmptyString(value.key) || typeof value.type !== 'string') {
    return {
      code: 'INVALID_ELEMENT',
      message: '문서 요소는 비어 있지 않은 key와 type을 가져야 합니다.',
    }
  }
  if (!(ELEMENT_TYPES as readonly string[]).includes(value.type)) {
    return {
      code: 'INVALID_ELEMENT',
      message: `지원하지 않는 문서 요소 type입니다: ${value.type}`,
    }
  }
  return { key: value.key, type: value.type as ElementType } as DocElement
}

function isParseError(value: DocElement | DocumentTemplateParseError): value is DocumentTemplateParseError {
  return 'code' in value && 'message' in value
}

/**
 * 알 수 없는 입력을 검증된 결재 문서 템플릿으로 변환한다.
 * 불변식 위반은 호출자가 기본 양식 fallback을 선택할 수 있도록 오류로 반환한다.
 */
export function parseDocumentTemplate(value: unknown): DocumentTemplateParseResult {
  if (!isRecord(value)) {
    return failure('INVALID_ENVELOPE', '문서 양식 envelope가 아닙니다.')
  }
  if (value.schemaVersion !== DOCUMENT_TEMPLATE_SCHEMA_VERSION) {
    return failure('UNKNOWN_VERSION', '지원하지 않는 문서 양식 schemaVersion입니다.')
  }
  if (
    ('id' in value && value.id !== undefined && !isNonEmptyString(value.id))
    || ('status' in value && value.status !== undefined && value.status !== 'DRAFT' && value.status !== 'ACTIVE')
    || !Number.isInteger(value.revision)
    || (value.revision as number) < 0
    || !isNonEmptyString(value.docType, MAX_DOC_TYPE_LENGTH)
    || !isNonEmptyString(value.name, MAX_KEY_LENGTH)
    || !isRecord(value.document)
  ) {
    return failure('INVALID_ENVELOPE', '문서 양식 envelope 필드가 유효하지 않습니다.')
  }

  let serialized: string
  try {
    serialized = JSON.stringify(value.document)
  } catch {
    return failure('INVALID_ENVELOPE', '문서 양식 JSON을 직렬화할 수 없습니다.')
  }
  const bytes = serialized === undefined ? 0 : new TextEncoder().encode(serialized).byteLength
  if (bytes > MAX_REQUEST_BYTES || depthOf(value.document) > MAX_DEPTH) {
    return failure('INVALID_ENVELOPE', '문서 양식 JSON 상한을 초과했습니다.')
  }

  if (value.document.paper !== 'A4_PORTRAIT') {
    return failure('INVALID_PAPER', '지원하지 않는 문서 양식 용지입니다.')
  }
  if (!Array.isArray(value.document.bands)) {
    return failure('INVALID_BAND', '문서 양식 bands가 배열이 아닙니다.')
  }
  if (value.document.bands.length > MAX_BANDS) {
    return failure('INVALID_BAND', '문서 양식 bands는 32개 이하여야 합니다.')
  }

  const keys = new Set<string>()
  const bands: Band[] = []
  const counts: Partial<Record<ElementType, number>> = {}
  for (const bandValue of value.document.bands) {
    if (
      !isRecord(bandValue)
      || !isNonEmptyString(bandValue.key)
      || (bandValue.kind !== 'HEADER' && bandValue.kind !== 'BODY' && bandValue.kind !== 'FOOTER')
      || !Array.isArray(bandValue.elements)
    ) {
      return failure('INVALID_BAND', '문서 양식 band가 유효하지 않습니다.')
    }
    if (bandValue.elements.length > MAX_ELEMENTS_PER_BAND) {
      return failure('INVALID_ELEMENT', '문서 양식 band의 elements는 64개 이하여야 합니다.')
    }
    if (keys.has(bandValue.key)) {
      return failure('DUPLICATE_KEY', `중복된 문서 양식 key입니다: ${bandValue.key}`)
    }
    keys.add(bandValue.key)

    const elements: DocElement[] = []
    for (const elementValue of bandValue.elements) {
      const parsed = parseElement(elementValue)
      if (isParseError(parsed)) return failure(parsed.code, parsed.message)
      if (keys.has(parsed.key)) {
        return failure('DUPLICATE_KEY', `중복된 문서 양식 key입니다: ${parsed.key}`)
      }
      if (ALLOWED_BANDS[parsed.type] !== bandValue.kind) {
        return failure(
          'INVALID_BAND_PLACEMENT',
          `${parsed.type} 요소는 ${ALLOWED_BANDS[parsed.type]} band에 있어야 합니다.`,
        )
      }
      keys.add(parsed.key)
      elements.push(parsed)
      counts[parsed.type] = (counts[parsed.type] ?? 0) + 1
    }
    bands.push({ key: bandValue.key, kind: bandValue.kind, elements })
  }

  if ((counts.TITLE ?? 0) !== 1 || (counts.APPROVAL_GRID ?? 0) !== 1 || (counts.CLOSING ?? 0) !== 1) {
    return failure('INVALID_ELEMENT_COUNT', 'TITLE, APPROVAL_GRID, CLOSING 요소는 정확히 하나씩 있어야 합니다.')
  }
  if ((counts.META_ROWS ?? 0) > 1) {
    return failure('INVALID_ELEMENT_COUNT', 'META_ROWS 요소는 최대 하나만 허용됩니다.')
  }
  for (const type of ['CONTENT_PARAGRAPHS', 'FIELD_TABLE', 'ATTACHMENT_TABLE'] as const) {
    if ((counts[type] ?? 0) > 1) {
      return failure('INVALID_ELEMENT_COUNT', `${type} 요소는 최대 하나만 허용됩니다.`)
    }
  }

  return {
    ok: true,
    value: {
      schemaVersion: DOCUMENT_TEMPLATE_SCHEMA_VERSION,
      ...(value.id === undefined ? {} : { id: value.id as string }),
      ...(value.status === undefined ? {} : { status: value.status as TemplateStatus }),
      revision: value.revision as number,
      docType: value.docType,
      name: value.name,
      document: { paper: 'A4_PORTRAIT', bands },
    },
  }
}

/**
 * 현재 지원하는 schemaVersion을 영속 경계 타입으로 올린다.
 * DS-1에서는 version 1만 지원하며 후속 버전은 별도 upcaster로 추가한다.
 */
export function upcastDocumentTemplate(value: unknown, fromVersion: number): TemplateEnvelope {
  if (fromVersion !== DOCUMENT_TEMPLATE_SCHEMA_VERSION) {
    throw new Error(`지원하지 않는 문서 양식 버전입니다: ${fromVersion}`)
  }
  const parsed = parseDocumentTemplate(value)
  if (!parsed.ok) throw new Error(parsed.error.message)
  return parsed.value
}

/** 문서 양식 용지와 기존 PrintLayout paper prop을 exhaustively 연결한다. */
export function paperToPrintLayout(paper: DocumentPayload['paper']): PaperSize {
  switch (paper) {
    case 'A4_PORTRAIT':
      return 'a4-portrait'
    default:
      throw new Error(`지원하지 않는 용지입니다: ${String(paper)}`)
  }
}

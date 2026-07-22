/**
 * 결재 문서 양식의 영속 경계와 런타임 parser.
 *
 * schemaVersion은 envelope 컬럼이 권위이며, v1 원문과 v2 편집 문서를 각각
 * 검증한다. v1 pin을 v2로 다시 저장하지 않고, 필요한 경우 렌더 직전에만
 * 메모리에서 v2 envelope로 올린다.
 */
import type { PaperSize } from './PrintLayout'

export const SUPPORTED_SCHEMA_VERSIONS = [1, 2] as const
export const CURRENT_SCHEMA_VERSION = 2 as const
/** 새 저장 요청의 기본 버전. 과거 import 호환을 위해 이름은 유지한다. */
export const DOCUMENT_TEMPLATE_SCHEMA_VERSION = CURRENT_SCHEMA_VERSION

export type SchemaVersion = (typeof SUPPORTED_SCHEMA_VERSIONS)[number]
export type TemplateStatus = 'DRAFT' | 'ACTIVE'
export type BandKind = 'HEADER' | 'BODY' | 'FOOTER'

export interface Geometry {
  x: number
  y: number
  w: number
  h: number
}

export type ElementStyle = {
  fontSize?: number
  bold?: boolean
  align?: 'left' | 'center' | 'right'
  border?: boolean
}

export type BindingRef =
  | 'header.title'
  | 'header.docNo'
  | 'header.issueDate'
  | 'closing.note'
  | `body.fieldRow[${string}]`

export type LegacyDocElement =
  | { key: string; type: 'TITLE' }
  | { key: string; type: 'META_ROWS' }
  | { key: string; type: 'APPROVAL_GRID' }
  | { key: string; type: 'CONTENT_PARAGRAPHS' }
  | { key: string; type: 'FIELD_TABLE' }
  | { key: string; type: 'ATTACHMENT_TABLE' }
  | { key: string; type: 'CLOSING' }

export type FieldElement = {
  key: string
  type: 'FIELD'
  binding: BindingRef
  geometry?: Geometry
  style?: ElementStyle
}

export type TextElement = {
  key: string
  type: 'TEXT'
  text: string
  geometry?: Geometry
  style?: ElementStyle
}

export type DocElement = LegacyDocElement | FieldElement | TextElement
export type DocElementV2 = DocElement

/**
 * M-K: 화면 문구에 enum 원문이 노출되지 않아야 한다 — 편집기·목록 화면이 각자 라벨을 만들면
 * 표기가 갈리고 놓치는 지점이 생긴다. 단일 소스로 재사용한다.
 */
export const ELEMENT_TYPE_LABEL: Record<DocElement['type'], string> = {
  TITLE: '제목',
  META_ROWS: '문서 정보',
  APPROVAL_GRID: '결재란',
  CONTENT_PARAGRAPHS: '본문',
  FIELD_TABLE: '필드 표',
  ATTACHMENT_TABLE: '첨부 표',
  CLOSING: '맺음말',
  FIELD: '필드',
  TEXT: '문구',
}

export const BAND_KIND_LABEL: Record<BandKind, string> = {
  HEADER: '머리말',
  BODY: '본문',
  FOOTER: '맺음말',
}

export const TEMPLATE_STATUS_LABEL: Record<TemplateStatus, string> = {
  DRAFT: '임시저장',
  ACTIVE: '사용 중',
}

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
  schemaVersion: SchemaVersion
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
  | 'INVALID_GEOMETRY'
  | 'INVALID_STYLE'
  | 'INVALID_BINDING'
  | 'DUPLICATE_KEY'
  | 'INVALID_BAND_PLACEMENT'
  | 'INVALID_ELEMENT_COUNT'
  message: string
}

export type DocumentTemplateParseResult =
  | { ok: true; value: TemplateEnvelope }
  | { ok: false; error: DocumentTemplateParseError }

const LEGACY_ELEMENT_TYPES = [
  'TITLE',
  'META_ROWS',
  'APPROVAL_GRID',
  'CONTENT_PARAGRAPHS',
  'FIELD_TABLE',
  'ATTACHMENT_TABLE',
  'CLOSING',
] as const

const V2_ELEMENT_TYPES = [...LEGACY_ELEMENT_TYPES, 'FIELD', 'TEXT'] as const
const MAX_REQUEST_BYTES = 64 * 1024
const MAX_DEPTH = 16
const MAX_BANDS = 32
const MAX_ELEMENTS_PER_BAND = 64
const MAX_KEY_LENGTH = 100
const MAX_DOC_TYPE_LENGTH = 70
const MAX_FONT_SIZE = 200
/** M-A: BE `DocumentPayloadValidator.MAX_TEXT_LENGTH` 와 동일해야 한다(과거 FE 65,536 vs BE 4,096
 * 불일치 — FE 가 통과시킨 요청이 BE 에서 "비어 있지 않은 문자열이어야 합니다"로 거부되어 실제 원인
 * (길이 초과)을 사용자가 알 수 없었다). */
const MAX_TEXT_LENGTH = 4_096

type LegacyElementType = (typeof LEGACY_ELEMENT_TYPES)[number]

const ALLOWED_BANDS: Record<LegacyElementType, BandKind> = {
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

function isSupportedSchemaVersion(value: unknown): value is SchemaVersion {
  return value === 1 || value === 2
}

function parseGeometry(value: unknown): Geometry | DocumentTemplateParseError | undefined {
  if (value === undefined || value === null) return undefined
  if (!isRecord(value)
    || !['x', 'y', 'w', 'h'].every((key) => typeof value[key] === 'number' && Number.isFinite(value[key]))) {
    return { code: 'INVALID_GEOMETRY', message: '문서 요소 geometry는 유한한 x, y, w, h 숫자여야 합니다.' }
  }
  const { x, y, w, h } = value as Record<'x' | 'y' | 'w' | 'h', number>
  if (x < 0 || y < 0 || w <= 0 || h <= 0 || x + w > 100 || y + h > 100) {
    return { code: 'INVALID_GEOMETRY', message: '문서 요소 geometry는 밴드 상대 백분율 범위여야 합니다.' }
  }
  return { x, y, w, h }
}

/**
 * BLOCKING-1 방어선: BE round-trip(JSONB 저장·activate 재검증)이 `@JsonInclude(NON_NULL)` 로 명시적
 * null 을 제거하도록 고쳐졌지만, FE parser 도 독립적으로 "값이 없음"과 "값이 있는데 null"을 같은 것으로
 * 취급해야 한다 — 과거 revision·다른 클라이언트·향후 회귀가 명시적 null 을 보내는 경우까지 대비하는
 * 방어선이며, 속성 패널의 부분 지정(fontSize 만 등)이 정상 경로임을 소비측에서도 보장한다.
 */
function orUndefined<T>(value: T | null | undefined): T | undefined {
  return value === null ? undefined : value
}

function parseStyle(value: unknown): ElementStyle | DocumentTemplateParseError | undefined {
  if (value === undefined || value === null) return undefined
  if (!isRecord(value)) {
    return { code: 'INVALID_STYLE', message: '문서 요소 style은 객체여야 합니다.' }
  }
  const allowed = new Set(['fontSize', 'bold', 'align', 'border'])
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    return { code: 'INVALID_STYLE', message: '문서 요소 style에 허용되지 않은 속성이 있습니다.' }
  }
  const fontSize = orUndefined(value.fontSize as number | null | undefined)
  const bold = orUndefined(value.bold as boolean | null | undefined)
  const align = orUndefined(value.align as ElementStyle['align'] | null | undefined)
  const border = orUndefined(value.border as boolean | null | undefined)
  if (fontSize !== undefined
    && (typeof fontSize !== 'number' || !Number.isFinite(fontSize) || fontSize <= 0 || fontSize > MAX_FONT_SIZE)) {
    return { code: 'INVALID_STYLE', message: '문서 요소 style의 글꼴 크기가 유효하지 않습니다.' }
  }
  if (bold !== undefined && typeof bold !== 'boolean') {
    return { code: 'INVALID_STYLE', message: '문서 요소 style의 굵기 값이 유효하지 않습니다.' }
  }
  if (align !== undefined && align !== 'left' && align !== 'center' && align !== 'right') {
    return { code: 'INVALID_STYLE', message: '문서 요소 style의 정렬 값이 유효하지 않습니다.' }
  }
  if (border !== undefined && typeof border !== 'boolean') {
    return { code: 'INVALID_STYLE', message: '문서 요소 style의 테두리 값이 유효하지 않습니다.' }
  }
  return {
    ...(fontSize === undefined ? {} : { fontSize }),
    ...(bold === undefined ? {} : { bold }),
    ...(align === undefined ? {} : { align }),
    ...(border === undefined ? {} : { border }),
  }
}

function parseBinding(value: unknown): BindingRef | DocumentTemplateParseError {
  if (value === 'header.title' || value === 'header.docNo' || value === 'header.issueDate' || value === 'closing.note') {
    return value
  }
  if (typeof value === 'string' && /^body\.fieldRow\[[A-Za-z0-9_.-]{1,100}\]$/.test(value)) {
    return value as BindingRef
  }
  return { code: 'INVALID_BINDING', message: '허용되지 않은 문서 요소 binding입니다.' }
}

function isParseError(value: unknown): value is DocumentTemplateParseError {
  return isRecord(value) && typeof value.code === 'string' && typeof value.message === 'string'
}

function parseElement(value: unknown, schemaVersion: SchemaVersion): DocElement | DocumentTemplateParseError {
  if (!isRecord(value) || !isNonEmptyString(value.key) || typeof value.type !== 'string') {
    return { code: 'INVALID_ELEMENT', message: '문서 요소는 비어 있지 않은 key와 type을 가져야 합니다.' }
  }
  if (!(V2_ELEMENT_TYPES as readonly string[]).includes(value.type)) {
    return { code: 'INVALID_ELEMENT', message: `지원하지 않는 문서 요소 type입니다: ${value.type}` }
  }
  if (schemaVersion === 1 && !(LEGACY_ELEMENT_TYPES as readonly string[]).includes(value.type)) {
    return { code: 'INVALID_ELEMENT', message: `schema v1에서 지원하지 않는 문서 요소 type입니다: ${value.type}` }
  }
  if ((LEGACY_ELEMENT_TYPES as readonly string[]).includes(value.type)) {
    return { key: value.key, type: value.type as LegacyElementType }
  }
  const geometry = parseGeometry(value.geometry)
  if (isParseError(geometry)) return geometry
  const style = parseStyle(value.style)
  if (isParseError(style)) return style
  if (value.type === 'FIELD') {
    const binding = parseBinding(value.binding)
    if (isParseError(binding)) return binding
    return {
      key: value.key,
      type: 'FIELD',
      binding,
      ...(geometry === undefined ? {} : { geometry }),
      ...(style === undefined ? {} : { style }),
    }
  }
  if (typeof value.text !== 'string' || value.text.trim().length === 0) {
    return { code: 'INVALID_ELEMENT', message: 'TEXT 요소의 문구는 비어 있지 않아야 합니다.' }
  }
  if (value.text.length > MAX_TEXT_LENGTH) {
    return { code: 'INVALID_ELEMENT', message: `TEXT 요소의 문구는 ${MAX_TEXT_LENGTH}자 이하여야 합니다.` }
  }
  return {
    key: value.key,
    type: 'TEXT',
    text: value.text,
    ...(geometry === undefined ? {} : { geometry }),
    ...(style === undefined ? {} : { style }),
  }
}

function parseEnvelope(value: Record<string, unknown>, schemaVersion: SchemaVersion): DocumentTemplateParseResult {
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

  if (value.document.paper !== 'A4_PORTRAIT') return failure('INVALID_PAPER', '지원하지 않는 문서 양식 용지입니다.')
  if (!Array.isArray(value.document.bands)) return failure('INVALID_BAND', '문서 양식 bands가 배열이 아닙니다.')
  if (value.document.bands.length > MAX_BANDS) return failure('INVALID_BAND', '문서 양식 bands는 32개 이하여야 합니다.')

  const keys = new Set<string>()
  const bands: Band[] = []
  const counts: Partial<Record<LegacyElementType | 'FIELD' | 'TEXT', number>> = {}
  for (const bandValue of value.document.bands) {
    if (!isRecord(bandValue)
      || !isNonEmptyString(bandValue.key)
      || (bandValue.kind !== 'HEADER' && bandValue.kind !== 'BODY' && bandValue.kind !== 'FOOTER')
      || !Array.isArray(bandValue.elements)) {
      return failure('INVALID_BAND', '문서 양식 band가 유효하지 않습니다.')
    }
    if (bandValue.elements.length > MAX_ELEMENTS_PER_BAND) return failure('INVALID_ELEMENT', '문서 양식 band의 elements는 64개 이하여야 합니다.')
    if (keys.has(bandValue.key)) return failure('DUPLICATE_KEY', `중복된 문서 양식 key입니다: ${bandValue.key}`)
    keys.add(bandValue.key)

    const elements: DocElement[] = []
    for (const elementValue of bandValue.elements) {
      const parsed = parseElement(elementValue, schemaVersion)
      if (isParseError(parsed)) return failure(parsed.code, parsed.message)
      if (keys.has(parsed.key)) return failure('DUPLICATE_KEY', `중복된 문서 양식 key입니다: ${parsed.key}`)
      if (parsed.type in ALLOWED_BANDS && ALLOWED_BANDS[parsed.type as LegacyElementType] !== bandValue.kind) {
        return failure('INVALID_BAND_PLACEMENT', `${parsed.type} 요소는 ${ALLOWED_BANDS[parsed.type as LegacyElementType]} band에 있어야 합니다.`)
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
  for (const type of ['META_ROWS', 'CONTENT_PARAGRAPHS', 'FIELD_TABLE', 'ATTACHMENT_TABLE'] as const) {
    if ((counts[type] ?? 0) > 1) return failure('INVALID_ELEMENT_COUNT', `${type} 요소는 최대 하나만 허용됩니다.`)
  }

  return {
    ok: true,
    value: {
      schemaVersion,
      ...(value.id === undefined ? {} : { id: value.id as string }),
      ...(value.status === undefined ? {} : { status: value.status as TemplateStatus }),
      revision: value.revision as number,
      docType: value.docType,
      name: value.name,
      document: { paper: 'A4_PORTRAIT', bands },
    },
  }
}

/** 알 수 없는 입력을 검증된 결재 문서 템플릿으로 변환한다. */
export function parseDocumentTemplate(value: unknown): DocumentTemplateParseResult {
  if (!isRecord(value)) return failure('INVALID_ENVELOPE', '문서 양식 envelope가 아닙니다.')
  if (!isSupportedSchemaVersion(value.schemaVersion)) return failure('UNKNOWN_VERSION', '지원하지 않는 문서 양식 schemaVersion입니다.')
  return parseEnvelope(value, value.schemaVersion)
}

/** v1 문서를 v2 envelope로 올린다. 문서 내용에는 어떤 필드도 추가하지 않는다. */
export function upcastDocumentTemplate(value: unknown, fromVersion: number): TemplateEnvelope {
  if (fromVersion === 2) {
    const parsed = parseDocumentTemplate(value)
    if (!parsed.ok) throw new Error(parsed.error.message)
    return parsed.value
  }
  if (fromVersion !== 1) throw new Error(`지원하지 않는 문서 양식 버전입니다: ${fromVersion}`)
  const parsed = parseDocumentTemplate(value)
  if (!parsed.ok) throw new Error(parsed.error.message)
  if (parsed.value.schemaVersion !== 1) throw new Error('v1 문서 양식 schemaVersion이 아닙니다.')
  return { ...parsed.value, schemaVersion: 2 }
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

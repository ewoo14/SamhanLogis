/**
 * 결재 문서 양식의 영속 경계와 런타임 parser.
 *
 * schemaVersion은 envelope 컬럼이 권위이며, v1 원문과 v2 편집 문서를 각각
 * 검증한다. v1 pin을 v2로 다시 저장하지 않고, 필요한 경우 렌더 직전에만
 * 메모리에서 v2 envelope로 올린다.
 */
import type { PaperSize } from './PrintLayout'
import {
  normalizeTemplateAuthoringMode,
  type TemplateAuthoringMode,
} from './templateAuthoringMode'

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

export const DETAIL_COLUMN_KEYS = [
  'productName',
  'modelName',
  'specification',
  'quantity',
  'supplyAmount',
  'vatAmount',
  'lineTotal',
  'note',
] as const

/** 기본 결재 fallback 품목 밴드의 legacy 8열 계약(구성·순서 고정). */
export const LEGACY_FALLBACK_DETAIL_COLUMNS = [
  'productName',
  'modelName',
  'specification',
  'quantity',
  'supplyAmount',
  'vatAmount',
  'lineTotal',
  'note',
] as const

export type DetailColumnKey = (typeof DETAIL_COLUMN_KEYS)[number]

export const DETAIL_COLUMN_LABEL: Record<DetailColumnKey, string> = {
  productName: '품목',
  modelName: '모델명',
  specification: '규격',
  quantity: '수량',
  supplyAmount: '공급가액',
  vatAmount: '부가세',
  lineTotal: '합계',
  note: '비고',
}

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

export type DetailElement = {
  key: string
  type: 'DETAIL'
  repeatBinding: 'body.lineItems'
  columns: DetailColumnKey[]
  geometry?: Geometry
  style?: ElementStyle
}

export type ImageElement = {
  key: string
  type: 'IMAGE'
  src: string
  alt: string
  geometry?: Geometry
  style?: ElementStyle
}

export interface UndecodableImageInfo {
  key: string
  alt: string
  src: string
  bandKind: BandKind
}

export type DocElement = LegacyDocElement | FieldElement | TextElement | DetailElement | ImageElement
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
  DETAIL: '품목행',
  IMAGE: '이미지/로고',
}

/**
 * H10(R5) — BE 활성화 게이트(`DocumentTemplateService.ADVANCED_ACTIVATION_GATE_ENABLED` +
 * `DocumentPayloadValidator.containsActivationBlockedElements`)가 막는 요소 타입.
 *
 * 게이트 자체는 개발책임자 결정으로 존치한다(자동 업데이트 선행 전까지 DETAIL/IMAGE 포함 양식은
 * 활성화 불가) — 여기서는 게이트를 우회/약화하지 않고, FE 가 "이 요소를 넣으면 활성화가 막힌다"를
 * 사용자에게 되돌리기 어려운 상태(사용 중 양식을 내림)에 들어가기 **전에** 알리는 데만 쓴다.
 * BE 목록과 나란히 유지해야 한다 — 이 파일 밖(Java)의 authoritative 목록이 바뀌면 이 상수도 갱신할 것.
 */
export const ACTIVATION_BLOCKED_ELEMENT_TYPES: ReadonlySet<DocElement['type']> = new Set(['DETAIL', 'IMAGE'])

export function hasActivationBlockedElements(document: Pick<DocumentPayload, 'bands'>): boolean {
  return document.bands.some((band) => band.elements.some((element) => ACTIVATION_BLOCKED_ELEMENT_TYPES.has(element.type)))
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
  /** document JSONB 내부 저작 방식. legacy 양식은 parser가 WORD로 해석한다. */
  mode?: TemplateAuthoringMode
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
  | 'INVALID_IMAGE_SOURCE'
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

const V2_ELEMENT_TYPES = [...LEGACY_ELEMENT_TYPES, 'FIELD', 'TEXT', 'DETAIL', 'IMAGE'] as const
export const MAX_REQUEST_BYTES = 64 * 1024
const MAX_DEPTH = 16
const MAX_BANDS = 32
const MAX_ELEMENTS_PER_BAND = 64
const MAX_KEY_LENGTH = 100
const MAX_DOC_TYPE_LENGTH = 70
const MAX_FONT_SIZE = 200
/** M-A: BE `DocumentPayloadValidator.MAX_TEXT_LENGTH` 와 동일해야 한다(과거 FE 65,536 vs BE 4,096
 * 불일치 — FE 가 통과시킨 요청이 BE 에서 "비어 있지 않은 문자열이어야 합니다"로 거부되어 실제 원인
 * (길이 초과)을 사용자가 알 수 없었다). R5(#914) P-5 입력 카운터와 파서 검증이 함께 사용한다. */
export const MAX_TEXT_LENGTH = 4_096
/** R5(#914) P-5: ElementInspector IMAGE 대체 문구 입력 카운터와 파서 검증이 함께 사용한다. */
export const MAX_ALT_LENGTH = 200
export const MAX_IMAGE_BYTES = 50 * 1024
export type ImageSourceMime = 'png' | 'jpeg' | 'webp'

const IMAGE_SOURCE_PLACEHOLDERS: Record<ImageSourceMime, string> = {
  png: 'data:image/png;base64,',
  jpeg: 'data:image/jpeg;base64,',
  webp: 'data:image/webp;base64,',
}

function imageDataUrlByteLength(value: string): number {
  const base64 = value.split(',')[1] ?? ''
  return Math.max(0, Math.floor((base64.length * 3) / 4) - (base64.match(/=+$/)?.[0].length ?? 0))
}

function hasImageSignature(mime: string, base64: string): boolean {
  try {
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
    if (mime === 'png') {
      return bytes.length >= 8
        && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47
        && bytes[4] === 0x0D && bytes[5] === 0x0A && bytes[6] === 0x1A && bytes[7] === 0x0A
    }
    if (mime === 'jpeg') {
      return bytes.length >= 3 && bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF
    }
    return mime === 'webp' && bytes.length >= 12
      && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
      && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  } catch {
    return false
  }
}

/** 문서 JSON 상한을 함께 고려한 이미지 파일 선택기의 실제 decoded 상한. */
export function maxImageBytesForDocument(
  document: DocumentPayload,
  imageKey: string,
  imageMime: ImageSourceMime = 'jpeg',
): number {
  const imageExists = document.bands.some((band) => band.elements.some((element) => element.key === imageKey && element.type === 'IMAGE'))
  if (!imageExists) return 0
  // JPEG/WebP 접두사가 PNG보다 1자 길다. 기본값은 가장 긴 접두사를 사용해 선택 전 안내가
  // 세 허용 형식 모두의 안전한 상한을 약속하게 한다. 파일 선택 후에는 실제 MIME을 전달해
  // 기존 PNG 상한을 불필요하게 줄이지 않는다.
  const placeholder = IMAGE_SOURCE_PLACEHOLDERS[imageMime]
  const withoutImageData: DocumentPayload = {
    ...document,
    bands: document.bands.map((band) => ({
      ...band,
      elements: band.elements.map((element) => element.key === imageKey && element.type === 'IMAGE'
        ? { ...element, src: placeholder }
        : element),
    })),
  }
  const baseBytes = new TextEncoder().encode(JSON.stringify(withoutImageData)).byteLength
  const remainingEncodedCharacters = Math.max(0, MAX_REQUEST_BYTES - baseBytes)
  const decodedByEnvelope = Math.floor(remainingEncodedCharacters / 4) * 3
  return Math.min(MAX_IMAGE_BYTES, decodedByEnvelope)
}

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
  if (typeof value === 'string' && /^body\.fieldRow\[[^\[\]]{1,100}\]$/.test(value)) {
    return value as BindingRef
  }
  return { code: 'INVALID_BINDING', message: '허용되지 않은 문서 요소 binding입니다.' }
}

function isDetailColumnKey(value: unknown): value is DetailColumnKey {
  return typeof value === 'string' && (DETAIL_COLUMN_KEYS as readonly string[]).includes(value)
}

function parseDetailColumns(value: unknown): DetailColumnKey[] | DocumentTemplateParseError {
  if (!Array.isArray(value) || value.length === 0 || value.length > DETAIL_COLUMN_KEYS.length) {
    return { code: 'INVALID_ELEMENT', message: 'DETAIL 요소 columns는 1개 이상 8개 이하여야 합니다.' }
  }
  const columns: DetailColumnKey[] = []
  for (const column of value) {
    if (!isDetailColumnKey(column) || columns.includes(column)) {
      return { code: 'INVALID_ELEMENT', message: 'DETAIL 요소 columns에 허용되지 않은 열 또는 중복 열이 있습니다.' }
    }
    columns.push(column)
  }
  return columns
}

function parseImageSource(value: unknown): string | DocumentTemplateParseError {
  if (value === '/print-logo.svg') return value
  if (typeof value !== 'string') {
    return { code: 'INVALID_IMAGE_SOURCE', message: 'IMAGE 요소 src가 유효하지 않습니다.' }
  }
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value)
  if (!match) {
    return { code: 'INVALID_IMAGE_SOURCE', message: 'IMAGE 요소는 PNG/JPEG/WebP data URL 또는 기본 로고만 허용합니다.' }
  }
  const base64 = match[2] ?? ''
  const bytes = imageDataUrlByteLength(value)
  if (bytes <= 0 || bytes > MAX_IMAGE_BYTES || !hasImageSignature(match[1]!, base64)) {
    return { code: 'INVALID_IMAGE_SOURCE', message: 'IMAGE 요소는 허용된 PNG/JPEG/WebP data URL이고 50KB 이하여야 합니다.' }
  }
  return value
}

/** 파일 크기 제한과 분리된 형식·signature 판정. 큰 지원 형식은 용량 사유를 유지해야 한다. */
export function isAllowedImageSourceFormat(value: unknown): value is string {
  if (value === '/print-logo.svg') return true
  if (typeof value !== 'string') return false
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value)
  if (!match) return false
  const base64 = match[2] ?? ''
  return imageDataUrlByteLength(value) > 0 && hasImageSignature(match[1]!, base64)
}

/** renderer가 parser와 같은 source allowlist를 적용하는 방어선. */
export function isAllowedImageSource(value: unknown): value is string {
  return !isParseError(parseImageSource(value))
}

export const IMAGE_DECODE_ERROR_MESSAGE = '이 이미지는 현재 화면에서 표시할 수 없어 저장할 수 없습니다. 이미지를 바꾼 뒤 다시 저장하세요.'

export class ImageSourceDecodeError extends Error {
  readonly issues: readonly UndecodableImageInfo[]

  constructor(issues: readonly UndecodableImageInfo[] = []) {
    const detail = issues.length > 0
      ? ` 저장할 수 없는 이미지: ${issues.map((issue) => `${BAND_KIND_LABEL[issue.bandKind]} · ${issue.alt || '대체 문구 없음'} (${issue.key})`).join(', ')}.`
      : ''
    super(`${IMAGE_DECODE_ERROR_MESSAGE}${detail}`)
    this.issues = issues
    this.name = 'ImageSourceDecodeError'
  }
}

/**
 * 실제 renderer와 같은 브라우저 {@link HTMLImageElement#decode} 경로로 source를 확인한다.
 * createImageBitmap처럼 별도 픽셀 버퍼를 요구하는 API는 사용하지 않는다.
 */
export async function canDecodeImageSource(value: string): Promise<boolean> {
  if (value === '/print-logo.svg') return true
  if (!isAllowedImageSource(value) || typeof Image === 'undefined') return false
  const image = new Image()
  image.src = value
  try {
    await image.decode()
    return true
  } catch {
    return false
  }
}

/** 저장 직전에 모든 IMAGE source를 실제 renderer의 디코드 경로로 재확인하고 사용자 식별 정보를 보존한다. */
export async function findUndecodableImages(document: DocumentPayload): Promise<UndecodableImageInfo[]> {
  const issues: UndecodableImageInfo[] = []
  for (const band of document.bands) {
    for (const element of band.elements) {
      if (element.type !== 'IMAGE') continue
      if (!(await canDecodeImageSource(element.src))) {
        issues.push({ key: element.key, alt: element.alt, src: element.src, bandKind: band.kind })
      }
    }
  }
  return issues
}

/** 기존 단일 source 소비자를 위한 하위 호환 helper. 새 저장 UI는 findUndecodableImages를 사용한다. */
export async function findUndecodableImageSource(document: DocumentPayload): Promise<string | null> {
  const first = (await findUndecodableImages(document))[0]
  return first?.src ?? null
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
    return { code: 'INVALID_ELEMENT', message: `이전 버전에서 지원하지 않는 문서 요소 type입니다: ${value.type}` }
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
  if (value.type === 'DETAIL') {
    if (value.repeatBinding !== 'body.lineItems') {
      return { code: 'INVALID_BINDING', message: 'DETAIL 요소 repeatBinding이 허용 목록에 없습니다.' }
    }
    const columns = parseDetailColumns(value.columns)
    if (isParseError(columns)) return columns
    return {
      key: value.key,
      type: 'DETAIL',
      repeatBinding: 'body.lineItems',
      columns,
      ...(geometry === undefined ? {} : { geometry }),
      ...(style === undefined ? {} : { style }),
    }
  }
  if (value.type === 'IMAGE') {
    const src = parseImageSource(value.src)
    if (isParseError(src)) return src
    // R3(#914) 발견2 계열 sweep: name과 동일한 isNonEmptyString(value, max) 패턴이 "비어 있음"과
    // "201자(상한 초과)"를 하나의 메시지로 묶었다(P-3 위반) — 두 원인을 분리한다.
    if (typeof value.alt !== 'string' || value.alt.trim().length === 0) {
      return { code: 'INVALID_ELEMENT', message: 'IMAGE 요소 alt는 비어 있지 않은 문자열이어야 합니다.' }
    }
    if (value.alt.length > MAX_ALT_LENGTH) {
      return { code: 'INVALID_ELEMENT', message: `IMAGE 요소 alt는 ${MAX_ALT_LENGTH}자 이하여야 합니다.` }
    }
    return {
      key: value.key,
      type: 'IMAGE',
      src,
      alt: value.alt,
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
  if ('id' in value && value.id !== undefined && !isNonEmptyString(value.id)) {
    return failure('INVALID_ENVELOPE', '문서 양식 식별자를 확인하세요.')
  }
  if ('status' in value && value.status !== undefined && value.status !== 'DRAFT' && value.status !== 'ACTIVE') {
    return failure('INVALID_ENVELOPE', '문서 양식 상태를 확인하세요.')
  }
  if (!Number.isInteger(value.revision) || (value.revision as number) < 0) {
    return failure('INVALID_ENVELOPE', '문서 양식 버전 정보를 확인하세요.')
  }
  if (!isNonEmptyString(value.docType, MAX_DOC_TYPE_LENGTH)) {
    return failure('INVALID_ENVELOPE', '문서 유형을 선택해야 저장할 수 있습니다.')
  }
  // R3(#914) 발견2: isNonEmptyString(value.name, 100)이 "비어 있음"과 "101자(상한 초과)"를 같은
  // 진단으로 묶어, 100자를 채운 입력칸 앞에서도 "입력해야"라는(이미 입력했는데 틀린) 지시가 나왔다
  // (P-3). 두 원인을 분리하고 too-long 쪽에만 한계값을 보여준다(빈 값 메시지는 기존 문구를 유지 —
  // templateSchema.test.ts 의 envelope it.each 계약).
  if (typeof value.name !== 'string' || value.name.trim().length === 0) {
    return failure('INVALID_ENVELOPE', '양식명을 입력해야 저장할 수 있습니다.')
  }
  if (value.name.length > MAX_KEY_LENGTH) {
    return failure('INVALID_ENVELOPE', `양식명은 ${MAX_KEY_LENGTH}자 이하여야 합니다.`)
  }
  if (!isRecord(value.document)) {
    return failure('INVALID_ENVELOPE', '문서 양식 내용을 확인하세요.')
  }

  let serialized: string
  try {
    serialized = JSON.stringify(value.document)
  } catch {
    return failure('INVALID_ENVELOPE', '문서 양식 내용을 저장할 수 없습니다.')
  }
  const bytes = serialized === undefined ? 0 : new TextEncoder().encode(serialized).byteLength
  if (bytes > MAX_REQUEST_BYTES || depthOf(value.document) > MAX_DEPTH) {
    return failure('INVALID_ENVELOPE', '문서 양식 내용이 너무 큽니다.')
  }

  if (value.document.paper !== 'A4_PORTRAIT') return failure('INVALID_PAPER', '지원하지 않는 문서 양식 용지입니다.')
  if (!Array.isArray(value.document.bands)) return failure('INVALID_BAND', '문서 양식 bands가 배열이 아닙니다.')
  if (value.document.bands.length > MAX_BANDS) return failure('INVALID_BAND', '문서 양식 bands는 32개 이하여야 합니다.')

  const keys = new Set<string>()
  const bands: Band[] = []
  const counts: Partial<Record<LegacyElementType | 'FIELD' | 'TEXT' | 'DETAIL' | 'IMAGE', number>> = {}
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
      if (parsed.type === 'DETAIL' && bandValue.kind !== 'BODY') {
        return failure('INVALID_BAND_PLACEMENT', 'DETAIL 요소는 BODY band에 있어야 합니다.')
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
  if ((counts.DETAIL ?? 0) > 1) return failure('INVALID_ELEMENT_COUNT', 'DETAIL 요소는 최대 하나만 허용됩니다.')

  const document: DocumentPayload = { paper: 'A4_PORTRAIT', bands }
  // legacy document의 원문 JSON에는 mode를 소급 추가하지 않는다. 다만 런타임에는
  // normalize 결과를 읽을 수 있어야 하므로, 누락 mode만 non-enumerable로 붙인다.
  // 명시된 EXCEL/미지 값은 저장 계약에 맞춰 enumerable WORD/EXCEL로 유지한다.
  Object.defineProperty(document, 'mode', {
    value: normalizeTemplateAuthoringMode(value.document.mode),
    enumerable: value.document.mode !== undefined,
    configurable: true,
    writable: true,
  })

  return {
    ok: true,
    value: {
      schemaVersion,
      ...(value.id === undefined ? {} : { id: value.id as string }),
      ...(value.status === undefined ? {} : { status: value.status as TemplateStatus }),
      revision: value.revision as number,
      docType: value.docType,
      name: value.name,
      document,
    },
  }
}

/** 알 수 없는 입력을 검증된 결재 문서 템플릿으로 변환한다. */
export function parseDocumentTemplate(value: unknown): DocumentTemplateParseResult {
  if (!isRecord(value)) return failure('INVALID_ENVELOPE', '문서 양식 데이터를 확인할 수 없습니다.')
  if (!isSupportedSchemaVersion(value.schemaVersion)) return failure('UNKNOWN_VERSION', '지원하지 않는 문서 양식 버전입니다.')
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
  if (parsed.value.schemaVersion !== 1) throw new Error('이전 버전 문서 양식이 아닙니다.')
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

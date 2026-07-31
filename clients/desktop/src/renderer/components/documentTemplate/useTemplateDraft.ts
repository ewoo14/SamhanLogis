import { useCallback, useEffect, useMemo, useState } from 'react'

import { GROUPWARE_DEFAULT } from '../../print/approvalDefaultTemplate'
import { normalizeTemplateAuthoringMode } from '../../print/templateAuthoringMode'
import {
  ELEMENT_TYPE_LABEL,
  parseDocumentTemplate,
  upcastDocumentTemplate,
  type BindingRef,
  type BandKind,
  type DocElement,
  type DocumentPayload,
  type DocumentTemplateParseError,
  type ElementStyle,
  type Geometry,
  type TemplateEnvelope,
} from '../../print/templateSchema'

export type EditableElementType =
  | 'FIELD'
  | 'TEXT'
  | 'APPROVAL_GRID'
  | 'META_ROWS'
  | 'CONTENT_PARAGRAPHS'
  | 'FIELD_TABLE'
  | 'ATTACHMENT_TABLE'
  | 'DETAIL'
  | 'IMAGE'

/** H-F: 팔레트에서 추가 가능한 요소 전부(삭제 가능한 레거시 4종 포함 — 삭제된 요소를 다시 추가할 수
 * 있어야 한다). 밴드당 최대 1개(검증기 singleton 규칙과 동일). */
const SINGLETON_ELEMENT_TYPES = new Set<EditableElementType>([
  'APPROVAL_GRID', 'META_ROWS', 'CONTENT_PARAGRAPHS', 'FIELD_TABLE', 'ATTACHMENT_TABLE', 'DETAIL',
])

function bandKindForType(type: EditableElementType): 'HEADER' | 'BODY' {
  switch (type) {
    case 'APPROVAL_GRID':
    case 'META_ROWS':
      return 'HEADER'
    case 'IMAGE':
      return 'HEADER'
    default:
      return 'BODY'
  }
}

export interface TemplateDraftState {
  schemaVersion: 2
  revision: number
  id?: string
  status?: 'DRAFT' | 'ACTIVE'
  docType: string
  name: string
  document: DocumentPayload
}

export function createUniqueElementKey(type: string, existingKeys: Set<string>): string {
  const base = type.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'element'
  let index = 1
  let candidate = `${base}-${index}`
  while (existingKeys.has(candidate)) {
    index += 1
    candidate = `${base}-${index}`
  }
  return candidate
}

function toDraft(template: TemplateEnvelope | null | undefined): TemplateDraftState {
  const source = template ?? GROUPWARE_DEFAULT
  const v2 = source.schemaVersion === 1 ? upcastDocumentTemplate(source, 1) : source
  const document: DocumentPayload = {
    paper: v2.document.paper,
    bands: v2.document.bands.map((band) => ({
      ...band,
      elements: band.elements.map((element) => ({ ...element })),
    })),
  }
  Object.defineProperty(document, 'mode', {
    value: normalizeTemplateAuthoringMode(v2.document.mode),
    enumerable: Object.prototype.propertyIsEnumerable.call(v2.document, 'mode'),
    configurable: true,
    writable: true,
  })

  return {
    ...v2,
    schemaVersion: 2,
    docType: template ? v2.docType : '',
    document,
  }
}

function allKeys(document: DocumentPayload): Set<string> {
  return new Set(document.bands.flatMap((band) => [band.key, ...band.elements.map((element) => element.key)]))
}

/**
 * R3(#914) 발견1 — 직전 라운드가 "name을 또 특수처리하면 반복"이라는 지적에 클래스(코드) 단위로
 * 대응했지만, 그 클래스 전체를 코드당 문구 1개로 뭉개면서 파서가 이미 만들어 둔 한계값·형식 정보를
 * 같이 버렸다(TEXT 4096자·IMAGE PNG/JPEG/WebP+50KB가 전부 "설정을 확인하세요"로 붕괴 — P-1/P-3 위반).
 *
 * INVALID_ELEMENT/INVALID_IMAGE_SOURCE 는 원문 그대로 노출해도 안전하다 — 두 코드의 모든 메시지를
 * templateSchema.ts 에서 직접 감사했다: envelope|payload|schema|parse 를 포함하지 않고(F-8),
 * TEXT/IMAGE 처럼 이미 이 화면의 라벨(ELEMENT_TYPE_LABEL)에 쓰이는 이름만 등장한다. 나머지 코드는
 * (a) 사용자가 편집기로는 만들 수 없는 구조적 상태(밴드 배치·요소 개수·중복 key 등 — 팔레트/좌표
 * select가 애초에 그 값을 못 만든다)이거나 (b) 원문에도 한계값이 없어 제네릭 문구로도 정보 손실이
 * 없다(geometry/style) — 이 두 부류만 코드 단위 제네릭 문구를 유지한다.
 */
function validationMessage(error: DocumentTemplateParseError): string {
  switch (error.code) {
    case 'INVALID_ENVELOPE':
    case 'UNKNOWN_VERSION':
    case 'INVALID_ELEMENT':
    case 'INVALID_IMAGE_SOURCE':
      return error.message
    case 'INVALID_PAPER':
      return '문서 양식 용지를 확인하세요.'
    case 'INVALID_BAND':
      return '문서 양식 영역 구성을 확인하세요.'
    case 'INVALID_GEOMETRY':
      return '요소의 위치와 크기를 확인하세요.'
    case 'INVALID_STYLE':
      return '요소의 글꼴·정렬·테두리 설정을 확인하세요.'
    case 'INVALID_BINDING':
      return '본문 필드 연결을 확인하세요.'
    case 'DUPLICATE_KEY':
      return '문서 요소가 중복되지 않도록 확인하세요.'
    case 'INVALID_BAND_PLACEMENT':
      return '요소를 올바른 영역에 배치하세요.'
    case 'INVALID_ELEMENT_COUNT':
      return '문서 양식의 필수 요소 구성을 확인하세요.'
  }
}

export function moveElementToBand(document: DocumentPayload, key: string, targetKind: BandKind): DocumentPayload {
  const sourceBand = document.bands.find((band) => band.elements.some((element) => element.key === key))
  const element = sourceBand?.elements.find((candidate) => candidate.key === key)
  if (!sourceBand || !element || sourceBand.kind === targetKind) return document
  return {
    ...document,
    bands: document.bands.map((band) => {
      if (band.kind === sourceBand.kind) {
        return { ...band, elements: band.elements.filter((candidate) => candidate.key !== key) }
      }
      if (band.kind === targetKind) {
        return { ...band, elements: [...band.elements, element] }
      }
      return band
    }),
  }
}

function defaultElement(type: EditableElementType, key: string): DocElement {
  switch (type) {
    case 'TEXT':
      return { key, type, text: '새 문구' }
    case 'FIELD':
      return { key, type, binding: 'header.docNo' }
    case 'APPROVAL_GRID':
    case 'META_ROWS':
    case 'CONTENT_PARAGRAPHS':
    case 'FIELD_TABLE':
    case 'ATTACHMENT_TABLE':
      return { key, type }
    case 'DETAIL':
      return {
        key,
        type,
        repeatBinding: 'body.lineItems',
        columns: ['productName', 'quantity', 'supplyAmount', 'vatAmount', 'lineTotal'],
        geometry: { x: 0, y: 0, w: 100, h: 40 },
      }
    case 'IMAGE':
      return {
        key,
        type,
        src: '/print-logo.svg',
        alt: '회사 로고',
        geometry: { x: 70, y: 0, w: 25, h: 15 },
      }
  }
}

export function useTemplateDraft(template?: TemplateEnvelope | null) {
  const [draft, setDraft] = useState<TemplateDraftState>(() => toDraft(template))
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify(toDraft(template)))
  // M-E: "이미 있음" no-op 을 조용히 무시하지 않고 사용자에게 알린다.
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!template) return
    const next = toDraft(template)
    setDraft(next)
    setSavedSnapshot(JSON.stringify(next))
    setSelectedKey(null)
  }, [template?.id, template?.revision])

  const updateDraft = useCallback((patch: Partial<Pick<TemplateDraftState, 'docType' | 'name'>>) => {
    setDraft((current) => ({ ...current, ...patch }))
  }, [])

  const addElement = useCallback((type: EditableElementType) => {
    setDraft((current) => {
      const alreadyPresent = SINGLETON_ELEMENT_TYPES.has(type)
        && current.document.bands.some((band) => band.elements.some((element) => element.type === type))
      if (alreadyPresent) {
        setNotice(`이미 ${ELEMENT_TYPE_LABEL[type]} 요소가 있어 추가하지 않았습니다.`)
        return current
      }
      const existingKeys = allKeys(current.document)
      const key = createUniqueElementKey(type, existingKeys)
      const bandKind = bandKindForType(type)
      const bands = current.document.bands.map((band) => band.kind === bandKind
        ? { ...band, elements: [...band.elements, defaultElement(type, key)] }
        : band)
      setNotice(null)
      setSelectedKey(key)
      return { ...current, document: { ...current.document, bands } }
    })
  }, [])

  /** M-J: 밴드 내 요소 순서 이동(위/아래 인접 swap). 밴드 경계를 넘지 않는다. */
  const moveElement = useCallback((key: string, direction: 'up' | 'down') => {
    setDraft((current) => ({
      ...current,
      document: {
        ...current.document,
        bands: current.document.bands.map((band) => {
          const index = band.elements.findIndex((element) => element.key === key)
          if (index === -1) return band
          const target = direction === 'up' ? index - 1 : index + 1
          if (target < 0 || target >= band.elements.length) return band
          const elements = [...band.elements]
          const swap = elements[index]!
          elements[index] = elements[target]!
          elements[target] = swap
          return { ...band, elements }
        }),
      },
    }))
  }, [])

  const moveElementBand = useCallback((key: string, targetKind: BandKind) => {
    setDraft((current) => ({ ...current, document: moveElementToBand(current.document, key, targetKind) }))
  }, [])

  const updateElement = useCallback((key: string, patch: Partial<DocElement>) => {
    setDraft((current) => ({
      ...current,
      document: {
        ...current.document,
        bands: current.document.bands.map((band) => ({
          ...band,
          elements: band.elements.map((element) => element.key === key
            ? { ...element, ...patch } as DocElement
            : element),
        })),
      },
    }))
  }, [])

  const removeElement = useCallback((key: string) => {
    setDraft((current) => ({
      ...current,
      document: {
        ...current.document,
        bands: current.document.bands.map((band) => ({
          ...band,
          elements: band.elements.filter((element) => element.key !== key),
        })),
      },
    }))
    setSelectedKey(null)
  }, [])

  const selectedElement = useMemo(() => draft.document.bands
    .flatMap((band) => band.elements)
    .find((element) => element.key === selectedKey) ?? null, [draft.document.bands, selectedKey])
  const dirty = JSON.stringify(draft) !== savedSnapshot
  const parseResult = parseDocumentTemplate(draft)

  const markSaved = useCallback((saved: TemplateEnvelope) => {
    const next = toDraft(saved)
    setDraft(next)
    setSavedSnapshot(JSON.stringify(next))
  }, [])

  return {
    draft,
    updateDraft,
    setDraft,
    addElement,
    moveElement,
    moveElementToBand: moveElementBand,
    updateElement,
    removeElement,
    selectedKey,
    setSelectedKey,
    selectedElement,
    dirty,
    valid: parseResult.ok,
    // H-C: 저장이 불가능한 상태의 이유를 화면에서 알 수 있어야 한다 — parser가 실패한 필드와
    // 사용자가 할 일을 함께 판별해 반환하므로 내부 검증 용어를 소비처에서 다시 해석하지 않는다.
    validationError: parseResult.ok
      ? null
      : validationMessage(parseResult.error),
    markSaved,
    notice,
    clearNotice: useCallback(() => setNotice(null), []),
  }
}

export type EditableFieldPatch = {
  binding?: BindingRef
  geometry?: Geometry
  style?: ElementStyle
  text?: string
}

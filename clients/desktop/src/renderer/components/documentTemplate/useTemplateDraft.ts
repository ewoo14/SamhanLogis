import { useCallback, useEffect, useMemo, useState } from 'react'

import { GROUPWARE_DEFAULT } from '../../print/approvalDefaultTemplate'
import {
  ELEMENT_TYPE_LABEL,
  parseDocumentTemplate,
  upcastDocumentTemplate,
  type BindingRef,
  type BandKind,
  type DocElement,
  type DocumentPayload,
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
  return {
    ...v2,
    schemaVersion: 2,
    document: {
      paper: v2.document.paper,
      bands: v2.document.bands.map((band) => ({
        ...band,
        elements: band.elements.map((element) => ({ ...element })),
      })),
    },
  }
}

function allKeys(document: DocumentPayload): Set<string> {
  return new Set(document.bands.flatMap((band) => [band.key, ...band.elements.map((element) => element.key)]))
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
    // H-C: 저장이 불가능한 상태의 이유를 화면에서 알 수 있어야 한다 — 종전에는 parseResult.error.message
    // 를 버리고 ok 여부만 노출해 저장 버튼이 이유 없이 비활성화됐다.
    validationError: parseResult.ok ? null : parseResult.error.message,
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

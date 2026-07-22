import { useCallback, useEffect, useMemo, useState } from 'react'

import { GROUPWARE_DEFAULT } from '../../print/approvalDefaultTemplate'
import {
  parseDocumentTemplate,
  upcastDocumentTemplate,
  type BindingRef,
  type DocElement,
  type DocumentPayload,
  type ElementStyle,
  type Geometry,
  type TemplateEnvelope,
} from '../../print/templateSchema'

export type EditableElementType = 'FIELD' | 'TEXT' | 'APPROVAL_GRID'

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

function defaultElement(type: EditableElementType, key: string): DocElement {
  switch (type) {
    case 'TEXT':
      return { key, type, text: '새 문구' }
    case 'FIELD':
      return { key, type, binding: 'header.docNo' }
    case 'APPROVAL_GRID':
      return { key, type }
  }
}

export function useTemplateDraft(template?: TemplateEnvelope | null) {
  const [draft, setDraft] = useState<TemplateDraftState>(() => toDraft(template))
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify(toDraft(template)))

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
      const existingKeys = allKeys(current.document)
      if (type === 'APPROVAL_GRID' && current.document.bands.some((band) =>
        band.elements.some((element) => element.type === 'APPROVAL_GRID'))) return current
      const key = createUniqueElementKey(type, existingKeys)
      const bandKind = type === 'APPROVAL_GRID' ? 'HEADER' : 'BODY'
      const bands = current.document.bands.map((band) => band.kind === bandKind
        ? { ...band, elements: [...band.elements, defaultElement(type, key)] }
        : band)
      setSelectedKey(key)
      return { ...current, document: { ...current.document, bands } }
    })
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
    updateElement,
    removeElement,
    selectedKey,
    setSelectedKey,
    selectedElement,
    dirty,
    valid: parseResult.ok,
    markSaved,
  }
}

export type EditableFieldPatch = {
  binding?: BindingRef
  geometry?: Geometry
  style?: ElementStyle
  text?: string
}

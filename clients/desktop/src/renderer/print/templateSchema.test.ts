import { describe, expect, it } from 'vitest'

import {
  DOCUMENT_TEMPLATE_SCHEMA_VERSION,
  parseDocumentTemplate,
  paperToPrintLayout,
  upcastDocumentTemplate,
} from './templateSchema'
import {
  GROUPWARE_DEFAULT,
  resolveApprovalDocumentTemplate,
} from './approvalDefaultTemplate'

const validTemplate = {
  schemaVersion: 1,
  revision: 3,
  docType: 'GROUPWARE_EXPENSE',
  name: '지출결의서 기본 양식',
  document: {
    paper: 'A4_PORTRAIT',
    bands: [
      {
        key: 'header',
        kind: 'HEADER',
        elements: [
          { key: 'title', type: 'TITLE' },
          { key: 'meta', type: 'META_ROWS' },
          { key: 'approval', type: 'APPROVAL_GRID' },
        ],
      },
      {
        key: 'body',
        kind: 'BODY',
        elements: [
          { key: 'content', type: 'CONTENT_PARAGRAPHS' },
          { key: 'fields', type: 'FIELD_TABLE' },
          { key: 'attachments', type: 'ATTACHMENT_TABLE' },
        ],
      },
      {
        key: 'footer',
        kind: 'FOOTER',
        elements: [{ key: 'closing', type: 'CLOSING' }],
      },
    ],
  },
} as const

describe('parseDocumentTemplate', () => {
  it.each([
    ['id', (input: Record<string, unknown>) => { input.id = 42 }, '문서 양식 식별자를 확인하세요.'],
    ['status', (input: Record<string, unknown>) => { input.status = 'BROKEN' }, '문서 양식 상태를 확인하세요.'],
    ['revision', (input: Record<string, unknown>) => { input.revision = -1 }, '문서 양식 버전 정보를 확인하세요.'],
    ['docType', (input: Record<string, unknown>) => { input.docType = '' }, '문서 유형을 선택해야 저장할 수 있습니다.'],
    ['name', (input: Record<string, unknown>) => { input.name = '' }, '양식명을 입력해야 저장할 수 있습니다.'],
    ['document', (input: Record<string, unknown>) => { input.document = null }, '문서 양식 내용을 확인하세요.'],
  ])('%s가 잘못되면 해당 필드를 고치라는 문구를 반환한다', (_field, mutate, message) => {
    const input = structuredClone(validTemplate) as Record<string, unknown>
    mutate(input)

    const result = parseDocumentTemplate(input)

    expect(result).toMatchObject({ ok: false, error: { message } })
    if (!result.ok) expect(result.error.message).not.toMatch(/envelope|payload|schema|parse/i)
  })

  // R2(#914) 발견2 RED — isNonEmptyString(value.name, 100)이 "비어 있음"과 "101자(상한 초과)"를 같은
  // 진단으로 묶는다(P-3 위반: 입력칸이 가득 찬 채로 "입력해야"라는 잘못된 지시). 100자 양성 대조 포함.
  it('R3 발견2 RED: name 101자는 빈 값과 다른 문구를 내고 한계값 100을 담는다(100자는 유효)', () => {
    const empty = structuredClone(validTemplate) as Record<string, unknown>
    empty.name = ''
    const emptyResult = parseDocumentTemplate(empty)
    expect(emptyResult).toMatchObject({ ok: false, error: { message: '양식명을 입력해야 저장할 수 있습니다.' } })

    const exact = structuredClone(validTemplate) as Record<string, unknown>
    exact.name = 'a'.repeat(100)
    expect(parseDocumentTemplate(exact).ok).toBe(true)

    const tooLong = structuredClone(validTemplate) as Record<string, unknown>
    tooLong.name = 'a'.repeat(101)
    const tooLongResult = parseDocumentTemplate(tooLong)
    expect(tooLongResult.ok).toBe(false)
    if (!tooLongResult.ok) {
      expect(tooLongResult.error.message).toContain('100')
      expect(tooLongResult.error.message).not.toBe('양식명을 입력해야 저장할 수 있습니다.')
      expect(tooLongResult.error.message).not.toMatch(/envelope|payload|schema|parse/i)
    }
  })

  // R2(#914) 발견2 계열 sweep — IMAGE alt도 isNonEmptyString(value.alt, 200)로 같은 패턴을 쓴다
  // (동일 결함 전수 grep, feedback_defect_family_sweep_fix.md). schemaVersion=2로 올려야 IMAGE가
  // 허용된다(v1은 레거시 타입만 허용).
  it('R3 발견2 계열 sweep RED: IMAGE alt 201자는 빈 값과 다른 문구를 내고 한계값 200을 담는다(200자는 유효)', () => {
    const withAlt = (alt: string) => {
      const input = structuredClone(validTemplate) as Record<string, unknown>
      input.schemaVersion = 2
      const document = input.document as { bands: Array<{ elements: unknown[] }> }
      document.bands[0]!.elements.push({ key: 'logo', type: 'IMAGE', src: '/print-logo.svg', alt })
      return input
    }

    const emptyResult = parseDocumentTemplate(withAlt(''))
    expect(emptyResult.ok).toBe(false)

    expect(parseDocumentTemplate(withAlt('a'.repeat(200))).ok).toBe(true)

    const tooLongResult = parseDocumentTemplate(withAlt('a'.repeat(201)))
    expect(tooLongResult.ok).toBe(false)
    if (!tooLongResult.ok && !emptyResult.ok) {
      expect(tooLongResult.error.message).toContain('200')
      expect(tooLongResult.error.message).not.toBe(emptyResult.error.message)
    }
  })

  it('허용된 discriminated union 요소를 파싱한다', () => {
    const result = parseDocumentTemplate(validTemplate)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.document.paper).toBe('A4_PORTRAIT')
      expect(result.value.document.bands[1]?.elements[0]).toEqual({
        key: 'content',
        type: 'CONTENT_PARAGRAPHS',
      })
    }
  })

  it.each([
    ['TITLE', 'BODY'],
    ['APPROVAL_GRID', 'FOOTER'],
    ['CLOSING', 'HEADER'],
    ['FIELD_TABLE', 'HEADER'],
  ])('%s를 허용되지 않은 %s band에 두면 거부한다', (type, kind) => {
    const input = structuredClone(validTemplate) as Record<string, unknown>
    const document = input.document as { bands: Array<{ kind: string; elements: Array<{ type: string }> }> }
    const band = document.bands.find((item) => item.elements.some((element) => element.type === type))!
    band.kind = kind

    const result = parseDocumentTemplate(input)

    expect(result.ok).toBe(false)
  })

  it('필수 요소 중복과 문서 key 중복을 거부한다', () => {
    const input = structuredClone(validTemplate) as Record<string, unknown>
    const document = input.document as { bands: Array<{ elements: Array<{ key: string; type: string }> }> }
    document.bands[0]!.elements.push({ key: 'title-2', type: 'TITLE' })
    document.bands[1]!.elements[0]!.key = 'title'

    expect(parseDocumentTemplate(input).ok).toBe(false)
  })

  it('미지원 schemaVersion과 element type을 거부한다', () => {
    const unknownVersion = { ...validTemplate, schemaVersion: 99 }
    const unknownElement = structuredClone(validTemplate) as Record<string, unknown>
    const document = unknownElement.document as { bands: Array<{ elements: Array<Record<string, string>> }> }
    document.bands[1]!.elements[0]!.type = 'UNKNOWN'

    expect(parseDocumentTemplate(unknownVersion).ok).toBe(false)
    expect(parseDocumentTemplate(unknownElement).ok).toBe(false)
  })

  it('순환 참조와 bigint JSON은 throw하지 않고 INVALID_ENVELOPE로 수렴한다', () => {
    const cyclic = structuredClone(validTemplate) as Record<string, any>
    cyclic.document.self = cyclic.document
    expect(parseDocumentTemplate(cyclic)).toMatchObject({ ok: false, error: { code: 'INVALID_ENVELOPE' } })

    const bigint = structuredClone(validTemplate) as Record<string, any>
    bigint.document.value = BigInt(1)
    expect(parseDocumentTemplate(bigint)).toMatchObject({ ok: false, error: { code: 'INVALID_ENVELOPE' } })
  })
})

describe('document template compatibility', () => {
  it('저작 방식은 document 안에서 EXCEL을 보존하고 누락·미지 값은 WORD로 읽는다', () => {
    const excel = structuredClone(validTemplate) as Record<string, any>
    excel.document.mode = 'EXCEL'
    const excelResult = parseDocumentTemplate(excel)
    expect(excelResult.ok).toBe(true)
    if (excelResult.ok) expect((excelResult.value.document as any).mode).toBe('EXCEL')

    const legacyResult = parseDocumentTemplate(validTemplate)
    expect(legacyResult.ok).toBe(true)
    if (legacyResult.ok) expect((legacyResult.value.document as any).mode).toBe('WORD')

    const unknown = structuredClone(validTemplate) as Record<string, any>
    unknown.document.mode = 'PDF'
    const unknownResult = parseDocumentTemplate(unknown)
    expect(unknownResult.ok).toBe(true)
    if (unknownResult.ok) expect((unknownResult.value.document as any).mode).toBe('WORD')
  })

  it('v1 mode가 있는 양식을 upcast해도 저작 방식을 보존한다', () => {
    const excel = structuredClone(validTemplate) as Record<string, any>
    excel.document.mode = 'EXCEL'
    const upcasted = upcastDocumentTemplate(excel, 1)

    expect(upcasted.schemaVersion).toBe(2)
    expect((upcasted.document as any).mode).toBe('EXCEL')
  })

  it('R1: 현재 schema v2에서도 v1 pin envelope를 원문 파서로 보존한다', () => {
    expect(DOCUMENT_TEMPLATE_SCHEMA_VERSION).toBe(2)

    const result = parseDocumentTemplate(validTemplate)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.schemaVersion).toBe(1)
      expect(result.value.document).toEqual(validTemplate.document)
    }
  })

  it('schema version 1을 upcast하고 다른 version은 명시적으로 거부한다', () => {
    expect(upcastDocumentTemplate(validTemplate, 1).schemaVersion).toBe(2)
    expect(() => upcastDocumentTemplate(validTemplate, 99)).toThrow('지원하지 않는 문서 양식 버전')
  })

  it('paper mapping은 A4 portrait만 지원한다', () => {
    expect(paperToPrintLayout('A4_PORTRAIT')).toBe('a4-portrait')
    expect(() => paperToPrintLayout('A4_LANDSCAPE' as never)).toThrow('지원하지 않는 용지')
  })
})

describe('approval default template', () => {
  it('기본 양식은 canonical GROUPWARE_DEFAULT 레이아웃이다', () => {
    expect(resolveApprovalDocumentTemplate(null)).toEqual(GROUPWARE_DEFAULT)
    expect(resolveApprovalDocumentTemplate(undefined)).toEqual(GROUPWARE_DEFAULT)
    expect(GROUPWARE_DEFAULT.document.bands.flatMap((band) => band.elements).map((element) => element.type)).toEqual([
      'TITLE',
      'META_ROWS',
      'APPROVAL_GRID',
      'CONTENT_PARAGRAPHS',
      'FIELD_TABLE',
      'ATTACHMENT_TABLE',
      'CLOSING',
    ])
  })

  it('활성 결재양식 code는 GROUPWARE docType으로 해석한다', () => {
    const resolved = resolveApprovalDocumentTemplate({
      id: 'template-id',
      code: 'TRAVEL',
      name: '출장 품의',
      description: null,
      active: true,
      displayOrder: 1,
      fields: [],
    })

    expect(resolved.docType).toBe('GROUPWARE_TRAVEL')
    expect(resolved.document).toEqual(GROUPWARE_DEFAULT.document)
  })
})

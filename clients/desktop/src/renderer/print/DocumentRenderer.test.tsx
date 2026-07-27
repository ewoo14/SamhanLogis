import { describe, expect, it } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom/server'
import { JSDOM } from 'jsdom'

import type { ApprovalLineAdminResponse, ApprovalStepView } from '../api/groupwareApproval'
import type { ApprovalAttachment } from '../api/groupwareApprovalAttachment'
import type { ApprovalTemplateField } from '../api/groupwareApprovalTemplate'
import { GROUPWARE_DEFAULT } from './approvalDefaultTemplate'
import { buildApprovalRenderModel, type FrozenApprovalDocInput } from './approvalRenderModel'
import { compileApprovalDocument, DocumentRenderer } from './DocumentRenderer'

function render(element: JSX.Element): string {
  return renderToStaticMarkup(<StaticRouter location="/">{element}</StaticRouter>)
}

function step(sequence: number, input: Partial<ApprovalStepView> = {}): ApprovalStepView {
  return {
    sequence,
    stepType: input.stepType ?? 'USER',
    approverGroupId: input.approverGroupId ?? null,
    approverId: 'approverId' in input ? input.approverId ?? null : `approver-${sequence}`,
    approverName: input.approverName ?? `결재자${sequence}`,
    status: input.status ?? 'APPROVED',
    decidedAt: input.decidedAt ?? `2026-07-${String(sequence).padStart(2, '0')}T10:00:00`,
    reason: null,
  }
}

function approval(input: Partial<ApprovalLineAdminResponse> = {}): ApprovalLineAdminResponse {
  return {
    approvalId: input.approvalId ?? 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    approvalNo: input.approvalNo ?? 'GW-DS1-001',
    requesterId: input.requesterId ?? 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    requesterName: input.requesterName ?? '작성자',
    title: input.title ?? 'DS-1 회귀 문서',
    content: 'content' in input ? input.content ?? null : '첫 문단\n\n둘째 문단',
    templateId: input.templateId ?? 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    templateName: null,
    documentType: null,
    fieldValues: input.fieldValues ?? { amount: '12000', memo: '검증' },
    status: input.status ?? 'APPROVED',
    steps: input.steps ?? [step(1), step(2)],
  }
}

function templateField(input: Partial<ApprovalTemplateField> & Pick<ApprovalTemplateField, 'fieldKey'>): ApprovalTemplateField {
  return {
    ...(input.id === undefined ? {} : { id: input.id }),
    fieldKey: input.fieldKey,
    label: input.label ?? input.fieldKey,
    fieldType: input.fieldType ?? 'TEXT',
    required: false,
    displayOrder: input.displayOrder ?? 1,
    options: [],
    placeholder: null,
  }
}

function attachment(input: Partial<ApprovalAttachment>): ApprovalAttachment {
  return {
    id: input.id ?? 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    attachmentType: input.attachmentType ?? 'FILE',
    label: input.label ?? null,
    displayOrder: input.displayOrder ?? 1,
    refSlipNo: input.refSlipNo ?? null,
    refSlipType: null,
    refPartnerCode: null,
    refPartnerName: input.refPartnerName ?? null,
    refPeriod: input.refPeriod ?? null,
    refDocType: null,
    refDocNo: input.refDocNo ?? null,
    refDocLabel: input.refDocLabel ?? null,
    fileName: input.fileName ?? '문서.pdf',
    contentType: null,
    fileSize: null,
    downloadUrl: null,
  }
}

function input(overrides: Partial<FrozenApprovalDocInput> = {}): FrozenApprovalDocInput {
  return {
    approval: approval(),
    templateFields: [
      templateField({ fieldKey: 'amount', label: '금액', fieldType: 'NUMBER', displayOrder: 1 }),
      templateField({ fieldKey: 'memo', label: '메모', displayOrder: 2 }),
    ],
    attachments: [attachment({ displayOrder: 2, label: '첨부' })],
    backTo: '/groupware/approvals/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    ...overrides,
  }
}

describe('buildApprovalRenderModel', () => {
  it('UUID와 내부 id 없이 projection slot을 만든다', () => {
    const templateFieldId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
    const approverGroupId = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
    const approverId = 'abababab-abab-4bab-8bab-abababababab'
    const model = buildApprovalRenderModel(input({
      approval: approval({
        steps: [
          step(1, { approverId }),
          step(2, { stepType: 'GROUP', approverGroupId, approverId: null }),
        ],
      }),
      templateFields: [
        templateField({
          id: templateFieldId,
          fieldKey: 'amount',
          label: '금액',
          fieldType: 'NUMBER',
          displayOrder: 1,
        }),
        templateField({ fieldKey: 'memo', label: '메모', displayOrder: 2 }),
      ],
    }))
    const serialized = JSON.stringify(model)

    expect(model.header).toEqual({
      title: 'DS-1 회귀 문서',
      docNo: 'GW-DS1-001',
      issueDate: '2026-07-02T10:00:00',
    })
    expect(model.body.fieldRows).toEqual([
      { key: 'amount', label: '금액', value: '12,000' },
      { key: 'memo', label: '메모', value: '검증' },
    ])
    expect(model.body.attachments).toEqual([
      { typeLabel: '파일', title: '첨부', detail: '' },
    ])
    // 모든 내부 id 는 투영 모델에 복사되지 않는다.
    expect(serialized).not.toContain('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') // approvalId
    expect(serialized).not.toContain('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') // requesterId
    expect(serialized).not.toContain('cccccccc-cccc-4ccc-8ccc-cccccccccccc') // templateId
    expect(serialized).not.toContain('dddddddd-dddd-4ddd-8ddd-dddddddddddd') // attachmentId
    expect(serialized).not.toContain(approverId) // ApprovalStepView.approverId
    expect(serialized).not.toContain(templateFieldId) // ApprovalTemplateField.id
    expect(serialized).not.toContain(approverGroupId) // ApprovalStepView.approverGroupId
  })

  it('NUMBER만 krw로 포맷하고 numeric TEXT는 원문을 보존한다', () => {
    const model = buildApprovalRenderModel(input({
      approval: approval({ fieldValues: { amount: 'bad-number', code: '1234' } }),
      templateFields: [
        templateField({ fieldKey: 'amount', label: '금액', fieldType: 'NUMBER', displayOrder: 1 }),
        templateField({ fieldKey: 'code', label: '코드', fieldType: 'TEXT', displayOrder: 2 }),
      ],
    }))

    expect(model.body.fieldRows).toEqual([
      { key: 'amount', label: '금액', value: 'bad-number' },
      { key: 'code', label: '코드', value: '1234' },
    ])
  })
})

describe('compileApprovalDocument and DocumentRenderer', () => {
  it('R9: v2 draft의 TEXT와 FIELD가 저장 전 미리보기에서 실 renderer로 표시된다', () => {
    const model = buildApprovalRenderModel(input({
      approval: approval({ approvalNo: 'DOC-2026-001', fieldValues: { docNo: 'DOC-2026-001' } }),
    }))
    const template = {
      ...GROUPWARE_DEFAULT,
      schemaVersion: 2,
      document: {
        ...GROUPWARE_DEFAULT.document,
        bands: GROUPWARE_DEFAULT.document.bands.map((band) => band.kind === 'BODY'
          ? {
              ...band,
              elements: [
                { key: 'draft-text', type: 'TEXT', text: '저장 전 미리보기 문구' },
                { key: 'draft-field', type: 'FIELD', binding: 'header.docNo' },
              ],
            }
          : band),
      },
    }

    const html = render(<DocumentRenderer template={template as never} model={model} />)

    expect(html).toContain('저장 전 미리보기 문구')
    expect(html).toContain('DOC-2026-001')
  })

  it('DS-4 regression: BODY positioned 요소는 하나의 좌표 레이어를 공유한다', () => {
    const model = buildApprovalRenderModel(input())
    const template = {
      ...GROUPWARE_DEFAULT,
      schemaVersion: 2 as const,
      document: {
        ...GROUPWARE_DEFAULT.document,
        bands: GROUPWARE_DEFAULT.document.bands.map((band) => band.kind === 'BODY'
          ? {
              ...band,
              elements: [
                {
                  key: 'body-text-left',
                  type: 'TEXT' as const,
                  text: '왼쪽 본문 요소',
                  geometry: { x: 10, y: 20, w: 20, h: 5 },
                },
                {
                  key: 'body-field-right',
                  type: 'FIELD' as const,
                  binding: 'header.docNo' as const,
                  geometry: { x: 60, y: 20, w: 20, h: 5 },
                },
              ],
            }
          : band),
      },
    }

    const html = render(<DocumentRenderer template={template as never} model={model} />)

    expect((html.match(/data-testid="document-template-v2-elements-body"/g) ?? []).length).toBe(1)
    expect((html.match(/style="[^"]*position:relative;min-height:24mm/g) ?? []).length).toBe(1)
    expect(html).toContain('data-template-element="body-text-left"')
    expect(html).toContain('data-template-element="body-field-right"')
  })

  it('DS-4 regression: % geometry layer는 legacy/DETAIL flow 높이와 독립된 고정 containing block이어야 한다', () => {
    const baseModel = buildApprovalRenderModel(input())
    const renderBodyVariant = (detailRowCount: number) => {
      const model = {
        ...baseModel,
        body: {
          ...baseModel.body,
          paragraphs: Array.from({ length: detailRowCount }, (_, index) => `legacy-${index + 1}`),
          lineItems: Array.from({ length: detailRowCount }, (_, index) => ({
            productName: `품목-${index + 1}`,
            modelName: `MODEL-${index + 1}`,
            specification: '규격',
            quantity: 1,
            supplyAmount: '1000',
            vatAmount: '100',
            lineTotal: '1100',
            note: '',
          })),
        },
      }
      const template = {
        ...GROUPWARE_DEFAULT,
        schemaVersion: 2 as const,
        document: {
          ...GROUPWARE_DEFAULT.document,
          bands: GROUPWARE_DEFAULT.document.bands.map((band) => band.kind === 'BODY'
            ? {
                ...band,
                elements: [
                  { key: 'legacy-content', type: 'CONTENT_PARAGRAPHS' as const },
                  {
                    key: 'positioned-field',
                    type: 'FIELD' as const,
                    binding: 'header.docNo' as const,
                    geometry: { x: 10, y: 50, w: 30, h: 10 },
                  },
                  {
                    key: 'variable-detail',
                    type: 'DETAIL' as const,
                    repeatBinding: 'body.lineItems' as const,
                    columns: ['productName'] as const,
                    geometry: { x: 0, y: 0, w: 100, h: 40 },
                  },
                ],
              }
            : band),
        },
      }
      return render(<DocumentRenderer template={template as never} model={model} />)
    }

    const html3 = renderBodyVariant(3)
    const html30 = renderBodyVariant(30)
    const layerOpen = /<div class="document-template-v2-elements" data-testid="document-template-v2-elements-body" style="([^"]+)">/
    const layer3 = html3.match(layerOpen)
    const layer30 = html30.match(layerOpen)
    const element3 = html3.match(/data-template-element="positioned-field"[^>]*style="([^"]+)"/)
    const element30 = html30.match(/data-template-element="positioned-field"[^>]*style="([^"]+)"/)

    // H5: 좌표 레이어는 BODY flow에서 실제로 24mm를 예약해야 한다.
    expect(layer3, 'BODY positioned 요소 전용 layer가 없다').not.toBeNull()
    expect(layer30, 'BODY positioned 요소 전용 layer가 없다').not.toBeNull()
    expect(layer3![1]).toContain('position:relative')
    expect(layer3![1]).toContain('min-height:24mm')
    expect(layer3![1]).not.toContain('position:absolute')
    expect(layer3![1]).not.toMatch(/(?:^|;)height:24mm(?:;|$)/)
    expect(layer30![1]).toBe(layer3![1])
    expect(element30?.[1]).toBe(element3?.[1])

    const bodyLayer = new JSDOM(html3).window.document.querySelector('[data-testid="document-template-v2-elements-body"]')
    expect(bodyLayer).not.toBeNull()
    expect(bodyLayer?.parentElement?.getAttribute('style')).toContain('position:relative')
    expect(bodyLayer?.getAttribute('style')).toContain('min-height:24mm')
    expect(bodyLayer?.querySelector('[data-template-element="positioned-field"]')).not.toBeNull()
    expect(bodyLayer?.querySelector('[data-template-detail="variable-detail"]')).toBeNull()
    expect(bodyLayer?.querySelector('[aria-label="결재문서 내용"]')).toBeNull()

    // layer가 원래 FIELD 선언 위치(legacy와 DETAIL 사이)에 삽입되어 O1 DOM 순서도 유지한다.
    const bodyChildren = Array.from(bodyLayer?.parentElement?.children ?? [])
    expect(bodyChildren[0]?.getAttribute('aria-label')).toBe('결재문서 내용')
    expect(bodyChildren.indexOf(bodyLayer!)).toBe(1)
    expect(bodyChildren[2]?.querySelector('[data-template-detail="variable-detail"]')).not.toBeNull()
    expect(bodyLayer?.nextElementSibling?.querySelector('[data-template-detail="variable-detail"]')).not.toBeNull()
  })

  it('기본 template을 PrintLayout props 동형 slot으로 compile한다', () => {
    const model = buildApprovalRenderModel(input())
    const compiled = compileApprovalDocument(GROUPWARE_DEFAULT, model)

    expect(compiled.paper).toBe('a4-portrait')
    expect(compiled.docHeader).toEqual(model.header)
    expect(compiled.approvalSteps).toEqual(model.approvalSteps)
    expect(compiled.closingNote).toBe(model.closing.note)
    expect(render(<DocumentRenderer template={GROUPWARE_DEFAULT} model={model} backTo="/back" />)).toContain(
      '상세로 돌아가기',
    )
  })

  it('5개를 넘는 approval step은 기존 PrintLayout slice로 결재칸이 잘린다', () => {
    const model = buildApprovalRenderModel(input({
      approval: approval({ steps: [step(1), step(2), step(3), step(4), step(5), step(6)] }),
    }))
    const html = render(<DocumentRenderer template={GROUPWARE_DEFAULT} model={model} />)

    expect(html.match(/class="print-approval-cell"/g)).toHaveLength(5)
    expect(html).toContain('>합의</div>')
    expect(html).not.toContain('>결재</div>')
  })

  it('M-F: geometry/style이 실제 출력 CSS에 반영된다(고유 구별 출력 — presence-only 아님)', () => {
    // 🚨 검증 결함: 종전 R9 테스트는 텍스트 존재만 확인해 geometryStyle() 을 통째로 무력화해도
    // 1,059 tests 전부 GREEN 이었다. 위치(left/top/width)·글꼴 크기·굵기·정렬·테두리가 각각 실제
    // 출력에 반영되는지 값 자체로 단언한다.
    const model = buildApprovalRenderModel(input())
    const template = {
      ...GROUPWARE_DEFAULT,
      schemaVersion: 2,
      document: {
        ...GROUPWARE_DEFAULT.document,
        bands: GROUPWARE_DEFAULT.document.bands.map((band) => band.kind === 'BODY'
          ? {
              ...band,
              elements: [
                {
                  key: 'geometry-style-probe',
                  type: 'TEXT' as const,
                  text: '위치·스타일 프로브',
                  geometry: { x: 12, y: 34, w: 56, h: 7 },
                  style: { fontSize: 17, bold: true, align: 'right' as const, border: true },
                },
              ],
            }
          : band),
      },
    }

    const html = render(<DocumentRenderer template={template as never} model={model} />)

    expect(html).toContain('left:12%')
    expect(html).toContain('top:34%')
    expect(html).toContain('width:56%')
    expect(html).toContain('font-size:17pt')
    expect(html).toContain('font-weight:700')
    expect(html).toContain('text-align:right')
    expect(html).toContain('border:1px solid #000')
  })

  it('M-F: FIELD/TEXT는 자신이 속한 밴드(HEADER/BODY/FOOTER)에만 렌더되고 geometry는 그 밴드 기준이다', () => {
    const model = buildApprovalRenderModel(input())
    const template = {
      ...GROUPWARE_DEFAULT,
      schemaVersion: 2,
      document: {
        ...GROUPWARE_DEFAULT.document,
        bands: GROUPWARE_DEFAULT.document.bands.map((band) => {
          if (band.kind === 'HEADER') {
            return { ...band, elements: [...band.elements, { key: 'header-text', type: 'TEXT' as const, text: '헤더 프로브' }] }
          }
          if (band.kind === 'FOOTER') {
            return { ...band, elements: [...band.elements, { key: 'footer-text', type: 'TEXT' as const, text: '푸터 프로브' }] }
          }
          return band
        }),
      },
    }

    const html = render(<DocumentRenderer template={template as never} model={model} />)

    const headerLayerIndex = html.indexOf('document-template-v2-elements-header')
    const footerLayerIndex = html.indexOf('document-template-v2-elements-footer')
    const headerTextIndex = html.indexOf('헤더 프로브')
    const footerTextIndex = html.indexOf('푸터 프로브')
    const bodyDividerIndex = html.indexOf('print-approval-divider')
    const closingIndex = html.indexOf('print-approval-closing')

    // 헤더 프로브는 header 레이어 안에서, 헤더 영역(첫 divider 이전)에 나타나야 한다.
    expect(headerLayerIndex).toBeGreaterThan(-1)
    expect(headerTextIndex).toBeGreaterThan(headerLayerIndex)
    expect(headerTextIndex).toBeLessThan(bodyDividerIndex)
    // 푸터 프로브는 footer 레이어 안에서, closingNote 이후(문서 하단)에 나타나야 한다.
    expect(footerLayerIndex).toBeGreaterThan(-1)
    expect(footerTextIndex).toBeGreaterThan(footerLayerIndex)
    expect(footerTextIndex).toBeGreaterThan(closingIndex)
    // BODY 레이어는 이 케이스에 요소가 없으므로 렌더되지 않는다(빈 공간 미예약, M-F).
    expect(html).not.toContain('document-template-v2-elements-body')
  })

  it('M-F: 인쇄 콘텐츠 래퍼(approval-doc-print-content)는 FIELD/TEXT가 있어도 정확히 한 번만 렌더된다', () => {
    const model = buildApprovalRenderModel(input())
    const template = {
      ...GROUPWARE_DEFAULT,
      schemaVersion: 2,
      document: {
        ...GROUPWARE_DEFAULT.document,
        bands: GROUPWARE_DEFAULT.document.bands.map((band) => band.kind === 'BODY'
          ? { ...band, elements: [...band.elements, { key: 'body-text', type: 'TEXT' as const, text: '본문 프로브' }] }
          : band),
      },
    }

    const html = render(<DocumentRenderer template={template as never} model={model} />)
    const occurrences = html.split('approval-doc-print-content').length - 1

    expect(occurrences).toBe(1)
  })

  it('비어 있지 않은 body element를 template 순서대로 조립한다', () => {
    const model = buildApprovalRenderModel(input())
    const template = {
      ...GROUPWARE_DEFAULT,
      document: {
        ...GROUPWARE_DEFAULT.document,
        bands: GROUPWARE_DEFAULT.document.bands.map((band) => band.kind === 'BODY'
          ? { ...band, elements: [...band.elements].reverse() }
          : band),
      },
    }
    const html = render(<DocumentRenderer template={template} model={model} />)
    const attachmentIndex = html.indexOf('aria-label="결재문서 첨부"')
    const fieldIndex = html.indexOf('aria-label="결재문서 세부 필드"')
    const contentIndex = html.indexOf('aria-label="결재문서 내용"')

    expect(attachmentIndex).toBeGreaterThan(-1)
    expect(fieldIndex).toBeGreaterThan(attachmentIndex)
    expect(contentIndex).toBeGreaterThan(fieldIndex)
  })

  it('DS-4: DETAIL은 0행에서 기존 빈 데이터 문구를, N행에서 각 DTO 값을 구별해 렌더한다', () => {
    const baseModel = buildApprovalRenderModel(input())
    const lineItems = [
      {
        productName: '펌프 A',
        modelName: 'MX-100',
        specification: '220V',
        quantity: 2,
        supplyAmount: '30000',
        vatAmount: '3000',
        lineTotal: '33000',
        note: '첫 행',
      },
      {
        productName: '밸브 B',
        modelName: 'VX-200',
        specification: '380V',
        quantity: 5,
        supplyAmount: '15000',
        vatAmount: '1500',
        lineTotal: '16500',
        note: '둘째 행',
      },
    ]
    const model = {
      ...baseModel,
      body: { ...baseModel.body, lineItems },
    }
    const template = {
      ...GROUPWARE_DEFAULT,
      schemaVersion: 2 as const,
      document: {
        ...GROUPWARE_DEFAULT.document,
        bands: GROUPWARE_DEFAULT.document.bands.map((band) => band.kind === 'BODY'
          ? {
              ...band,
              elements: [
                ...band.elements,
                {
                  key: 'detail-items',
                  type: 'DETAIL' as const,
                  repeatBinding: 'body.lineItems' as const,
                  columns: ['productName', 'quantity', 'supplyAmount', 'vatAmount', 'lineTotal'] as const,
                },
              ],
            }
          : band),
      },
    }

    const html = render(<DocumentRenderer template={template as never} model={model as never} />)

    expect(html).toContain('data-template-detail="detail-items"')
    expect(html).toContain('펌프 A')
    expect(html).toContain('밸브 B')
    expect(html).toContain('30,000')
    expect(html).toContain('3,000')
    expect(html).toContain('33,000')
    expect((html.match(/data-template-detail-row=/g) ?? []).length).toBe(2)

    const emptyHtml = render(<DocumentRenderer
      template={template as never}
      model={{ ...baseModel, body: { ...baseModel.body, lineItems: [] } } as never}
    />)
    expect(emptyHtml).toContain('품목 원천이 연결되지 않은 결재문서입니다.')
    expect(emptyHtml).not.toContain('데이터가 없습니다.')
  })

  it('DS-4 A2: 실제 route 입력에 품목 원천이 없으면 빈 표 대신 원인을 출력한다', () => {
    const model = buildApprovalRenderModel(input())
    const template = {
      ...GROUPWARE_DEFAULT,
      schemaVersion: 2 as const,
      document: {
        ...GROUPWARE_DEFAULT.document,
        bands: GROUPWARE_DEFAULT.document.bands.map((band) => band.kind === 'BODY'
          ? {
              ...band,
              elements: [...band.elements, {
                key: 'detail-source-missing',
                type: 'DETAIL' as const,
                repeatBinding: 'body.lineItems' as const,
                columns: ['productName', 'quantity'] as const,
              }],
            }
          : band),
      },
    }

    const html = render(<DocumentRenderer template={template as never} model={model} />)

    expect(html).toContain('품목 원천이 연결되지 않은 결재문서입니다.')
    expect(html).not.toContain('데이터가 없습니다.')
  })

  it('O1: DETAIL을 BODY 첫 요소로 이동하면 실제 preview DOM도 DETAIL이 먼저다', () => {
    const model = {
      ...buildApprovalRenderModel(input()),
      body: {
        ...buildApprovalRenderModel(input()).body,
        lineItems: [{
          productName: '출력 품목', modelName: 'MODEL-1', specification: '규격', quantity: 1,
          supplyAmount: '1000', vatAmount: '100', lineTotal: '1100', note: '',
        }],
      },
    }
    const template = {
      ...GROUPWARE_DEFAULT,
      schemaVersion: 2 as const,
      document: {
        ...GROUPWARE_DEFAULT.document,
        bands: GROUPWARE_DEFAULT.document.bands.map((band) => band.kind === 'BODY'
          ? {
              ...band,
              elements: [
                { key: 'detail-first', type: 'DETAIL' as const, repeatBinding: 'body.lineItems' as const, columns: ['productName'] as const },
                { key: 'content-after-detail', type: 'CONTENT_PARAGRAPHS' as const },
                { key: 'fields-after-detail', type: 'FIELD_TABLE' as const },
              ],
            }
          : band),
      },
    }

    const html = render(<DocumentRenderer template={template as never} model={model as never} />)

    expect(html.indexOf('data-template-detail="detail-first"')).toBeLessThan(
      html.indexOf('aria-label="결재문서 내용"'),
    )
  })

  it('DS-4: IMAGE는 허용된 data URL을 geometry와 함께 인쇄 경로에 렌더한다', () => {
    const model = buildApprovalRenderModel(input())
    const template = {
      ...GROUPWARE_DEFAULT,
      schemaVersion: 2 as const,
      document: {
        ...GROUPWARE_DEFAULT.document,
        bands: GROUPWARE_DEFAULT.document.bands.map((band) => band.kind === 'HEADER'
          ? {
              ...band,
              elements: [
                ...band.elements,
                {
                  key: 'logo-image',
                  type: 'IMAGE' as const,
                  src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB',
                  alt: '회사 로고',
                  geometry: { x: 70, y: 4, w: 20, h: 12 },
                },
              ],
            }
          : band),
      },
    }

    const html = render(<DocumentRenderer template={template as never} model={model} />)

    expect(html).toContain('data-template-image="logo-image"')
    expect(html).toContain('alt="회사 로고"')
    expect(html).toContain('left:70%')
    expect(html).toContain('top:4%')
    expect(html).toContain('width:20%')
    expect(html).toContain('min-height:12%')
  })

  it('DS-4: IMAGE는 문서 스타일을 img에 주입하지 않고 geometry만 인쇄한다', () => {
    const model = buildApprovalRenderModel(input())
    const template = {
      ...GROUPWARE_DEFAULT,
      schemaVersion: 2 as const,
      document: {
        ...GROUPWARE_DEFAULT.document,
        bands: GROUPWARE_DEFAULT.document.bands.map((band) => band.kind === 'HEADER'
          ? {
              ...band,
              elements: [
                ...band.elements,
                {
                  key: 'logo-image-style-regression',
                  type: 'IMAGE' as const,
                  src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB',
                  alt: '스타일 회귀 로고',
                  geometry: { x: 70, y: 4, w: 20, h: 12 },
                  style: { fontSize: 20, bold: true, align: 'center' as const, border: true },
                },
              ],
            }
          : band),
      },
    }

    const html = render(<DocumentRenderer template={template as never} model={model} />)
    const image = new JSDOM(html).window.document.querySelector(
      '[data-template-image="logo-image-style-regression"]',
    )

    expect(image).not.toBeNull()
    expect(image?.getAttribute('style')).toContain('left:70%')
    expect(image?.getAttribute('style')).toContain('top:4%')
    expect(image?.getAttribute('style')).toContain('width:20%')
    expect(image?.getAttribute('style')).toContain('min-height:12%')
    expect(image?.getAttribute('style')).not.toContain('font-size')
    expect(image?.getAttribute('style')).not.toContain('font-weight')
    expect(image?.getAttribute('style')).not.toContain('text-align')
    expect(image?.getAttribute('style')).not.toContain('border: 1px solid')
  })
})

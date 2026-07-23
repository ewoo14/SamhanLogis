/**
 * 문서 양식 편집기 "라이브 미리보기" 전용 합성 데이터.
 *
 * N-2 라운드 fix: 본문 field 행은 반드시 실서버 fieldOptions(현재 docType 기준, listApprovalTemplates로
 * 이미 가져온 데이터)에서 파생한다. 과거에는 여러 docType의 필드 key를 배열 하나에 하드코딩했는데,
 * 그 키가 mock.ts의 예시 키(accountCode/expenseDate/summary)와 일치했을 뿐 실서버 V5 시드 키
 * (account/spentAt/memo)와는 어긋났다 — 그 결과 FIELD 바인딩이 진단 문구로 떨어지고(N-1과 상호작용),
 * 편집기 자체 docType과 무관하게 다른 문서유형 필드가 FIELD_TABLE 미리보기에 섞여 보였다(P2 위반).
 * fieldOptions에서 파생하면 "현재 docType이 실제로 가진 필드"만 정확히 나타나 구조적으로 이 부류의
 * mock 키 하드코딩이 불가능해진다.
 */
import type { ApprovalTemplateField } from '../api/groupwareApprovalTemplate'
import type { ApprovalRenderModel } from './approvalRenderModel'

/** 실제 승인 건이 아니라 편집기 미리보기이므로, 알 수 없는 값 대신 라벨을 그대로 실은 예시 문자열을
 * 만든다 — "이 필드가 맞다"를 화면에서 바로 확인할 수 있게 한다. */
export function buildPreviewFieldRows(
  fields: Pick<ApprovalTemplateField, 'fieldKey' | 'label'>[],
): ApprovalRenderModel['body']['fieldRows'] {
  return fields.map((field) => ({
    key: field.fieldKey,
    label: field.label,
    value: `미리보기 ${field.label}`,
  }))
}

function previewLineItems(count: number): ApprovalRenderModel['body']['lineItems'] {
  return Array.from({ length: count }, (_, index) => ({
    productName: `미리보기 품목 ${String.fromCharCode(65 + (index % 26))}-${index + 1}`,
    modelName: `DS4-${String(index + 1).padStart(2, '0')}`,
    specification: '샘플 규격',
    quantity: (index % 4) + 1,
    supplyAmount: String((index + 1) * 15000),
    vatAmount: String((index + 1) * 1500),
    lineTotal: String((index + 1) * 16500),
    note: `샘플 행 ${index + 1}`,
  }))
}

/** M-E: 결재란이 최소 1단계는 있어야 편집기에서 APPROVAL_GRID를 조작할 때 미리보기 픽셀이 실제로
 * 바뀐다 — 문서유형과 무관한 구조적 슬롯이라 fieldOptions와 달리 고정값으로 유지한다. */
const PREVIEW_HEADER: ApprovalRenderModel['header'] = { title: '결재 문서 미리보기', docNo: '예시 문서번호', issueDate: '2026-01-01' }
const PREVIEW_APPROVAL_STEPS: ApprovalRenderModel['approvalSteps'] = [
  { label: '작성', name: '작성자' },
  { label: '결재', name: '결재자' },
]
const PREVIEW_CLOSING: ApprovalRenderModel['closing'] = { note: '위와 같이 품의하오니 재가하여 주시기 바랍니다.' }

export interface BuildPreviewModelOptions {
  /** 현재 선택된 문서 유형의 실제 본문 필드(listApprovalTemplates에서 이미 가져온 데이터, docType으로 필터링됨). */
  fieldOptions: Pick<ApprovalTemplateField, 'fieldKey' | 'label'>[]
  /** DETAIL 요소 미리보기 행 수(?mockDetailRows 쿼리 파라미터) — 미지정 시 기본 2행. */
  detailRowCount?: number
}

/** 편집기 라이브 미리보기용 `ApprovalRenderModel`을 합성한다. */
export function buildPreviewModel({ fieldOptions, detailRowCount = 2 }: BuildPreviewModelOptions): ApprovalRenderModel {
  return {
    header: PREVIEW_HEADER,
    approvalSteps: PREVIEW_APPROVAL_STEPS,
    body: {
      paragraphs: ['본문 미리보기'],
      fieldRows: buildPreviewFieldRows(fieldOptions),
      attachments: [],
      lineItemsAvailability: 'CONNECTED',
      lineItems: previewLineItems(detailRowCount),
    },
    closing: PREVIEW_CLOSING,
  }
}

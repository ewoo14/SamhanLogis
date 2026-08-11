/**
 * 그룹웨어 결재문서 인쇄 미리보기 순수 헬퍼.
 *
 * React hook/JSX 없이 DTO 를 `PrintLayout approvalDoc` 계약에 맞게 변환한다.
 */
import type {
  ApprovalLineAdminResponse,
  ApprovalStepView,
} from '../api/groupwareApproval'
import type { ApprovalAttachment } from '../api/groupwareApprovalAttachment'
import type { ApprovalTemplateField } from '../api/groupwareApprovalTemplate'
import { safeActorName } from '@samhan/design-system'
import { stripSlipNoZeros } from '../utils/orderNo'
import type { PrintApprovalStep, PrintDocHeader } from './PrintLayout'

/** 결재문서 본문 하단에 고정으로 출력하는 품의 문구. */
export const CLOSING_NOTE = '위와 같이 품의하오니 검토 후 재가하여 주시기 바랍니다.'

/** 결재란 1칸을 `PrintLayout` 표시 계약으로 변환한다. */
export function buildApprovalStep(label: string, name: string, decidedAt?: string): PrintApprovalStep {
  const step: PrintApprovalStep = { label, name }
  if (decidedAt) step.decidedAt = decidedAt
  return step
}

/** 빈 이름을 화면 표시용 `-` 로 치환한다. */
function displayNameOrFallback(value: string | null | undefined): string {
  return safeActorName(value) ?? '-'
}

/** 결재 요청자 작성칸과 결재선을 출력 순서대로 구성한다. */
export function buildApprovalSteps(approval: ApprovalLineAdminResponse): PrintApprovalStep[] {
  const sortedSteps = [...approval.steps].sort((a, b) => a.sequence - b.sequence)
  return [
    buildApprovalStep('작성', displayNameOrFallback(approval.requesterName)),
    ...sortedSteps.map((step, index) => {
      const label = index === sortedSteps.length - 1 ? '결재' : '합의'
      const decidedAt = step.status === 'APPROVED' ? step.decidedAt ?? undefined : undefined
      return buildApprovalStep(label, displayNameOrFallback(step.approverName), decidedAt)
    }),
  ]
}

/** 최종 승인 단계의 승인일만 문서 발행일로 사용한다. */
export function finalDecidedAt(steps: ApprovalStepView[]): string | undefined {
  const decided = steps
    .slice()
    .sort((a, b) => a.sequence - b.sequence)
    .filter((step) => step.status === 'APPROVED' && Boolean(step.decidedAt))
  const last = decided.length > 0 ? decided[decided.length - 1] : undefined
  return last?.decidedAt ?? undefined
}

/** 결재문서 공통 헤더를 구성하고 발행일이 없으면 `issueDate` 키를 생략한다. */
export function buildDocHeader(approval: ApprovalLineAdminResponse): PrintDocHeader {
  const issueDate = finalDecidedAt(approval.steps)
  return {
    title: approval.title,
    docNo: approval.approvalNo,
    ...(issueDate ? { issueDate } : {}),
  }
}

/** 결재 본문을 출력 문단 단위로 분리하고 빈 줄을 제거한다. */
export function contentParagraphs(content: string | null): string[] {
  return (content ?? '')
    .split(/\r?\n+/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0)
}

/** 템플릿 필드를 key 조회용 Map 으로 변환한다. */
export function fieldMap(fields: ApprovalTemplateField[]): Map<string, ApprovalTemplateField> {
  return new Map(fields.map((field) => [field.fieldKey, field]))
}

export interface ApprovalDocFieldRow {
  key: string
  label: string
  value: string
  fieldType: ApprovalTemplateField['fieldType']
}

/** 결재문서 동적 필드를 템플릿 표시 순서 우선으로 정렬하고 빈 값을 제외한다. */
export function fieldRows(
  fieldValues: Record<string, string>,
  fields: ApprovalTemplateField[],
): ApprovalDocFieldRow[] {
  const sortedFields = [...fields].sort((a, b) => a.displayOrder - b.displayOrder)
  const fieldsByKey = fieldMap(sortedFields)
  const entries = Object.entries(fieldValues)
    .map(([key, value]) => [key, value.trim()] as const)
    .filter(([, value]) => value.length > 0)
  const rowByKey = new Map(entries)
  const templateRows = sortedFields
    .map((field) => {
      const value = rowByKey.get(field.fieldKey)
      if (!value) return null
      return {
        key: field.fieldKey,
        label: field.label,
        value,
        fieldType: field.fieldType,
      }
    })
    .filter((row): row is ApprovalDocFieldRow => row !== null)
  const knownKeys = new Set(sortedFields.map((field) => field.fieldKey))
  const extraRows = entries
    .filter(([key]) => !knownKeys.has(key))
    .map(([key, value], index) => {
      const field = fieldsByKey.get(key)
      return {
        key,
        label: field?.label ?? `추가 필드 ${index + 1}`,
        value,
        fieldType: field?.fieldType ?? 'TEXT',
      }
    })
  return [...templateRows, ...extraRows]
}

/** 첨부 문서 제목은 사용자 라벨, 참조 라벨, 파일명 순으로 선택한다. */
export function attachmentTitle(attachment: ApprovalAttachment): string {
  return attachment.label
    ?? attachment.refDocLabel
    ?? attachment.fileName
    ?? '-'
}

/** 첨부 참조 상세를 전표번호/거래처/기간 순으로 구성하고 빈 항목을 제거한다. */
export function attachmentDetails(attachment: ApprovalAttachment): string[] {
  return [
    attachment.refSlipNo ? stripSlipNoZeros(attachment.refSlipNo) : attachment.refDocNo ?? '',
    attachment.refPartnerName ?? '',
    attachment.refPeriod ?? '',
  ].filter((value) => value.length > 0)
}

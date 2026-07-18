/**
 * 결재 문서 plugin의 canonical 기본 양식.
 *
 * DS-1에서는 모든 결재양식이 같은 기존 레이아웃을 사용하고, DS-2 이후 저장된
 * 템플릿이 이 envelope를 확장한다. 따라서 null/not-found/error도 결정적으로
 * GROUPWARE_DEFAULT로 수렴한다.
 */
import type { ApprovalTemplate } from '../api/groupwareApprovalTemplate'
import {
  parseDocumentTemplate,
  type TemplateEnvelope,
} from './templateSchema'

export const GROUPWARE_DEFAULT: TemplateEnvelope = {
  schemaVersion: 1,
  revision: 1,
  docType: 'GROUPWARE_DEFAULT',
  name: '결재문서 기본 양식',
  document: {
    paper: 'A4_PORTRAIT',
    bands: [
      {
        key: 'approval-header',
        kind: 'HEADER',
        elements: [
          { key: 'approval-title', type: 'TITLE' },
          { key: 'approval-meta', type: 'META_ROWS' },
          { key: 'approval-grid', type: 'APPROVAL_GRID' },
        ],
      },
      {
        key: 'approval-body',
        kind: 'BODY',
        elements: [
          { key: 'approval-content', type: 'CONTENT_PARAGRAPHS' },
          { key: 'approval-fields', type: 'FIELD_TABLE' },
          { key: 'approval-attachments', type: 'ATTACHMENT_TABLE' },
        ],
      },
      {
        key: 'approval-footer',
        kind: 'FOOTER',
        elements: [{ key: 'approval-closing', type: 'CLOSING' }],
      },
    ],
  },
}

/** 기본 양식의 별칭 — 호출부에서 문서 유형 기본 템플릿임을 드러낼 때 사용한다. */
export const approvalDefaultTemplate = GROUPWARE_DEFAULT

/**
 * parser 결과가 유효하지 않으면 canonical 기본 양식으로 fallback한다.
 */
export function resolveDocumentTemplate(value: unknown): TemplateEnvelope {
  const parsed = parseDocumentTemplate(value)
  return parsed.ok ? parsed.value : GROUPWARE_DEFAULT
}

/**
 * 기존 결재양식 API 응답을 문서 렌더러의 docType으로 해석한다.
 * 필드 API 오류/미존재는 호출부에서 null로 전달하므로 기본 양식으로 수렴한다.
 */
export function resolveApprovalDocumentTemplate(
  template: ApprovalTemplate | null | undefined,
): TemplateEnvelope {
  const code = template?.code.trim()
  if (!code) return GROUPWARE_DEFAULT
  const name = template?.name.trim()
  return {
    ...GROUPWARE_DEFAULT,
    docType: `GROUPWARE_${code}`,
    name: name || GROUPWARE_DEFAULT.name,
  }
}

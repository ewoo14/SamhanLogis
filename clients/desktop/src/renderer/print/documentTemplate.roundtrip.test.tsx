// @vitest-environment jsdom
/**
 * 라운드트립 게이트 stage-2 (FE 소유).
 *
 * BE(1단계)가 실 Postgres 왕복(POST→activate→active GET)을 faithful 캡처한
 * `canonical-active-response.json` artifact 를 FE 가 그대로 소비해
 * `resolveDocumentTemplate`→`DocumentRenderer` 로 렌더하고, 커밋된 frozen golden HTML 과
 * 바이트동일함을 확인한다.
 *
 * - artifact 는 BE 소유(읽기 전용). 여기서는 상대경로로 읽기만 한다.
 * - artifact 의 document 는 비기본(sparse GROUPWARE_ROUNDTRIP) 레이아웃이므로 golden 은
 *   그 sparse 렌더다. 활성 파싱이 깨지면(예: DS-2 CRITICAL 회귀로 DEFAULT fallback) 렌더가
 *   달라져 골든과 불일치→RED 로 잡힌다.
 * - `parseDocumentTemplate` 는 id/status 를 검증만 하고 렌더는 무시하므로, artifact 에
 *   id/status 가 추가되어도 golden 은 불변이다.
 */
import React from 'react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom/server'
import { describe, expect, it } from 'vitest'

import { resolveDocumentTemplate } from './approvalDefaultTemplate'
import { buildApprovalRenderModel, type ApprovalRenderModel } from './approvalRenderModel'
import { DocumentRenderer } from './DocumentRenderer'
import type { ApprovalLineAdminResponse } from '../api/groupwareApproval'

const artifactPath = resolve(
  process.cwd(),
  '../../services/groupware-service/src/test/resources/document-template-fixtures/canonical-active-response.json',
)
const goldenPath = resolve(process.cwd(), 'src/renderer/print/__fixtures__/canonical-active-response.golden.html')

function roundtripModel(): ApprovalRenderModel {
  const approval: ApprovalLineAdminResponse = {
    approvalId: 'roundtrip-id',
    approvalNo: 'GW-ROUNDTRIP-001',
    requesterId: 'requester-id',
    requesterName: '작성자',
    title: '라운드트립 골든',
    content: '왕복 본문',
    templateId: null,
    templateName: null,
    documentType: 'GROUPWARE_ROUNDTRIP',
    fieldValues: {},
    status: 'APPROVED',
    steps: [],
  }
  return buildApprovalRenderModel({ approval, templateFields: [], attachments: [], backTo: '/groupware/approvals/roundtrip-id' })
}

function renderArtifact(): string {
  const artifact = resolveDocumentTemplate(JSON.parse(readFileSync(artifactPath, 'utf8')) as unknown)
  return renderToStaticMarkup(
    <StaticRouter location="/">
      <DocumentRenderer template={artifact} model={roundtripModel()} backTo="/groupware/approvals/roundtrip-id" />
    </StaticRouter>,
  )
}

describe('document template roundtrip gate stage-2 (FE)', () => {
  it('canonical active-response artifact 렌더가 커밋된 frozen golden 과 바이트동일하다', () => {
    expect(renderArtifact()).toBe(readFileSync(goldenPath, 'utf8'))
  })
})

# 견적 vestigial audit/realtime 제거 (경로 fix) 구현 계획

> **워크플로우**: Opus 기획+조기PR(본 문서) → Codex 구현 → 순차 듀얼리뷰 0수렴 → 라이브 QA → PM 종합 → CI → 머지. ([[feedback_canonical_workflow]])

**Goal:** 견적 상세/편집 화면의 **미구현 BE를 가리키는 vestigial FE 배선**(`estimateAuditApi`·`EstimateRealtimeClient`)을 제거해 "항상 빈 audit뷰 + 5s 404 재시도 루프"를 종료한다. 버전이력은 `EstimateVersionHistoryPanel`(revisions), 라이브 동기는 coedit(`EstimateCollaborationPanel`)에 위임(둘 다 이미 작동).

**개발책임자 결정(2026-07-01):** Option A(vestigial 제거). B(BE 신설=parity)·C(revisions 재배선) 기각.

## 근본원인 (systematic-debugging Phase 1-2 완료)
- FE `estimateAuditApi`=`/api/v1/estimates/{id}/audit-logs`·`/revert`, `EstimateRealtimeClient`=`/api/v1/estimates/{id}/realtime`.
- 게이트웨이 `/api/v1/estimates/**` 라우트는 **P0-A 하드닝(2026-06-10)으로 폐기**(api-gateway `application.yml` L403-405 주석) → **404**. 견적은 `/api/v1/slips/**`(StripPrefix=2)로만 서빙.
- slip 경로로 고쳐도 estimate BE엔 `/audit-logs`·`/realtime` **컨트롤러 부재**(revisions·collab/stream만) → 500/403. partner-order엔 `PartnerOrderAuditLogController`·`PartnerOrderRealtimeController` 실재(작동 참조).
- FE 주석 명시(`EstimateDetailPage.tsx:104`): **"PR-H4c: audit log 백필 — BE 미구현 시 빈 배열 fallback"** → `.catch(()=>[])`로 항상 `[]`. **BE 구현된 적 없는 aspirational 배선** 확정.
- estimate는 이미 `EstimateVersionHistoryPanel`(revisions/restore) + coedit 보유 → vestigial 배선은 **기능 중복**. 제거 시 무회귀(항상 비어있던 UI만 사라짐).

## Global Constraints
- **FE-only**. BE/게이트웨이/Flyway 변경 0.
- **무회귀 검증 필수**: 제거 후에도 견적 상세/편집이 정상 렌더 + 버전이력 패널(revisions) + coedit 라이브동기 유지. audit뷰가 애초 비어있었음을 라이브 QA로 실증.
- typecheck = `npm run typecheck`([[feedback_desktop_typecheck_command]]), 변경 모듈 전체 vitest green([[feedback_changed_module_full_test_before_push]]).

## 제거 대상 (정확 매핑)

### 1. `clients/desktop/src/renderer/routes/EstimateDetailPage.tsx`
- import 제거: `estimateAuditApi`(L46), `EstimateRealtimeClient`(L47). `AuditOverlay`(L28)·`AuditRevisionBadge`/`groupAuditLogsByField`(L54-56) 는 아래 사용 제거 후 미참조면 함께 제거.
- `auditQuery`(L105-109) 제거.
- `EstimateRealtimeClient.subscribe` useEffect(L112-121) 제거.
- `revertMutation`(L124-132) 제거.
- `auditLogs`/`auditByField`(L209-210) 제거.
- `<AuditRevisionBadge ...>`(L533-540) 제거.
- `<AuditOverlay field="memo" currentValue={e.memo} ...>`(L585 부근) → 오버레이 래퍼 제거하고 `{e.memo}` 평문 표시(비고 라벨/마크업 보존). 다른 `AuditOverlay` 사용 없음(단일).

### 2. `clients/desktop/src/renderer/routes/EstimateFormPage.tsx`
- import 제거: `estimateAuditApi`(L31), `EstimateRealtimeClient`(L32), `AuditRevisionBadge`(L33, 미참조 시).
- `auditQuery`(L313-317) 제거.
- `EstimateRealtimeClient.subscribe` useEffect(L320-329) 제거.
- `revertMutation`(L331-337) 제거.
- `<AuditRevisionBadge ...>`(L725-732) 제거.

### 3. `clients/desktop/src/renderer/routes/EstimateFormPage.coedit.test.tsx`
- `vi.mock('../api/createAuditApi', ...)` estimateAuditApi mock(L86-) + `vi.mock('../realtime/EstimateRealtimeClient', ...)`(L108-) 제거(더 이상 import 안 됨). 다른 목적의 createAuditApi import 없으면 완전 제거.

### 4. `clients/desktop/src/renderer/api/createAuditApi.ts`
- `estimateAuditApi` export(L124-128) 제거. (다른 audit api export는 유지 — taxInvoice/closing/partnerLedger/partnerOrder/dcConfig/inventoryAudit/arologisDispatch.)

### 5. `clients/desktop/src/renderer/realtime/EstimateRealtimeClient.ts`
- **파일 삭제**(다른 소비처 없음 — grep 확인 완료).

### 6. mock.ts / createAuditApi.test.ts
- `mock.ts`: estimate audit-logs/realtime 핸들러 **없음**(grep 확인) → 변경 불요.
- `createAuditApi.test.ts`(있으면): estimate 전용 케이스 있으면 제거.

## Verification (구현 후)
- `cd clients/desktop && npm run typecheck` → 0 에러(dangling ref 0).
- `npm run test` → 변경 스위트 green(EstimateFormPage.coedit.test 등).
- **라이브 QA(mock OFF, :8080)**: 견적 상세/편집 진입 → (a) **네트워크 콘솔에 `/estimates/.../realtime` 404 재시도 루프 소멸** (b) 버전이력 패널(revisions) 정상 (c) coedit 2세션 라이브 동기 정상 — 실 캡처.

## DoD ([[feedback_canonical_workflow]])
- [ ] 조기 PR(base=main) 개설.
- [ ] Codex 구현 + Claude commit 대행 + 개발사항 즉시 게시.
- [ ] 순차 듀얼리뷰 0수렴(Opus 5-agent → fix → 게시 ↔ Codex 5-agent → fix → 게시).
- [ ] 라이브 QA(mock OFF) 실 캡처(404 루프 소멸 + 버전이력/coedit 무회귀).
- [ ] PM 종합 → CI green → squash 머지 → 핸드오프 갱신 → 다음=[2] 소급 sweep 재검증.

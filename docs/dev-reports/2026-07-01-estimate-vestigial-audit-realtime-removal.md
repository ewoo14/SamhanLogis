# 견적 vestigial audit/realtime 배선 제거 (PR #694)

> 2026-07-01. 트랙 [1] 경로 fix. FE-only. 브랜치 `fix/estimate-vestigial-audit-realtime`.

## 배경 / 근본원인 (systematic-debugging)
견적 상세(`EstimateDetailPage`)·편집(`EstimateFormPage`) 화면이 `estimateAuditApi`(`/api/v1/estimates/{id}/audit-logs`·`/revert`)와 `EstimateRealtimeClient`(`/api/v1/estimates/{id}/realtime`)를 호출했으나:
- 게이트웨이 `/api/v1/estimates/**` 라우트가 **P0-A 하드닝(2026-06-10)으로 폐기**(`services/api-gateway/.../application.yml` L403-405 tombstone 주석) → **404**. 견적은 `/api/v1/slips/**`(StripPrefix=2)로만 서빙.
- estimate BE엔 `/audit-logs`·`/realtime` **컨트롤러가 애초 없음**(revisions·collab/stream만; partner-order엔 `PartnerOrderAuditLogController`·`PartnerOrderRealtimeController` 실재 = 작동 참조).
- FE 주석 명시(`EstimateDetailPage.tsx:104`): "**PR-H4c: audit log 백필 — BE 미구현 시 빈 배열 fallback**" → `.catch(()=>[])`로 audit뷰 **항상 빈 상태** + realtime **5s 404 재시도 루프**.

즉 partner-order에서 복사됐으나 estimate BE가 구현된 적 없는 **vestigial 배선**. 게다가 견적은 이미 `EstimateVersionHistoryPanel`(revisions/restore) + `EstimateCollaborationPanel`(coedit)를 보유 → 기능 중복.

## 결정 — Option A (제거)
개발책임자 2026-07-01: **vestigial 제거**. B(BE 신설=partner-order parity)·C(revisions 재배선) 기각. 버전이력=revisions, 라이브동기=coedit로 위임(둘 다 이미 작동).

## 변경 (FE-only, BE/게이트웨이/Flyway 0)
| 파일 | 변경 |
|---|---|
| `routes/EstimateDetailPage.tsx` | estimateAuditApi·EstimateRealtimeClient·auditQuery·realtime useEffect·revertMutation·AuditRevisionBadge·AuditOverlay(memo) 제거, `{e.memo || '(빈 값)'}` 평문, testid `estimate-detail-memo` |
| `routes/EstimateFormPage.tsx` | 동일 제거 + AuditRevisionBadge |
| `api/createAuditApi.ts` | `estimateAuditApi` export 제거(타 audit api 유지) |
| `realtime/EstimateRealtimeClient.ts` | **파일 삭제**(타 소비처 0) |
| `components/collab/EstimateCollaborationPanel.tsx` | dead `['estimate',id,'audit-logs']` invalidate 2곳 제거 + stale 주석 정리 |
| `routes/EstimateFormPage.coedit.test.tsx` | dead AuditOverlaySection/createAuditApi/EstimateRealtimeClient mock 제거 |
| `playwright/estimate-version-history.spec.ts` | doc 주석 stale audit-logs 참조 제거 |

## 워크플로우 (표준 순차 듀얼리뷰 · 0수렴)
- 조기 PR #694 → Codex 개발(`50a33982`) → **Opus 5-agent 전원 CLEAN + Opus fix 4 nit(`a24fdecf`)** → 라이브 QA PASS 4/4 → **Codex 5-agent: dead invalidate 2곳 단독 적발 + Codex fix(`ea2951f7`)** → Codex-라운드 QA PASS → **수렴 라운드**(Opus 0 + Codex docs 신선도 적발 → docs sync) → 0수렴.
- **순차 듀얼리뷰가 상호 미적발 결함 적발 실증**: Opus 4 nit ↔ Codex dead invalidate 2곳 ↔ Codex 수렴 재검 docs staleness.

## QA (실 캡처 — 가짜 없음)
- 실 게이트웨이 :8080 probe: `/api/v1/estimates/est-001/{realtime,audit-logs,revert}` → 전부 **404**(폐기 확정), 대체 `/slips/estimates/.../revisions`·`/collab/coedit` → 401(정상 라우팅).
- 계측 캡처: dead-endpoint 호출 시도 **0**(browser+CDP), 404 재시도루프 0, `estimate:edit` 콘솔에러 0.
- Playwright 실 Chromium 렌더 3 passed · vitest 464 · typecheck 0. 증적 `docs/qa/estimate-vestigial-694/`·`docs/qa/estimate-vestigial-694-codex/`.

## 한계 / 후속
- "(빈 값)" 빈-memo 경로는 mock이 항상 non-empty라 live 미실행(trivial `||` 단락). full mock-OFF UI는 JWT/시드 필요로 미실행(게이트웨이 probe로 결정적 대체).
- 401 SSE 콘솔에러 = 신규 coedit/presence stream(본 PR 무관·비회귀).
- 핸드오프 CURRENT-WORK.md item [2] 경로 fix 완료 표기 = 머지 시(Step 8) 갱신.

# dev-report — 견적(Estimate) RESTORE 버전이력 + point-in-time 복원 (Phase 2.2)

> RESTORE 도메인 확장 3번째 적용(slip 2.1 / inventory 보류 D-RST-04 / **estimate 본 슬라이스**). slip 패턴(D-RST-01~03) 이식. Codex 크레딧 소진(6/1) 동안 Claude 에이전트 subagent-driven 구현.
> spec: `docs/superpowers/specs/2026-05-29-estimate-restore-version-history-design.md` · plan: `docs/superpowers/plans/2026-05-29-estimate-restore-version-history.md`

## 1. 목적
견적서(주문 전 활발히 편집되는 헤더+라인 전표)의 각 시점 상태를 full-snapshot 으로 보관하고, 편집 가능 상태에서 특정 시점으로 통째 복원. slip 과 동형이자 더 단순(기존 audit/overlay 없음 → 단일 revision 채널).

## 2. 데이터 모델
- 신규 `estimate_revisions` (slip-service, **Flyway V28**): JSONB `snapshot`(헤더 8 + 라인) + `revision_no` + `revision_type`(CREATE/EDIT/RESTORE) + `source_revision_no` + `estimate_no`/`estimate_date` + `actor_*` + BaseEntity 7. partial unique `(estimate_id, revision_no) WHERE is_deleted=FALSE`. `@JdbcTypeCode(SqlTypes.JSON)`(SlipRevision 선례).
- `EstimateSnapshot`(record, 헤더 8필드 + `List<Line>` — Line: productId/productName/modelName/specification/quantity/unitPrice/supplyAmount/vatAmount/lineTotal/note).

## 3. 캡처 흐름
`EstimateRevisionService.capture(estimate, type, sourceRev, actor)` — `EstimateService.create`(CREATE) + `update`(EDIT). EstimateService 공개 메서드 8개 전수 확인: content-mutation 은 create/update 뿐(라인 전량 replace), send/accept/reject/convert 는 status 전이라 캡처 대상 아님(누락 0, D-RST-03 교훈). 채번 = maxRevisionNo+1 `saveAndFlush` + `DataIntegrityViolation` 1회 재시도 → CONFLICT(409). `Estimate.toSnapshot()` 가 헤더+미삭제 라인 직렬화. actor=X-User-Id/Name(UUID 비공개).

## 4. 복원 흐름
`POST /slips/estimates/{id}/revisions/{revisionNo}/restore`:
- `Estimate.restoreFromSnapshot()` 최상단 **`requireEditable()` 가드**(EDITABLE_STATUSES={QUOTE_DRAFT, QUOTE_SENT} — ACCEPTED/CONVERTED/REJECTED 면 CONFLICT 409). slip 마감 lock / inventory pre-ship 과 동일 사상(잠긴 견적 복원 불가).
- 헤더 set + 라인 전량교체(`lines.clear()` — orphanRemoval=true 라 markDeleted 불요, slip 과 차이) + `recalculateTotals()`(합계 라인 기준 재계산, 스냅샷 합계 무시).
- 복원을 신규 RESTORE revision(source_revision_no) 기록. **SSE 없음**(estimate BE broker 부재 → FE 복원 응답으로 invalidate).

## 5. API + FE
- `GET /slips/estimates/{id}/revisions`(VIEW, changeSummary=인접 스냅샷 diff: 헤더 변경수 + 라인 +/-/~ productId 기준) + `POST .../{n}/restore`(RESTORE). `EstimateRevisionResponse`(actorId 미노출).
- FE: `EstimateVersionHistoryPanel`(react-query `['estimateRevisions',id]`, 목록·배지·changeSummary·복원 confirm·invalidate·토스트, **편집불가 상태면 복원 버튼 비활성+안내**, UUID 비노출) + `api/estimateRevision.ts`. EstimateDetailPage 통합.

## 6. 권한 / 가드
- `estimates.list` page에 **RESTORE action** 추가(신규 page code 미생성, D-RST-03). 편집 가능 상태 가드. PARTNER deny(내부), MASTER bypass.

## 7. 검증
- BE: `:services:slip-service:compileTestJava` + 단위테스트 GREEN(EstimateRevisionService capture/race/summarize 7, EstimateRestore 3). `EstimateRevisionRestoreIT`(Testcontainers, 캡처/복원 헤더+라인/라인삭제 복원/ACCEPTED 차단 409/RESTORE deny+MASTER bypass) — 로컬 Docker npipe 한계 skip → **Linux CI 위임**([[feedback_testcontainers_windows_docker]]).
- FE: `npm run typecheck` + eslint PASS. Playwright `estimate-version-history.spec.ts`(패널+복원+편집불가 표시, mock-mode fixture).

## 8. 범위
- IN: 견적 full-snapshot 버전이력 + 편집가능-상태 point-in-time 복원.
- OUT(후속): SSE(estimate broker 부재) / un-delete / shared revision 추출(slip+estimate 형태차로 D-RST-02대로 보류) / 견적→슬립 convert 이력.

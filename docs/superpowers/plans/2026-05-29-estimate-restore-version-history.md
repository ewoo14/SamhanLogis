# 견적(Estimate) RESTORE 버전이력 + 복원 (Phase 2.2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Codex 다운(6/1) 동안 **Claude 에이전트** 구현. 본 기능은 **slip(2.1) 구현의 거의 동형**이라, 각 Task 는 slip 대응 파일을 **참조 템플릿**으로 미러하되 estimate 도메인에 맞춘다.

**Goal:** 견적(Estimate) 헤더+라인을 revision별 full-snapshot(JSONB)으로 보관, 편집 가능 상태(QUOTE_DRAFT/SENT)에서 point-in-time 복원.

**Architecture:** 신규 `estimate_revisions`(JSONB) + `EstimateRevisionService`(capture/restore/list/summarize). slip 패턴(D-RST-01~03) 이식, overlay 없어 더 단순. estimate=slip-service sub-domain `slip.estimate.*`.

**Tech:** Spring Boot 3 / JPA / PostgreSQL JSONB(@JdbcTypeCode SqlTypes.JSON) / Flyway V28 / Testcontainers / React. spec: `docs/superpowers/specs/2026-05-29-estimate-restore-version-history-design.md`.
**브랜치:** `feat/phase-2-2-estimate-restore`. 검증: `$env:GRADLE_USER_HOME='C:\dev\SamhanLogis\.gradle\codex-home'` + `--no-daemon --no-parallel`. 실 IT 는 Linux CI.

**참조 템플릿(slip 2.1, 이미 머지됨 — 동형 미러)**:
- `services/slip-service/.../slip/revision/domain/{SlipRevision,SlipSnapshot,SlipRevisionType}.java`
- `.../slip/revision/repository/SlipRevisionRepository.java`
- `.../slip/revision/service/SlipRevisionService.java` (capture/restore/list/summarize + 채번 race 409 + changeSummary)
- `.../slip/revision/web/SlipRevisionController.java` + dto `SlipRevisionResponse.java`
- `.../slip/domain/Slip.java` 의 `toSnapshot()`/`restoreFromSnapshot()`
- `.../resources/db/migration/V27__add_slip_revisions.sql`
- `.../slip/it/SlipRevisionRestoreIT.java`
- FE `clients/desktop/.../components/audit/SlipVersionHistoryPanel.tsx`, `api/slipRevision.ts`

**estimate 대응(grounding)**: `slip.estimate.domain.{Estimate,EstimateLine,EstimateStatus}`, `EstimateService`(create/update — update=라인 전량교체), `EstimateController`(`/slips/estimates`, @RequirePermission estimates.list), `EstimateDetailResponse.from`, `EstimatePermissionGuard`(PAGE="estimates.list"), `EstimateControllerIT`. EDITABLE_STATUSES={QUOTE_DRAFT,QUOTE_SENT}, `requireEditable()`. @Version on Estimate. EstimateLine: lineNo/productId/productName/modelName/specification/quantity/unitPrice/supplyAmount/vatAmount/lineTotal(recompute VAT10%). 헤더: estimateNo/estimateDate/seqNo/status/partnerId/partnerName/partnerBusinessNo/partnerAddress/validUntil/memo/requesterId.

---

## Task 1: estimate_revisions 데이터 계층

**Files:** Create `V28__add_estimate_revisions.sql`, `slip/estimate/revision/domain/{EstimateSnapshot,EstimateRevision,EstimateRevisionType}.java`, `.../revision/repository/EstimateRevisionRepository.java`. Test: `EstimateRevisionSnapshotTest.java`.

- [ ] **Step 1**: `V28__add_estimate_revisions.sql` — `V27__add_slip_revisions.sql` 동형, 테이블 `estimate_revisions`, FK 컬럼 `estimate_id`, `estimate_no VARCHAR(40)`/`estimate_date DATE`, 나머지(revision_no/revision_type/source_revision_no/snapshot JSONB/actor_*/BaseEntity 7: created_by VARCHAR(50) NOT NULL no-default 등) 동일. partial unique `uq_estimate_revisions_active(estimate_id,revision_no) WHERE is_deleted=false` + `ix_estimate_revisions(estimate_id, revision_no DESC)`.
- [ ] **Step 2**: `EstimateSnapshot` record — 헤더 필드(estimateNo/estimateDate/partnerId/partnerName/partnerBusinessNo/partnerAddress/validUntil/memo) + `List<Line> lines`, Line(productId/productName/modelName/specification/quantity/unitPrice/note 또는 EstimateLine 실 필드). SlipSnapshot 미러, `@JsonInclude(NON_NULL)`. **실제 Estimate/EstimateLine 필드 확인 후 정합.**
- [ ] **Step 3**: `EstimateRevisionType` enum(CREATE/EDIT/RESTORE) + `EstimateRevision` 엔티티(`@Entity @Table("estimate_revisions") extends BaseEntity`, `@JdbcTypeCode(SqlTypes.JSON) EstimateSnapshot snapshot`, factory `of(...)`, getters). SlipRevision 미러(slipId→estimateId, slipNo→estimateNo).
- [ ] **Step 4**: `EstimateRevisionRepository`(findByEstimateIdOrderByRevisionNoDesc / findByEstimateIdAndRevisionNo / `@Query maxRevisionNo`). SlipRevisionRepository 미러.
- [ ] **Step 5**: 단위 테스트(factory + Jackson round-trip). `:services:slip-service:compileJava :compileTestJava :test --tests *EstimateRevisionSnapshotTest*` GREEN.
- [ ] **Step 6**: commit `feat(estimate-restore): estimate_revisions 데이터 계층 (V28)`.

## Task 2: 캡처 (EstimateRevisionService.capture + Estimate.toSnapshot + 훅)

**Files:** Create `.../revision/service/EstimateRevisionService.java`. Modify `Estimate.java`(toSnapshot), `EstimateService.java`(create/update 훅, + editHeader/addLine/removeLine 가 공개 service 경로면 그곳도). Test: `EstimateRevisionServiceTest`.

- [ ] **Step 1~2**: 실패 테스트(capture 채번 1,2 + snapshot 정합) → 확인.
- [ ] **Step 3**: `Estimate.toSnapshot()` — 헤더 + 미삭제 lines → EstimateSnapshot. (SlipRevisionService/Slip.toSnapshot 미러.)
- [ ] **Step 4**: `EstimateRevisionService` — `capture`(maxRevisionNo+1, saveAndFlush + **DataIntegrityViolation 1회 재시도→CONFLICT 409**, SlipRevisionService 동형) + `list` + `summarize`/`listWithSummary`(인접 스냅샷 diff: 헤더 변경 수 + 라인 +/-/~, productId 기준). SlipRevisionService 미러.
- [ ] **Step 5**: `EstimateService` 에 EstimateRevisionService 주입 + `create`(CREATE)/`update`(EDIT) 후 capture 훅. **EstimateService 의 모든 content-mutation 공개 메서드 전수 확인**(editHeader/addLine/removeLine 가 별도 공개면 그곳도 — 누락 0, D-RST-03 교훈). actor = callerId/X-User-Name.
- [ ] **Step 6~7**: 테스트 GREEN + commit `feat(estimate-restore): 스냅샷 캡처 (capture + toSnapshot + 훅)`.

## Task 3: 복원 (Estimate.restoreFromSnapshot + restoreToRevision)

**Files:** Modify `Estimate.java`(restoreFromSnapshot), `EstimateService.java`(restoreToRevision), `EstimateRevisionService.java`(restore). Test: EstimateRevisionServiceTest + EstimateRestoreTest.

- [ ] **Step 1~2**: 실패 테스트(복원 헤더+라인, 라인 add/remove, RESTORE revision source) → 확인.
- [ ] **Step 3**: `Estimate.restoreFromSnapshot(EstimateSnapshot)` — **`requireEditable()` 먼저**(편집 가능 상태 가드, 잠금 시 CONFLICT) → 헤더 set + 라인 전량교체(EstimateService.update 의 교체 로직 패턴: 기존 라인 removeLine/markDeleted → 스냅샷 라인 addLine 재생성) → `recalculateTotals()`(합계 재계산, 스냅샷 합계 무시). (Slip.restoreFromSnapshot 미러, requireNotLocked→requireEditable.)
- [ ] **Step 4**: `EstimateRevisionService.restore`(target 404 → restoreFromSnapshot → capture RESTORE source) + `EstimateService.restoreToRevision(estimateId, revNo, callerId, callerName)`(estimate 조회 404 → revisionService.restore → save → EstimateDetailResponse.from). **SSE 없음**(estimate broker 부재). SlipService.restoreToRevision 미러(broker.publish 제거).
- [ ] **Step 5~6**: 테스트 GREEN(라인 add/remove/수정 + locked 차단) + commit `feat(estimate-restore): point-in-time 복원 (requireEditable 가드)`.

## Task 4: REST API (EstimateRevisionController + DTO)

**Files:** Create `.../revision/web/EstimateRevisionController.java`, `dto/EstimateRevisionResponse.java`.

- [ ] **Step 1**: `EstimateRevisionResponse` record(revisionNo/revisionType/sourceRevisionNo/estimateNo/estimateDate/actorName/createdAt/changeSummary{headerChanged,lineAdded,lineRemoved,lineModified}). **actorId 미노출.** SlipRevisionResponse 미러.
- [ ] **Step 2**: `EstimateRevisionController` — `@RequestMapping("/slips/estimates/{estimateId}")`. `GET /revisions`(@RequirePermission estimates.list VIEW → listWithSummary) + `POST /revisions/{revisionNo}/restore`(@RequirePermission estimates.list **RESTORE** → restoreToRevision, X-User-Id/X-User-Name 헤더). EstimateController actor 추출 패턴 미러(X-User-Name 추가).
- [ ] **Step 3**: compile + commit `feat(estimate-restore): 버전이력/복원 REST API`.

## Task 5: BE 통합 테스트 (Testcontainers)

**Files:** Create `.../estimate/it/EstimateRevisionRestoreIT.java`.

- [ ] **Step 1**: `extends AbstractPostgresIT` + `@AutoConfigureMockMvc`. 시나리오: ①create/update 캡처→`GET /slips/estimates/{id}/revisions` 타임라인(changeSummary, actorId 미노출) ②QUOTE_DRAFT 복원→헤더+라인 회귀 + RESTORE revision(source) ③라인 add/remove 복원 ④**ACCEPTED/CONVERTED 상태 복원 차단(409)** ⑤RESTORE deny(`check(any,eq("estimates.list"),eq(RESTORE))=false`)→403 + MASTER bypass→200 ⑥인증요청 X-User-Id+X-User-Role. EstimateControllerIT 의 seed/stub/외부 client @MockBean 패턴 미러.
- [ ] **Step 2**: `:services:slip-service:compileTestJava` 검증(실IT는 CI). commit `test(estimate-restore): Testcontainers IT`.

## Task 6: FE (버전이력 패널 + 복원)

**Files:** Create `api/estimateRevision.ts` (또는 estimateApi.ts 확장) + `components/audit/EstimateVersionHistoryPanel.tsx`. Modify `routes/EstimateDetailPage.tsx`.

- [ ] **Step 1**: API — `listRevisions(estimateId)` GET `/api/v1/slips/estimates/{id}/revisions`, `restoreRevision(estimateId, revisionNo)` POST `.../{n}/restore`. slipRevision.ts 미러.
- [ ] **Step 2**: `EstimateVersionHistoryPanel`(react-query ['estimateRevisions',id], 목록+배지+changeSummary+복원 confirm modal+토스트+invalidate ['estimate',id]+['estimateRevisions',id], **잠긴 상태(ACCEPTED+)면 복원 버튼 비활성/안내**, UUID 비노출). SlipVersionHistoryPanel 미러.
- [ ] **Step 3**: EstimateDetailPage 통합. typecheck PASS. commit `feat(estimate-restore): FE 버전이력 패널 + 복원`.

## Task 7: Playwright + 문서

**Files:** Create `playwright/.../estimate-version-history.spec.ts`, `docs/dev-reports/phase-2-2-estimate-restore-version-history.md`. Modify `migration/decisions/DECISIONS.md`(D-RST-05), `docs/samhan-public-overview.html`.

- [ ] **Step 1**: Playwright(mock /revisions + restore → 패널 + 복원 confirm + 잠금 상태 표시). slip-version-history.spec.ts + mock.ts fixture 패턴 미러.
- [ ] **Step 2**: dev-report(목적/데이터/캡처/복원/API/FE/검증/범위).
- [ ] **Step 3**: DECISIONS D-RST-05(estimate=3번째 RESTORE 도메인, estimates.list RESTORE action, SSE 생략, shared 추출 재평가). overview 동기화.
- [ ] **Step 4**: commit `test(estimate-restore): Playwright + docs`.

---

## Self-Review (spec 대조)
- spec §2 데이터→T1 ✓ · §3 캡처→T2 ✓ · §4 복원/requireEditable→T3 ✓ · §5 권한(estimates.list RESTORE/PARTNER deny/MASTER)→T3/4/5 ✓ · §6 API+FE→T4/6 ✓ · §7 테스트→T5/7 ✓ · §8 범위(SSE OUT/estimate only)→plan 전반 ✓.
- placeholder: slip 미러 + grounding 시그니처 기반. EstimateLine/Estimate 실 필드는 T1~3 에서 파일 확인 의무 명시.
- type 일관: capture/restore/list/summarize/restoreFromSnapshot 시그니처 Task 간 일치(slip 동형).

## Execution
Claude 에이전트 subagent-driven. Task 단위 fresh 에이전트 + PM 검증. 완료 후 dual 리뷰(Claude 대체) → CI → PM 머지.

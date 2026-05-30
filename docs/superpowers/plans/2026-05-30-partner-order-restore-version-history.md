---
title: 주문(Partner-Order) RESTORE 버전이력 + point-in-time 복원
date: 2026-05-30
status: draft
owner: Claude (기획) → Codex (구현) / 사이클 N=2 dual review
---

# 주문(Partner-Order) RESTORE 버전이력 + point-in-time 복원 — 구현 계획

## Goal

주문(`partner-order-service`)의 헤더+라인(1:N)에 full-snapshot 버전이력 + DRAFT 상태 point-in-time 복원을 추가한다. slip(2.1)/estimate(2.2)/partner(2.3) 패턴을 이식하며, 4번째 RESTORE 도메인으로서 shared 공통부 추출(D-RST-05) 재평가 입력을 만든다.
설계: `docs/superpowers/specs/2026-05-30-partner-order-restore-version-history-design.md`.

## Context for Implementers

### 핵심 파일/패턴
- **이식 원본**: estimate RESTORE(slip-service, @OneToMany 라인) + partner RESTORE(actor UUID 가드/changeSummary/FE 패널). 라인 1:N + 상태머신은 estimate/slip 계열이 가깝다.
- **대상 서비스**: `services/partner-order-service/` · `com.samhanair.logis.partnerorder`
- **헤더 엔티티**: `domain/PartnerOrder.java` (id UUID, partnerCode, bizCode, orderNo[YYYY/MM/DD-N], status, slipNo, slipPublishStatus, totalAmount, confirmedAt, slipPublishedAt, dueDate, memo, sourceEstimateId, revisionCount)
- **라인 엔티티**: `domain/PartnerOrderLine.java` (`@OneToMany cascade=ALL orphanRemoval=false` + soft-delete `markDeleted()` + `@SQLRestriction("is_deleted = false")`). 필드: productId, modelName, productName, categoryKey, quantity, priceVat, subtotal, remark
- **상태머신**: `domain/PartnerOrderStatus.java` = DRAFT(편집가능) / CONFIRMING(발행 중 transient) / CONFIRMED(잠금) / CANCELED
- **변경 경로/서비스**:
  - `service/PartnerOrderDraftService` — create(POST /drafts), update(PUT /drafts/{id}, 라인 전량교체), delete(DELETE /drafts/{id})
  - `service/PartnerOrderFromEstimateService` — createFromEstimate(POST /from-estimate/{estimateId})
  - `service/PartnerOrderConfirmService` — confirm(POST /{id}/confirm) → slip 발행
  - `service/PartnerOrderUpdateService` — update(PUT /{id}, 본사 직결 수정)
  - `service/PartnerOrderDeleteService` — delete(DELETE /{id}, soft delete)
- **기존 audit**: `audit/domain/PartnerOrderAuditLog`(필드 diff) + `domain/PartnerOrderHistory`(이벤트). full-snapshot revision 은 없음 → 신규.
- **Flyway**: `src/main/resources/db/migration/` 최신 **V6** → **V7**
- **권한 page**: `sales.partner-order.{draft,confirm,edit,history.view,...}`. `PermissionAction.RESTORE` enum 존재.
- **FE**: `clients/desktop/src/renderer/routes/SalesPartnerOrderDetailPage.tsx`(상세) / `SalesPartnerOrderListPage.tsx`(목록). 이식 원본: `components/audit/PartnerVersionHistoryPanel.tsx` + `api/partnerRevision.ts`.

### Gotchas (메모리 근거)
- **UUID 비공개**([[feedback_uuid_no_user_visibility]]): actor_name 에 UUID 저장/노출 금지 — `displayNameOrNull()` 가드. 게이트웨이가 X-User-Name 미전파 시 principal=UUID(PR #320 F4 회귀).
- **채번 race**: revision_no = MAX+1, `saveAndFlush` + DataIntegrityViolation 1회 재시도 → 409.
- **revisionCount 혼선 주의**: PartnerOrder.revisionCount(기존 audit 채번) 와 partner_order_revisions.revision_no 는 별개 채널. 본 테이블 독립 채번.
- **DRAFT-only 복원**: CONFIRMING/CONFIRMED/CANCELED 복원 시 409. CONFIRMED 는 slip 발행 연동되어 정합성 붕괴.
- **IT 실 HTTP**([[feedback_enforcement_real_http_test]]): `@MockBean DynamicPermissionClient` 7-action stub + X-User-Id 헤더. 외부 client(@MockBean SlipServiceClient/InventoryClient 등) 격리([[feedback_it_mockbean_external_clients]]). skipped=0.
- **Docker 실 QA**([[project-local-stack-qa-gotchas]]): partner-order-service 본 브랜치 `docker compose build` 재빌드(jar-only stale 주의), 게이트웨이 격차 우회, react-query invalidate 누락 stale(PR #320 F5).
- **한국어 Javadoc + dev-report 누적**([[feedback_function_documentation]] / [[feedback_continuous_docs_sync]]).

---

## Phases and Tasks

### Phase 1 — BE 데이터 + 엔티티 (기반)

#### Task 1: Flyway V7 partner_order_revisions 테이블
**Files:** `services/partner-order-service/src/main/resources/db/migration/V7__add_partner_order_revisions.sql`

**Step 1: 테스트** — Testcontainers 부팅 시 Flyway 적용 확인(별도 단위테스트 불필요, IT 검증).

**Step 2: 구현** — DDL:
- `id UUID PK`, `partner_order_id UUID NOT NULL`, `revision_no INT NOT NULL`, `revision_type VARCHAR(16) NOT NULL`(CREATE/EDIT/STATUS/RESTORE), `source_revision_no INT NULL`, `order_no VARCHAR(30)`, `snapshot JSONB NOT NULL`, `actor_id UUID`, `actor_name VARCHAR(50)`, `actor_color VARCHAR(20)`, BaseEntity 7 audit(created_at/by, updated_at/by, deleted_at/by, is_deleted)
- `UNIQUE (partner_order_id, revision_no)` (partial: `WHERE is_deleted=false` 권장) + 인덱스 `(partner_order_id, revision_no DESC)`

**Verification:**
- [ ] V7 파일 Flyway 네이밍 준수, 기존 V6 다음 번호
- [ ] `./gradlew :services:partner-order-service:compileJava` SUCCESS
- [ ] IT 부팅 시 마이그레이션 성공(Task 9에서 검증)

#### Task 2: PartnerOrderRevision 엔티티 + Repository
**Files:** `.../partnerorder/revision/domain/PartnerOrderRevision.java`, `.../revision/domain/PartnerOrderRevisionType.java`(enum CREATE/EDIT/STATUS/RESTORE), `.../revision/repository/PartnerOrderRevisionRepository.java`

**Step 2: 구현**
- BaseEntity 상속, `snapshot` 은 `@JdbcTypeCode(SqlTypes.JSON)` String/JsonNode 매핑(estimate `EstimateRevision` 미러)
- Repository: `findByPartnerOrderIdOrderByRevisionNoDesc`, `findByPartnerOrderIdAndRevisionNo`, `findTopByPartnerOrderIdOrderByRevisionNoDesc`(채번용)
- 도메인 메서드 체인(직접 set 금지) — 정적 팩토리 `PartnerOrderRevision.of(...)`

**Verification:**
- [ ] compileJava SUCCESS
- [ ] BaseEntity 7 audit 상속, soft-delete 일관

### Phase 2 — BE 스냅샷/서비스

#### Task 3: PartnerOrderSnapshot record + 직렬화
**Files:** `.../revision/snapshot/PartnerOrderSnapshot.java`(헤더 필드 + `List<LineSnapshot>`), `LineSnapshot` 중첩 record

**Step 1: 테스트** — `PartnerOrderSnapshotTest`: PartnerOrder(라인 3) → snapshot 직렬화 → 역직렬화 round-trip 필드 일치, is_deleted 라인 제외.

**Step 2: 구현** — 서비스 계층 조립(헤더 §2 필드 + is_deleted=false 라인). Jackson ObjectMapper 직렬화.

**Verification:**
- [ ] `./gradlew :services:partner-order-service:test --tests '*PartnerOrderSnapshotTest'` PASS

#### Task 4: PartnerOrderRevisionService — capture + 채번
**Files:** `.../revision/service/PartnerOrderRevisionService.java`

**Step 1: 테스트** — `PartnerOrderRevisionServiceTest`: capture 시 revision_no 단조증가, actor UUID→null 가드(`displayNameOrNull`), 동시성 충돌 시 1회 재시도 후 409.

**Step 2: 구현**
- `capture(order, type, sourceRevNo, actor)`: snapshot 조립 → revision_no=MAX+1 → saveAndFlush, DataIntegrityViolation 1회 재시도 → `ResponseStatusException(CONFLICT)`
- actorName 가드: principal 이 UUID 패턴이면 null 저장

**Verification:**
- [ ] ServiceTest PASS (채번/UUID 가드/race)

#### Task 5: PartnerOrderRevisionService — restore + DRAFT 가드
**Files:** 동일 서비스 + `domain/PartnerOrder.java`(복원 가능 가드 메서드 추가, 예: `requireRestorable()`)

**Step 1: 테스트** — `restore`: DRAFT 주문 복원 시 헤더 필드 원복 + 라인 전량교체 + 새 RESTORE revision(source 기록). CONFIRMED/CONFIRMING/CANCELED → 409.

**Step 2: 구현**
- 대상 revision 로드(없으면 404)
- `order.requireRestorable()` — status==DRAFT 아니면 `CONFLICT`
- 헤더 도메인 update 메서드로 역적용 + 라인 전량교체(기존 draft update 의 soft-delete 후 재생성 패턴 재사용)
- 복원 결과를 RESTORE type revision 으로 capture

**Verification:**
- [ ] restore 단위/슬라이스 테스트 PASS, DRAFT 외 409

### Phase 3 — BE 캡처 훅 통합

#### Task 6: 변경 경로 capture 훅 삽입
**Files:** `PartnerOrderDraftService`(create→CREATE, update→EDIT), `PartnerOrderFromEstimateService`(→CREATE), `PartnerOrderUpdateService`(본사 edit→EDIT), `PartnerOrderConfirmService`(confirm→STATUS), cancel 경로(→STATUS)

**Step 1: 테스트** — 각 경로 호출 후 revision 1건 생성 + type 정확. delete 는 revision 생성 안 함.

**Step 2: 구현** — 각 서비스 트랜잭션 내 `revisionService.capture(...)` 호출. actor = X-User-Id/Name(없으면 가드). 누락 0([[feedback_no_backlog_strict]]).

**Verification:**
- [ ] 경로별 capture 슬라이스 테스트 PASS
- [ ] delete 경로 revision 미생성 확인

### Phase 4 — BE API + 권한

#### Task 7: PartnerOrderRevisionController + DTO
**Files:** `.../revision/web/PartnerOrderRevisionController.java`, `.../revision/web/dto/PartnerOrderRevisionResponse.java`(actorId 미노출), `...RevisionDetailResponse.java`

**Step 2: 구현**
- `GET /api/v1/partner-orders/{id}/revisions` (`@RequirePermission(page, action=VIEW)`) — 목록(revision_no desc, changeSummary=인접 스냅샷 diff: 헤더 변경수 + 라인 add/remove/modify)
- `GET /api/v1/partner-orders/{id}/revisions/{no}` (VIEW) — 단일 스냅샷
- `POST /api/v1/partner-orders/{id}/revisions/{no}/restore` (RESTORE) — 복원
- page code: 신규 `sales.partner-order.revisions`(VIEW/RESTORE) 또는 `sales.partner-order.history.view` 확장 — **권한 매트릭스 일관성 기준 선택**(history.view 확장 권장, 신규 page 최소화). 결정 후 dev-report 명시.

**Verification:**
- [ ] compileJava + 컨트롤러 슬라이스 테스트 PASS
- [ ] 경로 double-prefix 없음(게이트웨이 StripPrefix 확인)

#### Task 8: 권한 grant 시드 (V8 또는 기존 seed 확장)
**Files:** partner-order-service migration 또는 권한 seed(auth-service V-series 와 정합)

**Step 2: 구현** — 비-MASTER(MANAGER/SALES 등) 에 partner-order revisions VIEW/RESTORE grant 시드(Phase 1 동적권한 운영). MASTER bypass.

**Verification:**
- [ ] seed 적용 후 IT 에서 비-MASTER VIEW 200 / 권한 없는 role RESTORE 403

### Phase 5 — FE

#### Task 9 (FE): API 래퍼 + 패널 + 페이지 통합
**Files:** `clients/desktop/src/renderer/api/partnerOrderRevision.ts`, `components/audit/PartnerOrderVersionHistoryPanel.tsx`, `routes/SalesPartnerOrderDetailPage.tsx`

**Step 2: 구현**
- `partnerRevision.ts` 미러 → `partnerOrderRevision.ts`(list/detail/restore, 경로 `/partner-orders/{id}/revisions...`)
- `PartnerOrderVersionHistoryPanel` — 목록 배지(CREATE/EDIT/STATUS/RESTORE) + changeSummary + 복원 confirm(DS Modal) + **DRAFT 아니면 복원 비활성+안내** + UUID 마스킹
- DetailPage 주문 라인 하단 패널 배치
- 복원 성공 시 `invalidateQueries(['partner-orders', id])` + `(['partner-order-revisions', id])` (F5 stale 차단)

**Verification:**
- [ ] `npm --prefix clients/desktop run typecheck` 0 err, lint 0 err, build PASS
- [ ] Playwright(Task 11) 통과

### Phase 6 — 테스트

#### Task 10 (BE IT): PartnerOrderRevisionRestoreIT (Testcontainers)
**Files:** `services/partner-order-service/src/test/java/.../revision/PartnerOrderRevisionRestoreIT.java`

**Step 2: 구현** — 실 Postgres + 실 Flyway V7. 흐름: draft create→rev1, draft update→rev2, (from-estimate/confirm 흐름), restore rev1→새 rev(헤더+라인 원복 일치), CONFIRMED 복원 409, race 채번, RESTORE deny+MASTER bypass. `@MockBean DynamicPermissionClient`(7-action)+X-User-Id, 외부 client @MockBean.

**Verification:**
- [ ] `./gradlew :services:partner-order-service:test` PASS, **skipped=0**(silent-skip 금지)

#### Task 11 (FE): Playwright
**Files:** `clients/desktop/playwright/phase-2-4-partner-order-restore/*.spec.ts`

**Step 2: 구현** — 주문 임시저장→편집→버전이력→복원 시나리오(SKIP_WEB_SERVER + Vite). testid 부여.

**Verification:**
- [ ] Playwright passed

### Phase 7 — 문서 + QA

#### Task 12: dev-report + DECISIONS + overview + README
**Files:** `docs/dev-reports/phase-2-4-partner-order-restore-version-history.md`, `migration/decisions/DECISIONS.md`(D-RST-06), `docs/samhan-public-overview.html`(주문 RESTORE 반영), `services/partner-order-service/README.md`

**Step 2: 구현** — dev-report(설계/구현/테스트/QA/D-RST-05 shared 추출 재평가 §) + D-RST-06 정식화 + overview 동기화([[feedback_samhan_public_overview_sync]]) + README.

**Verification:**
- [ ] 문서 동기화 의무 충족([[feedback_continuous_docs_sync]])

#### Task 13 (QA): Docker 실 QA 스크린샷
**Files:** `docs/qa/phase-2-4-partner-order-restore/*.png` + README

**Step 2: 구현** — partner-order-service 본 브랜치 `docker compose build` 재빌드 컨테이너 대상 등록→편집→버전이력→복원 confirm→결과 단계별 촬영, PR 인라인([[feedback_early_pr_docker_qa_screenshots]] / [[feedback_qa_docker_real_test]]).

**Verification:**
- [ ] 실 컨테이너 + 실 Postgres V7 적중 스크린샷, PR 본문 인라인

---

## Self-Review 체크
- [x] file path/엔티티/서비스명 = grounding 실측(partner-order-service, V7, PartnerOrderLine 등)
- [x] phase 순서 = 데이터→서비스→훅→API→FE→테스트→docs (bottom-up)
- [x] 각 Task 검증 명령 구체화
- [x] 아키텍처 결정은 spec 에서 완료(DRAFT-only, capture 범위, page code 후보)

## 실행 메모 (표준 프로세스)
- **⚠️ Codex 토큰 소진 → 2026-06-01(월) 12:00 복구 전까지 구현+dual리뷰 모두 Claude 에이전트 전면 대체** (개발책임자 회사 지시, 2026-05-30). partner(2.3)/estimate(2.2)/slip(2.1) 동일 패턴. 복구 후 잔여 작업은 Codex 재합류 가능.
- 구현(Codex 다운 중) = **Claude 에이전트**(backend-engineer/frontend-engineer/designer/qa-tester/devops-engineer) subagent-driven, Task 단위. (복구 후 표준: [[feedback_codex_implements_claude_reviews]] Codex 디스패치.)
- 리뷰 = Claude 5-team(+ 복구 시 Codex 5-section), **사이클 N=2 의무**([[feedback_cycle_n2_mandatory]]).
- 조기 draft PR + Docker 실 QA([[feedback_early_pr_docker_qa_screenshots]]). CI green(skipped=0) → PM 종합 → 머지.

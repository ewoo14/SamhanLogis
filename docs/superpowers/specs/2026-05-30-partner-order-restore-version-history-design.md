# 주문(Partner-Order) 버전이력 + Point-in-Time 복원 — 설계 (Phase 2.4)

> brainstorming 산출물 (2026-05-30). slip(2.1)/estimate(2.2)/partner(2.3) 패턴 이식.
> **grounding 정정**: partner-order 는 partner-service 가 아닌 **별도 `partner-order-service`** (`com.samhanair.logis.partnerorder`). 상태머신 + 라인(1:N) 보유 → slip 계열.
> **RESTORE 4번째 도메인 → D-RST-05 shared 공통부 추출 재평가 트리거.**

## 1. 문제 / 목표

주문은 거래처 포털 임시저장(draft) → 확정(confirm) → 본사 직결 수정(edit) 다중 경로로 내용이 바뀌지만, full-snapshot 버전이력/복원이 없다(현행 audit-log/history 는 필드 diff·이벤트 기록만). 본 슬라이스로 주문에 **버전이력 + point-in-time 복원** 추가.

- **버전이력**: 주문 내용 변경 시마다 헤더+라인 full-snapshot JSONB 적재. 목록/상세 조회.
- **복원**: 과거 버전 시점으로 주문 원복 (RESTORE 권한, **DRAFT 상태에서만**, 새 revision 생성).
- **UUID 비공개**: actorName 에 계정 UUID 노출 금지 (Phase 2.3 F4 회귀 차단).

## 2. 도메인 현황 (grounding 확정)

| 항목 | 주문(partner-order) |
|---|---|
| 서비스/패키지 | `services/partner-order-service/` · `com.samhanair.logis.partnerorder` |
| 헤더 엔티티 | `domain/PartnerOrder.java` — `id(UUID)`, `partnerCode`, `bizCode`, `orderNo`(YYYY/MM/DD-N 표시식별자), `status`, `slipNo`, `slipPublishStatus`, `totalAmount`, `confirmedAt`, `slipPublishedAt`, `dueDate`, `memo`, `sourceEstimateId`, `revisionCount` |
| 라인 엔티티 | `domain/PartnerOrderLine.java` — `@OneToMany(cascade=ALL, orphanRemoval=false)` + **soft-delete(`markDeleted()` + `@SQLRestriction`)**. 필드: `productId, modelName, productName, categoryKey, quantity, priceVat, subtotal, remark` |
| 상태머신 | `domain/PartnerOrderStatus.java`: **DRAFT**(편집가능) → CONFIRMING(advisory lock, 발행 중 transient) → CONFIRMED(잠금) / CANCELED(취소) |
| 편집 가드 | 전용 `requireEditable()` **없음** → 신규 설계 (DRAFT 만 복원 허용) |
| 기존 audit | `PartnerOrderAuditLog`(필드 diff) + `PartnerOrderHistory`(이벤트) **보유** — full-snapshot revision 은 없음 → 신규 |
| Flyway | partner-order-service 최신 **V6** → 다음 **V7** |
| 권한 page | `sales.partner-order.{draft, confirm, edit, history.view, edit-requests, ...}` |

### 헤더 스냅샷 필드
`orderNo, partnerCode, bizCode, status, slipNo, slipPublishStatus, totalAmount, confirmedAt, slipPublishedAt, dueDate, memo, sourceEstimateId, revisionCount`

### 라인 스냅샷 필드 (PartnerOrderLine 리스트, is_deleted=false 만)
`lineNo(또는 순서), productId, modelName, productName, categoryKey, quantity, priceVat, subtotal, remark`

## 3. 설계

### 3.1 데이터 — `partner_order_revisions` 테이블 (Flyway **V7**, partner-order-service)

> partner_revisions(partner-service V12) / estimate_revisions / slip_revisions 미러. 테이블/엔티티는 본 서비스에 신설.

```sql
CREATE TABLE partner_order_revisions (
    id                 UUID PRIMARY KEY,
    partner_order_id   UUID NOT NULL,            -- FK 미강제
    revision_no        INT  NOT NULL,            -- order 별 단조증가
    revision_type      VARCHAR(16) NOT NULL,     -- CREATE / EDIT / STATUS / RESTORE
    source_revision_no INT,                      -- RESTORE 시 출처 revision_no
    order_no           VARCHAR(30),              -- 표시 식별자 스냅샷
    snapshot           JSONB NOT NULL,           -- 헤더 + 라인 전체 full-snapshot
    actor_id           UUID,
    actor_name         VARCHAR(50),              -- UUID 금지 (displayNameOrNull 가드)
    actor_color        VARCHAR(20),
    -- BaseEntity 7 audit (created_at/by, updated_at/by, deleted_at/by, is_deleted)
    ...
    CONSTRAINT uq_partner_order_revisions UNIQUE (partner_order_id, revision_no)
);
CREATE INDEX idx_partner_order_revisions_order
    ON partner_order_revisions (partner_order_id, revision_no DESC);
```
`@JdbcTypeCode(SqlTypes.JSON)` 로 snapshot 매핑.

### 3.2 백엔드 변경

- `revision/domain/PartnerOrderRevision` 엔티티(BaseEntity) + `PartnerOrderRevisionRepository`
- `revision/service/PartnerOrderRevisionService` — 캡처(헤더+라인 직렬화) + 복원(역직렬화 → 헤더 필드 적용 + 라인 전량교체 + 새 RESTORE revision)
- `PartnerOrderSnapshot` record(서비스 계층 조립): 헤더 필드 + `List<LineSnapshot>` (is_deleted=false 라인만)
- **캡처 훅 범위 (사용자 승인 = "내용 변경 전체" — 실제 경로 기준 재매핑)**:
  | 경로 | revision_type |
  |---|---|
  | `PartnerOrderDraftService.create` (POST /drafts) | CREATE |
  | `PartnerOrderFromEstimateService.createFromEstimate` (POST /from-estimate/{id}) | CREATE |
  | `PartnerOrderDraftService.update` (PUT /drafts/{id}, 라인 전량교체) | EDIT |
  | `PartnerOrderUpdateService.update` (PUT /{id}, 본사 직결 수정) | EDIT |
  | `PartnerOrderConfirmService.confirm` (POST /{id}/confirm) | STATUS (확정 milestone 기록) |
  | cancel (CANCELED 전이) | STATUS |
  | `PartnerOrderDeleteService.delete` (soft delete) | 캡처 안 함 (복원 대상 외) |
- snapshot 직렬화 = Jackson `ObjectMapper`
- revision_no 채번: `MAX(revision_no)+1` per order, `saveAndFlush` + `DataIntegrityViolation` 1회 재시도 → 충돌 시 409 (slip race 교훈)
- 기존 `revisionCount` 필드와의 관계: revisionCount 는 audit 채번용 단조증가 → revision_no 와 별개 채널. (혼선 방지 위해 partner_order_revisions.revision_no 는 본 테이블 독립 채번)

### 3.3 복원 가드 (신규)

- **복원 허용 상태 = DRAFT 만** (`status == DRAFT`). CONFIRMING(발행 중 transient) / CONFIRMED / CANCELED → 409 CONFLICT.
  - 근거: CONFIRMED 는 slipNo·slipPublishStatus 가 slip-service 와 연동되어 과거 스냅샷 원복 시 정합성 깨짐. 본사 직결 수정(PUT /{id})은 별도 트랙으로 유지하고, 복원은 확정 전 DRAFT 편집 되돌리기로 한정.
  - **결정 포인트**: CONFIRMED 복원까지 확장할지는 OUT(후속). 본 슬라이스 DRAFT-only.
- 복원 대상 revision 의 라인 스냅샷으로 현재 라인 전량교체(soft-delete 후 재생성, 기존 draft update 패턴 재사용).

### 3.4 API

| Method | Path | Action | 설명 |
|---|---|---|---|
| GET | `/api/v1/partner-orders/{id}/revisions` | VIEW | 버전이력 목록 (revision_no desc, changeSummary) |
| GET | `/api/v1/partner-orders/{id}/revisions/{no}` | VIEW | 단일 스냅샷 상세 |
| POST | `/api/v1/partner-orders/{id}/revisions/{no}/restore` | RESTORE | 복원 (DRAFT 상태만) |

- page code: 신규 `sales.partner-order.revisions` (VIEW/RESTORE) **또는** 기존 `sales.partner-order.history.view` 확장 — 구현 시 권한 매트릭스 일관성 기준 확정. RESTORE action 은 `PermissionAction` enum 에 이미 존재.
- 비-MASTER 계정 grant 시드 (Phase 1 동적권한 운영) — 배포 체크리스트.

### 3.5 UUID 비공개 (F4 회귀 차단)

- BE: actorName 결정 시 `displayNameOrNull()` 가드 — principal 이 UUID(X-User-Id) 면 null 저장 (게이트웨이 X-User-Name 미전파 케이스). 4탭/포털 경로 actor 전달 보강.
- FE: 패널에서 actorName null/UUID 패턴 마스킹.
- 단위테스트로 회귀 가드.

### 3.6 프론트엔드

- `partnerOrderRevision.ts` API 래퍼 (partner `partnerRevision.ts` 미러)
- `PartnerOrderVersionHistoryPanel` — `PartnerVersionHistoryPanel` 이식. 버전이력 목록(배지 CREATE/EDIT/STATUS/RESTORE) + 복원 버튼 (RESTORE 권한 게이트, **DRAFT 아니면 비활성+안내**)
- `SalesPartnerOrderDetailPage.tsx` 주문 라인 하단에 패널 통합
- 복원 confirm 모달 (DS Modal) + UUID 마스킹
- 복원 성공 시 쿼리 무효화: `['partner-orders', id]` + `['partner-order-revisions', id]` (Phase 2.3 F5 stale 회귀 차단)

## 4. 테스트

- **Testcontainers IT**: `PartnerOrderRevisionRestoreIT` — draft create→rev1, draft update→rev2, from-estimate/confirm 흐름, restore rev1→새 rev(시점 원복 + 라인 일치), **CONFIRMED 복원 409**, race 채번. **실 Postgres + 실 Flyway V7 (skipped=0)**. `@MockBean DynamicPermissionClient` 7-action + X-User-Id ([[feedback_enforcement_real_http_test]]).
- **단위테스트**: actorName UUID 가드, 복원 상태가드(DRAFT-only), PartnerOrderSnapshot round-trip.
- **Playwright**: 주문 임시저장→편집→버전이력→복원 시나리오 (desktop renderer).
- **Docker 실 QA**: partner-order-service 본 브랜치 재빌드 컨테이너 대상 단계별 스크린샷 ([[qa-docker-real-test]] / [[early-pr-docker-qa-screenshots]]).

## 5. 사이클/리뷰 (dual review)

- **Codex 구현** (`mcp__codex__codex`, sandbox=danger-full-access) → Claude 5-team + Codex 5-section → **사이클 N=2 의무** → CI green (skipped=0) → 머지
- 조기 draft PR + Docker 실 QA 스크린샷
- 표준 프로세스 메모리: [[codex-implements-claude-reviews]] / [[cycle-n2-mandatory]] / [[dual-5agent-review]] / [[early-pr-docker-qa-screenshots]]

## 6. D-RST-05 shared 공통부 추출 재평가 (4번째 도메인)

slip(overlay+@OneToMany) / estimate(단순 @OneToMany) / partner(service-layer 자식 조립) / partner-order(@OneToMany 라인 + 상태머신 + 별도 서비스) 4개 비교 → 공통 revision 인프라(엔티티 골격/JSONB/채번 race/changeSummary/타임라인) 추출 가능 여부 dev-report 평가 기록. 실제 추출은 결론 따라 별도 슬라이스.

## 7. 결정 (DECISIONS 정식화 필요)

- **D-RST-06 partner-order RESTORE**: 헤더+라인 full-snapshot, 내용변경 전체+상태전이(STATUS type) 캡처, 복원=DRAFT 상태만(신규 가드), 별도 partner-order-service V7 partner_order_revisions.

## 8. 범위 / 미해결

- IN: 주문(헤더+라인) full-snapshot 버전이력 + DRAFT point-in-time 복원.
- OUT: CONFIRMED 복원 확장 / partner_order_audit_log·history 통합 / soft-delete un-delete / shared 추출(본 도메인 후 평가).
- 후속: DOWNLOAD/PRINT 실구현, shared revision 추출(D-RST-05 결론), **주문→출고전표 전환 고도화(품목별 부분전환 + 다중주문 병합)** = 본 RESTORE 다음 슬라이스 ([[project-order-slip-conversion]]).
- **DRAFT-only 복원 근거 보강**: CONFIRMED 전이 시 `PartnerOrderConfirmService` 가 slip-service 로 1:1 발행(slipNo/slipPublishStatus 연동) → CONFIRMED 주문을 과거 스냅샷으로 복원하면 이미 발행된 출고전표와 정합성 붕괴. 따라서 복원은 발행 전 DRAFT 한정.
- 구현 시 확정: page code 선택(신규 revisions vs history.view 확장), FE 패널 정확한 배치, confirm/cancel STATUS 캡처 세부.

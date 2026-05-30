# DevOps Review — Phase 2.4 partner-order RESTORE
브랜치: `feat/phase-2-4-partner-order-restore` (HEAD 9d3bcfd4)
리뷰어: Claude DevOps (cycle 1)
날짜: 2026-05-30

---

## 종합 판정: DevOps APPROVE (결함 없음, 권고 3건)

---

## 1. Flyway V7 — partner-order-service

**파일**: `services/partner-order-service/src/main/resources/db/migration/V7__add_partner_order_revisions.sql`

### 1-1. 버전 번호 연속성
- V6(`V6__add_partner_order_from_estimate_link.sql`) 다음 V7. 간극 없음. [PASS]

### 1-2. PostgreSQL 호환성

| 요소 | 판정 | 근거 |
|---|---|---|
| JSONB 타입 | PASS | PostgreSQL 9.4+ 표준. Testcontainers 에서 실 Flyway V7 적용 검증됨 (IT 주석: "skipped=0") |
| `WHERE is_deleted = FALSE` partial UNIQUE index | PASS | PostgreSQL 표준 partial index 문법. `uq_partner_order_revisions_no_active` 정확히 구성됨 |
| `ix_partner_order_revisions_order_rev` 복합 인덱스 DESC | PASS | PostgreSQL 8.3+ DESC 인덱스 컬럼 지원. 타임라인 조회 성능 최적화 방향 정합 |
| FK 미강제 설계 | PASS | 의도적 설계 (soft-delete 후 버전이력 보존). 주석에 명시되어 있음 |
| CONCURRENT 없음 | PASS | Flyway 마이그레이션 중 CONCURRENT CREATE INDEX 는 트랜잭션 내 불가. `CONCURRENT` 미사용이 옳음 |

### 1-3. 운영 lock / 롤백
- [Minor] `partner_order_revisions` 테이블 신설은 DDL-only. 운영 데이터가 없는 신규 테이블이므로 잠금 시간은 DDL lock(수 ms 수준)으로 한정됨. 문제없음.
- [Minor] Flyway 는 DDL rollback 을 기본 미지원(checksum 고정). 롤백이 필요할 경우 V7U__(undo) 스크립트를 별도 관리해야 하지만, 신규 테이블 DROP 이면 단순하여 운영 위험 낮음. 체크리스트에 "V7 undo = DROP TABLE partner_order_revisions" 한 줄 추가 권고.

---

## 2. auth V40 — seed 정합성 및 재실행 안전성

**파일**: `services/auth-service/src/main/resources/db/migration/V40__seed_phase2_4_partner_order_revisions_page.sql`

### 2-1. V39 이후 번호 연속성
- V39(`V39__account_page_permissions_overhaul.sql`) 다음 V40. 간극 없음. [PASS]

### 2-2. `ON CONFLICT` 재실행 안전성

**role_page_permission_templates**
```sql
ON CONFLICT (role_code, page_code) WHERE is_deleted = FALSE DO NOTHING
```
V39 에서 `uq_rppt_active` 인덱스를 `(role_code, page_code) WHERE is_deleted = FALSE` 로 생성했으므로 conflict target 이 정확히 일치. 재실행 시 NOTHING 처리 → 멱등 안전. [PASS]

**account_page_permissions**
```sql
ON CONFLICT (account_id, page_code) WHERE is_deleted = FALSE DO NOTHING
```
V39 에서 `uq_app_active` 인덱스를 `(account_id, page_code) WHERE is_deleted = FALSE` 로 생성. 동일 패턴. 멱등 안전. [PASS]

### 2-3. MASTER bypass 처리 정합
- V40 주석: "MASTER 는 V39 bypass 처리(role NOT IN MASTER)로 account_page_permissions 에 materialize 되지 않으므로 role_page_permission_templates 에만 삽입한다."
- V39 account materialize 쿼리: `WHERE a.role NOT IN ('MASTER', 'PARTNER')` — MASTER 제외 확인. [PASS]
- V40 account materialize: 동일하게 `AND a.role NOT IN ('MASTER', 'PARTNER')` 적용. 정합. [PASS]
- DynamicPermissionClient MASTER bypass 로직과 일관. [PASS]

### 2-4. 기존 계정 materialize 영향
- page code `sales.partner-order.revisions` 는 V40 신규 삽입. 기존 계정에 이 page code 가 있을 수 없으므로 `ON CONFLICT DO NOTHING` 이 실질적으로 비작동. 기존 계정 권한 데이터 영향 없음. [PASS]
- `can_view=TRUE` 포함: V40 에서 VIEW 와 RESTORE 를 동일 page 에 묶었으므로 MASTER/MANAGER/SALES 계정은 조회도 가능. V40 주석 및 설계서 §3.4 ("page code 신규 `sales.partner-order.revisions`") 와 일관. [PASS]

---

## 3. 서비스 간 배포 의존성

### 3-1. 의존 관계 분석
```
auth-service V40  →  sales.partner-order.revisions RESTORE grant
partner-order-service V7  →  partner_order_revisions 테이블
PartnerOrderRevisionController  →  @RequirePermission(page="sales.partner-order.revisions", action=RESTORE)
```

### 3-2. 역순 배포 시나리오 (partner-order 먼저, auth 나중)
- partner-order-service 가 먼저 배포되면 `partner_order_revisions` 테이블은 생성됨.
- 그러나 auth-service V40 미적용 상태이므로 `account_page_permissions` 에 `sales.partner-order.revisions` row 가 없음.
- `DynamicPermissionClient.check(accountId, "sales.partner-order.revisions", RESTORE)` → false → 403.
- **결과: RESTORE 엔드포인트가 모든 비-MASTER 역할에 403 반환. 조회(VIEW) 엔드포인트는 `sales.partner-order.history.view` 로 별도 page 이므로 영향 없음.**
- MASTER 는 bypass 이므로 auth V40 미적용 상태에서도 RESTORE 가능. 서비스 중단 없이 일부 기능만 제한됨.

### 3-3. 권장 배포 순서
- [P1] **auth-service 먼저 배포(V40 적용) → partner-order-service 배포(V7 적용)** 순서를 PR 본문/체크리스트에 명시 권고.
- 역순이어도 서비스 장애(500)는 없고 RESTORE 403 제한 상태로 degraded 운영 가능하지만, 사용자 혼란 방지를 위해 배포 순서 문서화를 권고함.
- 체크리스트 현황(`docs/qa/phase-2-4-partner-order-restore/pr-body.md`): 배포 순서 명시 미확인 — 추가 권고(Minor).

---

## 4. CI matrix — 빌드/테스트 포함 여부

### 4-1. partner-order-service
- `accounting+partner` group: `:services:partner-order-service:test` 포함. [PASS]
- `PartnerOrderRevisionRestoreIT` 는 Testcontainers 기반 IT. `AbstractPostgresIT` → `DockerAvailableCondition` 로 Docker 미가용 시 자동 skip. CI 환경(ubuntu-latest)에서 Docker 가용 확인 step 이 있으므로 실행됨. [PASS]
- V7 Flyway 마이그레이션: Testcontainers PostgreSQL 부팅 시 실 Flyway 적용. IT 주석 "실 Postgres + 실 Flyway V7 (skipped=0)" 확인. [PASS]
- Tesseract 설치 step: `accounting+partner` group 에서만 실행 (`if: matrix.group.name == 'accounting+partner'`). 정합. [PASS]

### 4-2. auth-service
- `shared+auth+gateway` group: `:services:auth-service:test` 포함. [PASS]
- V40 마이그레이션을 직접 검증하는 auth-service IT 존재 여부는 본 리뷰 범위 외. 단, V40 은 seed DML 이고 `ON CONFLICT DO NOTHING` 으로 멱등하므로 별도 마이그레이션 IT 없어도 Flyway 자체 체크섬 검증으로 충분.

### 4-3. paths-ignore 점검
- `docs/**` 는 CI trigger 에서 무시. `docs/qa/phase-2-4-partner-order-restore/` 변경만으로 CI 불필요 재실행 없음. [PASS]
- `services/partner-order-service/src/main/resources/db/migration/**` 은 paths-ignore 에 없음 → Flyway SQL 변경 시 CI 정상 재실행. [PASS]
- `services/auth-service/src/main/resources/db/migration/**` 동일. [PASS]

---

## 5. 마이그레이션 운영 체크리스트

현황: 명시적 체크리스트 파일 미확인. 다음 항목을 PR 본문에 추가 권고(Minor):

```
[ ] auth-service 배포 (V40 적용 확인) → partner-order-service 배포 (V7 적용 확인)
[ ] Flyway migration 완료 로그 확인 (Successfully applied 2 migrations, auth: V40 / partner-order: V7)
[ ] MASTER 계정으로 RESTORE 엔드포인트 smoke test (auth V40 적용 전/후 각 1회)
[ ] MANAGER/SALES 계정으로 RESTORE 성공 확인 (auth V40 적용 후)
[ ] PARTNER 계정 RESTORE 403 확인
[ ] 복원 실패(409 CONFIRMING/CANCELED) 케이스 수동 확인
[ ] (롤백 필요 시) auth V40 undo: DELETE FROM role_page_permission_templates WHERE page_code='sales.partner-order.revisions'
    + DELETE FROM account_page_permissions WHERE page_code='sales.partner-order.revisions'
    + partner-order V7 undo: DROP INDEX / DROP TABLE partner_order_revisions
```

---

## 6. 로그 및 UUID 노출 점검

### 6-1. 서버 로그
```java
log.warn("[PartnerOrderRevisionService] revision_no 채번 충돌 1차 재시도 — orderId={}", orderId);
log.info("[PartnerOrderRevisionService] soft-deleted 주문 undelete — orderId={}", orderId);
```
- orderId(UUID) 는 서버 내부 로그에만 기록. 클라이언트 응답으로 노출되지 않음. [PASS]
- `GlobalExceptionHandler.handleResponseStatus()`: `ex.getReason()` 을 응답 body 에 포함.
  - 404 이유: "주문을 찾을 수 없습니다. orderId=" + orderId — **UUID 가 API 응답 body 에 포함됨.**
  - 404 이유: "복원 대상 revision 이 없습니다. orderId=" + orderId + ", revisionNo=" + targetRevisionNo — 동일.
  - 409 이유: "동시 수정 충돌로 버전 캡처에 실패했습니다. 잠시 후 다시 시도해 주세요." — UUID 없음. [PASS]
  - **[Minor] 404 응답에 orderId UUID 포함.** `feedback_uuid_no_user_visibility` 원칙("모든 클라이언트 화면에서 UUID 노출 금지")의 취지에는 저촉되나, 404 는 정상적인 브라우저 사용 시 발생하지 않고 개발/디버그 용도로 허용 가능한 범위. 단, 클라이언트(FE)가 에러 메시지를 toast/alert 에 직접 표시하는 경우 UUID 가 노출될 수 있음. FE 에러 핸들러에서 reason 메시지를 그대로 표시하지 않도록 주의 권고.

### 6-2. 응답 DTO UUID 노출 점검
- `PartnerOrderRevisionResponse`: actorId 필드 없음. actorName(표시명) + actorColor 만 포함. [PASS]
- `PartnerOrderRevisionDetailResponse`: actorId 필드 없음. SnapshotView 에 내부 UUID(sourceEstimateId) 미포함. LineView 에 productId 없음. [PASS]
- `PartnerOrderRestoreResponse`: `PartnerOrderDetailResponse.from(result.order())` 위임. PartnerOrderDetailResponse 의 UUID 노출 여부는 기존 코드 책임 (본 슬라이스 변경 없음). [PASS 범위 내]
- `displayNameOrNull()`: UUID_PATTERN 매칭 + actorId.toString() equalsIgnoreCase 이중 가드. 게이트웨이 X-User-Name 미전파 케이스 완전 차단. [PASS]
- IT 케이스1: actorName=SALES_ACCOUNT_ID(UUID) 전달 시 응답 `$.data[0].actorName` doesNotExist 확인. 단위 회귀 가드 존재. [PASS]

---

## 요약

| 번호 | 등급 | 항목 | 권고 |
|---|---|---|---|
| 1 | Minor | V7 undo 스크립트 미명시 | PR 체크리스트에 "V7 undo = DROP TABLE" 추가 |
| 2 | Minor | 배포 순서 미명시 | PR 체크리스트에 "auth 먼저 → partner-order" 명시 |
| 3 | Minor | 404 응답 body 에 orderId UUID 포함 | FE 에러 핸들러에서 reason 메시지 직접 노출 금지 주의 |

P0/P1/P2 결함 없음. DevOps APPROVE.

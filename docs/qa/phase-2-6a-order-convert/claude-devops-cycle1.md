# DevOps 리뷰 — Phase 2.6a 부분전환 (cycle 1)

> 브랜치: feat/phase-2-6-order-to-slip-conversion  
> HEAD: 0c79ef4d  
> 리뷰어: DevOps (Claude)  
> 날짜: 2026-05-30  
> 범위: Flyway V8(partner-order) + V29(slip) + V41(auth) + CI ci.yml

---

## 점검 1 — V번호 정합

### partner-order-service V8

- 현재 최신: V7__add_partner_order_revisions.sql (src/main/resources/db/migration 기준)
- 신규: V8__add_partner_order_line_converted_quantity.sql
- 판정: **정합** (V7 다음 V8, 간격 없음)
- 심각도: 해당 없음

### slip-service V29

- 현재 최신: V28__add_estimate_revisions.sql
- 신규: V29__add_slip_line_source_order_line.sql
- V27: slip_revisions / V28: estimate_revisions (둘 다 이번 브랜치 이전 커밋에서 확인됨)
- 판정: **정합** (V28 다음 V29, 간격 없음)
- 참고: 리뷰 지침에 "기존 grounding 이 V9 였는데 V29 면 그 사이 번호 확인" 이라고 언급되었으나,
  실제 파일 목록에 V1~V28 전부 존재함. V10~V28 사이 번호 모두 src/main/resources 에 실재.
  V29 는 연속이므로 문제 없음.
- 심각도: 해당 없음

### auth-service V41

- 현재 최신 확인: V40__seed_phase2_4_partner_order_revisions_page.sql
- 신규: V41__seed_partner_order_convert_page.sql
- 판정: **정합** (V40 다음 V41, 간격 없음)
- 심각도: 해당 없음

---

## 점검 2 — 마이그레이션 안전성

### V8 — converted_quantity INT NOT NULL DEFAULT 0

- `ALTER TABLE partner_order_lines ADD COLUMN converted_quantity INT NOT NULL DEFAULT 0;`
- PostgreSQL 은 `NOT NULL DEFAULT <상수>` ADD COLUMN 을 table-rewrite 없이 처리 (pg 11+,
  fast-path metadata only). 기존 row 는 DEFAULT 0 으로 가상 채움.
- **운영 lock 위험**: 없음. 짧은 AccessExclusiveLock (메타데이터 변경 수준) 만 발생하며
  대형 테이블에서도 수 ms 수준.
- 기존 row 안전성: 완전 안전. 기존 partner_order_lines row 의 converted_quantity = 0 으로
  초기화되며 `remainingQuantity = quantity - 0 = quantity` 로 자연스럽게 동작.
- 판정: **[P0 없음, PASS]**

### V29 — source_order_line_id UUID (nullable)

- `ALTER TABLE slip_lines ADD COLUMN source_order_line_id UUID;`
- nullable ADD COLUMN — PostgreSQL 은 table-rewrite 전혀 없이 처리. lock 위험 없음.
- 기존 slip_lines row: source_order_line_id = NULL 유지. 기존 발행 경로 영향 없음.
- SlipLine 엔티티 `@Column(name = "source_order_line_id")` (nullable 기본값 = true) 와 정합.
- 오버로드 팩토리 `SlipLine.create(..., String note)` (sourceOrderLineId = null 전달) 존재 확인
  → 기존 SlipPublishService 의 모든 호출처는 기존 시그니처를 계속 사용하므로 회귀 없음.
- 판정: **[P0 없음, PASS]**

### V41 — ON CONFLICT 재실행 안전성

- role_page_permission_templates: `ON CONFLICT (role_code, page_code) WHERE is_deleted = FALSE DO NOTHING`
- account_page_permissions: `ON CONFLICT (account_id, page_code) WHERE is_deleted = FALSE DO NOTHING`
- 멱등성: **완전 안전**. 재실행 시 중복 삽입 없이 NOTHING 처리.
- V40 패턴과 동일 구조(MASTER 템플릿만, 비-MASTER 계정 materialize). 일관성 유지.
- `CREATE EXTENSION IF NOT EXISTS "pgcrypto"` 멱등 처리 포함.
- 판정: **[P0 없음, PASS]**

---

## 점검 3 — 3서비스 동시 배포 의존성 [P1]

### 의존 관계 분석

```
partner-order-service (V8 + convert API)
  → SlipServiceClient.publishFromPartnerOrder() 호출 시 slip-service 필요
  → auth V41 page 코드 기준 권한 체크 (DynamicPermissionClient) 필요
```

- **slip-service (V29)**: source_order_line_id 컬럼 추가. partner-order 가 slip 에 전달하는
  payload 에 sourceOrderLineId 가 포함됨. slip-service 에 V29 가 없으면
  SlipPublishService 가 컬럼을 모르는 상태로 동작 → JPA 매핑 오류 없음(nullable, insert 에서만
  채움) 이지만, DB 에 컬럼이 없으면 실행 시 `column "source_order_line_id" does not exist` 오류 발생.
- **auth-service (V41)**: convert endpoint 에 `@PreAuthorize("@permGuard.check(..., 'sales.partner-order.convert', CREATE)")` 가 있다고 가정하면, V41 시드가 없어도 런타임 체크는 동작하나 기존 계정에 permission row 가 없어 403 이 될 수 있음.

### 권장 배포 순서

**현황**: sp-d4-deploy-rolling-order.md 에 auth 우선 → 도메인 서비스 순차 롤링 패턴이 문서화되어 있음.

Phase 2.6a 에 대한 **배포 순서 문서가 존재하지 않음** — 이것이 주요 지적 사항.

권장 순서:

1. **auth-service** (V41 먼저) — page row 선적재. partner-order convert 호출 이전 권한 체크 준비.
2. **slip-service** (V29) — source_order_line_id 컬럼 선적재. partner-order 가 slip 을 호출하기 전에 컬럼 존재해야 함.
3. **partner-order-service** (V8 + convert API) — 양쪽 의존 서비스 준비 완료 후 배포.

### 결함

- **[P1]** Phase 2.6a 배포 순서를 명시한 문서 없음. 기존 `docs/operational-validation/sp-d4-deploy-rolling-order.md` 패턴과 동일하게 `docs/operational-validation/phase-2-6a-deploy-order.md` 작성 권장.
  - 특히 "slip V29 먼저 → auth V41 먼저 → partner-order V8 마지막" 순서와 smoke test 커맨드 포함 필요.

---

## 점검 4 — CI 커버리지

### partner-order-service PartnerOrderConvertIT 위치

- 패키지: `com.samhanair.logis.partnerorder.it.PartnerOrderConvertIT`
- CI group: **accounting+partner** — `:services:partner-order-service:test` (필터 없음, 전체 테스트 실행)
- PartnerOrderConvertIT 는 `AbstractPostgresIT` 상속 → `DockerAvailableCondition` 으로 Docker 미가용 시 skip, 가용 시 Testcontainers 실행.
- GitHub Actions runner (`ubuntu-latest`) 는 Docker 가용 → **CI 에서 PartnerOrderConvertIT 가 실제 실행됨**.
- 단위 테스트 `PartnerOrderLineConvertTest` 도 동일 group 에서 실행됨.

### slip-service 커버리지

- slip-service 변경: V29 + SlipLine 엔티티 + SlipLine.create() 오버로드 + PublishLineRequest.
- V29 는 slip-units group 의 도메인/서비스 단위 테스트 + slip-it-core/slip-it-public IT 에서 검증됨.
  Testcontainers 기동 시 Flyway 가 V29 포함한 전체 마이그레이션을 실행하므로 구조 검증 가능.

### paths-ignore 확인

- ci.yml 의 `paths-ignore`: arologis 경로, Grafana, docs 를 제외. **Flyway SQL 경로는 제외 없음**.
  `services/slip-service/src/main/resources/db/migration/V29__...` 변경 시 CI 트리거 정상.

### 결함

- **[Minor]** PartnerOrderConvertIT 는 accounting+partner group 의 30분 timeout 내에서 Testcontainers 부팅(~15~20s) + 6개 케이스 실행 포함. 현재 partner-order-service IT 기반(HoldStatusFilterIT 등)이 30분 안에 통과 전례가 있으므로 timeout 위험 낮음. 그러나 만약 accounting+partner group 에서 Testcontainers IT 가 다수 추가되면 slip-it-* 처럼 분리 검토 필요. 현 시점에서는 허용 범위.

---

## 점검 5 — 회귀 위험 (slip V29 + 기존 발행 경로)

### 기존 slip 발행 경로 영향

- 기존 `SlipPublishService` 의 모든 라인 생성 호출은 `SlipLine.create(slip, productId, productName, modelName, specification, quantity, unitPrice, note)` — sourceOrderLineId 미포함 오버로드.
- 오버로드 `SlipLine.create(..., String note)` 가 `new SlipLine(..., null)` 을 호출 → source_order_line_id = NULL.
- V29 는 nullable 컬럼 추가이므로 기존 row + 신규 일반 발행 row 모두 source_order_line_id = NULL. 아무런 제약 위반 없음.
- JPA `@Column(name = "source_order_line_id")` nullable 기본값 = true → Hibernate schema-validate 통과.
- 판정: **회귀 없음 [PASS]**

---

## 종합 판정

| 항목 | 심각도 | 판정 |
|---|---|---|
| V번호 정합 (3건) | - | PASS |
| V8 NOT NULL DEFAULT 0 안전성 | - | PASS |
| V29 nullable 추가 안전성 | - | PASS |
| V41 ON CONFLICT 멱등성 | - | PASS |
| 3서비스 배포 순서 문서 누락 | P1 | 요구 |
| CI accounting+partner 그룹 IT 커버 | Minor | 허용 |
| slip 기존 발행 경로 회귀 | - | PASS |

### P1 결함 요약

1. **[P1] 배포 순서 문서 없음**: `docs/operational-validation/phase-2-6a-deploy-order.md` 를 PR 에 포함시켜야 함. auth-service(V41) → slip-service(V29) → partner-order-service(V8) 순서와 각 단계 smoke test (convert endpoint 권한 체크, SlipPublishService health) 를 명시할 것.

### Minor 결함 요약

1. **[Minor] CI accounting+partner Testcontainers timeout 모니터링**: 현재는 30분 내 통과 가능하나, 해당 group IT 건수 누적 시 재검토 필요. dev-report 에 메모 권장.

---

## DevOps 최종 판정

**CONDITIONAL APPROVE** — P1 결함(배포 순서 문서 누락) 해소 후 최종 승인.  
마이그레이션 SQL 자체의 안전성·번호 정합·멱등성은 모두 합격. CI 커버리지 정상.  
배포 운영 절차 문서만 보완하면 머지 가능.

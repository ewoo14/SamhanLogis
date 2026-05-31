# D2 다중주문 병합 전환 — DevOps 리뷰 (사이클 1)

리뷰어: Claude DevOps  
브랜치: feat/d2-order-merge-to-slip  
날짜: 2026-05-31  
대상 커밋: a2aec900, e2f66a22, acc28984  

---

## 1. Flyway V30 안전성

### 1-1. 버전 정합

현재 slip-service Flyway 체인: V1 → V29 (V11 은 V10 다음에 실행되는 접두숫자 정렬 순서). V30 이 연속으로 등록됨. 간격 없이 정합.

V11 (`_concurrently_signature_indexes`) 이 숫자 정렬 상 V11 위치에 배치되므로 Flyway 실행 순서는 숫자 오름차순(1,2,3,...,10,11,12,...,29,30)으로 문제없음. V30 체크섬은 파일 내용이 확정되면 Flyway 가 최초 실행 시점에 계산·저장하므로 별도 조치 불필요.

### 1-2. DDL 안전성 (운영 무중단)

V30 은 `CREATE TABLE slip_source_orders` 순수 신설이다. 기존 테이블(`slips`, `slip_lines` 등) 에 `ALTER`/`DROP` 없음. PostgreSQL 에서 신규 테이블 생성은 전체 락 없이 즉시 완료되므로 운영 배포 중 다운타임 0.

### 1-3. FK 정합

```sql
slip_id UUID NOT NULL REFERENCES slips(id)
```

`slips` 테이블은 V1 에서 생성된 기존 테이블이므로 FK 참조 대상 존재 확인됨. `partner_order_id` 는 cross-service UUID 추적용으로 FK 미설정이 의도적(이종 DB). 정합 이상 없음.

### 1-4. BaseEntity 컬럼명 정합

BaseEntity 정의:

| JPA 필드 | DB 컬럼명 |
|---|---|
| createdAt | created_at |
| createdBy | created_by |
| modifiedAt | modified_at |
| modifiedBy | modified_by |
| deletedAt | deleted_at |
| deletedBy | deleted_by |
| isDeleted | is_deleted |

V30 DDL 컬럼 목록: `created_at`, `created_by`, `modified_at`, `modified_by`, `deleted_at`, `deleted_by`, `is_deleted` — BaseEntity 7개 컬럼 전부 일치. `NOT NULL` 제약도 BaseEntity `@Column(nullable = false)` 선언과 일치(`created_at`, `modified_at`, `is_deleted`).

**문제점 1 (MAJOR): `created_by` NOT NULL 불일치**

BaseEntity 의 `created_by` 는 `@Column(nullable = false, updatable = false, length = 50)` 로 선언되어 있다. V30 DDL 에서는 `created_by VARCHAR(255)` — NOT NULL 제약이 없다. JPA `@CreatedBy` 오디팅이 감사자(auditor) 가 null 인 상태로 INSERT 를 시도하면 DB 레벨 제약이 없어 통과하나 JPA 어노테이션 의미와 괴리된다. 타 테이블 DDL 패턴(V1 등)을 보면 `created_by` 에 `NOT NULL` 을 두거나 VARCHAR(50) 로 제한한다.

추가 불일치: V30 에서 `created_by`, `modified_by` 가 `VARCHAR(255)` 인데, BaseEntity 어노테이션은 `length = 50` 을 명시한다. 다른 마이그레이션(V8 `slip_publish_audit` 등)에서 패턴이 혼재하는 경우가 있으나, 신규 테이블은 `VARCHAR(50)` 정합이 권장된다.

### 1-5. 인덱스 충분성

```sql
CREATE INDEX ix_slip_source_orders_slip  ON slip_source_orders(slip_id);
CREATE INDEX ix_slip_source_orders_order ON slip_source_orders(partner_order_id);
```

`findAllBySlipId`, `findAllByPartnerOrderId` 두 Repository 쿼리 모두 인덱스로 커버됨. 추가 복합 인덱스 불필요(현재 쿼리 패턴 기준).

### 1-6. 롤백/Idempotent

V30 은 DDL-only(CREATE TABLE + CREATE INDEX) 이고 DML 없으므로 롤백 시 DROP TABLE slip_source_orders 로 깨끗이 복구 가능. Flyway 자체는 기본적으로 체크섬 검사를 하므로 파일 변경 금지 원칙만 지키면 됨.

### 종합 평가: PASS (경고 1건 — created_by/modified_by VARCHAR(255) vs 50)

---

## 2. 배포 순서

### 2-1. 의존 방향 분석

```
partner-order-service.SlipServiceClient
  -> POST http://slip-service/api/v1/slips/from-orders-merge   (신규 V30 엔드포인트)
```

- slip-service V30(테이블 생성) + `/from-orders-merge` 엔드포인트가 먼저 올라와야 partner-order-service 가 호출 가능.
- 반대 순서(partner-order-service 먼저 배포) 시: `POST /api/v1/slips/from-orders-merge` 가 없으므로 404 반환 → `BusinessException(INTERNAL_ERROR)` → 병합 전환 409 전체 실패. **실행 중인 단일전환 기존 경로에는 영향 없음.**

### 2-2. 배포 런북 메모

```
[D2 배포 런북 — 단일 환경(Phase 11 AWS)]

1. slip-service 배포 (먼저)
   - Flyway V30 자동 실행 → slip_source_orders 테이블 + 인덱스 생성 (10초 미만)
   - /actuator/health 200 확인
   - GET /api/v1/slips/by-source?sourceType=PARTNER_ORDER&sourceId=<임의UUID> 로 신규 코드 경로 활성 검증

2. partner-order-service 배포 (후)
   - 재시작 후 /actuator/health 200 확인
   - 병합 전환 엔드포인트 smoke: POST /api/v1/partner-orders/convert-to-slip-merge
     (X-Internal-Token + X-User-Role:MASTER 헤더 포함, sourceOrders 2건)

3. desktop 정적 빌드 배포 (FE)
   - MergeConvertDialog 화면 표시 확인 (체크박스 2건 선택 → 병합 전환 버튼 활성)

롤백 순서 (이상 발생 시):
  - partner-order-service 먼저 이전 버전 복구 (slip 호출 경로만 제거됨, DB 무변경)
  - slip-service 롤백 필요 시: V30 rollback = DROP TABLE slip_source_orders (데이터 있으면 삭제 확인 필요)
  - slip-service 이전 버전은 slip_source_orders 테이블 미사용이므로 테이블 존재해도 무해.
```

### 2-3. 런북 문서화 필요성

현재 브랜치에 배포 런북 문서가 없다. Phase 11 AWS 단일 환경에서 운영자(개발책임자)가 직접 배포하므로, PR description 에 위 배포 순서를 명기하거나 `docs/runbooks/d2-deploy.md` 를 별도 추가하는 것을 권장한다. **강제 블록은 아니나 Phase 11 cutover 전 문서화 의무화 검토 필요.**

---

## 3. CI Matrix 분석

### 3-1. 각 잡의 변경 커버리지

| CI 잡 | 변경 서비스 | 커버 여부 |
|---|---|---|
| slip-it-public | slip-service — `com.samhanair.logis.slip.publish.*` | SlipPublishMergeIT 포함 — 자동 커버됨 |
| accounting+partner | partner-order-service 전체 | PartnerOrderMergeConvertIT + PartnerOrderMergeConvertServiceTest 포함 — 자동 커버됨 |
| frontend-desktop | clients/desktop — typecheck + lint + build | MergeConvertDialog.tsx + sales.ts 변경 포함 — 자동 커버됨 |

**추가 CI 잡 변경 불필요.** 세 그룹이 현재 패턴 그대로 신규 코드를 완전히 커버한다.

### 3-2. Testcontainers 게이트

`SlipPublishMergeIT` 와 `PartnerOrderMergeConvertIT` 는 모두 `AbstractPostgresIT` 를 상속하며, Docker 미가용 시 `@DisabledIfDockerNotAvailable`(또는 유사 가드) 로 자동 skip 처리가 되는지 확인 필요. GitHub Actions ubuntu-latest 에서는 Docker 가 항상 가용하므로 skip=0 이 기대값이다. 현 패턴에서 `AbstractPostgresIT` 는 Testcontainers PostgreSQL 컨테이너를 기동하는 표준 클래스이므로 CI 환경에서 정상 실행 예상.

**문제점 2 (MINOR): Testcontainers skipped=0 명시 모니터링 부재.** 현 CI 는 JUnit XML 업로드 후 `action-junit-report` 로 결과를 게시하지만, skipped 수에 대한 gating 조건(`require_tests: false` 설정됨)이 없다. Docker 가용 환경에서 skip 발생 시 조용히 통과할 위험. 현재는 허용 수준이나 Phase 11 배포 전 `require_tests: true` 또는 별도 skip 카운트 단언 고려.

---

## 4. 게이트웨이 라우팅

### 4-1. `/api/v1/slips/from-orders-merge`

```yaml
# application.yml
- id: slip-service-v1
  uri: lb://slip-service
  predicates:
    - Path=/api/v1/slips/**
  filters:
    - StripPrefix=2
    - JwtAuthentication
```

`/api/v1/slips/from-orders-merge` 는 `Path=/api/v1/slips/**` 에 매칭 → StripPrefix=2 후 `/slips/from-orders-merge` 로 전달 → `SlipPublishController`의 `@PostMapping("/from-orders-merge")` (`@RequestMapping("/api/v1/slips")` 선언됨).

**주의:** slip-service 의 `SlipPublishController` 는 `@RequestMapping("/api/v1/slips")` 풀패스를 보유한다. StripPrefix=2 를 적용하면 게이트웨이가 `/api/v1` 두 세그먼트를 제거한 뒤 `/slips/from-orders-merge` 를 서비스로 전달한다. 그런데 컨트롤러는 `/api/v1/slips` 풀패스를 보유하므로 서비스 컨테이너 내부에서는 `server.servlet.context-path` 설정이 없다면 `/slips/from-orders-merge` 를 직접 수신해야 한다.

**문제점 3 (MAJOR): StripPrefix=2 + 풀패스 컨트롤러 충돌 위험.**

`SlipPublishController`가 `@RequestMapping("/api/v1/slips")` 로 등록되어 있다. StripPrefix=2 적용 시 게이트웨이는 `/api/v1/slips/from-orders-merge` 에서 `/api/v1` 를 제거하여 `/slips/from-orders-merge` 를 slip-service 로 전달한다. slip-service 내부에서 `/api/v1/slips/from-orders-merge` 로 라우팅되려면 컨트롤러의 풀패스가 `/slips/from-orders-merge` 와 매칭되지 않는다.

그러나 기존 경로(`/from-partner-order`, `/from-estimate`, `/by-source`)가 동일 컨트롤러에서 이미 동작 중이므로, 실제 운영에서 slip-service 가 `/api/v1/slips/...` 를 수신(StripPrefix 없이, 또는 컨텍스트 패스 설정)하거나 별도 no-strip route 가 존재할 가능성이 있다.

게이트웨이 yml 주석에서 "일부 controller(partner-order-service, slip-service SlipPublishController 등)는 /api/v1/... 풀패스로 등록 → 본 gateway 에서 StripPrefix=2 후 다시 controller 측 prefix 적용 필요 → 별도 route 분기(NoStripPrefix)" 라는 설명이 있다. 그러나 `slip-service-v1` 라우트에는 `StripPrefix=2` 가 설정되어 있고 별도 no-strip 라우트가 보이지 않는다.

**기존 경로가 동작하고 있다면 이미 어떤 방식으로든 해결된 것**이나, 신규 경로 추가 전 실제 동작 방식을 명확히 확인하지 않으면 위험하다. PR 머지 전 slip-service 컨테이너의 실 경로 수신 방식(`server.servlet.context-path` 또는 컨텍스트 설정) 을 확인해야 한다.

### 4-2. `/api/v1/partner-orders/convert-to-slip-merge`

```yaml
- id: partner-order-service-v1
  uri: lb://partner-order-service
  predicates:
    - Path=/api/v1/partner-orders/**
  filters:
    - JwtAuthentication
```

`StripPrefix` 없음(no-strip). `/api/v1/partner-orders/convert-to-slip-merge` 가 그대로 partner-order-service 로 전달된다. `PartnerOrderConvertController`의 `@RequestMapping("/api/v1/partner-orders")` + `@PostMapping("/convert-to-slip-merge")` 와 정확히 매칭됨. **별도 라우트 추가 불필요. 정상.**

---

## 5. 내부 호출 헤더 일관성

### 5-1. `SlipServiceClient.publishFromOrdersMerge` 헤더 체크

```java
.header(INTERNAL_TOKEN_HEADER, requireToken())   // X-Internal-Token
.header(USER_ROLE_HEADER, INTERNAL_ROLE)          // X-User-Role: MASTER
.header(USER_ID_HEADER, INTERNAL_CALLER_ID)       // X-User-Id: 00000000-0000-0000-0000-000000000000
.header(IDEMPOTENCY_HEADER, idempotencyKey)       // Idempotency-Key
```

기존 `publishFromPartnerOrder` 와 동일한 헤더 집합. X-Internal-Token, X-User-Role:MASTER, X-User-Id (nil UUID), Idempotency-Key 4종 완전 일치.

### 5-2. `SlipPublishController.publishFromOrdersMerge` 수신

컨트롤러는 `X-User-Id` 헤더(`CALLER_HEADER`)만 직접 읽는다. X-Internal-Token 은 `InternalTokenFilter` 가 검증하고, X-User-Role 은 `RequirePermission` 애스펙트에서 처리한다. 신규 `publishFromOrdersMerge` 엔드포인트도 동일한 필터 체인을 통과하므로 일관성 유지됨.

### 5-3. 내부 호출 헤더 — 게이트웨이 경유 문제

partner-order-service → slip-service 내부 호출은 **게이트웨이를 경유하지 않고** Eureka load-balanced URI (`lb://slip-service`)로 직접 통신한다. 따라서 게이트웨이의 `JwtAuthentication` 필터가 개입하지 않아 `X-User-Role:MASTER` 수동 주입이 필요하며, 이것이 코드에 정확히 구현되어 있음. **정상.**

---

## 6. 기타 점검

### 6-1. FE Playwright spec CI 편입 여부

`clients/desktop/playwright/d2-order-merge/d2-order-merge.spec.ts` 가 추가되었다. `playwright.config.ts` 의 `testDir: './playwright'` 에 포함되어 있으므로 로컬 실행 시는 자동 탐지된다. 그러나 `qa-e2e.yml` 은 `qa/playwright` 디렉토리를 대상으로 하며, `ci.yml` 의 `frontend-desktop` 잡은 typecheck + lint + build 만 수행하고 Playwright 실행 스텝이 없다. 따라서 **D2 Playwright spec 은 현재 CI 에서 자동 실행되지 않는다.**

이는 기존 패턴(`clients/desktop/playwright/manual/` spec 들도 CI 미자동)과 일관되어 의도적 설계로 보이나, spec 파일이 존재함에도 CI 게이트가 없다는 점을 명시적으로 기록한다.

### 6-2. mock.ts D2 핸들러 — orderNo 응답 오류

```typescript
convertedOrders: orders.map((o) => ({
  orderNo: o.partnerOrderId,  // mock: 요청의 partnerOrderId 값을 orderNo 로 그대로 반환
```

주석에서 인정하듯 `partnerOrderId` 값을 `orderNo` 로 반환한다. 실제 BE 응답에서 `orderNo` 는 주문번호 문자열인데, Playwright spec 이 이를 단언할 경우 mock 값과 불일치가 발생할 수 있다. Playwright spec 시나리오 5(slipNo 확인)는 orderNo 단언을 하지 않으므로 현재는 테스트 통과에 영향 없으나, 추후 orderNo 기반 단언 추가 시 오해 소지 있음.

### 6-3. `created_by` NOT NULL 미선언 (V30 재확인)

앞서 1-4에서 지적한 내용과 동일. BaseEntity `@Column(nullable = false)` 와 V30 DDL `VARCHAR(255)` (not null 없음) 불일치. JPA AuditingEntityListener 가 감사자를 설정하지 않는 경우(anonymous/system 컨텍스트) DB 에 null 삽입 가능. 현재 `SlipSourceOrder` 는 서비스 내부에서만 생성되므로 실제 null 케이스는 없으나 DDL 방어선 강화가 권장됨.

---

## 종합 평가: CHANGES_REQUESTED

### 블록 이슈 (MAJOR, 머지 전 확인 필수)

1. **게이트웨이 라우팅 실 동작 검증 필요** (항목 4-1): `slip-service-v1` 라우트가 `StripPrefix=2` 와 풀패스 컨트롤러(`@RequestMapping("/api/v1/slips")`) 조합에서 실제로 동작하는지 확인해야 한다. 기존 경로가 이미 작동하고 있다면 신규 경로도 동일하게 작동하나, 명시적 검증 없이 머지하면 운영 배포 후 `404` 위험이 있다. IT 또는 로컬 테스트에서 `/api/v1/slips/from-orders-merge` 를 게이트웨이를 통해 호출하는 스모크 테스트를 추가하거나, 라우팅 방식(컨텍스트 패스 등)을 문서화할 것.

### 경고 이슈 (MINOR, 머지 후 후속 티켓으로 처리 가능)

2. **V30 DDL `created_by`/`modified_by` VARCHAR(255)** — BaseEntity `length = 50` 불일치. 추후 마이그레이션에서 `ALTER COLUMN ... TYPE VARCHAR(50)` 또는 `ALTER COLUMN created_by SET NOT NULL` 추가 권장.

3. **배포 런북 부재** — PR description 또는 `docs/runbooks/d2-deploy.md` 에 "slip-service 먼저, partner-order-service 후" 배포 순서 명기 필요 (Phase 11 cutover 전 의무화).

4. **CI Playwright 게이트 부재** — D2 spec 이 CI 에서 자동 실행되지 않음. `qa-e2e.yml` 또는 `frontend-desktop` 잡에 `clients/desktop/playwright` 실행 스텝 추가 고려.

5. **Testcontainers skipped=0 gating 부재** — `require_tests: false` 현행 유지 중. Phase 11 이전 `require_tests: true` 전환 검토.

---

## 배포 런북 요약 (참조)

```
배포 전제조건:
  - Docker 이미지: slip-service:d2, partner-order-service:d2, desktop:d2 빌드 완료
  - DB: AWS RDS slip DB 에 V30 미적용 상태

배포 순서:
  1. slip-service 컨테이너 rolling restart (Flyway V30 자동 실행)
     => 검증: curl -s http://slip-service:8086/actuator/health | jq .status == "UP"
  2. partner-order-service 컨테이너 rolling restart
     => 검증: curl -s http://partner-order-service:PORT/actuator/health | jq .status == "UP"
  3. nginx static 파일 교체 (desktop FE)
     => 검증: 브라우저에서 주문 목록 → 2건 선택 → 병합 전환 버튼 활성 확인

롤백 트리거: health 실패 또는 오류율 급등
롤백 순서:
  1. partner-order-service 이전 버전 재배포 (data 무변경)
  2. slip-service 롤백 필요 시: slip_source_orders 테이블에 실 데이터 없으면 DROP 후 이전 이미지
     데이터 있으면 이전 이미지만 재배포(slip_source_orders 미사용 서비스라 무해)
  3. desktop 이전 번들 교체
```

# DevOps 리뷰 — 슬라이스 D1 confirm 자동발행 폐지
- **리뷰어**: Claude DevOps (Cycle 1)
- **브랜치**: feat/slice-d1-confirm-no-autopublish
- **날짜**: 2026-05-31
- **범위**: 배포 안전성 / outbox dormant / CI matrix / Flyway / 설정·env

---

## 1. 배포 안전성 (rolling 배포 중 구/신 버전 혼재)

**결론: 안전. 가용성 개선 확인.**

### 근거

`PartnerOrderConfirmService.confirm` 의 변경은 partner-order-service **내부 로직**에만 국한된다.

- 외부 계약(API contract): `POST /confirm` 엔드포인트 경로, 요청 본문 shape(`ConfirmRequest`), 응답 shape(`ConfirmResponse`) 모두 그대로 유지된다. `ConfirmResponse` 는 기존에도 `slipNo nullable` 이었으므로(`PENDING_RETRY` 시 null 반환) FE 가 null 을 받는 경우는 이미 처리 가능한 상태이다.

- Rolling 혼재 시나리오: 구 버전 pod 는 confirm 시 slip-service 를 동기 호출하고, 신 버전 pod 는 호출하지 않는다. 두 pod 모두 자신의 트랜잭션 내에서 `partner_order` INSERT 를 완료하고 응답한다. slip-service 는 구 버전 pod 의 요청만 수신하고, 신 버전 pod 에서는 0건이다. 이 혼재 구간에서 데이터 충돌 경로는 없다. `idempotencyKey` 유니크 제약이 동일 주문 중복 생성을 차단하므로 재시도 안전하다.

- 가용성 개선: 구 버전에서 slip-service 다운/5xx 시 confirm 이 outbox fallback path 로 진입하거나 실패했으나, 신 버전에서는 slip-service 와 **의존관계가 완전히 제거**되어 slip-service 상태가 confirm 응답에 영향을 미치지 않는다. spec §5 에도 명시: "slip-service 다운 → confirm 영향 없음(더 이상 호출 안 함)".

- ResilienceConfig 의 `slipServiceClient` CircuitBreaker/TimeLimiter 설정(`resilience4j.circuitbreaker.instances.slipServiceClient`)은 application.yml 에 여전히 존재하지만, confirm 경로에서는 이 Bean 이 호출되지 않는다. 해당 설정은 convert 서비스(`PartnerOrderConvertService`)가 여전히 `slipServiceClient.publishFromPartnerOrder` 를 사용하므로 **제거하면 안 된다**. 이 점은 설정 검토 항목으로 기록한다(P2).

---

## 2. outbox/scheduler dormant (D-CF-03)

**결론: 안전. 레거시 PENDING_RETRY drain 정상 동작 유지 확인.**

### 근거

`SlipPublishOutboxScheduler` 코드 전체가 이번 브랜치에서 **변경되지 않았다**(`git diff main...HEAD --name-only` 결과에 포함되지 않음). 스케줄러는 5분 cron(`samhan.outbox.cron:0 */5 * * * *`)으로 `OutboxStatus.PENDING` 행을 계속 조회하고 처리한다.

신규 confirm 으로는 outbox 에 INSERT 가 발생하지 않는다(`PartnerOrderConfirmService` 에서 `outboxRepository` 필드 자체가 제거됨). 따라서:

- 신규 주문: outbox 행 생성 0
- 운영 기존 PENDING_RETRY 행: 스케줄러가 정상적으로 drain. `markSlipPublished` / `markSlipFailedPermanent` 도메인 메서드는 `PartnerOrder` 에 deprecated 주석을 달아 유지되므로 스케줄러가 이를 호출하는 경로도 컴파일 정상.
- 스케줄러 Bean 등록 자체는 `@Component` 로 정상 활성. Spring 컨텍스트 로드 시 outbox 관련 Bean(`SlipPublishOutboxRepository`, `SlipServiceClient`) 이 모두 존재하므로 `@RequiredArgsConstructor` 주입에 문제 없다.

in-flight 안전 요약: 운영 배포 시점에 PENDING_RETRY 상태의 레거시 주문이 있더라도 스케줄러 drain 경로는 그대로 동작한다.

---

## 3. CI matrix — accounting+partner job 실행 확인

**결론: PartnerOrderConfirmServiceIT 실제 실행(skip 아님) 확인. Testcontainers 환경도 정상.**

### 근거

`.github/workflows/ci.yml` line 74-76:

```
- name: accounting+partner
  timeout: 30
  test-tasks: ':services:accounting-service:test :services:partner-service:test :services:partner-auth-service:test :services:partner-order-service:test :services:dc-config-service:test'
```

`:services:partner-order-service:test` 가 accounting+partner 그룹에 포함되어 PR CI 시 실행된다. `slip-it-*` 제외 패턴(slip 전용)과 무관하다.

`PartnerOrderConfirmServiceIT` 는 `AbstractPostgresIT` 를 상속하며:

- `DockerAvailableCondition` — GitHub Actions ubuntu-latest 는 Docker daemon 가용. `POSTGRES.isRunning()` 조건을 통과하므로 skip 되지 않는다.
- Docker 가용성 확인 step(`docker version && docker ps`)이 test step 전에 배치되어 있어 Docker daemon 상태를 사전 검증한다.
- Testcontainers `postgres:16-alpine` 컨테이너가 IT 격리 DB 로 기동된다.
- `@MockBean`으로 5개 외부 client(`DcConfigClient`, `ProductClient`, `InventoryClient`, `SlipServiceClient`, `PartnerAuthClient`) 를 모두 격리하므로 Eureka 비활성 환경에서도 ApplicationContext 기동 정상.
- `AbstractPostgresIT.registerDatasource` 에서 `eureka.client.enabled=false` 를 DynamicPropertySource 로 주입하여 Eureka 연결 시도를 차단한다.

IT 검증 항목(spec §6 대응):

| 테스트 메서드 | 검증 내용 |
|---|---|
| `confirm_creates_draft_order_without_slip_publish` | status=DRAFT, slipNo=null, slipPublishStatus=NOT_REQUIRED, slipServiceClient.never() 검증 |
| `confirm_does_not_enqueue_outbox` | outboxRepository.count() 증가 없음 |

멱등 재confirm IT 는 현재 없다(P1 — 후술).

---

## 4. Flyway migration 변경 0 확인

**결론: DB 스키마 영향 없음. 확인 완료.**

### 근거

`git diff main...HEAD -- services/partner-order-service/src/main/resources/db/migration/` 결과 출력 없음. 마지막 migration 은 `V8__add_partner_order_line_converted_quantity.sql` 이며 이번 브랜치에서 신규 버전 파일 없음.

`PartnerOrder.createFromConfirm` 은 기존 컬럼(`status VARCHAR`, `slip_publish_status VARCHAR`)에 기존 enum 값(`DRAFT`, `NOT_REQUIRED`)을 사용한다. `DRAFT` / `NOT_REQUIRED` 는 `createFromEstimate` 경로에서 이미 사용 중이므로 DB 에 존재가 검증된 값이다. DB CHECK 제약 없음(VARCHAR 자유값). migration 불필요.

---

## 5. 설정/env 점검

**결론: slip-service URL 설정 보존 필수 조건 충족. 신규 env 없음. 확인 완료.**

### 근거

`application.yml` `external.slip-service` (`${SAMHAN_SLIP_SERVICE_URL:http://${SLIP_HOST:slip-service}:8086}`) 는 이번 브랜치에서 **변경되지 않았다**. `PartnerOrderConvertService` 가 여전히 `SlipServiceClient` 를 주입받아 `publishFromPartnerOrder` 를 호출하므로(`src/main/java/.../service/PartnerOrderConvertService.java` line 7-8, 66, 191) 이 설정은 제거 불가이며, 제거되지 않은 것이 올바르다.

ResilienceConfig 의 `slipServiceClient` 인스턴스 설정도 convert 경로에서 여전히 필요하다.

신규 환경변수: 없음. env 템플릿 변경 불필요.

---

## Findings

| # | 심각도 | 항목 | 설명 |
|---|---|---|---|
| F-1 | P1 | 멱등 재confirm IT 누락 | spec §6 에 "멱등 재confirm → 동일 주문 반환, 라인 중복 0" 테스트가 명시되어 있으나 `PartnerOrderConfirmServiceIT` 에 해당 케이스 없음. `findByIdempotencyKey` 가드는 서비스 코드에 구현되어 있으나 IT 수준 회귀 검증이 없는 상태. BE 팀 보완 필요. |
| F-2 | P2 | `resilience4j.circuitbreaker.instances.slipServiceClient` Javadoc 업데이트 | `SlipServiceClient` Javadoc 의 "confirm 흐름의 핵심" 설명이 D1 이후 부정확하다(convert 흐름의 핵심으로 변경). 운영 혼동 가능성. 후속 정리 슬라이스에서 수정 권고. |
| F-3 | P2 | `PartnerOrder.create()` 레거시 factory 여전히 unit test(`PartnerOrderConfirmServiceTest`) 에서 사용 | `PartnerOrderConfirmServiceTest.order()` 헬퍼가 deprecated `create()` 를 호출. 기능 영향 없으나 deprecated 메서드 단위 테스트 활용 일관성 측면에서 후속 cleanup 권고. |

---

## 결론

**PASS (배포 진행 가능)**

- 배포 안전성: rolling 혼재 무결함, 외부 API contract 불변, slip-service 의존 제거로 confirm 가용성 **개선**.
- outbox dormant: 레거시 PENDING_RETRY drain 경로 코드 무변경, 스케줄러 Bean 정상 활성, in-flight 안전.
- CI matrix: `accounting+partner` 그룹에 `:services:partner-order-service:test` 포함 확인, Testcontainers IT 실제 실행(skip 아님), 5개 외부 client MockBean 격리 정상.
- Flyway: migration 변경 0, DB 스키마 영향 없음.
- 설정/env: slip-service URL 및 ResilienceConfig 보존 확인, 신규 env 없음.

Finding P0: 없음. P1: 1건(멱등 재confirm IT 누락). P2: 2건(SlipServiceClient Javadoc, unit test 헬퍼 deprecated 사용).

**총 finding: P0 0건 / P1 1건 / P2 2건.**

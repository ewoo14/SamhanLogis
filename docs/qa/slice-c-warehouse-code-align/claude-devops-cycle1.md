# DevOps 리뷰 — 슬라이스 C (창고코드 정렬) cycle 1

- 리뷰어: Claude DevOps agent
- 날짜: 2026-05-31
- 대상 브랜치: feat/slice-c-slip-inventory-warehouse-code-align
- PR: #328

---

## 결론: APPROVE

결함 0건. 모든 배포·호환성·CI·마이그레이션·회로차단기 항목 PASS.

---

## 점검 결과

### 1. 배포 순서 / 하위호환성

**결론: 정순(slip → partner-order → FE) 및 역순 모두 안전.**

#### 정순(spec 권고) 배포 — 안전 확인

`PublishFromPartnerOrderRequest`(record) 의 `warehouseId` 필드는 `@Size(max=36) String warehouseId` 로 선언되어 있고, `@NotBlank` 가 없다. 즉 null 허용이다.

`SlipPublishService.resolveWarehouseId` 로직:

```java
if (warehouseId != null && !warehouseId.isBlank()) { return UUID.fromString(...); }
return warehouseCodeMapper.resolve(warehouseCode);
```

slip 배포 직후 아직 구버전 partner-order 가 warehouseId 를 전송하지 않아도, slip 은 `warehouseId = null` 처리 → yml 폴백으로 기존대로 동작한다.

#### 역순(partner-order 먼저) 배포 — 안전 확인

`SlipServiceClient.publishFromPartnerOrder` 는 `Map<String, Object>` raw payload 를 그대로 HTTP body 로 전송하는 방식이다. 구버전 slip 의 `PublishFromPartnerOrderRequest` record 가 `warehouseId` 필드를 가지고 있지 않으면 Jackson 이 역직렬화 시 미인식 필드를 처리한다.

Spring Boot 기본 Jackson 설정에서 `DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES` 는 **false** 가 기본값이다 (`spring.jackson.deserialization.fail-on-unknown-properties` 미설정 = false). 코드 내 전역 ObjectMapper 커스터마이즈나 `@JsonIgnoreProperties(ignoreUnknown=false)` 어노테이션도 존재하지 않는다. 따라서 역순 배포 중 신버전 partner-order 가 `warehouseId` 를 보내도 구버전 slip 은 해당 필드를 조용히 무시하고 기존 yml resolve 경로로 동작한다.

**rolling 배포 중 구버전 slip + 신버전 partner-order 조합**: partner-order 가 보낸 `warehouseId` 는 구버전 slip 에서 무시 → yml 폴백 실행 → yml 에 해당 inventory 코드가 없으면 400 이 발생하나, 이는 기존과 동일한 오류이지 신규 회귀가 아니다. 현재 운영 환경에서 이 경로는 사실상 미사용(전환 미배포 상태)이므로 실 영향 0.

### 2. 설정 / 환경변수

**결론: 신규 설정/환경변수 추가 없음. 기존 env 영향 없음.**

slip-service `application.yml` 의 `app.publish.warehouse-code-map` 블록은 이번 diff 에서 미변경이다.

```yaml
publish:
  warehouse-code-map:
    "[00003]": ${WAREHOUSE_UUID_HQ:11111111-...}
    "[2]":     ${WAREHOUSE_UUID_HUBAL:22222222-...}
    "[14]":    ${WAREHOUSE_UUID_ANSEONG:33333333-...}
    "[1]":     ${WAREHOUSE_UUID_CHANGWON:44444444-...}
```

`WAREHOUSE_UUID_*` 환경변수는 estimate 경로에만 사용되며 convert 경로는 경유하지 않는다. 신규 환경변수 0건. `.env` 템플릿 동기화 불필요.

### 3. CI matrix — partner-order-service 테스트 실제 실행 여부

**결론: `accounting+partner` job 에서 실제 실행됨. skip 아님.**

`.github/workflows/ci.yml` line 76:

```yaml
- name: accounting+partner
  timeout: 30
  test-tasks: ':services:accounting-service:test :services:partner-service:test :services:partner-auth-service:test :services:partner-order-service:test :services:dc-config-service:test'
```

`:services:partner-order-service:test` 가 명시적으로 포함된다.

`PartnerOrderConvertIT` 는 `AbstractPostgresIT` 를 상속하며, `DockerAvailableCondition` 이 Docker daemon 가용 시 활성, 불가 시 skip 처리한다. GitHub Actions ubuntu-latest 환경은 Docker daemon 이 활성화되어 있으므로 IT 가 실제로 실행된다. Testcontainers `postgres:16-alpine` 을 pull 하여 실 Flyway 마이그레이션 후 테스트가 실행된다.

신규 슬라이스 C 단언(`capturedPayload.get("warehouseId")` 검증)은 케이스 6 에 추가됐으며, 해당 케이스가 `accounting+partner` job 에 포함된다.

slip-service 측 신규 IT `SlipPublishWarehouseIdIT` 는 `com.samhanair.logis.slip.publish.*` 패키지에 위치하며, `slip-it-public` job 의 test-tasks:

```
':services:slip-service:test --tests "com.samhanair.logis.slip.delivery.it.*" --tests "com.samhanair.logis.slip.publish.*"'
```

`--tests "com.samhanair.logis.slip.publish.*"` 에 정확히 포함된다. CI 에서 실행됨.

### 4. Flyway 마이그레이션

**결론: 변경 없음. DB 스키마 영향 없음.**

`git diff main...HEAD -- services/slip-service/src/main/resources/db/migration/ services/partner-order-service/src/main/resources/db/migration/` 의 출력이 비어 있다. 양 서비스 모두 마이그레이션 파일 신규/수정 0건이다.

변경 단위는 DTO 필드 추가(record), 서비스 메서드 추가, FE payload 확장뿐이다. 기존 DB 컬럼 `source_warehouse_id` (slip_service V7) 는 이미 존재하는 컬럼을 기록하는 것이며 DDL 변경 없다.

### 5. 회로차단기 / 타임아웃

**결론: 회로차단기 설정 변경 없음. payload 1 필드 추가는 resilience 설정에 무영향.**

`partner-order-service application.yml` 의 resilience4j 설정은 이번 diff 에서 미변경이다:

```yaml
resilience4j:
  circuitbreaker:
    instances:
      slipServiceClient:
        slidingWindowSize: 10
        failureRateThreshold: 50
        waitDurationInOpenState: 30s
  timelimiter:
    instances:
      slipServiceClient:
        timeoutDuration: 5s
      inventoryClient:
        timeoutDuration: 3s
```

`warehouseId` String 필드 1개 추가는 HTTP payload 크기를 수십 바이트 증가시킬 뿐이며 타임아웃 임계에 영향을 주지 않는다.

`inventoryClient.resolveWarehouseIdByCode` 는 기존 Phase 2.6c 에서 이미 호출되는 경로이며 이번 슬라이스에서 호출 패턴이 변경되지 않았다.

---

## 추가 관찰 사항 (결함 아님, 참고)

**fingerprint 에 warehouseId 미포함 설계 확인**: spec §3.1 에 "fingerprint: 기존대로 warehouseCode 기준 유지(멱등 안정성 — warehouseId 는 fingerprint 에 미포함)" 라고 명시되어 있고, `computeFingerprint(PublishFromPartnerOrderRequest)` 구현이 이를 따르고 있다. convert 경로에서 같은 창고코드로 재시도 시 fingerprint 가 일치하여 멱등 replay 가 동작한다. 의도된 설계이며 결함이 아니다.

---

## finding 요약

| 번호 | 등급 | 내용 |
|---|---|---|
| — | — | 결함 0건 |

---

**결론: APPROVE. 결함 0건.**
- rolling 배포 시 역순(partner-order 먼저) 조합: Jackson 기본 `FAIL_ON_UNKNOWN_PROPERTIES=false` 로 구버전 slip 이 미인식 필드를 조용히 무시하므로 안전.
- partner-order-service 테스트: `accounting+partner` job 에서 `:services:partner-order-service:test` 로 실제 실행(skip 아님). Docker daemon 가용 → Testcontainers IT 활성.
- slip-service 신규 IT `SlipPublishWarehouseIdIT`: `slip-it-public` job `--tests "com.samhanair.logis.slip.publish.*"` 에 포함, 실제 실행.
- Flyway 변경 0, 신규 환경변수 0, 회로차단기 설정 변경 0.

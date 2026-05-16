# Stage 3 local-test seed — Phase 9/10 신규 service

> Phase 9 (partner-order-service) + Phase 10 (arologis-service) 의 풀 수준 로컬 테스트 seed 데이터 도입.
> branch = `feature/local-test-setup`. 이전 Stage 1 (partner 50 / product 100) + Stage 2 (slip 100) 시드와
> cross-service consistent 매핑을 보존한다.

## 1. 산출물

| 파일 | 역할 | 분포 |
|---|---|---|
| `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/seed/PartnerOrderSeeder.java` | PartnerOrder 30건 + 라인 ~60건 | DRAFT 5 / CONFIRMED+PENDING_RETRY 10 / CONFIRMED+PUBLISHED 15 |
| `services/partner-order-service/src/main/resources/application.yml` | 토글 추가 | `app.partner-order.seed-test-data` |
| `services/arologis-service/src/main/java/com/samhanair/logis/arologis/seed/DriverSeeder.java` | Driver 10명 | INTERNAL 5 / INSUNG 3 / KAKAO 2 (활성 9 / soft-delete 1) |
| `services/arologis-service/src/main/java/com/samhanair/logis/arologis/seed/DispatchSeeder.java` | Dispatch 20 + Vehicle ~50 + Stop ~150 | DAY 14 / NIGHT 4 / EXPRESS 2 |
| `services/arologis-service/src/main/resources/application.yml` | 토글 추가 | `app.arologis.seed-test-data` |
| `docs/dev-reports/local-test-seed-stage3.md` | 본 dev-report | — |

## 2. 활성화 방법

### partner-order-service

```bash
SPRING_PROFILES_ACTIVE=dev \
SAMHAN_PARTNER_ORDER_SEED_TEST_DATA=true \
./gradlew :services:partner-order-service:bootRun
```

### arologis-service

```bash
SPRING_PROFILES_ACTIVE=dev \
SAMHAN_AROLOGIS_SEED_TEST_DATA=true \
./gradlew :services:arologis-service:bootRun
```

이중 가드 — `@Profile("dev")` + `@ConditionalOnProperty` 모두 활성일 때만 시드 진입. 운영 / CI 에서는
양쪽 미설정 (default false) 으로 안전.

## 3. 결정적 (deterministic) 매핑

### 3.1 PartnerOrder ↔ Stage 1 partner / Stage 2 slip

| 필드 | 매핑 룰 |
|---|---|
| `orderNo` | `2026/04/15-1` ~ `2026/04/15-30` |
| `partnerCode` | Stage 1 `P-2026-0001` ~ `P-2026-0030` 순환 |
| `bizCode` | partner.bizNo 매핑 (`211-87-12345` ~ `240-87-01234`) |
| `slipNo` | seq 16~30 만 채움 — `2026/04/15-16` ~ `2026/04/15-30` (slip-service `SlipNumberService.next` 동일 포맷) |
| `idempotencyKey` | `PO-CONF-SEED-2026/04/15-N` |
| `confirmedAt` | 2026-01 ~ 2026-05 균등 분포 (월별 6건) |

### 3.2 PartnerOrderLine ↔ Stage 1 product

| 필드 | 매핑 룰 |
|---|---|
| `productId` | `UUID.nameUUIDFromBytes("samhan-seed:product:" + modelCode)` (Stage 1 product seed 와 동일 키) |
| `modelCode` | `010001` / `010002` / `010010` / `010011` / `010020` / `019001` (Samsung HVAC + 구형) |
| `quantity` | `((seq + lineIdx) % 5) + 1` (1~5) |
| 라인 수 | `((seq - 1) % 3) + 1` (1~3) → 30건 × 평균 2 = ~60 라인 |

### 3.3 Driver ↔ DispatchSeeder Vehicle

| driverCode | 이름 | source | appInstalled |
|---|---|---|---|
| DRV-2026-001 | 박배송 | INTERNAL | true |
| DRV-2026-002 | 최운송 | INTERNAL | true |
| DRV-2026-003 | 정물류 | INTERNAL | true |
| DRV-2026-004 | 강택배 | INTERNAL | true |
| DRV-2026-005 | 조운반 | INTERNAL | true |
| DRV-2026-006 | 윤이동 | EXTERNAL_INSUNG_QUICK | false |
| DRV-2026-007 | 임수송 | EXTERNAL_INSUNG_QUICK | false |
| DRV-2026-008 | 한보내 | EXTERNAL_INSUNG_QUICK | false |
| DRV-2026-009 | 오가져 | EXTERNAL_KAKAO | false |
| DRV-2026-010 | 권받기 | EXTERNAL_KAKAO | false (soft-delete) |

### 3.4 Dispatch / Vehicle / VehicleStop

| 항목 | 분포 |
|---|---|
| Dispatch (20건) | dispatchDate = 2026-04-01 ~ 2026-05-09 (2일 간격), DAY 14 / NIGHT 4 / EXPRESS 2 |
| Vehicle (~50대) | 짝수 seq → 2대 / 홀수 seq → 3대. PENDING 10 / ASSIGNED 20 / DEPARTED 15 / DELIVERED 5 |
| VehicleStop (~150개) | (seq + v) % 3 + 2 → 2~4 stop / 차량. parsedPartnerName 은 STOP_PARTNER_POOL 15 partner 순환 |
| MatchSource | INTERNAL_APP / INSUNG_QUICK / EXTERNAL_KAKAO 3 way 결정적 분할 |
| `rawKakaoText` | `KakaoDispatchParser` 재현 가능한 결정적 메시지 (audit 회귀 테스트 대응) |

## 4. idempotency 가드

| Seeder | 가드 키 | 재실행 동작 |
|---|---|---|
| PartnerOrderSeeder | `orderNo` (`PartnerOrderRepository.findByOrderNo`) | 이미 존재 시 skip — 재실행 안전 |
| DriverSeeder | `driverCode` (`DriverRepository.findByDriverCode`) | 이미 존재 시 skip |
| DispatchSeeder | (dispatchDate, dispatchType, rawKakaoText) 트리플 | rawText 가 동일하면 skip — 재실행 안전 |

## 5. 도메인 entity 한계 (skeleton 단계)

| Entity | 스펙 요구 | 실제 entity | 대응 |
|---|---|---|---|
| `Driver` | `name` / `status` 필드 | 미보유 (W10-1 skeleton) | 이름은 시드 메타데이터로 보존 (Javadoc 표 + `record DriverSeed.name`), 활성/비활성은 `BaseEntity.isDeleted` 로 표현 |
| `PartnerOrder` | `partnerName` / `orderDate` / `memo` | 미보유 | 시드 단계 skip (cross-service 매핑은 `partnerCode` / `bizCode` / `confirmedAt` 으로 충분) |
| `PartnerOrderStatus` | DRAFT / CONFIRMED / SLIP_PUBLISHED | DRAFT / CONFIRMING / CONFIRMED / CANCELED + 별도 `slipPublishStatus` | 분포 매핑 — 5 DRAFT / 10 CONFIRMED+PENDING_RETRY / 15 CONFIRMED+PUBLISHED |
| `Dispatch` | status 필드 | 미보유 | 상태는 Vehicle 집계로 관찰 (PARSING/PARSED/DISPATCHED/COMPLETED 표는 Vehicle.status 분포로 매핑) |

## 6. 컴파일 검증

```bash
./gradlew :services:partner-order-service:compileJava :services:arologis-service:compileJava
```

→ `BUILD SUCCESSFUL in 13s` (2026-05-09 검증).

## 7. 후속 — Stage 3 통합 검증 (별도 PR)

- arologis: Driver / Dispatch / Vehicle / VehicleStop CRUD endpoint 시드 데이터 응답 회귀 테스트
- partner-order: history 조회 endpoint 가 Stage 2 slip 매핑 (slipNo) 정상 반환 검증
- mobile-staff: 모바일 driver 탭이 INTERNAL 5명 표시 + EXTERNAL 5명 미표시 (appInstalled 필터) 검증

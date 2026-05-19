# SP-08-FU2 BE 테스트 안정성/정합 3건 (bulk)

**작성일**: 2026-05-19
**담당**: BE agent
**브랜치**: `feat/sp-08-fu2-test-safety-bulk`

---

## 개요

SP-08 후속 3건의 BE 정합성 fix — 테스트 안정성 및 FE 필드 누락 보완.

---

## P2-2: warehouse name snapshot (slip-service)

### 변경 파일

| 파일 | 유형 | 내용 |
|---|---|---|
| `services/slip-service/src/main/resources/db/migration/V26__add_destination_warehouse_name.sql` | 신규 | `destination_warehouse_name VARCHAR(100) NULLable` 컬럼 추가 |
| `services/slip-service/src/main/java/.../domain/Slip.java` | 수정 | `destinationWarehouseName` 필드 + `snapshotDestinationWarehouseName()` 도메인 메서드 |
| `services/slip-service/src/main/java/.../client/WarehouseInternalClient.java` | 신규 | inventory-service 창고명 internal lookup client (fail-soft) |
| `services/slip-service/src/main/java/.../web/dto/SlipDetailResponse.java` | 수정 | `destinationWarehouseName` 필드 추가 + `from()` 매핑 |
| `services/slip-service/src/main/java/.../service/SlipService.java` | 수정 | INBOUND 전표 생성 시 창고명 snapshot + `WarehouseInternalClient` 주입 |

### 설계 결정

- `snapshotDestinationWarehouseName()` 도메인 메서드 — 직접 setter 금지 컨벤션 준수
- fail-soft: inventory-service 호출 실패 시 null 유지 (FE `?? '—'` 폴백)
- IT 에서 `@MockBean WarehouseInternalClient` 격리 의무 (feedback_it_mockbean_external_clients)
- Flyway V26, NULLable — legacy 행 호환

---

## P2-3: PartnerLookupClient 실 구현 (partner-service + accounting-service)

### 변경 파일

| 파일 | 유형 | 내용 |
|---|---|---|
| `services/partner-service/src/main/java/.../controller/PartnerInternalController.java` | 수정 | `GET /internal/partners/{id}/summary` endpoint 신규 추가 |
| `services/accounting-service/src/main/java/.../client/PartnerLookupClient.java` | 수정 | `findByPartnerId()` placeholder → 실 구현 (`GET /internal/partners/{id}/summary` 호출) |
| `services/partner-service/src/test/java/.../it/PartnerInternalControllerIT.java` | 수정 | `/{id}/summary` 정상/404 시나리오 2건 추가 |
| `services/accounting-service/src/test/java/.../report/PartnerAgingServiceTest.java` | 수정 | P2-3 회귀 검증 2건 추가 |

### 설계 결정

- `PartnerInternalResponse` 재사용 — 기존 `/{partnerCode}` 와 동일 응답 구조
- `findByPartnerId` 실 구현 후 `PartnerAgingService.buildReport()` 가 자동으로 정상 조회
- fail-soft 유지: 404/5xx → empty → "(미조회)" fallback
- URL 패턴 `/{id}/summary` — 기존 `/{id}/business-number` 와 일관

---

## P2-4: LedgerLine.accountName BE DTO 추가 (accounting-service)

### 변경 파일

| 파일 | 유형 | 내용 |
|---|---|---|
| `services/accounting-service/src/main/java/.../web/dto/LedgerResponse.java` | 수정 | `LedgerLine.accountName` 필드 추가 |
| `services/accounting-service/src/main/java/.../web/dto/LedgerImageResponse.java` | 수정 | `LedgerLine.accountName` 필드 추가 |
| `services/accounting-service/src/main/java/.../service/LedgerService.java` | 수정 | `ChartOfAccountRepository` 주입 + accountCode 일괄 캐시 조회 + accountName 매핑 |
| `services/accounting-service/src/main/java/.../service/LedgerImageService.java` | 수정 | 동일 패턴 (N+1 방지 캐시 + accountName 매핑) |
| `services/accounting-service/src/test/java/.../service/LedgerImageServiceTest.java` | 수정 | `@Mock ChartOfAccountRepository` 추가 + P2-4 accountName 검증 테스트 1건 추가 |

### 설계 결정

- N+1 방지: 라인 목록에서 accountCode Set 을 일괄 추출 후 `findAllById()` 1회 호출 (인메모리 캐시)
- null 허용: 코드-계정과목 미존재 시 null 그대로 (record nullable 허용)
- `LedgerImageServiceTest` — `@MockitoSettings(strictness = LENIENT)` + `@BeforeEach` stub

---

## 검증 결과

| 서비스 | compileJava | compileTestJava | 단위 테스트 |
|---|---|---|---|
| slip-service | BUILD SUCCESSFUL | BUILD SUCCESSFUL | (IT Docker 필요 — skip) |
| accounting-service | BUILD SUCCESSFUL | BUILD SUCCESSFUL | LedgerImageServiceTest 5건 / PartnerAgingServiceTest 7건 PASS |
| partner-service | BUILD SUCCESSFUL | BUILD SUCCESSFUL | (IT Docker 필요 — skip) |

---

## 미해결 / 후속 작업

- slip-service IT 중 `@MockBean WarehouseInternalClient` 격리가 필요한 기존 IT 는 PR 이후 Docker 환경에서 검증 필요
- `destinationWarehouseName` backfill (기존 슬립 row) — 별도 운영 작업

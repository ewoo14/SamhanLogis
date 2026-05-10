# p1-5 arologis 배차 validation

- **Slice**: P1-5 arologis 배차 validation
- **날짜**: 2026-05-11
- **담당**: DevOps (infrastructure / seed / IT scaffold)
- **관련 branch**: fix/slip-service-port-env (현재 작업 브랜치)

## 개요

Phase 10 arologis-service 의 "미배차 슬립 5건 + 가용 기사 3명" 시나리오 검증을 위한
seed fixture (V6 migration) + P15ValidationIT (9 TC) 추가.

## 산출물

### 1. V6 migration seed SQL

파일: `services/arologis-service/src/main/resources/db/migration/V6__seed_p15_validation_fixture.sql`

- 가용 기사 3명: `DRV-P15-001` ~ `DRV-P15-003` (INTERNAL / appInstalled=TRUE)
- 미배차 배차 5건: `2026-05-20` DAY / `2026-05-21` DAY+NIGHT / `2026-05-22` DAY+NIGHT
- 차량 5대: 각 dispatch 당 1대 (PENDING / assigned_driver_id=NULL)
- 정차 5건: 각 vehicle 당 1건 (PENDING / parsed_partner_code=NULL)
- `ON CONFLICT DO NOTHING` — idempotent
- V2 `ux_dispatches_date_type_active` unique 제약 준수 (각 date/type 조합 고유)
- BaseEntity 7 audit fields 전부 채움

### 2. P15ValidationIT

파일: `services/arologis-service/src/test/java/com/samhanair/logis/arologis/it/P15ValidationIT.java`

`AbstractPostgresIT` 상속 (Testcontainers PostgreSQL 16-alpine 싱글턴).

@MockBean 4종 + SlipServiceClient 격리 (PR #134~#144 회고 가드):
- `PartnerClient` — lenient empty
- `UserClient` — lenient empty
- `SlipClient` — lenient false
- `NotificationClient` — lenient true
- `SlipServiceClient` — 개별 TC 에서 stub 조정

| TC | 검증 내용 | 방법 |
|----|-----------|------|
| TC-1 | fixture 기사 3명 INTERNAL + appInstalled TRUE 저장 | JPA assertThat |
| TC-2 | 미배차 배차 5건 PENDING (assignedDriverId=NULL) | JPA assertThat |
| TC-3 | 미배차 집계 — 배차 전 1건 slipServiceClient stub | UnassignedService 직접 호출 |
| TC-4 | POST .../assign-driver → 200 성공 | MockMvc |
| TC-5 | 배차 후 Vehicle ASSIGNED + assignedDriverId 非NULL | MockMvc + JPA 검증 |
| TC-6 | parsed_partner_code 매핑 후 미배차 집계 1건 감소 | MockMvc + UnassignedService |
| TC-7 | GET /admin/arologis/drivers → 3명 응답 | MockMvc |
| TC-8 | 미존재 driverCode 배차 → 404 | MockMvc |
| TC-9 | 미존재 dispatchId 배차 → 404 | MockMvc |

## 설계 결정

- **V6 SQL 고정 UUID**: Testcontainers IT 의 `@BeforeEach deleteAll()` 이 먼저 실행되므로
  V6 SQL fixture 는 "Flyway 스키마 검증" 용도. 실제 IT 데이터는 JPA `setUp()` 에서 재구성.
- **partnerCode 분리**: `parsedKakaoSeq` (Long, 카톡 번호) vs `parsedPartnerCode` (String, partner-service)
  를 명확히 구분. TC-6 에서 `updateParsedPartnerCode()` 도메인 메서드로 직접 갱신하여
  UnassignedService left-join 시뮬레이션 검증.
- **@SuppressWarnings("null")**: Spring Data JPA `save()` / `getId()` 반환값이
  Eclipse 타입 시스템의 `@NonNull` 계약과 불일치 → 헬퍼 메서드 + setUp + TC-5/TC-6 에 선별 적용.
- **미사용 변수 제거**: dispatchId2~5 반환값 discarded (테스트에서 직접 참조 불필요).

## 가드 준수 현황

| 가드 | 준수 |
|------|------|
| IT @MockBean 4종 격리 | O — PartnerClient/UserClient/SlipClient/NotificationClient + SlipServiceClient |
| UUID 비공개 가드 | O — driverCode/slipNo/partnerCode 만 사용자 노출, id 直接 미노출 |
| BaseEntity 7 audit fields | O — V6 SQL 모든 INSERT 포함 |
| Soft Delete | O — `ON CONFLICT DO NOTHING` + `is_deleted=FALSE` |
| AbstractPostgresIT 상속 | O — DockerAvailableCondition skip 가드 포함 |
| PR #134~#144 회고 가드 | O — 5종 @MockBean + lenient setup 패턴 |

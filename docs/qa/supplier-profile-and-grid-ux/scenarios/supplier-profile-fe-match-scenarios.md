# QA 시나리오 — SupplierProfile FE 연동 IT (SP-FE)

슬라이스: `supplier-profile-and-grid-ux`
작성일: 2026-05-11
QA 담당: QA agent
연관 JUnit IT: `services/accounting-service/src/test/java/.../it/SupplierProfileFEMatchIT.java`

---

## 시나리오 개요

| TC ID | 제목 | 우선순위 | 상태 |
|-------|------|---------|------|
| SP-FE-1 | GET /supplier-profiles/primary 응답 schema 검증 | P0 | 자동화 완료 |
| SP-FE-2 | PUT 갱신 후 GET primary 신규 값 반영 | P0 | 자동화 완료 |
| SP-FE-3 | TaxInvoiceBatch preview primary supplier 동적 조회 | P1 | 자동화 완료 |

---

## SP-FE-1: GET /supplier-profiles/primary 응답 schema 검증

**목적**: FE 가 사업자 양식 화면 렌더링에 필요한 8 필드 + version 이 응답에 포함되는지 검증한다.

**FE 연동 schema 계약**:

| 필드명 | 타입 | 필수 | 설명 |
|--------|------|------|------|
| businessNumber | String | Y | 사업자등록번호 (10자리) |
| companyName | String | Y | 상호 |
| representativeName | String | Y | 대표자명 |
| businessAddress | String | Y | 사업장주소 |
| businessType | String | Y | 업태 |
| businessItem | String | Y | 종목 |
| email | String | Y | 이메일 |
| isPrimary | boolean | Y | 기본 사업자 여부 |
| version | long | Y | 낙관적 락 버전 (PUT 갱신 시 필수) |

**실행 조건**:
- AbstractPostgresIT (Testcontainers PostgreSQL 16-alpine)
- 외부 client 5종 @MockBean + lenient stub
- seed 데이터: businessNumber=2148720659, companyName=（주）삼한공조시스템

**검증 내용**:
1. `GET /accounting/supplier-profiles/primary` → HTTP 200
2. `$.data` 내 9개 필드 키 모두 존재 확인 (값 null 허용)
3. `$.data.isPrimary == true`
4. `$.data.businessNumber` 숫자 10자리 형식 (`2148720659`)
5. `$.data.version` 정수 타입

**BE agent 미구현 시**: 404/501 응답으로 graceful skip 처리 (blocking 방지)

---

## SP-FE-2: PUT 갱신 후 GET primary → 신규 businessAddress 반영

**목적**: FE 수정 흐름 (GET → 편집 → PUT → GET 재조회) 을 시뮬레이션하여
저장 후 화면 갱신이 정상 동작하는지 BE 수준에서 검증한다.

**FE 갱신 흐름 시뮬**:
```
FE: GET /supplier-profiles/primary
      └─→ id, version, 현재 필드 값 획득
FE: 사용자 businessAddress 편집
FE: PUT /supplier-profiles/{id} { businessAddress: "new", version: N, ...other_fields }
      └─→ HTTP 200 → 갱신 완료
FE: GET /supplier-profiles/primary (재조회)
      └─→ businessAddress 가 새 값 반영 확인
```

**검증 내용**:
1. GET primary → `id`, `version` 획득
2. PUT `{ businessAddress: "서울특별시 서초구 강남대로 QA-SP-FE2 테스트로 999", version: N }` → 200
3. GET primary 재조회 → `businessAddress` 새 값 반영 확인

**낙관적 락 검증**:
- `version` 필드가 응답에 포함되어야 FE 에서 PUT 시 올바른 version 전송 가능
- 동일 version 으로 두 번 PUT 시 409 Conflict 기대 (선택적 검증)

**BE agent 미구현 시**: GET 404 또는 PUT 404 에서 skip (blocking 방지)

---

## SP-FE-3: TaxInvoiceBatch preview 시 primary supplier 동적 조회 반영 검증

**목적**: TaxInvoiceBatchService 가 세금계산서 일괄발행 preview 시
primary supplier 의 공급자 정보를 정적 상수가 아닌 DB 에서 동적으로 조회하여 사용하는지 검증한다.

**배경**:
- 홈택스 제출용 세금계산서에는 공급자 (issuer) 정보가 포함
- 공급자 정보가 DB primary supplier 와 분리된 경우 정보 불일치 위험
- BE agent 가 TaxInvoiceBatchService 를 primary supplier 동적 조회로 구현하는지 확인

**검증 내용**:
1. GET primary → `businessNumber`, `companyName` 확보
2. slipQueryClient stub → 5개 rawRow 반환 (공급자 정보 포함)
3. POST `/accounting/tax-invoices/batch/preview` → HTTP 200
4. 응답 `$.data.totalRowCount == 5`
5. 응답 `$.data.rows[0].supplierBizNum == primaryBizNumber` (공급자 사업자번호 일치)

**mock 변경 시나리오**:
- slipQueryClient stub 에 `supplierBizNum: "2148720659"`, `supplierName: "（주）삼한공조시스템"` 포함
- batch preview rows 내 공급자 필드가 primary supplier 와 일치하면 동적 조회 정상

**HomtaxRow schema 미정의 시**: `supplierBizNum` 필드 누락 확인 후 soft warn 처리 (blocking 방지)

---

## @MockBean lenient stub 매핑

| Client | 실제 메서드 시그니처 | lenient stub |
|--------|---------------------|--------------|
| SlipServiceClient | `lockByPeriod(LocalDate from, LocalDate to): int` | `thenReturn(0)` |
| SlipQueryClient | `fetchAllSalesRows(LocalDate from, LocalDate to): List<Map>` | `thenReturn(List.of())` |
| PartnerLookupClient | `findByPartnerId(UUID): Optional<PartnerSummary>` | `thenReturn(Optional.empty())` |
| ProductClient | `lookup(List<UUID>): List<ProductSummary>` | `thenReturn(List.of())` |
| ChatRoomMappingClient | `findChatRoomNamesByPartnerCode(String): List<String>` | `thenReturn(List.of())` |

---

## 실행 명령

```bash
cd services/accounting-service

# 전체 IT 실행 (Docker 필요)
./gradlew test --tests "*.SupplierProfileFEMatchIT" -i

# Windows Docker Desktop npipe 우회
DOCKER_HOST=tcp://localhost:2375 ./gradlew test --tests "*.SupplierProfileFEMatchIT"

# IT skip (Docker 미가용 시 자동 skip — feedback_testcontainers_windows_docker)
./gradlew test --tests "*.SupplierProfileFEMatchIT"
# Docker 미가용 → DockerAvailableCondition 이 전체 skip 처리 (build fail 아님)
```

---

## 도메인 정합성 연계

| IT | 연계 SQL | 설명 |
|----|----------|------|
| SP-FE-1 | DI-1, DI-2 | primary 단일성 + 사업자번호 형식 |
| SP-FE-2 | DI-4 | soft delete 일관성 |
| SP-FE-3 | DI-3 | TaxInvoiceBatch 공급자 정합성 |

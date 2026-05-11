# 세금계산서 일괄발행 GAS 이식 — JUnit IT E2E 시나리오 (E2E-IT 4건)

> 슬라이스: `tax-invoice-batch-gas-port`
> 작성일: 2026-05-11
> 담당: QA agent
> 연관 IT: `services/accounting-service/src/test/java/.../it/TaxInvoiceBatchEndToEndIT.java`

---

## 전제 조건

| 항목 | 내용 |
|---|---|
| 테스트 컨테이너 | PostgreSQL 16-alpine (AbstractPostgresIT 싱글턴) |
| MockBean | SlipServiceClient / PartnerLookupClient / ProductClient / ChatRoomMappingClient 4종 lenient stub |
| @MockitoSettings | LENIENT — 미사용 stub 허용 |
| Docker 미가용 | DockerAvailableCondition 이 SKIP 처리 (build fail 아님) |
| 트랜잭션 | @Transactional — 각 테스트 후 롤백 |

---

## E2E-IT-1: 5 row ISSUED → preview → Excel POI read → row count=5

**목적**: 5건 ISSUED 세금계산서 seed 후 preview API 호출 → Excel 바이너리를 Apache POI로 재파싱하여 데이터 행 수 5를 검증.

**단계**:
1. MockMvc `POST /accounting/tax-invoices` × 5건 (partnerCode=QA-PC-001, DRAFT 생성).
2. MockMvc `POST /accounting/tax-invoices/{id}/issue` × 5건 (ISSUED 전이).
3. MockMvc `POST /accounting/tax-invoices/batch/preview` (fromDate=2026-05-01, toDate=2026-05-31).
4. 응답 `$.data.totalRowCount = 5`, `$.data.batchId` 추출.
5. MockMvc `GET /accounting/tax-invoices/batch/{batchId}/excel?fileIndex=0`.
6. Apache POI `XSSFWorkbook` 로 바이너리 파싱 → `sheet.getLastRowNum() == 5` 검증.

**검증 포인트**:
- `totalRowCount = 5`
- Excel Sheet1 `lastRowNum = 5` (헤더 row 0 제외)
- 응답 바이너리 `size > 0`

**참고**: `lastRowNum`은 0-based. 헤더(row 0) + 데이터 5행 = lastRowNum 5.

---

## E2E-IT-2: 250 row → splitFileCount=3 → 각 Excel POI 행 수 100/100/50

**목적**: 250건 seed 후 100건 단위 분할(HometaxExportService.ROWS_PER_SHEET=100) 정확성을 각 fileIndex Excel로 검증.

**단계**:
1. MockMvc seed 250건 ISSUED (partnerCode=QA-PC-250, 라인 1개씩 → 행 250).
2. `POST /batch/preview` → `$.data.totalRowCount=250`, `$.data.splitFileCount=3` 검증.
3. `GET /batch/{id}/excel?fileIndex=0` → POI Sheet1 `lastRowNum=100` 검증.
4. `GET /batch/{id}/excel?fileIndex=1` → POI Sheet1 `lastRowNum=100` 검증.
5. `GET /batch/{id}/excel?fileIndex=2` → POI Sheet1 `lastRowNum=50` 검증.

**검증 포인트**:
- `splitFileCount = ceil(250/100) = 3`
- fileIndex=0: 100행, fileIndex=1: 100행, fileIndex=2: 50행
- 각 바이너리 `size > 0`

**경계 조건**: 라인 없는 계산서는 헤더 row 1개로 기록됨. 본 테스트는 라인 1개/계산서 고정.

---

## E2E-IT-3: preview 저장 → history 단건 조회 → dataSnapshotJson 복원 partnerCode 일치

**목적**: preview 완료 후 history API로 단건 조회 시 dataSnapshotJson gzip 복원 정확성을 검증.

**단계**:
1. 3건 ISSUED seed (partnerCode=QA-PC-SNAP).
2. `POST /batch/preview` → batchId 추출.
3. `GET /batch/history/{batchId}` → `$.data.totalRowCount=3` 검증.
4. 응답 `$.data.rows[*].partnerCode` 전수 검사 → 모두 `QA-PC-SNAP` 일치 확인.

**검증 포인트**:
- `totalRowCount = 3`
- `rows.length = 3`
- `rows[0..2].partnerCode = "QA-PC-SNAP"` (gzip 압축 → 복원 후 원본 데이터 보존 확인)

**배경**: `dataSnapshotJson`은 gzip+base64 압축. history 조회 시 BE가 decompress → JSON 파싱 후 응답. 본 시나리오는 압축/복원 흐름의 정합성을 E2E 단에서 검증.

---

## E2E-IT-4: 제외 거래처 등록 후 preview → 제외 거래처 row 0건

**목적**: 제외 거래처 마스터 등록 후 preview 실행 시 해당 거래처의 행이 완전히 제외됨을 검증.

**단계**:
1. 거래처 A(QA-PC-EXCL) 3건 + 거래처 B(QA-PC-KEEP) 2건 ISSUED seed.
2. `POST /batch/exclusions` body `{partnerCode: "QA-PC-EXCL", partnerName: "QA 제외 거래처", reason: "E2E-IT-4 테스트"}` → 201 Created.
3. `POST /batch/preview` (excludePartnerCodes 미전달 — DB 마스터 자동 적용).
4. `$.data.totalRowCount = 2` 검증 (거래처 B 2건만 포함).
5. `$.data.rows[*].partnerCode` 중 `QA-PC-EXCL` 건수 = 0 검증.

**검증 포인트**:
- exclusions 등록 201 응답
- `totalRowCount = 2` (5 - 3 = 2)
- rows 내 `QA-PC-EXCL` 완전 미포함

**경계 조건**: partial index (`is_deleted = false`) 기준 unique 제약 — 동일 partnerCode 중복 등록 시 409 또는 DataIntegrityViolationException 예상 (별도 TC).

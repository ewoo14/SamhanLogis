# lookup 3종 Google Sheet DB Sync 구현 보고

## 범위

- 대상: product-service RC9 lookup 3종
  - `싱글 자재가격` → `material_price`
  - `추천실외기` → `odu_recommendation_lookup`
  - `분기계산` → `branch_pipe_lookup`
- 시트 source-of-truth: legacy Google Sheet `<SHEET_ID>`
- 구현 원칙: 기존 `ProductSheetSyncService` 와 동일한 rowHash 변경감지 + soft-delete upsert 패턴

## 매핑

### 싱글 자재가격

- A열 `name`, B열 `price`
- `materialKey = D{시트행번호}`. 데이터 첫 행은 시트 row 2 이므로 `D2`
- C/D 사이드블록은 같은 row 에 값이 있을 때만 `optionLabel` / `computedFormula` 저장
- 시트 무값은 null 로 보존

### 추천실외기

- A/B: `MULTI_HEATING_COOLING`, `indoorCapacity=A`, `indoorCount=null`, `outdoorHp=B`
- C/E: `HOME_MULTI`, `indoorCapacity=null`, `indoorCount=C`, `outdoorHp=E`
- D/E: `HOME_MULTI`, `indoorCapacity=null`, `indoorCount=D`, `outdoorHp=E`
- HOME_MULTI 행은 indoorCapacity 실값이 없으므로 V10 Flyway 로 `indoor_capacity` NOT NULL 제약을 완화

### 분기계산

- A열 비공백 branchCode 만 저장
- B열 summaryQty 는 견적별 live 계산값이므로 저장하지 않음
- `description=null`, `summaryQty=null`

## 구현 파일

- `ProductLookupSheetSyncService`: lookup 3탭 read/upsert/soft-delete sync
- `ProductSheetSyncScheduler`: 기존 cron/boot sync 에 lookup sync 합류
- `ProductAdminController`: admin trigger 에 lookup sync 합류, 기존 `ProductSheetSyncService.SyncSummary` 응답 타입 유지
- `V10__odu_indoor_capacity_nullable.sql`: 추천실외기 HOME_MULTI nullable 계약 반영
- `ProductLookupSheetSyncServiceIT`: insert/unchanged/update/soft-delete 및 null 정직성 가드
- desktop mock: HOME_MULTI `indoorCapacity=null`, branch `description/summaryQty=null`

## 검증 메모

- 외부 GoogleSheetsClient 는 IT 에서 `@MockBean` 으로 격리한다.
- Docker 기반 IT 실행은 PM 실서버 QA 단계에서 별도 검증한다.

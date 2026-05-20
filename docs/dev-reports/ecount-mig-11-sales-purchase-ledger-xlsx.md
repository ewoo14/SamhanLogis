# MIG-11 매출장/매입장 XLSX staging + DailyClosing 대조

작성일: 2026-05-20

## 범위

- `shared/common`에 Apache POI 5.4.0 기반 `EcountXlsxSupport`를 추가했다.
- `accounting-service`에 매출장/매입장 XLSX importer와 admin multipart endpoint 2종을 추가했다.
- `auth-service` V24에 MIG-11 PageCode 2종과 `MASTER`/`MANAGER` edit 권한을 seed했다.
- `accounting-service` V31에 `staging.ecount_sales_ledger_raw`, `staging.ecount_purchase_ledger_raw` 2테이블을 추가했다.

## Raw 헤더 정정

Apache POI `XSSFWorkbook`으로 실제 raw sheet 0을 확인했다.

| 파일 | row 0 | row 1 header |
|---|---|---|
| `매출장.xlsx` | 회사명/기간/매출장 meta | `월/일`, `유형명`, `전자구분`, `거래처코드`, `거래처명`, `적요`, `매출공급가액`, `매출부가세`, `매출합계` |
| `매입장.xlsx` | 회사명/기간/매입장 meta | `월/일`, `거래처코드`, `유형명`, `전자구분`, `거래처명`, `적요`, `매입공급가액`, `매입부가세` |

초기 spec의 `품목명/수량/단가` 예상 컬럼은 실제 raw와 달라 폐기했다. 매입장은 합계 컬럼이 없으므로 `매입공급가액 + 매입부가세`로 `total_amount`를 계산한다.

## DailyClosing 대조

실제 `DailyClosing` 도메인은 `close_date/sales_amount/purchase_amount`가 아니라 `closing_date`, `closing_kind`, `source_kind`, `total_amount` 구조다. MIG-11은 `partner_id IS NULL` 전체 마감 row를 대상으로 `closing_kind = SALES|PURCHASE`의 `total_amount` 합계를 일별 raw 합계와 비교한다.

불일치는 `MIG11_DAILY_CLOSING_MISMATCH` warning sample로만 반환하며 row reject로 처리하지 않는다.

## POI 의존성 범위

GHSA-gmg8-593g-7mv3 대응으로 Apache POI는 5.4.0으로 상향했다. 이번 슬라이스에서는 `EcountXlsxSupport`가 `shared/common`에 위치하므로 POI가 shared/common `implementation`으로 14 service 소비자에 전이될 수 있다. MIG-12+ 후속에서 `shared:ecount-io` 같은 별도 module로 XLSX/CSV importer 의존성을 분리하는 방안을 검토한다. 본 PR에서는 migration 일정과 기존 shared Excel export 패턴 유지를 우선해 분리하지 않는다.

## 테스트

- shared/common: `EcountXlsxSupportTest` 5 cases, `ErrorCodeMig11Test`
- accounting-service: 매출장 importer 9 cases, 매입장 importer 9 cases
- accounting-service IT: endpoint 2종 × 5 cases (`200/401/403/400/422`)
- fixture: `mig11-sales-ledger.xlsx`, `mig11-purchase-ledger.xlsx` 2종, PII placeholder `거래처A~E`, `Mig11FixtureHeaderCrossCheckTest`

## 검증 상태

로컬 Gradle 검증은 현재 sandbox 네트워크 제한으로 완료하지 못했다.

- `./gradlew.bat ...`는 Gradle distribution 다운로드 단계에서 `Permission denied: getsockopt`로 실패했다.
- 캐시된 Gradle 8.10.2 직접 실행도 plugin classpath artifact가 캐시되지 않아 온라인 HEAD를 시도했고 동일하게 실패했다.
- `--offline`은 `dependency-management-plugin-1.1.6.jar` 등 root classpath artifact 캐시 부재로 실패했다.

네트워크 가능한 환경에서는 plan의 최종 명령을 그대로 재실행해야 한다.

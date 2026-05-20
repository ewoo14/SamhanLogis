# MIG-11 매출장/매입장 xlsx → staging + DailyClosing 대조 — 설계 (Design Spec)

> 작성일: 2026-05-20
> branch: `spec/2026-05-20-mig-11-sales-purchase-ledger-xlsx`
> 입력: `docs/migration/ecount-data/raw/매출장.xlsx`, `docs/migration/ecount-data/raw/매입장.xlsx`

---

## 1. 개요

MIG-10 ([PR #278, `4f925a94`](https://github.com/.../pull/278)) 머지 직후 진입. **잔여 검증 raw xlsx 2종** → staging 적재 + DailyClosing 대조 검증 SQL.

- baseline: MIG-1~10 모두 머지 완료 (10건)
- PM 자율 연속 진행 ([feedback_pm_auto_continuous] 2026-05-20)
- Apache POI parser 도입 (xlsx 첫 슬라이스)

---

## 2. 결정

- **xlsx 2 raw + staging only + DailyClosing 대조 SQL** (도메인 변환 X, BE 한정)
- **Apache POI parser 신규** (`EcountXlsxSupport` shared/common) — MIG-12+ 도 활용 후보
- admin UI 미구현 (MIG-12+ 이연)

---

## 3. 산출 예정 (25~35 file, 약 1.5~2K LOC)

| 영역 | Flyway | 신규 |
|---|---|---|
| accounting-service | V31 | `staging.ecount_sales_ledger_raw` + `staging.ecount_purchase_ledger_raw` + 2 importer + 2 controller + DailyClosing 대조 검증 SQL |
| auth-service | V24 | PageCode MIG11 2종 + role_page_permissions |
| shared/common | — | ErrorCode MIG11 5종 + EcountMig11Result DTO + **EcountXlsxSupport** (Apache POI 5.x parser) |
| build.gradle | — | `org.apache.poi:poi-ooxml:5.x` 의존성 추가 (shared/common) |

---

## 4. 데이터 흐름

```
raw xlsx (2 종, sheet 0 + row 0 meta + row 1 header + data rows):
   ├─ 매출장.xlsx (월/일 / 유형명 / 전자구분 / 거래처코드 / 거래처명 / 적요 / 매출공급가액 / 매출부가세 / 매출합계)
   └─ 매입장.xlsx (월/일 / 거래처코드 / 유형명 / 전자구분 / 거래처명 / 적요 / 매입공급가액 / 매입부가세)
       ↓ EcountXlsxSupport.parse() (Apache POI 5.x) — sheet 0 + row 0 meta 인식 + row 1 header strict
staging.ecount_*_ledger_raw (2 테이블, 멱등 키 = source_file_hash SHA-256 + source_row_no)
       ↓ DailyClosing 대조 SQL
검증 결과: total_sales / total_purchase 일별 합계 vs DailyClosing 의 `closing_kind + total_amount` 일치 확인
       ↓ 불일치 sample MIG11_DAILY_CLOSING_MISMATCH 보고
```

---

## 5. xlsx 매핑

### 5.1 매출장 → `staging.ecount_sales_ledger_raw`

**Apache POI 실측 컬럼**:

- row 0: `회사명 : (주)삼한공조시스템 / 2026/05/01  ~ 2026/05/19  / 매출장` (meta)
- row 1: `월/일`, `유형명`, `전자구분`, `거래처코드`, `거래처명`, `적요`, `매출공급가액`, `매출부가세`, `매출합계`

| 컬럼 | staging 매핑 |
|---|---|
| 월/일 | `transaction_ref`, `transaction_date`, `sequence_no` |
| 유형명 | `transaction_type` TEXT |
| 전자구분 | `electronic_type` TEXT |
| 거래처코드 | `partner_code` TEXT |
| 거래처명 | `partner_name` TEXT |
| 적요 | `description` TEXT |
| 매출공급가액 | `supply_amount` NUMERIC(15,2) |
| 매출부가세 | `vat_amount` NUMERIC(15,2) |
| 매출합계 | `total_amount` NUMERIC(15,2) |

- staging 적재만 (도메인 변환 X)
- 멱등 키 = `source_file_hash` SHA-256 + `source_row_no`

### 5.2 매입장 → `staging.ecount_purchase_ledger_raw`

**Apache POI 실측 컬럼**:

- row 0: `회사명 : (주)삼한공조시스템 / 2026/05/01  ~ 2026/05/19  / 매입장` (meta)
- row 1: `월/일`, `거래처코드`, `유형명`, `전자구분`, `거래처명`, `적요`, `매입공급가액`, `매입부가세`

매입장에는 `매입합계` 컬럼이 없으므로 `total_amount = 매입공급가액 + 매입부가세`로 계산한다.

---

## 6. DailyClosing 대조 검증

```sql
-- 일별 매출 합계 cross-check
SELECT
    sl.transaction_date,
    SUM(sl.total_amount) as raw_total,
    COALESCE(dc.closing_total, 0) as closing_total,
    SUM(sl.total_amount) - COALESCE(dc.closing_total, 0) as diff
FROM staging.ecount_sales_ledger_raw sl
LEFT JOIN (
    SELECT closing_date, SUM(total_amount) closing_total
    FROM daily_closings
    WHERE is_deleted = FALSE
      AND partner_id IS NULL
      AND closing_kind = 'SALES'
    GROUP BY closing_date
) dc ON dc.closing_date = sl.transaction_date
WHERE sl.is_deleted = FALSE
GROUP BY sl.transaction_date, dc.closing_total
HAVING ABS(SUM(sl.total_amount) - COALESCE(dc.closing_total, 0)) > 0.01;
```

매입장도 동일 패턴 (`closing_kind = 'PURCHASE'`, `total_amount`).

불일치 → `MIG11_DAILY_CLOSING_MISMATCH` 보고서 sample 5건 (sample DTO).

---

## 7. EcountXlsxSupport (신규)

`shared/common/src/main/java/com/samhanair/logis/common/ecount/EcountXlsxSupport.java`:

```java
public static ParsedXlsx parse(InputStream xlsxStream, String[] expectedHeaders) {
    // Apache POI XSSFWorkbook
    // sheet 0 + header row 0 strict match
    // data rows 추출 → ParsedXlsx record (rows: List<Map<String, String>>, sourceFileHash, dataRowCount)
}

public static String computeFileHash(InputStream stream) { // SHA-256, EcountCsvSupport 재사용 가능 }
```

- Apache POI 5.4.0 (`poi-ooxml:5.4.0`)
- SHA-256 file hash (MIG-1~10 통일)
- header strict (expectedHeaders 와 정확 매칭, 추가 컬럼 reject)
- 빈 row skip, footer 패턴 (`합계`, `총계` 등) skip

---

## 8. ErrorCode 신규

- `MIG11_XLSX_PARSE_FAILED` — Apache POI parse 실패
- `MIG11_HEADER_MISMATCH` — header 컬럼 불일치
- `MIG11_AMOUNT_INVALID` — 금액 형식 불일치
- `MIG11_DATE_INVALID` — 월/일 parse 실패
- `MIG11_DAILY_CLOSING_MISMATCH` — DailyClosing 합계 불일치 (warning)

---

## 9. 결정 (D-MIG-11-XX)

- D-MIG-11-01 xlsx 2 raw 통합 PR (BE 한정, FE 영향 0)
- D-MIG-11-02 Apache POI 5.x 신규 의존성 추가 (shared/common)
- D-MIG-11-03 EcountXlsxSupport 신규 헬퍼 (MIG-12+ 활용 후보)
- D-MIG-11-04 staging only + DailyClosing 대조 검증 (도메인 변환 X)
- D-MIG-11-05 멱등 키 = source_file_hash SHA-256 + source_row_no (MIG-1~10 통일)
- D-MIG-11-06 2 namespace pg_advisory_xact_lock 분리
- D-MIG-11-07 DailyClosing 불일치 = warning (reject 아님)
- D-MIG-11-08 footer 정확 매칭 (MIG-4/5 회고 적용)
- D-MIG-11-09 PageCode MIG11 2종 (auth V24)
- D-MIG-11-10 ErrorCode MIG11 5종
- D-MIG-11-11 PM 자동시작 + PM 자율 연속 진행
- D-MIG-11-12 단위 테스트 7~9 cases × 2 importer = 14~18 cases (MIG-3~10 회고)
- D-MIG-11-13 IT 5 case × 2 endpoint = 10 IT parameterized
- D-MIG-11-14 fixture xlsx 2종 (실 raw 헤더 일치, 5 row sample, PII placeholder)
- D-MIG-11-15 QA Docker 실서버 검증 의무 ([feedback_qa_docker_real_test])

---

## 10. samhan-public-overview.html 동기화

- nav-badge `Phase 10.6 · MIG-11 진행 중` → 머지 시 `Phase 10.6 · MIG-12 진행 예정`
- Phase 10.6 row sub-task `MIG-1~10 + MIG-11 #N`

---

🤖 PM Claude (Opus 4.7) — 2026-05-20 자율 연속 진행

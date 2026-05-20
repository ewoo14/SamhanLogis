# MIG-6 이카운트 잔여 마스터 5종 — 설계 (Design Spec)

> 작성일: 2026-05-20
> branch: `spec/2026-05-20-mig-6-master-employee-asset`
> PR 예정: 단일 통합 PR
> 입력 raw: `docs/migration/ecount-data/raw/` 5종
> - `통장계좌-Excel다운로드.csv` (7컬럼 + trailing, meta `데이터관리>`)
> - `사원-Excel다운로드.csv` (6컬럼 + trailing, **meta `회사명 :` 신규 패턴**)
> - `인사카드등록-Excel다운로드.csv` (8컬럼 + trailing, **주민등록번호 포함, PII critical**)
> - `급여관리사원-Excel다운로드.csv` (7컬럼 + trailing, meta `회사명 :`)
> - `고정자산유형-Excel다운로드(20260401~20260430_1).csv` (3컬럼 + trailing, meta `데이터관리>`)

---

## 1. 개요

MIG-5 ([PR #273, `cf16a93d`](https://github.com/.../pull/273)) 머지 직후 진입. 이카운트 잔여 **마스터 5종 일괄 정리** (트랜잭션 raw 아님). MIG-2 마스터 5종 패턴 미러 + 신규 meta row 패턴 + 주민등록번호 PII 가드 critical.

- baseline: MIG-1~5 (PR #262/#270/#271/#272/#273) 모두 머지 완료
- 9회차 워크플로우 ([feedback_dual_5agent_review])

---

## 2. 사용자 확정 결정 (2026-05-20)

- **5 importer 통합** (마스터 5종) — 사용자 명시 "물어보지 말고 진입" 자율 결정
- **PM 자동시작** (자율 진행, brainstorming HARD-GATE skip)
- **인사카드등록 주민등록번호 PII 가드 의무** — fixture `XXXXXX-XXXXXXX` placeholder + staging 컬럼 마스킹 정책

---

## 3. 산출 예정 (40~50 file, 약 2.5~3K LOC)

| 영역 | Flyway | 신규 |
|---|---|---|
| accounting-service | V26 | `staging.ecount_bank_account_raw` + `staging.ecount_fixed_asset_type_raw` + 2 importer + 2 controller |
| user-service | V8 | `staging.ecount_employee_raw` + `staging.ecount_employee_card_raw` + `staging.ecount_payroll_employee_raw` + 3 importer + 3 controller |
| auth-service | V19 | PageCode MIG6 5종 + ROLE_MASTER+MANAGER seed |
| shared/common | — | ErrorCode MIG6 8종 + `EcountCsvSupport.hasMetaRow` 패턴 보강 (`회사명 :` 추가) |

---

## 4. 데이터 흐름

```
raw CSV (5 종, BOM + meta `데이터관리>` 또는 `회사명 :` + strict header + trailing empty)
   ↓ EcountCsvSupport (hasMetaRow 패턴 보강 — 회사명 : 신규 추가)
staging.ecount_*_raw (5 테이블, 멱등 키 = source_file_hash SHA-256 + source_row_no)
   ↓ transform service (pg_advisory_xact_lock + REQUIRES_NEW + lookup map)
도메인:
   ├─ BankAccount (통장계좌, accounting-service 신규 또는 CardMaster 변형 — 결정 D-MIG-6-02)
   ├─ Employee (사원, user-service 기존 도메인 보강)
   ├─ EmployeeCard (인사카드, user-service 신규 — 주민등록번호 마스킹 가드)
   ├─ PayrollEmployee (급여관리사원, user-service 신규)
   └─ FixedAssetType (고정자산유형, accounting-service 신규)
```

---

## 5. 5 raw CSV → 도메인 매핑

### 5.1 통장계좌 → `BankAccount` (accounting-service 신규)

**raw 헤더 7컬럼**: 계좌코드 / 계좌명 / 계정명(계정코드) / 검색창내용 / 적요 / 외화통장 / 사용

- staging `ecount_bank_account_raw` 적재
- 도메인 변환: `BankAccount` 신규 (account_code/account_name/chart_of_account_id (lookup MIG-2 account_map)/foreign_currency/is_active)
- 계정명(계정코드) → ChartOfAccount lookup (`staging.ecount_account_map`)

### 5.2 사원 → `Employee` (user-service 기존 도메인)

**raw 헤더 6컬럼**: 사원(담당)코드 / 사원(담당)명 / 검색창내용 / 담당자연락처 / 담당자Email / 사용

- staging `ecount_employee_raw`
- 도메인 `Employee` 보강 (employee_code/name/phone/email/is_active)
- 이메일 형식 검증 — 빈 값 허용

### 5.3 인사카드등록 → `EmployeeCard` (user-service 신규, **PII critical**)

**raw 헤더 8컬럼**: 사원번호 / 성명 / 주민등록번호 / 부서명 / 직위/직급명 / 입사일자 / 계좌번호 / Email

- staging `ecount_employee_card_raw` 적재
- **주민등록번호 처리** (PII 가드, D-MIG-6-04):
  - DB 컬럼: `resident_number_masked` VARCHAR(14) — 앞 6자리 + `-` + 뒤 1자리 + 마스킹 (예: `740114-1******`)
  - 평문 저장 X, hash 저장도 X (사용자 검색 목적 없으면 마스킹만)
  - fixture 의 raw 값: `XXXXXX-XXXXXXX` placeholder
- 부서명 → Department lookup (MIG-2 department_map)
- 입사일자 (yyyy/MM/dd) → LocalDate parse

### 5.4 급여관리사원 → `PayrollEmployee` (user-service 신규)

**raw 헤더 7컬럼**: 사원번호 / 성명 / 지급구분명 / 부서명 / 급여구분 / 입사일자 / 퇴사일자

- staging `ecount_payroll_employee_raw`
- 도메인 `PayrollEmployee` 신규 (employee_code/name/payment_type/department_id/salary_type/hire_date/leave_date)
- 사원 cross-link: employee_code → Employee.id (5.2 lookup)

### 5.5 고정자산유형 → `FixedAssetType` (accounting-service 신규)

**raw 헤더 3컬럼**: 고정자산유형코드 / 고정자산유형명 / 사용여부

- staging `ecount_fixed_asset_type_raw`
- 도메인 `FixedAssetType` 신규 (type_code/type_name/is_active)
- 가장 단순한 마스터 변환

---

## 6. EcountCsvSupport 신규 보강

```java
private static boolean hasMetaRow(String[] row) {
    if (row.length == 0) return false;
    String first = stripCell(row[0]);
    return first.startsWith("데이터관리>") || first.startsWith("회사명 :");
}
```

**위치**: `shared/common/src/main/java/com/samhanair/logis/common/ecount/EcountCsvSupport.java`

`hasMetaRow` 회귀 테스트 보강:
- `meta_row_데이터관리_시작은_skip`
- `meta_row_회사명_시작은_skip` ← 신규
- `데이터행은_skip_안함`

---

## 7. 멱등 키 / 트랜잭션 / 동시성

- 멱등 키 = `source_file_hash` SHA-256 + `source_row_no` (MIG-2~5 통일)
- `@Transactional(REQUIRES_NEW + READ_COMMITTED)` 모든 importer
- `pg_advisory_xact_lock` 5 namespace 분리 (BankAccount / Employee / EmployeeCard / Payroll / FixedAssetType)
- `ON CONFLICT DO NOTHING` (staging) / CTE atomic upsert (도메인)
- soft-delete CTE 복구 — 모든 도메인 (MIG-4/5 패턴 일관)
- row-level BusinessException → reject sample 흡수

---

## 8. PII 마스킹 가드 (D-MIG-6-04 critical)

- **인사카드등록 주민등록번호**: 평문 저장 절대 금지
  - staging: `resident_number_raw` VARCHAR(14) → import 시점 즉시 마스킹 적용 (앞7자리 + 마스킹)
  - domain: `resident_number_masked` VARCHAR(14) (예: `740114-1******`)
  - fixture: `XXXXXX-XXXXXXX` placeholder
  - audit 로그 시 마스킹 적용
- **이메일/계좌번호**: 운영 raw 그대로 적재 가능 (이미 관리됨)
- **이름**: placeholder 의무 (fixture 안 — 5명 사원 → '사원A/B/C/D/E')

---

## 9. ErrorCode 신규 (shared/common)

- `MIG6_LOOKUP_MISS` — 거래처/계정/부서 lookup miss
- `MIG6_LOOKUP_AMBIGUOUS` — 중복 매칭
- `MIG6_EMPLOYEE_CODE_DUPLICATE` — 동일 파일 사원코드 중복
- `MIG6_BANK_ACCOUNT_CODE_DUPLICATE`
- `MIG6_DATE_INVALID` — 입사일자/퇴사일자 포맷 불일치
- `MIG6_RESIDENT_NUMBER_INVALID` — 주민등록번호 13자리 검증 실패
- `MIG6_BOOLEAN_FLAG_INVALID` — 사용 컬럼 Yes/No 외 값
- `MIG6_CSV_HEADER_MISMATCH(UNPROCESSABLE_ENTITY, "MIG-6 CSV 헤더 불일치")` — MIG-5 통일 422

---

## 10. 결정 (D-MIG-6-XX)

- D-MIG-6-01 5 importer 통합 PR (사용자 명시 "물어보지 말고 진입")
- D-MIG-6-02 통장계좌 → `BankAccount` 신규 도메인 (CardMaster 와 구분 — CardMaster = 카드, BankAccount = 계좌)
- D-MIG-6-03 사원 → `Employee` 기존 도메인 보강, 인사카드 / 급여관리사원 → 신규 도메인
- D-MIG-6-04 **주민등록번호 평문 저장 금지** — staging 적재 시점 즉시 마스킹 (`앞7자리 + 마스킹`). 사용자 화면 표시 시 마스킹.
- D-MIG-6-05 `EcountCsvSupport.hasMetaRow` 패턴 `회사명 :` 추가
- D-MIG-6-06 lookup miss = `MIG6_LOOKUP_MISS` reject (silent fallback 금지)
- D-MIG-6-07 멱등 키 source_file_hash SHA-256 + source_row_no (MIG-2~5 통일)
- D-MIG-6-08 5 namespace pg_advisory_xact_lock 분리
- D-MIG-6-09 soft-delete CTE 복구 (5 도메인 모두)
- D-MIG-6-10 admin UI 미구현 (후속 슬라이스)
- D-MIG-6-11 PageCode MIG6 5종 (auth-service V19)
- D-MIG-6-12 ErrorCode MIG6 8종 (shared/common)
- D-MIG-6-13 PM 자동시작
- D-MIG-6-14 5 importer 단위 테스트 처음부터 (MIG-4/5 회고 적용) — 각 7~9 케이스
- D-MIG-6-15 IT 5 case × 5 endpoint = 25 IT parameterized
- D-MIG-6-16 `MIG6_CSV_HEADER_MISMATCH` HttpStatus 422 (MIG-5 통일)

---

## 11. samhan-public-overview.html 동기화 의무 ([feedback_samhan_public_overview_sync])

- nav-badge: `Phase 10.6 · MIG-6 진행 중` → 머지 시 `Phase 10.6 · MIG-7 진행 예정`
- Phase 10.6 row sub-task `MIG-1~5 + MIG-6 #N` 갱신
- callout 누적 갱신 (5 마스터 추가)

---

🤖 PM Claude (Opus 4.7) — 2026-05-20 자율 진행

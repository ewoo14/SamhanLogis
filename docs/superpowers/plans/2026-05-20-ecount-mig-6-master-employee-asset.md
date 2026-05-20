# MIG-6 이카운트 잔여 마스터 5종 — Implementation Plan

> **For agentic workers:** Codex 개발 의무 ([feedback_dual_5agent_review] 9회차). `mcp__codex__codex sandbox=workspace-write`.

**Goal:** 5 마스터 raw (통장계좌/사원/인사카드/급여/고정자산유형) → staging 멱등 + 도메인 변환 + 주민등록번호 PII 마스킹.

**Architecture:** 3-Tier + MIG-2/4/5 패턴 일관. EcountCsvSupport meta `회사명 :` 패턴 보강. 5 importer + 5 controller + 8 ErrorCode + V26 (accounting) + V8 (user) + V19 (auth) + shared/common 패턴 보강.

---

## 작업 그룹 11 (Codex 일괄)

### Task 1: EcountCsvSupport.hasMetaRow 패턴 보강 (shared/common)

**Files:**
- Modify: `shared/common/src/main/java/com/samhanair/logis/common/ecount/EcountCsvSupport.java`

변경: `hasMetaRow` — `데이터관리>` OR `회사명 :` 인식.

회귀 테스트 (`EcountCsvSupportTest`):
- `meta_row_데이터관리_시작은_skip` (기존)
- `meta_row_회사명_시작은_skip` (신규)
- `데이터행은_skip_안함`

### Task 2: ErrorCode MIG6 8종 + V19 auth PageCode 5종

- shared/common ErrorCode 8종 (spec §9)
- auth V19 + PageCode 5종 (`ECOUNT_MIG6_BANK_ACCOUNT/EMPLOYEE/EMPLOYEE_CARD/PAYROLL_EMPLOYEE/FIXED_ASSET_TYPE`) + role_page_permissions 10건

### Task 3: V26 Flyway accounting (BankAccount + FixedAssetType)

- `staging.ecount_bank_account_raw` (account_code/account_name/account_chart_code/search_content/memo/foreign_currency/is_active + file_hash/row_no)
- `staging.ecount_fixed_asset_type_raw` (type_code/type_name/is_active + file_hash/row_no)
- `bank_accounts` 신규 테이블 (BaseEntity 7 audit + UNIQUE(account_code))
- `fixed_asset_types` 신규 테이블 (BaseEntity 7 audit + UNIQUE(type_code))

### Task 4: V8 Flyway user (Employee 보강 + EmployeeCard + Payroll)

- `staging.ecount_employee_raw` (employee_code/name/search_content/phone/email/is_active + file_hash/row_no)
- `staging.ecount_employee_card_raw` (employee_code/name/resident_number_raw/department_name/position/hire_date/account_number/email + file_hash/row_no) — `resident_number_raw` import 시점 즉시 마스킹 후 적재
- `staging.ecount_payroll_employee_raw` (employee_code/name/payment_type/department_name/salary_type/hire_date/leave_date + file_hash/row_no)
- `employees` 기존 테이블 보강: ecount_code 컬럼 추가 (`ALTER TABLE`)
- `employee_cards` 신규 테이블 (BaseEntity + employee_id FK + resident_number_masked + ... + UNIQUE(employee_id))
- `payroll_employees` 신규 테이블 (BaseEntity + employee_id FK + ... + UNIQUE(employee_id))

### Task 5: 5 importer (5 마스터)

- `EcountBankAccountImporter` (accounting-service)
- `EcountEmployeeImporter` (user-service)
- `EcountEmployeeCardImporter` (user-service) — **주민등록번호 마스킹 의무**
- `EcountPayrollEmployeeImporter` (user-service)
- `EcountFixedAssetTypeImporter` (accounting-service)

핵심:
- `@Transactional(REQUIRES_NEW + READ_COMMITTED)` + advisory lock 5 namespace
- OpenCSV + EcountCsvSupport (hasMetaRow `회사명 :` 보강)
- staging ON CONFLICT DO NOTHING
- 도메인 CTE atomic upsert + soft-delete 복구
- row-level BusinessException → reject sample
- 주민등록번호 마스킹: `maskResidentNumber("740114-1030932") → "740114-1******"`

각 importer 단위 테스트 (D-MIG-6-14): 7~9 케이스 — 정상/lookup miss/duplicate/날짜/boolean/multi_row_source_row_no/BOM/멱등/`회사명 :` meta row skip/PII 마스킹 (인사카드만).

### Task 6: 5 Controller

- `POST /admin/accounting/bank-accounts/imports/ecount`
- `POST /admin/accounting/fixed-asset-types/imports/ecount`
- `POST /admin/user/employees/imports/ecount`
- `POST /admin/user/employee-cards/imports/ecount`
- `POST /admin/user/payroll-employees/imports/ecount`

multipart 10MB, ROLE_MASTER+MANAGER, EcountMig6ImportResult DTO.

### Task 7: 5 IT (5 case × 5 endpoint = 25 IT parameterized, D-MIG-6-15)

- accounting (2 endpoint): `EcountMig6AccountingImportControllerIT`
- user (3 endpoint): `EcountMig6UserImportControllerIT`
- 각 5 케이스 (200/401/403/400/422-MIG6_CSV_HEADER_MISMATCH)
- @MockBean 외부 client

### Task 8: Classpath fixture 5종 + cross-check 테스트

- `services/accounting-service/src/test/resources/fixtures/mig6-bank-account.csv`
- `services/accounting-service/src/test/resources/fixtures/mig6-fixed-asset-type.csv`
- `services/user-service/src/test/resources/fixtures/mig6-employee.csv`
- `services/user-service/src/test/resources/fixtures/mig6-employee-card.csv` — **fixture PII placeholder `XXXXXX-XXXXXXX` + 사원명 `사원A/B/C/D/E`**
- `services/user-service/src/test/resources/fixtures/mig6-payroll-employee.csv`
- `Mig6AccountingFixtureHeaderCrossCheckTest` + `Mig6UserFixtureHeaderCrossCheckTest` (BOM byte 검증 + meta `회사명 :` 검증)

### Task 9: dev-report + 문서 동기화

- Create: `docs/dev-reports/ecount-mig-6-master-employee-asset.md`
- Modify: `ROADMAP.md` / `DECISIONS.md` (D-MIG-6-01~16) / 3 service README / root README / overview HTML / handoff

---

## 5-team 매트릭스

| Team | 산출 |
|---|---|
| BE | Tasks 1~7 + 모든 importer/controller/Flyway |
| QA | Tasks 7, 8 + PII 가드 검증 (주민등록번호 placeholder 강제) |
| Designer | UI 미구현 |
| DevOps | V26/V8/V19 트랜잭션 안전 + GitGuardian 가드 |
| Plan (TM) | Task 9 문서 + 사이클 종합 |

---

## 9회차 워크플로우 사이클 10단계 절대 변동 금지

(MIG-3/4/5 동일)

---

🤖 PM Claude (Opus 4.7) — 2026-05-20 자율 진행

# MIG-6 이카운트 잔여 마스터 5종 마이그레이션 — dev-report

> spec: [2026-05-20-ecount-mig-6-master-employee-asset-design.md](../superpowers/specs/2026-05-20-ecount-mig-6-master-employee-asset-design.md)  
> plan: [2026-05-20-ecount-mig-6-master-employee-asset.md](../superpowers/plans/2026-05-20-ecount-mig-6-master-employee-asset.md)  
> branch: `spec/2026-05-20-mig-6-master-employee-asset`

## 범위

| 영역 | 산출 |
|---|---|
| shared/common | `EcountCsvSupport` meta row `회사명 :` 추가, `EcountMig6ImportResult`, `EcountMig6ImportSupport`, MIG6 ErrorCode 8종 |
| auth-service | V19 PageCode seed 5종 (`MASTER`/`MANAGER` edit) |
| accounting-service | V26 staging 2종 + `bank_accounts` / `fixed_asset_types`, importer/controller 2종 |
| user-service | V8 staging 3종 + `employees.ecount_code` + `employee_cards` / `payroll_employees`, importer/controller 3종 |
| QA | fixture 5종 BOM byte/header cross-check, 주민등록번호 placeholder fixture |

## PII 가드

인사카드등록 CSV의 주민등록번호는 import 시점에 즉시 마스킹한다.

- 마스킹 형식: 앞 7자리만 보존하고 나머지 6자리는 `******` 처리한다.
- staging/domain 컬럼은 `resident_number_masked`만 보유
- fixture는 `XXXXXX-XXXXXXX` placeholder만 사용
- reject sample과 로그 메시지에는 평문 주민번호를 넣지 않는다

## Endpoint

| Service | Endpoint |
|---|---|
| accounting-service | `POST /admin/accounting/bank-accounts/imports/ecount` |
| accounting-service | `POST /admin/accounting/fixed-asset-types/imports/ecount` |
| user-service | `POST /admin/user/employees/imports/ecount` |
| user-service | `POST /admin/user/employee-cards/imports/ecount` |
| user-service | `POST /admin/user/payroll-employees/imports/ecount` |

## 검증 상태

- 추가: 단위 테스트 5 importer + shared meta/error test + fixture cross-check + controller IT parameterized.
- 로컬 Gradle 실행은 sandbox 네트워크 제한으로 플러그인 의존성 다운로드 단계에서 중단됨. 커밋 전 검증은 후속 환경에서 재실행 필요.

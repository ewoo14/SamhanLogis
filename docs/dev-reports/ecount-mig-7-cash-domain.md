# MIG-7 Cash 도메인 신규 + MIG-5 staging 변환 — dev-report

> spec: [2026-05-20-ecount-mig-7-cash-domain-design.md](../superpowers/specs/2026-05-20-ecount-mig-7-cash-domain-design.md)
> plan: [2026-05-20-ecount-mig-7-cash-domain.md](../superpowers/plans/2026-05-20-ecount-mig-7-cash-domain.md)
> branch: `spec/2026-05-20-mig-7-cash-domain`

## 범위

| 영역 | 산출 |
|---|---|
| shared/common | `EcountMig7TransformResult`, MIG7 ErrorCode 6종 |
| auth-service | V20 PageCode seed 2종 (`MASTER`/`MANAGER` edit) |
| accounting-service | V27 `cash_disbursements` / `cash_receipts`, Cash 도메인 2종, transform service/controller 2종 |
| QA | transform behavior 단위 테스트 20 cases + controller IT 10 case parameterized |

## 변환 계약

MIG-7은 CSV를 직접 받지 않고 MIG-5 staging을 단방향 변환한다.

| Source staging | Target domain | kind |
|---|---|---|
| `staging.ecount_expense_voucher_raw` | `cash_disbursements` | `EXPENSE_VOUCHER` |
| `staging.ecount_deposit_report_raw` | `cash_receipts` | `DEPOSIT_REPORT` |

공통 규칙:
- `transform_status = 'PENDING'` 행만 batch 조회
- `external_ref = source_file_hash + '-' + source_row_no`
- `REQUIRES_NEW + READ_COMMITTED`
- CashDisbursement/CashReceipt 별 `pg_advisory_xact_lock` namespace 분리
- soft-delete row는 `WITH restored AS (...)` CTE로 복구
- active row는 `ON CONFLICT (external_ref) DO UPDATE`
- row-level `BusinessException`과 `DuplicateKeyException`은 staging row `REJECTED`로 흡수하고 sample 20건만 응답
- 응답 DTO에는 내부 UUID를 노출하지 않는다

## Endpoint

| Service | Endpoint |
|---|---|
| accounting-service | `POST /admin/accounting/cash-disbursements/transform-from-staging` |
| accounting-service | `POST /admin/accounting/cash-receipts/transform-from-staging` |

request body는 생략 가능하며, `{ "batchSize": 500 }` 형태로 batch size를 지정할 수 있다. 허용 범위는 1~5000이다.

## 결정

- D-MIG-7-04 옵션 C: aging snapshot 갱신 + Journal 자동 생성 모두 MIG-8 후속 슬라이스로 이연한다.
- 본 슬라이스는 MIG-5 staging row를 CashDisbursement/CashReceipt 도메인으로 변환하고 `transform_status`를 추적하는 데 한정한다.
- `CashDisbursement.linkJournal(UUID)`와 `CashReceipt.linkJournal(UUID)` 도메인 메서드는 MIG-8+ 연결 지점으로만 제공한다.

## 검증 상태

- 추가: `Mig7CashDisbursementTransformServiceTest` 10 cases.
- 추가: `Mig7CashReceiptTransformServiceTest` 10 cases.
- 추가: `EcountMig7CashTransformControllerIT` 10 parameterized cases.
- 로컬 선검증: transform service 단위 테스트 20 cases PASS.
- Testcontainers controller IT는 Docker daemon 접근 가능 환경에서 실행된다.

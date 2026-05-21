# MIG-19 이카운트 cutover 운영 가이드

> 작성일: 2026-05-21
> 대상: 운영자, 회계 담당자, 현장 관리자
> 범위: 이카운트 raw 11종 다운로드부터 Samhan Public admin 화면 검증까지

이 문서는 이카운트 데이터를 Samhan Public으로 옮기는 실제 운영 절차입니다. 개발 용어를 몰라도 순서대로 실행하고, 각 단계의 응답 숫자와 화면 결과만 확인하면 되도록 작성했습니다.

---

## 1. 사전 준비

### 1.1 이카운트 raw 11종 다운로드

다운로드한 원본 파일은 모두 아래 폴더에 둡니다.

```text
docs/migration/ecount-data/raw/
```

이 폴더는 실 운영 데이터 보관 위치입니다. `.xlsx` / `.csv` 파일은 Git에 올리지 않습니다.

| 구분 | 파일 | MIG 단계 |
|---|---|---|
| 마스터 | 거래처등록 | MIG-1 |
| 마스터 | 품목등록, 계정등록, 부서등록, 창고등록, 카드등록 | MIG-2 |
| 회계 | 매입전표, 매출전표, 일반전표, 회계전표분개 | MIG-3 |
| 영업·세무 | 세금계산서용 판매전표, 판매전표, 매출매입내역, 주문서 | MIG-4 |
| 재고·입출금 | 창고이동, 지출결의서, 입금보고서 | MIG-5 |
| 잔여 마스터 | 통장계좌, 사원, 인사카드, 급여관리사원, 고정자산유형 | MIG-6 |
| 검증 | 매출장, 매입장 | MIG-11 |

운영 파일명은 날짜와 기간을 포함해 남깁니다.

```text
master-export-202605.xlsx
transactions-202501-202503.xlsx
sales-ledger-202501-202503.xlsx
purchase-ledger-202501-202503.xlsx
```

### 1.2 DB 백업

cutover 전 반드시 회계 DB를 백업합니다.

```powershell
$env:PGPASSWORD = '<DB 비밀번호>'
pg_dump -h localhost -p 5432 -U accounting_user -d accounting_db `
  -f C:\dev\SamhanLogis-backup\accounting_db_20260521_before_ecount.sql
```

운영 서버에서는 실제 접속 정보에 맞춰 실행합니다.

```bash
export PGPASSWORD='<DB 비밀번호>'
pg_dump -h "$PGHOST" -p "${PGPORT:-5432}" -U "$PGUSER" -d accounting_db \
  -f /backup/accounting_db_$(date +%Y%m%d_%H%M%S)_before_ecount.sql
```

백업 파일이 0 byte가 아닌지 확인합니다. 백업 실패 상태에서는 MIG-1도 시작하지 않습니다.

### 1.3 X-Internal-Token 확인

마이그레이션 중 accounting-service가 partner-service, product-service, user-service를 조회할 때 내부 서비스 호출용 `X-Internal-Token`을 사용합니다. 운영자가 업로드 버튼을 누를 때 직접 넣는 값이 아니라 서비스 간 통신 설정입니다.

확인 항목:

- accounting-service 환경 변수에 같은 token이 들어 있는지 확인합니다.
- partner-service / product-service / user-service가 같은 token을 신뢰하는지 확인합니다.
- token이 비어 있거나 잘못되면 MIG-12 이후 lookup은 `MIG12_INTERNAL_AUTH_MISS`로 실패합니다.

운영자가 화면이나 로그에서 볼 수 있는 증상:

```json
{
  "status": 503,
  "code": "MIG12_INTERNAL_AUTH_MISS",
  "message": "내부 서비스 인증 실패 - X-Internal-Token 설정 확인 필요"
}
```

### 1.4 운영자 권한 검증

실행 계정은 다음 중 하나여야 합니다.

| 역할 | 가능 작업 |
|---|---|
| MASTER | 모든 MIG 실행, AgingSnapshot 새로고침 |
| MANAGER | 모든 MIG 실행, AgingSnapshot 새로고침 |
| ACCOUNTANT | admin 조회 중심. 일부 실행 endpoint는 403 가능 |

권한 확인 방법:

1. 데스크톱 앱 로그인
2. 좌측 메뉴에서 `회계 > 회계 관리자` 그룹이 보이는지 확인
3. `Cash`, `Order`, `AgingSnapshot`, `Ledger` 화면 접근 확인
4. AgingSnapshot `새로고침`은 MASTER/MANAGER만 실행

403이 나오면 권한 문제입니다. 데이터 파일을 다시 올리지 말고 권한부터 확인합니다.

---

## 2. 단계별 절차

운영자 업로드/실행 요청 헤더:

```http
X-User-Id: <운영자 사용자 ID>
X-User-Role: MASTER
```

서비스 간 내부 호출 헤더:

```http
X-Internal-Token: <auth-service에서 확인한 내부 token>
```

`X-Internal-Token`은 운영자 PC에서 직접 붙이는 헤더가 아닙니다. accounting-service 같은 서버가 partner-service/product-service/user-service를 호출할 때 자동으로 붙어야 합니다.

공통 응답 확인 기준:

- `imported`, `updated`, `transformed`, `created` 숫자가 예상 범위인지 확인합니다.
- `rejected`가 0이면 정상입니다.
- `rejected`가 있으면 `rejectedSample`의 `errorCode` 또는 `reason`, `message`, `businessKey`, `rawValue`를 먼저 확인합니다. MIG-1 거래처 sample만 별도 record라 `reason/rawPartnerCode/rawName` 형식을 씁니다.
- 같은 파일 재실행은 멱등 처리됩니다. 단, 원인을 모른 채 여러 번 누르지 않습니다.

공통 로그 위치:

| 서비스 | Docker 로그 | 파일 로그 |
|---|---|---|
| partner-service | `docker compose logs -f partner-service` | `logs/partner-service/` |
| product-service | `docker compose logs -f product-service` | `logs/product-service/` |
| inventory-service | `docker compose logs -f inventory-service` | `logs/inventory-service/` |
| accounting-service | `docker compose logs -f accounting-service` | `logs/accounting-service/` |
| user-service | `docker compose logs -f user-service` | `logs/user-service/` |

### Step 1. 거래처 MIG-1

목적: 이카운트 거래처를 partner-service의 거래처 마스터로 옮깁니다.

Endpoint:

```http
POST /admin/partners/imports/ecount
Content-Type: multipart/form-data
file=<거래처등록 CSV 또는 XLSX 변환 CSV>
```

응답 sample:

```json
{
  "totalRows": 7200,
  "imported": 7100,
  "updated": 80,
  "rejectedNullName": 20,
  "skippedPlaceholder": 0,
  "activeCount": 6800,
  "suspendedCount": 380,
  "sourceFileHash": "sha256...",
  "rejectedSample": [
    {
      "rowNumber": 35,
      "reason": "REJECT_NAME_NULL",
      "rawPartnerCode": "10035",
      "rawName": ""
    }
  ]
}
```

확인:

- `rejectedNullName`이 있으면 거래처명 공란입니다.
- `skippedPlaceholder`는 거래처코드가 placeholder라 staging에만 남긴 건수입니다.
- MIG-1 `rejectedSample`은 `ErrorCode`가 아니라 `reason` 문자열을 봅니다.
- 사업자번호가 없는 거래처도 거래처명이 있으면 적재될 수 있습니다.
- 화면 확인: 거래처 관리에서 대표 거래처 5건을 검색합니다.

### Step 2. 마스터 5종 + lookup map MIG-2

목적: 품목, 계정, 부서, 창고, 카드와 lookup map을 준비합니다. 이후 모든 전표 변환의 기준표입니다.

Endpoints:

```http
POST /admin/products/imports/ecount
POST /admin/accounts/imports/ecount
POST /admin/departments/imports/ecount
POST /admin/warehouses/imports/ecount
POST /admin/cards/imports/ecount
```

품목등록 endpoint는 multipart part 이름이 3개로 나뉩니다.

```http
POST /admin/products/imports/ecount
Content-Type: multipart/form-data

itemFile=<품목등록 CSV, 필수>
relationFile=<품목관계 CSV, 선택>
groupFile=<품목계층그룹 CSV, 선택>
```

`itemFile`은 필수입니다. `relationFile`과 `groupFile`은 파일이 있을 때만 붙입니다.

응답 sample:

```json
{
  "totalRows": 1200,
  "imported": 1180,
  "updated": 15,
  "rejectedNullName": 5,
  "skippedPlaceholder": 0,
  "skippedRelationOrphan": 0,
  "aliasImported": 40,
  "sourceFileHash": "sha256...",
  "rejectedSample": []
}
```

확인:

- 품목명이 같은데 서로 다른 메인 품목으로 잡히면 `MIG2_ALIAS_DUPLICATE`가 발생합니다.
- 계정과목은 Cash → Journal 단계에서 필요하므로 반드시 먼저 끝냅니다.
- 창고와 부서는 재고·회계 전표 lookup에 쓰입니다.

로그 위치:

- product-service: 품목
- accounting-service: 계정, 카드
- user-service: 부서
- inventory-service: 창고

### Step 3. 회계 전표 4종 MIG-3

목적: 이카운트 회계 전표 raw를 accounting-service staging과 회계 전표 도메인으로 옮깁니다.

Endpoints:

```http
POST /admin/accounting/purchase-slips/imports/ecount
POST /admin/accounting/sales-slips/imports/ecount
POST /admin/accounting/general-vouchers/imports/ecount
POST /admin/accounting/journal-entries/imports/ecount
```

응답 sample:

```json
{
  "totalRows": 35000,
  "imported": 34880,
  "updated": 100,
  "skipped": 0,
  "rejected": 20,
  "posted": 32000,
  "draft": 2980,
  "sourceFileHash": "sha256...",
  "rejectedSample": [
    {
      "rowNumber": 120,
      "errorCode": "MIG3_LOOKUP_MISS",
      "message": "거래처/계정/부서 lookup 매핑을 찾지 못했습니다.",
      "businessKey": "2025-01-03-18",
      "rawValue": "거래처A"
    }
  ],
  "warnings": []
}
```

확인:

- `MIG3_LOOKUP_MISS`는 거래처, 계정, 부서 lookup이 맞지 않는 경우입니다.
- 거래처명만 있고 거래처코드가 없으면 중복 거래처에서 거부될 수 있습니다.
- `posted`와 `draft` 분포가 운영 예상과 크게 다르면 중단하고 샘플을 확인합니다.

### Step 4. 영업·세무 raw 4종 MIG-4

목적: 세금계산서, 판매전표 라인, 매출매입내역, 주문서 raw를 적재합니다.

Endpoints:

```http
POST /admin/accounting/tax-invoices/imports/ecount
POST /admin/accounting/sales-slips/imports/ecount-line
POST /admin/accounting/sales-purchase-summary/imports/ecount
POST /admin/accounting/orders/imports/ecount
```

응답 sample:

```json
{
  "totalRows": 18000,
  "imported": 17930,
  "updated": 50,
  "skipped": 0,
  "rejected": 20,
  "mismatchCount": 3,
  "sourceFileHash": "sha256...",
  "rejectedSample": [
    {
      "rowNumber": 44,
      "errorCode": "MIG4_ORDER_STATUS_INVALID",
      "message": "주문서 진행상태 값이 허용 목록에 없습니다.",
      "businessKey": "ORD-2025-001",
      "rawValue": "보류"
    }
  ],
  "mismatchSamples": []
}
```

확인:

- 주문서 진행상태는 `완료`, `진행`, `취소`, `대기`만 허용됩니다.
- 매출매입내역은 검증용 raw입니다. 불일치 sample이 있으면 DailyClosing과 같이 확인합니다.

### Step 5. 재고·입출금 3종 MIG-5

목적: 창고이동, 지출결의서, 입금보고서를 적재합니다.

Endpoints:

```http
POST /admin/inventory/stock-transfers/imports/ecount
POST /admin/accounting/expense-vouchers/imports/ecount
POST /admin/accounting/deposit-reports/imports/ecount
```

응답 sample:

```json
{
  "totalRows": 6000,
  "imported": 5950,
  "updated": 20,
  "lineAdded": 0,
  "skipped": 0,
  "rejected": 30,
  "sourceFileHash": "sha256...",
  "rejectedSample": [
    {
      "rowNumber": 88,
      "errorCode": "MIG5_WAREHOUSE_LOOKUP_MISS",
      "message": "창고명 lookup 매핑을 찾지 못했습니다.",
      "businessKey": "WH-2025-001",
      "rawValue": "임시창고"
    }
  ],
  "agingMismatchSamples": []
}
```

확인:

- 창고명, 품목명, 거래처명이 lookup 기준과 다르면 reject됩니다.
- 지출결의서와 입금보고서는 이후 MIG-7 Cash 도메인 변환 대상입니다.

### Step 6. 잔여 마스터 5종 PII MIG-6

목적: 통장계좌, 사원, 인사카드, 급여관리사원, 고정자산유형을 적재합니다.

Endpoints:

```http
POST /admin/accounting/bank-accounts/imports/ecount
POST /admin/user/employees/imports/ecount
POST /admin/user/employee-cards/imports/ecount
POST /admin/user/payroll-employees/imports/ecount
POST /admin/accounting/fixed-asset-types/imports/ecount
```

응답 sample:

```json
{
  "totalRows": 180,
  "imported": 175,
  "updated": 5,
  "skipped": 0,
  "rejected": 0,
  "sourceFileHash": "sha256...",
  "rejectedSample": []
}
```

확인:

- 주민등록번호는 raw 적재 시점부터 마스킹됩니다.
- 화면이나 로그에 주민등록번호 원문이 보이면 즉시 중단합니다.
- 직원 이름은 MIG-10 Order 담당자 연결에 쓰입니다.

### Step 7. Cash 도메인 변환 MIG-7

목적: MIG-5 staging의 지출결의서와 입금보고서를 CashDisbursement / CashReceipt 도메인으로 바꿉니다.

Endpoints:

```http
POST /admin/accounting/cash-disbursements/transform-from-staging
POST /admin/accounting/cash-receipts/transform-from-staging
Content-Type: application/json
```

요청 sample:

```json
{
  "batchSize": 500
}
```

응답 sample:

```json
{
  "totalRows": 2200,
  "imported": 2180,
  "updated": 0,
  "skipped": 10,
  "rejected": 10,
  "rejectedSample": [
    {
      "rowNumber": 12,
      "errorCode": "MIG7_LOOKUP_MISS",
      "message": "거래처 lookup 매핑을 찾지 못했습니다.",
      "businessKey": "2025-01-03-8",
      "rawValue": "거래처A"
    }
  ]
}
```

확인:

- 정상 변환 row는 staging `transform_status`가 `TRANSFORMED`로 바뀝니다.
- 거부 row는 `REJECTED`로 바뀌며 원인 수정 후 `PENDING`으로 되돌려 재실행할 수 있습니다.

### Step 8. Order 도메인 변환 MIG-8

목적: MIG-4 주문서 staging을 Order / OrderLine 도메인으로 바꿉니다.

Endpoint:

```http
POST /admin/accounting/orders/transform-from-staging
Content-Type: application/json
```

요청 sample:

```json
{
  "batchSize": 500
}
```

응답 sample:

```json
{
  "totalRows": 5100,
  "imported": 5000,
  "updated": 60,
  "skipped": 20,
  "rejected": 20,
  "orderLinesImported": 14300,
  "rejectedSample": [
    {
      "rowNumber": 310,
      "errorCode": "MIG8_PROGRESS_STATUS_INVALID",
      "message": "주문서 진행상태 값이 허용 목록에 없습니다.",
      "businessKey": "ORD-2025-041",
      "rawValue": "보류"
    }
  ],
  "warnings": []
}
```

확인:

- 같은 주문번호 여러 줄은 하나의 주문과 여러 품목 라인으로 묶입니다.
- 완료 주문은 매출전표와 연결될 수 있습니다.
- Order admin 화면에서 `progressStatus`가 `완료`, `진행`, `취소`, `대기`로 보이는지 확인합니다.

### Step 9. Cash → Journal + aging snapshot MIG-9

목적: CashDisbursement / CashReceipt에서 회계 Journal을 만들고 거래처 aging snapshot을 갱신합니다.

Endpoints:

```http
POST /admin/accounting/cash-journals/generate-from-disbursements
POST /admin/accounting/cash-journals/generate-from-receipts
POST /admin/accounting/aging-snapshot/refresh
Content-Type: application/json
```

요청 sample:

```json
{
  "batchSize": 500
}
```

응답 sample:

```json
{
  "totalRows": 2200,
  "cashDisbursementJournalsCreated": 1100,
  "cashReceiptJournalsCreated": 1050,
  "skipped": 30,
  "rejected": 20,
  "rejectedSample": [
    {
      "rowNumber": 77,
      "errorCode": "MIG9_DEFAULT_ACCOUNT_MISSING",
      "message": "Cash Journal 생성에 필요한 기본 계정과목을 찾지 못했습니다.",
      "businessKey": "2025-01-03-8",
      "rawValue": "보통예금"
    }
  ]
}
```

AgingSnapshot 새로고침 응답:

```json
{
  "refreshedAt": "2026-05-21T18:30:00",
  "status": "REFRESHED"
}
```

확인:

- 지출결의서 Journal 번호는 `JD-`로 시작합니다.
- 입금보고서 Journal 번호는 `JR-`로 시작합니다.
- `MIG9_DEFAULT_ACCOUNT_MISSING`이면 계정과목 seed를 먼저 확인합니다.
- AgingSnapshot 새로고침은 MASTER/MANAGER만 가능합니다.

### Step 10. Employee cross-link + aging net MIG-10

목적: Order 담당자명을 직원 마스터와 연결하고, aging snapshot에 순잔액 컬럼을 반영합니다.

Endpoint:

```http
POST /admin/accounting/orders/backfill-employee-cross-link
Content-Type: application/json
```

요청 sample:

```json
{
  "batchSize": 500
}
```

응답 sample:

```json
{
  "totalRows": 500,
  "linked": 470,
  "skipped": 10,
  "warningCount": 20,
  "warningSamples": [
    {
      "errorCode": "MIG10_EMPLOYEE_LOOKUP_MISS",
      "message": "담당자명과 일치하는 직원이 없습니다.",
      "businessKey": "ORD-2025-003",
      "rawValue": "홍길동"
    }
  ]
}
```

확인:

- 직원명이 0건이면 연결하지 않고 warning으로 남깁니다.
- 직원명이 2건 이상이면 모호하므로 연결하지 않습니다.
- AgingSnapshot 화면에서 `net_receivable`, `net_payable`, `net_cash` 기준 순잔액을 확인합니다.

### Step 11. 매출장/매입장 XLSX 검증 MIG-11

목적: 이카운트 매출장/매입장 XLSX를 staging에 보존하고 DailyClosing과 일별 합계를 대조합니다.

Endpoints:

```http
POST /admin/accounting/sales-ledger/imports/ecount
POST /admin/accounting/purchase-ledger/imports/ecount
Content-Type: multipart/form-data
file=<매출장 또는 매입장 XLSX>
```

응답 sample:

```json
{
  "totalRows": 9000,
  "imported": 8970,
  "skipped": 20,
  "rejected": 10,
  "dailyClosingMismatchCount": 2,
  "sourceFileHash": "sha256...",
  "rejectedSample": [
    {
      "rowNumber": 51,
      "errorCode": "MIG11_AMOUNT_INVALID",
      "message": "금액 형식을 숫자로 해석할 수 없습니다.",
      "businessKey": "2025-01-03/거래처A",
      "rawValue": "문자금액"
    }
  ],
  "dailyClosingMismatchSamples": [
    {
      "transactionDate": "2025-01-03",
      "rawValue": "1500000",
      "domainValue": "1490000",
      "difference": "10000"
    }
  ]
}
```

확인:

- `dailyClosingMismatchCount`는 import 실패가 아니라 대조 경고입니다.
- Ledger 화면에서 매출장/매입장 row와 `transformStatus`를 확인합니다.
- 불일치 날짜는 DailyClosing 화면에서 같은 날짜로 다시 확인합니다.

---

## 3. Admin UI 트레이닝

### 3.1 Cash 화면

위치: `회계 > 회계 관리자 > Cash`

조회 대상:

- CashDisbursement: 지출결의서 기반 지출
- CashReceipt: 입금보고서 기반 입금

사용법:

1. 거래처명, 전표번호, 유형, 일자 범위를 입력합니다.
2. `조회`를 누릅니다.
3. 적용된 조건은 상단 filter chip으로 표시됩니다.
4. chip의 X를 누르면 해당 조건만 제거됩니다.
5. `전체 초기화`를 누르면 모든 조건이 사라지고 첫 페이지로 돌아갑니다.

확인 포인트:

- 화면에는 내부 UUID가 보이면 안 됩니다.
- 운영자는 `slipNo`, `partnerName`, `kind`, `amount`, `transactionDate`를 기준으로 대조합니다.
- Journal 생성 후에는 Journal 번호가 `JD-` 또는 `JR-`로 연결되었는지 확인합니다.

### 3.2 Order 화면

위치: `회계 > 회계 관리자 > Order`

사용법:

1. 거래처, 담당자, 진행상태를 선택합니다.
2. 목록에서 주문번호를 클릭해 상세로 들어갑니다.
3. 상세에서 품목 라인과 합계를 확인합니다.

`progressStatus` 기준:

| 값 | 의미 |
|---|---|
| COMPLETED | 완료 |
| IN_PROGRESS | 진행 |
| CANCELED | 취소 |
| PENDING | 대기 |

확인 포인트:

- 내부 주문 UUID가 아니라 `orderNo`로 찾습니다.
- 담당자명이 직원과 연결되지 않은 경우에도 주문 자체는 보존됩니다.
- 완료 주문은 매출전표 cross-link warning 여부를 함께 확인합니다.

### 3.3 AgingSnapshot 화면

위치: `회계 > 회계 관리자 > AgingSnapshot`

사용법:

1. 거래처명을 입력해 조회합니다.
2. page size는 50 / 100 / 200 / 500 중 선택합니다.
3. 순잔액은 `net_receivable`, `net_payable`, `net_cash`를 봅니다.
4. `새로고침`은 MASTER/MANAGER만 실행합니다.

주의:

- ACCOUNTANT는 조회만 가능할 수 있습니다.
- 새로고침 실패 toast가 나오면 다시 누르기 전에 accounting-service 로그를 확인합니다.
- 대량 import 직후에는 Cash → Journal 생성이 끝난 뒤 새로고침합니다.

### 3.4 Ledger 화면

위치: `회계 > 회계 관리자 > Ledger`

사용법:

1. 매출장 또는 매입장 탭을 선택합니다.
2. 거래처, 변환상태, 일자 범위로 조회합니다.
3. DailyClosing 화면과 날짜별 합계를 대조합니다.

확인 포인트:

- `PENDING`: 아직 후속 처리 전입니다.
- `TRANSFORMED`: 정상 처리되었습니다.
- `REJECTED`: 원인 확인 후 재실행 대상입니다.

---

## 4. 롤백 절차

롤백은 “지우기”가 아니라 soft-delete 또는 staging 상태 복구로 처리합니다. 운영자가 직접 실행하지 말고 DBA 또는 개발 담당자와 함께 진행합니다.

### 4.1 Soft-delete 복구

잘못 soft-delete된 운영 row는 audit 값을 남기고 복구합니다.

```sql
WITH target_rows AS (
    SELECT id
      FROM cash_disbursements
     WHERE is_deleted = TRUE
       AND external_ref LIKE 'ECOUNT:%'
       AND deleted_at >= TIMESTAMP '2026-05-21 00:00:00'
)
UPDATE cash_disbursements t
   SET is_deleted = FALSE,
       deleted_at = NULL,
       deleted_by = NULL,
       modified_at = now(),
       modified_by = 'mig-19-rollback'
  FROM target_rows r
 WHERE t.id = r.id;
```

대상 테이블만 바꿔 같은 패턴으로 적용합니다.

- `cash_disbursements`
- `cash_receipts`
- `orders`
- `order_lines`
- `journals`
- `journal_lines`

### 4.2 journal_no JD-/JR- 접두사 충돌 회피

MIG-9 Journal 번호는 출처별 접두사를 나눕니다.

| 출처 | 접두사 |
|---|---|
| CashDisbursement | `JD-` |
| CashReceipt | `JR-` |

충돌 확인:

```sql
SELECT journal_no, COUNT(*)
  FROM journals
 WHERE journal_no LIKE 'JD-%'
    OR journal_no LIKE 'JR-%'
 GROUP BY journal_no
HAVING COUNT(*) > 1;
```

충돌이 있으면 재생성하지 말고 해당 source row의 `journal_id`, `source_type`, `source_ref`를 먼저 확인합니다. 이미 생성된 Journal을 지운 뒤 같은 번호를 다시 만들면 운영 감사 추적이 꼬일 수 있습니다.

### 4.3 staging transform_status PENDING 재실행

원인을 수정한 뒤 rejected row만 다시 실행하려면 staging 상태를 `PENDING`으로 되돌립니다.

```sql
UPDATE staging.ecount_order_raw
   SET transform_status = 'PENDING',
       reject_reason = NULL,
       modified_at = now(),
       modified_by = 'mig-19-retry'
 WHERE transform_status = 'REJECTED'
   AND source_file_hash = '<대상 파일 SHA-256>'
   AND source_row_no IN (12, 18, 25);
```

주요 대상:

| 단계 | staging 테이블 |
|---|---|
| MIG-7 | `staging.ecount_expense_voucher_raw`, `staging.ecount_deposit_report_raw` |
| MIG-8 | `staging.ecount_order_raw` |
| MIG-11 | `staging.ecount_sales_ledger_raw`, `staging.ecount_purchase_ledger_raw` |

재실행 전 확인:

```sql
SELECT transform_status, COUNT(*)
  FROM staging.ecount_order_raw
 GROUP BY transform_status
 ORDER BY transform_status;
```

---

## 5. 사후 검증

### 5.1 DailyClosing 대조

MIG-11 기준 대조 SQL입니다. 날짜별 이카운트 raw 합계와 Samhan Public DailyClosing 합계를 비교합니다. 실제 MIG-11 importer는 `closing_kind` 기준으로 합산하므로, 아래 SQL도 `SALES`는 `TAX_INVOICE + SALES_SLIP`, `PURCHASE`는 `PURCHASE_SLIP`을 명시해 V21 unique index(`closing_date, partner_id, closing_kind, source_kind`) 구조를 드러냅니다.

```sql
WITH raw_sales AS (
    SELECT transaction_date, SUM(total_amount) AS raw_total
      FROM staging.ecount_sales_ledger_raw
     WHERE is_deleted = FALSE
     GROUP BY transaction_date
),
daily_sales AS (
    SELECT closing_date AS transaction_date, SUM(total_amount) AS domain_total
      FROM daily_closings
     WHERE is_deleted = FALSE
       AND partner_id IS NULL
       AND closing_kind = 'SALES'
       AND source_kind IN ('TAX_INVOICE', 'SALES_SLIP')
     GROUP BY closing_date
)
SELECT r.transaction_date,
       r.raw_total,
       COALESCE(d.domain_total, 0) AS domain_total,
       r.raw_total - COALESCE(d.domain_total, 0) AS diff
  FROM raw_sales r
  LEFT JOIN daily_sales d ON d.transaction_date = r.transaction_date
 WHERE r.raw_total <> COALESCE(d.domain_total, 0)
 ORDER BY r.transaction_date;
```

매입장은 `staging.ecount_purchase_ledger_raw`, `closing_kind = 'PURCHASE'`, `source_kind IN ('PURCHASE_SLIP')`로 바꿔 실행합니다. 세금계산서와 판매전표를 분리 검증하려면 `source_kind`를 SELECT와 GROUP BY에 추가해 날짜+출처별로 비교합니다.

### 5.2 sample 5건 cross-check

PartnerAgingSnapshot 순잔액과 이카운트 raw를 거래처별로 5건 대조합니다. accounting_db와 partner_db는 service-per-DB라 SQL JOIN을 하지 않습니다. 먼저 accounting_db에서 `partner_id`와 순잔액을 뽑고, 거래처명은 partner-service batch endpoint로 확인합니다.

```sql
SELECT s.partner_id,
       s.net_receivable,
       s.net_payable,
       s.net_cash
  FROM partner_aging_snapshot s
 ORDER BY ABS(s.net_receivable) DESC
 LIMIT 5;
```

위 SQL에서 나온 `partner_id` 목록은 partner-service 내부 batch endpoint로 이름을 확인합니다. 이 호출은 운영자 PC가 아니라 service-to-service 점검 권한이 있는 운영/개발 담당자가 실행합니다.

```http
POST /internal/partners/lookup-by-ids
Content-Type: application/json
X-Internal-Token: <service-to-service token>

{
  "ids": [
    "11111111-1111-1111-1111-111111111111",
    "22222222-2222-2222-2222-222222222222"
  ]
}
```

운영 확인 방식:

1. 이카운트 매출장/매입장 원본에서 같은 거래처 5건을 찾습니다.
2. partner-service lookup 결과의 거래처명으로 Samhan Public AgingSnapshot 화면을 조회합니다.
3. `net_receivable`과 원본 미수 잔액 방향이 같은지 확인합니다.
4. 금액 차이가 있으면 Cash → Journal 생성 여부와 DailyClosing 차이를 함께 봅니다.

### 5.3 ErrorCode 분포 통계

거부 사유가 한쪽으로 몰리면 원본 파일 또는 lookup 기준 문제입니다.

```sql
SELECT reject_reason, COUNT(*) AS rows
  FROM staging.ecount_order_raw
 WHERE transform_status = 'REJECTED'
 GROUP BY reject_reason
 ORDER BY rows DESC;
```

공통 확인 대상:

```sql
SELECT transform_status, COUNT(*)
  FROM staging.ecount_expense_voucher_raw
 GROUP BY transform_status;

SELECT transform_status, COUNT(*)
  FROM staging.ecount_deposit_report_raw
 GROUP BY transform_status;

SELECT transform_status, COUNT(*)
  FROM staging.ecount_order_raw
 GROUP BY transform_status;

SELECT transform_status, COUNT(*)
  FROM staging.ecount_sales_ledger_raw
 GROUP BY transform_status;

SELECT transform_status, COUNT(*)
  FROM staging.ecount_purchase_ledger_raw
 GROUP BY transform_status;
```

---

## 6. FAQ + 트러블슈팅

### Q1. MIG-N 실행 후 transform_status REJECTED가 많을 때?

먼저 `rejectedSample`의 `errorCode` 또는 `reason`과 `message`를 봅니다.

| errorCode | 의미 | 조치 |
|---|---|---|
| `MIG*_LOOKUP_MISS` | 거래처, 품목, 창고, 계정이 기준표에서 안 잡힘 | MIG-1/MIG-2 기준표 누락 여부 확인 |
| `MIG*_LOOKUP_AMBIGUOUS` | 같은 이름 후보가 여러 개 | 이카운트 코드 또는 Samhan 기준명을 보강 |
| `MIG*_AMOUNT_INVALID` | 금액이 비어 있거나 문자 포함 | 원본 row 금액 셀 확인 |
| `MIG*_DATE_INVALID` | 날짜 형식 불일치 | 이카운트 export 기간/날짜 셀 형식 확인 |
| `MIG*_DUPLICATE_EXTERNAL_REF` | 이미 같은 외부 참조가 있음 | 같은 파일 재실행인지, 중복 원본인지 확인 |

처리 순서:

1. `rejectedSample` 20건을 먼저 확인합니다.
2. 같은 errorCode가 80% 이상이면 lookup 또는 원본 header 문제로 봅니다.
3. 원인을 고친 뒤 해당 row만 `PENDING`으로 되돌립니다.
4. 같은 endpoint를 다시 실행합니다.

### Q2. Permission denied 403 - ACCOUNTANT 권한 부여 절차

ACCOUNTANT는 조회 권한 중심입니다. import, transform, refresh는 MASTER/MANAGER만 허용되는 단계가 있습니다.

처리 순서:

1. 현재 로그인 계정의 역할이 `ACCOUNTANT`인지 확인합니다.
2. 실행 작업이면 MASTER 또는 MANAGER 계정으로 다시 로그인합니다.
3. 조회 작업인데 403이면 auth-service의 PageCode 권한 seed를 확인합니다.
4. 누락된 경우 auth-service admin UI에서 ACCOUNTANT에 조회 권한을 부여하거나, 운영 DBA가 V25 seed와 같은 형태로 `role_page_permissions`에 `can_view=TRUE`, `can_edit=FALSE`를 추가합니다.
5. desktop 메뉴가 안 보이면 AppLayout 권한 캐시가 false인 상태일 수 있으므로 새로 로그인합니다.

운영자가 확인할 PageCode:

| 화면 | PageCode |
|---|---|
| Cash | `ecount.mig14.cash-list` |
| Order | `ecount.mig14.order-list` |
| AgingSnapshot | `ecount.mig14.aging-snapshot` |
| Ledger | `ecount.mig14.ledger` |

권한 seed SQL 예시:

```sql
INSERT INTO role_page_permissions
    (id, role_code, page_code, can_view, can_edit, created_at, created_by, is_deleted)
VALUES
    (gen_random_uuid(), 'ACCOUNTANT', 'ecount.mig14.cash-list', TRUE, FALSE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'ACCOUNTANT', 'ecount.mig14.order-list', TRUE, FALSE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'ACCOUNTANT', 'ecount.mig14.aging-snapshot', TRUE, FALSE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'ACCOUNTANT', 'ecount.mig14.ledger', TRUE, FALSE, NOW(), 'system', FALSE)
ON CONFLICT DO NOTHING;
```

### Q3. Aging snapshot 새로고침 실패 - MATERIALIZED VIEW REFRESH 트랜잭션 격리

증상:

```json
{
  "status": 422,
  "code": "MIG9_AGING_REFRESH_FAILED",
  "message": "partner_aging_snapshot 새로고침 실패"
}
```

원인:

- `REFRESH MATERIALIZED VIEW CONCURRENTLY`는 별도 트랜잭션에서 실행되어야 합니다.
- 동시에 다른 대량 변환이 같은 snapshot을 읽고 있을 수 있습니다.
- unique index가 없으면 concurrent refresh가 실패합니다.

처리 순서:

1. accounting-service 로그에서 `MIG9_AGING_REFRESH_FAILED` 앞뒤 50줄을 확인합니다.
2. Cash → Journal 생성이 끝났는지 확인합니다.
3. 다음 SQL로 unique index를 확인합니다.

```sql
SELECT indexname, indexdef
  FROM pg_indexes
 WHERE tablename = 'partner_aging_snapshot';
```

4. 대량 import가 끝난 뒤 MASTER/MANAGER 계정으로 다시 새로고침합니다.

### Q4. 같은 파일을 다시 올려도 되나요?

가능합니다. staging은 `source_file_hash + source_row_no` 기준으로 멱등 처리됩니다. 다만 원인을 모르는 상태에서 반복 실행하면 로그와 감사 이력이 복잡해집니다.

권장:

- 파일을 잘못 골랐으면 중단하고 백업 담당자에게 알립니다.
- 같은 파일 재실행은 원인 수정 후 1회만 합니다.
- 다른 기간 파일은 파일명과 기간을 확인한 뒤 실행합니다.

### Q5. 운영 화면에서 UUID가 보이면?

즉시 중단하고 화면 캡처를 남깁니다. 운영 화면에는 내부 UUID 대신 다음 업무 식별자만 보여야 합니다.

- 거래처명
- 전표번호 또는 slipNo
- 주문번호 또는 orderNo
- Journal 번호
- 담당자명

UUID 노출은 운영자 실수 유발과 보안 정책 위반 가능성이 있으므로 후속 cutover를 멈추고 수정합니다.

---

## 7. cutover 완료 기준

다음 조건을 모두 만족하면 MIG-19 cutover 가이드를 기준으로 운영 전환을 완료로 봅니다.

- MIG-1~6 raw 적재 완료
- MIG-7 Cash 변환 완료
- MIG-8 Order 변환 완료
- MIG-9 Cash → Journal 생성 및 AgingSnapshot 새로고침 완료
- MIG-10 Employee cross-link 완료
- MIG-11 매출장/매입장 XLSX 대조 완료
- DailyClosing 불일치가 운영자가 승인한 known diff만 남음
- sample 5건 거래처 aging 순잔액 cross-check 완료
- ErrorCode 분포가 lookup/header/권한 문제 없이 안정화됨
- admin UI 4 화면에서 UUID 비노출 확인

# SP-D6-7 accounting-service 권한 마이그레이션 설계

## 목표

accounting-service 의 사용자-facing `@PreAuthorize` role guard 를 `@RequirePermission` 기반 동적 RBAC 로 이전한다. SP-D5 에서 이미 적용된 `accounting.reports` 보고서 컨트롤러 10개는 변경하지 않는다.

## 선행 slice 적용 원칙

- `AccountingEditRequestController` 는 `accounting.edit-requests` 와 `accounting.edit-requests.decide` 로 분리한다. 생성/이력 조회와 승인/거절 권한을 섞지 않는다.
- `@hr.isExecutiveOffice()` 같은 정적 SpEL guard 가 발견되면 `@RequirePermission` 과 병행해 보존한다.
- 기존 PageCode 는 V7~V30 seed 의미와 충돌하지 않는 범위에서 재사용한다. 기존 코드가 endpoint 역할 집합을 표현하지 못하면 V37 에 신규 PageCode 를 추가한다.
- V37 신규 PageCode 는 11-role matrix 를 모두 채우며 `DEVELOPER`, `PARTNER`, `STAFF`, `DRIVER` 는 의도적 허용이 없는 한 `FALSE/FALSE` 로 둔다.
- accounting-service 는 `loadBalancedRestClientBuilder` 기반 shared-security auto-config 로 DPC bean 이 이미 등록되므로 중복 `DynamicPermissionClientConfig` 를 추가하지 않는다.
- `@WebMvcTest` slice IT 는 grant/deny 양쪽을 검증한다. deny case 는 DPC `false` stub 과 `X-User-Role` 헤더를 모두 둔다.

## PageCode 매핑

기존 PageCode 재사용:

| PageCode | 용도 |
|---|---|
| `accounting.accounts` | 계정과목 트리/alias 조회 |
| `accounting.journals` | 분개장 CRUD, posting/reversal, export |
| `accounting.balances` | 기존 시산표/잔액 계열 |
| `accounting.tax-invoice.list` | 세금계산서 조회 및 ACCOUNTANT/MASTER 편집 |
| `accounting.tax-invoice.emit-nts` | NTS 발송 |
| `accounting.tax-invoice.batch-issue` | 매출전표 묶음 발행 |
| `accounting.deposit-match` | KFTC 입금 매칭 |
| `accounting.daily-closing` | 일마감 조회 |
| `accounting.general-ledger` | 원장 조회 |
| `accounting.period-close` | 마감 조회/실행 |
| `accounting.statement-batch` | 거래명세서 batch 조회 |
| `accounting.partner-ledger` | 거래처 원장/사업자 양식 |
| `accounting.reports` | 기존 재무 보고서/집계 조회 |
| `ecount.mig2.*` ~ `ecount.mig11.*`, `ecount.mig14.*`, `ecount.reimport` | 이카운트 import/transform/reimport |

V37 신규 PageCode:

| PageCode | 용도 | 허용 역할 |
|---|---|---|
| `accounting.edit-requests.decide` | 회계 수정 요청 목록/승인/거절 | MANAGER, MASTER |
| `accounting.tax-invoice.cancel` | 세금계산서 취소 | ACCOUNTANT, MANAGER, MASTER |
| `accounting.tax-invoice.issue-request` | P0-4 세금계산서 발행 요청 생성 | ACCOUNTANT, MANAGER, MASTER |
| `accounting.tax-invoice.realtime` | 세금계산서 SSE | ACCOUNTANT, MASTER |
| `accounting.tax-invoice.inbound.manage` | 수신 세금계산서 조회/등록/첨부 | ACCOUNTANT, MASTER |
| `accounting.hometax-export` | 홈택스 export/preview/exclusion/history | ACCOUNTANT, MANAGER, MASTER |
| `accounting.daily-closing.run` | 일마감 실행 | ACCOUNTANT, MANAGER, MASTER |
| `accounting.daily-closing.unlock` | 일마감 잠금 해제 | MASTER |
| `accounting.period-close.reverse` | 역마감 | MASTER |
| `accounting.journals.realtime` | 분개장 SSE | ACCOUNTANT, MASTER |
| `accounting.balances.trial-balance` | TrialBalanceController 기존 endpoint | ACCOUNTANT, MASTER |
| `accounting.sales-slip.accounting` | 회계 매출전표 조회/생성/post | ACCOUNTANT, MASTER |
| `accounting.purchase-slip.accounting` | 회계 매입전표 조회/생성/post | ACCOUNTANT, MASTER |
| `accounting.supplier-profiles` | 사업자 양식 조회/관리 | 조회 ACCOUNTANT/MANAGER/MASTER, 편집 MANAGER/MASTER |

## 비범위

- SP-D5 `services/accounting-service/src/main/java/.../accounting/report/*Controller.java` 의 `@RequirePermission(page = accounting.reports)` 는 변경하지 않는다.
- 내부 토큰 전용 endpoint, vendor 실 API 호출, DB schema 변경은 이번 slice 범위가 아니다.

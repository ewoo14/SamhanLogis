# #1144 P0-B — 회계전표 PageCode·액션 정합

작성일: 2026-08-08

## 1. 결론과 변경 범위

정본은 **① FE를 BE에 맞춘다**이다.

근거는 다음과 같다.

| 근거 | 내용 |
|---|---|
| `services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/SalesAccountingSlipController.java:25,37,53` | 매출 회계전표 조회/생성/전기의 BE 가드가 모두 `accounting.sales-slip.accounting` |
| `services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/PurchaseAccountingSlipController.java:25,37,53` | 매입 회계전표 조회/생성/전기의 BE 가드가 모두 `accounting.purchase-slip.accounting` |
| `services/auth-service/src/main/resources/db/migration/V37__seed_sp_d6_7_accounting_page_codes.sql:35-36,79-82` | 회계 서비스 전용 `.accounting` PageCode를 정식 카탈로그와 권한 시드에 등록 |
| `services/auth-service/src/main/resources/db/migration/V11__add_sas_sales_slip_permissions.sql:4-11` | 매출 `.list`는 구형 SAS 역할 시드 |
| `services/auth-service/src/main/resources/db/migration/V12__add_sas_purchase_slip_permissions.sql:4-11` | 매입 `.list`는 구형 SAS 역할 시드 |
| `clients/desktop/src/renderer/api/permissionsApi.ts:409-411` | FE `edit`는 `UPDATE`로 정규화되므로 생성 화면에는 계약상 `CREATE`를 써야 함 |

변경은 다음으로 한정했다.

- 회계전표 매출/매입 목록 라우트: `.accounting + VIEW`
- 회계전표 매출/매입 작성 라우트: `.accounting + CREATE`
- 회계 메뉴의 매출/매입 링크 가드: `.accounting + VIEW`
- 기존 `.list` 권한을 `.accounting`으로 복제하는 auth `V95` migration
- FE 정적 계약 테스트

BE 컨트롤러, 전표 데이터, 원장, 분개, VAT 코드는 변경하지 않았다.

## 2. 권한 집합 보존 측정

실 DB는 SELECT만 수행했다. 대상은 매출·매입 각각의 `.list`와 `.accounting`이다.

### 2.1 복제 전 실측

| 축 | `.list` 행 / 유효 VIEW | `.accounting` 행 / 유효 VIEW | 겹침 및 판정 |
|---|---:|---:|---|
| 계정 | 26 / 20 | 29 / 7 | `.accounting` 유효 VIEW 7명 전원이 `.list` 유효 집합에 포함 |
| 그룹 | 6 / 3 | 9 / 1 | `.accounting` 유효 VIEW 1개가 `.list` 유효 집합에 포함 |
| 역할 템플릿 | 8 / 4 | 11 / 2 | `.accounting` 유효 VIEW 2개가 `.list` 유효 집합에 포함 |

생성·수정·삭제 유효 주체도 동일한 부분집합 관계였다.

- 계정: `.list` CREATE/UPDATE/DELETE 각 10명, `.accounting` 각 7명
- 그룹: `.list` 각 2개, `.accounting` 각 1개
- 역할: `.list` 각 3개, `.accounting` 각 2개

대상별 기존 `.accounting` 행 중 `.list`에 대응하지 않는 행은 모두 권한이 FALSE인 placeholder 행이었다. 따라서 `.list` 값을 `.accounting`으로 upsert해도 기존 유효 권한을 좁히지 않는다.

### 2.2 복제 후 예상 집합

`V97__align_accounting_slip_permissions.sql`은 세 축과 두 역할 저장 표현 모두 다음 방식이다.

1. `.list` 행을 동일 주체의 `.accounting` 행으로 INSERT한다.
2. 이미 `.accounting` 행이 있으면 `.list`의 7-action 값을 UPDATE한다.
3. `.list` 행은 삭제하지 않는다.
4. partial unique index의 `ON CONFLICT`를 사용하므로 재실행해도 중복 행이 생기지 않는다.

역할 축은 V39 이후 실제 템플릿인 `role_page_permission_templates`와, V11/V12가 남긴
deprecated `role_page_permissions`를 함께 정렬한다.

따라서 매출·매입 각각의 예상치는 다음과 같다.

| 축 | 복제 후 `.accounting` 행 / 유효 VIEW | `.list` 상태 | 중복 |
|---|---:|---|---:|
| 계정 | 29 / 20 | 26행 / 20 VIEW 그대로 유지 | 0 |
| 그룹 | 9 / 3 | 6행 / 3 VIEW 그대로 유지 | 0 |
| 역할 템플릿 | 11 / 4 | 8행 / 4 VIEW 그대로 유지 | 0 |

매출·매입은 동일한 결과이며, 기존 `.accounting` 유효 권한의 손실 0, 기존 `.list` 유효 권한의 복제 누락 0, `.list` 삭제 0이다. 권한 없는 계정·그룹·역할은 FALSE 값 그대로 복제되므로 새 허용이 생기지 않는다.

## 3. RED-A / RED-B와 동시 GREEN

### RED-A — 기존 403 원문

조사에서 확인한 13개 `.list VIEW` 전용 계정의 화면 진입 후 GET 403 및 3개 `.list UPDATE` 전용 계정의 저장 403은 `docs/dev-reports/2026-08-08-1144-accounting-spec-gap-survey.md` 규칙 1에 기록되어 있다.

저장 403 원문은 `docs/dev-reports/2026-08-03-874-live-qa-5.md`의 실계정 `dev_manager` 재현과 일치한다.

```text
HTTP 403 POST /admin/sales-slips
{"success":false,"code":"FORBIDDEN","message":"[SP-PO-1] 동적 권한 deny — page=accounting.sales-slip.accounting action=CREATE role=UNKNOWN reason=account permission missing","data":null,"timestamp":"2026-08-03T12:57:25.555772325Z"}
```

같은 세션의 권한 응답:

```text
accounting.sales-slip.accounting: []
```

### RED-B — 권한 없는 주체 차단

`docs/dev-reports/2026-08-03-874-live-qa-6.md` 실계정 확인:

```text
dev_manager:  accounting.sales-slip.accounting: []
dev_staff:    accounting.sales-slip.accounting: []
dev_sales:    accounting.sales-slip.accounting: []
dev_warehouse: accounting.sales-slip.accounting: []
```

권한 없는 요청의 기존 서버 계약은 `services/accounting-service/src/test/java/com/samhanair/logis/accounting/it/AccountingPermissionControllerIT.java:192-201`의 `status().isForbidden()`이다. V95는 FALSE 행도 복제하므로 이 계정들은 계속 403이다.

### GREEN 계약

동일한 정합 계약을 `clients/desktop/src/renderer/test-utils/accounting-slip-permission-contract.test.ts`에 고정했다.

```text
sales list  -> accounting.sales-slip.accounting VIEW
sales new   -> accounting.sales-slip.accounting CREATE
purchase list -> accounting.purchase-slip.accounting VIEW
purchase new  -> accounting.purchase-slip.accounting CREATE
```

migration의 네 저장소(`role_page_permissions`, `role_page_permission_templates`, `group_page_permissions`, `account_page_permissions`)·네 PageCode·`ON CONFLICT`·`.list` 보존도 같은 테스트에서 확인한다. 실 DB에 migration을 적용하거나 재배포하는 작업은 금지 조건에 따라 수행하지 않았다.

Vitest 의존성이 없는 현재 워크트리에서도 동일한 11개 계약을 read-only PowerShell assertion으로 실행한 동시 GREEN 원문:

```text
passed=11/11
```

## 4. `accounting.*` 전수 차집합

FE `PermissionGuard`/`dynamicCanAccess`와 services 전체의 `@RequirePermission`을 정적 grep으로 전수 대조했다.

| 구분 | PageCode | 판정 |
|---|---|---|
| 양쪽 공통 | `accounting.accounts`, `accounting.balances`, `accounting.bank-card-admin`, `accounting.bank-matching`, `accounting.cash-receipts`, `accounting.daily-closing`, `accounting.deposit-mapping`, `accounting.edit-requests.decide`, `accounting.general-ledger`, `accounting.journals`, `accounting.partner-ledger`, `accounting.period-close`, `accounting.purchase-slip.accounting`, `accounting.reports`, `accounting.sales-slip.accounting`, `accounting.statement-batch`, `accounting.tax-invoice.batch-issue`, `accounting.tax-invoice.list` | 정합 |
| FE-only | `accounting.receivables`, `accounting.tax-invoice.inbound` | FE 메뉴/라우트 카탈로그는 있으나 동일 리터럴 BE annotation 없음. 별도 화면 계약으로 이번 슬라이스에서 변경하지 않음 |
| FE-only(의도된 다른 BE 계열) | `accounting.sales-slip.list` | 입출고 분석/원천 조회가 `slip-service`의 `.list` 가드를 사용한다. 회계전표 BE의 `.accounting`과 혼용하지 않음 |
| BE-only | `accounting.daily-closing.run`, `accounting.daily-closing.unlock`, `accounting.deposit-match`, `accounting.edit-requests`, `accounting.hometax-export`, `accounting.journals.realtime`, `accounting.period-close.reverse`, `accounting.purchase-slip.list`, `accounting.sales-slip.list`, `accounting.supplier-profiles`, `accounting.tax-invoice.cancel`, `accounting.tax-invoice.emit-nts`, `accounting.tax-invoice.inbound.manage`, `accounting.tax-invoice.issue-request`, `accounting.tax-invoice.realtime` | endpoint 세부 액션용 BE 코드. FE 부모 화면 가드가 같은 세부 코드를 직접 소비하지 않는 기존 계약이며, P0-B 대상인 회계전표 목록/작성의 두 쌍만 정렬 |

전수 결과에서 **회계전표 화면의 미스매치는 매출·매입 `.list`→`.accounting` 두 쌍과 작성 `edit`→`create` 두 액션**으로 한정된다. `slip-service` 원천 조회의 `.list`는 별도 서비스 계약이므로 건드리지 않았다.

## 5. 새로 가능해진 조합과 결과

권한 정책을 새로 부여하지 않고, 기존 `.list` 유효 권한을 정본 `.accounting`으로 복제했을 때 가능해지는 조합은 다음이다.

| 조합 | 기존 결과 | V95 후 결과 |
|---|---|---|
| 매출전표 목록 + `.list VIEW` 계정 13명 | 화면 진입 후 GET 403 | `.accounting VIEW`로 화면 진입 및 GET 허용 |
| 매입전표 목록 + `.list VIEW` 계정 13명 | 화면 진입 후 GET 403 | `.accounting VIEW`로 화면 진입 및 GET 허용 |
| 매출전표 작성 + `.list UPDATE` 전용 3명 | 저장 POST 403 | 생성 액션을 `.accounting CREATE`로 평가하여 허용 |
| 매입전표 작성 + `.list UPDATE` 전용 3명 | 저장 POST 403 | 생성 액션을 `.accounting CREATE`로 평가하여 허용 |
| `.list`와 `.accounting` 모두 무권한 계정 | 차단 | 계속 차단(403) |

실제 전표의 생성·전기·수정·삭제는 실행하지 않았고, 기존 전표는 조회하지 않았다.

## 6. 테스트·검증

실행한 검증:

- read-only auth DB 집합/부분집합 SQL 대조: 계정·그룹·역할, 매출·매입 모두 수행
- FE/BE `accounting.*` grep 전수 대조
- FE 계약 테스트 파일 추가
- `npm test -- --run ...` 시도 결과: 저장소의 `pretest`가 로컬 파생물 누락(`electron-updater`, design-system dist, Electron out)을 사전 차단
- `npx vitest run ...` 시도 결과: 현재 워크트리 `node_modules`에 `vitest/config`가 없어 실행 불가

전체 Gradle 스위트, 재배포, Docker 재기동, DB 쓰기는 수행하지 않았다.

변경 파일을 참조하는 테스트의 실행 차단 원인은 코드 실패가 아니라 워크트리 의존 산출물 누락이다. PM이 의존 산출물을 준비한 뒤 다음 테스트를 실행해야 한다.

```text
clients/desktop: npm test -- --run src/renderer/test-utils/accounting-slip-permission-contract.test.ts
```

## 7. 신규 파일 목록

- `clients/desktop/src/renderer/test-utils/accounting-slip-permission-contract.test.ts`
- `services/auth-service/src/main/resources/db/migration/V97__align_accounting_slip_permissions.sql`
- `docs/dev-reports/2026-08-08-1144-p0b-pagecode-alignment.md`

수정 파일:

- `clients/desktop/src/renderer/routes/index.tsx`
- `clients/desktop/src/renderer/components/AppLayout.tsx`

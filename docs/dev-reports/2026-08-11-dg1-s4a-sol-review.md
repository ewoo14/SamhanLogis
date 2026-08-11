# D-G1 S4a SOL 5.6 코드 검토

- 검토일: 2026-08-11 KST
- 대상: PR #1170, 요청 기준 HEAD `77f9a8d8e`
- 범위: 정산 REST API, 회계 메뉴·route·화면, D-G6 권한, S1·S2 회귀
- 판정: **MERGE BLOCKED — 결함 3건 + 실 HTTP 검증 차단 1건**
- DB 원칙: 공유 DB 조회·쓰기 모두 하지 않았다. 생성·확정 live API도 호출하지 않았다.
- git 원칙: git 조작을 하지 않았다.

## 1. 결함 요약

| ID | 심각도 | 판정 | 핵심 |
|---|---:|---|---|
| SOL-S4A-01 | P0 | 결함 | 권한 없는 `DRIVER`에 정산 3비트를 부여해도 auth seed 테스트가 녹색이다. backend 역할×권한 exact 감시가 없다. |
| SOL-S4A-02 | P0 | 결함 | UUID가 REST 응답 `id`와 사용자 hash URL에 노출된다. 기존 DRAFT는 목록에서 상세로 진입할 수 없다. |
| SOL-S4A-03 | P1 | 결함 | 문서번호 셀이 native hyperlink가 아니고 #1094의 목록 상태·scroll·history 복귀 계약을 구현하지 않았다. |
| SOL-S4A-04 | P0 gate | 검증 차단 | 실행 중 accounting JAR에 S4a controller가 없어 허용·미허용 토큰 모두 404였다. 현재 소스의 backend guard가 실제 HTTP 403을 내는지 증명되지 않았다. |

따라서 현재 green인 공식 Playwright 5/5, Gradle, Vitest만으로 병합할 수 없다.

## 2. 권한 두 층 검토

### 2.1 V101을 직접 읽어 만든 역할 × 7-action exact 표

`V101__seed_sales_commission_settlement_page_permission.sql`의 역할 CTE, 7-bit insert/update, builtin group materialization을 서로 대조했다. `1=허용`, `0=거부`이다.

| 역할 | VIEW | CREATE | UPDATE | DELETE | RESTORE | DOWNLOAD | PRINT |
|---|---:|---:|---:|---:|---:|---:|---:|
| MASTER | 1 | 1 | 1 | 0 | 0 | 0 | 0 |
| MANAGER | 1 | 1 | 1 | 0 | 0 | 0 | 0 |
| ACCOUNTANT | 1 | 1 | 1 | 0 | 0 | 0 | 0 |
| SALES | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| WAREHOUSE | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| DISPATCH | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| INVENTORY | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| DEVELOPER | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| PARTNER | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| STAFF | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| DRIVER | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

현재 migration 값은 D-G6과 일치한다. 단, MASTER runtime bypass는 이 seed 표와 별개인 전역 정책이므로 테스트에서 별도 축으로 단정해야 한다.

### 2.2 뮤테이션 ① — 권한 없는 역할에 정산 권한 부여

재현:

1. V101의 두 번째 `grants(role_code, can_view, can_create, can_update)`에 `('DRIVER', TRUE, TRUE, TRUE)`를 임시 추가했다.
2. `SalesCommissionSettlementPermissionSeedTest`를 `--rerun-tasks`로 실행했다.
3. 기대: RED. 실제: **exit 0, `BUILD SUCCESSFUL in 25s`**.
4. 뮤테이션은 즉시 원복했다.

원인은 테스트가 SQL을 해석하거나 실행하지 않고 부분 문자열만 찾기 때문이다.

- `SalesCommissionSettlementPermissionSeedTest.java:24-30`: 컬럼명·허용 역할 substring만 확인
- `SalesCommissionSettlementPermissionSeedTest.java:38`: 거부 역할도 `("'DRIVER'")`가 SQL 어디엔가 있으면 통과
- `SalesCommissionSettlementPermissionSeedTest.java:41`: 허용 역할 역시 부분일치

즉 `DRIVER`가 zero-role CTE와 grant CTE 양쪽에 존재해도 테스트가 통과한다. #1130/#1145/#978과 같은 false-green 유형이다.

### 2.3 뮤테이션 ② — mock에 초과 비트 부여

재현:

1. `MOCK_ACTION_ONLY_PAGES['accounting.sales-commission-settlement']`를 `['CREATE', 'UPDATE', 'DOWNLOAD']`로 임시 변경했다.
2. `ACCOUNTANT 기본 권한` 테스트만 실행했다.
3. 실제: **exit 1, 1 failed**.

원문 핵심:

```text
Expected: ["VIEW", "CREATE", "UPDATE"]
Received: ["VIEW", "CREATE", "UPDATE", "DOWNLOAD"]
mock.test.ts:107
```

`toEqual(['VIEW', 'CREATE', 'UPDATE'])`이므로 mock 초과 비트 감시는 exact이며 정상이다. 뮤테이션은 즉시 원복했다.

### 2.4 backend guard 소스와 실 HTTP

소스 annotation은 좌표별로 맞다.

| API | 좌표 | 요구 action |
|---|---|---|
| 목록 GET | `SalesCommissionSettlementController.java:39-45` | VIEW |
| 상세 GET | `SalesCommissionSettlementController.java:50-53` | VIEW |
| 생성 POST | `SalesCommissionSettlementController.java:58-64` | CREATE |
| 확정 POST | `SalesCommissionSettlementController.java:69-72` | UPDATE |

그러나 `SalesCommissionSettlementControllerTest`는 annotation reflection만 보며 실제 AOP 거부를 호출하지 않는다. settlement 전용 MockMvc/통합 HTTP 권한 테스트도 없다.

실 gateway GET을 읽기 전용으로 호출한 결과:

```text
MASTER token -> STATUS=404
{"success":false,"code":"NOT_FOUND","message":"요청한 리소스를 찾을 수 없습니다.",...}

SALES token -> STATUS=404
{"success":false,"code":"NOT_FOUND","message":"요청한 리소스를 찾을 수 없습니다.",...}
```

컨테이너는 healthy였지만 배포 artifact가 stale이었다.

```text
samhan-accounting-service  Up 4 hours (healthy)
app.jar: SalesCommissionSettlementService count = 1
app.jar: SalesCommissionSettlementController count = 0
```

따라서 이 404는 guard 결함의 직접 증거가 아니라 **현재 소스의 실제 403을 검증할 수 없다는 gate 실패**다. 현 상태에서는 “backend guard 검증 완료”라고 판정할 수 없다.

## 3. 기존 회계 메뉴와 권한 매트릭스

fix 전 기준은 별도 main checkout의 `AppLayout.tsx`, fix 후는 이 워크트리 파일을 직접 파싱했다.

| 표면 | fix 전 | fix 후 | exact 차이 |
|---|---:|---:|---|
| 회계 `activeTargets` | 32 | 33 | 신규 route 1개만 추가 |
| 회계 렌더 anchor | 43 | 44 | 신규 route 1개만 추가, 삭제 0 |
| 권한 매트릭스 회계 pageCode | 61 | 62 | 신규 pageCode 1개만 추가, 삭제 0 |

추가된 값은 각각 `/accounting/sales-commission-settlements`, `accounting.sales-commission-settlement`뿐이다.

기존 렌더 route 43개 전수:

```text
/accounting/sales-slips
/accounting/purchase-slips
/accounting/accounts
/accounting/journals
/accounting/tax-invoices
/accounting/tax-invoices/batch
/accounting/tax-invoices/inbound
/accounting/balances
/accounting/reports
/accounting/reports/income-statement
/accounting/reports/income-statement/monthly
/accounting/reports/balance-sheet
/accounting/reports/vat
/accounting/reports/corporate-tax
/accounting/reports/partner-aging?type=RECEIVABLE
/accounting/reports/partner-aging?type=PAYABLE
/accounting/reports/receivables-payables
/accounting/reports/notes-receivable
/accounting/reports/collection-plans
/accounting/reports/cash-flow
/accounting/reports/equity-changes
/accounting/reports/daily-summary
/accounting/reports/monthly-summary
/accounting/reports/journal-status
/accounting/reports/account-statement
/accounting/funds/status
/accounting/reports/funds-flow-comparison
/sales/closing
/accounting/period-close
/accounting/statement-batch
/accounting/partner-ledger
/accounting/hometax-export
/accounting/supplier-profiles
/accounting/bank-card-admin
/accounting/bank-transactions
/accounting/deposit-mappings
/accounting/admin/cash-receipts
/accounting/daily-closing
/accounting/ledgers
/accounting/admin/ledger/sales
/accounting/admin/ledger/purchase
/accounting/admin/migration-ops
/admin/accounting-edit-requests
```

독립 Playwright에서 위 43개를 MASTER로 하나씩 열어 login/NotFound가 아님을 확인했고, 신규 포함 회계 anchor를 exact 44개로 단정했다.

현재 product state는 보존됐지만 공식 spec `dg1-s4a.spec.ts:101-113`은 43개 중 22개 기존 route와 신규 route를 `toContain`으로만 검사한다. 개수, 삭제, 중복, 실제 route open을 감시하지 않으므로 회귀 가드는 불충분하다.

## 4. 화면 가시성 및 독립 live QA

실행 환경:

- `clients/desktop`에서 headless Playwright 직접 실행
- Playwright 1.59.1, 설치된 `chromium-1217` / `chromium_headless_shell-1217`
- 최종 독립 검토 spec: **3 passed (8.7s)**, 산출 후 임시 spec 삭제
- 공식 S4a spec: **5 passed (7.9s)**

독립 단정은 `toBeVisible`, viewport bounds, `elementFromPoint` hit-test를 함께 사용했다. 720×900에서 ACCOUNTANT 메뉴, 확정 문서번호 control, 상세 뒤로 가기는 실제 가시·hit-test를 통과했다. 미허용 권한은 직접 route에서 홈으로 이동했고 drawer 안 회계 그룹 자체가 없었다.

공식 spec은 신규 사이드바 메뉴에 대해서만 bounds·hit-test를 한다(`dg1-s4a.spec.ts:27-40, 46-61`). 목록 row와 상세 전체는 주로 DOM visibility만 보므로 이 검토의 독립 단정이 없었다면 #1168 유형을 충분히 막지 못한다.

캡처:

- `docs/qa/2026-08-11-dg1-s4a-sol/01-accountant-list-narrow.png`
- `docs/qa/2026-08-11-dg1-s4a-sol/02-draft-no-link.png`
- `docs/qa/2026-08-11-dg1-s4a-sol/03-accountant-detail.png`
- `docs/qa/2026-08-11-dg1-s4a-sol/04-no-permission.png`
- `docs/qa/2026-08-11-dg1-s4a-sol/05-accounting-menu-44-items.png`

## 5. API 계약, UUID, DRAFT, #1094

### 5.1 통과한 계약

- controller는 `ApiResponse` wrapper를 사용한다.
- backend 금액 필드는 `BigDecimal`, desktop 계약은 정밀도를 보존하는 decimal string이다.
- 화면은 `Button`, `Card`, `DataTable`, `Badge`, `Spinner` 등 design-system 컴포넌트를 사용한다.
- accounting 전체 회귀에서 DRAFT 무번호, CONFIRMED 채번, versioned rate, CONFIRMED snapshot 불변 테스트가 통과했다.

### 5.2 UUID 노출 결함

- REST DTO: `SalesCommissionSettlementResponse.java:10-11`에 `UUID id`가 응답된다.
- 목록 확정 문서 클릭: `SalesCommissionSettlementListPage.tsx:59-61`이 `${LIST_PATH}/${row.id}`로 이동한다.
- 생성 직후: `SalesCommissionSettlementListPage.tsx:45`가 `${LIST_PATH}/${settlement.id}`로 이동한다.
- route: `routes/index.tsx:731`의 `/:id`가 hash URL에 UUID를 노출한다.
- 독립 QA에서 확정 문서를 클릭한 실제 URL에 `00000000-0000-4000-8000-000000000931`이 나타났다.

“본문에 UUID 문자열을 렌더하지 않는다”만으로 사용자 비공개 규칙을 만족하지 않는다. 브라우저 주소와 API 응답도 노출 표면이다.

### 5.3 DRAFT 조합 결함

`SalesCommissionSettlementListPage.tsx:57`은 DRAFT를 `문서번호 없음` plain text로 반환한다. anchor/button ancestor가 0개임을 독립 QA로 확인했다. 즉 기존 DRAFT는 목록에서 상세로 열 수 없다.

반면 새 DRAFT 생성 직후에는 UUID 상세 URL로 자동 이동한다. 같은 DRAFT가 생성 세션에서는 열리고, 목록 재진입 후에는 열리지 않는 비대칭이다.

### 5.4 #1094 결함

- 문서번호 control은 `<button>`이다(`SalesCommissionSettlementListPage.tsx:59`). native `<Link>/<a>`가 아니다.
- 목록에서 `returnTo`, query/page/filter, scroll anchor를 상세 route state에 넘기지 않는다.
- 상세는 state가 우연히 있으면 문자열 route로 `navigate(returnTo)`하고, 없으면 목록 root로 간다(`SalesCommissionSettlementDetailPage.tsx:55-58,73`). history entry unwind 및 scroll 복구가 아니다.

따라서 #1094의 “문서번호 셀 자체 native hyperlink + 접근성 + 목록 상태/scroll/history 복귀” 규약을 충족하지 않는다.

## 6. 재실측 결과와 RED-B

| 검증 | 결과 |
|---|---|
| accounting 전체 Gradle | `BUILD SUCCESSFUL in 6m 58s`; XML 224 files, **1,870 tests / 0 failures / 0 errors / 10 skipped** |
| auth settlement seed/pageCode/seed consistency | `BUILD SUCCESSFUL in 54s` |
| desktop 전체 Vitest | 소스 test files 246; **2,160 total / 2,159 passed / 1 skipped / 0 failed** |
| desktop typecheck | exit 0 |
| desktop production build | exit 0 |
| 공식 S4a Playwright | chromium-1217 **5/5 passed** |
| 독립 SOL Playwright | chromium-1217 **3/3 passed**, 기존 메뉴 43개 실제 open 포함 |

검토용 임시 Playwright spec이 QA 경로 resolver 규칙을 어겨 최초 전체 Vitest에서 하네스 2건이 실패했다. 제품 결함이 아니라 검토 spec 자체오염이었고, 해당 spec 삭제 후 전체 Vitest를 재실행해 위 최종 수치로 복원했다.

## 7. 구현자 수정 지시서

### 7.1 불변식

1. V101 exact 역할표는 위 11×7 표와 완전히 같아야 한다. 부분일치 금지.
2. migration, `role_page_permissions`, 7-action template, builtin group, account materialization이 같은 비트를 가져야 한다.
3. backend 실제 요청은 VIEW/CREATE/UPDATE를 각각 독립 강제하며, 미보유 non-MASTER 토큰은 403이어야 한다.
4. UUID는 REST 응답, UI text, hash/path/query, aria-label, 오류 메시지 어디에도 사용자 노출하지 않는다.
5. DRAFT와 CONFIRMED 모두 목록에서 상세 진입 가능해야 하되, DRAFT 무번호와 CONFIRMED 채번 불변식은 유지한다.
6. 문서번호 셀과 DRAFT 대체 진입점은 승인된 비UUID 공개 식별자로 동작해야 한다.
7. #1094 native hyperlink, 접근성, 목록 query/page/filter/scroll, 원래 history entry 복귀 계약을 그대로 따른다.
8. 기존 회계 43 route, activeTargets 32, 권한 매트릭스 61 pageCode는 변경하지 않고 신규 1개만 순증한다.
9. S1·S2의 DRAFT 무번호, 확정 채번, versioned rate, CONFIRMED snapshot 불변을 보존한다.

### 7.2 수정 좌표 전수

- auth: `V101__seed_sales_commission_settlement_page_permission.sql`, `SalesCommissionSettlementPermissionSeedTest.java`, `SalesCommissionSettlementPageCodeTest.java`, 필요 시 실제 migration IT
- backend guard: `SalesCommissionSettlementController.java`, `SalesCommissionSettlementControllerTest.java`, settlement 전용 MockMvc/통합 권한 테스트
- API 공개 계약: `SalesCommissionSettlementResponse.java`, request/path lookup DTO와 service/repository lookup
- desktop API/mock: `api/accounting.ts`, `api/mock.ts`, `api/mock.test.ts`, `api/salesCommissionSettlementApi.test.ts`
- UI/route: `SalesCommissionSettlementListPage.tsx`, `SalesCommissionSettlementDetailPage.tsx`, `routes/index.tsx`
- 메뉴/권한 관리: `AppLayout.tsx`, `PermissionMatrixPage.tsx`
- QA: `playwright/dg1-s4a-sales-commission-settlement/dg1-s4a.spec.ts`

### 7.3 재현 데이터

- 권한 mutation: `DRIVER = VIEW/CREATE/UPDATE true`
- mock mutation: ACCOUNTANT에 `DOWNLOAD` 추가
- CONFIRMED mock: 문서번호 `2026/08/11-1`, UUID `00000000-0000-4000-8000-000000000931`
- DRAFT mock: `documentNo = null`, settlementDate `2026-08-12`
- HTTP: SALES token으로 목록·상세 GET, VIEW-only/CREATE-only/UPDATE-only 토큰으로 각 endpoint 교차 호출
- 메뉴 baseline: 본 보고서의 기존 43 route exact 목록

### 7.4 RED-A 표적

1. V101을 격리 PostgreSQL에 실제 적용하고 모든 11역할×7action 결과를 exact table로 비교한다.
2. `DRIVER` grant mutation을 넣으면 위 테스트가 반드시 RED가 된다.
3. ACCOUNTANT mock에 `DOWNLOAD`를 넣으면 기존 exact 테스트가 계속 RED가 된다.
4. 현재 소스로 빌드한 accounting JAR을 격리 환경에 띄우고 gateway 실제 HTTP로 다음을 단정한다.
   - SALES 목록 GET = 403
   - SALES 상세 GET = 403
   - VIEW-only 목록/상세 = 200, 생성/확정 = 403
   - CREATE-only 생성만 허용
   - UPDATE-only 확정만 허용
5. API JSON과 location 전체에서 UUID key/value가 없음을 exact 단정한다.
6. 기존 DRAFT 목록 → 상세 → 뒤로 가기, CONFIRMED 문서 링크 → 상세 → 뒤로 가기를 실제 클릭하고 query/page/scroll이 복원됨을 단정한다.
7. `tagName === A`, href, aria-label, keyboard focus/Enter, viewport bounds, hit-test를 단정한다.

### 7.5 RED-B 표적

1. 기존 회계 anchor 43개와 route open 43개를 exact set으로 보존하고 신규 포함 44개를 단정한다.
2. 기존 activeTargets 32개와 권한 매트릭스 61개를 exact set으로 보존한다.
3. accounting 전체와 S1·S2 핵심 테스트를 재실행한다.
4. `ApiResponse`, `BigDecimal`, DRAFT 무번호, CONFIRMED 채번/snapshot/versioned 계약을 보존한다.
5. MASTER runtime bypass와 seed 7-bit 표를 혼동하지 않는 별도 테스트를 둔다.

### 7.6 반드시 추가할 새 조합

- 허용 3역할과 거부 8역할 각각의 7-bit exact 조합
- migration seed ↔ mock `/permissions/my` ↔ 권한관리 matrix 3자 exact 대조
- 목록 GET뿐 아니라 상세 GET의 미허용 역할 403
- VIEW-only / CREATE-only / UPDATE-only의 네 endpoint 교차표
- DRAFT 기존 row, 생성 직후 DRAFT, 확정 직후, 새로고침 후 상세
- CONFIRMED와 DRAFT 각각 목록 filter/page/scroll을 가진 상태의 상세 왕복
- 720×900 허용/미허용 drawer 및 desktop 폭
- stale JAR에는 테스트를 시작하지 못하게 하는 build/version/controller 존재 gate

**제 전제가 틀렸다면 고치지 말고 중단·보고하십시오.** 특히 DRAFT에 사용할 승인된 비UUID 공개 식별자가 이미 다른 결정에 정해져 있거나, REST 응답 UUID 허용 예외가 정본에 있다면 임의의 새 식별자를 만들지 말고 그 결정 좌표를 먼저 보고해야 한다.

## 8. 이 라운드가 보지 않은 표면

- 공유 DB에 V101을 실제 적용한 결과: write 금지 때문에 미검증
- 현재 소스로 재배포한 backend의 실 200/403: 실행 컨테이너가 stale JAR이라 미검증
- live 생성·확정: 공유 DB write 금지 때문에 미실행
- Electron 패키징 설치본과 모바일 클라이언트
- 운영 reverse proxy/WAF/외부 인증 공급자 경로

이 미검증 표면은 결함 0 보고용 면책이 아니라, SOL-S4A-04를 닫기 위한 다음 검증 범위다.

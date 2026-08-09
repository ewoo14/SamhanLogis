# PR #1145 R14 — refresh 파생 보존과 SALES 회계전표 버튼 권한

검증 워크트리: `C:\dev\Samhan-Public\.claude\worktrees\t1144`  
검증 HEAD: `ae8cdb37d`  
검증일: 2026-08-09 (KST)  
금지 준수: commit/push 0회 · 다른 워크트리/main checkout 0회 · 실 DB write 0회 · V99 내용 변경 0회

## 최종 판정

- refresh 생성기가 DB 템플릿과 MASTER runtime seven-action wrapper를 함께 생성한다.
- refresh exit 0 후 산출물 hash가 refresh 직전 체크인 hash와 같다.
- SALES는 VIEW-only인 V99 회계전표 목록에서 `작성`과 DRAFT `전기`가 보이지 않는다.
- MASTER·MANAGER·ACCOUNTANT는 canonical `.accounting` 권한의 CREATE/UPDATE에 따라 기존 쓰기 동작을 유지한다.

## ① 생성기 수정과 mutation 증명

수정 원문:

- `scripts/refresh-accounting-permission-db-snapshot.ps1:75-95`
  - 출력 대상을 `TEMPLATE_PERMISSION_DB_BITS_BY_ROLE`로 만든다.
  - `PERMISSION_PAGE_CODES`를 import한다.
  - `DynamicPermissionService`의 MASTER wrapper를 출력한다: 모든 catalog page에 `1111111`.
- `clients/desktop/src/renderer/test-utils/accounting-slip-permission-db-snapshot.ts:1-413`
  - 위 생성 결과이며 비-MASTER template은 그대로 유지된다.
- 계약 테스트: `clients/desktop/src/renderer/test-utils/accounting-slip-permission-contract.test.ts:67-84`

기존 생성기의 실제 RED:

```text
CHECKIN_HASH=A44F7A67DD11D7DBCD2D836D4E2AA3D1D18C36D9528909F92FB52933F00B729D
REFRESH_HASH=1FDE26D605E919C886E05FC1C2F0E011A9367A51DB74BD5B074CA212DD61964F
1 insertion / 10 deletions
```

수정 후 공식 refresh의 실제 원문:

```text
REFRESH_EXIT=0
CHECKIN_BEFORE_REFRESH_SHA256=6BD5BCDAEC99EFAA2DD100C8E38962D68A57B9CE4FE8FD16C831EAEB8E1C0952
REFRESH_AFTER_SHA256=6BD5BCDAEC99EFAA2DD100C8E38962D68A57B9CE4FE8FD16C831EAEB8E1C0952
```

mutation: 생성기의 `:89-95` MASTER 분기를 임시 제거하고 계약 테스트를 실행했다. 결과는 `10 tests | 1 failed`, 실패 원인은 `keeps the MASTER runtime seven-action derivation in the official refresh generator`였다. 즉 MASTER 분기를 빼면 RED이다. 분기는 즉시 원복했다.

refresh는 매번 임시 Docker PostgreSQL에 전체 migration을 적용하고 컨테이너/network를 finally에서 회수했다. 공유 auth DB에는 쓰지 않았다.

## ② 화면 액션 버튼 전수와 양방향 권한

| 화면 | 버튼 | 필요 권한 | 현재 확인하는가 | 조치 |
|---|---|---|---|---|
| 매출전표 목록 | 작성 | `accounting.sales-slip.accounting / CREATE` | 기존 미확인 | `canCreate`일 때만 렌더 (`SalesAccountingSlipPage.tsx:34,117-121`) |
| 매출전표 목록 | DRAFT 전기 | `accounting.sales-slip.accounting / UPDATE` | 기존 미확인 | `canPost && status === DRAFT`일 때만 렌더 (`:35,97-105`) |
| 매입전표 목록 | 작성 | `accounting.purchase-slip.accounting / CREATE` | 기존 미확인 | `canCreate`일 때만 렌더 (`PurchaseAccountingSlipPage.tsx:34,117-121`) |
| 매입전표 목록 | DRAFT 전기 | `accounting.purchase-slip.accounting / UPDATE` | 기존 미확인 | `canPost && status === DRAFT`일 때만 렌더 (`:35,97-105`) |
| 매출전표 작성 | 임시저장 | `accounting.sales-slip.accounting / CREATE` | route만 확인 | form 내부도 `canCreate`로 조건 렌더 (`SalesAccountingSlipFormPage.tsx:33,158-166`) |
| 매입전표 작성 | 임시저장 | `accounting.purchase-slip.accounting / CREATE` | route만 확인 | form 내부도 `canCreate`로 조건 렌더 (`PurchaseAccountingSlipFormPage.tsx:33,158-166`) |
| 두 작성 화면 | 목록 | VIEW 화면 복귀/탐색 | 쓰기 권한 불필요 | 유지 |

양방향 확인 원문:

- 계약 테스트가 두 페이지에서 canonical `canAccess(..., 'create')`와 `canAccess(..., 'update')`를 모두 요구한다.
- permission matrix snapshot/V99 계약에서 MASTER·MANAGER·ACCOUNTANT는 두 `.accounting` page의 write bits를 유지하고 SALES는 `1000000`이다.
- 따라서 SALES VIEW-only는 작성/전기 미노출, MASTER·MANAGER·ACCOUNTANT는 해당 권한이 true일 때 그대로 노출된다.

## ③ V99 관련 6개 page code 전수 점검

V99가 source/destination으로 다루는 관련 canonical 6개는 다음과 같다.

| page code | 화면/버튼 점검 결과 |
|---|---|
| `accounting.sales-slip.list` | 레거시 목록 permission seed/호환 코드. 신규 회계전표 화면 CTA는 `.accounting`을 본다. 무권한 write CTA 없음 |
| `accounting.sales-slip.accounting` | 매출전표 목록 작성/전기 및 작성 form 임시저장 모두 CREATE/UPDATE 확인 |
| `accounting.purchase-slip.list` | 레거시 목록 permission seed/호환 코드. 신규 회계전표 화면 CTA는 `.accounting`을 본다. 무권한 write CTA 없음 |
| `accounting.purchase-slip.accounting` | 매입전표 목록 작성/전기 및 작성 form 임시저장 모두 CREATE/UPDATE 확인 |
| `accounting.tax-invoice.inbound` | 기존 레거시 source. 신규 수신 화면 route/button은 canonical `.inbound.manage`를 사용 |
| `accounting.tax-invoice.inbound.manage` | `TaxInvoiceInboundPage` route guard와 화면의 관리 CTA가 동적 권한을 사용. 동일한 무조건 작성/전기 형태 없음 |

추가 인접 회계 화면도 확인했다. `TaxInvoiceListPage.tsx:59,168,192`의 신규 작성은 `accounting.tax-invoice.list / CREATE` 조건이며, `TaxInvoiceDetailPage.tsx:106,263-265`의 수정/취소/국세청 전송은 각각 동적 권한을 확인한다. V99 관련 6개에서 같은 결함은 매출·매입 두 목록의 4개 write CTA였고 모두 수정했다.

## ④ 잃으면 안 되는 것 일곱 개 확인 원문

1. **실 API MASTER 200 page 전부 7-action** — R13 실 API 원문: `MASTER login=200`, `permissions=200`, `pageCount=200`, `full7Count=200`, `invalidCount=0`. 이번 변경은 runtime MASTER wrapper와 generator만 정렬했으며 API/서비스 enforcement는 변경하지 않았다.
2. **MASTER 특정 page/action 불가 단정 764파일 전수 0건** — R13 원문: Git tracked `services/auth-service/src/test` + `clients/desktop/src` Java/TS/TSX/JS/JSX 764개 전수 스캔, MASTER 특정 page/action false/403 단정 `0건`. 이번 변경은 해당 영역을 추가하지 않았다.
3. **동결 정확히 239** — R13 원문: `239셀`, `MASTER 0`, `비-MASTER 239`, `중복 0`. 이번 생성기 wrapper는 비-MASTER template snapshot을 변경하지 않는다.
4. **9종 mutation 전부 RED** — R13 원문: `9종 뮤테이션 모두 RED · Vitest 8/8`. 이번 R14 추가 mutation도 MASTER generator branch 제거 시 `10 tests | 1 failed`로 RED이며, 기존 canonical matrix 테스트는 최종 10/10 통과했다.
5. **Flyway V96 → V98 → V99 validate 통과 · V99 SQL 바이트 불변** — R13 원문: `Successfully applied 98 migrations ... now at version v99`, validate 통과, V99 SHA-256 `bab045b30d26ae77de7652c677dec61ebfe87232`. 이번 변경은 `services/auth-service/src/main/resources/db/migration/V99__align_accounting_slip_permissions.sql`을 변경하지 않았다.
6. **projection 신선도 IT · 회계 exact · 전수 exact · 양방향 가드** — R14 refresh 전후 hash 동일, 계약 테스트 `1 file passed / 10 tests passed`, Gradle `:services:auth-service:test --tests '*ProjectionFreshness*'` `BUILD SUCCESSFUL`. 화면 route는 view/create guard, 컴포넌트는 create/update CTA guard를 모두 확인한다.
7. **R12 자격증명 리터럴 0건** — R13 원문: R12 자격증명 리터럴 `0건`. 이번 변경은 자격증명·DB 접속 방식·migration을 추가하지 않았고, refresh도 무작위 임시 PostgreSQL password만 메모리에서 생성한다.

## 검증 결과

```text
npx vitest run src/renderer/test-utils/accounting-slip-permission-contract.test.ts
Test Files 1 passed (1)
Tests 10 passed (10)

./gradlew --no-daemon :services:auth-service:test --tests '*ProjectionFreshness*' --rerun-tasks
BUILD SUCCESSFUL in 51s
```

요청 정본 typecheck도 실행했다.

```text
npx tsc -p tsconfig.web.json --noEmit
FAIL — 기존 전역 TS7006 implicit any 다수
```

실패 목록은 `EstimateVersionHistoryPanel`, collaboration panels, `SupplierProfilePage`, `TaxInvoiceFormPage` 등 이번 변경과 무관한 기존 파일들이다. 변경한 4개 회계전표 파일에서는 새 TS 오류가 출력되지 않았다.

## 신규/변경 파일 경로 목록

- `scripts/refresh-accounting-permission-db-snapshot.ps1`
- `clients/desktop/src/renderer/test-utils/accounting-slip-permission-db-snapshot.ts`
- `clients/desktop/src/renderer/test-utils/accounting-slip-permission-contract.test.ts`
- `clients/desktop/src/renderer/routes/accounting/SalesAccountingSlipPage.tsx`
- `clients/desktop/src/renderer/routes/accounting/PurchaseAccountingSlipPage.tsx`
- `clients/desktop/src/renderer/routes/accounting/SalesAccountingSlipFormPage.tsx`
- `clients/desktop/src/renderer/routes/accounting/PurchaseAccountingSlipFormPage.tsx`
- `docs/dev-reports/2026-08-09-1145-r14-refresh-and-sales-buttons.md` (신규)

변경하지 않음: `services/auth-service/src/main/resources/db/migration/V99__align_accounting_slip_permissions.sql`.

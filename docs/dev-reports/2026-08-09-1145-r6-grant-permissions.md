# PR #1145 R6 — 회계전표·수신 세금계산서 권한 부여

작성일: 2026-08-09  
브랜치: `feat/1144-accounting-slip-spec`  
범위: migration·desktop mock·권한 계약 테스트  
제약: V99은 실 DB에 적용하지 않았고, INSERT/UPDATE/DELETE 및 Docker 재배포를 수행하지 않았다.

## 1. 결정과 뒤집힌 전제

개발책임자 결정(2026-08-09)을 적용했다.

> 회계전표 조회·편집은 MANAGER·SALES에게 허용한다. 수신 세금계산서는 실 계정 3명과 `매니저` 그룹에게 허용한다.

R2의 `V99 = SELECT 1`과 MANAGER·SALES 거부 단정은 승인 대기용 전제였고, R6에서 반대로 전환했다. SALES의 `1000`은 실 `auth_db`의 `.list` 측정값(`can_view=true`, `can_create/update/delete=false`)과 일치하므로 그대로 유지했다.

## 2. 구현

`V99__align_accounting_slip_permissions.sql`은 다음 원천을 모두 멱등 upsert한다.

- `role_page_permissions`: MASTER·ACCOUNTANT·MANAGER·SALES의 `.list`를 `.accounting`으로 반영한다. 그 밖의 역할은 수정하지 않는다.
- `role_page_permission_templates`: 같은 네 역할의 7-action 값을 반영한다.
- `group_page_permissions`: 실 대상 그룹 UUID `...0101`(매니저), `...0102`(영업원)만 반영한다.
- `account_page_permissions`: 두 대상 그룹에 배속된 활성 계정 중 기존 `.list` 허용 계정만 반영한다. 실 DB에서 전표별 13명이다.
- 수신 세금계산서: V14의 MANAGER `.inbound` 값을 MANAGER role/template, `매니저` 그룹, `dev_manager`·`janyeonggu`·`manager@samhan.test` 계정의 `.inbound.manage`로 이관한다.
- `.list`와 기존 `.inbound` 행은 삭제하지 않는다. 카탈로그·호환 화면·기존 데이터 식별자 보존 목적이다.
- 모든 대상 upsert는 활성 partial unique index의 `ON CONFLICT ... DO UPDATE`를 사용하므로 재실행해도 비트 결과가 같다.

desktop mock도 `SP_D1_DEFAULT_VIEW/EDIT`에만 MANAGER·SALES의 두 accounting code를 추가했다. SALES는 view만, MANAGER는 CRUD까지 허용한다. RED-B를 위해 mock 계정 응답이 developer·driver·partner·staff·dispatch·inventory·warehouse role도 실제 role matrix로 조회하도록 보강했다.

## 3. (a) 실 `auth_db` 부여 전후 대조

아래 결과는 `docker exec samhan-postgres psql ... -c "SELECT ..."` 읽기 전용 조회로 얻었다. V99 자체는 적용하지 않았으며, `POST` 열은 현재 DB의 `.list` 값을 migration 규칙에 대입한 SELECT projection이다.

### 역할 축

| role | sales `.list` 전 | sales `.accounting` 전 | sales `.accounting` 후 예상 | purchase 후 예상 |
|---|---:|---:|---:|---:|
| MASTER | 1111 | 1111 | 1111 보존 | 1111 보존 |
| ACCOUNTANT | 1111 | 1111 | 1111 보존 | 1111 보존 |
| MANAGER | 1111 | 0000 | 1111 | 1111 |
| SALES | 1000 | 0000 | 1000 | 1000 |

실 조회 원문 요약: `ROLE_PRE`에서 MASTER/ACCOUNTANT는 두 `.accounting` 모두 `1|1`, MANAGER/SALES는 `0|0`; 대응 `.list`는 MANAGER `1|1`, SALES `1|0`이었다. `ROLE_POST` projection은 MANAGER `1|1`, SALES `1|0`이었다.

### 그룹 축

| 그룹 | sales `.list` | purchase `.list` | 두 `.accounting` 후 예상 |
|---|---:|---:|---:|
| 매니저 | 1111 | 1111 | 1111 / 1111 |
| 영업원 | 1000 | 1000 | 1000 / 1000 |

실 조회에서 대상 그룹은 페이지별 정확히 2개였다. 기존 `.accounting`은 두 그룹 모두 `0000`; 후 projection은 매니저 `1111`, 영업원 `1000`이었다.

### 계정 축

전표별 `.list` 허용 대상은 실 DB에서 13명씩이었다. sales 기준 후 projection 원문은 다음과 같다.

```text
dev_locked 1000       dev_manager 1111       dev_sales 1000
gyeonjinseong 1000    hongjisu 1000         janyeonggu 1111
jeongminguk 1000      kimgicheol 1000      leejiyong 1000
manager@samhan.test 1111  obyeongseung 1000 simmigwang 1000 sinhyeonmin 1000
```

purchase도 동일한 13명 집합과 동일한 비트다. 실 SELECT 결과는 `ACCOUNT_PRE_COUNT=13`, `ACCOUNT_POST_COUNT=13`; 그중 조회 전용은 10명이고 MANAGER 3명은 `1111`이다.

### 불변식 증명

- `개발자·기사·배차담당자·사원·재고원·창고원` 그룹의 기존 `.accounting` 양수 행은 모두 `0`이었다. V99 SQL도 두 대상 그룹 UUID만 account/group 축에 사용하므로 이 그룹들은 계속 `0000`이다. 실 조회 `positive_accounting=0`.
- ACCOUNTANT 계정의 두 accounting code 양수 행은 7계정×2페이지 = 14건으로 유지된다. MASTER는 MASTER bypass/기존 role 권한을 건드리지 않는다.
- role/template/group/account upsert 모두 대상 페이지의 기존 `.list` 비트를 source로 사용하며, `.list` 행을 삭제하거나 변경하지 않는다.

## 4. 수신 세금계산서 전후

실 `auth_db` 사전 조회는 대상 5개 축에서 다음과 같았다.

```text
MANAGER role       .inbound       11  -> .inbound.manage 00
매니저 group       .inbound       11  -> .inbound.manage 00
dev_manager        .inbound       11  -> .inbound.manage 00
janyeonggu         .inbound       11  -> .inbound.manage 00
manager@...        .inbound       11  -> .inbound.manage 00
```

V99 후 projection은 위 다섯 대상 모두 `.inbound.manage=11`이다. 활성 FE route/layout과 BE controller는 이미 `.inbound.manage`를 사용한다. `.inbound` 잔존은 V14 seed, PageCode enum, permissions API 타입, PermissionMatrix catalog, mock legacy page 목록, 과거 QA/spec 문서의 호환/역사 식별자이며 활성 화면 guard 누락이 아니다.

## 5. (b) `.inbound` 전수 판정

`rg -n 'accounting\\.tax-invoice\\.inbound' clients services migration docs`로 FE·BE·migration·test·문서를 전수 검색했다.

| 위치 유형 | 판정 |
|---|---|
| `routes/index.tsx`, `AppLayout.tsx`, `TaxInvoiceInboundController.java` | `.inbound.manage` 사용 — 정상 |
| `V37`, `PageCode.java`, `permissionsApi.ts`, `PermissionMatrixPage.tsx`, `mock.ts` catalog | legacy/catalog 식별자 — 보존 의도 |
| `V14`, `V31`, `V32` | 과거 권한 seed/역할 matrix 원천 — V99이 삭제하지 않고 canonical manage로 이관 |
| `accounting-slip-permission-contract.test.ts`, `AccountingPermissionControllerIT.java` | canonical `.manage` 검증 — 정상 |
| `sp-sas`, menu/full QA fixtures와 이전 dev-report/spec 문서 | 과거 catalog/회귀 증거 — 이번 활성 guard 누락 아님 |
| `inventory`·`partner`·`slip`의 일반 inbound 도메인 필드/메서드 | 세금계산서 PageCode와 무관 — 변경하지 않음 |

## 6. (c) 테스트 및 검증 원문

### RED 확인

R6 방향 전환 직후 기존 코드에서 실행:

```text
6 tests | 2 failed
failed: grants accounting permissions ... (V99에 accounting.sales-slip.list 없음)
failed: RED-A ... (MANAGER/SALES view=false)
```

mock role mapping과 migration/mock을 수정한 후:

```text
> npx vitest run src/renderer/test-utils/accounting-slip-permission-contract.test.ts
✓ src/renderer/test-utils/accounting-slip-permission-contract.test.ts (6 tests)
Test Files 1 passed (1)
Tests 6 passed (6)
```

이 6개 안에 새 RED-A(허용 대상)와 RED-B(나머지 역할 거부)가 함께 있다. `getMockResponse` 실제 응답 경로를 유지했으며 정규식 블록 추출로 되돌리지 않았다.

요청된 Playwright:

```text
> npx playwright test playwright/datagrid/narrow-action-column.spec.ts
command timed out ... exit code 124
[WebServer] [vite] Pre-transform error: Failed to resolve entry for package "@samhan/design-system".
```

해당 실패는 권한 assertion까지 도달하기 전 Vite workspace package 해석 실패이며, 이번 변경 파일과 무관하다. Docker 재배포나 package 수정은 하지 않았다.

`git diff --check`도 실행했으며 출력은 없었다.

## 7. 멱등성

V99은 네 권한 원천과 inbound 이관 모두 활성 partial unique key를 `ON CONFLICT ... DO UPDATE`한다. source는 활성 행만 읽고 account 축은 `EXISTS`로 대상 그룹을 제한해 다중 그룹 배속에서도 duplicate source row를 만들지 않는다. 따라서 두 번 실행해도 최종 비트와 대상 집합은 동일하다. 실 DB에는 적용하지 않았으므로 실제 재적용 실험은 PM 배포 단계에서 수행해야 한다.

## 8. 변경 파일

- `services/auth-service/src/main/resources/db/migration/V99__align_accounting_slip_permissions.sql`
- `clients/desktop/src/renderer/api/mock.ts`
- `clients/desktop/src/renderer/test-utils/accounting-slip-permission-contract.test.ts`
- `docs/dev-reports/2026-08-09-1145-r6-grant-permissions.md`

커밋·푸시하지 않았다. V99 번호는 유지했다.

# PR #1145 R15 — main 병합·projection freshness·allocation 회귀

검증 워크트리: `C:\dev\Samhan-Public\.claude\worktrees\t1144`  
시작 HEAD: `ec82267fd`  
브랜치: `feat/1144-accounting-slip-spec`  
금지 준수: commit/push 0회 · 다른 워크트리/main checkout 0회 · 공유 DB write SQL 0회 · V99 SQL 변경 0회

## ① main 병합

실행:

```text
git fetch origin main                         EXIT 0
git merge origin/main                         충돌 1건
```

충돌은 `docs/handoff/CURRENT-WORK.md` 하나였고 main 쪽을 채택했다. 다른 충돌은 없었다. 커밋 금지 지시 때문에 merge commit은 만들지 않았으며, 해결된 병합 인덱스와 `MERGE_HEAD`를 그대로 남겼다.

main에서 유입된 V98은 다음과 같았다.

```text
MANAGER × inbound.inspection
DB bits:         1010000
기존 projection: 1000000
```

V98 SQL은 변경하지 않았다.

## ② V98 projection 재생성

병합 직후 freshness RED 원문:

```text
AccountingPermissionProjectionFreshnessIT > auth_db migration 정본과 체크인 projection이 모든 역할·page-code에서 일치한다 FAILED
java.lang.AssertionError: auth_db ↔ projection 불일치: [MANAGER|inbound.inspection db=1010000 projection=1000000]
at AccountingPermissionProjectionFreshnessIT.java:120
Successfully applied 98 migrations ... now at version v99
```

실행:

```text
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\refresh-accounting-permission-db-snapshot.ps1
REFRESH_EXIT=0
```

재생성으로 바뀐 셀 전수:

| 역할 | page-code | 이전 | 이후 | 설명 |
|---|---|---:|---:|---|
| MANAGER | `inbound.inspection` | `1000000` | `1010000` | V98의 `can_update = TRUE`만 반영 |

`permission-mock-divergences.ts`도 함께 검토했다. main 병합으로 mock의 V98 override가 이미 `1010000`이었고, WAREHOUSE/INVENTORY action-only 정합도 함께 반영되어 divergence가 354개에서 351개로 줄었다. 이 감소를 숨기지 않고 다음 3셀을 동결 목록에서 제거했다.

- `MANAGER × inbound.inspection`
- `WAREHOUSE × inbound.inspection`
- `INVENTORY × inbound.inspection`

최종 동결 목록은 351개이며, 권한 계약 테스트가 exact 비교한다. V98로 설명되지 않는 projection 변경 셀은 0개다.

freshness GREEN 원문:

```text
./gradlew.bat --no-daemon :services:auth-service:test --tests '*AccountingPermissionProjectionFreshnessIT' --rerun-tasks --console=plain
BUILD SUCCESSFUL in 43s
1 test completed, 0 failed
EXIT_CODE=0
```

## ③ allocation regression

### RED

실행:

```text
VITE_API_BASE_URL=http://127.0.0.1:1
npx vitest run src/renderer/routes/accounting/SalesPurchaseAccountingSlipAllocationContract.test.tsx --reporter=verbose
```

원문 핵심:

```text
16 tests | 16 failed
expected "spy" to be called 1 times, but got 0 times (:151, :166)
expected false to be true (:184, :195, :213)
```

DOM에는 `목록`만 있고 form의 `임시저장` 버튼이 사라졌으며, 실제 XHR 때문에 jsdom `ECONNREFUSED 127.0.0.1:1`/AggregateError도 재현됐다.

### 수정

매출·매입 form에서 `usePermissions`, `canCreate`, form 내부 조건 렌더를 제거하고 `임시저장` Button을 항상 렌더하도록 했다. 목록 화면의 다음 게이트는 유지했다.

- 매출/매입 `작성`: `canCreate`
- 매출/매입 DRAFT `전기`: `canPost && row.status === 'DRAFT'`
- 두 form route: `PermissionGuard action="create"`

정적 게이트 확인 결과:

```text
sales-list-create-gate=True
sales-list-post-gate=True
purchase-list-create-gate=True
purchase-list-post-gate=True
sales-form-create-route=True
purchase-form-create-route=True
```

### GREEN

```text
VITE_API_BASE_URL=http://127.0.0.1:1
npx vitest run src/renderer/routes/accounting/SalesPurchaseAccountingSlipAllocationContract.test.tsx --reporter=dot
Test Files 1 passed (1)
Tests 16 passed (16)
EXIT_CODE=0
```

RED-D 격리 실행에서도 AggregateError가 사라졌다. 권한 projection 계약도 함께 통과했다.

```text
npx vitest run src/renderer/test-utils/accounting-slip-permission-contract.test.ts src/renderer/routes/accounting/SalesPurchaseAccountingSlipAllocationContract.test.tsx
Test Files 2 passed (2)
Tests 26 passed (26)
EXIT_CODE=0
```

## CI 순서

| 명령 | 결과 |
|---|---|
| `clients/web/design-system`: 최초 `npm run build` | `tsc not recognized`, 의존성 미설치로 EXIT 1 |
| `clients/web/design-system`: `npm ci --ignore-scripts` 후 `npm run build` | 성공, BUILD_EXIT 0 |
| `clients/desktop`: `npm run typecheck` | TypeScript 본체 EXIT 0. 내부 real-QA scope test는 기존 미추적 `clients/desktop/playwright/1145-r14-real-qa/accounting-slip-actions-real-qa.spec.ts` 때문에 1건 보고됨 |
| `clients/desktop`: `npm run build` | 성공, BUILD_EXIT 0 |
| `clients/desktop`: `npx vitest run --reporter=dot` | 회계·권한 테스트 GREEN. 전체의 유일한 실패는 `electron` 패키지가 설치되지 않은 환경에서 `build-output-cjs-interop.test.ts`가 electron-store import를 로드하지 못한 기존 환경 문제 |
| freshness IT | GREEN, 위 ② 참조 |

전체 Vitest 실패 원문 핵심:

```text
Error: Electron failed to install correctly, please delete node_modules/electron and try installing again
```

회계전표 allocation 16개, permission contract 10개, inbound permission contract 1개는 모두 통과했다.

## 변경·신규 파일

R15에서 직접 변경한 파일:

- `clients/desktop/src/renderer/routes/accounting/SalesAccountingSlipFormPage.tsx`
- `clients/desktop/src/renderer/routes/accounting/PurchaseAccountingSlipFormPage.tsx`
- `clients/desktop/src/renderer/test-utils/accounting-slip-permission-db-snapshot.ts` (refresh 생성물)
- `clients/desktop/src/renderer/test-utils/permission-mock-divergences.ts`
- `docs/dev-reports/2026-08-09-1145-r15-main-merge-and-allocation-regression.md` (본 보고서)

main 병합으로 유입된 신규 파일은 PM이 회수할 병합 산출물이며, 대표적으로 V98 SQL, inbound permission contract, 1130 real-QA specs, 1064/1130 dev reports와 896 migration sheet 산출물이 staged 상태다. 기존 미추적 R14 QA 디렉터리도 보존했다.

## 못 한 것

- 커밋·푸시는 금지 지시로 하지 않았다.
- 전체 Vitest의 electron-store interop 테스트는 현재 `node_modules/electron` 설치 산출물 결함으로 완료하지 못했다. 대상 기능·회계 계약 테스트 결함은 아니다.
- real-QA 공식 집합 전체는 기존 미추적 R14 스펙 1개 때문에 `npm run typecheck`의 보조 scope 검사가 보고되었다. 사용자 파일을 삭제하거나 add하지 않았다.

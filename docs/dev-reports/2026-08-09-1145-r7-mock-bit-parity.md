# PR #1145 R7 — mock/실 모델 7비트 패리티

## 결론

R6가 mock에 추가·이관한 PageCode를 auth_db의 실 모델과 대조했다. V97은 적용하지 않았고, `auth_db`의 현재 `.list`/seed 원본을 `V97`의 `SELECT ... INSERT` 투영 대상으로 사용했다. mock은 `view / create / update / delete`만 필요한 일부 코드에 `download / print`까지 주고 있었고, MANAGER의 `accounting.tax-invoice.inbound.manage`는 누락되어 있었다.

비트 순서: `can_view / can_create / can_update / can_delete / can_restore / can_download / can_print`.

## 실 DB 읽기 원문과 판정

실 DB는 `docker exec samhan-postgres psql -U samhan -d auth_db`의 SELECT만 실행했다. INSERT/UPDATE/DELETE와 V97 실행은 하지 않았다.

- `role_page_permission_templates`의 `.list` 원본: MANAGER `1111000`, SALES `1000000`, ACCOUNTANT `1111000`, MASTER `1111000`.
- `group_page_permissions`의 매니저 그룹 `101`: `1111000`; 영업원 그룹 `102`: `1000000`.
- `account_page_permissions`의 실 계정 원본도 같은 두 패턴을 반환했다. 활성 계정 중 `.list`가 허용된 MANAGER 계정은 `1111000`, SALES 계정은 `1000000`이며, download/print는 모두 `false`였다.
- 현재 DB의 `.accounting` 행은 V97 미적용 상태로 MANAGER/SALES가 `0000000`이다. 따라서 `.accounting`의 기대값은 V97을 적용하지 않고 `.list` 원본 비트를 시뮬레이션했다.
- V37/V30/V27 원본 seed의 `inbound.manage`, `messenger.send`, `ecount.mig.ops-dashboard`도 download/print가 `false`인 것을 직접 읽었다.

## mock ↔ 실 모델 전수 대조표

이번 PR이 `mock.ts`에서 추가·이관·변경한 항목 전체를 대상으로 했다. MASTER는 mock의 명시적인 system-master 전권 우회가 있는 별도 경로다.

| PageCode | 역할 | 실 모델 | R6 mock | R7 결과 |
|---|---|---:|---:|---|
| `accounting.tax-invoice.inbound.manage` | MANAGER | `1111000` | 누락 `0000000` | `1111000` 복원 |
| `accounting.tax-invoice.inbound.manage` | ACCOUNTANT | `1111000` | `1111011` | `1111000` |
| `accounting.sales-slip.accounting` | MANAGER | `1111000` | `1111011` | `1111000` |
| `accounting.purchase-slip.accounting` | MANAGER | `1111000` | `1111011` | `1111000` |
| `accounting.sales-slip.accounting` | SALES | `1000000` | `1000011` | `1000000` |
| `accounting.purchase-slip.accounting` | SALES | `1000000` | `1000011` | `1000000` |
| `accounting.sales-slip.accounting` | ACCOUNTANT | `1111000` | `1111011` | `1111000` |
| `accounting.purchase-slip.accounting` | ACCOUNTANT | `1111000` | `1111011` | `1111000` |
| `messenger.send` | MANAGER/SALES/ACCOUNTANT/WAREHOUSE/INVENTORY/DEVELOPER | seed의 VIEW+CRUD `1111000` | `1111011` 또는 일부 view 누락 | `1111000` |
| `ecount.mig.ops-dashboard` | MANAGER | `1111000` | `1111011` | `1111000` |
| `ecount.mig.ops-dashboard` | ACCOUNTANT | `1000000` | `1000011` | `1000000` |
| `system.permission-admin` | MASTER | system-master 전권 | system-master 전권 | 정합 |
| `system.permission-admin` | 비-MASTER | `0000000` | `0000000` | 정합 |

## 고친 내용

- `MOCK_ACTION_ONLY_PAGES`에 `inbound.manage`, 두 `accounting.*.accounting`, `messenger.send`, `ecount.mig.ops-dashboard`를 등록해 VIEW 기반 일반 도출이 DOWNLOAD/PRINT를 추가하지 않도록 했다.
- MANAGER mock에 `accounting.tax-invoice.inbound.manage`의 VIEW/CRUD를 복원했다.
- R6에서 edit만 추가되고 view가 빠졌던 WAREHOUSE/INVENTORY/DEVELOPER의 `messenger.send` VIEW를 실 seed에 맞게 추가했다.
- MANAGER의 `ecount.mig.ops-dashboard` edit도 실 seed에 맞게 추가했다.
- 계약 테스트에 R6 변경 항목 전체의 7비트 exact equality를 추가했다. 기존의 CRUD-only 검사는 유지했다.

## 뮤테이션 RED 원문 + 복구 증명

정상 수정 후 먼저 실행:

```text
✓ accounting-slip-permission-contract.test.ts (7 tests)
Test Files  1 passed (1)
Tests       7 passed (7)
```

이후 `accounting.sales-slip.accounting` action-only 목록에 `DOWNLOAD`, `PRINT`를 일시 삽입하고 같은 명령을 실행했다:

```text
× R7: every mock page changed by R6 preserves the real model 7-bit action boundary
→ manager accounting.sales-slip.accounting: expected ... download: false, print: false ...
Received ... download: true, print: true ...
Test Files  1 failed (1)
Tests       1 failed | 6 passed (7)
```

두 비트를 즉시 원복한 뒤 재실행:

```text
✓ accounting-slip-permission-contract.test.ts (7 tests)
Test Files  1 passed (1)
Tests       7 passed (7)
```

## 셋째 가능성

V97을 실제로 적용하지 않았으므로, 적용 시 `EffectivePermissionMaterializer`가 role/group/account 우선순위를 다르게 처리하는 가능성은 남는다. 다만 이번 판정은 migration의 투영 SQL과 auth_db의 세 원본 계층을 각각 읽어 같은 비트를 확인했으므로, 이 라운드에서 그 가능성을 검증하기 위해 DB를 변경하는 것은 금지 범위다. V97 적용 후에는 동일 SELECT로 `.accounting` materialization 결과만 재확인하면 된다.

## 신규 파일 경로 목록

- `docs/dev-reports/2026-08-09-1145-r7-mock-bit-parity.md`
- `clients/desktop/src/renderer/test-utils/accounting-slip-permission-contract.test.ts` (R7 exact-bit 계약 보강)

## 검증 대상

```text
npx vitest run src/renderer/test-utils/accounting-slip-permission-contract.test.ts
```

최종 원복 상태에서 `7 passed / 0 failed`.

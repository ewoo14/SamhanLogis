# PR #1130 R2 / #1064 — inbound mock 7비트 패리티

## 결론

NO-GO의 두 결함을 계약 테스트와 mock에서 닫았다.

- `inbound.inspection`을 action-only로 바꿔 `DOWNLOAD`·`PRINT` 과다 부여를 제거했다.
- DRIVER·STAFF를 mock role matrix에 포함하고, MASTER를 제외한 모든 역할을 실 모델과 7비트 exact 비교한다.
- MANAGER의 V98 override는 유지했다. V98 파일과 DB는 변경하지 않았다.

비트 순서:

`can_view / can_create / can_update / can_delete / can_restore / can_download / can_print`

`포함하는가`가 아니라 7개 비트 전체가 같은지 비교한다.

## 실 auth_db 읽기 원문

Docker 재배포와 DB 쓰기 없이 `samhan-postgres`에 SELECT만 실행했다. V98은 적용하지 않고, 현재 원본에서 MANAGER의 `can_update=true`만 시뮬레이션했다.

### role_page_permission_templates

```text
role        view create update delete restore download print
ACCOUNTANT  f    f      f      f      f       f        f
DEVELOPER   f    f      f      f      f       f        f
DISPATCH    f    f      f      f      f       f        f        
DRIVER      f    f      f      f      f       f        f
INVENTORY   t    t      t      t      f       f        f
MANAGER     t    f      f      f      f       f        f
MASTER      t    t      t      t      f       f        f
PARTNER     f    f      f      f      f       f        f
SALES       f    f      f      f      f       f        f
STAFF       f    f      f      f      f       f        f
WAREHOUSE   t    t      t      t      f       f        f
```

### group_page_permissions

```text
group  view create update delete restore download print
101    t    f      f      f      f       f        f   (MANAGER)
102    f    f      f      f      f       f        f   (SALES)
103    t    t      t      t      f       f        f   (WAREHOUSE)
104    f    f      f      f      f       f        f   (ACCOUNTANT)
105    t    t      t      t      f       f        f   (INVENTORY)
106    f    f      f      f      f       f        f   (DISPATCH)
107    f    f      f      f      f       f        f   (DRIVER)
108    f    f      f      f      f       f        f   (STAFF)
109    f    f      f      f      f       f        f   (DEVELOPER)
```

V98 대상 계정 원본도 직접 읽었다. `dev_manager`, `janyeonggu`, `manager@samhan.test`는 현재 `1000000`이며, V98 시뮬레이션 기대값만 `1010000`이다. `dev_warehouse`와 `dev_inventory`는 각각 `1111000`이다. 모든 계정의 `can_restore/can_download/can_print`는 `false`였다.

## 전수 대조표 — 이번 PR mock 변경 항목

실 모델과 V98 시뮬레이션을 기준으로 전 역할을 대조한다. `MASTER`는 system-master bypass로 별도 취급한다.

| 역할 | 실 모델/시뮬레이션 | 수정 전 mock | 수정 후 mock | 판정 |
|---|---:|---:|---:|---|
| MANAGER | `1010000` (V98 sim) | `1010000` | `1010000` | exact |
| SALES | `0000000` | `0000000` | `0000000` | exact |
| ACCOUNTANT | `0000000` | `0000000` | `0000000` | exact |
| WAREHOUSE | `1111000` | `1111011` | `1111000` | exact |
| INVENTORY | `1111000` | `1111011` | `1111000` | exact |
| DISPATCH | `0000000` | `0000000` | `0000000` | exact |
| DRIVER | `0000000` | role 축 미등록 | `0000000` | exact |
| STAFF | `0000000` | role 축 미등록 | `0000000` | exact |
| DEVELOPER | `0000000` | `0000000` | `0000000` | exact |
| PARTNER | `0000000` | `0000000` | `0000000` | exact |

`MASTER`는 실 role template의 `1111000`이 아니라 mock의 기존 system-master 전권(`1111111`) 경로를 사용하므로 이 계약의 비-MASTER exact 표에서 제외했다.

## 고친 내용 — #1145 R7 형태

- `MOCK_ACTION_ONLY_PAGES`에 `inbound.inspection: CREATE/UPDATE/DELETE`를 추가했다. 일반 view 기반 도출로 `DOWNLOAD/PRINT`가 생기지 않는다.
- V98의 `MANAGER:inbound.inspection` override는 그대로 두어 `VIEW + UPDATE`만 additive로 유지했다.
- `SP_D1_ROLES`에 `DRIVER`, `STAFF`를 포함했다.
- DRIVER·STAFF 그룹 matrix도 실제 role cell에서 계산하도록 연결했다.
- 신규 계약은 각 역할의 `/auth/admin/permissions/my` 응답을 7비트 문자열로 변환해 exact equality로 비교한다.

## 뮤테이션 RED 원문 + 복구 증명

### 1. DRIVER 권한 임시 부여

`SP_D1_DEFAULT_VIEW/EDIT`의 DRIVER에 `inbound.inspection`을 일시 추가했다.

```text
× inbound.inspection permission contract > compares every non-MASTER role against the auth_db 7-bit model exactly
→ DRIVER inbound.inspection: expected '0000000' to be '1111000'
Test Files  1 failed (1)
Tests       1 failed (1)
```

두 배열에서 DRIVER 임시 행을 제거한 뒤 `git status`를 확인했고, 해당 mutation은 남아 있지 않다.

### 2. WAREHOUSE mock 초과 비트 임시 주입

`inbound.inspection` action-only 배열에 `DOWNLOAD`, `PRINT`를 일시 추가했다.

```text
× inbound.inspection permission contract > compares every non-MASTER role against the auth_db 7-bit model exactly
→ WAREHOUSE inbound.inspection: expected '1111000' to be '1111011'
Test Files  1 failed (1)
Tests       1 failed (1)
```

두 비트를 제거한 뒤 `git status`를 확인했고, 현재 action-only 배열은 `CREATE/UPDATE/DELETE`만 남아 있다.

최종 작업 tree:

```text
 M clients/desktop/src/renderer/api/mock.ts
?? clients/desktop/src/renderer/test-utils/inbound-permission-contract.test.ts
?? docs/dev-reports/2026-08-09-1064-r2-mock-bit-parity.md
```

커밋·푸시는 하지 않았다.

## 통과 원문

관련 묶음만 실행했다.

```text
npx vitest run src/renderer/test-utils/inbound-permission-contract.test.ts src/renderer/api/mock.test.ts src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts

✓ mock.test.ts (138 tests)
✓ inbound-permission-contract.test.ts (1 test)
✓ SlipDetailPage.lifecycle-contract.test.ts (23 tests)

Test Files  3 passed (3)
Tests       162 passed (162)
```

요청대로 slip-service 전체는 실행하지 않았다. 선행 검증에서 전체 묶음이 304초 타임아웃이었기 때문이다.

## 셋째 가능성

V98을 실제 적용한 뒤 `EffectivePermissionMaterializer`가 role template·group·account cache의 우선순위를 다르게 계산할 가능성은 남아 있다. 이번 검증은 V98을 적용하지 않고 세 원본 계층의 SELECT와 V98 투영 규칙을 대조했다. DB 쓰기 없이 이 가능성을 더 확인할 수 없으므로, V98 적용 시 동일한 7비트 SELECT를 재실행하는 후속 확인 대상으로 남긴다.

## 신규·변경 파일 경로

- `clients/desktop/src/renderer/api/mock.ts` — mock 수정
- `clients/desktop/src/renderer/test-utils/inbound-permission-contract.test.ts` — 신규 전 역할 7비트 계약
- `docs/dev-reports/2026-08-09-1064-r2-mock-bit-parity.md` — 신규 보고서

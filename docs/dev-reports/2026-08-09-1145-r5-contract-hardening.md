# PR #1145 R5 — 회계전표 권한 계약 테스트 강화

## 고친 내용과 근거

`accounting-slip-permission-contract.test.ts`의 RED-A/RED-B 역할 권한 판정을 정규식 블록 추출에서 실제 `mock.ts` 매트릭스 응답 판정으로 바꾸었다.

- `getMockResponse()`의 `/auth/admin/permissions` 응답에서 `MASTER`·`ACCOUNTANT`의 두 회계전표 코드가 `canView=true`, `canEdit=true`인지 확인한다.
- 역할별 권한 endpoint 응답에서 `MANAGER`·`SALES`의 두 코드가 `view/create/update/delete=false`인지 확인한다.
- 역할 또는 페이지 셀이 누락되면 명시적인 `permission cell is missing` 단정 실패가 발생한다. 따라서 빈 문자열 fallback으로 조용히 통과할 수 없다.
- 기존 `.list` 문자열 계약과 RED-A의 `ecount.mig.ops-dashboard`, `messenger.send` 계약은 유지했다.
- `mock.ts` 권한 부여 내용과 `V99`은 변경하지 않았다.

## mutation proof

### 1. MANAGER에 회계전표 권한을 임시 추가하면 RED

`mock.ts`의 `SP_D1_DEFAULT_VIEW.MANAGER`에 `accounting.sales-slip.accounting`을 일시 삽입한 뒤 실행했다.

```text
Test Files  1 failed (1)
Tests       1 failed | 4 passed (5)
→ expected true to be false // Object.is equality
→ RED-B ... at accounting-slip-permission-contract.test.ts:110:27
```

실패한 단정은 `expect(cell.view).toBe(false)`였으며, 권한 확대를 실제로 잡았다.

### 2. 역할 순서를 바꿔도 판정 유지

`mock.ts`의 `SP_D1_ROLES`에서 `MANAGER, DISPATCH`를 `DISPATCH, MANAGER`로 일시 교환한 뒤 실행했다.

```text
Test Files  1 passed (1)
Tests       5 passed (5)
```

역할 배열 순서 변경은 판정에 영향을 주지 않았다.

## 복구 증명

두 mutation을 모두 원상 복구한 직후 `git diff --name-only`의 원문은 다음과 같다.

```text
clients/desktop/src/renderer/test-utils/accounting-slip-permission-contract.test.ts
```

즉, 임시 변경이 남아 있지 않았고 테스트 파일 외 변경은 없었다. `git diff --check`도 오류 없이 통과했다.

## 최종 통과 원문

실행 명령:

```text
npx vitest run src/renderer/test-utils/accounting-slip-permission-contract.test.ts
```

```text
✓ src/renderer/test-utils/accounting-slip-permission-contract.test.ts (5 tests) 27ms
Test Files  1 passed (1)
Tests       5 passed (5)
```

## 신규 파일

- `docs/dev-reports/2026-08-09-1145-r5-contract-hardening.md`

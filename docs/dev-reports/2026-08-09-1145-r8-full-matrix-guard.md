# PR #1145 R8 — full matrix exact guard

## 결론

R7의 단일 page/일부 역할 열거 검사를 유지한 채, mock account permission 응답이 반환하는
11개 역할 × 122개 page code × 7-action 전체 조합을 검사하도록 넓혔다.

- 기존 회계 계열 exact 검사: 유지
- 신규 R8: `MASTER`, `MANAGER`, `SALES`, `ACCOUNTANT`, `WAREHOUSE`, `INVENTORY`,
  `DISPATCH`, `DRIVER`, `STAFF`, `DEVELOPER`, `PARTNER` 전수
- page code 집합도 스냅샷과 먼저 비교하므로 새 코드가 조용히 추가되거나 셀이 누락되면 실패
- `view/create/update/delete/restore/download/print` 순서의 7비트 exact 비교

## 정본 계약

정본은 `auth_db.role_page_permission_templates`의 활성 행이다. 이 세션에서는 실행 중
Postgres에 대해 SELECT만 수행했다. V99은 적용 이력이 없었고, 요청대로 SQL 파일과 DB를
변경하지 않았다. 테스트 실행 시 DB를 읽지 않는 CI/mock 환경을 위해 다음 스냅샷을 저장소에
고정했다.

`clients/desktop/src/renderer/test-utils/accounting-slip-permission-snapshot.ts`는
2026-08-09 읽기 전용 계약 확인 시점의 역할·page code·7비트 기준을 담는다. 스냅샷 갱신은
권한 seed 또는 V99 이후 migration이 실제 auth_db에 적용된 뒤, 동일한 read-only 조회로
새 역할·page code 집합과 7비트를 재추출하고 리뷰를 거쳐 갱신한다. migration을 테스트에서
실행하거나 테스트 실행 중 DB를 쓰지 않는다.

## 감시 구현

`permission-contract-checker.ts`의 `assertExactPermissionMatrix`가 공통 검사기다.
각 역할에 대해 `/auth/admin/permissions/account/mock-account-{role}`를 호출하고,
스냅샷 page 집합과 응답 page 집합을 비교한 뒤 모든 page의 7비트를 비교한다. MASTER도
동일한 account 경로로 관찰할 수 있도록 mock role 정규식에 `master`를 추가했다.

이 인터페이스는 `{ getMockResponse }`만 받으므로 #1064의 단일 page 계약을 대체하거나,
동일 checker에 다른 snapshot을 주입하는 공통 검사기로 재사용할 수 있다. 이번에는 기존
`inbound-permission-contract.test.ts`를 변경하지 않고 R8 회계 계약에 먼저 적용했다.

## mutation 적대검증

각 mutation은 `clients/desktop/src/renderer/api/mock.ts` 원문을 `apply_patch`로 임시
변경하고 지정 Vitest 명령을 실행한 뒤 원문을 복구했다. 아래 기대/실제는 Vitest의 실제
실패 출력이다.

### 1. PARTNER × messenger.send 과부여

임시 원문:

```ts
view: role === 'PARTNER' && page === 'messenger.send' ? true : (...),
edit: role === 'PARTNER' && page === 'messenger.send' ? true : (...),
```

결과: `PARTNER × messenger.send: expected '1111000' to be '0000000'` → RED.

### 2. 임의 역할 × 임의 page code 과부여

임시 원문:

```ts
view: role === 'MANAGER' && page === 'accounting.tax-invoice.emit-nts'
  ? true : (...),
```

결과: `MANAGER × accounting.tax-invoice.emit-nts: expected '1000011' to be '0000000'` → RED.

### 3. 임의 역할 × 임의 page code 누락

임시 원문:

```ts
view: role === 'MANAGER' && page === 'messenger.send'
  ? false : (...),
```

결과: `MANAGER × messenger.send: expected '0111000' to be '1111000'` → RED.

세 mutation 모두 복구 후 확인:

```text
git diff -- clients/desktop/src/renderer/api/mock.ts
- mock-account-(manager|sales|...)
+ mock-account-(master|manager|sales|...)
```

복구 후 mock 파일 diff에는 R8의 MASTER 경로 정규식 1줄만 남고, 세 임시 ternary는
남아 있지 않다. `git status --short -- clients/desktop/src/renderer/api/mock.ts`는
의도된 R8 변경 1개 파일만 `M`으로 표시된다.

## 실행 시간

요청한 명령을 파이프 없이 실행했다.

```text
npx vitest run src/renderer/test-utils/accounting-slip-permission-contract.test.ts
Test Files  1 passed (1)
Tests       8 passed (8)
Duration    1.21s
tests       64ms
```

122 page × 11 role = 1,342개 셀을 검사하며 현재 테스트 본체는 64ms다.

## 신규 파일

- `clients/desktop/src/renderer/test-utils/accounting-slip-permission-snapshot.ts`
- `clients/desktop/src/renderer/test-utils/permission-contract-checker.ts`
- `docs/dev-reports/2026-08-09-1145-r8-full-matrix-guard.md`

변경 파일:

- `clients/desktop/src/renderer/api/mock.ts`
- `clients/desktop/src/renderer/test-utils/accounting-slip-permission-contract.test.ts`

# S10 PageCode parity 보완 보고서

## 작업 범위

PR #1124 / Issue #1123의 S10으로, `origin/main...HEAD`에서 S9가 추가한 BE
`PageCode`와 desktop FE `PageCode` union의 정합성을 보완했다. 커밋과 push는 수행하지 않았다.

## origin/main 대비 BE 추가 PageCode 전수 대조

`services/auth-service/.../PageCode.java`의 `origin/main...HEAD` diff에서 추가된
PageCode는 다음 2건이며, 두 건 모두 FE union에 존재한다.

| BE PageCode | FE `permissionsApi.ts` union | 비고 |
|---|---|---|
| `slip.closed-date-exception` | 있음 | S9에서 이미 반영됨 |
| `slip.closed-date-admin` | 있음 | S10에서 추가 |

추가로 `PageCode` union 확장으로 `Record<PageCode, string>` 컴파일 계약이 드러내는
`PermissionMatrixPage.tsx`의 한국어 라벨도 함께 추가했다.

## 검증

### RED 재현 (수정 전, 대상 worktree)

```text
Test Files  1 failed (1)
Tests       1 failed | 2 passed (3)
permissionsApi.ts PageCode union이 BE PageCode enum page-code를 누락했습니다:
slip.closed-date-admin
```

### parity (수정 후)

```text
✓ src/renderer/routes/permissionPageCatalog.parity.test.ts (3 tests)
Test Files  1 passed (1)
Tests       3 passed (3)
```

### FE typecheck

```text
npm run typecheck
exit code 0
tests 50, pass 50, fail 0
```

### FE lint

```text
npm run lint
exit code 0
0 errors and 153 warnings
```

### FE build

```text
npm run build
exit code 0
```

build 과정의 기존 폰트 경로 및 dynamic-import 경고는 있었으나 build는 성공했다.

## 변경 파일

- `clients/desktop/src/renderer/api/permissionsApi.ts`
- `clients/desktop/src/renderer/routes/PermissionMatrixPage.tsx`
- `docs/dev-reports/2026-08-08-1123-s10-pagecode-parity.md` (신규)

DB, Docker 공유 스택, 기존 마이그레이션 파일은 건드리지 않았다.

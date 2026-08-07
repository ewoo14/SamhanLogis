# PR #1088 / 이슈 #1013 — S7 창 포커스 재조회 표면 닫기

## 범위와 결론

S6의 QueryClient 전역 `refetchOnWindowFocus: true`가 권한 외 12개 쿼리에도 적용되던 표면을 닫았다.

- `App.tsx` 전역 기본값을 `false`로 복원했다.
- `usePermissions`에만 `refetchOnWindowFocus: true`를 명시했다.
- TanStack Query 5 기본 focusManager가 `visibilitychange`만 구독하는 Electron 환경을 보완하기 위해, 권한 hook에 `window.focus` listener를 추가했다.
- listener는 권한 쿼리가 stale일 때만 active 권한 쿼리를 재조회한다.
- `UnassignedPage`의 자동저장 로직은 변경하지 않았다.

권한 조회 오류 시 `usePermissions`의 `data`가 없으므로 `canAccess`는 계속 `false`이고, `PermissionGuard`의 기존 오류 안내·재시도와 네비게이션/라우트 조건은 그대로다.

## RED-first 원문

추가한 RED 테스트를 S6 상태에서 실행한 원문 핵심은 다음과 같다.

```text
src/renderer/App.queryClient.test.ts
  × 권한 외 쿼리는 창 포커스에서 전역 재조회하지 않는다
    → expected true to be false // Object.is equality

src/renderer/hooks/usePermissions.freshness.test.tsx
  × 창 포커스 복귀 시 권한 쿼리는 재조회한다
    → expected "spy" to be called 2 times, but got 1 times
  × 창 포커스 복귀 시 권한 외 쿼리는 재조회하지 않는다
    → expected "spy" to be called 2 times, but got 1 times

Test Files  2 failed (2)
Tests       3 failed (3)
```

첫 번째 테스트는 전역 기본값이 실제로 `true`임을 잡았고(RED-B), 두 freshness 테스트는 권한 쿼리에 창 `focus` 복귀 경로가 없음을 잡았다(RED-A 및 격리된 권한 경로).

## 새로 가능해진 조합과 실제 결과

| 조합 | 결과 |
|---|---|
| 권한 쿼리 + stale + 창 focus 복귀 | 권한 쿼리만 1회 재조회 — GREEN |
| 권한 쿼리 + fresh + 창 focus 복귀 | stale 조건이 아니므로 추가 조회하지 않음 — listener 조건으로 차단 |
| 권한 외 쿼리 + stale + 창 focus 복귀 | 전역 기본값 `false`라 재조회하지 않음 — GREEN |
| `UnassignedPage` 쿼리 데이터 변경 가능성 + 창 focus 복귀 | 전역 focus 재조회가 제거되어 S6이 만든 자동저장 발화 조건을 제거; 자동저장 코드 자체는 미변경 |
| 권한 API 실패 + 화면/라우트 진입 | `data` 부재로 fail-closed 유지; 기존 오류 안내 및 화면 내 재시도 유지 |
| 권한 있음 + 기존 네 배차 진입점 | 기존 `DispatchesLayout` 테스트 3건 통과; 표시·이동 회귀 없음 |

## `refetchOnWindowFocus` 식별자 전수 확인

명령:

```text
rg -n --hidden --glob '!node_modules' --glob '!dist' --glob '!out' "refetchOnWindowFocus" clients/arologis-desktop
```

운영 코드의 결과:

```text
src/renderer/App.tsx:24:      refetchOnWindowFocus: false,
src/renderer/hooks/usePermissions.ts:31:    refetchOnWindowFocus: true,
```

나머지는 이 두 정책을 검증하는 테스트 fixture/assertion뿐이다. `UnassignedPage`에는 이 식별자가 없다.

## 검증

모든 명령은 `clients/arologis-desktop`에서 `VITE_API_BASE_URL='http://127.0.0.1:1'`로 격리 실행했다. 종료코드는 파이프 없이 직접 확인했다.

```text
$env:VITE_API_BASE_URL='http://127.0.0.1:1'; npm test
Exit code: 0
Test Files  16 passed (16)
Tests       79 passed (79)

$env:VITE_API_BASE_URL='http://127.0.0.1:1'; npm run typecheck
Exit code: 0

$env:VITE_API_BASE_URL='http://127.0.0.1:1'; npm run lint
Exit code: 0
```

전체 테스트 stderr에는 기존 React Router future-flag warning만 있었고, lint warning/error는 없었다.

## 신규 파일

- `clients/arologis-desktop/src/renderer/App.queryClient.test.ts`
- `clients/arologis-desktop/src/renderer/hooks/usePermissions.freshness.test.tsx`
- `docs/dev-reports/2026-08-07-1013-s7-scope-focus-refetch.md`

## 변경 파일

- `clients/arologis-desktop/src/renderer/App.tsx`
- `clients/arologis-desktop/src/renderer/hooks/usePermissions.ts`


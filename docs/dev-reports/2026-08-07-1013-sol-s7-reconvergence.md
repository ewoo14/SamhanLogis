# PR #1088 / 이슈 #1013 — SOL 5.6 S7 표면 재수렴

## 판정

**실 사용자 경로로 재현 가능한 도달 결함 0건. S7 수렴 승인.**

- 검증 HEAD: `99e2023054dd629901e59c489648184e2eea65d4` (`99e202305`와 일치)
- S6 기준점: `069c8a4e7`
- 검증 시작 시 tracked/untracked 변경: 0건
- 라이브 컨테이너·DB·다른 서비스: 접근하거나 변경하지 않음
- 재현 결함 실 건수: 0건

이번 판정은 오직 “차단되면 안 되는 사용자가 차단되는가 / 통과하면 안 되는 사용자가 통과하는가”에 한정한다. 검증 품질은 판정하지 않았다.

## 1. S6 복구 경로가 S7에서 유지되는가

유지된다.

실 사용자 순서는 다음과 같다.

1. 허가된 MASTER가 로그인한다.
2. 로그인 성공 경로가 `['permissions', 'my']` 캐시를 제거한다 (`LoginPage.tsx:91,114`).
3. 배차 화면 mount가 `GET /admin/arologis/permissions/my`를 호출한다.
4. 최초 호출과 자동 retry 1회가 403으로 끝나면 query에는 data가 없다.
5. S6 오류 안내가 보호 화면 대신 표시되고, 사용자는 같은 화면의 `권한 다시 확인` 또는 창 focus 복귀로 복구할 수 있다.

TanStack Query 5.100.10의 실제 원문은 data가 없는 실패 query를 경과 시간과 무관하게 즉시 stale로 판정한다.

```ts
// node_modules/@tanstack/query-core/src/query.ts:316-320
isStaleByTime(staleTime: StaleTime = 0): boolean {
  // no data is always stale
  if (this.state.data === undefined) {
    return true
  }
```

같은 설치본으로 `retry: 1`, `staleTime: 300000`을 적용하고, 앞의 2회는 403·focus 뒤 3회차는 성공하도록 최소 재현한 원문 수치는 다음과 같다.

```text
403 종료 직후: calls=2, status=error, dataUpdatedAt=0,
               isStaleByTime(300000)=true, isFetching=0
focus 뒤:      calls=3, status=success, isStaleByTime(300000)=false
```

따라서 핵심 의심인 “403 직후 5분 동안 focus 재조회가 막힌다”는 사용자 경로에서 성립하지 않는다. 5분 대기는 성공 data가 있는 fresh query에만 적용된다. 로그인은 캐시를 제거하고, 앱 안에는 fresh 권한 query를 강제로 실패 상태로 만드는 invalidate/refetch 호출처가 없다. 권한 focus 재조회 자체도 stale query에서만 시작하므로, 배경 재조회 실패 시점에는 이미 5분이 경과했거나 invalidated 상태다.

## 2. 여러 `usePermissions` listener의 중복 요청·경합·누수

도달 결함이 없다.

기존 네 배차 경로에서 활성 listener 실수는 다음과 같다.

| 경로 | 활성 `usePermissions` | listener 수 |
|---|---|---:|
| `/dispatches/manual` | `AppLayout`, `DispatchesLayout` | 2 |
| `/dispatches/pre-classify` | 위 2개 + `PermissionGuard` | 3 |
| `/dispatches/unassigned` | `AppLayout`, `DispatchesLayout` | 2 |
| `/dispatches/reconcile` | `AppLayout`, `DispatchesLayout` | 2 |

각 listener는 동일 QueryClient에서 먼저 `isFetching`을 동기 조회한다. 첫 listener의 `refetchQueries()`가 query를 즉시 fetching 상태로 바꾸므로 뒤 listener는 skip한다. 활성 listener를 실제 경로 상한보다 많은 5개로 발화한 최소 재현의 결정과 요청 수는 다음과 같다.

```text
listener 결정: refetch 1건 + skip-fetching 4건
권한 요청:      focus 복구 요청 1건
```

`useEffect`는 자신이 등록한 동일 함수 참조를 unmount cleanup에서 제거한다 (`usePermissions.ts:45-46`). 라우트 이동으로 `PermissionGuard`가 사라질 때 해당 listener도 제거되므로 누수 경로가 없다.

TanStack 기본 `visibilitychange`와 S7의 Electron `window.focus`가 함께 발화해도 첫 발화가 조회를 시작한 동안 다른 발화는 `isFetching`에서 차단된다. 첫 요청이 이미 끝났다면 성공 query는 fresh가 되어 `isStaleByTime`에서 차단된다.

## 3. fail-open 역전 여부

없다.

근거 원문:

```ts
// permissions.ts:67
if (!permissions) return false

// PermissionGuard.tsx:39-45
if (isError) {
  return <PermissionQueryError onRetry={() => { void refetch() }} />
}
if (!canAccess(pageCode, action) || (requireMaster && !canGrantMaster(auth?.role))) {
  return <Navigate to="/" replace />
}
```

- data 없는 조회 실패는 `canAccess=false`다.
- `PermissionGuard`는 오류를 권한 있음으로 처리하거나 children을 렌더하지 않는다.
- 오류와 정상적인 권한 없음도 구분된다. 오류는 같은 화면의 안내·재시도, 정상 deny는 홈 redirect다.
- `DispatchesLayout`의 추가 진입점 `수신 배차 그룹`은 `!isLoading && !isError && canAccess(...)`일 때만 표시된다 (`DispatchesLayout.tsx:14-15`). 실패 시 숨김을 유지한다.

## 4. 기존 네 배차 진입점 표시·이동

회귀가 없다.

`069c8a4e7..99e202305`에서 route 파일과 `DispatchesLayout`은 변경되지 않았다. 네 링크는 권한 조회 성공·실패와 무관하게 그대로 존재하며 경로도 유지된다.

| 표시 | 이동 경로 |
|---|---|
| 수동 배차 | `/dispatches/manual` |
| 가배차 분류 | `/dispatches/pre-classify` |
| 미배차 | `/dispatches/unassigned` |
| 실배차 비교 | `/dispatches/reconcile` |

좁은 실행에서 링크 4개와 추가 권한 링크의 실제 클릭 이동을 포함해 관련 9건이 모두 통과했다.

```text
Test Files  4 passed (4)
Tests       9 passed (9)
```

## 5. 비권한 query와 `queryClient` export

전역 기본값은 다시 `refetchOnWindowFocus: false`이고, 운영 코드에서 true를 명시한 곳은 권한 query 하나다. 따라서 `/dispatches/unassigned` query는 창 focus만으로 재조회되지 않으며, S6이 새로 만든 자동저장 발화 표면은 닫혔다.

`queryClient`의 named export는 인스턴스 생성 위치·시점·Provider 전달을 바꾸지 않는다. 전체 `src`에서 이 export의 import는 `App.queryClient.test.ts` 1곳뿐이고, 운영 진입점 `main.tsx`는 계속 `App`만 import한다. 사용자 실행 동작을 바꾸는 소비자가 없다.

## 6. 제시된 두 갈래 밖의 셋째 가능성

사용자 도달 결함으로 성립하는 셋째 가능성은 찾지 못했다.

이론상 “성공 data가 아직 fresh인데 강제 refetch만 실패”하면 `status=error`와 fresh `dataUpdatedAt`이 함께 있어 focus가 남은 freshness 시간 동안 skip될 수 있다. 그러나 현재 제품 경로에는 fresh 권한 query를 강제로 refetch하는 호출이 없고, 로그인·로그아웃은 query를 제거한다. focus/visibility refetch도 stale일 때만 시작한다. 따라서 현재 HEAD의 실 사용자 경로가 아니다.

## 7. fix 지시서 — 불변식만

**결함 0건이므로 S8 fix는 지시하지 않는다.** 이후 변경이 다음 불변식 중 하나를 깨면 이 판정을 다시 연다.

1. data 없는 권한 조회 실패는 시간과 무관하게 다음 창 focus에서 즉시 재조회되어야 한다.
2. 활성 `usePermissions` 수와 무관하게 focus 한 번당 동일 권한 query의 네트워크 요청은 최대 1건이어야 한다.
3. 권한 조회 중 추가 focus는 두 번째 요청을 만들지 않아야 한다.
4. 권한 외 query는 창 focus만으로 재조회되지 않아야 한다.
5. 권한 조회 실패는 보호 children을 렌더하지 않고, 권한 있음으로 판정하지 않으며, 화면 안의 재시도 수단을 유지해야 한다.
6. 기존 네 배차 링크의 표시와 이동은 유지하고, 권한 전용 추가 링크는 loading/error/deny에서 fail-closed여야 한다.
7. 권한 cache는 로그인 주체가 바뀔 때 이전 계정의 data를 재사용하지 않아야 한다.

## 8. 양방향 RED

### RED-A — 복구를 막지 않는다

로그인 직후 권한 GET이 403으로 자동 retry까지 2회 실패하고 서버 권한 상태가 회복된 뒤, 사용자가 창을 다시 focus하면 즉시 권한 GET 1건이 추가되어 성공해야 한다. 5분을 기다리거나 홈으로 쫓겨나거나 앱을 재시작해야 하면 RED다.

반대 방향도 함께 고정한다. 오류 중 보호 children이 잠깐이라도 렌더되거나 `canAccess=true`가 되면 RED다.

### RED-B — 복구가 다른 query를 깨우지 않는다

fresh 권한 query에서 focus할 때 추가 권한 GET은 0건이어야 한다. stale 권한 query와 활성 listener 5개에서 focus할 때 추가 권한 GET은 정확히 1건이어야 한다. 같은 순간의 stale 비권한 query와 `UnassignedPage` query 추가 GET은 0건이어야 한다. 하나라도 재조회되어 후속 서버 쓰기 가능성을 만들면 RED다.

반대급부로, 중복 방지를 이유로 data 없는 error query의 유일한 복구 요청까지 0건으로 만들면 RED-A다.

## 9. 증거 무결성

- `git rev-parse HEAD`: `99e2023054dd629901e59c489648184e2eea65d4`
- TanStack 설치본: `@tanstack/react-query 5.100.10`, `@tanstack/query-core 5.100.10`
- 검증 명령은 `clients/arologis-desktop`에서만 실행했다.
- 실행 명령:

```text
npm test -- --run \
  src/renderer/App.queryClient.test.ts \
  src/renderer/hooks/usePermissions.freshness.test.tsx \
  src/renderer/components/PermissionGuard.test.tsx \
  src/renderer/routes/dispatches/DispatchesLayout.test.tsx
```

- 판정 원문 파일 SHA-256:

```text
App.tsx                       A322AE6573A27B8EC0A87CF822EDC7DE9C1036EBB6AEE33B4B6E94E9F2D9D584
usePermissions.ts            E4EC7C517378F26986C8D7A6E13F09B2DE2D5763D5D52A466EA27AD463A4E64A
PermissionGuard.tsx          86F339C2A31338ADEAA3003D0163169313A5C55047546F342CC0493C5B9EFB8B
PermissionQueryError.tsx     78A63B305CAAE9CB58DE38A8A44D64F834E5B9EB61AC62F25953FD83B1EEE963
DispatchesLayout.tsx         AE452AFDBCBDE860B80B60DE3BB5AFC456A55188660B25E71FF94881104A74F7
```

## 10. 이번 라운드가 보지 않은 것

- 배차 목록 → 상세 진입: 이슈 #1094 정본이므로 제외
- GPS·회신: `driver_locations` 0건, `dispatch_notifications` 0건인 표본 0 영역이므로 판정하지 않음
- `UnassignedPage` 자동저장 로직 자체: S7 무변경이며 범위 밖. 단 S7의 전역 focus 재조회 제거가 이 query를 깨우지 않는지만 확인
- 검증 품질 전반: 요청에 따라 찾거나 보고하지 않음. 예외로 HEAD·설치본·실행 원문·hash의 증거 무결성만 기록

## 신규 파일

- `docs/dev-reports/2026-08-07-1013-sol-s7-reconvergence.md`

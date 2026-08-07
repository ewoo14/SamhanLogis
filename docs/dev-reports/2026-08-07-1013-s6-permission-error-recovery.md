# PR #1088 / 이슈 #1013 — S6 권한 조회 실패 복구

## 1. 결론

권한 조회 실패를 권한 없음과 분리했다. `usePermissions`가 `refetch`를 노출하고,
배차 네비게이션과 `PermissionGuard`가 같은 `isError` 상태에서 `권한을 확인하지
못했습니다` 안내와 `권한 다시 확인` 버튼을 표시한다. 실패 시 수신 배차 그룹 링크와
보호 화면은 계속 fail-closed 상태이며, 홈으로 조용히 리다이렉트하지 않는다.

`client.ts`의 401 토큰 갱신 로직은 변경하지 않았다.

## 2. 변경 내용

- `PermissionQueryError` 공통 UI 추가: 실패 원인 안내, 화면 내 재조회 버튼.
- `usePermissions`에 `refetch` 반환 추가.
- `DispatchesLayout`: 기존 수동 배차·가배차 분류·미배차·실배차 비교 네 링크는 유지하고,
  조회 실패 시 수신 배차 그룹 링크는 숨긴 채 실패 UI를 표시.
- `PermissionGuard`: 조회 실패 시 `/`로 이동하지 않고 동일 실패 UI 표시.
- `App`: 창 포커스 시 TanStack Query가 권한을 재조회하도록 `refetchOnWindowFocus` 활성화.
- 정상 200/권한 없음/조회 실패의 네비게이션·라우트 동작을 회귀 테스트로 고정.

## 3. 새로 가능해진 상태·화면 조합 검증

대상 진입점은 수동 배차, 가배차 분류, 미배차, 실배차 비교, 수신 배차 그룹 직접 URL이다.

| 권한 query 상태 | 네비게이션 결과 | 라우트 결과 |
|---|---|---|
| 200 + 권한 있음 | 기존 네 링크와 수신 배차 그룹 링크 표시, 클릭 시 `/dispatches/received-groups` 진입 | 보호 화면 표시 |
| 200 + 권한 없음 | 기존 네 링크만 표시, 수신 배차 그룹 링크 숨김 | 수신 배차 그룹 직접 진입은 `/`로 이동 |
| 403 | 기존 네 링크 유지, 수신 배차 그룹 링크 숨김, 실패 안내·재시도 표시 | 홈 이동 없이 실패 안내·재시도 표시; 권한 있음으로 오인하지 않음 |
| 네트워크 실패 | 403과 동일한 실패 UI·fail-closed 결과 | 403과 동일한 실패 UI·fail-closed 결과 |
| 로딩 중 | 기존 네 링크만 표시, 수신 배차 그룹 링크 숨김 | `권한 확인 중` 로더 표시 |

실패 UI의 `권한 다시 확인` 클릭은 동일 세션에서 `refetch`를 호출한다. 창 포커스도
재조회 트리거가 된다. 200 상태의 기존 네 진입점 표시·이동 테스트는 통과했다.

### 제거·이동·개명 식별자 grep 전수 확인

- `PermissionGuard.tsx`의 실패 분기에서 제거한 `Navigate to="/"` 사용: 잔여 없음.
  정상적인 권한 없음 분기의 `Navigate` import/사용은 불변식 보존을 위해 유지.
- `refetchOnWindowFocus: false`: 잔여 참조 없음; `App.tsx`에 `true` 1건.
- 권한 실패 시 `Navigate to="/"` 경로: `PermissionGuard.tsx` 잔여 참조 없음.
- `PermissionQueryError`, `refetch`, `isError`, `received-groups`: 변경 파일과 관련 테스트에서
  의도한 참조만 확인.

## 4. RED → GREEN 원문

추가한 RED 테스트 실행:

```text
npm test -- src/renderer/components/PermissionGuard.test.tsx src/renderer/routes/dispatches/DispatchesLayout.test.tsx
Test Files 2 failed | 2 passed
Tests       2 failed | 4 passed
```

실패 원문 핵심:

```text
PermissionGuard > 권한 조회 실패는 홈으로 보내지 않고 실패 안내와 재시도를 제공한다
→ Unable to find an accessible element with the role "alert"
<div data-testid="home-page">home</div>

DispatchesLayout > 권한 조회 실패는 수신 배차 그룹을 숨기되 원인 안내와 재시도를 표시한다
→ Unable to find an accessible element with the role "alert"
```

수정 후 같은 테스트:

```text
Test Files 2 passed (2)
Tests       6 passed (6)
```

## 5. 검증 결과

모든 명령은 `C:\dev\Samhan-Public\.claude\worktrees\t1013b\clients\arologis-desktop`
에서 실행했다. 파이프 없이 종료코드를 직접 확인했다.

```text
npm test
> @samhan/arologis-desktop@1.0.0 test
> vitest run
Test Files 14 passed (14)
Tests       76 passed (76)
Exit code: 0

$env:VITE_API_BASE_URL='http://127.0.0.1:1'; npm test; ...; exit $testExit
> @samhan/arologis-desktop@1.0.0 test
> vitest run
Test Files 14 passed (14)
Tests       76 passed (76)
Exit code: 0

npm run typecheck
> @samhan/arologis-desktop@1.0.0 typecheck
> tsc -p tsconfig.node.json --noEmit && tsc -p tsconfig.web.json --noEmit
Exit code: 0

npm run lint
> @samhan/arologis-desktop@1.0.0 lint
> eslint "src/**/*.{ts,tsx}"
Exit code: 0
```

테스트 stdout에 React Router의 v7 future-flag warning이 3건 출력됐지만 실패·에러는
없었고, 위 각 명령의 종료코드는 모두 0이었다.

격리 테스트에서도 실 API 호출로 누출되지 않았고, 사용자 지시 범위 밖인 토큰 갱신·DB·컨테이너는 건드리지 않았다.

## 6. 신규 파일

- `docs/dev-reports/2026-08-07-1013-s6-permission-error-recovery.md`
- `clients/arologis-desktop/src/renderer/components/PermissionQueryError.tsx`

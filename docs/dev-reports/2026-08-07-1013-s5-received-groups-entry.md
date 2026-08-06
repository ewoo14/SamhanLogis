# PR #1088 / Issue #1013 S5 — 수신 배차 그룹 진입점

## 변경

`DispatchesLayout`에 `수신 배차 그룹` 링크를 추가했습니다.

- 경로: `/dispatches/received-groups`
- 표시 조건: `pageCode="arologis.dispatch.ops"`, `action="view"` 권한이 있고 권한 조회가 로딩 중이 아니며 오류가 없을 때
- 라우트의 `PermissionGuard`와 동일한 권한 조건을 사용
- 기존 네 링크의 순서·라벨·경로·동작은 변경하지 않음
- 배차 목록 상세 진입, 라우트 구조, DB, 다른 화면 네비게이션은 변경하지 않음

## 새로 가능해진 화면 조합 확인

| 권한 | 수동 배차 | 가배차 분류 | 미배차 | 실배차 비교 | 수신 배차 그룹 |
|---|---|---|---|---|---|
| 있음 (`arologis.dispatch.ops:view`) | 표시 → `/dispatches/manual` 이동 | 표시 → `/dispatches/pre-classify` 이동 | 표시 → `/dispatches/unassigned` 이동 | 표시 → `/dispatches/reconcile` 이동 | 표시 → 클릭 시 `/dispatches/received-groups` 이동 |
| 없음 | 기존처럼 표시 → `/dispatches/manual` 이동 | 기존처럼 표시 → `/dispatches/pre-classify` 이동 | 기존처럼 표시 → `/dispatches/unassigned` 이동 | 기존처럼 표시 → `/dispatches/reconcile` 이동 | 숨김 → 클릭 진입 불가 |

권한 있음 행은 테스트에서 링크를 실제 클릭하여 다섯 경로를 순서대로 확인했습니다. 권한 없음 행은 수신 배차 그룹 링크가 렌더링되지 않는 것을 확인했습니다. 라우트 직접 진입 시에는 기존 `PermissionGuard`가 계속 최종 차단합니다.

## RED-first 결과

- RED-A: 새 링크가 없던 기존 코드에서 권한 있는 사용자의 `수신 배차 그룹` 링크 탐색이 실패했습니다.
- RED-B: 같은 테스트에서 기존 네 링크가 모두 존재하고 각 경로로 이동하는지 함께 고정했습니다.
- GREEN: 조건부 새 링크 추가 후 두 테스트 모두 통과했습니다.

## `DispatchesLayout` 참조 테스트 전체 실행

현재 테스트 검색 결과 `DispatchesLayout`을 직접 참조하는 테스트는 다음 1개 파일입니다.

- `src/renderer/routes/dispatches/DispatchesLayout.test.tsx`: 2/2 통과

## 검증

실행 위치: `clients/arologis-desktop`

| 명령 | 결과 |
|---|---|
| `npm test` | 종료코드 0, 14 files / 74 tests 통과 |
| `$env:VITE_API_BASE_URL='http://127.0.0.1:1'; npm test` | 종료코드 0, 14 files / 74 tests 통과 |
| `npm run typecheck` | 종료코드 0 |
| `npm run lint` | 종료코드 0 |

격리 테스트에서도 mock handler가 없는 endpoint로 실제 API 요청이 새지 않았습니다.

## 신규 파일

- `clients/arologis-desktop/src/renderer/routes/dispatches/DispatchesLayout.test.tsx`
- `docs/dev-reports/2026-08-07-1013-s5-received-groups-entry.md`

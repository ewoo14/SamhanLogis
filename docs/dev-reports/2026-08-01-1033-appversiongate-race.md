# AppVersionGate CI 경합 수정 보고서

## 1. 원인 확인

대상 컴포넌트를 확인한 결과 PM 분석이 맞다. `AppVersionGate`의 `useEffect`가 `updater.onStatus(...)`를 호출해 리스너를 등록한 뒤에야 테스트의 `emitStatus` 변수가 채워진다. 현재 테스트 4개는 모두 `emitStatus?.(...)`를 호출하므로, 등록 전 호출이 발생하면 옵셔널 체이닝이 오류 없이 이벤트를 버린다. 특히 컴포넌트는 같은 effect에서 곧바로 `checkForUpdate()`도 실행하므로, CI 타이밍에서 테스트 호출이 리스너 등록보다 앞설 수 있다.

같은 파일의 6개 테스트 중 updater 상태 이벤트를 발행하는 4개 테스트 모두 동일한 옵셔널 체이닝 형태를 사용한다. 나머지 2개 테스트는 이벤트 emitter를 사용하지 않는다.

## 2. 수정 전 RED 재현

첫 상태 이벤트 테스트의 `onStatus` 리스너 할당을 임시로 25ms 지연시켜 로컬에서 경합을 재현했다. 이벤트 발행 시점에 `emitStatus`가 `undefined`였고, 옵셔널 체이닝이 오류 없이 이벤트를 버렸다.

```text
RUN v2.1.9 C:/dev/Samhan-Public/.claude/worktrees/t1033/clients/arologis-desktop

❯ src/renderer/components/common/AppVersionGate.test.tsx (6 tests | 1 failed | 5 skipped)
× 아로로지스 데스크톱 버전 게이트 > updater의 안전한 일반 라벨은 새 버전 문구를 한 번만 표시
  → expected '업데이트를 확인하는 중입니다.다시 확인닫기' to contain '새 버전을 다운로드하는 중입니다.'

AssertionError: expected '업데이트를 확인하는 중입니다.다시 확인닫기' to contain '새 버전을 다운로드하는 중입니다.'
Expected: "새 버전을 다운로드하는 중입니다."
Received: "업데이트를 확인하는 중입니다.다시 확인닫기"
at src/renderer/components/common/AppVersionGate.test.tsx:75:32
```

## 3. 대상 테스트 GREEN

리스너 등록 완료를 기다린 뒤 `emitStatus` 존재를 단정하고 이벤트를 발행하도록 4개 상태 테스트를 수정했다. 문구 단정과 중복 방지 단정은 그대로 유지됐다.

```text
RUN v2.1.9 C:/dev/Samhan-Public/.claude/worktrees/t1033/clients/arologis-desktop
✓ src/renderer/components/common/AppVersionGate.test.tsx (6 tests)
Test Files 1 passed (1)
Tests 6 passed (6)
```

## 4. 패키지 내 경합 형태 sweep

`clients/arologis-desktop/src`의 모든 `*.test.*`/`*.spec.*`를 대상으로 옵셔널 콜백 호출과 리스너·emitter 패턴을 검색했다. 대상 파일의 4개 updater 상태 테스트 외에는 동일한 `emitStatus?.(...)` 형태나 등록 전 이벤트 발행 패턴을 찾지 못했다. 현재 남은 `resolveListenerRegistered?.()`는 테스트 더블 내부에서 등록 완료 resolver를 호출하는 코드이며, 이벤트 emitter를 옵셔널하게 호출하는 결함 형태가 아니다.

## 5. 전체 패키지 검증 결과

`npm test`를 실행했다. 대상 AppVersionGate 6개를 포함해 12개 파일 중 11개 파일, 61개 테스트는 통과했지만 `src/main/auto-update.test.ts`가 패키지 의존성 해석 단계에서 실패했다.

```text
Test Files 1 failed | 11 passed (12)
Tests 61 passed (61)
FAIL src/main/auto-update.test.ts
Error: Failed to resolve import "electron-updater" from "src/main/auto-update.ts". Does the file exist?
```

실패는 이번 변경 파일과 무관한 `electron-updater` 모듈 부재/해석 문제다. Docker나 DB 쓰기 없이 원인을 확인한다.

확인 결과 `clients/arologis-desktop/package.json`과 `package-lock.json`에는 `electron-updater@^6.8.9`가 선언되어 있으나 연결된 `node_modules/electron-updater` 경로는 존재하지 않았다. 따라서 전체 테스트 실패는 소스 변경이 아닌 현재 연결된 의존성 설치 상태로 판단된다.

## 6. typecheck 결과

요청한 `npm run typecheck`도 실행했으며 같은 의존성 부재로 실패했다.

```text
> @samhan/arologis-desktop@1.0.0 typecheck
> tsc -p tsconfig.node.json --noEmit && tsc -p tsconfig.web.json --noEmit

src/main/auto-update.ts(4,69): error TS2307: Cannot find module 'electron-updater' or its corresponding type declarations.
```

## 7. 최종 상태

- 변경 범위: `AppVersionGate.test.tsx`의 상태 이벤트 4개 테스트만 수정했다.
- 이벤트 발행 전 리스너 등록 완료를 기다린다.
- `emitStatus`가 등록되지 않으면 `expect(emitStatus).toBeDefined()`에서 실패한다.
- 기존 6개 동작 단정은 유지했고 대상 파일은 6/6 통과했다.
- 패키지 전체 및 typecheck는 `electron-updater` 미설치로 환경 차단됐다.
- Docker 재빌드·재기동, 실 DB 쓰기, 다른 패키지 수정은 하지 않았다.

## 8. 2026-08-01 후속 확인 — 원인 정정 및 재수정

앞선 보고서의 리스너 등록 경합 진단은 이번 CI 실패의 원인이 아니었다. `expect(emitStatus).toBeDefined()`가 통과하고, 실제로 현재 테스트 더블의 `onStatus`가 리스너를 등록한 뒤 이벤트를 발행했기 때문이다.

실제 원인은 PM의 새 진단과 일치한다. `AppVersionGate`는 `checkForUpdate()`에서 먼저 `setUpdateStatus({ kind: 'checking' })`를 호출하고, 같은 `app-auto-update-status` 요소를 `checking` 상태로 렌더링한다. 이후 `available` 이벤트가 오면 요소는 새로 생기는 것이 아니라 같은 요소의 텍스트만 갱신된다. 따라서 `findByTestId('app-auto-update-status')`는 기존 `checking` 요소를 즉시 반환하고 내용 변화는 기다리지 않는다.

`updateVersionLabel('')`도 확인했다. 빈 문자열은 `DISPLAY_VERSION_PATTERN`에 맞지 않으므로 `updateVersionLabel`은 `'새 버전'`을 반환하며, `available` 상태 문구는 기대대로 `'새 버전을 다운로드하는 중입니다.'`가 된다.

## 9. 수정 전 RED 재현 원문

첫 번째 `available` 이벤트 발행을 임시로 25ms 지연시켜 리렌더보다 `findByTestId`가 먼저 완료되는 조건을 만들었다. 로컬에서 CI와 동일한 실패를 재현했다.

```text
 RUN  v2.1.9 C:/dev/Samhan-Public/.claude/worktrees/t1033/clients/arologis-desktop

❯ src/renderer/components/common/AppVersionGate.test.tsx (6 tests | 1 failed)
× 아로로지스 데스크톱 버전 게이트 > updater의 안전한 일반 라벨은 새 버전 문구를 한 번만 표시
  → expected '업데이트를 확인하는 중입니다.다시 확인닫기' to contain '새 버전을 다운로드하는 중입니다.'

Test Files 1 failed (1)
Tests 1 failed | 5 passed (6)

AssertionError: expected '업데이트를 확인하는 중입니다.다시 확인닫기' to contain '새 버전을 다운로드하는 중입니다.'
Expected: "새 버전을 다운로드하는 중입니다."
Received: "업데이트를 확인하는 중입니다.다시 확인닫기"
at src/renderer/components/common/AppVersionGate.test.tsx:80:32
```

이는 요소 부재 실패가 아니라 이미 존재하는 `checking` 요소의 옛 텍스트를 읽은 실패다.

## 10. 수정 내용

`clients/arologis-desktop/src/renderer/components/common/AppVersionGate.test.tsx`의 상태 내용 단정을 다음 방식으로 바꿨다.

- 리스너 등록 대기는 유지하고 `expect(emitStatus).toBeDefined()`도 유지한다.
- `available` 3개 테스트와 `checking` 1개 테스트에서 `findByTestId(...).textContent`를 제거했다.
- `waitFor(() => getByTestId(...).textContent 단정)`으로 바꿔 기대 문구가 실제로 나타날 때까지 기다린다.
- 기대 문구, 중복 라벨 방지, 잘못된 날짜 비노출 단정은 그대로 유지했다.
- 6개 테스트가 검증하던 서버 버전 표시·오프라인 본문·3개 라벨·알림 재표시 동작은 모두 유지했다.

## 11. 패키지 전체 sweep

대상: `clients/arologis-desktop` 전체(`src`, `*.test.*`/`*.spec.*`, `node_modules` 제외).

`findBy...` 사용처는 2곳이었다.

1. `AppVersionGate.test.tsx:37` — 초기 렌더에 없는 `app-version-minor-banner`가 서버 응답 후 나타나는 것을 기다린 뒤 내용을 단정한다. 부재 대기가 아니라 실제 생성 대기이므로 수정하지 않았다.
2. `AppVersionGate.test.tsx:181` — 닫혀서 제거된 `app-auto-update-status`가 새 `available` 상태에서 다시 생성되는 것을 기다리며 존재만 단정한다. 내용 변화 단정이 아니므로 수정하지 않았다.

내용 변화 경합 형태는 `AppVersionGate.test.tsx`에서 발견한 다음 4곳이며 모두 수정했다.

- 빈 버전 `available` → `'새 버전을 다운로드하는 중입니다.'`
- 호환 fallback `'새 버전'` → 동일 문구 및 중복 방지
- 잘못된 날짜 버전 → 일반 `'새 버전'` 문구 및 원문 비노출
- `checking` 상태 → `'업데이트를 확인하는 중입니다.'`

그 외 패키지 테스트에는 `findBy...`로 잡은 기존 요소의 내용 변화를 단정하는 사례가 없었다.

## 12. 검증 원문

대상 테스트:

```text
Test Files 1 passed (1)
Tests 6 passed (6)
```

타입체크:

```text
> @samhan/arologis-desktop@1.0.0 typecheck
> tsc -p tsconfig.node.json --noEmit && tsc -p tsconfig.web.json --noEmit

Exit code: 0
```

패키지 전체 `npm test` 최종 결과:

```text
 RUN  v2.1.9 C:/dev/Samhan-Public/.claude/worktrees/t1033/clients/arologis-desktop

✓ src/main/packaging-invariants.test.ts (6 tests)
✓ src/renderer/version/versionCheck.test.ts (4 tests)
✓ src/renderer/api/permissions.test.ts (5 tests)
✓ src/renderer/api/arologisDispatchDetail.test.ts (6 tests)
✓ src/main/auto-update.test.ts (9 tests)
✓ src/renderer/components/AppLayout.test.tsx (2 tests)
✓ src/renderer/components/common/AppVersionGate.test.tsx (6 tests)
✓ src/renderer/components/InsungLbsPanel.test.tsx (3 tests)
✓ src/renderer/components/PermissionGuard.test.tsx (2 tests)
✓ src/renderer/components/ManualLocationForm.test.tsx (4 tests)
✓ src/renderer/components/VehicleMatchStatusBadge.test.tsx (16 tests)
✓ src/renderer/routes/dispatches/DispatchDetailPage.test.tsx (7 tests)

Test Files 12 passed (12)
Tests 70 passed (70)
```

최초 전체 실행에서는 기존 `node_modules/electron-updater` 부재로 `11 passed / 1 failed`, `61 passed`가 나왔다. 선언된 `electron-updater@6.8.9`를 `npm install --no-save --ignore-scripts`로 현재 워크트리의 의존성 설치 상태만 복구한 뒤 재실행해 위 최종 결과를 얻었다. 소스·다른 패키지·테스트 삭제/skip은 변경하지 않았다.

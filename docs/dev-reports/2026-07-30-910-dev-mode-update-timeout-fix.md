# Issue #910 / PR #993 — 개발 모드 업데이트 확인 timeout 결함 fix

작성일: 2026-07-30  
대상 브랜치: `feat/910-client-version-policy`

## 원인

PM 확정 진단을 그대로 인용한다.

```text
렌더러  clients/desktop/src/renderer/components/common/AppVersionGate.tsx:229-230
          setUpdateStatus({ kind: 'checking' })
          checkTimeout = setTimeout(() => setUpdaterError('check-timeout'), DESKTOP_UPDATE_CHECK_TIMEOUT_MS)
        AppVersionGate.tsx:254
          void updater.check().catch((error) => setUpdaterError('check', error))

메인    clients/desktop/src/main/auto-update.ts:81-88
          ipcMain.handle(CHECK_CHANNEL, async () => {
            if (!app.isPackaged) return          ← 아무 상태도 broadcast 하지 않고 정상 종료
            ...
          })
```

`check()`는 예외 없이 정상 resolve하지만 메인이 `updater:status`를 보내지 않았다. 따라서 renderer의 `checkTimeout`을 끌 이벤트가 없고, 30초 뒤 `check-timeout`이 발화했다. 원래 주석의 의도는 비패키징 앱에서 `electron-updater`를 호출하지 않아 로컬 개발을 막지 않는 것이었지만, 상태 없는 정상 종료가 renderer의 기동 gate를 timeout 오류로 만들었다.

기존 `clients/desktop/src/main/auto-update.test.ts`는 `app.isPackaged: true`로 고정되어 dev 경로를 실행할 수 없었고, renderer 테스트에는 `check()`가 성공 resolve한 뒤 상태 이벤트를 보내지 않는 경로가 없었다.

## RED-first

### 추가한 실패 테스트

- `clients/desktop/src/main/auto-update.test.ts`
  - `isPackaged`를 런타임에 바꿀 수 있는 getter mock으로 변경했다.
  - 비패키징 `updater:check`가 updater를 호출하지 않으면서 renderer에 종료 상태를 보내야 한다는 테스트를 추가했다.
  - 비패키징 `updater:install`도 상태 없이 끝나지 않아야 한다는 테스트를 추가했다.
- `clients/desktop/src/renderer/components/common/AppVersionGate.test.tsx`
  - `updater.check()`가 성공 resolve하지만 status 이벤트가 없는 경우 `check-timeout`으로 gate가 정착하는 회귀 테스트를 추가했다.

### RED 실행 원문

실행 명령:

```powershell
npx vitest run src/main/auto-update.test.ts src/renderer/components/common/AppVersionGate.test.tsx
```

```text
 RUN  v2.1.9 D:/dev/Samhan-Public/.claude/worktrees/w993-version/clients/desktop

 ❯ src/main/auto-update.test.ts (6 tests | 2 failed)
   × Electron 자동 업데이트 IPC > 비패키징 앱의 check IPC는 updater를 호출하지 않고 종료 상태를 renderer에 알린다
     → expected "spy" to be called with arguments: [ 'updater:status', …(1) ]
       Received:
       Number of calls: 0
   × Electron 자동 업데이트 IPC > 비패키징 앱의 install IPC도 조용히 끝내지 않고 종료 상태를 renderer에 알린다
     → expected "spy" to be called with arguments: [ 'updater:status', …(1) ]
       Received:
       Number of calls: 0
   ✓ src/renderer/components/common/AppVersionGate.test.tsx (16 tests)

 Test Files  1 failed | 1 passed (2)
      Tests  2 failed | 20 passed (22)
```

RED에서 실패한 두 assertion의 실제 수신 호출 수는 모두 `0`이었다. renderer의 새 timeout 회귀 테스트는 기존 timeout 동작을 확인하므로 이 단계에서도 통과했다.

## 수정

두 desktop main updater 구현의 비패키징 조기 반환을 다음 계약으로 바꿨다.

```ts
if (!app.isPackaged) {
  broadcast({ kind: 'not-available' })
  return
}
```

- `clients/desktop/src/main/auto-update.ts`
  - `updater:check`와 `updater:install` 모두 개발 모드에서 `electron-updater`를 호출하지 않는다.
  - 대신 renderer가 정상 종료 상태를 받아 `checking`을 정착시킨다.
- `clients/arologis-desktop/src/main/auto-update.ts`
  - 전수 sweep에서 같은 상태 없는 조기 반환이 `check`·`install`에 남아 있어 동일하게 해소했다.
  - 이는 8앱 버전 정책 확장이 아니라 같은 updater IPC 결함 계열의 직접 보완이다.
- packaged 분기는 변경하지 않았다. `electron-updater` 실제 확인·다운로드·설치와 오류 broadcast 로직은 그대로다.
- `AppVersionGate.tsx` production 코드는 변경하지 않았다. packaged 앱의 timeout 감지 약화를 피하고, 개발 모드 main이 종료 상태를 보내도록 root fix를 적용했다.

## GREEN

### Samhan desktop 변경 모듈

```text
 RUN  v2.1.9 D:/dev/Samhan-Public/.claude/worktrees/w993-version/clients/desktop

 ✓ src/main/auto-update.test.ts (6 tests)
 ✓ src/renderer/components/common/AppVersionGate.test.tsx (16 tests)

 Test Files  2 passed (2)
      Tests  22 passed (22)
```

### 아로로지스 desktop 계열 sweep 모듈

```text
 RUN  v2.1.9 D:/dev/Samhan-Public/.claude/worktrees/w993-version/clients/arologis-desktop

 ✓ src/main/auto-update.test.ts (5 tests)

 Test Files  1 passed (1)
      Tests  5 passed (5)
```

### 타입검증

요구된 권위 명령을 실행했다.

```powershell
cd clients/desktop
npm run typecheck
```

```text
> @samhan/desktop@0.1.0 typecheck
> node scripts/real-qa-scope.cjs --phase=typecheck && tsc -p tsconfig.node.json --noEmit && tsc -p tsconfig.web.json --noEmit && npm run typecheck:real-qa

[로컬 파생물 신선도] typecheck 대상 확인 완료
> @samhan/desktop@0.1.0 typecheck:real-qa
> node --test scripts/real-qa-cleanup-scope.test.cjs && node --test scripts/real-qa-scope.test.cjs

ℹ tests 2
ℹ pass 2
ℹ fail 0
ℹ skipped 0
ℹ tests 50
ℹ pass 50
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

`clients/arologis-desktop`도 별도로 `npm run typecheck`를 실행했으며 `tsconfig.node.json`과 `tsconfig.web.json` 모두 오류 없이 종료했다.

typecheck 실행 중 기존 로컬 미추적 real-QA fixture `clients/desktop/playwright/n1b-native-qa/r2fix-untracked-only-real-qa.spec.ts`에 대한 경고가 출력됐지만, 해당 scope 테스트는 `50 pass`였고 이번 변경과 무관하다.

## 불변식별 확인

1. **개발 기동에서 업데이트 실패 알림이 뜨지 않는다.**
   - dev `updater:check`가 `not-available`을 broadcast한다.
   - renderer는 `not-available`에서 timeout을 오류로 표시하지 않고 startup gate를 연다.
   - dev `updater:check` 회귀 테스트가 실제 `isPackaged: false` 경로에서 updater 미호출과 상태 전송을 확인했다.
2. **패키징 앱 동작은 유지된다.**
   - 기존 packaged check 테스트가 `checkForUpdates()` 호출을 통과했다.
   - 기존 update-available/download, update-downloaded/install, error message masking 테스트가 모두 통과했다.
   - packaged 분기 소스는 그대로다.
3. **renderer가 무기한 checking에 남지 않는다.**
   - 상태 이벤트가 없는 `check()` 성공 resolve 조건을 fake timer로 고정했다.
   - 기존 `check-timeout` 동작은 로그인 children을 렌더링하고 제한 초과 안내를 남기는 것으로 통과했다.
   - 정상 dev 경로에서는 main의 `not-available` 이벤트가 timeout보다 먼저 gate를 정착시킨다.
4. **조용히 끝나는 IPC 전수 sweep.**
   - `clients/desktop/src/main`의 updater 상태 IPC는 `updater:check`·`updater:install` 두 개였고 모두 수정했다.
   - repo 전체에서 동일 성질의 `if (!app.isPackaged) return`은 `clients/arologis-desktop/src/main/auto-update.ts`의 두 handler에서 발견되어 함께 수정하고 5개 테스트로 고정했다.
   - 그 외 `isPackaged` 사용은 외부 URL 허용 판정이며 상태 IPC가 아니다. `legacy:open-external`은 허용하지 않을 때 예외를 던지고, `updater:quit`은 의도적으로 앱을 종료하는 명령이라 updater 상태 없는 조기 반환 계열이 아니다.
5. **다른 화면·기능 변화가 없다.**
   - production 코드 변경은 두 desktop main updater 파일의 비패키징 분기 4줄씩뿐이다.
   - renderer production 코드, update policy timeout 상수, 화면 컴포넌트 및 다른 IPC는 변경하지 않았다.
   - Docker·Gradle·전체 테스트 suite·git 쓰기 명령은 실행하지 않았다.

## 변경 파일과 줄 수

아래 tracked 파일 수치는 `git diff --numstat`의 파일별 원문 기준이다.

```text
38  3  clients/arologis-desktop/src/main/auto-update.test.ts
8   2  clients/arologis-desktop/src/main/auto-update.ts
38  3  clients/desktop/src/main/auto-update.test.ts
8   2  clients/desktop/src/main/auto-update.ts
20  0  clients/desktop/src/renderer/components/common/AppVersionGate.test.tsx
```

신규 파일:

```text
docs/dev-reports/2026-07-30-910-dev-mode-update-timeout-fix.md
```

기존 미추적 파일 `docs/dev-reports/2026-07-30-910-s2-artifact-version.md`는 읽기만 하고 변경하지 않았다.

git `add`, `commit`, `push`, `checkout`, `switch`는 실행하지 않았다.

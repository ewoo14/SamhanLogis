# #894 S2 본체 테스트 실패 판정 — CODEX LUNA

검증 시각: 2026-08-13 KST  
대상: `feat/894-internal-chat` · PR #1193  
제약: git 변경 명령 미사용 · 공유 DB 쓰기 미수행

## 결론

실패는 `(c) 이번 브랜치와 무관하게 원래 실패`로 판정한다. S2 코드는 수정하지 않았다.

## 1. 실패 테스트와 실행 원문

실패 테스트 이름:

```text
src/renderer/routes/SlipFormPage.test.tsx
SlipFormPage outbound date contract
preserves a user-edited N when M changes and exposes an M/N validation error
```

좁힌 재실행 원문:

```text
 RUN v2.1.9 C:/dev/Samhan-Public/.claude/worktrees/w894/clients/desktop

× src/renderer/routes/SlipFormPage.test.tsx > SlipFormPage outbound date contract > preserves a user-edited N when M changes and exposes an M/N validation error
  → expected '2026-08-10' to be '2026-08-14' // Object.is equality

 Test Files 1 failed (1)
      Tests 1 failed | 102 skipped (103)

AssertionError: expected '2026-08-10' to be '2026-08-14' // Object.is equality

Expected: "2026-08-14"
Received: "2026-08-10"

❯ src/renderer/routes/SlipFormPage.test.tsx:1680:30
    1678|     fireEvent.change(outboundDate, { target: { value: '2026-08-09' } })
    1679| 
    1680|     expect(unloadDate.value).toBe('2026-08-14')
       |                              ^
    1681|     expect(screen.getByTestId('slip-form-unload-date-error').textContent)
    1682|       .toContain('출고일(M)과 하차일(N)을 확인')

EXIT(targeted)=1
```

본체 `npm test` 원명령은 `pretest`에서 124초 제한에 걸려 다음처럼 끝났다. 따라서 이 명령 자체의 전체 runner 수치는 확보하지 못했다.

```text
command timed out after 124033 milliseconds
```

`pretest`를 우회한 전체 Vitest 실행에서도 같은 실패가 확인됐다.

```text
FAIL src/renderer/routes/SlipFormPage.test.tsx > SlipFormPage outbound date contract > preserves a user-edited N when M changes and exposes an M/N validation error
AssertionError: expected '2026-08-10' to be '2026-08-14' // Object.is equality
❯ src/renderer/routes/SlipFormPage.test.tsx:1680:30
```

## 2. 원인 판정

현재 시각의 시스템 날짜는 다음이었다.

```text
2026-08-13T00:36:09.9058433+09:00
```

실패 테스트는 `2026-08-14`, `2026-08-09`를 고정하고, 본체 구현은 `toKstDateISO()`로 현재 날짜를 초기화한다. 날짜에 의존하는 기존 테스트가 현재 날짜와 어긋난 결과다.

`main` 비교 근거:

```text
---main diff target files---
(출력 없음)

worktree:
df8796618b3bf7a3db46b4ca866efef1a3974b86
origin-main:
df8796618b3bf7a3db46b4ca866efef1a3974b86
```

즉 실패 테스트 파일은 현재 브랜치와 `origin/main`에서 동일하다. 본체 변경 목록에는 채팅 사이드바/채팅 실시간 클라이언트 등 기존 본체 채팅 변경은 있으나, S2 독립 셸 변경은 `clients/internal-chat-desktop`에만 있다. 실패 파일과 구현 파일은 S2에서 변경되지 않았다.

따라서 `(a)` 아님, `(b)` 아님, `(c)` 원래 결함/환경 의존 테스트다. PR 범위 밖이므로 고치지 않았다. RED→GREEN 원문은 해당하지 않는다.

## 3. 검증 원문

### `clients/desktop`

```text
> @samhan/desktop@0.1.0 typecheck
> node scripts/real-qa-scope.cjs --phase=typecheck && tsc -p tsconfig.node.json --noEmit && tsc -p tsconfig.web.json --noEmit && npm run typecheck:real-qa

EXIT(typecheck)=0

> @samhan/desktop@0.1.0 build
> npm run build:legacy && electron-vite build

✓ built in 247ms
✓ built in 59ms
✓ built in 9.49s
EXIT(build)=0
```

`npm test`는 위 1절대로 완료하지 못했다. 따라서 불변식 “본체 npm test 실패 0”은 `(c)` 판정에 따라 적용하지 않는다.

### `clients/arologis-desktop`

```text
> @samhan/arologis-desktop@1.0.0 typecheck
> tsc -p tsconfig.node.json --noEmit && tsc -p tsconfig.web.json --noEmit
EXIT(typecheck)=0

Test Files 17 passed (17)
      Tests 80 passed (80)
EXIT(test)=0

> @samhan/arologis-desktop@1.0.0 build
> electron-vite build

✓ built in 2.58s
✓ built in 28ms
✓ built in 6.48s
EXIT(build)=0
```

### `clients/internal-chat-desktop`

```text
> @samhan/internal-chat-desktop@0.1.0 lint
> eslint "src/**/*.{ts,tsx}"
EXIT(lint)=0

> @samhan/internal-chat-desktop@0.1.0 typecheck
> tsc -p tsconfig.node.json --noEmit && tsc -p tsconfig.web.json --noEmit
EXIT(typecheck)=0

Test Files 1 passed (1)
      Tests 4 passed (4)
EXIT(test)=0

> @samhan/internal-chat-desktop@0.1.0 build
> electron-vite build

✓ built in 114ms
✓ built in 31ms
✓ built in 140ms
EXIT(build)=0
```

## 4. Live QA 불변식

본체 실패가 S2와 무관하고 S2 코드를 수정하지 않았으므로, 선행 라이브 QA에서 확인한 다음 결과를 잃지 않았다.

```text
패키징 앱 창 표시 · 본체 꺼져 있어도 독립 실행
트레이 상주 · 트레이에서 재열기 · 삼한이 아이콘
명시적 종료로 완전 종료
NSIS 81,646,509 bytes
portable 81,495,134 bytes
```

이번 라운드에는 `build:win`을 다시 실행하지 않았다. 위 패키지 크기와 실사용 GUI 증거는 `docs/dev-reports/2026-08-12-894-s2-liveqa-sol.md`의 선행 실행 원문을 보존한다.

## 5. 라운드 종료 점검

```text
git ls-files --deleted:
(출력 없음)

git status --short:
 D tools/.s24-build-only/build/deep/tracked-writer.mjs

git ls-files --stage -- tools/.s24-build-only/build/deep/tracked-writer.mjs:
100644 6f4bd99bc47f4e068c446aeedd188660cfdcf553 0 tools/.s24-build-only/build/deep/tracked-writer.mjs

Test-Path tools/.s24-build-only/build/deep/tracked-writer.mjs:
False
```

삭제 추적 파일 한 줄: `tools/.s24-build-only/build/deep/tracked-writer.mjs`는 추적 상태지만 worktree에 없으며, git 변경 명령 금지에 따라 복원하지 않았다.

검증 중 생성된 Electron/앱 프로세스는 남아 있지 않았다. 공유 DB 쓰기는 수행하지 않았다.

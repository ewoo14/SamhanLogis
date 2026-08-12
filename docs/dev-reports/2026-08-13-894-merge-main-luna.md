# PR #1193 — origin/main 머지 및 세 앱 재검증

## 결과

- 브랜치: `feat/894-internal-chat`
- 머지: `git merge origin/main` 성공
- 머지 커밋: `0ca7bf525d8c286af1b09d3dacab794da1974cd7`
- 충돌: 없음. 신규 앱(`clients/internal-chat-desktop`)과 `origin/main` 변경이 겹치지 않아 충돌 해소가 필요하지 않았습니다.
- CI 설정 변경: 없음 (`git diff --name-status ORIG_HEAD HEAD -- .github` 출력 없음)
- 공유 DB 쓰기: 없음

## 검증 원문

### `clients/desktop`

실행 명령:

```text
npm run typecheck
npm test
npm run build
```

`typecheck` 원문 결과:

```text
> @samhan/desktop@0.1.0 typecheck
> node scripts/real-qa-scope.cjs --phase=typecheck && tsc -p tsconfig.node.json --noEmit && tsc -p tsconfig.web.json --noEmit && npm run typecheck:real-qa

ℹ tests 2
ℹ pass 2
ℹ fail 0
...
ℹ tests 51
ℹ pass 51
ℹ fail 0
```

`npm test` 원문 마지막 요약:

```text
Test Files  260 passed (260)
Tests       2260 passed | 2 skipped (2262)
Duration    115.27s (transform 79.34s, setup 0ms, collect 630.45s, tests 267.04s, environment 347.22s, prepare 73.03s)
EXIT_CODE=0
```

`build` 원문 결과: 종료 코드 `0`. Vite 빌드 완료.

### `clients/arologis-desktop`

실행 명령:

```text
npm run typecheck
npm test
npm run build
```

원문 결과:

```text
Test Files  17 passed (17)
Tests       80 passed (80)

✓ built in 1.26s
✓ built in 12ms
✓ built in 3.31s
```

전체 명령 종료 코드: `0`.

### `clients/internal-chat-desktop`

실행 명령:

```text
npm run lint
npm run typecheck
npm test
npm run build
```

원문 결과:

```text
Test Files  1 passed (1)
Tests       4 passed (4)
```

`lint`, `typecheck`, `test`, 일반 `build` 전체 종료 코드: `0`.

첫 `npm run build:win`은 버전 환경변수가 없어 릴리스 가드에서 중단됐습니다.

```text
[internal-chat-release] VITE_APP_VERSION에 YYYY/MM/DD-{번호} 형식의 릴리스 버전을 명시적으로 주입해야 합니다. 릴리스 모드에서는 개발 sentinel을 사용하지 않습니다.
```

유효한 버전을 명시해 재실행했습니다.

```text
$env:VITE_APP_VERSION='2026/08/13-1'; npm run build:win
[internal-chat-release] VITE_APP_VERSION=2026/08/13-1
• packaging platform=win32 arch=x64 appOutDir=release\2026-08-13-1\win-unpacked
• building target=nsis file=release\2026-08-13-1\Samhan Internal Chat-2026-08-13-1-x64.exe
• building target=portable file=release\2026-08-13-1\Samhan Internal Chat-2026-08-13-1-x64-portable.exe
```

`build:win` 종료 코드: `0`.

생성 산출물:

```text
Samhan Internal Chat-2026-08-13-1-x64.exe          81,646,507 bytes
Samhan Internal Chat-2026-08-13-1-x64-portable.exe 81,495,151 bytes
Samhan Internal Chat-2026-08-13-1-x64.exe.blockmap     85,625 bytes
```

electron-builder가 `default Electron icon is used`를 출력했습니다. 이번 머지에서 CI 설정은 건드리지 않았고, 해당 출력은 기존 `electron-builder.yml`에 앱 아이콘 설정이 없는 상태를 의미합니다.

## 라운드 종료 점검

- `git diff --name-status origin/main...HEAD` 기준 삭제 추적 파일: `NONE`
- 검증 하네스가 `tools/.s24-build-only/build/deep/tracked-writer.mjs`를 다시 삭제해 `D` 상태로 만든 것을 확인했습니다.
- 해당 파일을 `origin/main` 원문으로 복원했습니다. 최종 상태: 존재, 42 bytes.
- 최종 `git status --short`: 본 보고서 `?? docs/dev-reports/2026-08-13-894-merge-main-luna.md`만 표시되며, 그 외 변경/삭제 없음(PM 커밋 대상)
- 앱 관련 임시 `npm`/Electron/Builder/Vitest 프로세스: 없음. Codex 실행 호스트 프로세스만 남아 있습니다.

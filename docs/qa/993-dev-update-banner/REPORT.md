# PR #993 (#910) 개발 모드 업데이트 실패 배너 라이브 QA 보고서

## 판정

**PASS.** 수정 브랜치의 비패키징 Electron 앱을 실제 기동하고 30초를 넘겨 확인한 결과, 로그인 화면에 업데이트 실패 배너가 나타나지 않았다.

비교군인 `main`에서는 같은 조건에서 업데이트 확인 중 화면을 거친 뒤 실패 배너가 재현되었다. 비교군의 `다시 확인` 버튼을 실제 클릭한 뒤에도 실패 배너가 유지되었다.

## 실행 정보

- 수행일: 2026-07-30 KST
- 대상 브랜치: `feat/910-client-version-policy`
- 수정 브랜치 HEAD: `c6c62045c2ab5b22215365b9698fbd870ac01966`
- 비교군 worktree: `D:\dev\Samhan-Public` (`main`, HEAD `427cb34e37a0abe487769115ab0b50af6bb57185`)
- 대상 앱: `clients/desktop`
- Electron: `33.4.11`
- Vite renderer: `http://127.0.0.1:5191/`
- API gateway: `http://localhost:8080` 응답 확인. 루트 경로는 404였으며 gateway 프로세스는 8080에서 listen 중이었다.
- 로그인: 수행하지 않음. 로그인 화면에서 배너 노출 여부만 확인했다.
- 공유 실데이터: 쓰기 없음
- Docker / Gradle: 실행하지 않음
- 패키징: `build:win` 실행하지 않음. `electron.exe out/main/index.js`로 비패키징 Electron을 실행했다.

## 기동 명령 원문

두 worktree에서 경로만 바꾸고 아래 조건을 동일하게 적용했다.

```powershell
Set-Location 'D:\dev\Samhan-Public\.claude\worktrees\w993-version\clients\desktop'
$env:VITE_APP_VERSION='2026/07/30-1'
$env:VITE_API_BASE_URL='http://localhost:8080'
$env:ELECTRON_RENDERER_URL='http://127.0.0.1:5191'

npm run build

Start-Process -FilePath '.\node_modules\.bin\vite.cmd' `
  -ArgumentList @('dev','src/renderer','--config','vite.config.ts','--port','5191','--strictPort','--host','127.0.0.1') `
  -WorkingDirectory (Get-Location)

Start-Process -FilePath '.\node_modules\electron\dist\electron.exe' `
  -ArgumentList @('out/main/index.js') `
  -WorkingDirectory (Get-Location)
```

`npm run dev -- --port 5191 --strictPort` 형태의 첫 시도는 `electron-vite`가 `--port`를 알 수 없는 옵션으로 거부했다. 따라서 Vite 개발 서버를 5191로 직접 기동하고, Electron 본체가 `ELECTRON_RENDERER_URL`을 통해 그 renderer를 로드하는 위 경로를 사용했다. Electron 메인 프로세스와 IPC가 포함된 실제 창을 캡처했으며, 브라우저 renderer만 띄운 검증은 수행하지 않았다.

## 수정 브랜치 실측

- Electron 창 기동: 성공. 창 제목 `Samhan Public 데스크톱`
- renderer: `http://127.0.0.1:5191/` listen 확인
- 실제 대기: Electron 기동 후 약 37초
- 화면: `Samhan Public 로그인`
- 결과: 업데이트 실패 배너 없음. `다시 확인` 버튼도 없음.
- 캡처: `screenshots/fixed-after-30s.png` (1280×800)

수정 브랜치에서는 실패 배너가 나타나지 않았으므로 화면에 해당하는 수동 `다시 확인` 경로가 없었다. 따라서 이 브랜치에서 클릭할 버튼은 없었고, 비교군에서 존재하는 버튼을 동일한 실제 화면 조작으로 검증했다.

## `main` 비교군 실측

1. Electron 기동 후 약 37초 캡처에서는 `업데이트를 확인하는 중입니다. 확인이 끝나면 로그인 화면으로 이동합니다.`가 표시되었다. 이 상태를 확인한 뒤 추가로 35초 이상 대기했다.
2. 추가 대기 후 실제 로그인 화면 상단에 다음 실패 배너가 나타났다.

   `업데이트 실패: 업데이트 확인 시간이 제한을 초과했습니다. 잠시 후 다시 확인해 주세요.`

   버튼은 `다시 확인`, `닫기`였다.
3. `다시 확인` 버튼 중앙을 실제 화면 좌표 `(884,172)`에서 클릭했다.
4. 클릭 직후 캡처와 추가 35초 대기 후 캡처 모두 실패 배너가 다시 표시되었다.

## 캡처 목록

| 파일 | 상태 | 대기·조작 | 확인 결과 |
|---|---|---:|---|
| `screenshots/fixed-after-30s.png` | 수정 브랜치 | Electron 기동 후 약 37초 | 로그인 화면, 실패 배너 없음 |
| `screenshots/main-after-30s.png` | `main` 비교군 | Electron 기동 후 약 37초 | 아직 업데이트 확인 중 |
| `screenshots/main-checking-37s.png` | 위 비교군 상태 보존 사본 | 약 37초 | `main-after-30s.png`와 동일한 확인 중 화면 |
| `screenshots/main-after-timeout.png` | `main` 비교군 | 추가 대기 후 timeout 발생 | 실패 배너 및 `다시 확인` 표시 |
| `screenshots/main-after-manual-check.png` | `main` 비교군 | `다시 확인` 클릭 직후 | 실패 배너 유지 |
| `screenshots/main-after-manual-timeout.png` | `main` 비교군 | 수동 확인 후 추가 35초 | 실패 배너 유지 |

모든 파일은 Electron `BrowserWindow` 영역을 OS/Win32 캡처 API로 저장한 실제 PNG이며 합성 이미지나 DOM 텍스트 덤프가 아니다.

## 전후 대조 판정

| 구분 | 30초 이상 대기 후 | 수동 재확인 후 |
|---|---|---|
| 수정 브랜치 `c6c62045c` | 로그인 화면에 실패 배너 없음 | 버튼 자체가 없어 해당 없음 |
| `main` 비교군 | timeout 실패 배너 재현 | 실패 배너 유지 및 재현 |

결론적으로 이번 라운드의 단일 각도인 “개발 비패키징 모드에서 30초 대기 후 업데이트 실패 배너가 더 이상 뜨지 않는가”는 수정 브랜치에서 **충족**되었다.

## 참고 로그

Electron stderr에는 DevTools 내부의 `Unknown VE context: language-mismatch`, `Autofill.enable`, `Autofill.setAddresses` 메시지가 기록되었다. 앱 창은 정상적으로 로그인 화면까지 렌더링되었고, 이번 배너 판정과 직접 관련된 앱 기동 실패는 없었다.

## 신규 파일 전체 목록

- `docs/qa/993-dev-update-banner/REPORT.md`
- `docs/qa/993-dev-update-banner/screenshots/fixed-after-30s.png`
- `docs/qa/993-dev-update-banner/screenshots/main-after-30s.png`
- `docs/qa/993-dev-update-banner/screenshots/main-checking-37s.png`
- `docs/qa/993-dev-update-banner/screenshots/main-after-timeout.png`
- `docs/qa/993-dev-update-banner/screenshots/main-after-manual-check.png`
- `docs/qa/993-dev-update-banner/screenshots/main-after-manual-timeout.png`

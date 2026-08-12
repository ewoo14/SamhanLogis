# #894 S2 앱 셸 구현 보고서 — CODEX LUNA

## 범위

이번 슬라이스는 `clients/internal-chat-desktop`의 독립 Electron 앱 셸만 구현했다. 본체 인증 연계, 접속 상태·10분 부재중, 알림, 파일 전송, 참조번호, 이모티콘, 채팅 서버 API와 DB 스키마는 넣지 않았다.

## RED → GREEN 원문

### RED

구현 전 계약 테스트를 작성하고 실행했다.

```text
RUN v2.1.9 .../clients/internal-chat-desktop
❯ src/main/app-shell.contract.test.ts (3 tests | 3 failed)
× ships as an independent Electron application
  → ENOENT: .../clients/internal-chat-desktop/package.json
× keeps the renderer isolated and the sandbox preload loadable
  → ENOENT: .../clients/internal-chat-desktop/electron.vite.config.ts
× declares a packaged mascot resource for the tray
  → ENOENT: .../clients/internal-chat-desktop/electron-builder.yml
Test Files  1 failed
Tests       3 failed
```

### GREEN

최소 앱 셸 구현 후 원문은 다음과 같다.

```text
npm run lint                 exit 0
npm run typecheck            exit 0
npm test                     exit 0 — 1 file, 4 tests passed
npm run build                exit 0 — main / preload / renderer built
```

실제 Windows 패키징도 실행했다.

```text
$env:VITE_APP_VERSION='2026/08/12-894'; npm run build:win
exit 0
building target=nsis
building target=portable
no signing info identified, signing is skipped
```

산출물은 `Samhan Internal Chat-2026-08-12-894-x64.exe`와 `Samhan Internal Chat-2026-08-12-894-x64-portable.exe`였다. 패키징 내부의 `resources/samhani-tray.png`도 존재함을 확인했다.

## 불변식 확인

1. 독립 실행: 고유 `appId` `com.samhanair.internalchat.desktop`, 독립 package/lockfile, 독립 main/preload/renderer와 NSIS/portable 설정으로 구현했다. 본체 프로세스나 본체 인증 store를 참조하지 않는다.
2. 창 닫기: `BrowserWindow.close`에서 `event.preventDefault()` 후 `mainWindow.hide()`를 실행한다.
3. 명시적 종료: 트레이 메뉴 `종료`에서만 `isQuitting = true` 후 `app.quit()`한다. `window-all-closed`는 빈 핸들러로 두어 창 닫기로 종료되지 않는다.
4. 본체 무영향: 기존 `clients/desktop` 검증 원문은 아래와 같다.

```text
npm run typecheck  exit 0
npm test           exit 0
npm run build      exit 0
```

본체 `npm run build:win`은 먼저 `VITE_APP_VERSION` 누락으로 실패했고, 명시 버전으로 재실행하면 기존 설정의 `DESKTOP_UPDATE_URL` 누락에서 중단됐다. 신규 변경이 아닌 기존 release precondition이며 본체 설정은 수정하지 않았다.

5. 아로로지스 무영향: `clients/arologis-desktop` 설정은 읽기만 했고 수정하지 않았다. 의존성 설치 후 검증 원문은 다음과 같다.

```text
npm run typecheck  exit 0
npm test           exit 0 — 17 files, 80 tests passed
npm run build      exit 0
```

## 트레이 자산

레포에 `clients/web/design-system/src/assets/mascot/samhani-static.png`가 이미 존재했다(171×150, 27,130 bytes). 새 그림은 만들지 않았고 앱의 `build/samhani-tray.png`로 패키지에 포함했다. 다만 전용 정사각 `.ico`는 레포에 없으므로 **트레이 전용 아이콘 자산 필요** 상태다. 현재 Windows tray는 기존 PNG를 사용하고, installer 애플리케이션 아이콘은 electron-builder 기본 아이콘이 사용된다.

## 런타임 관찰

패키지된 `win-unpacked/Samhan Internal Chat.exe`를 실행하고 5초 뒤 확인했다.

```text
SMOKE process_alive pid=54956
SMOKE cleanup_complete pid=54956
```

이 세션에서 GUI를 자동으로 클릭해 창 닫기·트레이 재열기·트레이 `종료`까지 수행하는 자동화 도구는 사용하지 못했다. 대신 해당 동작은 `src/main/index.ts`의 close/preventDefault, hide, tray context menu, explicit quit 계약 테스트와 위 실행 절차로 확인했다. 개발책임자의 수동 관찰 절차는 다음과 같다.

```text
1. packaged exe 실행
2. 창 우측 상단 X 클릭 → 창이 사라지고 작업 관리자 프로세스 및 트레이 아이콘 유지
3. 트레이 아이콘 더블클릭 또는 '메신저 열기' → 같은 창 재표시
4. 트레이 메뉴 '종료' 클릭 → 프로세스 종료
```

## 코드서명·installer CI

이번 S2에서는 CI workflow를 수정하지 않았다. `forceCodeSigning: false`로 두고 unsigned NSIS/portable 생성만 확인했다. 실제 실행 로그에 `no signing info identified, signing is skipped`가 남았다. 인증서(`CSC_LINK`, `CSC_KEY_PASSWORD` 등), 전용 HTTPS update feed, installer release CI 연결은 후속 배포 슬라이스로 미뤘다.

## 라운드 종료 점검

초기 점검에서 추적 파일 `tools/.s24-build-only/build/deep/tracked-writer.mjs`가 삭제된 것을 발견해 원본 한 줄을 복원했다. 최종 점검 원문은 `git ls-files --deleted` → `NONE`, 대상 파일 내용 → `const OUT = 'docs/qa/.s24-build-only.png'`, 임시 앱 프로세스 → `NONE`이었다. 이번 실행에서 만든 `node_modules`, `out`, `release`와 임시 Electron 프로세스는 정리했다.

## 못 한 것

- GUI 자동화로 실제 X 클릭 후 트레이 재열기와 명시 종료를 수행한 관찰은 못 했다.
- 코드서명 인증서와 installer/update-feed CI 연결은 못 했다(이번 S2 범위 외).
- 전용 `.ico` 마스코트 트레이 자산은 못 만들었고, 기존 PNG를 사용하면서 자산 필요로 기록했다.

# R4 보완 — 세 화면 실 UI 캡처

이 코멘트는 직전 `CODEX SOL 적대검증 R4` 코멘트에서 세 화면 실 UI 미도달 때문에 남긴 **R4 통과 보류를 해소한다**.

## 1. 환경 확인

요청된 명령의 최초 실행 원문:

```text
cd C:\dev\Samhan-Public\.claude\worktrees\w1235
git rev-parse HEAD
c5af40469e34425d2c0faa829a5bd8e0c75f302f

git status --porcelain
?? docs/qa/expo-mobile-buildable/r4-sol-2026-08-16/
```

최초 status의 한 경로는 직전 R4의 미추적 산출물이다. 이번 보완에서도 `git add`, `git commit`, `git push`는 실행하지 않았다.

실행 환경:

```text
Playwright import cwd  clients/desktop
Chromium               %LOCALAPPDATA%\ms-playwright\chromium_headless_shell-1217
실행 파일              chrome-headless-shell-win64\chrome-headless-shell.exe
headless               true
앱 URL                 http://127.0.0.1:28101/#/
viewport                390 x 844
```

`infrastructure/.env.local` 최신본을 읽는 저장소 credential resolver로 `dev_master` 새 로그인을 수행했고, 이전 실행의 토큰은 재사용하지 않았다. Expo sales 앱, 실 PostgreSQL 데이터, PR HEAD `partner-service.jar` 격리 컨테이너를 사용했다. quick-search만 격리 PR HEAD로 전달했고 응답을 주입하거나 mock/stub하지 않았다.

## 2. 세 화면 실 UI 결과

검색어는 세 화면 모두 `삼한`이다. 각 화면에서 고유 요소를 먼저 단정한 뒤 검색했고, 브라우저가 받은 응답 배열 길이와 실제 보이는 `customer-row-*` 행 수를 따로 집계했다.

| 화면 | 화면 도달 단정 원문 | 실 HTTP | 백엔드 응답 | 화면 행 | 판정 |
|---|---|---:|---:|---:|---|
| 견적 | `exact text visible: "신규 견적 — 거래처 선택"` | 200 | 3건 | 3행 | 일치 |
| 주문 | `exact text visible: "신규 주문 — 거래처 선택"` | 200 | 3건 | 3행 | 일치 |
| 거래처 | `active tab background differs: customer=rgb(219, 234, 254), quotation=rgba(0, 0, 0, 0)` | 200 | 3건 | 3행 | 일치 |

Playwright 실행 원문:

```text
[UI] screen=견적 reach=exact text visible: "신규 견적 — 거래처 선택" HTTP=200 backend=3 ui=3 screenshot=01-quotation-partner-search-real-qa.png
[UI] screen=주문 reach=exact text visible: "신규 주문 — 거래처 선택" HTTP=200 backend=3 ui=3 screenshot=02-order-partner-search-real-qa.png
[UI] screen=거래처 reach=active tab background differs: customer=rgb(219, 234, 254), quotation=rgba(0, 0, 0, 0) HTTP=200 backend=3 ui=3 screenshot=03-customer-partner-search-real-qa.png
```

세 화면 모두 화면에 다음 3개 행을 표시했다.

```text
2148720659       (주)삼한공조시스템
550122-1168113   삼한빌딩 5층 이성수
6340200656       삼한공조
```

## 3. 스크린샷과 육안 확인

| 파일 | 바이트 | 육안 확인 |
|---|---:|---|
| `01-quotation-partner-search-real-qa.png` | 27,962 | `신규 견적 — 거래처 선택`, 검색어 `삼한`, `3건 조회됨`, 3행, 한글 정상 |
| `02-order-partner-search-real-qa.png` | 27,919 | `신규 주문 — 거래처 선택`, 검색어 `삼한`, `3건 조회됨`, 3행, 한글 정상 |
| `03-customer-partner-search-real-qa.png` | 24,687 | 거래처 탭 활성, 검색어 `삼한`, `3건 조회됨`, 3행, 한글 정상 |

세 PNG를 캡처 후 직접 열어 확인했다. 홈 낙착 화면이나 기존 이미지 재사용이 아니다.

## 4. 증거 무결성

- 해시 경로 `/#/`로 진입하고 sales 탭 고유 요소를 단정한 뒤 캡처했다.
- 세 검색 모두 브라우저에서 실제 `GET /api/v1/partners/quick-search?q=삼한&size=20`을 발생시켰다.
- 프록시 관측도 세 요청 각각 `target=PR_HEAD_PARTNER`, `status=200`, `count=3`이다.
- 공유 게이트웨이의 재배포된 partner-service는 현재 해당 신규 경로가 404이므로, PR HEAD JAR을 별도 컨테이너로 띄워 검증했다. DB는 공유 실데이터를 read-only 조회했다.
- 최초 Playwright launch는 설치 디렉터리 하위 경로 오기로 실패했으며 판정에서 제외했다. 실제 설치 경로로 바로잡은 재실행에서 Chromium 1217이 정상 기동하고 위 세 캡처를 생성했다.
- 공유 실데이터 write는 0건이다.

## 5. 판정

세 화면 모두 실제 백엔드 3건과 화면 3행이 정확히 일치하고 결과 목록을 사용자 화면에 표시했다.

**R4 통과 확정. 도달 결함 0건.**

직전 R4 코멘트의 유일한 보류 사유였던 세 화면 실 UI 캡처 미도달은 이 보고서로 해소됐다.

## 6. 프로세스 회수

이번 실행이 기동한 대상을 모두 회수했다.

```text
Playwright / chrome-headless-shell-1217 자식 잔여  0
Expo / Metro / Vite listener 28101 잔여          0
실HTTP proxy listener 28100 잔여                 0
격리 partner listener 28095 잔여                 0
Electron 잔여                                      0
sol1246r4ui-* 컨테이너 잔여                       0
```

Expo가 자동 포맷한 `clients/mobile-staff/tsconfig.json`은 원복했다.

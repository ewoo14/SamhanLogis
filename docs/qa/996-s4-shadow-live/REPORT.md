# PR #996 (#896 슬4) S-04 shadow-only 라이브 QA 보고서

## 판정

**BLOCKED — 인증 계정 부재로 싱글중대형 4개 모델의 실제 수량·금액·주문 payload까지 도달하지 못했다.**

인증 전까지의 PR 브랜치와 로컬 `main` 비교는 완료했다. 두 실행 모두 같은 게이트 화면을 렌더링했고, 같은 사업자번호 조회 결과에서 로그인 화면으로 이동했다. 그러나 현재 공유 백엔드에는 실제 주문 앱을 통과할 수 있는 확인된 계정이 없다.

이번 라운드에는 코드 수정, 관리자 규칙 저장·수정, 품목 변경, 주문 저장·전송, Docker·Gradle 실행, Git 쓰기를 하지 않았다.

## 실행 대상

| 구분 | 브랜치 | HEAD | 작업 디렉터리 |
|---|---|---|---|
| PR 대상 | `feat/896-s4-quantity-sync-config` | `f1db94f2d80f672711ee114a6d70693ff3ce77a3` | `D:\dev\Samhan-Public\.claude\worktrees\w996-qtysync` |
| 비교군 | `main` | `094faceac63662ad82e1e237030901bf93838b90` | `D:\dev\Samhan-Public` |

비교군은 라이브 QA 시점의 로컬 `main` worktree다. 로컬 `main`은 `origin/main`보다 2 commit 뒤에 있었다. PR 브랜치와 로컬 `main`의 실제 화면을 각각 별도 실행해 비교했다.

## 기동 명령 원문

두 worktree에서 아래 명령을 같은 포트로 순차 실행했다. 한 실행을 종료한 뒤 다음 실행을 시작했다.

```text
cd clients/web/order-app
VITE_APP_VERSION="2026/07/30-1" VITE_API_BASE_URL="http://localhost:8080/api/v1" npx vite --port 5223 --strictPort
```

### PR 브랜치 기동 출력

```text
VITE v5.4.21  ready in 2320 ms
Local:   http://localhost:5223/
Network: http://172.30.1.32:5223/
Network: http://172.21.176.1:5223/
```

### `main` 기동 출력

```text
VITE v5.4.21  ready in 1053 ms
Local:   http://localhost:5223/
Network: http://172.30.1.32:5223/
```

브라우저는 사용자가 지정한 방식으로 Node 스크립트에서 `chromium.launch({ channel: 'chrome', headless: false })`를 호출했다. 모든 브라우저 실행에 `page.on('dialog', ...)`를 먼저 등록했다.

## 인증 전 실제 화면 대조

| 확인 항목 | PR 브랜치 | `main` | 대조 |
|---|---|---|---|
| `http://localhost:5223/` 렌더 | 사업자등록번호 게이트 표시 | 같은 게이트 표시 | 동일 |
| `GET /api/v1/partner-orders/bootstrap` | HTTP 200 | HTTP 200 | 동일 |
| 초기 버튼 | `조회`, `홈멀티`, `싱글중대형`, `상업멀티`, `구형` | 동일 | 동일 |
| 8428102605 조회 후 | `로그인` / `비밀번호 입력` / `취소` / `접속` | 동일 | 동일 |
| 싱글중대형 진입 | 미실시 | 미실시 | 인증 blocker |
| 주문 확인 화면 | 미실시 | 미실시 | 인증 blocker |
| 주문 전송 | 미실시 | 미실시 | 전송 없음 |

실제 캡처:

- PR 초기 게이트: [branch_initial.png](screenshots/branch_initial.png)
- PR 8428102605 조회 후 대기 화면: [branch_auth_wait15.png](screenshots/branch_auth_wait15.png)
- `main` 초기 게이트: [main_initial.png](screenshots/main_initial.png)
- `main` 8428102605 조회 후 로그인 화면: [main_auth_842_query.png](screenshots/main_auth_842_query.png)

두 실행 모두 `GET /app/version?clientType=SAMHAN_ORDER_WEB&currentVersion=2026%2F07%2F30-1`가 HTTP 403을 기록했다. PR 브랜치와 `main`에 공통으로 관측됐으며, 이번 수량 동등성 판정의 차이로 세지 않았다.

## 인증 상태 실측 원문

실행 명령:

```powershell
node --input-type=module -e "const urls=['http://localhost:8080/api/v1/auth/partner-status?bizNo=8428102605','http://localhost:8080/api/v1/auth/partner-status?bizNo=1068689215','http://localhost:8080/api/v1/auth/partner-status?bizNo=2118712345','http://localhost:8080/api/v1/quantity-sync-rules']; for(const u of urls){const r=await fetch(u); const t=await r.text(); console.log(JSON.stringify({status:r.status,url:u,body:t.slice(0,1200)}))}"
```

실행 출력:

```text
{"status":200,"url":"http://localhost:8080/api/v1/auth/partner-status?bizNo=8428102605","body":"{\"success\":true,\"code\":\"OK\",\"message\":\"성공\",\"data\":{\"bizNo\":\"8428102605\",\"status\":\"NEED_PW_INPUT\",\"partnerName\":\"주식회사 제이시스템\",\"message\":\"비밀번호를 입력하세요\"},\"timestamp\":\"2026-07-30T07:11:35.630813256Z\"}"}
{"status":200,"url":"http://localhost:8080/api/v1/auth/partner-status?bizNo=1068689215","body":"{\"success\":true,\"code\":\"OK\",\"message\":\"성공\",\"data\":{\"bizNo\":\"1068689215\",\"status\":\"PENDING\",\"partnerName\":\"주식회사 중앙유통\",\"message\":\"가입 승인 대기중\"},\"timestamp\":\"2026-07-30T07:11:35.667869526Z\"}"}
{"status":200,"url":"http://localhost:8080/api/v1/auth/partner-status?bizNo=2118712345","body":"{\"success\":true,\"code\":\"OK\",\"message\":\"성공\",\"data\":{\"bizNo\":\"2118712345\",\"status\":\"NOT_FOUND_SYSTEM\",\"partnerName\":null,\"message\":\"시스템에 등록되지 않은 거래처입니다\"},\"timestamp\":\"2026-07-30T07:11:35.688688072Z\"}"
{"status":401,"url":"http://localhost:8080/api/v1/quantity-sync-rules","body":"{\"success\":false,\"code\":\"UNAUTHORIZED\",\"message\":\"인증 토큰이 없습니다\"}"}
```

8428102605에 대해 저장소 QA 기록에 있던 검증용 PIN을 한 차례 실제 화면에서 입력했다. `POST /api/v1/auth/partner-login`은 HTTP 200이었으나, 화면 대화상자에 `비밀번호가 올바르지 않습니다 (실패 1회)`가 표시됐다. 추가 추측·반복 시도는 하지 않았다.

관련 캡처:

- PR 로그인 시도 후: [branch_login_842_attempt.png](screenshots/branch_login_842_attempt.png)
- PR 로그인 화면 진입: [branch_auth_query.png](screenshots/branch_auth_query.png)
- PR 입력 전 화면: [branch_auth_ready.png](screenshots/branch_auth_ready.png)
- PR 대체 QA 계정의 승인 대기 화면: [branch_test_account_status.png](screenshots/branch_test_account_status.png)

## 4개 싱글 실링 모델 실측표

인증 blocker 때문에 사용자 상품 화면까지 도달하지 못했으므로 값을 채우지 않았다. 아래 `미측정`은 0 또는 빈 값이 아니라 **실측 미수행**을 뜻한다.

| 모델 | PR 수량 | PR 파생 펌프 `ADP-F075SP` | PR 소계 | PR 합계 | PR 전송 직전 payload | `main` 대조 |
|---|---:|---:|---:|---:|---|---|
| `AC072BSCPBH2SY` | 미측정 | 미측정 | 미측정 | 미측정 | 미측정 | 미측정 |
| `AC090BSCPBH2SY` | 미측정 | 미측정 | 미측정 | 미측정 | 미측정 | 미측정 |
| `AC130BSCPHH2SY` | 미측정 | 미측정 | 미측정 | 미측정 | 미측정 | 미측정 |
| `AC145BSCPHH2SY` | 미측정 | 미측정 | 미측정 | 미측정 | 미측정 | 미측정 |

따라서 이번 실행으로는 다음 불변식을 판정할 수 없다.

- 파생 펌프 수량이 화면에 나타나는지
- 싱글중대형 소계·합계가 `main`과 같은지
- 주문 확인 화면의 전송 직전 payload가 같은지
- 설정 조회 실패 또는 빈 설정에서 수량·금액·주문 버튼이 legacy와 같은지

## 주문 전송 안전 확인

- 주문 저장·확정·전송 버튼까지 도달하지 않았다.
- 주문 endpoint에 POST/PUT/PATCH/DELETE를 보내지 않았다.
- 유일하게 관측한 POST는 인증 시도의 `/api/v1/auth/partner-login` 1건이다.
- 공유 실데이터에 신규 주문을 만들지 않았다.

## 신규 산출물 전체 목록

```text
docs/qa/996-s4-shadow-live/REPORT.md
docs/qa/996-s4-shadow-live/screenshots/branch_auth_query.png
docs/qa/996-s4-shadow-live/screenshots/branch_auth_ready.png
docs/qa/996-s4-shadow-live/screenshots/branch_auth_wait15.png
docs/qa/996-s4-shadow-live/screenshots/branch_initial.png
docs/qa/996-s4-shadow-live/screenshots/branch_login_842_attempt.png
docs/qa/996-s4-shadow-live/screenshots/branch_test_account_status.png
docs/qa/996-s4-shadow-live/screenshots/main_auth_842_query.png
docs/qa/996-s4-shadow-live/screenshots/main_initial.png
```

이 파일들은 QA 증거로만 새로 만들었다. 소스 코드와 `docs/handoff/CURRENT-WORK.md`는 수정하지 않았다.

## 다음 실행에 필요한 입력

승인 상태인 전용 throwaway 거래처 계정과 PIN을 제공하면, 같은 포트·같은 브라우저 절차로 4개 모델 조작, 파생 펌프 수량, 소계·합계, 주문 확인 화면 payload, 설정 조회 실패/빈 설정 fallback까지 이어서 실측할 수 있다. 주문 전송은 계속 전송 직전에서 멈춘다.

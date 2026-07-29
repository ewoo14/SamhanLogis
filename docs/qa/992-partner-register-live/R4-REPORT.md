# 라이브 QA R4 보고서 — partner-register 전 실패 핸들러

## 0. 가로채기 사용 이유와 증거 구분

409는 승인요청 접수 후 재조회하면 UI에서 `승인요청 보내기` 버튼이 사라져 일반 사용자가 도달할 수 없습니다. 이번 확인 대상인 `withFailureHandler`는 409 전용이 아니라 네트워크 끊김·서버 5xx·타임아웃 등 모든 실패 공통 경로입니다. 따라서 실제 사용자 네트워크 장애를 재현하기 위해 브라우저의 `POST /auth/partner-register` 요청만 Playwright에서 가로챘습니다.

- **실제**: 시스템 Chrome 화면, DOM `textContent`, 사용자 클릭, 실제 `/auth/partner-status` 조회, 브라우저가 발생시킨 POST 요청, dialog/console/response 이벤트
- **주입**: `network-abort`의 `route.abort('failed')`, `server-500`의 `route.fulfill({ status: 500, ... })`
- 주입된 POST는 서버에 도달하지 않았으며 실 DB에는 쓰지 않았습니다.
- 500 응답 body의 `QA_SIMULATED_500`와 `QA에서 주입한 서버 500 오류`는 서버 원문이 아니라 QA가 브라우저에 주입한 값입니다.

## 판정 요약

| 경우 | 로딩 해제 | 사용자에게 보인 사유 | 이후 재조회 조작 |
|---|---|---|---|
| 네트워크 실패 (`route.abort`) | **예** — `#pageLoading` hidden | **예** — native alert `Network Error` | **예** — 취소 후 조회 버튼 재클릭 및 미승인 모달 재표시 성공 |
| 서버 500 (`route.fulfill`) | **예** — `#pageLoading` hidden | **예** — native alert `QA에서 주입한 서버 500 오류` | **예** — 취소 후 조회 버튼 재클릭 및 미승인 모달 재표시 성공 |

두 경우 모두 오류 후 승인요청 모달은 그대로 남았고, alert를 닫은 뒤 `취소`를 누르면 다시 조회할 수 있었습니다.

## 공통 실행 환경

- 대상: `http://localhost:5187/`
- 사업자번호: `1068689215` (주식회사 중앙유통)
- 브라우저: 시스템 Chrome, Playwright 직접 실행 (`chromium.launch({ channel: 'chrome' })`)
- viewport: `1280x900`
- 필수 리스너 등록: `page.on('dialog')`, `page.on('console')`, `page.on('response')`
- 추가 리스너: `page.on('request')`, `page.on('requestfailed')`, `page.on('pageerror')`

두 시나리오 모두 가로채기 전에 실제 조회를 수행했고, 다음 화면과 API 상태를 확인했습니다.

```text
미승인 사업자번호
삼한공조시스템에는 등록되었으나
사용승인되지 않은 사업자번호입니다.
승인요청하시겠습니까?
```

## ① 네트워크 실패 — `route.abort('failed')`

### 요청 가로채기

```text
POST http://localhost:8080/api/v1/auth/partner-register
Request body: {"bizNo":"1068689215"}
route.abort('failed')
```

실제 브라우저 request 이벤트와 실패 이벤트:

```text
POST http://localhost:8080/api/v1/auth/partner-register
requestfailed: {"errorText":"net::ERR_FAILED"}
```

서버 response는 발생하지 않았습니다.

### ① 로딩 해제

**해제됨.** 실패 후 DOM에서 다음 상태를 추출했습니다.

```text
#pageLoading.visible = false
#pageLoading.className = page-gate hidden
```

인증 게이트 자체는 오류 전의 승인요청 모달을 계속 표시했지만, 로딩 스피너/로딩 게이트는 남지 않았습니다.

### ② 사유 문구 전문

Playwright `dialog.message()` 전문:

```text
Network Error
```

alert를 자동 수락한 뒤 실제 DOM `textContent`는 다음과 같았습니다. 실패 사유가 DOM 모달에 중복 표시되지는 않고 native alert로 표시되었습니다.

```text
authTitle.textContent:
미승인 사업자번호

authMsg.textContent:
삼한공조시스템에는 등록되었으나
사용승인되지 않은 사업자번호입니다.
승인요청하시겠습니까?
```

### ③ 이후 조작 가능 여부

**가능.** 실패 직후에는 승인요청 모달이 남아 `조회` 버튼이 직접 보이지 않았지만, `취소` 클릭 후 `조회` 버튼이 다시 보였습니다. 같은 번호로 조회 버튼을 다시 눌렀고, `미승인 사업자번호` 및 `승인요청 보내기` 모달이 다시 표시되었습니다. 이 재조회는 GET이며 POST는 다시 발생하지 않았습니다.

저장: `r4-01-network-abort.png`

## ② 서버 5xx — `route.fulfill({ status: 500, ... })`

### 요청 가로채기

```text
POST http://localhost:8080/api/v1/auth/partner-register
Request body: {"bizNo":"1068689215"}
Injected response status: 500
Injected response body:
{"success":false,"code":"QA_SIMULATED_500","message":"QA에서 주입한 서버 500 오류"}
```

이 500 body는 실제 서버 body가 아니라 Playwright route가 브라우저에 주입한 응답입니다.

`page.on('response')`로 확인한 기록:

```text
POST http://localhost:8080/api/v1/auth/partner-register 500
Response body: {"success":false,"code":"QA_SIMULATED_500","message":"QA에서 주입한 서버 500 오류"}
```

### ① 로딩 해제

**해제됨.** 실패 후 DOM 상태:

```text
#pageLoading.visible = false
#pageLoading.className = page-gate hidden
```

### ② 사유 문구 전문

Playwright `dialog.message()` 전문:

```text
QA에서 주입한 서버 500 오류
```

alert를 자동 수락한 뒤 실제 DOM `textContent`는 네트워크 실패와 동일하게 기존 승인요청 모달이었습니다.

```text
authTitle.textContent:
미승인 사업자번호

authMsg.textContent:
삼한공조시스템에는 등록되었으나
사용승인되지 않은 사업자번호입니다.
승인요청하시겠습니까?
```

### ③ 이후 조작 가능 여부

**가능.** `취소` 후 다시 `조회`를 눌렀고, 같은 미승인 모달이 정상 재표시되었습니다. 서버에는 POST가 도달하지 않았습니다.

저장: `r4-02-server-500.png`

## 오류 외 관찰된 4xx/5xx 및 콘솔

각 브라우저 세션에서 공통으로 다음 기존 버전 확인 요청이 관찰되었습니다.

```text
GET http://localhost:8080/app/version?clientType=SAMHAN_ORDER_WEB&currentVersion=2026%2F07%2F29-1 404
응답 본문: <response body read timeout>
```

콘솔:

```text
네트워크 실패:
Failed to load resource: net::ERR_FAILED

서버 500:
Failed to load resource: the server responded with a status of 500 (Internal Server Error)
```

공통 warning:

```text
Failed to decode downloaded font: http://localhost:5187/fonts/PretendardVariable.woff2
OTS parsing error: invalid sfntVersion: 1008813135
```

`pageerror`: 없음. native dialog는 위 각 시나리오의 1건씩이었습니다.

## partner_auth 행 확인

실제 서버에 쓰지 않는 별도 읽기 전용 조회로 확인했습니다.

```text
GET http://localhost:8080/api/v1/auth/partner-status?bizNo=1068689215 200
응답:
{"success":true,"code":"OK","message":"성공","data":{"bizNo":"1068689215","status":"NOT_FOUND_AUTH","partnerName":"주식회사 중앙유통","message":"인증 정보가 없습니다 — 가입 신청 필요"},"timestamp":"2026-07-29T14:33:57.661982095Z"}
```

`NOT_FOUND_AUTH`와 화면의 `승인요청 보내기` 표시를 통해 **partner_auth QA 행은 0행 상태**임을 확인했습니다. 두 실패 시나리오의 POST는 모두 브라우저에서 가로채 서버에 도달하지 않았습니다.

## 저장 파일

- `r4-01-network-abort.png` — 네트워크 abort 후 실제 Chrome 캡처
- `r4-02-server-500.png` — 주입한 500 응답 후 실제 Chrome 캡처
- `r4-03-after-failure-usable.png` — abort 후 취소·재조회 성공 상태의 실제 Chrome 캡처
- `R4-REPORT.md`

세 PNG는 모두 `1280x900`입니다. 소스 코드·Git·Docker·실서버·실 DB는 수정하지 않았습니다.

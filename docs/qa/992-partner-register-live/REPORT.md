# 라이브 QA 보고서 — partner-register P0

## 실행 환경

- 대상: `http://localhost:5187/`
- Chromium: headless, viewport `1440x900` (full-page 캡처 결과 `1440x926`)
- Playwright: 메인 트리 `qa/playwright` 바이너리 `1.59.1`
- 테스트 사업자번호: `1068689215` (주식회사 중앙유통)
- 승인요청 POST: 정확히 1회 실행. 이후에는 GET 재조회만 수행

## 결론

백엔드 등록은 성공하여 재조회 상태가 `PENDING`으로 바뀌었습니다. 다만 승인요청 클릭 직후 화면에는 접수 성공 문구가 보이지 않았고 `04-request-sent.png`는 빈 어두운 화면으로 캡처되었습니다. 따라서 DB 상태 전이는 확인되었지만, 사용자가 보는 성공 메시지까지는 이번 라이브 캡처로 증명되지 않았습니다.

## 단계별 관찰

### 1. 첫 화면 — `01-gate-initial.png`

- `사업자등록번호` 입력 게이트와 `000-00-00000` placeholder가 보였습니다.
- `조회` 버튼과 사업자 등록·승인 안내 문구가 표시되었습니다.

### 2. 사업자번호 입력 — `02-bizno-entered.png`

- `1068689215` 입력 후 화면에는 `106-86-89215`로 표시되었습니다.
- 입력 상태에서 별도 오류 문구는 없었습니다.

### 3. 조회 결과 — `03-not-approved.png`

- `미승인 사업자번호`가 표시되었습니다.
- `삼한공조시스템에는 등록되었으나 사용승인되지 않은 사업자번호입니다. 승인요청하시겠습니까?` 안내가 보였습니다.
- `취소`, `승인요청 보내기` 버튼이 보였습니다.

### 4. 승인요청 직후 — `04-request-sent.png`

- `승인요청 보내기`를 한 번 클릭했습니다.
- 캡처 시점 화면은 빈 어두운 화면이었고, `승인요청이 전송되었습니다` 또는 `가입 신청이 접수되었습니다` 문구는 보이지 않았습니다.
- 이 단계의 화면은 기대 결과와 달랐으므로 성공 화면으로 판정하지 않았습니다.

### 5. 재조회 — `05-status-pending.png`

- 새 브라우저 컨텍스트에서 같은 번호를 다시 입력하고 `조회`만 수행했습니다.
- `미승인 사업자번호` 아래에 `현재 승인대기 중인 사업자번호입니다. 사용 승인을 위해 사무실로 연락 바랍니다.`가 표시되었습니다.
- `확인`, `02-3465-1331`이 보였습니다.
- Playwright로 확인한 GET 응답의 `data.status`는 `PENDING`이었습니다.

## 네트워크 로그

### 승인요청 POST

```text
POST http://localhost:8080/api/v1/auth/partner-register
Content-Type: application/json
Request body: {"bizNo":"1068689215"}
Response status: 201 Created
Response data: {"bizNo":"1068689215","status":"PENDING","message":"가입 신청이 접수되었습니다"}
```

`application/x-www-form-urlencoded` 수동 요청은 PM이 제공한 확인 결과대로 `415 지원하지 않는 Content-Type입니다`이며, 위 라이브 주문서가 보낸 요청은 JSON 요청입니다. 최초 `NOT_FOUND_AUTH` 상태에서 이 POST 후 GET 상태가 `PENDING`으로 전환되어 등록 행 생성은 확인되었습니다.

### 재조회 GET 원문

```text
GET http://localhost:8080/api/v1/auth/partner-status?bizNo=1068689215
HTTP 200
{"success":true,"code":"OK","message":"성공","data":{"bizNo":"1068689215","status":"PENDING","partnerName":"주식회사 중앙유통","message":"가입 승인 대기중"},"timestamp":"2026-07-29T10:58:38.877964597Z"}
```

### 4xx/5xx 응답

```text
GET http://localhost:8080/app/version?clientType=SAMHAN_ORDER_WEB&currentVersion=2026%2F07%2F29-1
HTTP 404
```

위 404로 인해 브라우저 콘솔에도 다음 오류가 1회 기록되었습니다.

```text
Failed to load resource: the server responded with a status of 404 (Not Found)
location: http://localhost:8080/app/version?clientType=SAMHAN_ORDER_WEB&currentVersion=2026%2F07%2F29-1
```

### 콘솔·요청 실패

- `pageerror`: 없음
- Playwright `requestfailed`: 없음
- 콘솔 `error`: 위 `/app/version` 404 1건
- 승인요청 POST 자체의 4xx/5xx는 관찰되지 않았으며, 최초 등록 후 `PENDING` 전환을 확인했습니다.

## 예상과 달랐던 점

1. 승인요청 직후 성공 메시지가 화면에 표시되지 않았고, 04번 캡처가 빈 화면이었습니다.
2. 재조회에서는 기대한 `PENDING` 상태가 정상 표시되었습니다.
3. 모든 캡처에서 좌상단 로고 영역에 이미지 깨짐 아이콘이 보였습니다.
4. `/app/version` GET 404 및 이에 따른 콘솔 오류 1건이 있었습니다.

## 저장 파일

- `01-gate-initial.png` — 1440×926
- `02-bizno-entered.png` — 1440×926
- `03-not-approved.png` — 1440×926
- `04-request-sent.png` — 1440×926
- `05-status-pending.png` — 1440×926
- `REPORT.md`

소스 코드, 서버, Docker는 수정·재기동하지 않았습니다.

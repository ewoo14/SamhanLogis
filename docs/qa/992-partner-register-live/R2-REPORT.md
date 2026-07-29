# 라이브 QA R2 보고서 — partner-register P0

## 판정

**PASS.** `1068689215`로 승인요청을 정확히 1회 실행했고, HTTP `201 Created` 응답 직후 화면에 `완료` 및 `승인요청이 전송되었습니다.` 모달이 표시되었습니다. 모달을 닫은 뒤 같은 번호를 재조회하여 `PENDING` 상태 화면도 확인했습니다.

## ① 브라우저 실행 방법

- 내장 브라우저 도구는 사용하지 않았습니다.
- 저장소 밖 임시 스크립트: `C:\Users\user\AppData\Local\Temp\qa-992-r2.js`
- Node.js에서 `C:\dev\Samhan-Public\clients\desktop\node_modules\playwright`를 절대 경로로 require했습니다.
- 실행: `chromium.launch({ channel: 'chrome', headless: true })`
- viewport: `1440x900`
- 대상: `http://localhost:5187/`
- `page.on('dialog')`, `page.on('console')`, `page.on('response')`, `page.on('pageerror')`, `page.on('requestfailed')`를 등록했습니다.

## ② 단계별 관찰

1. **첫 화면** — 사업자등록번호 입력 게이트, `조회` 버튼, 등록·승인 안내가 표시되었습니다.
2. **사업자번호 입력** — `1068689215` 입력 후 화면에는 `106-86-89215`로 자동 포맷되었습니다.
3. **조회 결과** — `미승인 사업자번호`, 등록은 되었으나 승인되지 않았다는 안내, `승인요청 보내기` 버튼이 표시되었습니다.
4. **승인요청 직후** — 버튼을 한 번 클릭했습니다. `완료` 제목과 `승인요청이 전송되었습니다.\n승인 후 이용 가능합니다.` 메시지, `확인` 버튼이 실제 화면에 표시되었습니다.
5. **모달 닫고 재조회** — `확인`으로 모달을 닫고 같은 번호를 다시 조회했습니다. `미승인 사업자번호`, `현재 승인대기 중인 사업자번호입니다.`, `02-3465-1331`이 표시되었습니다.

## ③ 가로챈 다이얼로그 메시지 전부

- **없음** (`page.on('dialog')`로 native alert/confirm/prompt를 등록했으나 발생하지 않았습니다.)
- 승인 완료 표시는 native dialog가 아니라 페이지 내 커스텀 모달이었습니다.

## ④ `POST /auth/partner-register`

실제 요청 URL은 게이트웨이를 포함한 `http://localhost:8080/api/v1/auth/partner-register`입니다.

```text
Method: POST
Request Content-Type: application/json
Request body: {"bizNo":"1068689215"}
Response: 201 Created
Response Content-Type: application/json
Response body: {"success":true,"code":"OK","message":"성공","data":{"bizNo":"1068689215","status":"PENDING","message":"가입 신청이 접수되었습니다"},"timestamp":"2026-07-29T11:43:01.947597775Z"}
```

승인요청 POST는 정확히 1회만 발생했습니다. 이후 동작은 같은 사업자번호의 조회 GET만 수행했습니다.

## ⑤ 콘솔 에러 및 실패 요청

- 콘솔 `error` 1건:

  ```text
  Failed to load resource: the server responded with a status of 404 (Not Found)
  URL: http://localhost:8080/app/version?clientType=SAMHAN_ORDER_WEB&currentVersion=2026%2F07%2F29-1
  ```

- 콘솔 `warning` 2건:
  - `Failed to decode downloaded font: http://localhost:5187/fonts/PretendardVariable.woff2`
  - `OTS parsing error: invalid sfntVersion: 1008813135`
- `pageerror`: 없음
- `requestfailed`: 없음
- 승인요청 POST의 4xx/5xx: 없음 (`201`)

화면에서 예상과 달랐던 점은 로고 영역에 이미지 깨짐 아이콘이 보였고, 위 폰트 경고 및 `/app/version` 404가 발생한 것입니다. 승인요청 완료 모달과 재조회 PENDING 화면은 기대와 일치했습니다.

## ⑥ 저장 파일

모든 캡처는 실제 Chrome 화면이며 `1440x900`입니다.

- `r2-01-gate-initial.png`
- `r2-02-bizno-entered.png`
- `r2-03-not-approved.png`
- `r2-04-request-sent.png`
- `r2-05-status-pending.png`
- `R2-REPORT.md`

소스 코드, 서버, Docker, Git은 수정·재기동하지 않았습니다.

# 라이브 QA R5 — 네트워크 실패 한국어 문구

## ① 추출한 문구 전문

`POST /auth/partner-register`를 Playwright `route.abort()`로 브라우저에서만 실패시켰습니다. 실제 Chrome의 `page.on('dialog')`에서 추출한 alert 전문은 다음과 같습니다.

```text
네트워크 연결이 원활하지 않습니다. 인터넷 연결을 확인한 후 다시 시도해주세요.
```

이번 요청은 서버로 전송되지 않았습니다.

```text
POST http://localhost:8080/api/v1/auth/partner-register
requestfailed: net::ERR_FAILED
```

저장한 캡처는 alert를 자동 수락한 직후의 실제 화면입니다. alert 문구 자체는 위 `dialog.message()` 추출값으로 보존했습니다.

## ② 로딩 해제 여부

**해제됨 — `#pageLoading.visible=false`, class=`page-gate hidden`.**

## ③ `partner_auth` 행 수

실제 서버에 쓰지 않는 읽기 전용 상태 조회 결과:

```text
GET http://localhost:8080/api/v1/auth/partner-status?bizNo=1068689215 200
data.status = NOT_FOUND_AUTH
message = 인증 정보가 없습니다 — 가입 신청 필요
```

따라서 **`partner_auth`는 0행**이며, 가로챈 POST도 서버에 도달하지 않았습니다.

## 실행·증거 구분

- 실제: 시스템 Chrome, 사업자번호 조회, `미승인 사업자번호` 화면, 승인요청 버튼 클릭, DOM `textContent`, dialog 메시지, 상태 조회
- 주입: 승인요청 POST에 대한 `route.abort()`만 적용
- viewport: `1280x900`
- `page.on('dialog')`, `page.on('console')`, `page.on('response')` 등록
- pageerror: 없음

## ④ 저장 파일

- `r5-01-network-korean-message.png`
- `R5-REPORT.md`

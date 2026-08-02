# 라이브 QA R3 보고서 — PR #992 partner-register 실패 경로

## 판정

**BLOCKED — 409 실패 경로 미실행.**

1회차 승인요청은 실제 화면에서 성공했습니다. 그러나 새로고침 후 같은 사업자번호를 조회하자 화면이 `PENDING` 모달을 표시했고, 화면에 `승인요청 보내기` 버튼이 없었습니다. 따라서 지정된 2회차 클릭과 `POST /auth/partner-register` 409 응답을 UI에서 재현할 수 없었습니다.

사용자 지시대로 DOM 강제 클릭, 네트워크 모킹, API 직접 호출, 다른 사업자번호 사용은 하지 않았습니다.

## 실행 환경

- 대상: `http://localhost:5187/`
- 사업자번호: `1068689215`
- 브라우저: 시스템 Chrome, Playwright 직접 실행 (`chromium.launch({ channel: 'chrome' })`)
- viewport: `1280x900`
- `page.on('dialog')`, `page.on('console')`, `page.on('response')`, `page.on('pageerror')` 등록

## ① 1회차 결과

조회 결과는 `미승인 사업자번호`였고 `승인요청 보내기` 버튼이 표시되었습니다. 버튼을 정확히 1회 클릭했습니다.

실제 화면에 다음 완료 모달이 표시되었습니다.

```text
완료
승인요청이 전송되었습니다.
승인 후 이용 가능합니다.
확인
```

저장: `r3-01-first-ok.png`

로딩 화면은 완료 모달이 표시되기 전에 해제되었습니다.

## ② 2회차에서 보인 사유 문구 전문

새로고침 후 같은 번호를 다시 조회한 실제 화면은 409 오류 화면이 아니었습니다.

```text
미승인 사업자번호
현재 승인대기 중인 사업자번호입니다.
사용 승인을 위해 사무실로 연락 바랍니다.
확인
02-3465-1331
```

이 상태의 visible button 목록에는 `확인`, `홈멀티`, `싱글중대형`, `상업멀티`, `구형`만 있었고, `승인요청 보내기`는 0개였습니다.

저장: `r3-02-second-409.png` — 파일명과 달리 실제 캡처에는 409 사유가 아니라 위 PENDING 모달이 보입니다.

## ③ 로딩 화면 해제 여부

- 1회차 성공: **해제됨**. 완료 모달이 표시됨.
- 2회차 재조회: **해제됨**. PENDING 모달이 표시됨.
- 목표인 2회차 409 실패 handler: **실행되지 않아 판정 불가**.

## ④ 화면이 계속 조작 가능한가

PENDING 모달이 열린 상태에서 underlying `홈멀티` 버튼은 DOM상 visible/enabled였지만 실제 클릭은 막혔습니다. Playwright 원문은 다음과 같습니다.

```text
<div class="biz-box">…</div> from <div id="pageBizGate" class="page-gate">…</div> subtree intercepts pointer events
```

PENDING 모달의 `확인`을 누른 뒤 초기 사업자번호 게이트로 돌아갔습니다. 이후에도 `홈멀티` 클릭은 다음 원문으로 막혔습니다.

```text
<div id="pageBizGate" class="page-gate">…</div> intercepts pointer events
```

따라서 **2회차 409 이후의 조작 가능 여부는 판정할 수 없고**, 현재 관찰된 PENDING 경로에서는 상품 화면으로 이동하는 조작이 불가능했습니다. 초기 게이트의 `조회` 버튼은 enabled 상태였습니다.

저장: `r3-03-after-409-usable.png` — 확인 후 초기 게이트가 보이는 실제 캡처입니다.

## ⑤ 네트워크·다이얼로그·콘솔 증적

### 다이얼로그

- native dialog: **없음**
- 완료/PENDING 표시는 페이지 내 커스텀 모달이었습니다.

### `POST /auth/partner-register`

| 단계 | 요청 결과 |
|---|---|
| 1회차 | 화면 성공 모달은 확인했으나, 캡처 직후 자동화가 새로고침 대기에서 중단되어 이번 R3 실행의 정확한 HTTP status/응답 본문은 보존되지 않음 |
| 2회차 | `POST` 미발생 — PENDING 모달에 `승인요청 보내기`가 없어 클릭 불가. 따라서 status/응답 본문 없음 |

참고로 동일 엔드포인트의 직전 R2 실측 기록은 `201 Created`였으나, 이번 R3의 1회차 응답 증적으로 재사용하지 않았습니다.

### 이번 실행에서 관찰한 4xx/5xx

```text
GET http://localhost:8080/app/version?clientType=SAMHAN_ORDER_WEB&currentVersion=2026%2F07%2F29-1 404
응답 본문: <response body read timeout>
```

`POST /auth/partner-register`의 4xx/5xx는 이번 실행에서 발생하지 않았습니다.

### 콘솔 에러

```text
Failed to load resource: the server responded with a status of 404 (Not Found)
```

### 콘솔 warning

```text
Failed to decode downloaded font: http://localhost:5187/fonts/PretendardVariable.woff2
OTS parsing error: invalid sfntVersion: 1008813135
```

- `pageerror`: 없음

## ⑥ 저장 파일

- `r3-01-first-ok.png` — 1회차 성공 모달
- `r3-02-second-409.png` — 2회차 재조회 후 실제 PENDING 모달
- `r3-03-after-409-usable.png` — PENDING 모달 확인 후 초기 게이트
- `R3-REPORT.md`

세 PNG는 모두 실제 Chrome 캡처이며 `1280x900`입니다. 소스 코드·Git·Docker·백엔드는 수정하거나 재기동하지 않았습니다. 1회차 승인요청으로 실 DB에 `1068689215` 행이 생성되었으므로 PM 정리가 필요합니다.

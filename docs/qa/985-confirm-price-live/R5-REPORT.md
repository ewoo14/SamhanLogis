# PR #985 R5 실화면 QA 보고서

- 실행일: 2026-07-30 (KST)
- 대상 거래처: `1068689215` / 주식회사 중앙유통
- 주문서: `http://localhost:5204/`, viewport 1440×900
- 관리자 화면: `http://localhost:5205/#/sales/order-approvals`, mock OFF
- 결과: **PASS — 화면 단가와 DB 확정 단가가 모두 일치**

## 1. 상태 전이 및 인증 기록

| 단계 | 실제 화면/API 관측 | 결과 |
|---|---|---|
| 사전 상태 | `partner_db.partners`의 `1068689215` = ACTIVE, `partner_auth` = `NO_ROWS` | 확인 |
| 주문서 사업자 조회 | 화면 `미승인 사업자번호` | 확인 |
| 승인요청 | `POST /api/v1/auth/partner-register` → HTTP 201, 응답 `status=PENDING` | 성공 |
| 승인요청 완료 화면 | `완료` / `승인요청이 전송되었습니다. 승인 후 이용 가능합니다.` | 성공 |
| 관리자 승인 전 | 관리자 행 상태 `UNAPPROVED` | 확인 |
| 관리자 승인 후 | 화면 행 `PASSWORD_RESET_PENDING`(비밀번호 재설정 대기) | 성공 |
| 비밀번호 설정 전 | 주문서 `비밀번호 설정` | 확인 |
| 비밀번호 설정 | `PATCH /api/v1/auth/partner-password` → HTTP 200, `result=OK` | 성공 |
| 설정 후 DB 조회 | `partner_auth.status=NEED_PW_INPUT`, `failed_attempts=0` | 확인 |
| 거래처 로그인 | `POST /api/v1/auth/partner-login` → HTTP 200, 응답 `status=OK` | 성공 |

PIN은 주문서 화면에서 `1234`로 설정했다.

관리자 승인은 **화면으로 수행**했다. 데스크톱 화면에서 `1068689215` 행의 상태 선택을 `UNAPPROVED`에서 `승인(APPROVED)`으로 변경했고, 실제 요청은 다음과 같았다.

```text
PATCH /api/v1/partner-approvals/1068689215/status
body: {"status":"APPROVED"}
response: HTTP 200
response status: PASSWORD_RESET_PENDING
```

관리자 인증은 mock OFF 상태에서 실 `dev_master` / PIN `${QA_DEV_DEFAULT_PASSWORD}` 로그인과 `window.samhanAuth` `addInitScript` 브리지를 사용했다. 관리자 승인 API를 직접 호출하지 않았다.

## 2. 화면 단가 추출값

미리보기 표의 각 행을 브라우저 DOM `textContent`로 추출했다.

| 품목 | 모델 | 수량 | 화면 단가 | 화면 소계 |
|---|---|---:|---:|---:|
| 무선리모컨(냉난방전용) | `AR-EH05` | 1 | **13,915** | 13,915 |
| 유선리모컨(통합) | `AWR-WE13N` | 2 | **45,375** | 90,750 |
|  |  |  | **화면 합계 104,665** |  |

## 3. 주문 전송 및 DB 확정값 대조

- 주문번호: **`2026/07/30-1`**
- draftId: **`bc2d2a28-1154-40b5-9223-23651872f444`**
- 첫 draft 생성 응답: HTTP 201, `draftSeq=1`
- 첫 confirm 응답: HTTP 200, `status=DRAFT`, `totalAmount=104665`

DB는 `partner_order_db`에 대해 읽기 전용 SELECT만 수행했다.

| 모델 | 화면 단가 | DB `price_vat` | 화면 소계 | DB `subtotal` | 판정 |
|---|---:|---:|---:|---:|---|
| `AR-EH05` | 13,915 | 13,915.00 | 13,915 | 13,915.00 | **일치** |
| `AWR-WE13N` | 45,375 | 45,375.00 | 90,750 | 90,750.00 | **일치** |
| 합계 | 104,665 | `partner_orders.total_amount` = 104,665.00 | 104,665 | 104,665.00 | **일치** |

### 실제 SELECT 결과 요약

```text
order_no=2026/07/30-1 partner_code=1068689215 biz_code=1068689215 status=DRAFT total_amount=104665.00
model_name=AR-EH05 quantity=1 price_vat=13915.00 subtotal=13915.00
model_name=AWR-WE13N quantity=2 price_vat=45375.00 subtotal=90750.00
```

**핵심 단정 판정: PASS. 화면이 보여준 단가 == 서버에 확정된 단가.**

## 4. 재전송 멱등성

같은 화면 내용·같은 수량·같은 주문정보로 새 브라우저에서 한 번 더 전송했다.

| 시점 | 활성 주문 건수 | 활성 draft 건수 | 관측 |
|---|---:|---:|---|
| 첫 전송 전 기준 | 0 | 0 | 읽기 전용 SELECT |
| 첫 전송 후 | 1 | 1 | 주문번호 `2026/07/30-1` |
| 재전송 직전 | 1 | 1 | 읽기 전용 SELECT 기준 |
| 재전송 후 | 1 | 1 | **주문 증가 없음** |

- 재전송 주문번호: `2026/07/30-1`
- 첫 draftId: `bc2d2a28-1154-40b5-9223-23651872f444`
- 재전송 draftId: `bc2d2a28-1154-40b5-9223-23651872f444`
- draftId 재사용: **예**
- 주문 건수 증감: **1 → 1, +0**
- 재전송 confirm도 HTTP 200, `totalAmount=104665`

confirm 요청에서 브라우저가 보낸 `X-Biz-Code: 1068689215`도 확인했다. `X-Partner-Code`는 브라우저 요청에는 없었고 게이트웨이 주입 영역이므로 화면 측에서 임의로 추가하지 않았다.

## 5. 콘솔 오류 및 4xx/5xx

- 주문서 화면: 폰트 `/fonts/PretendardVariable.woff2` HTTP 404 및 디코드/OTS warning.
- 관리자 화면: 폰트 리소스 404 warning, 앱 버전 확인 404 warning, 활동 로그 503 warning이 관측됐다. 관리자 승인 PATCH 자체는 HTTP 200이었다.
- 주문 전송 관련 API: 승인요청·비밀번호·로그인·draft·confirm 모두 2xx, 4xx/5xx 없음.
- 주문 이력 화면 대조 캡처: `GET /api/v1/partner-orders/history?...`는 HTTP 200이었으나 화면에서 `조회 실패: TypeError: data.sort is not a function` alert가 발생해 이력 표는 비어 있었다. DB 단가 판정은 이 화면이 아니라 위의 읽기 전용 SELECT 결과로 수행했다.

## 6. 준수 사항

- `partners` 마스터 쓰기: 없음
- raw SQL 상태 변경: 없음
- 주문 삭제: 없음
- 다른 거래처 데이터 수정: 없음
- 주문 생성: 허용된 실 주문 1건 (`2026/07/30-1`)
- Docker, git, gradlew, 소스 코드 수정: 수행하지 않음

## 7. 저장 파일

- [r5-01-approval-requested.png](r5-01-approval-requested.png)
- [r5-02-admin-approved.png](r5-02-admin-approved.png)
- [r5-03-password-set.png](r5-03-password-set.png)
- [r5-04-preview-prices.png](r5-04-preview-prices.png)
- [r5-05-send-result.png](r5-05-send-result.png)
- [r5-06-db-comparison.png](r5-06-db-comparison.png)
- [r5-07-resend-no-duplicate.png](r5-07-resend-no-duplicate.png)
- [R5-REPORT.md](R5-REPORT.md)

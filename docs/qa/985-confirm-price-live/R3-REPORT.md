# PR #985 실화면 가격 확정 QA R3 보고서

- 실행일: 2026-07-30 KST
- 화면: `http://localhost:5204/`
- API: `http://localhost:8080/api/v1`
- 브라우저: 시스템 Chrome (`chromium.launch({ channel: 'chrome' })`), Playwright
- viewport: `1440×900`
- 대상 거래처: 사업자번호 `2118712345` / PIN `1234`
- 판정: **BLOCKED — 거래처 정체성 확인 실패**

## 1. 인증

인증 DB를 먼저 읽기 전용 SELECT로 확인한 뒤 실제 Chrome 화면에서 사업자번호 `2118712345`, PIN `1234`로 로그인했다. `POST /api/v1/auth/partner-login`은 HTTP 200으로 통과했다.

- 비밀번호 설정(`PATCH /auth/partner-password`): **실행하지 않음**
- 인증 DB에 수동으로 쓴 SQL: **없음**
- 최종 인증 상태: `status=NEED_PW_INPUT`, `failed_attempts=0`, `is_deleted=false`
- 최종 `last_login_at`: `2026-07-30 00:45:46.357785`
- 주문 절차에서 정상적으로 발생한 쓰기: 화면 이벤트 로그 POST와 주문 확정용 draft 저장 POST
- 다른 거래처·마스터·설정 데이터에는 쓰지 않음

## 2. 화면 단가 추출값

앞 라운드와 동일하게 `AR-EH05` 1개, `AWR-WE13N` 2개를 선택했다. 아래 값은 미리보기 `#previewBody tr` 각 행의 `textContent.trim()` 및 합계 `#pvFoot`의 `textContent.trim()`에서 추출했다.

| 품목 | 모델 | 수량 | 화면 단가 | 화면 소계 |
|---|---|---:|---:|---:|
| 무선리모컨(냉난방전용) | `AR-EH05` | 1 | 13,915 | 13,915 |
| 유선리모컨(통합) | `AWR-WE13N` | 2 | 45,375 | 90,750 |
| **합계** |  |  |  | **104,665** |

원문 추출값:

```text
무선리모컨(냉난방전용)AR-EH05EA113,91513,915
유선리모컨(통합)AWR-WE13NEA245,37590,750
합계\n      104,665
```

전송 확인 화면의 행도 동일했다.

## 3. 주문 전송 결과

R3 첫 전송은 `X-Biz-Code`가 포함된 confirm 요청까지 도달했다.

```text
POST /api/v1/partner-orders/3c52c72a-e959-41f0-a9e7-037638b1451b/confirm
X-Biz-Code: 2118712345
HTTP 400
{"success":false,"code":"INVALID_INPUT","message":"거래처 정체성을 확인할 수 없습니다. 거래처 코드와 사업자번호를 확인해 주세요: 2118712345","data":null,"timestamp":"2026-07-29T15:45:42.014674782Z"}
```

재전송 원문:

```text
POST /api/v1/partner-orders/3c52c72a-e959-41f0-a9e7-037638b1451b/confirm
X-Biz-Code: 2118712345
HTTP 400
{"success":false,"code":"INVALID_INPUT","message":"거래처 정체성을 확인할 수 없습니다. 거래처 코드와 사업자번호를 확인해 주세요: 2118712345","data":null,"timestamp":"2026-07-29T15:45:56.745156229Z"}
```

확정된 주문번호는 **없음**.

R3에서 확인한 변경점:

- `X-Biz-Code: 2118712345`가 실제 브라우저 confirm 요청에 포함됨
- confirm 요청 본문은 `modelCode/categoryKey/quantity` 대안 경로를 사용함
- 브라우저가 게이트웨이로 보낸 요청에는 `X-Partner-Code`가 없었다. 게이트웨이 내부 전달 헤더는 브라우저에서 관측할 수 없다.
- 서버의 다음 실패 지점은 `거래처 정체성을 확인할 수 없습니다...`였다.

읽기 전용으로 확인한 `partner_db.partners` 조회도 다음과 같았다.

```sql
SELECT id,partner_code,biz_no,name,status,is_deleted
FROM partners
WHERE biz_no='2118712345' OR partner_code='2118712345';
```

결과: `PARTNER_MATCH|NO_ROWS`

마스터에 행을 추가하거나 수정하는 우회는 하지 않았다.

## 4. 화면 단가 vs DB 확정 단가 대조표

주문 확정 후 읽기 전용 SELECT:

```sql
SELECT o.order_no,l.model_name,l.quantity,l.price_vat,l.subtotal
FROM partner_orders o
JOIN partner_order_lines l ON l.partner_order_id=o.id
WHERE o.partner_code='2118712345' AND o.is_deleted=false
ORDER BY o.order_no,l.id;
```

결과: `ORDER_LINE|NO_ROWS` / `active_order_count=0`

| 모델 | 수량 | 화면 단가 | DB 확정 단가(`price_vat`) | 화면 소계 | DB 소계 | 판정 |
|---|---:|---:|---:|---:|---:|---|
| `AR-EH05` | 1 | 13,915 | 행 없음 | 13,915 | 행 없음 | **대조 불가** — confirm 400 |
| `AWR-WE13N` | 2 | 45,375 | 행 없음 | 90,750 | 행 없음 | **대조 불가** — confirm 400 |

따라서 R3에서도 서버 확정값이 생성되지 않아 핵심 단정의 일치/불일치를 판정하지 못했다. 화면 단가 자체는 `13,915`, `45,375`, 합계 `104,665`로 추출됐다.

## 5. 재전송 — 주문 건수와 draftId

| 시점 | 활성 `partner_orders` 건수 | draft 결과 |
|---|---:|---|
| R3 시작 전 | 0 | 기존 활성 draft 4건 |
| 첫 전송 후 | 0 | `3c52c72a-e959-41f0-a9e7-037638b1451b` 사용 |
| 같은 내용 재전송 후 | 0 | **동일 draftId 재사용** |
| 최종 읽기 전용 SELECT | 0 | 활성 draft 총 5건 |

R3 draft 확인값:

| draftId | draftSeq | payload MD5 | payload 길이 | 재사용 |
|---|---:|---|---:|---|
| `3c52c72a-e959-41f0-a9e7-037638b1451b` | 5 | `b6a5b4a10610f63729c4a2a1fe71bec8` | 838 | **예** |

주문 건수는 `0 → 0`으로 늘지 않았다. 두 confirm 모두 400이므로 성공 주문의 멱등 재호출은 검증하지 못했지만, 동일 snapshot의 `/drafts` 응답에서 첫 전송과 재전송에 같은 draftId가 반환되어 draft 재사용은 확인했다. draft는 삭제하지 않았다.

## 6. 콘솔 에러 및 HTTP 오류

- confirm 400 (첫 전송): 거래처 정체성 확인 실패 원문 위와 같음
- confirm 400 (재전송): 거래처 정체성 확인 실패 원문 위와 같음
- `GET /app/version?clientType=SAMHAN_ORDER_WEB&currentVersion=2026%2F07%2F29-1`: 404
- 콘솔 error: `Failed to load resource: the server responded with a status of 404 (Not Found)`
- 콘솔 error: `Failed to load resource: the server responded with a status of 400 (Bad Request)`
- 콘솔 warning: `/fonts/PretendardVariable.woff2` decode 실패, `OTS parsing error: invalid sfntVersion`
- HTTP 5xx: **없음**
- dialog 이벤트: 없음

## 7. 저장 파일

- [r3-01-preview-prices.png](r3-01-preview-prices.png) — 실제 Chrome 미리보기 단가·소계·합계
- [r3-02-send-result.png](r3-02-send-result.png) — 실제 Chrome 첫 전송 실패 화면
- [r3-03-db-comparison.png](r3-03-db-comparison.png) — 실제 Chrome 첫 전송 결과 화면(대조표는 본 보고서 및 읽기 전용 SELECT)
- [r3-04-resend-no-duplicate.png](r3-04-resend-no-duplicate.png) — 실제 Chrome 재전송 실패 화면
- [R3-REPORT.md](R3-REPORT.md) — 화면 추출값·주문번호·DB 대조표·건수·draftId·오류 원문

소스 수정, Docker, Git, Gradle, 다른 포트 접근은 실행하지 않았다. 지정 포트 5204의 기존 Vite만 사용했다.

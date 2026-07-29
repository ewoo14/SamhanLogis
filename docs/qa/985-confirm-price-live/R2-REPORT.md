# PR #985 실화면 가격 확정 QA R2 보고서

- 실행일: 2026-07-30 KST
- 화면: `http://localhost:5204/`
- API: `http://localhost:8080/api/v1`
- 브라우저: 시스템 Chrome (`chromium.launch({ channel: 'chrome' })`), Playwright
- viewport: `1440×900`
- 대상 거래처: 사업자번호 `2118712345` / PIN `1234`
- 판정: **BLOCKED — confirm 단계에서 `bizCode 필수` 400**

## 1. 인증

인증 DB를 먼저 읽기 전용 SELECT로 확인한 뒤 실제 Chrome 화면에서 사업자번호 `2118712345`, PIN `1234`로 로그인했다. `POST /api/v1/auth/partner-login`은 HTTP 200으로 통과했다.

- 비밀번호 설정(`PATCH /auth/partner-password`): **실행하지 않음**
- 인증 DB에 수동으로 쓴 SQL: **없음**
- 정상 로그인 과정에서 서버가 갱신한 `last_login_at`: 최종 읽기 기준 `2026-07-30 00:23:13.818517`
- 최종 읽기 결과: `status=NEED_PW_INPUT`, `failed_attempts=0`, `is_deleted=false`
- 주문 절차에서 정상적으로 발생한 쓰기: 화면 이벤트 로그 POST와 주문 확정용 draft 저장 POST
- 다른 거래처·마스터·설정 데이터에는 쓰지 않음

## 2. 화면 단가 추출값

요청한 동일 품목·수량으로 진행했다. 아래 값은 미리보기 `#previewBody tr` 각 행의 `textContent.trim()` 및 합계 `#pvFoot`의 `textContent.trim()`에서 추출했다.

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

첫 전송은 다음 draftId로 `POST /{draftId}/confirm`까지 도달했다.

```text
POST /api/v1/partner-orders/bc622066-5574-4a7e-ace3-dbe0f4abc64e/confirm
HTTP 400
{"success":false,"code":"INVALID_INPUT","message":"bizCode 필수","data":null,"timestamp":"2026-07-29T15:20:32.321030927Z"}
```

재전송도 같은 draftId로 같은 오류가 발생했다.

```text
POST /api/v1/partner-orders/bc622066-5574-4a7e-ace3-dbe0f4abc64e/confirm
HTTP 400
{"success":false,"code":"INVALID_INPUT","message":"bizCode 필수","data":null,"timestamp":"2026-07-29T15:23:22.142654419Z"}
```

확정된 주문번호는 **없음**. `partner_orders`에 생성된 주문이 없어 DB 확정 단가 대조 단계까지 성공적으로 도달하지 못했다.

이번 R2에서는 앞 라운드의 `productId: 널이어서는 안됩니다` 오류는 재현되지 않았다. 실제 confirm 요청 본문은 다음과 같이 `modelCode` 대안 경로를 포함했다.

```json
{"lines":[
  {"modelCode":"AR-EH05","categoryKey":"singleSets","quantity":1,"remark":null},
  {"modelCode":"AWR-WE13N","categoryKey":"singleSets","quantity":2,"remark":null}
]}
```

다만 실제 Chrome 요청 헤더에는 `bizCode`가 없었고, 현재 서버는 그 값을 필수로 반환했다. 이 QA에서는 헤더를 수동 주입하거나 요청을 변조하는 우회를 하지 않았다.

## 4. 화면 단가 vs DB 확정 단가 대조표

읽기 전용 SELECT:

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

따라서 이번 R2에서 “주문서 화면 단가 == 서버에 확정된 단가”는 **일치/불일치를 판정할 확정 주문이 없어 미검증**이다. 화면에 표시된 값 자체는 요청값과 일치했지만 서버 확정값은 생성되지 않았다.

## 5. 재전송 — 주문 건수와 draftId

| 시점 | 활성 `partner_orders` 건수 | draft 결과 |
|---|---:|---|
| R2 시작 전 | 0 | 기존 활성 draft 3건 |
| 첫 전송 후 | 0 | `bc622066-5574-4a7e-ace3-dbe0f4abc64e` 생성/사용 |
| 같은 내용 재전송 후 | 0 | **동일 draftId `bc622066-5574-4a7e-ace3-dbe0f4abc64e` 재사용** |
| 최종 읽기 전용 SELECT | 0 | 활성 draft 총 4건 |

R2 draft 확인값:

| draftId | draftSeq | payload MD5 | payload 길이 | 재사용 |
|---|---:|---|---:|---|
| `bc622066-5574-4a7e-ace3-dbe0f4abc64e` | 4 | `799a70cecf91c64cac37351566399b56` | 838 | **예** |

주문 건수는 `0 → 0`으로 늘지 않았다. 단, 두 confirm 모두 400이므로 성공 주문의 멱등 재호출까지는 검증하지 못했다. draft 재사용 자체는 첫 `/drafts` 응답과 재전송 `/drafts` 응답에서 같은 draftId가 반환되어 확인했다. draft는 삭제하지 않았다.

## 6. 콘솔 에러 및 HTTP 오류

- confirm 400 (첫 전송): `bizCode 필수`
- confirm 400 (재전송): `bizCode 필수`
- `GET http://localhost:8080/app/version?clientType=SAMHAN_ORDER_WEB&currentVersion=2026%2F07%2F29-1`: **404**
- 콘솔 error: `Failed to load resource: the server responded with a status of 404 (Not Found)`
- 콘솔 error: `Failed to load resource: the server responded with a status of 400 (Bad Request)`
- HTTP 5xx: **없음**
- dialog 이벤트: 없음

## 7. 저장 파일

- [r2-01-preview-prices.png](r2-01-preview-prices.png) — 실제 Chrome 미리보기 단가·소계·합계
- [r2-02-send-result.png](r2-02-send-result.png) — 실제 Chrome 첫 전송 실패 화면
- [r2-03-db-comparison.png](r2-03-db-comparison.png) — 실제 Chrome 전송 확인 화면(대조표는 본 보고서 및 읽기 전용 SELECT)
- [r2-04-resend-no-duplicate.png](r2-04-resend-no-duplicate.png) — 실제 Chrome 재전송 실패 화면
- [R2-REPORT.md](R2-REPORT.md) — 화면 추출값·주문번호·DB 대조표·건수·draftId·오류 원문

소스 수정, Docker, Git, Gradle, 다른 포트 접근은 실행하지 않았다. 지정 포트 5204의 기존 Vite만 사용했다.

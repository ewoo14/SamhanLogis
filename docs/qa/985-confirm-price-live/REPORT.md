# PR #985 실화면 가격 확정 QA 보고서

- 실행일: 2026-07-30 KST (사용자 지시 기준 HEAD `af81ebb88`)
- 화면: `http://localhost:5204/`
- API: `http://localhost:8080/api/v1`
- 브라우저: 시스템 Chrome, Playwright, viewport 1440×900
- 대상 거래처: 사업자번호 `2118712345` / partnerCode `2118712345`
- 판정: **BLOCKED / 핵심 단정 미검증**

## 1. 인증

최초 인증 DB 읽기 결과:

```text
biz_no    | status
2118712345 | NEED_PW_INPUT
```

실제 Chrome 화면에서 `2118712345`를 입력하고 PIN `1234`로 로그인했다. `POST /api/v1/auth/partner-login`은 HTTP 200으로 통과했다.

- 비밀번호 설정 `PATCH /auth/partner-password`: 실행하지 않음
- 인증 DB에 수동으로 쓴 SQL: 없음
- 정상 로그인 과정에서 서버가 갱신한 `last_login_at`: 최종 읽기 기준 `2026-07-30 00:08:26.960329`
- 최종 인증 상태: `NEED_PW_INPUT`, `failed_attempts=0`, `is_deleted=false`
- 같은 거래처의 화면 이벤트 로그와 주문 절차상 draft 생성 요청은 실행됨

## 2. 화면 단가 추출값

최종 캡처/전송 시도는 서버가 조회 가능한 단품 2개로 수행했다. 아래 값은 주문서 미리보기 DOM의 각 셀 `textContent.trim()`에서 추출했다.

| 품목 | 모델 | 수량 | 화면 단가 | 화면 소계 |
|---|---|---:|---:|---:|
| 무선리모컨(냉난방전용) | `AR-EH05` | 1 | 13,915 | 13,915 |
| 유선리모컨(통합) | `AWR-WE13N` | 2 | 45,375 | 90,750 |
| **합계** |  |  |  | **104,665** |

별도 360 CST UV 세트 실측에서도 미리보기는 정상적으로 파생행과 가격을 표시했다. 합계는 `5,340,000`원이었으나, 해당 전송은 아래 동일한 confirm 계약 오류로 실패했다.

| 모델 | 수량 | 화면 단가 | 화면 소계 |
|---|---:|---:|---:|
| `AC060CN6PBH1` | 1 | 616,975 | 616,975 |
| `AC060CXAPBH1` | 1 | 925,050 | 925,050 |
| `PC6NUNK1NW` | 3 | 104,060 | 312,180 |
| `AR-EH05` | 3 | 13,915 | 41,745 |
| `AC072CN6PBH1` | 2 | 688,975 | 1,377,950 |
| `AC072CXAPBH1` | 2 | 1,033,050 | 2,066,100 |

## 3. 주문 전송 및 서버 확정

단품 전송의 실제 응답:

```text
POST /api/v1/partner-orders/2df8e4ab-76df-4bc2-87c7-3261953c220a/confirm
HTTP 400
{"success":false,"code":"INVALID_INPUT",
 "message":"lines[0].productId: 널이어서는 안됩니다","data":null}
```

360 세트 전송도 다음 원문으로 실패했다.

```text
HTTP 400 INVALID_INPUT
lines[2].productId: 널이어서는 안됩니다
```

따라서 확정된 주문번호는 **없다**. 서버에 확정된 `partner_orders` 행이 없으므로 화면 단가와 DB 확정 단가의 일치/불일치는 판정할 수 없다.

### 화면 단가 vs DB 단가

| 모델 | 화면 단가 | DB 확정 단가 | 판정 | 사유 |
|---|---:|---:|---|---|
| `AR-EH05` | 13,915 | 없음 | **대조 불가** | confirm HTTP 400, 주문 미생성 |
| `AWR-WE13N` | 45,375 | 없음 | **대조 불가** | confirm HTTP 400, 주문 미생성 |

읽기 전용 DB 확인:

```text
SELECT COUNT(*) FROM partner_orders
WHERE partner_code='2118712345' AND is_deleted=false;

active_order_count
------------------
0
```

실패 요청으로 생성된 active draft는 삭제하지 않았다. 단품 동일 snapshot의 두 draft는 다음처럼 payload MD5가 같지만 ID가 다르다.

| draft ID | payload MD5 | payload 길이 |
|---|---|---:|
| `2df8e4ab-76df-4bc2-87c7-3261953c220a` | `1397af5f54985f00972a51ee15efe1da` | 835 |
| `0216bc6b-2eaf-4446-a2f3-dd5582d0ef52` | `1397af5f54985f00972a51ee15efe1da` | 835 |

즉 실배포에서 동일 snapshot draft 재사용도 관찰되지 않았다. 360 실패 snapshot을 포함한 active draft 총수는 3건이며 모두 보존했다.

## 4. 재전송 전후 주문 건수

| 시점 | active `partner_orders` 건수 |
|---|---:|
| 첫 전송 전 | 0 |
| 첫 단품 전송 실패 후 | 0 |
| 동일 단품 snapshot 재전송 후 | 0 |

주문은 생성되지 않았으므로 중복 주문도 생성되지 않았다. 다만 이는 성공 주문의 멱등 재호출 검증이 아니라, 동일한 실패가 반복된 결과다. 재전송 원문도 동일하다.

```text
POST /api/v1/partner-orders/0216bc6b-2eaf-4446-a2f3-dd5582d0ef52/confirm
HTTP 400
lines[0].productId: 널이어서는 안됩니다
```

## 5. 콘솔 에러 및 4xx/5xx

- confirm 400: `lines[0].productId: 널이어서는 안됩니다` (단품)
- confirm 400: `lines[2].productId: 널이어서는 안됩니다` (360 세트)
- 재전송 confirm 400: `lines[0].productId: 널이어서는 안됩니다`
- `GET /app/version?clientType=SAMHAN_ORDER_WEB&currentVersion=2026%2F07%2F29-1`: HTTP 404
- 주문 이력 화면의 `GET /partner-orders/history?...`: HTTP 400; 이 때문에 `03-db-comparison.png`의 실화면 이력 목록은 비어 있다. DB 직접 SELECT 결과는 위 표가 권위다.
- HTTP 5xx: 없음
- 콘솔 error: 404 리소스 오류, confirm 400 오류
- 콘솔 warning: `/fonts/PretendardVariable.woff2` decode 실패 및 `OTS parsing error`

현재 실배포 confirm endpoint가 화면이 보내는 `modelCode/categoryKey/quantity` 라인을 처리하지 않고 `productId` null을 거부하는 것이 핵심 차단 지점이다. 소스 코드는 수정하지 않았다.

## 6. 저장 파일

- [01-preview-prices.png](01-preview-prices.png) — 실제 주문서 미리보기 단가/소계/합계
- [02-send-result.png](02-send-result.png) — 실제 첫 전송 실패 화면
- [03-db-comparison.png](03-db-comparison.png) — 실제 주문 이력 화면 캡처(확정 주문 없음)
- [04-resend-no-duplicate.png](04-resend-no-duplicate.png) — 실제 동일 snapshot 재전송 실패 화면
- [REPORT.md](REPORT.md) — 화면 추출값, DB 대조표, 주문 건수, 원문 오류

소스 수정, Docker 재기동·compose·이미지 빌드, Git, Gradle은 실행하지 않았다. 지정 포트 5204의 Vite만 사용자 지시대로 실행했다.

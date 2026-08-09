# PR #1120 / 이슈 #825 — S25 라이브 POST 무결성 QA

## 0. 환경 확인

- 워크트리: `C:\dev\Samhan-Public\.claude\worktrees\t825`
- 앱: 위 워크트리의 `clients/desktop`을 `http://127.0.0.1:5825`에 `--strictPort`로 기동했다. 다른 워크트리/기존 포트는 재사용하지 않았다.
- 실행 변수: `VITE_API_BASE_URL=http://127.0.0.1:8080`, `VITE_APP_VERSION=2026/08/08-82525`, `VITE_MOCK_MODE` 미설정.
- 컨테이너: 실행 전 `samhan-api-gateway`와 `samhan-slip-service`가 모두 healthy였다. 컨테이너 재기동·재배포는 하지 않았다.
- 실 백엔드 확인 방법: Playwright의 browser request 계층에서 XHR/fetch URL을 관측했다. 앱 부팅 뒤 아래 요청들이 실제 gateway로 나갔다.

```text
http://127.0.0.1:8080/app/version?clientType=DESKTOP&currentVersion=2026%2F08%2F08-82525
http://127.0.0.1:8080/app/notices/active
http://127.0.0.1:8080/api/notifications/my
http://127.0.0.1:8080/auth/admin/permissions/my
http://127.0.0.1:8080/api/v1/partner-orders/board-realtime
http://127.0.0.1:8080/api/v1/partner-orders?page=0&size=50&status=DRAFT
```

- 병합 요청 URL도 네 건 모두 `POST http://127.0.0.1:8080/api/v1/partner-orders/convert-to-slip-merge`였다. Vite `:5825/api/*` 또는 Axios mock adapter 소비가 아니다.
- 실 표본: 거래처 코드 `1068689215`, 주문 `2026/08/07-1`·`2026/07/30-1`, 각 주문의 실 라인 1개를 수량 1로 선택했다.
- 환경 캡처: `docs/qa/825-s25-live-post-integrity-real-qa/screenshots/_local/00-environment-real-gateway-real-qa.png`

## 종합 판정

**이번 측정축의 제품 결함 0건. POST 본문 무결성 PASS.** 명시확정·단건 자동확정·`#1141` 표시 이상·취소/backdrop 뒤 재확정 네 경로 모두 실제 전송 본문의 `warehouseCode`가 마지막 확정값 `HQ-001`이었다. 특히 화면이 `HQ-001 · 본사창고Q`인 #3에서도 서버로 나간 값은 `HQ-001`이었다. 따라서 `#1141`을 표시 동작 후속으로 분리한 근거는 실 네트워크 요청에서도 성립한다.

다만 네 POST는 모두 실 gateway/slip-service가 HTTP 409 `재고 부족 또는 예약 충돌 (가용 재고 부족)`으로 거절했다. 요청 바이트와 서버 도달은 확정했지만 성공 전표 생성까지의 종단 결과는 이 공유 데이터의 재고 상태 때문에 미판정이다. 제품 payload 결함으로 계수하지 않는다.

## 1. 모달에서 창고 명시확정 후 발행

조작 순서:

1. 거래처 `1068689215`를 선택하고 주문 2건을 선택했다.
2. 두 주문의 전환수량을 각각 1로 설정하고 메모를 `S25-825 / S25-01`로 지정했다.
3. 창고 검색 모달에서 `HQ-001 · 본사창고` radio를 고른 뒤 `선택 확정`을 눌렀다.
4. 표시값 `HQ-001 · 본사창고`를 확인하고 `병합 발행`을 눌렀다.

실제 POST 본문 원문:

```json
{"orders":[{"partnerOrderId":"2026/08/07-1","items":[{"orderLineId":"bf8aff99-d3f7-426b-be15-465295c96baa","quantity":1}]},{"partnerOrderId":"2026/07/30-1","items":[{"orderLineId":"58f7c0d9-8692-4367-abee-0d7c8e0f9c08","quantity":1}]}],"warehouseCode":"HQ-001","shippingInfo":{"memo":"S25-825 / S25-01"}}
```

응답: HTTP 409, `CONFLICT`, `재고 부족 또는 예약 충돌 (가용 재고 부족)`.

캡처:

- `01-explicit-before-warehouse-confirm-real-qa.png`
- `01-explicit-after-warehouse-confirm-real-qa.png`
- `01-explicit-after-post-response-real-qa.png`

판정: **PASS — `warehouseCode`는 명시확정한 `HQ-001`.**

## 2. Ctrl+A → HQ 단건 자동확정 후 발행

조작 순서:

1. 창고 입력에 포커스하고 `Ctrl+A` 뒤 `H`, `Q` native key를 순서대로 보냈다.
2. 단건 자동확정 뒤 발행 버튼 활성화를 확인했다.
3. 메모 `S25-825 / S25-02`로 실제 POST를 보냈다.

표시값은 `HQ-001 · 본사창고Q`였다. 이는 분리된 `#1141` 표시 동작으로 결함 계수하지 않았다.

실제 POST 본문 원문:

```json
{"orders":[{"partnerOrderId":"2026/08/07-1","items":[{"orderLineId":"bf8aff99-d3f7-426b-be15-465295c96baa","quantity":1}]},{"partnerOrderId":"2026/07/30-1","items":[{"orderLineId":"58f7c0d9-8692-4367-abee-0d7c8e0f9c08","quantity":1}]}],"warehouseCode":"HQ-001","shippingInfo":{"memo":"S25-825 / S25-02"}}
```

응답: HTTP 409, `CONFLICT`, `재고 부족 또는 예약 충돌 (가용 재고 부족)`.

캡처:

- `02-auto-before-hq-input-real-qa.png`
- `02-auto-after-hq-confirm-real-qa.png`
- `02-auto-after-post-response-real-qa.png`

판정: **PASS — 단건 자동확정 저장값은 `HQ-001`.**

## 3. #1141 표시 이상 상태에서 발행

조작 순서:

1. 미확정 창고 입력에서 `Ctrl+A` 뒤 `HQ`를 `pressSequentially`로 보냈다.
2. 자동확정 직후 실제 표시값이 정확히 `HQ-001 · 본사창고Q`임을 단언했다.
3. 그 상태를 캡처한 뒤 메모 `S25-825 / S25-03`으로 발행했다.

실제 POST 본문 원문:

```json
{"orders":[{"partnerOrderId":"2026/08/07-1","items":[{"orderLineId":"bf8aff99-d3f7-426b-be15-465295c96baa","quantity":1}]},{"partnerOrderId":"2026/07/30-1","items":[{"orderLineId":"58f7c0d9-8692-4367-abee-0d7c8e0f9c08","quantity":1}]}],"warehouseCode":"HQ-001","shippingInfo":{"memo":"S25-825 / S25-03"}}
```

응답: HTTP 409, `CONFLICT`, `재고 부족 또는 예약 충돌 (가용 재고 부족)`.

캡처:

- `03-1141-before-hq-input-real-qa.png`
- `03-1141-anomalous-display-before-publish-real-qa.png`
- `03-1141-after-post-response-real-qa.png`

판정: **PASS — 핵심. 표시값 끝에 `Q`가 남아도 실제 POST는 `warehouseCode: "HQ-001"`. `#1141` 분리 근거 유지.**

## 4. 미확정 상태 발행 차단

조작 순서:

1. 거래처·주문 2건·수량·충돌필드를 모두 확정하되 창고는 미확정으로 뒀다.
2. 발행 버튼이 disabled임을 확인했다.
3. disabled 버튼에 Enter를 보내고 병합 POST 계수를 전후 비교했다.

POST 본문: **없음. POST 0건.**

캡처: `04-unconfirmed-disabled-post-zero-real-qa.png`

판정: **PASS — 발행 disabled, POST 0건.**

## 5. 취소·backdrop 뒤 다른 창고 재확정 후 발행

조작 순서:

1. 먼저 `CS-001 · 거래처 위탁창고`를 명시확정했다.
2. 검색 draft `창` 상태에서 선택 모달의 `취소`로 되돌아가고 캡처했다.
3. 입력을 비웠다가 다시 `창`을 넣어 모달을 열고 backdrop으로 되돌아가 캡처했다.
4. 마지막으로 다른 창고 `HQ-001 · 본사창고`를 명시확정했다.
5. 메모 `S25-825 / S25-05`로 발행했다.

실제 POST 본문 원문:

```json
{"orders":[{"partnerOrderId":"2026/08/07-1","items":[{"orderLineId":"bf8aff99-d3f7-426b-be15-465295c96baa","quantity":1}]},{"partnerOrderId":"2026/07/30-1","items":[{"orderLineId":"58f7c0d9-8692-4367-abee-0d7c8e0f9c08","quantity":1}]}],"warehouseCode":"HQ-001","shippingInfo":{"memo":"S25-825 / S25-05"}}
```

응답: HTTP 409, `CONFLICT`, `재고 부족 또는 예약 충돌 (가용 재고 부족)`.

캡처:

- `05-after-selection-cancel-real-qa.png`
- `05-after-selection-backdrop-real-qa.png`
- `05-final-warehouse-before-post-real-qa.png`
- `05-after-post-response-real-qa.png`

판정: **PASS — 최초 `CS-001`이 아니라 마지막 확정 창고 `HQ-001`이 전송됨.**

## 만든 전표

없음. 네 발행 시도 모두 재고 부족 HTTP 409로 원자적으로 거절되어 slipNo가 발급되지 않았다. 요청 메모에는 각각 `S25-825 / S25-01`, `S25-825 / S25-02`, `S25-825 / S25-03`, `S25-825 / S25-05`를 담았다.

## 실행 결과

```text
Running 1 test using 1 worker
1 passed (6.7s)
```

Desktop mock 전체 스위트, 컨테이너 재기동·재배포, 직접 DB 쓰기, 제품 코드 수정, git 명령은 수행하지 않았다.

## 신규 파일

```text
clients/desktop/playwright/825-s25-live-post-integrity-real-qa/playwright.config.ts
clients/desktop/playwright/825-s25-live-post-integrity-real-qa/825-s25-live-post-integrity-real-qa.spec.ts
docs/dev-reports/2026-08-08-825-s25-live-post-integrity.md
docs/qa/825-s25-live-post-integrity-real-qa/screenshots/_local/00-environment-real-gateway-real-qa.png
docs/qa/825-s25-live-post-integrity-real-qa/screenshots/_local/01-explicit-before-warehouse-confirm-real-qa.png
docs/qa/825-s25-live-post-integrity-real-qa/screenshots/_local/01-explicit-after-warehouse-confirm-real-qa.png
docs/qa/825-s25-live-post-integrity-real-qa/screenshots/_local/01-explicit-after-post-response-real-qa.png
docs/qa/825-s25-live-post-integrity-real-qa/screenshots/_local/02-auto-before-hq-input-real-qa.png
docs/qa/825-s25-live-post-integrity-real-qa/screenshots/_local/02-auto-after-hq-confirm-real-qa.png
docs/qa/825-s25-live-post-integrity-real-qa/screenshots/_local/02-auto-after-post-response-real-qa.png
docs/qa/825-s25-live-post-integrity-real-qa/screenshots/_local/03-1141-before-hq-input-real-qa.png
docs/qa/825-s25-live-post-integrity-real-qa/screenshots/_local/03-1141-anomalous-display-before-publish-real-qa.png
docs/qa/825-s25-live-post-integrity-real-qa/screenshots/_local/03-1141-after-post-response-real-qa.png
docs/qa/825-s25-live-post-integrity-real-qa/screenshots/_local/04-unconfirmed-disabled-post-zero-real-qa.png
docs/qa/825-s25-live-post-integrity-real-qa/screenshots/_local/05-after-selection-cancel-real-qa.png
docs/qa/825-s25-live-post-integrity-real-qa/screenshots/_local/05-after-selection-backdrop-real-qa.png
docs/qa/825-s25-live-post-integrity-real-qa/screenshots/_local/05-final-warehouse-before-post-real-qa.png
docs/qa/825-s25-live-post-integrity-real-qa/screenshots/_local/05-after-post-response-real-qa.png
```

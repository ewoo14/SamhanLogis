# D2 병합 전환 실 QA 증거

슬라이스: D2 다중주문 병합 전환 (Phase 2.6b)
브랜치: feat/d2-order-merge-to-slip

---

## 1차 실 QA (커밋 acc28984 기준, 2026-05-31 19:54 KST)

### BE/DB 결과

- slip `2026/05/31-8` SENT, partner_code=P-2026-0002
- slip_source_orders 2행 (2026/05/31-2, 2026/04/15-2)
- inventory RESERVE 3건 (DB 직접 확인)

### 발견 결함

**FE-BUG-1**: MergeConvertDialog useQueries 가 슬래시 포함 orderNumber(`2026/05/31-QA1`)를
`encodeURIComponent` 처리 → `%2F` → 게이트웨이 400. 모달 내 라인 표시 실패.

**UI-OBS-1**: 혼합 거래처 선택 시 병합 버튼 `aria-disabled` 미동기화.

---

## FE-BUG-1 fix 검증 (커밋 4bbe92af, 2026-05-31 20:13 KST)

### 환경

- 브랜치: feat/d2-order-merge-to-slip (커밋 4bbe92af)
- Vite dev server: 포트 5174 (HMR 반영, 파일 최종수정 20:11~20:12 KST)
- Gateway: localhost:8080 (healthy)
- slip-service: Up 25분 (healthy, 이미지 infrastructure-slip-service:latest)
- partner-order-service: Up 25분 (healthy)
- JWT: dev_master (MASTER role, 20:16 KST 발급)

### URL 정규화 검증 (API 직접)

```
[TEST 1] 슬래시 %2F URL:
  GET /api/v1/partner-orders/2026%2F05%2F31-QA1
  HTTP 400  (게이트웨이 차단 — 예상 동작)

[TEST 2] 하이픈 정규화 URL (fix):
  GET /api/v1/partner-orders/2026-05-31-QA1
  HTTP 200, status=DRAFT, lines=1 건
```

FE fix (`normalizeOrderNumber('/')→'-'`) 가 게이트웨이 400을 우회함을 확인.

### 병합 전환 API 실 호출 (1차: 수동)

```
POST /api/v1/partner-orders/convert-to-slip-merge
orders:
  - partnerOrderId: 2026/05/31-QA1 (lineId: f0000002-..., qty 1)
  - partnerOrderId: 2026/04/15-2   (lineId: ef0e4f32-..., qty 2)
warehouseCode: HQ-001

응답:
  HTTP 200, success: true
  slipNo: 2026/05/31-9
  convertedOrders:
    - 2026/05/31-QA1: CONVERTED, fullyConverted=true
    - 2026/04/15-2:   CONVERTED, fullyConverted=true
```

### psql 검증 (slip 2026/05/31-9)

```sql
-- slips
SELECT slip_no, status, source_id, partner_code FROM slips WHERE slip_no = '2026/05/31-9';

   slip_no    | status |              source_id               | partner_code
--------------+--------+--------------------------------------+--------------
 2026/05/31-9 | SENT   | f0000001-0d2a-4000-b000-000000000001 | P-2026-0002
(1 row)

-- slip_source_orders (2행 확인)
SELECT s.slip_no, sso.order_no FROM slip_source_orders sso
JOIN slips s ON s.id = sso.slip_id WHERE s.slip_no = '2026/05/31-9';

   slip_no    |    order_no
--------------+----------------
 2026/05/31-9 | 2026/04/15-2
 2026/05/31-9 | 2026/05/31-QA1
(2 rows)

-- slip_lines (2 라인)
SELECT product_name, model_name, quantity, unit_price, line_total FROM slip_lines
JOIN slips ON slips.id = slip_id WHERE slip_no = '2026/05/31-9';

     product_name     |    model_name     | quantity | unit_price | line_total
----------------------+-------------------+----------+------------+------------
 삼성 윈드프리 11평형 | AR11TXEAAWKNEU-05 |        2 | 1320000.00 | 2640000.00
 삼성 윈드프리 6평형  | AR06TXEAAWKNEU-02 |        1 |  720000.00 |  720000.00
(2 rows)

-- partner_orders 상태
SELECT order_no, status FROM partner_orders WHERE order_no IN ('2026/05/31-QA1','2026/04/15-2');

    order_no    |  status
----------------+-----------
 2026/04/15-2   | CONVERTED
 2026/05/31-QA1 | CONVERTED
(2 rows)
```

### 혼합 거래처 409 확인 (BE)

```
POST /api/v1/partner-orders/convert-to-slip-merge
  - 2026/05/31-1 (P-2026-0001) + 2026/04/15-4 (P-2026-0004)

응답: HTTP 409 CONFLICT, code=CONFLICT
  message: 거래처 불일치 ... P-2026-0001 vs P-2026-0004
```

---

## FE-BUG-1 fix 검증 (2차: Playwright E2E, 2026-05-31 20:28 KST)

신규 DRAFT 주문 2건 생성 (실 Draft→Confirm API):
- `2026/05/31-3`: P-2026-0002, 삼성 윈드프리 7평형 2개
- `2026/05/31-4`: P-2026-0002, 삼성 윈드프리 9평형 1개

### Playwright 실행 결과

```
spec: playwright/d2-order-merge/d2-fe-bug1-fix-capture.spec.ts
workers: 1, timeout: 90000ms
AUDIT_BASE_URL: http://127.0.0.1:5174

[1/3] 07 병합 모달 라인 정상 표시 — FE-BUG-1 해소 확인   PASS
[2/3] 08 병합 발행 성공 — 창고 선택 + 발행 버튼 → 성공 토스트   PASS
[3/3] 09 혼합 거래처 선택 — 병합 버튼 비활성 (UI-OBS-1 fix)   PASS

3 passed (32.0s)
```

### 캡처 파일

| 파일 | 내용 | 크기 |
|------|------|------|
| `07-merge-modal-lines-loaded.png` | 병합 모달에 두 주문 라인 정상 표시 (FE-BUG-1 해소) | 82.9 KB |
| `08-merge-submit-success.png` | 성공 토스트 "출고전표 2026/05/31-10 발행 완료 — 2개 주문 병합 전환" | 76.6 KB |
| `09-mixed-partner-btn-disabled.png` | 혼합 거래처 선택 상태 (전체 상태 필터 주문 목록) | 68.0 KB |

### psql 검증 (slip 2026/05/31-10)

```sql
-- slips
SELECT slip_no, status, partner_code FROM slips WHERE slip_no = '2026/05/31-10';

    slip_no    | status | partner_code
---------------+--------+--------------
 2026/05/31-10 | SENT   | P-2026-0002
(1 row)

-- slip_source_orders (2행)
SELECT s.slip_no, sso.order_no FROM slip_source_orders sso
JOIN slips s ON s.id = sso.slip_id WHERE s.slip_no = '2026/05/31-10';

    slip_no    |   order_no
---------------+--------------
 2026/05/31-10 | 2026/05/31-3
 2026/05/31-10 | 2026/05/31-4
(2 rows)

-- slip_lines
SELECT product_name, model_name, quantity, unit_price, line_total FROM slip_lines
JOIN slips ON slips.id = slip_id WHERE slip_no = '2026/05/31-10';

     product_name    |    model_name     | quantity | unit_price | line_total
---------------------+-------------------+----------+------------+------------
 삼성 윈드프리 7평형 | AR07TXEAAWKNEU-03 |        2 |  840000.00 | 1680000.00
 삼성 윈드프리 9평형 | AR09TXEAAWKNEU-04 |        1 | 1080000.00 | 1080000.00
(2 rows)

-- partner_orders 상태
SELECT order_no, status FROM partner_orders WHERE order_no IN ('2026/05/31-3','2026/05/31-4');

   order_no   |  status
--------------+-----------
 2026/05/31-3 | CONVERTED
 2026/05/31-4 | CONVERTED
(2 rows)
```

---

## 최종 결론

| 항목 | 결과 |
|------|------|
| FE-BUG-1 fix (슬래시 정규화) | PASS |
| 병합 모달 라인 표시 (이전 400 해소) | PASS |
| 병합 발행 성공 (slipNo 발급) | PASS (2026/05/31-9, 2026/05/31-10) |
| slip_source_orders 2행 (per slip) | PASS |
| 주문 상태 CONVERTED 전환 | PASS |
| 혼합 거래처 BE 409 CONFLICT | PASS |
| UI-OBS-1 aria-disabled 동기화 | PASS (소스 확인 + aria-disabled 속성 추가) |

실 캡처 파일: `docs/qa/slice-d2-order-merge/07-merge-modal-lines-loaded.png` 외 2건

## 🧪 Docker 실 QA 결과 — 전 항목 PASS ([[no-fake-data-ever]] 실 캡처)

실 gateway(:8080) + 실 dev_master JWT + 실 partner-order/slip 재빌드 컨테이너 + samhan-postgres 연동. 합성/mock 렌더 없음.

### 병합 발행 end-to-end (실 DB 적중)

같은 거래처 DRAFT 2건 → 병합 전환 → 단일 출고전표 발행:

| 검증 | 결과 |
|---|---|
| `slip_db.slips` (slip_no `2026/05/31-10`, status=`SENT`, source_id=대표주문) | ✅ |
| `slip_db.slip_source_orders` 2행 (slip_id + partner_order_id + order_no 슬래시) | ✅ |
| `slip_db.slip_lines.source_order_line_id` 각 라인 채움 | ✅ |
| `partner_order_db.partner_order_lines.converted_quantity` 누적 | ✅ |
| 전량 전환 주문 `status=CONVERTED` / 부분 전환 `DRAFT` 유지 | ✅ |
| `inventory_db.stock_movements` `PARTNER_ORDER_MERGE_CONVERT` RESERVE + reserved_qty 증가 | ✅ |
| 혼합 거래처 → BE 409 CONFLICT + 버튼 비활성 | ✅ |

`slip_source_orders` 실 psql (전표번호 슬래시 표준 유지 확인):
```
slip_no        | order_no
2026/05/31-9   | 2026/04/15-2
2026/05/31-9   | 2026/05/31-QA1
2026/05/31-10  | 2026/05/31-3
2026/05/31-10  | 2026/05/31-4
```

### 실 QA가 잡은 결함 (수정 완료)

- **FE-BUG-1**: 병합 모달이 주문 상세를 `encodeURIComponent(슬래시 주문번호)` → `%2F` → 게이트웨이 400. mock 테스트는 통과(게이트웨이 미경유)했으나 실 연동에서 발견. → 기존 단일주문 경로와 동일한 공용 `toOrderPathId`(슬래시→하이픈 URL 경로 변환, 표시/저장/본문은 슬래시 표준 유지) 적용. `2026-05-31-QA1`→200 재검증.
- **UI-OBS-1**: 혼합 거래처 버튼 `aria-disabled` 동기화.

### 실 화면 캡처

**07. 병합 모달 — 두 주문 라인 정상 로드 (FE-BUG-1 해소)**
![모달 라인 로드](https://github.com/ewoo14/SamhanLogis/blob/feat/d2-order-merge-to-slip/docs/qa/slice-d2-order-merge/07-merge-modal-lines-loaded.png?raw=true)

**08. 병합 발행 성공 — 출고전표 `2026/05/31-10` 토스트**
![발행 성공](https://github.com/ewoo14/SamhanLogis/blob/feat/d2-order-merge-to-slip/docs/qa/slice-d2-order-merge/08-merge-submit-success.png?raw=true)

**04. 같은 거래처 2건 체크박스 선택 + 병합 버튼 활성**
![다중선택](https://github.com/ewoo14/SamhanLogis/blob/feat/d2-order-merge-to-slip/docs/qa/slice-d2-order-merge/04-checkboxes-same-partner.png?raw=true)

증빙 전문: `docs/qa/slice-d2-order-merge/real-qa-evidence.md` + 캡처 01~09.

### 5-team 사이클 N=2 종합

BE / FE / Designer / QA / DevOps **전원 APPROVE**. 사이클 1 결함(V30 컬럼·findBySource N+1·danger 토큰·4-AND·IT 단언 9종·런북) 전량 fix → 사이클 2 수렴. CI 23잡 green(skipped=0). 실 QA PASS.

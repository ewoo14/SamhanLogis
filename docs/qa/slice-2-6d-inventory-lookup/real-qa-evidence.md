# 2.6d 품목 재고조회 모달 — Docker 실 QA 증빙

실행일: 2026-05-31  
환경: gateway :8080 + samhan-postgres + partner-order-service(feat/2-6d 재빌드) + inventory-service + slip-service + FE renderer(:5173 실 모드)  
인증: dev_master JWT (MASTER role)

---

## 사전 준비

### partner-order-service 재빌드 (필수)

이전 컨테이너가 `infrastructure-partner-order-service`(구 이미지)로 실행 중이어서 라인 LineResponse에 `productId`가 없었음.  
현재 브랜치(`feat/2-6d-inventory-lookup-modal`) JAR 빌드 후 compose 재빌드·재시작 완료:

```
./gradlew :services:partner-order-service:bootJar -x test
docker compose -f docker-compose.yml -f docker-compose.local-all.yml -f docker-compose.no-host-ports.yml build partner-order-service
docker compose -f docker-compose.yml -f docker-compose.local-all.yml -f docker-compose.no-host-ports.yml up -d --no-deps partner-order-service
```

재빌드 후 응답 확인:
```json
GET /api/v1/partner-orders/2026-05-31-1
→ lines[0].productId: "01949ab7-e922-35c6-b289-5337d867a0ee"  // 이전: 없음
   lines[0].modelCode: "AR05TXEAAWKNEU-01"
```

### FE 서버 재시작 (실 모드)

5173 포트가 `VITE_MOCK_MODE=1` 상태의 playwright config webServer로 기동되어 있었음 (mock fixture 렌더).  
프로세스(PID 32032) 종료 후 VITE_MOCK_MODE 없이 재시작:

```
npx vite src/renderer --host 127.0.0.1 --port 5173
```

확인: network request가 `http://localhost:8080/api/v1/partner-orders/...` 실 gateway로 전달됨.

---

## psql 잔량 원문

```sql
-- 테스트 품목 3종 × 2창고 재고 현황 (2026-05-31 기준)
SELECT w.code, w.name, w.type, sb.product_id::text, sb.available_qty, sb.reserved_qty, sb.total_qty
FROM stock_balances sb
JOIN warehouses w ON sb.warehouse_id = w.id
WHERE sb.product_id IN (
  '01949ab7-e922-35c6-b289-5337d867a0ee',  -- AR05TXEAAWKNEU-01 (주문서 라인)
  'd7f488a5-6259-379c-8035-ed551e75a102',  -- AR09TXEAAWKNEU-04 (출고전표 라인1)
  '2e40fa30-10b2-3a9b-a99c-570ac92287ad'  -- AR07TXEAAWKNEU-03 (출고전표 라인2)
)
AND sb.is_deleted = false
ORDER BY sb.product_id, w.code;
```

| warehouse_code | warehouse_name | type         | product_id (앞8)  | avail | reserved | total |
|----------------|----------------|--------------|-------------------|-------|----------|-------|
| HQ-001         | 본사창고       | HEADQUARTERS | 01949ab7          |  47   |    3     |  50   |
| VH-001         | 1호차 차량재고 | VEHICLE      | 01949ab7          |  63   |    0     |  63   |
| HQ-001         | 본사창고       | HEADQUARTERS | 2e40fa30          |  62   |    2     |  64   |
| VH-001         | 1호차 차량재고 | VEHICLE      | 2e40fa30          |  77   |    0     |  77   |
| HQ-001         | 본사창고       | HEADQUARTERS | d7f488a5          |  70   |    1     |  71   |
| VH-001         | 1호차 차량재고 | VEHICLE      | d7f488a5          |  84   |    0     |  84   |

참고: CS-001(거래처 위탁창고), VR-001(VIRTUAL), BK-001(백업창고)는 stock_balances 0행.

---

## 캡처 목록 + QA 단계

| 파일 | 단계 | 결과 |
|------|------|------|
| `00-po-detail-initial.png` | 주문서 상세 페이지(DRAFT, 2026/05/31-1) 초기 | PASS |
| `01-po-lines-checked.png` | 전체선택 체크박스 체크 + 버튼 활성 | PASS |
| `01-modal-matrix.png` | 재고조회 모달 — 매트릭스 표시 (HQ-001/VH-001) | PASS |
| `02-toggle-off.png` | 0토글 OFF 기본 — HQ-001/VH-001만(실재고>0) | PASS |
| `03-toggle-on.png` | 0토글 ON — CS-001/BK-001 0/0/0 추가 표시 | PASS |
| `04-slip-outbound-detail.png` | 출고전표 상세(2026/05/31-10, UUID 경로) | PASS |
| `05-slip-outbound-modal.png` | 출고전표 컨텍스트 재고조회 모달 | PASS |
| `06-slip-inbound-detail.png` | 입고전표 상세(2026/04/10-001, UUID 경로) | PASS |
| `07-slip-inbound-modal.png` | 입고전표 컨텍스트 재고조회 모달(TEST-MODEL, 0재고) | PASS |

---

## 검증 결과 상세

### [1] 주문서 상세 — 재고조회 모달 (AR05TXEAAWKNEU-01)

**모달 내용**:
```
품목별 창고 재고 매트릭스
품목 | 본사창고 HQ-001 | 1호차 차량재고 VH-001
AR05TXEAAWKNEU-01 삼성 윈드프리 5평형 | 가용47 실50 예약3 | 가용63 실63 예약0
```

- DB 기대: HQ-001 avail=47, reserved=3, total=50 → 모달 표시 47/50/3 **일치**
- DB 기대: VH-001 avail=63, reserved=0, total=63 → 모달 표시 63/63/0 **일치**
- UUID 노출: false (PASS)
- VR-001(VIRTUAL) 미노출: true (PASS)
- CS-001(0재고, 0토글 OFF): 미노출 (PASS)

### [2] 0토글 전환

- 0토글 OFF(기본): HQ-001, VH-001만 표시 (실재고>0 창고)
- 0토글 ON 후: CS-001(거래처 위탁창고 0/0/0), BK-001(백업창고 0/0/0) 추가 표시
- VR-001(VIRTUAL): 토글 ON 후에도 미표시 (D-IL-04 PASS)

### [3] 출고전표 상세 — 재고조회 모달 (AR09TXEAAWKNEU-04)

**모달 내용** (첫 번째 라인 기준):
```
AR09TXEAAWKNEU-04 삼성 윈드프리 9평형 | 가용70 실71 예약1 | 가용84 실84 예약0
```

- DB 기대: d7f488a5/HQ-001 avail=70, reserved=1, total=71 → **일치**
- UUID 노출: false (PASS)
- 체크박스 visible + 버튼 enabled: PASS

### [4] 입고전표 상세 — 재고조회 모달 (TEST-MODEL)

입고전표 라인의 product_id는 구 seeder TEST-MODEL UUID 기반이므로 inventory DB에 매핑 없음.  
모달 표시: "조회된 재고 창고가 없습니다. / '0수량 창고도 표시'를 켜면 전체 창고를 확인할 수 있습니다."  
→ 0재고 빈 상태 UI 정상 처리 (PASS)  
→ 체크박스 visible + 버튼 enabled: PASS (모달 자체는 동작)

---

## 도메인 정합성 검증

| 검증 항목 | 기대 | 실제 | 결과 |
|-----------|------|------|------|
| 모달 UUID 비공개 | UUID 패턴 미표시 | false | PASS |
| VIRTUAL 창고 미노출 (D-IL-04) | VR-001 미표시 (토글 ON/OFF 모두) | true | PASS |
| 0토글 OFF = 실재고>0 창고만 | CS-001/BK-001 미표시 | true | PASS |
| 0토글 ON = 전 창고 (비-VIRTUAL) | CS-001/BK-001 표시 | true | PASS |
| DB 값 일치 (주문서 HQ-001) | 가용47/실50/예약3 | 47/50/3 | PASS |
| DB 값 일치 (출고전표 HQ-001) | 가용70/실71/예약1 | 70/71/1 | PASS |
| 입고전표 0재고 빈 상태 처리 | 안내 문구 표시 | PASS | PASS |

---

## 부수 발견 사항

1. `/api/v1/partner-orders/{id}/revisions` → HTTP 500 (2건). 주문서 버전이력 API 오류. 본 슬라이스(2.6d) 범위 외, 비차단.
2. 입고전표 라인 product_id가 TEST-MODEL UUID여서 inventory 재고 없음 — seeder 정합 issue. INBOUND 슬립 seeder에 product-service 실 modelName 기반 UUID 통일이 필요.

---

## 최종 판정

| 컨텍스트 | 결과 |
|---------|------|
| 주문서 상세 재고조회 모달 | **PASS** |
| 출고전표 상세 재고조회 모달 | **PASS** |
| 입고전표 상세 재고조회 모달 (모달 동작) | **PASS** (0재고 빈 상태 정상) |
| 0토글 OFF/ON 전환 | **PASS** |
| 매트릭스 가용/실/예약 실값 일치 | **PASS** |
| VIRTUAL 창고 미노출 (D-IL-04) | **PASS** |
| UUID 비공개 가드 | **PASS** |

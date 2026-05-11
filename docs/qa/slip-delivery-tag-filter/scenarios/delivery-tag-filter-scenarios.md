# DeliveryTag 필터 + 슬립→전표 정합성 QA 시나리오

branch: `feature/slip-rename-and-transaction-types`
작성일: 2026-05-11

## 시나리오 개요

판매/구매조회 DeliveryTag 필터 신규 검증 5건 + 슬립→전표 UI 정합성 검증 4건.

## 사전 데이터 세트 (IT 내 seedSlips())

| 전표 종류 | DeliveryTag | 건수 |
|-----------|-------------|------|
| OUTBOUND  | DAY         | 2    |
| OUTBOUND  | RENTAL      | 2    |
| OUTBOUND  | RETURN_RENTAL | 1  |
| INBOUND   | RETURN_TRIP | 1    |
| INBOUND   | RETURN      | 1    |
| INBOUND   | BORROW      | 1    |

합계: OUT 5건 + IN 3건 = 8건

---

## IT 시나리오 (SlipDeliveryTagFilterIT)

### TC-1: OUTBOUND + RENTAL 단일 태그 필터

- **요청**: `GET /slips?slipType=OUTBOUND&deliveryTag=RENTAL`
- **기대**: HTTP 200, `data.totalElements == 2`
- **검증 포인트**: IN 3건 + OUT-DAY 2건 + OUT-RETURN_RENTAL 1건 제외, RENTAL 2건만 반환

### TC-2: INBOUND + RETURN_TRIP 단일 태그 필터

- **요청**: `GET /slips?slipType=INBOUND&deliveryTag=RETURN_TRIP`
- **기대**: HTTP 200, `data.totalElements == 1`
- **검증 포인트**: INBOUND 중 RETURN_TRIP 1건만 반환

### TC-3: OUTBOUND + RETURN_TRIP 정합 위반 → 400

- **요청**: `GET /slips?slipType=OUTBOUND&deliveryTag=RETURN_TRIP`
- **기대**: HTTP 400 BAD_REQUEST
- **검증 포인트**: RETURN_TRIP 은 INBOUND 전용. slipType=OUTBOUND 와 정합 불일치 → 400

### TC-4: INBOUND + DAY 정합 위반 → 400

- **요청**: `GET /slips?slipType=INBOUND&deliveryTag=DAY`
- **기대**: HTTP 400 BAD_REQUEST
- **검증 포인트**: DAY 는 OUTBOUND 전용. slipType=INBOUND 와 정합 불일치 → 400

### TC-5: OUTBOUND + RENTAL,RETURN_RENTAL 멀티셀렉 → 3건

- **요청**: `GET /slips?slipType=OUTBOUND&deliveryTag=RENTAL&deliveryTag=RETURN_RENTAL`
- **기대**: HTTP 200, `data.totalElements == 3`
- **검증 포인트**: IN predicate = `deliveryTag IN (RENTAL, RETURN_RENTAL)`. RENTAL 2건 + RETURN_RENTAL 1건 = 3건

---

## Playwright 시나리오 (slip-rename.spec.ts)

### TC-UI-1: 전표 목록 페이지 visible 텍스트 "슬립" 0건

- **대상 라우트**: `/#/slips`
- **기대**: `document.body.innerText` 에 "슬립" 0건

### TC-UI-2: 전표 생성 폼 visible 텍스트 "슬립" 0건

- **대상 라우트**: `/#/slips/new`
- **기대**: `document.body.innerText` 에 "슬립" 0건

### TC-UI-3: 공통 레이아웃 (대시보드) visible 텍스트 "슬립" 0건

- **대상 라우트**: `/#/`
- **기대**: `document.body.innerText` 에 "슬립" 0건

### TC-FILE-1: docs/manual 매뉴얼 markdown "슬립" 잔류 0건

- **대상**: `docs/manual/**/*.md`
- **기대**: "슬립" 포함 라인 0건

---

## DeliveryTag ↔ SlipType 정합 매트릭스

| DeliveryTag       | 허용 SlipType | 비고         |
|-------------------|---------------|--------------|
| DAY               | OUTBOUND      | 당일 출고     |
| STACK             | OUTBOUND      | 야적 출고     |
| REGION            | OUTBOUND      | 지방 출고     |
| LOGEN             | OUTBOUND      | 로젠택배 출고 |
| GYEONGDONG_PARCEL | OUTBOUND      | 경동택배 출고 |
| GYEONGDONG_FREIGHT| OUTBOUND      | 경동화물 출고 |
| RENTAL            | OUTBOUND      | 대여 출고     |
| RETURN_RENTAL     | OUTBOUND      | 반납 출고     |
| RETURN_TRIP       | INBOUND       | 회차 입고     |
| RETURN            | INBOUND       | 반품 입고     |
| BORROW            | INBOUND       | 차용 입고     |

---

## 실행 방법

```bash
# IT (Docker 필요)
cd services/slip-service
./gradlew test --tests "*SlipDeliveryTagFilterIT"

# Playwright
cd clients/desktop
VITE_MOCK_MODE=1 npx vite --port 5173 &
npx playwright test playwright/manual/slip-rename.spec.ts --reporter=line
```

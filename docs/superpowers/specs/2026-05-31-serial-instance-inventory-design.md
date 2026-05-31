# 시리얼 인스턴스 재고 모델 — 설계 (Phase INV-S)

> brainstorming 완료(2026-05-31, 개발책임자 대화). 품목코드(그룹) → 시리얼 UUID 인스턴스 재고 모델.
> ⚠️ 본 모델은 Phase 2.6c(수량 reserve)와 별개 트랙. 2.6c 는 수량모델로 먼저 머지, 본 시리얼 모델은 후속 신규 Phase.

## 1. 업무 규칙 (개발책임자 확정)
- **품목코드(productCode)** = 같은 품목의 분류 그룹. (products.product_code 기존재, 010001~)
- **시리얼 UUID 인스턴스** = 재고의 최소 단위. UUID = 인스턴스 PK(시리얼 키).
- **관리방식 = 품목 카테고리로 지정**:
  - `에어컨` / `판넬` 카테고리 → **개별 시리얼** (1대 = 1 UUID row, 별도 테이블 `stock_instances`)
  - `부자재` 카테고리 → **batch** (수량 묶음, 기존 `stock_lots` + `stock_balances`)
- **입고(구매전표 = 입고전표, 동의어)** 구분:
  - `구매` / `차용` → 해당 품목코드 그룹에 수량만큼 **새 인스턴스 생성** → 창고 입고(+)
  - `반품` / `회차` → 그 거래처로 나갔던 품목코드 인스턴스 **역-FIFO(LIFO) 회수**(−)
- **출고(판매전표)**: 품목코드 + 수량 입력 →
  - 개별 시리얼: 그룹에서 가장 먼저 생성된 인스턴스부터 **FIFO 소진**(received_at ASC) + 인스턴스에 출고처(거래처/전표) 기록
  - batch: lot 수량 FIFO 차감(기존 deduct 재활용)
- **회수(반품/회차) 대상**: 해당 **거래처 + 품목코드** 출고이력 중 가장 최근 출고분부터 **역-FIFO** 재고 복원.

## 2. 현행 자산 (재활용 — grounding 완료)
- `stock_lots`(inventory_db): product_id, warehouse_id, quantity, initial_quantity, received_at, unit_cost, lot_no, status. → **batch 품목 그대로 유지.**
- `stock_balances`: available/reserved/total qty. → batch 품목 수량 집계.
- `stock_movements`: movement_type(INBOUND…), reference_id/reference_type, lot_id, occurred_at, actor. → 이력/출고처 추적 토대.
- FIFO deduct: `findAvailableLotsForFifo`(received_at ASC) 이미 구현.
- slip: slip_type(INBOUND/OUTBOUND), io_type, source_type. 구매전표=INBOUND, 판매전표=OUTBOUND.
- products: product_code, category_key, model_name, model_code, name 기존재.

## 3. 데이터 모델

### 3.1 신규 `stock_instances` (개별 시리얼 전용, inventory_db)
| 컬럼 | 설명 |
|---|---|
| id (UUID PK) | 인스턴스 시리얼 키 |
| product_id (UUID) | products.id 참조 |
| product_code (VARCHAR) | 품목코드 그룹(스냅샷) |
| warehouse_id (UUID) | 현재 위치 창고 |
| status | AVAILABLE / RESERVED / SHIPPED / RECALLED (soft delete 대신 status 전이) |
| inbound_type | 구매 / 차용 (입고 구분) |
| received_at | 입고일시 (FIFO 정렬 키) |
| unit_cost | 입고 원가 |
| inbound_slip_no | 입고(구매)전표 번호 |
| outbound_partner_code | 출고 거래처(회수 역-FIFO 근거) |
| outbound_slip_no | 출고(판매)전표 번호 |
| outbound_at | 출고일시 |
| + BaseEntity 7 audit |

### 3.2 품목 관리방식 판정
- products.category_key(또는 category_group) → 개별시리얼/batch 매핑. inventory-service 가 product 조회 시 판정(ProductClient 기존 활용) 또는 카탈로그 동기.
- (검토) products 에 `serial_managed` boolean 파생 컬럼 vs 카테고리 런타임 판정 — 구현 시 확정.

### 3.3 batch 품목
- 기존 stock_lots + stock_balances + FIFO deduct 변경 없음. 시리얼 인스턴스 비대상.

## 4. 슬라이스 분해 (각 독립 PR·실 QA)
- **S1 인스턴스 기반**: `stock_instances` 테이블(Flyway) + 도메인(생성/상태전이/FIFO조회/역-FIFO조회) + 카테고리별 관리방식 판정 + seed(개별시리얼 품목 인스턴스). 입출고 연동 없이 인스턴스 CRUD/조회만.
- **S2 입고 연동**: 구매전표(INBOUND) 발행 → 구분(구매/차용)이면 품목코드 그룹에 수량만큼 인스턴스 생성(개별) / lot 생성(batch). 구매전표↔inventory 연동(SlipServiceClient 역방향 또는 이벤트).
- **S3 출고 연동**: 판매전표(OUTBOUND) 발행 → 품목코드+수량 → 개별=FIFO 인스턴스 소진(status SHIPPED + 출고처 기록) / batch=수량차감. 재고부족 사전차단.
- **S4 회수 연동**: 구매전표 구분 반품/회차 → 거래처+품목코드 출고이력 역-FIFO → 개별=인스턴스 재입고(status AVAILABLE 복원) / batch=수량복원.

## 5. 미결정 (구현 시 확정)
- 전표↔inventory 연동 방식: 동기 REST(SlipServiceClient 역호출) vs 이벤트(SlipPublishedEvent 구독, accounting 패턴). 회계가 이미 이벤트 구독 → 일관성 위해 이벤트 우선 검토.
- 관리방식 판정: products 파생 컬럼 vs 런타임 카테고리 판정.
- 개별시리얼 + batch 혼합 전표 처리(한 전표에 두 종류 라인).
- reserve(2.6c 수량예약)와 인스턴스 status RESERVED 의 통합 시점.

## 6. 범위 밖 (후속/타 슬라이스)
- 시리얼번호(제조사 S/N)·AS·보증 추적(인스턴스 확장 필드).
- 2.6c 수량 reserve → 인스턴스 RESERVED 통합.
- 재고조회 모달 2.6d 의 시리얼 인스턴스 표시.

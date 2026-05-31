## 개요

시리얼 인스턴스 재고 모델 **S1 — 인스턴스 기반** (Phase INV-S 첫 슬라이스). 개별시리얼 품목(에어컨/판넬)의 재고 최소단위를 **UUID 인스턴스**(`stock_instances`)로 모델링. **BE 전용**(product-service 판정 + inventory-service 도메인), 입출고 전표 연동은 S2~S4 후속.

## 핵심 결정 (DECISIONS D-SER, spec §4 S1)

| 결정 | 내용 |
|---|---|
| 범위 | **S1 인스턴스 기반만** (테이블+도메인+판정+seed+CRUD/조회). 입출고 연동 S2~S4 독립 슬라이스 |
| 관리방식 판정 | **product-service `categories.serial_managed` 파생** — 에어컨 계열 true, 부자재(PIPING/CONTROL) false → `ProductSummaryResponse.serialManaged` 노출, inventory 소비 |
| 인스턴스 상태 | soft-delete 대신 **status 전이**(AVAILABLE/RESERVED/SHIPPED/RECALLED) |

## 변경

**product-service**: V9 `categories.serial_managed`(에어컨 계열 UPDATE) + `Category.serialManaged` 도메인 + `ProductSummaryResponse.serialManaged` + HvacProductSeeder markSerialManaged(비-Flyway 대비).

**inventory-service**: V15 `stock_instances`(UUID 시리얼 키, FIFO/역-FIFO 인덱스) + `StockInstance` 엔티티(inbound 팩토리 + ship/recall/reserve/release 가드, BusinessException 통일) + `StockInstanceRepository`(FIFO received_at ASC / 역-FIFO outbound_at DESC / findByProductId) + `StockInstanceService`(serial_managed 가드 409) + `StockInstanceController`(/inventory/instances) + `ProductSummary.serialManaged` + seeder + IT.

## 테스트 / 리뷰

- inventory `StockInstanceIT` 12 PASS(skipped=0): serial 생성 / batch 409+body / FIFO·역-FIFO **정확값 isEqualTo** / 상태전이 가드 / recall·release 전이 / soft-delete.
- product `ProductInternalControllerIT` 3 + Category/ProductSummary 테스트 PASS.
- **5-team 사이클 N=2**: BE/DevOps APPROVE, QA 잔여 2건(mixed 테스트 serialManaged 값 단언 N-1 / seeder INDOOR 카테고리 N-2) — 본 PR 후속 커밋 처리 중. 사이클1: 예외 통일·byProduct 전체스캔·FIFO 정확값·recall/release 등 fix.

## 배포

product-service(V9, serialManaged) → inventory-service(V15). 순서 위반 시 serialManaged=false 기본 → 인스턴스 생성 409 차단(안전 degrade). 기존 stock_lots/balances/2.6c 무변경(회귀 0).

## Docker 실 QA

CI green + QA 잔여 fix 후 실 inventory_db `stock_instances` row + FIFO 순서 psql 실 캡처([[no-fake-data-ever]]) → 본 PR 코멘트.

## 연관
- spec `docs/superpowers/specs/2026-05-31-serial-instance-inventory-design.md` (§4 S1)
- plan `docs/superpowers/plans/2026-05-31-serial-instance-s1.md`
- 메모리 [[project_serial_inventory_model]]

🤖 Generated with [Claude Code](https://claude.com/claude-code)

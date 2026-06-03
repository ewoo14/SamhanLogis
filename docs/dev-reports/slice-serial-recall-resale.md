# Slice: 시리얼 회수품 재판매 (RECALLED→AVAILABLE, D-SER-24)

> PR #358 / branch `feat/serial-recall-resale` / 2026-06-03 / inventory-service 단독.
> INV-S S4 descope 분(D-SER-13 "회수품 재판매 후속·개발책임자 확인 권장")을 개발책임자 결정으로 구현.

## 1. 목표

S4 회수로 SHIPPED→RECALLED 된 시리얼 인스턴스를 **검수 후 재판매 가능 재고로 복귀**(RECALLED→AVAILABLE)하는 운영자 명시 액션.

## 2. 구현 (D-SER-24)

- `StockInstance.resell()`: requireStatus(RECALLED) → AVAILABLE + 마커 클리어(recall_slip_no/outbound 3-필드 null) + `received_at=now()`(재입고 FIFO 재진입). unitCost/inboundSlipNo 원입고 이력은 보존(원가 추적). 도메인 메서드 위임.
- `StockInstanceRepository`: `recallSlipNo+productCode+RECALLED` ForUpdate + Pageable(LIMIT deficit).
- `StockInstanceService.resellBatch`: advisory lock(`recallSlipNo|productCode` recall 키 재사용) + 후보크기 단일 부족판정 409 + 멱등(RECALLED 후보만 → 재호출 시 부족 409 수렴).
- `POST /inventory/instances/resell-batch` + `ResellBatchInstanceRequest`. `@RequirePermission(inventory.stock-balance, UPDATE)`(기존 상태전이 엔드포인트 일관).

## 3. 검증

- 단위(domain 10 / service 14) + IT(실 Testcontainers 16, JdbcTemplate 실DB 단언 보강): RECALLED→AVAILABLE·마커 4필드 null·received_at 갱신, 부족 409, 멱등, advisory/row lock 2계층(동시성). inventory 425/0/0(1 skip=Mig5 fixture, 신규 resell skip0).
- **Docker 실 QA**(`docs/qa/slice-serial-recall-resale/real-qa-evidence.md`): 실 RECALLED 인스턴스(S4Q-RET-2/010001) gateway 통해 resell → HTTP 200 → psql AVAILABLE·마커 4필드 null·received_at 갱신·RECALLED 잔여 0. 부족 케이스 409. no-fake-data(가짜 삽입 없음).

## 4. 리뷰

- **5-agent**: BE/DevOps APPROVE(gateway `/inventory/instances` 정상·#355 무관, Flyway 무변경, advisory lock 정합). QA P1-1(IT JdbcTemplate 실DB 단언 보강) fix, P1-2 무효(stub 실재).
- **Codex cross-check**: 5섹션 APPROVE.

## 5. 후속

- DevOps P2: 회수전표 없이 누적된 RECALLED 인스턴스 접근 경로(현 resell-batch 는 recallSlipNo 단위) — 운영 가이드/별도 조회.
- slip 회수입고 전표에서 재판매 트리거 연동(현재 inventory 직접 운영 액션).

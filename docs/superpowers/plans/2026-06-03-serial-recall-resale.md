# 시리얼 회수품 재판매 — 구현 계획

> spec: `docs/superpowers/specs/2026-06-03-serial-recall-resale-design.md`. inventory-service 단독.

**Goal:** RECALLED→AVAILABLE 재판매(검수 후 재입고) 도메인 + resell-batch API. D-SER-24.

**대원칙:** BaseEntity/도메인 메서드(직접 set 금지)/UUID 비공개/IT skipped=0/advisory+row lock 일관/6월 date-bomb 회피.

## Task 1: 도메인
- `StockInstance.resell()`: requireStatus(RECALLED) → AVAILABLE + recallSlipNo=null + outbound 마커 3-필드 null + receivedAt=now(). 한국어 Javadoc. 단위 테스트(전이/409/마커 클리어).

## Task 2: 저장소 + 서비스
- `StockInstanceRepository`: RECALLED 후보 조회(recallSlipNo+productCode+RECALLED, ForUpdate + LIMIT deficit) — recall/unrecall ForUpdate 패턴 일관.
- `StockInstanceService.resellBatch(recallSlipNo, productCode, quantity, actor)`: advisory lock(`recallSlipNo|productCode`) + 후보크기 단일 부족판정(409) + 멱등(RECALLED 후보만) + resell() 위임.

## Task 3: 컨트롤러
- `POST /inventory/instances/resell-batch` {recallSlipNo, productCode, quantity}. @RequirePermission(inventory edit action). ApiResponse. 기존 instances 컨트롤러 패턴.

## Task 4: 테스트
- 단위 + IT(실 Testcontainers, AbstractPostgresIT): RECALLED→AVAILABLE·마커 null·received_at 갱신, 부족 409, 멱등, advisory/row lock. skipped=0.

## 검증
inventory `:services:inventory-service:test` green(skip0). Docker 실 QA(RECALLED 인스턴스 resell→psql AVAILABLE; 없으면 IT 갈음).

## 자기검토
- 멱등(RECALLED 후보만 대상). 부족판정 후보크기 단일(TOCTOU). 마커 완전 클리어. received_at FIFO 재진입. inventory 단독.

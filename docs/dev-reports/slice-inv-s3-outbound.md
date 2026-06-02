# 슬라이스 INV-S/S3 — 시리얼 인스턴스 출고연동 (dev-report)

> PR #347 · 브랜치 feat/serial-instance-s3-outbound · 2026-06-03 자율 세션
> spec: `docs/superpowers/specs/2026-06-02-serial-instance-s3-outbound-design.md` / plan: `docs/superpowers/plans/2026-06-02-serial-instance-s3-outbound.md`

## 목표

OUTBOUND(판매)전표 생명주기(accept/complete/reject·cancel)에 serial-managed 라인의 개별시리얼 인스턴스 상태전이(reserve→ship→release)를 연동한다. batch 라인은 기존 수량 경로(reserve/deduct/release) 무변경. S1(#336 인스턴스 기반) / S2(#338 입고연동) 후속.

## 생명주기 (개발책임자 A안 전체 적용)

| 전표 단계 | serial 라인 | batch 라인(기존) |
|---|---|---|
| accept (SENT→ACCEPTED) | 인스턴스 FIFO 예약 (AVAILABLE→RESERVED, source창고, 재고부족 409 사전차단) | reserve |
| complete (PROCESSING→INSPECTING) | 예약분 출고 (RESERVED→SHIPPED + 출고처/일시) | deduct(fromReservation) |
| reject/cancel (직전 ACCEPTED) | 예약 해제 (RESERVED→AVAILABLE) | release |

## 구현 (Codex gpt-5.5 + Claude/Codex dual cross-check)

### inventory-service
- `StockInstance`: `reserve(outboundSlipNo)` 마커, `ship()` 가드 확장(AVAILABLE|RESERVED→SHIPPED), `release()` 마커 클리어.
- `StockInstanceRepository`: warehouse-scoped FIFO 조회 + outboundSlipNo 대상 조회/카운트.
- `StockInstanceService`: `reserveBatch`(FIFO 멱등 + 재고부족 409) / `shipBatch` / `releaseBatch` + advisory lock(`outboundSlipNo|productCode`).
- `StockInstanceController`: `POST /inventory/instances/{reserve,ship,release}-batch` (inventory.stock-balance UPDATE) + DTO 3종.
- `V17` `stock_instances` outbound_slip 부분 인덱스(`WHERE outbound_slip_no IS NOT NULL AND is_deleted = FALSE`).
- `ProductClient.requireExistsByCode(productCode)` — product lookup-by-code 소비.

### product-service
- `POST /internal/products/lookup-by-code` 신규(productCode→ProductSummary, serialManaged 포함). inventory `requireExistsByCode` 가 소비. (plan상 "무변경"이었으나 productCode 단건조회 필요 — 합리적 확장.)

### slip-service
- `InventoryClient`: `reserveInstances/shipInstances/releaseInstances` (X-Internal-Token + X-User-Role:MASTER). 4xx 응답 본문을 호출자에 전달(재고부족 상세 보존).
- `SlipService.accept/complete/reject/cancel`: OUTBOUND serial vs batch 라인별 분기. 동기 REST + Tx 롤백 + **혼합전표 역순 보상**(serial 예약 성공 후 batch 실패 시 release 보상, D-SER-05).

## 리뷰 (dual 5-agent cross-check, N=2 수렴)

- **Claude 5-agent**(BE/QA/DevOps/FE/Designer): P0 1 + P1 8 + P2 다수.
  - 🔴 P0: `reserveBatch` count/candidates TOCTOU → 다른 전표 동시 소진 시 IndexOutOfBounds(500). **후보 목록 크기 단일 판정**으로 수정.
  - 🟠 P1: InventoryClient 4xx 본문 / SlipService Javadoc 정정 / V17 is_deleted / warehouseId 리터럴화.
  - 🚨 PM 발견: **Mig5 silent-skip 조작 원복** — Codex가 skipped=0 맞추려 `assumeTrue`→`if-return`(false-green)한 것을 정직한 SKIPPED로 복원.
- **Codex 5-섹션 cross-check**(gpt-5.5, read-only): ①③ APPROVE, ②[P1] 혼합전표 고아예약 보상 누락 → fix + 회귀 테스트, ④⑤[P2].
- 최종 **P0/P1 0 수렴**.

## 검증

- 단위 + IT(실 Testcontainers Postgres, skipped=0): inventory 399 / slip 775 / product 210 전부 skipped=0·fail=0·err=0. 신규 S3 테스트 — StockInstanceOutboundTest 4 / StockInstanceServiceOutboundTest 6 / **StockInstanceOutboundIT 6** / **SlipOutboundInstanceIT 4**(실 PG로 라이프사이클 실증) + 보상 회귀 1.
- **CI 20 job green** (skipped=0).
- **Docker 실 QA PASS** (실 게이트웨이+JWT+inventory+Postgres): accept→RESERVED(FIFO) / complete→SHIPPED+출고처+일시 / 재고부족 409 / release→AVAILABLE 복원. 증빙 `docs/qa/slice-inv-s3-outbound/real-qa-evidence.md`.

## 배포 순서

product-service → inventory → slip-service (호출 의존 역방향). 상세 plan §배포순서.

## 후속 (P2, S4/FE 슬라이스)

- partnerCode null warning(plan 허용 — S4 회수에서 outbound_partner_code backfill 시 정합).
- FE 시리얼 인스턴스 상태(가용/예약/출고완료) 노출 + 재고부족 409 warning UX(Designer 권고).
- `GET /inventory/instances` 에 `outboundSlipNo` 파라미터(전표별 출고 인스턴스 조회).
- entityManager mock 단위 advisory lock 검증.

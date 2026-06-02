# 슬라이스 INV-S/S4 — 시리얼 인스턴스 회수연동 (dev-report)

> PR #348 · 브랜치 feat/serial-instance-s4-recall · 2026-06-03 자율 세션
> spec: `docs/superpowers/specs/2026-06-03-serial-instance-s4-recall-design.md` / plan: `docs/superpowers/plans/2026-06-03-serial-instance-s4-recall.md`
> ⚠️ **PR ready(머지 대기)** — Codex cross-check P1 2건(설계, S3 공통) 개발책임자 결정 대기.

## 목표

INBOUND(구매/입고)전표의 **반품/회차**(deliveryTag RETURN/RETURN_TRIP) complete 시, 해당 거래처로 출고됐던 serial-managed 인스턴스를 **역-FIFO로 회수**(SHIPPED→RECALLED). batch 라인은 기존 수량 복원. Phase INV-S 마지막(S1 #336 / S2 #338 / S3 #347 후속).

## 생명주기

| INBOUND 단계 | serial 라인 | batch 라인 |
|---|---|---|
| complete (RETURN/RETURN_TRIP) | 거래처+productCode SHIPPED 인스턴스 역-FIFO(outbound_at DESC) 회수 → RECALLED + recall_slip_no | 기존 lot 수량 복원 |
| complete (BORROW/구매) | 기존 입고(인스턴스 생성, S2) | 기존 lot 입고 |

## 구현

### inventory-service
- `StockInstance.recall(recallSlipNo)`: SHIPPED→RECALLED + recall_slip_no 마커(기존 무인자 recall() 재사용·확장).
- `StockInstanceService.recallBatch(partnerCode, productCode, quantity, recallSlipNo)`: serial 가드 + 역-FIFO(outbound_at DESC, **id ASC tie-break**) + 회수부족 409 후보크기 단일판정(S3 D-SER-11) + 멱등(recall_slip_no 마커) + advisory lock(`recallSlipNo|productCode`).
- `Repository`: 회수 카운트/멱등 조회 + 역-FIFO `findByOutboundPartnerCodeAndProductCodeAndStatusOrderByOutboundAtDescIdAsc`(S1 메서드 + tie-break 보강).
- `Controller`: `POST /inventory/instances/recall-batch` + `RecallBatchInstanceRequest` DTO + `StockInstanceResponse.recallSlipNo`.
- `V18` recall_slip_no 컬럼 + 멱등 부분 인덱스(`WHERE recall_slip_no IS NOT NULL AND is_deleted = FALSE`).

### slip-service
- `SlipService.complete()` INBOUND RETURN/RETURN_TRIP 분기: `resolveInboundType()` 의 409 가드 해제 + serial→`recallInstances` / batch→수량복원 + 혼합전표 순서(serial recall 선행).
- `InventoryClient.recallInstances`(4xx 본문 전달).

## 리뷰 (dual 5-agent cross-check, N=2)

- **Claude 5-agent**: P0/P1 0, P2 5. fix: 역-FIFO **tie-break(OrderByOutboundAtDescIdAsc)** / SlipInboundInstanceIT **PartnerInternalClient @MockBean**(feedback_it_mockbean_external_clients) / **RETURN serial 정상 IT**.
- **Codex cross-check**: P0 0, **P1 2건**(아래 후속), P2 2(README stale→fix, IT tie-break 단언).

## 검증

- 단위 + IT(실 Testcontainers Postgres, skipped=0): inventory 408 / slip 781 / product 210 전부 skip0·fail0·err0. (skip 1=Mig5 기존, raw CSV 부재 정직 SKIPPED, S4 무관)
- **CI 20 job green** (skipped=0).
- **Docker happy-path 실 QA PASS**(실 게이트웨이+JWT+inventory+Postgres): recall→RECALLED+recall_slip_no / 회수부족 409 / 멱등 / 역-FIFO. 증빙 `docs/qa/slice-inv-s4-recall/real-qa-evidence.md`.

## 배포 순서

product → inventory(V18 + recall-batch) → slip(INBOUND RETURN 분기).

## ⚠️ 후속 — Codex cross-check P1 2건 (개발책임자 결정 대기, S3 공통 설계)

- **completeRecallInbound 보상 인프라**: 혼합전표 serial recall 성공 후 batch inbound 실패 시 un-recall(RECALLED→SHIPPED) 보상 부재. S3 accept 보상(release 인프라)과 달리 recall 역전이 도메인/API 신규 필요.
- **recallBatch 동시성**: 다른 recallSlipNo 동시 회수 시 같은 SHIPPED 후보 중복 선택(advisory lock key recallSlipNo|productCode, row lock/공통 @Version 없음). **S3 reserveBatch 동일 구조**.
- → **"시리얼 동시성·보상 강화" 후속 슬라이스로 S3 reserveBatch 포함 일관 처리** 권장. happy-path 무결, 발생 조건(혼합전표 batch inbound 실패 / 동일 거래처·품목 동시 2전표) 제한적.

## 기타 후속 (P2)

recall batch409 IT / recallInstances 5xx IT / StockInstanceOutboundIT tie-break 순서 단언.

---
name: project-order-slip-conversion
description: 주문→출고전표 전환 고도화 (다음 슬라이스 예정). 품목별 부분전환 + 다중주문 병합 + 헤더 충돌 선택/'/' 병기. 견적→슬립·주문→슬립 1:1 은 이미 구현됨.
metadata:
  type: project
---

# 주문 → 출고전표(slip) 전환 고도화 — 차기 슬라이스 (Phase 2.4 RESTORE 다음)

> 2026-05-30 개발책임자 업무 규칙 명시. Phase 2.4 주문 RESTORE 머지 후 진행 결정.

## 업무 규칙 (사용자 원문 정리)
- **견적서 → 출고전표 바로 생성** (직접 변환)
- **주문서 → 출고전표 전환** 가능, 단:
  1. **품목별(라인 단위) 부분 전환**: 한 주문서의 일부 품목만 골라 출고전표로
  2. **다중 주문서 → 단일 출고전표 병합**: 여러 주문서를 하나로 합칠 때, 서로 다른 출고정보(배송지 등 헤더)는 **선택**하거나 **'/'로 구분 병기**

## 현행 구현 상태 (grounding 2026-05-30)
| 기능 | 상태 | 위치 |
|---|---|---|
| 견적 → 슬립 직접생성 | ✅ 구현됨 | `slip-service` `estimate/service/EstimateToSlipConverter.java`, `EstimateController` convert endpoint (ACCEPTED 견적 → OUTBOUND DRAFT, sourceType=ESTIMATE) |
| 주문 → 슬립 1:1 전체전환 | ✅ 구현됨 | `partner-order-service` `PartnerOrderConfirmService` → `SlipServiceClient.publishFromPartnerOrder` → `slip-service` `SlipPublishController`/`SlipPublishService`. idempotencyKey `PO-CONF-{partnerCode}-{draftSeq}`, outbox 재시도 |
| **품목별 부분 전환** | ❌ 미구현 | `ConfirmLineRequest` 에 라인 선택 필드 없음. `buildSlipPayload(order)` 가 전 라인 포함 |
| **다중 주문 병합** | ❌ 미구현 | 각 주문 개별 1:1 발행만. 헤더 병합/선택 로직 없음 |

## 설계 시 핵심 고려
- `Slip` 엔티티: `sourceType`(ESTIMATE/PARTNER_ORDER/MANUAL/MIGRATED_ECOUNT) + `sourceId`(단일) 만 존재. `assignPublishSource()` 1회성 setter.
- **라인 단위 역추적 필드 없음** → 부분전환/병합 위해 `SlipLine.sourceOrderId`/`sourceOrderLineId` 또는 다중 `sourceId` 추적 스키마 신규 필요.
- 병합 시 배송지/거래처 등 헤더 충돌 해소 UX (선택 라디오 또는 '/' 병기) 설계 필요.
- 주문 부분소비 상태관리: 일부 라인만 전환 시 주문 잔여 라인 상태(부분전환/완전전환) 추적 필요 → 주문 status enum 확장 가능성.

## 관련
- [[project-local-stack-qa-gotchas]] (게이트웨이/Docker QA 함정)
- Phase 2.4 주문 RESTORE spec: `docs/superpowers/specs/2026-05-30-partner-order-restore-version-history-design.md`

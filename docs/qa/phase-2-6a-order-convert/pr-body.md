# [FEAT] 권한 재편 Phase 2.6a — 주문→출고전표 부분전환

> 🚧 조기 draft PR · ⚠️ Codex 토큰 소진(6/1 12:00 복구 전) → Claude 에이전트 전면 대체

## 개요
slip 미발행 주문(견적전환 DRAFT 등)을 **라인별·수량별로 골라 출고전표로 전환**(부분전환). 전환수량을 주문 라인에 추적.

## 범위 (2.6a — 단일 주문 부분전환만)
- **BE**: `PartnerOrderLine.converted_quantity`(V8) + `convert`/`remainingQuantity`/`isFullyConverted` 도메인 + `POST /{id}/convert-to-slip`(선택 라인+수량) + 전환완료 status(`CONVERTED`) + `SlipLine.source_order_line_id`(slip V10)
- **대상**: slipNo=null 주문만(이미 출고전표 발행된 주문은 전환 불가 — 모순 회피)
- **FE**: 주문 상세 "출고전표 전환" 버튼 + 라인별 수량 입력 모달
- **제외(후속)**: 2.6b confirm 자동발행 폐지 + 다중주문 병합(헤더 '/'병기, 같은 거래처만) / 2.6c 재고·회계 정합성

## 체크리스트
- [ ] T1 SlipLine.sourceOrderLineId (slip V10)
- [ ] T2 발행 요청 라인 sourceOrderLineId 전파
- [ ] T3 PartnerOrderLine.convertedQuantity (V8) + 도메인 메서드
- [ ] T4 부분전환 서비스 + API + 전환완료 status
- [ ] T5 권한 seed
- [ ] T6 Testcontainers IT
- [ ] T7 FE 전환 모달
- [ ] T8 Playwright + 문서 + Docker 실 QA
- [ ] 5팀 리뷰(사이클 N=2) → CI green → 머지

spec: `docs/superpowers/specs/2026-05-30-order-to-slip-conversion-design.md`
plan: `docs/superpowers/plans/2026-05-30-order-to-slip-conversion-2-6a.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)

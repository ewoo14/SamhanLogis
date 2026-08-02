---
name: project_serial_inventory_model
description: "시리얼 인스턴스 재고 모델 (품목코드 그룹→UUID 시리얼) — 신규 대형 Phase, spec 박제 (2026-05-31)"
metadata: 
  node_type: memory
  type: project
  originSessionId: 527690b1-44aa-46ea-8abd-38502bfd74d3
---

**재고 = 시리얼(UUID) 인스턴스 단위 추적 모델** (개발책임자 확정 2026-05-31). 현 수량모델(stock_balances available/reserved/total)을 넘어서는 신규 대형 Phase. spec 박제: `docs/superpowers/specs/2026-05-31-serial-instance-inventory-design.md`.

**도메인 규칙 (개발책임자 확정)**:
- **UUID = 품목 시리얼 키(PK)**, 개별 instance 식별자. **품목코드(productCode) = 같은 품목 그룹**. 품목코드(1)→UUID(N).
- **관리방식 = 품목 카테고리로 지정**: `에어컨`/`판넬` = 개별 시리얼(1대=1 UUID row), `부자재` = batch(수량 묶음). (products.inventory_qty_mgmt 또는 category_key 기반)
- **입고(구매전표=입고전표, 동의어)** 구분: `구매`/`차용` → 품목코드 그룹에 수량만큼 새 인스턴스 생성(창고 입고). `반품`/`회차` → 그 **거래처+품목코드 출고이력 역-FIFO(LIFO)** 회수(재고 복원).
- **출고(판매전표)**: 품목코드+수량 → 개별시리얼=가장 먼저 생성된 인스턴스부터 FIFO 소진(received_at ASC)+출고처(거래처/전표) 기록 / batch=수량 차감.

**현행 자산(재활용)**: inventory `stock_lots`(입고 batch=인스턴스 토대: received_at/unit_cost/lot_no/status) + `stock_movements`(이력/출고처 추적: reference_id/type/lot_id) + FIFO deduct 이미 구현(`findAvailableLotsForFifo` received_at ASC). slip slip_type(INBOUND/OUTBOUND). products product_code 기존재.

**슬라이스 분해**: S1 인스턴스 기반(신규 `stock_instances` 테이블 + 도메인 + 카테고리 판정 + seed) → S2 입고 연동(구매전표→생성) → S3 출고 연동(판매전표→FIFO 소진+출고처) → S4 회수(반품/회차→역-FIFO). 각 독립 PR·실 QA.

**관계**: 2.6c(수량 reserve)는 별개 트랙으로 먼저 머지됨(#327). 2.6c reserve → 시리얼 인스턴스 status RESERVED 통합은 시리얼 Phase 에서. [[project_seed_product_uuid_catalog]](UUID single source)/[[project_inventory_lookup_modal_2_6d]](재고조회) 수혜. 별도 미결: 품목코드 그룹 product_code 정식화(spec `2026-05-31-product-code-grouping-design.md`, slip_lines 엔 product_code 있으나 products 마스터엔 컬럼만 있고 1:1 — 1:N 그룹 미구현).

**Why**: 삼성전자 등 거래처 입고 시 시리얼 단위 추적 + FIFO 출고 + 거래처별 반품/회차 회수 = 실 재고 업무 정확 반영.

---

## 🚨 2026-07-30 개발책임자 정정 — **UUID 를 노출 시리얼키로 쓰지 않는다**

위 본문의 *"**UUID = 품목 시리얼 키(PK)**, 개별 instance 식별자"* 는 **폐기**된다.

> *"재고 인스턴스의 경우 **미노출 UUID 서버키와 별도로 노출용 시리얼키(자체 시리얼번호 체계)** 도 필요할 것 같아."*
> *"**UUID는 미노출, 시리얼 키는 노출로 따로 분리**하도록 하자."*

| 축 | 역할 | 노출 |
|---|---|---|
| `stock_instances.id` (UUID) | 서버 내부 식별 | **미노출** |
| **노출용 시리얼키** (자체 체계) | 화면·QR·문서 | 노출 |

## 함께 결정된 것 (→ Issue #999)

- **QR 스캔 입출고** — 대상 **실외기·실내기·판넬**(부자재 제외). QR 에 담는 값은 **시리얼키**(UUID 아님)
- **상태를 두 축으로 분리** — 개발책임자: *"재고상황과 품질로 구분하도록 하자"*
  - **재고상황**: `AVAILABLE` · `RESERVED` · `SHIPPED` (기존 `StockInstanceStatus` 유지)
  - **품질**: 정상 · 중고 · 파손 · 재포장 · 박스불량 (**신규 별도 컬럼**)
  - 🔑 한 컬럼에 섞으면 *"파손인데 가용"* 같은 실제 조합을 표현할 수 없다
- 창고에서 **입출고 시 품질을 분류**한다

## 선행 의존

`stock_instances.product_code` 가 현재 이카운트 순번코드(`010001`)이고 [[project_item_code_model_unification]] 전환으로 모델명이 된다. **QR 스캔 조회가 그 키를 쓰므로 순서를 정해야 한다.**

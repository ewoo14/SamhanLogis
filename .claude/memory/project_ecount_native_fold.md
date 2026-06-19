---
name: project-ecount-native-fold
description: 이카운트 이관 자료는 별도 메뉴/저장(silo) 금지, 시드로 네이티브 도메인 편입 + "회계 관리자" 메뉴 폐기 에픽
metadata:
  type: project
---

2026-06-19 개발책임자 지적: "이카운트 이관 자료를 따로 메뉴로 만들지 말고 **시드로 기존 시스템에 편입**시켜야지. 과거 자료를 따로 저장하면 어떻게해." → [[project-replaces-ecount-gas-was-exporter]] · [[project-sheets-to-db-full-migration]] 전략의 구체 적용.

**현황(정찰 `docs/research/2026-06-19-ecount-native-fold-recon.md`):**
- 현금(지출/입금)은 **이미** MIG-9가 네이티브 `journals`(POSTED 복식부기)로 편입 → 분개장/원장/시산표/재무보고서/입금매칭에 노출됨. 그러나 중간테이블 `cash_disbursements`/`cash_receipts` + FE "회계 관리자"(회계 메뉴 하위 중첩 토글, page-code `ecount.mig14.*`)가 그 자료를 **중복 silo 화면**으로 또 보여줌.
- 주문(accounting `orders`, MIG-8)은 네이티브 미편입 silo(최대 갭 G1). 잔액 스냅샷은 native MV 파생인데 silo 화면 중복. 원장 대조·운영 대시보드는 cutover 검증 1회성 도구.

**방침:** 과거 자료=네이티브 일반 화면에서 보이게, "회계 관리자(MIG-14)" 상설 메뉴 폐기. 중간테이블은 사용자 비노출 lineage로만(물리 DROP은 Phase11 cutover 후). 원장대조/운영대시보드는 운영 admin으로 격리(cutover 전 폐기 금지).

**슬라이스:** 슬1 잔액스냅샷 폐기→partner-aging · 슬2 현금 silo 폐기→분개장/입금매칭 · 슬3 분개장 source_type 가시성(D2 후) · 슬4 원장대조/운영대시보드 격리 · 슬5 토글그룹 해체 · 슬6 주문 네이티브 이식(D1 후, 대형).

**미해결 결정(개발책임자):** D1 주문 귀속(slip partner_orders vs accounting sales-slip) · D2 과거 이관 표시 범위(통합/배지/기간컷오프) · D3 cash_*/orders 물리 제거 시점 · D4 원장대조·운영대시보드 cutover 후 처리.

진행: 정찰 완료 → spec → 슬라이스 (개발책임자 "정찰→spec→슬라이스" 선택). presence 에픽과 **병렬 진행** 지시.

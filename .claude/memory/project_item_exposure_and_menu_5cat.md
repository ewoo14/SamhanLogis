---
name: item-exposure-and-menu-5cat
description: 2026-06-10 개발책임자 결정 — 품목 노출구분(견적/주문)+시트순서 보존 / 좌측메뉴 5대분류(판매·구매·회계·그룹웨어·인사)+배차·창고운영 별도
metadata:
  type: project
---

2026-06-10 개발책임자 신규 업무규칙 2건 확정:

## 1. 일반 품목 vs 견적서/주문서 노출 품목 구분 + 시트 순서 보존
- **모든 품목이 종합견적서·주문서에 노출되면 안 됨** — usageScope(ESTIMATE/PARTNER_ORDER/BOTH/NONE)로 구분.
- **운영 방식 = 시트 탭 자동 + 품목별 수동 토글**: sync 가 시트 탭 기반 자동 분류하되, 데스크톱 품목관리 화면에서 개별 품목의 '견적 노출/주문 노출' 여부를 수동 토글 가능. **시트에 없는 품목도 수동 노출 가능**.
- **견적 카탈로그 엔드포인트(EstimateCatalogInternalController)에 usageScope 필터 강제** — 현재 productCategory 만 필터(갭). 일반 품목관리 리스트는 전체 노출.
- **시트 노출 순서 그대로 저장·표시**: Product 에 시트 row 순서 컬럼(displayOrder/sheetRow) 신규 — sync 시 각 시트 탭 행 순서 보존. 견적서/주문서 품목 리스트가 구글 시트와 동일 순서로 표시. (현재 DB 미보존 = 갭)

## 2. 좌측 메뉴 5대 분류 재배치
- 데스크톱(clients/desktop) 좌측 메뉴를 **판매 / 구매 / 회계 / 그룹웨어 / 인사** 5대 대분류로 재배치.
- **배차(arologis)·창고운영은 별도 그룹 유지**(5대 분류에 편입 안 함) — 실질 7그룹.
- 매핑 가이드(현황 기준): 판매=estimates/partner-orders/거래처/dc-config/판매관리, 구매=구매관리/재고이동/입고검수/재고실사/DPS, 회계=기존 회계 그룹, 그룹웨어=메신저/알림매핑/링크발송/단톡방, 인사=인사관리/권한 전체. 배차·창고운영 별도. 설정(시트동기화) 배치는 구현 시 확인.

**Why**: 견적/주문 노출 품목을 정확히 통제(전 품목 노출 방지) + 시트 운영 순서 유지. 메뉴 가독성·업무 권역 정리.
**How to apply**: #30 카탈로그([[project-sheets-to-db-full-migration]]) 후속으로 usageScope 필터+displayOrder 적용. 관련 EstimateCatalogInternalController(#455)·ProductSheetSyncService. 메뉴는 clients/desktop AppLayout.tsx 재구성. 대형 UI 변경이라 Codex 회복(6/11 10:11) 후 구현 적합.

## 2-보강 (2026-06-10 개발책임자 추가 지시)
- **권한 기반 메뉴 필터**: 좌측 메뉴는 기본적으로 **권한이 있는 메뉴만 표시** (canAccess/permission 기반 — 메뉴가 너무 많음).
- **'홈' 최상단 신규**: 대시보드 첫 진입 시 보이는 홈 화면을 '홈' 메뉴로 제일 상단에 추가.
- **'알림 내역'만 상단 유지**, 나머지 전부 판매/회계 등 해당 영역(5대 분류 + 배차·창고운영)으로 이동.

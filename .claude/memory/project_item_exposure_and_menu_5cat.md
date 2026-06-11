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

## §1 완결 (PR-A #457 + PR-B #460 머지 `c3536db1`, 2026-06-11)

usageScope/displayOrder + 수동 토글(usage_scope_manual, sync 보존·soft-delete 보호·시트복귀 rowHash evict) + 품목관리 화면(/products/catalog) + catalog 질의(q·**IN-확장**: PARTNER_ORDER→+BOTH·결정 페이징) 완결. 핵심 잔류 지식:
- `/api/v1/products` = ProductCatalogController (게이트웨이 정확경로) — `/products`(ProductController) 의 usageScope 는 exact-match 시멘틱 분기 (실호출자 0, Javadoc 명시). **정찰 시 게이트웨이 라우팅표 대조 의무** (PR-B 사이클1 P1 근원).
- 표시 순서 진실원 = 시트 행 순서 (바꾸려면 시트에서 행 이동→sync). 시트에 없는 수동 품목은 NULLS LAST 맨 뒤. **화면 직접 순서 조정은 미구현 — 개발책임자 결정 대기** (2026-06-11 새벽 문의).
- 개발책임자 확인 대기: ① 수동 PARTNER_ORDER 품목의 order-app 카테고리 탭 노출(estimateCategory 부여 허용). §2(메뉴 5대분류) 는 미착수 — Codex 회복 후.

## §1-보강: 시트 = 첫 시드 전용 확정 + 품목관리 고도화 (2026-06-11 새벽 개발책임자)

> "구글 시트는 첫 시드 데이터고 추후 조회하지 않는데? 세트인지 아닌지 여부도 알아야하고 출처는 굳이 필요 없잖아. 세트인 품목은 상세에서 구성품 설정 가능해야 하고, 세트를 전표에 넣으면 구성품 자동 전개 여부도."

- **시트 = 시드 전용 확정** ([[project-sheets-to-db-full-migration]] 합치): '시트 동기화' 메뉴는 시드 재적재 비상 수단으로 유지, **시간당 자동 cron 비활성**, 품목관리의 출처(시트자동/수동) 뱃지·'시트 자동 복귀' 버튼 제거.
- **품목관리 고도화 슬라이스**: 세트 여부 컬럼(productType=BUNDLE + 구성품 수) / **구성품 편집기 신설** (BundleComponent CRUD — 기존엔 시트 sync·시더 적재 전용, 편집 수단 없었음) / **표시 순서 화면 직접 조정** (DB 진실원 전환 — @dnd-kit 기성 의존성).
- 사실 확인: 전표 자동 전개는 **기성** (SlipFormPage BUNDLE → BundleOptionRow 옵션 + BundleExpander 6:4 재배분 전개, #439).
- **2차 지시 (동일 새벽)**: ① **세트(BUNDLE) 단위 재고 표시 금지** — 재고는 구성품(시리얼) 단위만. 재고조회/전표 가용재고 경로 감사+가드 ② 표시 순서 수정 시 **관련 품목(동일 카테고리군) 자동 재번호** — 개별 번호 직접 입력·전역 재번호 금지, display_order 는 카테고리 내 정렬.

### ✅ §1-보강 구현·머지 완결 (#461, 2026-06-11)
세트 컬럼(componentCount) · 구성품 편집기(GET/PUT replace-all — **model_code-only 해소축**[expander 정합]·중복/자기참조/미해소/세트안세트 400·비BUNDLE 409) · 표시순서 @dnd-kit 드래그(**estimateCategory 한정 재번호**·노출품목만·전건 paginate) · 실시간 SSE(ProductCatalogChangePublisher **afterCommit 통일**) · **세트 재고 표시금지 가드**(SlipForm + 주문상세 #23 — partner-order 라인 **modelCode enrich** fail-soft, BUNDLE 생성은 시트sync 전용이라 productId≠modelCode synthetic 주의) · 동시성(replaceComponents+sync PESSIMISTIC_WRITE). 신규 endpoint 4종(components·display-orders·lookup-by-model-codes·catalog-realtime) + **V15**. 4-라운드 다모델 리뷰(Opus16·Fable5 24·Codex8 전건fix)+T2 FE모달 실QA 12컷. **§2(메뉴 5대분류·권한필터·홈 — 2·2-보강) 은 미착수 = 다음 대기 큐.**

**Why**: 견적/주문 노출 품목을 정확히 통제(전 품목 노출 방지) + 시트 운영 순서 유지. 메뉴 가독성·업무 권역 정리.
**How to apply**: #30 카탈로그([[project-sheets-to-db-full-migration]]) 후속으로 usageScope 필터+displayOrder 적용. 관련 EstimateCatalogInternalController(#455)·ProductSheetSyncService. 메뉴는 clients/desktop AppLayout.tsx 재구성. 대형 UI 변경이라 Codex 회복(6/11 10:11) 후 구현 적합.

## 2-보강 (2026-06-10 개발책임자 추가 지시)
- **권한 기반 메뉴 필터**: 좌측 메뉴는 기본적으로 **권한이 있는 메뉴만 표시** (canAccess/permission 기반 — 메뉴가 너무 많음).
- **'홈' 최상단 신규**: 대시보드 첫 진입 시 보이는 홈 화면을 '홈' 메뉴로 제일 상단에 추가.
- **'알림 내역'만 상단 유지**, 나머지 전부 판매/회계 등 해당 영역(5대 분류 + 배차·창고운영)으로 이동.

### ✅ §2 구현·머지 완결 (#462, 2026-06-11)
좌측 메뉴 7그룹 IA 재배치(홈·알림 내역 상단 고정 + 판매/구매/회계/그룹웨어/인사 + 배차·창고운영 별도) + **권한필터는 기성(dynamicCanAccess) 보존** + **홈 최상단**(대시보드 리라벨). **접기/펼치기 추가**(개발책임자 추가요구 — SidebarCategory collapsible, **기본 접힘 + 활성 라우트 그룹 자동펼침 + localStorage 영속**, 좌측 과도메뉴 최소화). 배차 그룹 라벨='배차'(arologis 아님). 단톡방 그룹웨어 단일화. **주문서 승인 fail-open 보안 게이트 신설**(partner-auth-service shared:security 의존조차 없던 갭). 임시 워크플로우([[temp-multimodel-review-workflow]]) 전체 순서 첫 적용 — Round C(Fable5)가 CI-RED·보안 적발. **AROLOGIS = 배차담당자 완료·전송 내역(전표 포함) 조회 전용 뷰는 별도 슬라이스**(2026-06-11 개발책임자 분리, [[project-arologis-independent]] 독립 단위) — 배차 작업 그룹과 구분.

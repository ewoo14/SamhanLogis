# 모바일 슬13 — 미이관 입력 폼 ~22곳 1열 (plan)

> 에픽 [모바일 레이아웃 갭 클로저](../specs/2026-06-26-mobile-layout-gap-closure-design.md) 슬13. 슬12a/12입력폼/12b 머지 완결 후속.

## 문제
인라인/전역 다열 grid 폼이 `@media`로 안 덮여 ≤768px 1열 미전환 → 라벨/입력 세로 뭉개짐(견적폼 4열 "거/래/처/명" 세로 분해 등).

## 핵심 접근 — 전역 폼클래스 @media 레버리지(슬10 패턴) + 인라인 one-off
정찰 확인: 3 전역 폼클래스가 @media 1열 규칙 **부재**(global.css):
- `.form-row`(347, `1fr 1fr`) — 3+파일(배차 ArologisManualDispatch 등)
- `.sfp-form-grid--2`(`1fr 2fr`)·`--3`(`repeat(3,1fr)`)(1269) — SlipFormPage
- `.driver-edit-grid`(1567, `1fr 1fr`) — 기사편집

→ 이 클래스들에 `@media (max-width:768px){ grid-template-columns:1fr !important }` 규칙 추가 = 사용 폼 일괄 1열(데스크탑 무회귀, !important로 인라인 미오버라이드). 슬4b FormGrid CSS변수 방식과 병행.

## 대상 (spec 14파일/~22폼 — 라인번호는 #612로 shift, 클래스/페이지명 기준 grep 재확인)
- **전표·회계(8)**: JournalFormPage·TaxInvoiceFormPage·SlipFormPage(sfp-form-grid)·SlipDetailPage(기사편집 driver-edit-grid)·TransferFormPage
- **견적·품목(6)**: EstimateFormPage·ProductFormPage·EstimatePricingConfigPage·EstimateItemsCatalogPage(분류모달)·ProductClassificationsPage
- **그룹웨어(2)**: GroupwareApprovalTemplateAdminPage·GroupwareApprovalCreatePage(2-pane 경계—검토)
- **배차(5)**: DispatchSmsPage·ArologisManualDispatchPage(form-row)
- **공급자(1)**: SupplierProfilePage(입금계좌 편집행 경계—검토)

## 접근 상세
1. **전역 클래스 @media 1열**(최대 레버리지): 위 3클래스 + 정찰로 발견되는 기타 공유 폼-grid 클래스. 데스크탑 무회귀 위해 @media 스코프 한정.
2. **인라인 `style={{gridTemplateColumns}}` one-off**: 공용 `<FormGrid>`(--fg-cols, 슬4b) 교체 또는 페이지 클래스+@media 전환.
3. **제외**: 품목 라인표(수량/단가/금액)·버튼행·읽기전용 표시 grid. 입력 폼 필드 grid만.

## 불변
- **데스크탑 N열 무회귀**(@media≤768 한정, !important는 @media 내). testid/핸들러/계산 보존. Flyway 0, BE 무변경, FE only. 가로 오버플로 0(390px).

## 워크플로우
canonical 8단계. 규모 과대 판명 시 13a(전표·회계+공급자)/13b(견적품목·그룹웨어·배차) 분할. 매 라운드 라이브 QA(390/1280 dev_master)·매 Bundle ScheduleWakeup.

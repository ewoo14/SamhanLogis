# 모바일 슬4c — 상세 페이지 반응형 설계

> 모바일 에픽② 슬4c. 슬1(인증)·슬2(셸)·슬3(DataTable 카드)·슬4a(Modal 풀스크린)·슬4b(폼 1열 FormGrid) 후속. 개발책임자 지정(2026-06-25, "다음 자율 진행"+"PM 권고대로").
>
> 🌙 야간 자율 — 모바일 반응형은 7:30까지 무질문 자율. 본 spec/plan = canonical ① 기획(PM 판정). 구현 = Codex.

## 1. 목표

데스크탑 상세/조회 페이지(9종)가 모바일(≤768px)에서 **라벨-값 1열 세로 스택 + 가로 overflow 0** 으로 표시되도록 반응형 처리. 데스크탑(>768px) 무회귀.

## 2. 배경 — 정찰 결론 (PM 판정 포함)

대상 상세 페이지 9종: `SlipDetailPage`(전표)·`SalesPartnerOrderDetailPage`(주문)·`JournalDetailPage`(분개)·`TaxInvoiceDetailPage`(세금계산서)·`EstimateDetailPage`(견적)·`GroupwareApprovalDetailPage`(결재)·`TransferDetailPage`(이동전표)·`InventoryAuditDetailPage`(실사)·`routes/components/BatchDetailModal`(배치).

- **공통 메타 레이아웃 = `.detail-grid` 전역 CSS 클래스**(`global.css:353` = `grid-template-columns: repeat(auto-fit, minmax(220px, 1fr))`, gap). 항목 = `<div>` 안 `.detail-label`+`.detail-value`. **@media 없음**.
- 🔑 **PM 판정 (Explore 정정)**: `.detail-grid`는 **인라인 스타일이 아니라 전역 CSS 클래스** → **`@media`로 직접 override 가능**(슬4b의 인라인 grid 함정과 다름). 따라서 신규 `DescriptionList` 컴포넌트 **불필요** — `.detail-grid`에 `@media(max-width:768px){ grid-template-columns:1fr }` 추가 = **9페이지 전부 1열** "1변경→전화면" 레버리지(슬3 DataTable 패턴 동형). auto-fit이 좁은 폭에서 일부 collapse하나, ≤768px(태블릿 포함)에서 3열까지 나올 수 있어 **명시적 1열 강제가 모바일 가독성 보장**.
- 잔여 = 일부 페이지의 **인라인 `gridTemplateColumns`**(합계/요약/섹션 — 예 `TaxInvoiceDetailPage` 합계, `BatchDetailModal.batch-detail-meta`) → @media 무력화 대상 → 슬4b `FormGrid` 재사용 또는 개별 반응형.
- 라인아이템 표 = 슬3 공용 `DataTable` 카드화로 이미 모바일 대응(공용 DataTable 사용분). 라이브 QA로 확인.

## 3. 설계

### 3.1 전역 `.detail-grid` 반응형 (1변경 → 9페이지)
`clients/desktop/src/renderer/styles/global.css` `.detail-grid` + `.batch-detail-meta`(BatchDetailModal)에:
```css
@media (max-width: 768px) {
  .detail-grid { grid-template-columns: 1fr; }
  .batch-detail-meta { grid-template-columns: 1fr; }
}
```
→ ≤768px 라벨-값 항목 1열 세로 스택. 데스크탑 auto-fit 무변동.

### 3.2 인라인 grid 잔여 처리 (페이지별, 슬4b FormGrid 재사용)
정찰/라이브 QA로 확정된 detail 페이지 내 **인라인 `gridTemplateColumns`** 중 폼/메타 성격 다열 → `<FormGrid>`(슬4b design-system) 이관 또는 `@media` 불가 시 컴포넌트화. **합계/금액 정렬 행은 신중**(우측정렬 유지, 1열 강제가 어색하면 그대로 두고 가로 overflow만 방지). 데이터 표·버튼 행 제외.

### 3.3 범위 밖
- 새 design-system 컴포넌트 신설 안 함(전역 CSS @media + 기존 FormGrid로 충분).
- 와이드 회계보고서(~7) = 별도 슬라이스(슬3 MAJOR 이월).
- print 레이아웃(상세의 인쇄 양식) 무변경.

## 4. 제약
- **FE-only · Flyway 0 · BE 무변경.** 데스크탑(>768px) 시각 무회귀 최우선(CSS-only).
- design-system 우선(FormGrid 재사용, 신규 컴포넌트 지양). 한국어 주석/커밋 [[feedback_korean_commits]].
- typecheck=`npm run typecheck`. mock gate(CI) 통과. 라이브 QA=실서버 실캡처만 [[feedback_no_fake_data_ever]], 매 리뷰 라운드 귀속.
- 🔑 인라인 grid는 @media 못 덮음(슬4b 교훈) → 전역 CSS 클래스(.detail-grid)는 @media 가능, 인라인은 FormGrid/컴포넌트.

## 5. 검증 (Acceptance)
1. 9 상세 페이지 ≤768px(390px) 메타 라벨-값 **1열 세로 스택**, 가로 overflow 0 — 실 캡처.
2. 데스크탑(>768px) 무회귀(auto-fit 다열·정렬 동일).
3. 인라인 grid 잔여(합계/섹션) 모바일 깨짐 없음.
4. typecheck 0, design-system/desktop 빌드, mock gate green, CI green(GitGuardian dev시드 FP).
5. ⚠️ 상세 페이지는 데이터 필요 → 라이브 QA 시 시드/생성 데이터로 진입(불가 페이지는 "캡처 불가+사유" 정직 보고).

## 6. 워크플로우
canonical 8단계([[feedback_canonical_workflow]]) — ①기획(본문) → ②조기PR → ③Codex → ④Opus↔⑤Codex 0수렴+라운드별 라이브QA → ⑥PM종합 → ⑦CI → ⑧PM 자율머지([[feedback_pm_auto_merge_authority]]). 🌙 7:30까지 무질문 자율. 매 단계 ScheduleWakeup 자각.

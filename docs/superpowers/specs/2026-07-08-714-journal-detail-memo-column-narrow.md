# #714 분개 상세 1024px 메모 열 소실 fix (반응형 좁은 폭 열 배분)

- 브랜치 `fix/714-journal-detail-memo-column-narrow` · 이슈 #714 · 연관 #711
- **UI 구현 결정(정책 아님·PM 자율)**: 메모 열 min-width 보장 + 좁을 때 테이블 가로 스크롤(압축 대신). 거래처 등 고정폭 truncate 회피.

## 문제 (실측 #711 QA)
`JournalDetailPage.tsx` 라인 테이블 고정폭 열(#40+계정과목160+거래처260+차변110+대변110+메모180=860px)이 DataTable `tableLayout='auto'`(기본)로 렌더 → 컨테이너(앱 minWidth 1024px, 사이드바 제외 콘텐츠 폭)가 좁아지면 열 압축 → **1024px서 메모 20px**("메"만·값 비가시). pre-existing(#711 이전 720px→680px 완화).

## 정찰 지도
- 컬럼: `JournalDetailPage.tsx:222-271`(6열·메모 render `JournalCellEllipsis`).
- DataTable(`clients/web/design-system/src/components/DataTable/DataTable.tsx`): `tableLayout?:'auto'|'fixed'`(기본 auto·열 압축)·`fixedLayout` 클래스(table-layout:fixed)·CSS에 overflow:auto 컨테이너(:14) 존재.

## 처방 (자율 결정 — 안전·backward-compat 우선)
- **메모 포함 전 열이 좁은 폭에서 압축되지 않고, 컨테이너가 열 합(860px)보다 좁으면 테이블이 가로 스크롤**되도록. 후보:
  1) 분개 상세 테이블에 `tableLayout='fixed'` + 테이블/컨테이너 `min-width: 860px`(열 합) + 컨테이너 `overflow-x: auto` — DataTable이 minWidth 미지원 시 **backward-compat opt-in `minWidth` prop 추가**(기타 소비처 무영향) 또는 JournalDetailPage-local overflow wrapper.
  2) 메모 열 자체 `min-width`(≥160px 가독) 보장.
- 1024px(minWidth)에서 메모 열이 **최소 가독폭(≥160px)**이거나, 안 되면 테이블 가로 스크롤로 값 접근 가능. 거래처/계정과목 truncate 회피(ellipsis 유지).
- **real-qa 1024px project/케이스 추가**(기존 1440px만 커버·커버리지 공백 — #711 real-qa 스펙에 minWidth 뷰포트 케이스).

## 검증
- desktop typecheck·vitest·real-qa(신규 1024px 케이스: 메모 열 값 가시/스크롤 접근 실측). 라이브 QA before/after 1024px 스샷(메모 소실→가독). 타 DataTable 소비처(거래처/주문/판매전표 목록 등) 회귀 0(공유 컴포넌트 변경 시).

## 워크플로우
조기 PR → 구현(FE) → STEP4 Opus 독립 적대검증(Codex Jul11 한도 대체·개발책임자 승인) → 라이브QA(1024px 스샷) → 0수렴 → PM 종합 → CI → 머지.

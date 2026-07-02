# task5 배차 전표확인 = 판매전표 미리보기 계획

> 구현=Codex(PM 직접구현 금지 [[feedback_pm_no_direct_implementation]]). 조기 OPEN PR→Codex 개발→Opus 5-agent+직접fix+라이브GUI QA게시↔Codex 5-agent+fix+게시 0수렴→PM종합→CI green→머지. 캐논 [[feedback_canonical_workflow]]. 매 라운드 라이브 GUI 스샷([[feedback_live_qa_every_round_screenshots]]).

**Goal(개발책임자 확정):** 배차 화면 "전표확인"을 (현재 텍스트 요약) → **판매전표 문서/인쇄 양식(미리보기)** 렌더. 배차는 full-form 없어 E2/배차 편입 정상(coedit 불요). 소형.

## 정찰 근거 (2026-07-03)
- **전표확인 진입점 2곳** → 동일 `SlipDetailModal` 수렴: 미배차 리스트 row(`UnDispatchedSlipList.tsx:445`)·차량그룹 정차 row(`VehicleGroupCard.tsx:553`) → `DispatchBoardPage.tsx:255` `<SlipDetailModal slipId=.../>`. **SlipDetailModal 유일 소비처=DispatchBoardPage.**
- 현재 `SlipDetailModal.tsx`: `getSlip(slipId)` 후 **텍스트 요약**(전표번호/거래처/기사명/기사연락처/메모 + 단순 라인테이블). "가벼운 미리보기" 주석.
- **판매전표 자산 = `DispatchDocument.tsx`**(props-only "판매전표 인쇄 본문", `slip/roles/sourceWarehouseName/signatures?`). 래퍼 `DispatchView.tsx`(라우트)가 `getSlip`+`listWarehouses`+`fetchApprovalLineStructure('SLIP_OUTBOUND')` 주입 + `useFitOneA4`(A4 축소). "판매전표 출력" 버튼(`SlipDetailPage.tsx:1382`)=이 자산.
- slipId 이미 확보(board→modal slipId=getSlip path param). 추가 매핑 불요. OUTBOUND=판매전표.

## 결정 (권장방향 — ⚠️아침 개발책임자 확인)
- **(a) "판매전표"=`DispatchDocument`**(명칭 자산 일치, "판매전표 출력" 버튼과 동일). 거래명세서(`StatementDocument`)는 별개·비대상.
- **(b) 모달 본문=판매전표 미리보기(DispatchDocument)로 교체 + 상단 compact 기사명/연락처 헤더 유지**(배차 운영자 활용 정보 회귀 방지). 완전 제거 아님.

## Tasks (Codex 구현)
### Task 1 — SlipDetailModal 을 판매전표 미리보기로
- `SlipDetailModal.tsx`: 기존 `getSlip` 유지 + 쿼리 2개 추가(`listWarehouses`→sourceWarehouseId 매칭 name, `fetchApprovalLineStructure('SLIP_OUTBOUND')`→roles). 본문 요약 라인테이블 → **`<DispatchDocument slip roles sourceWarehouseName />`** 렌더(`useFitOneA4` A4 축소). 로드 실패 graceful(`fallbackRoles('OUTBOUND')`·'-').
- 상단 compact 헤더: 기사명/기사연락처 1줄 유지(배차 컨텍스트). Modal size 유지/조정.
- (선택) footer 인쇄 버튼 `window.print()` — 단 모달 오버레이 ↔ 인쇄 CSS(`.paper`/`@media print`/`.no-print`) 충돌 없을 때만. 충돌 시 "판매전표 출력"(전체 라우트)로 네비 링크 대체.

### Task 2 — A4-in-modal 레이아웃
- `useFitOneA4` zoom + 모달 내 가로 스크롤/스케일 CSS. Modal size="lg" 폭에서 A4 문서 가독성.

### Task 3 — 라이브 GUI QA + dev-report
- real-qa(mock OFF·:8080·dev_master): 배차보드 → 미배차 row & 차량그룹 정차 row 전표확인 → **판매전표 미리보기 모달** 단계별 GUI 스샷 `docs/qa/task5-dispatch-slip-preview/`. dev-report `docs/dev-reports/2026-07-03-task5-dispatch-slip-sales-preview.md`.

## 리스크
- A4 문서 모달 내 스케일/스크롤 · `window.print()` 모달 스코프 · 기사정보 회귀(헤더 유지로 완화) · SlipDetailModal 단일 소비처(DispatchBoardPage)라 영향 국소.

## Self-Review
- 커버리지: 전표확인 2진입점 동일 모달 → 1곳 수정으로 양쪽 커버 ✅. DispatchDocument 재사용(신규 컴포넌트 0).
- 주의: 판매전표=DispatchDocument 확정(아침)·기사정보 병존·A4 모달 스케일·인쇄 스코프.

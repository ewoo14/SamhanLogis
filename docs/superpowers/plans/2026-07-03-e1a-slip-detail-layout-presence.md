# E1-a 전표 상세 레이아웃 정비 — 협업패널/이력 최하단 + presence 상단 리프트 계획

> 구현=Codex(PM 직접구현 금지 [[feedback_pm_no_direct_implementation]]). 조기 OPEN PR→Codex 개발→Opus 5-agent+직접fix+라이브GUI QA게시↔Codex 5-agent+fix+게시 0수렴→PM종합→CI green→머지. 캐논 [[feedback_canonical_workflow]]. 매 라운드 라이브 GUI 스샷([[feedback_live_qa_every_round_screenshots]]).

**Goal(개발책임자 확정):** 전표 상세(`SlipDetailPage.tsx`, 출고/입고 공용)에서 ①**협업 메모+수정이력을 폼 최하단으로**(현재 헤더~품목테이블 사이 중간) ②**presence(보는 사람) 표시를 코멘트 영역→문서 상단·더 크게**. 순수 레이아웃/배치 정비(편집 로직 무변).

**Tech:** React(clients/desktop), design-system PresenceIndicator(5패널 공용).

## 정찰 근거 (2026-07-03)
- 협업패널 `SlipCollaborationPanel` = `SlipDetailPage.tsx:1887-1915`(isMobile 삼항, 협업메모+PresenceIndicator 포함). 버전/수정 이력 = `1917-1969`(모바일 전용, 데스크톱 null).
- presence: `usePresence`/`PresenceIndicator` 는 SlipDetailPage 아닌 **SlipCollaborationPanel 내부**(usePresence :148, `<PresenceIndicator entries={presenceEntries}/>` :279 — 패널 내 사용처 2곳뿐).
- `PresenceIndicator` props=`{entries}` 만(size 없음, fontSize/dot/chip 하드코딩). Estimate/GroupwareApproval/Journal/PartnerOrder/Slip **5패널 공용**.
- "최하단" 앵커: 하단 액션바(2606) 직전(액션바 최하단 유지) 권장. 반려사유 Card(2601) 뒤.
- 스코프: 이동 블록 참조값 전부 컴포넌트 본문 최상위 const → 순수 리오더 안전. 리스크=CSS 간격·모바일 collapsible 순서.

## Tasks (Codex 구현)
### Task 1 — PresenceIndicator `size` 옵셔널 프롭 (design-system, 하위호환)
- `clients/web/design-system/src/components/PresenceIndicator/PresenceIndicator.tsx`: `size?: 'md' | 'lg'`(기본 'md'=현행). 'lg'=fontSize/dot/chip padding 확대(예: 14/10×10/여백↑). 기존 5패널 무프롭 호출 불변(md 기본). `PresenceIndicator.test.ts` 에 size 프롭 렌더 회귀 케이스 추가.

### Task 2 — presence 페이지 상단 리프트 (C)
- **선행 확인**: `SlipCollaborationPanel` 사용처가 SlipDetailPage 전용인지 grep(타 페이지 사용 시 presence 제거 영향 → 그 경우 별도 처리). 정찰상 slip 전용 추정.
- `SlipCollaborationPanel.tsx`: `usePresence`(148)+`<PresenceIndicator>`(279) **제거**(이중구독 방지). 패널은 협업메모/코멘트/coedit 만 유지.
- `SlipDetailPage.tsx`: 최상단 바(1295 `SlipNumberDisplay` 부근)에 `usePresence({entityId:id, enabled:!!id})` 호출 + `<PresenceIndicator entries={...} size="lg"/>` 렌더(문서 상단·확대). UUID 비노출 유지(PresenceIndicator 는 표시명만).

### Task 3 — 협업패널+이력 최하단 이동 (A)
- `SlipDetailPage.tsx`: 블록 `1887-1915`(협업패널 삼항) + `1917-1969`(버전/수정 이력 모바일) 를 **하단 액션바(2606) 직전**으로 이동(순수 JSX 리오더). 헤더 read-only "메모"(1852-1867)는 헤더 Card 소속=이동 대상 아님. 모바일 collapsible 순서/간격 자연스럽게(협업·이력이 품목/서명 뒤).
- CSS 간격 필요 시 `global.css` 최소 조정.

### Task 4 — 라이브 GUI QA + dev-report
- real-qa(mock OFF·:8080·dev_master) 데스크톱: 상세 진입 → presence 상단 확대 표시 + 협업패널/이력 최하단 배치 단계별 GUI 스샷 docs/qa/e1a-slip-detail-layout/. 모바일 뷰포트도 1컷(순서 확인). dev-report `docs/dev-reports/2026-07-03-e1a-slip-detail-layout-presence.md`.

## 백로그(스코프 밖)
- 품목 행 추가(add-row): read-only 툴바 alert 스텁·편집모달 공히 부재 → 별도.
- B(모달→인라인 편집)=E1-b 별도 PR.

## Self-Review
- 커버리지: A(이동)·C(presence 리프트+size) 전부 Task1-3. B 제외(E1-b). ✅
- 주의: ①presence 이중구독(패널서 반드시 제거) ②5패널 size 하위호환 ③모바일 순서 라이브 확인 ④SlipCollaborationPanel 타페이지 사용 여부 선확인.

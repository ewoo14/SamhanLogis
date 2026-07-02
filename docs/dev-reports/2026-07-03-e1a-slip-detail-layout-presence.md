# E1-a 전표 상세 레이아웃 정비 — 협업/수정이력 최하단 + presence 상단 리프트

- **PR**: #701 · **슬라이스**: E1 클러스터 (A)(C) — B(모달→인라인)=E1-b 별도
- **일자**: 2026-07-03 · **구현**: Codex(gpt-5.5) · **리뷰/fix**: 순차 듀얼리뷰(Opus 5-agent + Codex)

## 목표 (개발책임자 확정)
전표 상세(`SlipDetailPage.tsx`, 출고/입고 공용): (A) 협업 메모+수정이력을 **폼 최하단**으로(현 중간) · (C) presence(보는 사람)를 코멘트 영역→**문서 상단·확대**.

## 구현
1. **`PresenceIndicator` `size?: 'md'|'lg'`**(하위호환): md=현행(12px/dot8/pad2·8), lg=확대(14px/dot10/pad4·10, maxWidth 240). 기존 5패널(Estimate/GroupwareApproval/Journal/PartnerOrder/Dispatch) 무프롭=md 불변. `PresenceIndicator.test.ts` size='lg' 회귀 추가.
2. **presence 리프트(C)**: `usePresence`+`<PresenceIndicator>`를 `SlipCollaborationPanel`→`SlipDetailPage` 상단(전표번호 옆, size lg)으로. 패널에서 완전 제거(이중구독 방지).
3. **최하단 이동(A)**: 협업패널 + 버전/수정이력 블록을 하단 액션바 직전으로 순수 JSX 리오더(참조 변수 전부 컴포넌트 최상위 스코프 → 안전). 헤더 read-only "메모" 불변.

## 순차 듀얼리뷰 — Opus 라운드1 적발·fix (Opus 직접)
- **[BLOCKING·FE]** `slip-collab-panel.spec.ts`(mock 회귀 hard-gate, CI qa-e2e) presence 단언이 **패널 스코프**(`panel.getByTestId('presence-indicator')`) → presence 페이지 이동으로 스코프 밖 → 2 테스트 timeout FAIL(CI 적색). typecheck/build 미포착. → **page 스코프로 교정**(5/5 통과).
- **[HIGH·FE/BE]** `usePresence`가 `detailQuery` 선언·`isError` early-return **이전** 호출 → 로드실패(404/403)에도 join+heartbeat 유지(본인은 화면서 못 보는데 동료 목록엔 "보는 중"). → **detailQuery 이후로 이동 + `enabled: !!id && !!detailQuery.data`** 게이팅.
- **[HIGH·Design]** 상단 헤더 행 `flexWrap` 부재 → presence lg(본인 세션 상시 칩)가 모바일(`overflow-x:hidden`)/좁은 데스크톱서 잘림 위험. → **헤더 flex 컨테이너 `flexWrap:'wrap'`+rowGap**(라이브 모바일 캡처로 2행 배치 실증).
- **[LOW·Design]** 헤더 pill 3종 `alignItems:'baseline'`→`'center'`. **[NIT·FE]** presence 제거로 패널 헤더 dead `justifyContent` 정리.
- **fast-follow(백로그)**: 모바일 "버전 이력/수정 이력" 제목이 패널 내부 + 별도 블록으로 2회 노출(pre-existing, A/C 스코프 밖) — 라벨 구분 또는 두 이력 시스템 통합 후속. presence `+N` Badge lg 미확대(>3명 희소).

## 검증
- `npm run typecheck`(node+web) 통과 · vitest collab **8파일/34** 통과 · 전체 vitest 73파일/509(FE agent) · **slip-collab-panel Playwright 5/5**(BLOCKING fix 실증).
- **라이브 GUI QA**(real-qa `e1a-slip-detail-real-qa`, mock OFF·:8080·dev_master·실 슬립 2026/06/27-3): `docs/qa/e1a-slip-detail-layout/` — desktop 상단 presence lg + 최하단 협업/이력 + fullpage, 모바일 상단 presence(flexWrap 2행)+fullpage.
- BE 무변경(FE-only)·presence 계약 정합(entityId=id·신규 엔드포인트 불요)·UUID 비노출(displayName만)·5패널 하위호환.

## 백로그
- E1-b: 품목행 모달→인라인 편집(별도 PR·회귀축 다름).
- 품목 행 추가(add-row): read-only 툴바 alert 스텁·편집모달 공히 부재.
- 모바일 이력 중복 라벨 정리·presence +N lg 확대.

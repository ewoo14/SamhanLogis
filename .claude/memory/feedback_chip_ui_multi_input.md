---
name: feedback-chip-ui-multi-input
description: 다중(중복) 추가 입력은 캡슐(칩) 형태로 통일 — 결재자/첨부/태그 등. 품목 라인(표)은 제외
metadata:
  type: feedback
---

2026-06-14 개발책임자 지시. **여러 개를 중복으로 추가하는 입력은 모두 캡슐(칩) 형태**로 통일한다(사용자 가독성). 결재자(사원 이름 검색 → 칩), 첨부(문서참조/파일 → 칩), 태그 등 "항목 나열" 입력 전반.

**Why**: 쉼표/줄바꿈 구분 텍스트 다중 입력은 무엇이 들어갔는지 한눈에 안 보임. 칩(`label : value` + 제거 X)이 직관적이고 제거도 명확.

**How to apply**:
- design-system `TagChip`(label:value + onRemove, removeLabel 로 제거 aria-label 실명) + `AsyncAutocomplete`(서버검색 → 선택 시 칩 배열 push, value=null 로 연속 추가) **재사용**.
- 🔄 **2026-07-18 supersede(#825 슬4 D-S4-02)**: "각자 hand-roll 금지·신규 컴포넌트 금지" → **두 primitive를 조합·패키지한 표준 컴포넌트 `MultiSelectAutocomplete`(엔티티) / `FreeTextChipInput`(임의 문자열)로 통일**. 3화면(결재작성·결재선설정·CODEF)이 각자 hand-roll 하던 것을 표준화(재발명 아님=TagChip+AsyncAutocomplete 조합 유지). delta API(onAdd/onRemove)·filter-selected(멀티 ARIA)·prefill 경합/순서 보존·opaque DOM id(슬3) 상속. → [[feedback_reconvergence_before_merge]]·[[feedback_design_system_playwright_mock_suite]]
- **품목 라인(수량/단가/금액 표)은 칩 제외** — 표 형태 유지(개발책임자 명시). "항목 나열"만 칩, 컬럼 있는 라인은 표.
- 칩은 실명/번호 표시, UUID 는 내부 식별자로만([[uuid-no-user-visibility]]).
- 적용 사례: §7 그룹웨어 결재 PR #480 — 결재선(사원검색 칩) + 첨부(문서참조/파일 칩). 첨부는 입력 완료 시 입력행 숨기고 칩만 표시(제거 단일화).

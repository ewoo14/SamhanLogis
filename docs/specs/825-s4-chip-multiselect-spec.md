# #825 슬4 — 칩 복수선택 표준 컴포넌트 foundation (기획 spec)

- 에픽: #825 전역 입력 UX (슬4/7)
- 기준일: 2026-07-18
- 브랜치: `feat/825-s4-chip-multiselect` (base `main`)
- 진실원: 슬4 정찰(§3 감사) · 슬1~3 동형 · [[feedback_chip_ui_multi_input]]
- 기획: OPUS 4.8 · 복수값 입력 정찰 실측

## 0. 개발책임자 결정
| # | 항목 | 결정 |
|---|---|---|
| D-S4-01 | foundation 방식 | **인라인 기본** — AsyncAutocomplete(슬3)→칩 누적 인라인 표준 컴포넌트. 에픽 원문 "모달"은 특수케이스 후속 |
| D-S4-02 | 전환 범위 | **리팩터+신규** — 기존 hand-rolled 칩 화면을 신규 컴포넌트로 표준화(중복 제거) + 결재양식 옵션(CSV→칩) 신규 |
| D-S4-03 | free-text 칩 | 결재양식 SELECT 옵션(임의 문자열·엔티티 아님) = free-text-value 칩 변형 |
| D-S4-04 | 세금계산서 묶음발행(원천전표 List) | (c) 후속 — 표 checkbox 유지(슬4 미포함) |
| D-S4-05 | CodefImportScope 범위(null=전체) | **슬5 이관** — ① null-semantics 소관이라 칩 리팩터도 슬5(경계 보존·슬4 미착수) |

## 1. 스코프 (foundation + 전환)

### ① design-system — MultiSelectAutocomplete 표준 컴포넌트 (신규·핵심)
- **갭**: 엔티티 async 검색→복수 선택→칩 누적 컴포넌트 부재. 3화면이 `AsyncAutocomplete value={null}` + `TagChip 리스트` + remove 를 각자 hand-roll.
- 신규 `MultiSelectAutocomplete<T>`(design-system): AsyncAutocomplete(슬3·검색부·하이라이트·opaque DOM id) + 선택 시 배열 append + `TagChip` 리스트(개별 remove) + **getKey 기반 dedup**(중복 선택 차단). props: `value: T[]`·`onChange:(T[])`·`searchOptions`·`getKey`·`getChipLabel`·`renderOption?`·`max?`·`label`·`disabled`·`error`. UUID 화면/DOM 비노출(getKey opaque·칩 label=실명/번호).
- **free-text 칩 변형**(D-S4-03): 엔티티 검색 없이 임의 문자열 입력→칩(Enter/쉼표 구분·dedup). 결재양식 옵션용.
- 산출: Storybook + vitest + contrast test + **Playwright mock 스위트**(ac-스타일·슬1~3 교훈: design-system 변경=회귀 게이트 필수).

### ② 전환 (D-S4-02 리팩터)
- **리팩터(hand-roll→표준)**: `GroupwareApprovalCreatePage`(결재선/추가결재자·`:506-548`)·`ApprovalLineConfigPage`(역할별 결재자·`:784-815`) — AsyncAutocomplete+TagChip hand-roll을 MultiSelectAutocomplete로. 바인딩(`approvers[]`) 계약 보존.
- **신규 적용**: `GroupwareApprovalTemplateAdminPage`(SELECT 옵션 `optionsText` CSV free-text·`:109-112,264`) → free-text 칩. `.split(',')` 배열 계약 보존.
- **후속/제외**: CODEF(슬5·D-S4-05)·세금계산서 묶음발행(c·D-S4-04)·견적 노출 카테고리(에픽#18 완료·표시만).

### ③ 감사 dev-report
- §3 감사표(이미칩/(a)/(b)/(c)) dev-report 박제(진실원·슬1~3 동형).

## 2. 기존 컴포넌트 현상 (정찰)
- `TagChip`(단일 프레젠테이션 칩·재사용 primitive)·`AsyncAutocomplete`(단일선택·슬3 opaque id)·`TagInput`(kv free-text·desktop 미사용). **엔티티 복수선택 컴포넌트 부재**.

## 3. 복수값 입력 감사표 (요약)
- **이미 칩(참조/리팩터)**: 결재선/추가결재자·역할별 결재자(→리팩터)·첨부(문서참조+파일)·CODEF 범위(→슬5).
- **(a) 즉시 칩화**: 결재양식 SELECT 옵션(CSV→free-text 칩).
- **(c) 후속**: 세금계산서 묶음발행(표 checkbox 유지).
- **(b) 유지**: 권한그룹(M:N assign)·발송금지(슬2 표준화)·세트구성품/품목사양(표·[[feedback_chip_ui_multi_input]] 품목 라인 제외)·라인 remove(품목/분개 삭제·칩 아님).
- **⚠️ 함정**: inventory `Batch*Request` 6종=이름만 batch·스칼라(칩 오설계 금지).

## 4. 기존 결정 교차검증
| 규칙 | 준수 |
|---|---|
| UUID 비공개 [[feedback_uuid_no_user_visibility]] | 슬3 opaque DOM id 상속·칩 label=실명/번호·getKey 비노출 |
| 칩 UI 다중입력 [[feedback_chip_ui_multi_input]] | TagChip+AsyncAutocomplete·품목 라인 표 제외 |
| design-system 변경=Playwright mock [[feedback_design_system_playwright_mock_suite]] | 신규 컴포넌트 ac-스타일 mock + 리팩터 3화면 무회귀 |
| 범위 점증 리뷰 재가동 [[feedback_expanded_scope_reinstate_review]] | 공유 컴포넌트(AsyncAutocomplete/TagChip) 변경 시 전 소비처 무회귀 |
| 무결성 pre-confirm | 슬5(null-semantics·CODEF) 미착수 경계 |

## 5. 검증 계획
- **FE**: DS vitest(MultiSelect·free-text 칩·dedup·contrast)·build·typecheck. desktop typecheck·vitest.
- **Playwright mock**: 신규 컴포넌트 회귀(검색→복수선택→칩→remove→dedup·UUID DOM 미노출)·**리팩터 3화면 무회귀**(결재선·역할별 결재자·결재양식)·AsyncAutocomplete/TagChip 소비처 무회귀.
- **라이브 QA**: 실 :8080·결재 생성 결재선 복수선택 칩+DOM UUID 미노출 실증.
- **적대검증**: OPUS 5+agent → CODEX SOL 5+agent → 머지 전 재수렴(2-model 단독신뢰 금지 [[feedback_reconvergence_before_merge]]). 리팩터 무회귀 집중.

## 6. 리스크
- 리팩터가 결재 생성/결재선 설정 co-edit·계약(approvers[]·GROUP/USER 복합키) 깨지 않도록 무회귀 게이트.
- MultiSelectAutocomplete의 dedup·max·키보드(칩 remove 포커스)·접근성(칩 리스트 aria).
- AsyncAutocomplete 재사용 시 슬3 opaque id·하이라이트 정합.

## 7. 팀 배치 (구현=CODEX LUNA 5.6)
- design-system: MultiSelectAutocomplete + free-text 칩 변형 + Storybook/vitest/contrast.
- FE(desktop): GroupwareApprovalCreate·ApprovalLineConfig 리팩터 + GroupwareApprovalTemplate 신규. 감사 dev-report.

---
연관 Issue: #825

# 그룹웨어 결재 full-form coedit 구현 계획 (협업 full-form 4/6)

> 2026-07-01. 트랙 [4]. 협업 full-form 롤아웃 4번째(slip·주문 #689·견적 #691 → **결재**). FE-only, BE=0. 정찰 a4ecf71e.

## Goal
그룹웨어 결재 문서의 **본문(title / content / 동적필드)을 full-form 라이브 coedit**한다. 현 메모 1차(#684) 옆에 `createDocCoeditProvider`(header Y.Map)를 editMode에서 배선 — 수정 중 title/content/동적필드가 2세션 실시간 공유. 저장(commitGroupwareApprovalCollabEdit changeSet)·상태게이트·relay는 불변.

## 배경 — 정찰 결과
- 결재는 **라인 아이템 없는 header-only** full-form(order/estimate의 strict subset — `items`/`replaceItems`/라인재조정 전부 생략).
- 현 editMode 폼(`GroupwareApprovalCollaborationPanel.tsx`): title=`Input`(L431-437), content=`textarea rows5`(L441-457, **멀티라인**), 동적필드=`DynamicApprovalFieldInput`(L462-469, 타입 TEXT/NUMBER/DATE/SELECT/TEXTAREA).
- 저장: `commitGroupwareApprovalCollabEdit`(L214-258)가 currentValues vs drafts diff → changeSet `{title, content, field.<key>}`. **coedit는 draft를 live-share만, commit 의미 불변.**
- BE 0: relay 3엔드포인트(`GroupwareApprovalCollabController` L199-228)·mock 핸들러(`mock.ts` L9309-9352) 전부 #684에 존재. full-form은 **같은 basePath 재사용**(메모 `Y.Text 'memo'` ↔ full-form `Y.Map 'header'` 다른 root key라 무충돌, 검증됨).

## 결정 (PM, shipped 패턴 정합 — PR에 누적 게시)
- **D1** content + TEXTAREA 동적필드 = **whole-value 멀티라인 어댑터**(headerTextFields Y.Text nuke-reinsert, order/estimate whole-value header text 동일). char-CRDT는 전 full-form 공통 후속(본 슬라이스 제외).
- **D2** SELECT 동적필드 = **LWW-no-cursor**(order `categoryKey` 선례 — plain Select + `setHeaderValue`). NUMBER/DATE/TEXT = `CollaborativeSlipInput`(type).
- **D3** coedit 트리거 = **editMode 게이트**(order/estimate 동일, 기존 `canStartEdit`/`isEditableStatus` PENDING/IN_PROGRESS 상태게이트 상속 — 신규 상태로직 0).
- **D4** provider header 키 = **dot-free**(`title`·`content`·`field_<fieldKey>`) — fieldPath 충돌 회피. changeSet은 commit 시 `field.<fieldKey>` 유지(provider 키와 decoupled, drafts vs currentValues diff).

## 비목표 (별도 후속)
- header text char-CRDT(커서/IME) = 전 full-form 공통 트랙A 후속.
- 회계·배차 full-form = 트랙 종료 후.

## Global Constraints
- **FE-only**. BE/게이트웨이/Flyway/relay/엔드포인트 변경 0.
- **commit 의미 불변**: changeSet 저장경로(`commitGroupwareApprovalCollabEdit`)·상태게이트·edit history 그대로. coedit는 draft live-share만.
- **awareness 네임스페이스**: doc-provider는 `header.*` 사용(메모 `field.memo`와 무충돌 — #689 검증). fieldPath 충돌 gotcha(D4) 엄수.
- typecheck `npm run typecheck` 0, 변경모듈 vitest green.

## 변경 (파일)
### 1. `components/collab/CollaborativeSlipTextArea.tsx` (신규) — 멀티라인 어댑터
`CollaborativeSlipInput`의 textarea 변형: `provider.getHeaderValue(fieldPath 2-seg)` 읽기 + onChange `provider.setHeaderValue(...)` + `provider.setLocalLastEdit('header.<key>')` + edit-pulse 배지. (또는 `CollaborativeSlipInput`에 `multiline`/`as="textarea"` prop 추가 — 구현자 판단, 단일 헬퍼 유지.)

### 2. `components/groupware/DynamicApprovalFieldInput.tsx` → coedit-aware 변형(또는 신규 `CollaborativeDynamicApprovalFieldInput.tsx`)
`provider` + dot-free `fieldPath`(`field_<key>`) 수신, `field.fieldType` 스위치: SELECT→plain `Select`+`setHeaderValue`(LWW·커서 없음), TEXTAREA→어댑터(1), TEXT/NUMBER/DATE→`CollaborativeSlipInput`(type). provider 없으면(fallback) 기존 plain 입력.

### 3. `components/collab/GroupwareApprovalCollaborationPanel.tsx` (핵심) — createDocCoeditProvider 배선
**order `SalesPartnerOrderDetailPage.tsx` L404-464 provider effect를 1:1 미러, 라인 제거**:
- gate `canWrite && editMode` → `createDocCoeditProvider({documentId: approvalId, basePath: collabBasePath, headerTextFields: new Set(['content', ...TEXTAREA fieldKeys])})`.
- seed: `isEmpty()`면 `setHeaderValue('title', currentValues.title)`·`setHeaderValue('content', currentValues.content)`·각 field `setHeaderValue('field_'+key, currentValues.fieldValues[key])`. **items/replaceItems 없음.**
- `applyProviderState`(subscribeDoc): header 읽어 `setTitleDraft`/`setContentDraft`/`setFieldDrafts`.
- 실패 시 `provider=null` plaintext fallback + `coeditPending` 게이트(수정완료 버튼) — order/estimate 동일.
- cleanup destroy.
- editMode 폼 입력 치환: title→`CollaborativeSlipInput header.title`, content→어댑터(1), 동적필드→변형(2). **commit(changeSet) 로직 불변**(drafts는 이미 provider가 채움).

### 4. `GroupwareApprovalCollaborationPanel.coedit.test.tsx` — full-form 필드 배선 단언
`EstimateFormPage.coedit.test.tsx` 모델: provider seed·title/content/동적필드 draft 반영·SELECT LWW·commit changeSet(`field.<key>` dot 유지) 단언. mock coedit 핸들러 기존(L9309-9352) 재사용.

## Verification
- `cd clients/desktop && npm run typecheck` → 0.
- `npm run test` → 변경 스위트 green.
- **라이브 QA(실 캡처)**: 결재 상세 editMode 2세션 — 한쪽 title/content/SELECT 동적필드 편집 → 상대 SSE 양방향 반영(-reflected 실캡처, 견적 #691 패턴)·fieldPath 충돌 없음(동적필드 독립)·메모 char-CRDT 커서 무회귀·commit(수정완료) 후 값 영속.

## DoD ([[feedback_canonical_workflow]])
조기PR → Codex 구현 → Opus 5-agent+fix+라이브QA(2세션 반영)+TM게시 ↔ Codex 5-agent+fix+QA+TM게시 0수렴 → PM 종합 → CI green → squash 머지 → 핸드오프 갱신(트랙[4] 완료·협업 full-form **4/6**·잔여 회계(BE update 최대규모)/배차(저가치)). 결정 D1~D4 PR 게시.

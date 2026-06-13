# §7 전역 협업 슬라이스 6 — 그룹웨어 결재(ApprovalLine) 구현 + collab

> 에픽 [[project_global_collab_epic]] · collab-core 6번째(최종) 문서. 워크플로우: Opus 4.8 ↔ Codex(Fable5 영구 제외).
> 기획 → Codex 개발 → Opus 라운드(실서버 QA) → Codex 라운드 → 수렴 → PM 머지.

## 1. 슬라이스 개요

| 항목 | 내용 |
|---|---|
| 문서 | groupware-service `ApprovalLine`(독립 결재 문서 — 전표 미연결, 개발책임자 "전표"=결재문서 자체 해석) |
| 신규 구현 | **결재 FE 전무 → 목록/상세 신규 구축** + collab 패널 (이전 5슬라이스는 기존 화면에 collab만 롤아웃) |
| 결재문서번호 | 신규 `approvalNo` 전표번호 표준 `YYYY/MM/DD-N`(슬래시) — `ApprovalNumberSequence` 채번(KST 일자) |
| collab 편집(soft) | `title`(제목) + `content`(본문) |
| 핵심 불변(400) | approvalNo·status·steps(결재선)·requesterId·decidedAt·reason |
| COLLAB_LOCKED(409) | **APPROVED(최종 결재 완료)** + REJECTED + WITHDRAWN. 편집 허용 = PENDING/IN_PROGRESS |
| 알림 | 기여자(요청자 + 결재 step approver + 코멘트 작성자) · editor 제외 · username→UUID · 트랜잭션 내 동기 best-effort(AFTER_COMMIT 금지) |
| page-code | 신규 `groupware.approvals`(collab 분리) |
| 라우팅 | UUID(`/admin/groupware/approvals/{id}/collab/...`) — 게이트웨이 no-strip 라우트 |
| CollabDocumentType | +`APPROVAL_LINE`(6→7) + 전 collab 테이블 document_type CHECK 마이그 |

## 2. BE (groupware-service)

- **결재문서번호**: `ApprovalLine.approvalNo`(VARCHAR 30) + `ApprovalNumberSequence`/`ApprovalNumberService`(KST 일자, row-lock 채번) + `open(approvalNo, requesterId, title, content)` 배선 + `V4__add_approval_number_and_collab.sql`(컬럼 + 백필 + 시퀀스 테이블).
- **collab**: `ApprovalLine` `@Version` + overlayTitle/overlayContent(TITLE_MAX 200/CONTENT_MAX 2000 길이검증 400) + `guardCollabModifiable`(COLLAB_LOCKED 409). `collab/` 패키지 = `GroupwareApprovalDocumentCollaborationPort`(title/content overlay 화이트리스트, status 등 핵심필드 400) · `GroupwareApprovalCollabEditService`(1-인 수정완료 = changeSet 검증→enrich(before)→overlay batch→ACCEPTED 이력→알림 in-transaction best-effort·SSE publish) · `ApprovalCollabComment/Suggestion` + Repository + Config.
- **컨트롤러**: `GroupwareApprovalCollabController`(/admin/groupware/approvals/{id}/collab/{comments,edits,stream}, `@RequirePermission(groupware.approvals)`) + `GroupwareAdminController` 조회 GET(목록 `?status=` + 상세 `/{approvalId}`).
- **CollabDocumentType +APPROVAL_LINE** + 전 collab 테이블 document_type CHECK forward 마이그.

## 3. FE (clients/desktop)

- **결재 목록** `GroupwareApprovalListPage`(`/groupware/approvals`, approvalNo 슬래시·상태 배지·상태 필터·요청일) → **상세** `GroupwareApprovalDetailPage`(`/groupware/approvals/:id` UUID, approvalNo 슬래시·내용·결재선 steps).
- **collab 패널** `GroupwareApprovalCollaborationPanel`(수정완료=제목/내용 편집 + diff before→after + 코멘트, COLLAB_LOCKED 안내, `canAccess('groupware.approvals')` 가드).
- api 클라이언트 `groupwareApproval.ts` + `groupwareApprovalCollab.ts`, realtime SSE 클라이언트. 좌측 메뉴 그룹웨어 → **결재**.

## 4. 🚨 라이브 QA 단독 적발 — P1 권한 카탈로그 시드 누락 (Opus 라운드 fix)

**증상**: dev_master(MASTER) 로그인 후 `/groupware/approvals` 진입 시 **대시보드로 리다이렉트** — 결재 화면·메뉴 진입 불가.

**근인**: 신규 page-code `groupware.approvals` 가 **auth-service `PageCode` enum 미등재**. FE `PermissionGuard` → `usePermissions().canAccess()` 는 `/auth/admin/permissions/my` 매트릭스에 page-code 엔트리가 있어야 통과하는데, MASTER 매트릭스는 `DynamicPermissionService.getMyPermissions()` 가 `PageCode.values()` 전체를 동적 반환 → **enum 부재 = MASTER 에게도 미반환 = canAccess false = 리다이렉트**. FE 라우트/메뉴/API/BE @RequirePermission 은 모두 `groupware.approvals` 를 참조했으나 권한 카탈로그 한 곳만 누락 → 화면 전체가 도달 불가.

**fix**:
- `PageCode.java` + `GROUPWARE_APPROVALS("groupware.approvals", "그룹웨어 결재")` — MASTER 즉시 전권(enum 동적 반환).
- `V55__seed_groupware_approvals_page_permission.sql` — MASTER + MANAGER 명시 row(기존 그룹웨어 관리 게이트 `messenger.admin` 미러). 비-MASTER 매트릭스/위임 일관성.

**교훈**: 신규 page-code 는 ① FE PageCode 타입 ② FE 라우트/메뉴 canAccess ③ BE @RequirePermission **외에 ④ auth-service `PageCode` enum(+필요시 시드 마이그)** 까지 4곳 동시 등재 필수. mock suite 는 권한 매트릭스를 mock 하여 false-green → **실서버 라이브 QA(실 매트릭스)가 단독 적발**. [[feedback_fe_canaccess_pagecode_be_match]] · [[feedback_defect_family_sweep_fix]] 계열.

## 5. 실서버 라이브 QA (dev_master 실 로그인, VITE_MOCK_MODE off, 게이트웨이 :8080)

`docs/qa/groupware-approval-collab/` 8컷 — 모두 실 시드 결재 문서:

1. `01-approval-list` — 결재 목록(approvalNo 슬래시 `2026/05/16-N`·상태 배지)
2. `02-detail-pending` — PENDING 상세(슬래시 번호·내용·결재선·협업 패널·결재 메뉴 활성)
3. `03-edit-form` — 수정완료 진입(제목/내용/사유)
4. `04-edit-filled` — 입력 상태
5. `05-edit-committed` — 즉시 커밋("수정완료되었습니다") + diff 이력
6. `06-diff-history` — 제목/내용 before→after + 사유 + **KST 타임스탬프**
7. `07-comment-added` — 코멘트 등록(KST·해결/삭제 액션)
8. `08-approved-locked` — APPROVED(최종완료) 잠금 안내 + 수정 버튼 없음

**KST 검증**: 수정완료/코멘트 타임스탬프 = `2026-06-14 08:2x`(실행 시각 UTC 23:2x + 9h) — PR #479 KST 전역화 end-to-end 실증([[project_kst_timezone_standard]]).

**API 직접 검증**: APPROVED 결재 수정 → **409 CONFLICT**("협업 수정완료가 불가능한 상태입니다: APPROVED"); core-field(status) 수정 → **400 INVALID_INPUT**("title, content 만 수정할 수 있습니다").

## 6. 검증 요약

- BE: groupware 모듈 테스트 + `ApprovalCollabIT`(실 Testcontainers — 수정완료·409·400·deny·알림·CHECK·fresh-session).
- FE: desktop typecheck(`npm run typecheck`) 0 + collab playwright + 실서버 라이브 QA 8컷.
- 마이그: `V4`(groupware collab/번호) + `V55`(auth page-code 시드) — 라이브 Flyway 적용 검증(auth 재기동 healthy, MASTER 매트릭스 182→183).

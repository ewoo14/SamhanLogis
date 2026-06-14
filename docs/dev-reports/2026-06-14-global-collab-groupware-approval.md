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

---

## 7. 결재유형 템플릿 빌더 + 첨부 (확장)

- **템플릿 빌더**: `ApprovalTemplate`/`ApprovalTemplateField` 동적 필드(TEXT/NUMBER/DATE/SELECT/TEXTAREA), 견본 지출결의서/휴가신청서 시드(`V5`), page-code `groupware.approval-templates`(`V57`). FE `GroupwareApprovalTemplateAdminPage`(필드 빌더) + `DynamicApprovalFieldInput`(스키마 동적 폼).
- **첨부**: `ApprovalAttachment`(SLIP_REF / PARTNER_LEDGER_REF / FILE, MinIO 8.5.12 + Noop fallback). 동적 `fieldValues` `@JdbcTypeCode`(JSON). 첨부 잠금 409 + collab field overlay 화이트리스트.

## 8. 통합 문서 참조 + 전표 검색 자동완성

- **전표번호 검색**: slip-service `GET /admin/slips/search`(slipNo 부분일치 + sales/purchase VIEW 권한) + FE `SlipReferencePicker`(debounce 자동완성).
- **통합 문서 참조 6종**(출고/입고전표·분개장·세금계산서·거래명세서·거래처원장): accounting-service `AccountingDocumentSearchController` 4검색(분개 journalNo/적요·세금계산서·거래명세서·거래처) + groupware `ApprovalReferenceDocType` + `refDocType/refDocNo/refDocLabel`(`V6` additive·백필·CHECK). FE `DocumentReferencePicker`(유형 select → 유형별 번호/키워드 자동완성, 다중 동적). UUID 비공개.

## 9. 결재자 사원검색 칩 + 결재선 실명 + 첨부 칩 (개발책임자 요청)

> 개발책임자 지시: 결재자 UUID 직접입력(MVP) → **사원 이름 검색 + 칩(캡슐) 다중**. **다중(중복) 추가 입력은 캡슐(칩) 통일**(품목 라인=수량/단가/금액 표는 제외).

- **BE**: user-service `GET /internal/users/search`(fullName/loginId 부분일치, LEFT JOIN department, UUID 비공개) + `POST /internal/users/display-names`(bulk 이름 resolve, N+1 해소) + groupware `UserClient.search/resolveDisplayNames` + `GET /admin/groupware/approvals/approver-search`(EXECUTIVE_OFFICE + groupware.approvals VIEW 프록시) + `ApprovalLineAdminResponse.requesterName/steps[].approverName`(실명). 중복/본인/null 결재자 검증.
- **FE**: 결재선 `AsyncAutocomplete`(사원검색) + `TagChip` 다중(순번:실명, removeLabel 실명 aria), 첨부 문서참조·파일 `TagChip`(확정 후 칩만), 상세/목록 실명(UUID 노출 0), 상세 첨부 `<a href>` 문서 링크. design-system 재사용(신규 컴포넌트 0).

## 10. CI 안정화 fix

- groupware IT: 결재 엔드포인트 page-code `messenger.admin`→`groupware.approvals`(+create action CREATE→UPDATE) 동기화(deny→403 6건).
- Desktop Playwright `testIgnore`에 `'**/*-real-qa/**'`(디렉토리명 *-real-qa·파일명 다른 라이브 QA spec 누수 → ECONNREFUSED:8080 3건).

## 11. 리뷰 라운드 (Opus 5-agent + Codex cross-check)

- **Opus 5-agent**(BE/FE/Designer/DevOps + QA Docker 라이브): **P1 3**(결재자 칩 제거 aria-label 실명·첨부 입력행+칩 혼재·DocumentReferencePicker role=option) + **P2 다수**(EmployeeRepository LEFT JOIN+isDeleted·refSlipType 비전표 null·resolveDisplayNames N+1 bulk·AsyncAutocomplete inputTestId·minChars 2·IT stub) → Codex fix.
- **🚨 라이브 QA 단독 적발 P1**: groupware-service Docker `SAMHAN_USER_SERVICE_URL` 미설정 → user-service 도달 불가(결재자 검색/실명 전체 작동 불가). IT/mock false-green, **실 Docker 라이브가 단독 적발**(`docker-compose.local-all.yml` fix).
- **Codex cross-check**: **P2 2**(결재 목록 display-name 목록 단위 1회 일괄·중복 결재자 BE/mock 검증) → fix.
- **후속(P3)**: `allow-missing-token: false`(user-service 전역 /internal 보안 변경 — 별도 슬라이스, @PreAuthorize MASTER 2차 방어로 운영 안전) · mock 결재자 검색 범위(userId/dept→fullName/loginId) · 첨부 링크 인쇄 화면 직행.
- **검증**: user-service + groupware-service 전체 test BUILD SUCCESSFUL(Testcontainers, bulk endpoint/중복 IT 포함) · FE typecheck 0 · CI green(GitGuardian = dev 시드 자격 false-positive) · 라이브 실QA(결재자 칩/실명/첨부 칩, `docs/qa/groupware-approval-templates/`).

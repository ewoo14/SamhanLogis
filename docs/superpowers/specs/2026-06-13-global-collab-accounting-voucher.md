# §7 전역 협업 슬라이스 1 — 회계전표(ACCOUNTING_VOUCHER) 협업

> 에픽: [[project_global_collab_epic]] · 레퍼런스: 슬라이스 0(입출고전표, PR #474 머지 `30b0ce93a`)
> 작성: 2026-06-13 · 구현 주체: **Codex** (Claude 는 기획/리뷰/통합/git 만)

## 0. 목표 (한 줄)

slip-service 의 collab-core 협업 패턴(수정완료 1-인 + 코멘트 + diff + 알림)을 **accounting-service 의 `Journal`(분개) 도메인에 정확히 복제**한다. 편집 범위는 **비-원장 보조필드(적요·라인메모)만** — 차대변 금액/계정은 불변.

## 1. 도메인 사실 (정찰 확정)

- 엔티티: `services/accounting-service/.../domain/Journal.java` (분개). 헤더 필드: `journalNo`, `journalDate`, **`description`(적요, ≤500)**, `status`, `postedAt`, `postedBy`, `sourceType/RefId`, `reversedJournalId`, **`version`(@Version, Long)**, `lines`(1:N).
- 라인: `JournalLine` — `lineNo`, `accountCode`, `debitAmount`, `creditAmount`, `partnerId`, **`memo`(라인메모, ≤500)**.
- 상태 `JournalStatus`: **DRAFT → POSTED → REVERSED** (one-way). 확정/완료=**POSTED**, 물리종결=**REVERSED**.
- 결재자 개념 **없음** (postedBy/createdBy 만).
- Controller `JournalController` base=`/accounting/journals`, page-code 상수 `JOURNAL_PAGE_CODE="accounting.journals"`, 전 작업 ACCOUNTANT/MASTER.
- Service `JournalService` (create/post/reverse/page/get).
- Flyway 최신 **V35** → 신규 = **V36**.
- collab-core 의존성 **미보유** → build.gradle 추가 필요. (보유: shared:common, ecount-io, security, realtime-abstraction, notification-publisher)
- collab-core ENUM `ACCOUNTING_VOUCHER("회계 전표")` **이미 존재**.
- FE 상세화면 **존재**: `clients/desktop/src/renderer/routes/JournalDetailPage.tsx` (299줄).

## 2. 정책 결정 (개발책임자 확정 2026-06-13)

1. **수정완료 편집 범위 = 적요(Journal.description) + 라인메모(JournalLine.memo) 비-원장 필드만.** 차대변 금액/계정(accountCode/debitAmount/creditAmount)·일자·전표번호는 **불변**(변경=역분개 reverse 경로). 회계 무결성 보존.
2. **수정완료 잠금(COLLAB_LOCKED) = {REVERSED}** 만 409. DRAFT·POSTED 는 overlay 편집 허용. (단 DRAFT 는 기존 JournalFormPage 정식 편집이 주 경로 — 협업 수정완료는 POSTED 시나리오 중심.)
3. **알림 수신자 = 기여자만** (결재자 없음 → "다음 결재자 없으면 예외" 규칙 적용): `createdBy` + `postedBy` + JournalCollabSuggestion proposer/decider + JournalCollabComment author. distinct, 현재 수정자 self-skip, username→UUID resolve.
4. **page-code = 기존 `accounting.journals` 재사용** (reads→VIEW, writes→UPDATE). 전용 코드 신설·auth-service 마이그레이션 불필요. (근거: 전 작업 동일 ACCOUNTANT/MASTER → granularity 손실 0, FE canAccess 이미 존재.)

## 3. BE 구현 (accounting-service)

### 3.1 build.gradle
```gradle
implementation project(':shared:collab-core')
```

### 3.2 엔티티 + 리포지토리 (slip 미러)
- `collab/JournalCollabComment.java` — `extends CollabCommentRecord` (@Entity, table `journal_collab_comments`). 추가 필드 없음.
- `collab/JournalCollabCommentRepository.java` — slip `SlipCollabCommentRepository` 미러 (timeline/active 조회).
- `collab/JournalCollabSuggestion.java` — `extends CollabSuggestionRecord` (@Entity, table `journal_collab_suggestions`, **@Version 필수**).
- `collab/JournalCollabSuggestionRepository.java` — slip 미러 (ACCEPTED 이력 timeline 조회).

### 3.3 JournalDocumentCollaborationPort (`collab/JournalDocumentCollaborationPort.java`)
`implements DocumentCollaborationPort`. slip `SlipDocumentCollaborationPort` 정밀 미러:
- `documentType()` → `CollabDocumentType.ACCOUNTING_VOUCHER`.
- `loadSnapshot(journalId)` → Journal 직렬화 JSON: `{journalNo, journalDate, description, status, lines:[{lineNo, accountCode, debitAmount, creditAmount, memo}]}`.
- `applyChangeSet(journalId, changeSetJson)` → overlay 필드 파싱 후 `journalService.applyOverlayPatchBatch(...)` 호출.
- `restoreSnapshot(journalId, snapshotJson)` → snapshot 의 description + 라인 memo 만 복원(원장 금액 복원 금지).
- `canPropose/canDecide(userId, documentId)` → 무효 actor(null/zero-UUID) 가드만. 실제 권한은 컨트롤러 @RequirePermission.
- `resolveNotificationRecipients(journalId, excludeUserId)` → §2.3 기여자 distinct set (결재자 없음).
- 헬퍼: `validateChangeSet`(제안 저장 전 구조검증·400), `enrichChangeSetWithBefore`(현재값으로 {before,after} 정규화), `parseChangeSet`(path 정규화).
- **overlay 필드 키 규약**: 헤더 `description`; 라인 메모는 `line.{lineNo}.memo` (또는 slip 의 path 정규화 방식 일관). changeSet 구조 `{필드키: {after: 값}}`, before 는 enrich 시 부여.
- factory 패턴(`Factory` 내부클래스)은 slip 처럼 단일 documentType 이므로 단순 생성자로 충분(SLIP 은 outbound/inbound 2종이라 factory).

### 3.4 JournalService.applyOverlayPatchBatch (신규 메서드)
slip `SlipService.applyOverlayPatchBatch` 미러:
- 시그니처: `JournalDetailResponse applyOverlayPatchBatch(UUID journalId, Map<String,Object> beforeAfterPatches, String actorUserId)` (slip 시그니처에 맞춤).
- **guardCollabModifiable**: `COLLAB_LOCKED = EnumSet.of(JournalStatus.REVERSED)` 면 409(`IllegalStateException`/도메인 예외 → GlobalExceptionHandler 409 매핑).
- 적용 대상: `description`(헤더), 각 라인 `memo`(lineNo 매칭). **금액/계정/일자/전표번호 변경 무시 또는 400 거부**(원장 불변 가드 — overlay 외 키가 오면 400).
- 단일 audit(modifiedBy/modifiedAt) + 도메인 메서드 체인(직접 set 금지 — `journal.updateOverlay(...)`/`line.updateMemo(...)` 신규 도메인 메서드 추가).
- `@Version` 낙관락 자연 동작.
- 반환 = 갱신된 `JournalDetailResponse`.

### 3.5 JournalCollabEditService (`collab/JournalCollabEditService.java`)
slip `SlipCollabEditService.commitEdit` 6단계 정밀 미러:
1. 권한: `port.canPropose() && port.canDecide()` (조기 차단).
2. `port.enrichChangeSetWithBefore()` → {before,after}.
3. `port.applyOverlayPatchBatch()` (via applyChangeSet) → JournalDetailResponse.
4. JournalCollabSuggestion 신규 → 즉시 `accept(editorId, editorName)` → ACCEPTED 저장.
5. **알림(인-트랜잭션 동기 best-effort, AFTER_COMMIT 금지)**: `port.resolveNotificationRecipients` → `UserIdResolver` 정규화 → self-skip → 각 수신자 push.
6. SSE publish(EVENT_SUGGESTION_ACCEPTED).
- 반환 `Result(JournalCollabSuggestion edit, JournalDetailResponse journal)`.

### 3.6 JournalCollabController (`web/collab/JournalCollabController.java`)
base=`/accounting/journals/{journalId}/collab`. slip 미러, **page-code=accounting.journals**:
| 메서드 | 경로 | action |
|---|---|---|
| POST | /comments | UPDATE |
| GET | /comments (limit) | VIEW |
| DELETE | /comments/{commentId} | UPDATE |
| POST | /comments/{commentId}/resolve | UPDATE |
| POST | /edits (수정완료) | UPDATE |
| GET | /edits (ACCEPTED 이력) | VIEW |
| GET | /stream (SSE) | VIEW |
- 헤더 `X-User-Id`(UUID)/`X-User-Name`. DTO 는 slip `web/collab/dto/*` 미러(AddJournalCollabCommentRequest / CommitJournalCollabEditRequest / JournalCollabCommentResponse / JournalCollabEditResponse / JournalCollabSuggestionResponse).

### 3.7 JournalCollabConfig (`collab/JournalCollabConfig.java`)
slip 미러: `journalCollabCommentService`(CollabCommentService<JournalCollabComment> + repository adapter), `journalCollabSuggestionService`(CollabSuggestionService<JournalCollabSuggestion> + adapter), `journalCollaborationPort`(JournalDocumentCollaborationPort).

### 3.8 username→UUID resolve (accounting-service 자체 복제)
slip `client/UserIdResolver.java` + `client/AuthAccountLookupClient.java` 정밀 미러(accounting-service 패키지로). 흐름 동일: null/blank/시스템리터럴(system·anonymous·schedulertask·batchjob 대소문자무관)/zero-UUID → empty(by-login 호출 금지) / 유효 UUID → 그대로 / 그 외 → `GET /auth/internal/accounts/by-login` 조회. (auth by-login 은 슬라이스 0 에서 신설·머지됨 — 재사용.)
> 참고: 2-3 서비스에 동일 복제 시 shared 추출 후속 리팩터(rule of three) — 본 슬라이스는 복제.

### 3.9 Flyway V36 (`db/migration/V36__add_journal_collab_tables.sql`)
slip `V44` 정밀 미러: `journal_collab_comments` + `journal_collab_suggestions`. document_type CHECK 에 collab ENUM 값 전체(또는 최소 ACCOUNTING_VOUCHER). BaseEntity 7 audit. 인덱스 동일(timeline/active/status). **fresh Postgres 문법 probe 의무**([[migration-fresh-postgres-probe]] — 괄호/CHECK 문법).

## 4. FE 구현 (clients/desktop)

### 4.1 api/journalCollab.ts
`api/slipCollab.ts` 미러. 엔드포인트 `/accounting/journals/{journalId}/collab/*`. 타입: JournalCollabComment / JournalCollabEdit / CommitJournalCollabEditInput / CommitJournalCollabEditResponse(edit + journal: JournalDetail).

### 4.2 components/collab/JournalCollaborationPanel.tsx
`SlipCollaborationPanel.tsx` 미러. **overlay 필드 = 적요(description) + 라인별 memo(lineNo 라벨)**. 코멘트 섹션 + 수정이력(diff before→after·수정자·시각) + SSE 실시간 구독. design-system 컴포넌트 우선(자체 신규 금지).

### 4.3 realtime/JournalCollabRealtimeClient.ts
`SlipCollabRealtimeClient.ts` 미러(SSE 구독).

### 4.4 routes/JournalDetailPage.tsx 통합
- `JournalCollaborationPanel` 삽입.
- **수정 버튼**: `canCollabEdit = canAccess('accounting.journals','update') && status !== 'REVERSED'`. POSTED 에서 노출(편집모드 토글). diff/이력 표시.
- UUID 비노출(전표번호 journalNo 만).

### 4.5 api/mock.ts
journal collab 핸들러 추가([[inprocess_mock_principles]] 3원칙: parseMockBody·non-null envelope·blob). 코멘트 CRUD + edits commit/list + 테스트별 재seed. **page.route no-op 정합**.

## 5. 테스트

### BE (실 Testcontainers Postgres 의무)
- `collab/JournalCollabConfigTest` (빈 배선).
- `collab/JournalDocumentCollaborationPortTest` (snapshot/changeSet/recipients/overlay 가드).
- `it/collab/JournalCollabIT` — slip `SlipCollabIT` 미러: 코멘트 CRUD, 수정완료(POSTED 적요/라인메모 변경 + 이력), **REVERSED 409**, **금액키 거부**, 알림 수신자(기여자) resolve, **username→UUID**.
- `client/UserIdResolverTest` (slip 미러 — system/zero-UUID skip verifyNoInteractions 포함).
- controller 단위/슬라이스 테스트.
- **금액 불변 회귀**: changeSet 에 debit/credit/accountCode 키 → 400/무시 단언.

### CI ([[ci_test_filter_false_green]] 의무)
`.github/workflows/ci.yml` 의 accounting 테스트 잡(`빌드+테스트 (accounting+partner)` / `JUnit (accounting+partner)`) 필터에 신규 패키지(`...accounting.collab.*`, `...accounting.it.collab.*`, `...accounting.client.*`) 등재 확인. allowlist `--tests` 누락 시 false-green.

### FE
`clients/desktop/playwright/journal-collab/journal-collab-panel.spec.ts` — slip 미러(mock 회귀 hard gate). **로컬 버전 skew 주의**([[playwright-local-version-skew]] — node_modules/.bin, desktop cwd).

## 6. Docs (동시 갱신 의무 [[continuous-docs-sync]])
- `docs/dev-reports/2026-06-13-global-collab-accounting-voucher.md` (신규).
- README §7 항목 + `docs/samhan-public-overview.html` nav-badge/progress.
- `docs/handoff/CURRENT-WORK.md` 슬라이스 1 진행.

## 7. 컨벤션 가드 (필수)
- BaseEntity 7 audit + Soft Delete, 한국어 Javadoc, 도메인 메서드 체인(직접 set 금지), UUID 사용자 비공개.
- 알림 **인-트랜잭션 동기**(slip 교훈 — AFTER_COMMIT 시 @Transactional IT 롤백으로 미발화).
- Codex 는 **파일만 수정**(git 금지 — wrapper-lock 으로 컴파일 불가, PM 이 컴파일·커밋 대행 [[codex-sandbox-git]]).

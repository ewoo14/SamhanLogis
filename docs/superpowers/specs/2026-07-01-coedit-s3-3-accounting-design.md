# 코-에디팅 S3-3 — 회계전표(Journal) 메모 coedit (설계)

> 2026-07-01 야간 자율. #16 S3 롤아웃 3번. S3-1/S3-2 패턴 1:1. 정찰 a7a2b5db.

## Goal
회계전표(Journal) 상세(데스크톱 JournalDetailPage → JournalCollaborationPanel)에 단일 '협업 메모' 실시간 동시편집. 1차=메모 단일필드.

## 정찰 결론 (최소 델타 — 세 도메인 중 가장 단순, 특이 가드 없음)
회계전표=accounting-service, 도메인 Journal(분개), CollabDocumentType.ACCOUNTING_VOUCHER. §7 collab(댓글/수정/presence/stream) 기존. **CollabCoeditService 미주입 + coedit 3엔드포인트 부재 = 갭.** journalId=직접 UUID(resolver 불요). page-code 단일 "accounting.journals". **특이 가드 없음(@RequirePermission 만 — 견적 EstimatePermissionGuard 이중가드/X-Is-System-Master 복사 금지).**

## BE — JournalCollabController + dto 3종
파일: `services/accounting-service/.../web/collab/JournalCollabController.java` (@RequestMapping "/accounting/journals/{journalId}/collab")
- 생성자에 `CollabCoeditService` 주입(import+필드+param). 자동주입 가능(RealtimeBroker 빈+collab-core 의존). 신규 @Bean/Flyway 0.
- coedit 3엔드포인트(listEdits 뒤/stream 앞, **가드는 @RequirePermission 만**):
  - GET /coedit : @RequirePermission(JOURNAL_PAGE_CODE, VIEW) → ApiResponse.ok(new JournalCoeditUpdatesResponse(coeditService.listUpdates(journalId)))
  - POST /coedit/update : @RequirePermission(JOURNAL_PAGE_CODE, UPDATE) → coeditService.appendUpdate(journalId, req==null?null:req.update())
  - POST /coedit/awareness : @RequirePermission(JOURNAL_PAGE_CODE, VIEW) → coeditService.publishAwareness(journalId, req==null?null:req.awareness())
  - 존재검증: 기존 Journal collab 엔드포인트(comments/edits)와 일관되게 ensureJournalExists 적용. awareness=VIEW.
- DTO 3종(`.../web/collab/dto/`): JournalCoeditUpdateRequest(String update)·JournalCoeditAwarenessRequest(String awareness)·JournalCoeditUpdatesResponse(List<String> updates). Estimate DTO 미러.
- IT: `accounting.it.collab.JournalCollabIT`(기존)에 coedit 케이스 추가(relay 누적·awareness 미저장·VIEW/UPDATE deny 403·update+awareness null/빈 body 400). ⚠️ seed 식별자 길이 주의(S3-2 교훈: estimate_no VARCHAR 초과 — journal seed no 한도 확인, 짧은 suffix).

## FE — JournalCollaborationPanel
파일: `clients/desktop/.../components/collab/JournalCollaborationPanel.tsx`
- CollaborativeTextField import + `collabBasePath = useMemo(() => \`/accounting/journals/${encodeURIComponent(journalId)}\`)` + 메모필드(fieldName="memo", label="협업 메모", rows=4, readOnly=!canEdit[canAccess('accounting.journals','update') 기존 L158]) + 보조설명("팀 내 실시간 공유 메모입니다. 전표 저장과는 별개로 보관됩니다.").
- mock.ts 회계 journal coedit 3핸들러(`/accounting/journals/{id}/collab/coedit` GET {updates:[]}/POST update 누적/awareness null). `JournalCollaborationPanel.coedit.test.tsx`(Estimate 동형).
- /new=정적 라우트(JournalFormPage)→T04 안전. 게이트웨이 accounting 라우트(/api/v1/accounting/** strip) 정합 확인.

## ci.yml
accounting+partner 잡=무필터 전체 실행 → JournalCollabIT coedit 자동 실행(slip 서브패키지 false-green 없음). 방어로 `JournalCollabIT skipped=0 hard gate`(accounting+partner 잡, S3-2 Codex 선례) 추가 권장.

## 결정 (야간 자율 권장방향)
- 존재검증=기존 Journal collab 엔드포인트와 일관(ensureJournalExists). awareness=VIEW. 가드=@RequirePermission 만(이중가드 없음). page-code 시딩 불요(기존 사용).

## Testing
BE JournalCollabIT coedit(Testcontainers). FE coedit.test + vitest. 라이브: accounting-service standalone/게이트웨이 실 HTTP relay round-trip. mock OFF 스샷.

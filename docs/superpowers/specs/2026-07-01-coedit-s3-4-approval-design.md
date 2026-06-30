# 코-에디팅 S3-4 — 그룹웨어 결재(approval) 메모 coedit (설계)

> 2026-07-01 야간 자율. #16 S3 롤아웃 4번. S3-3(Journal) 패턴 1:1. 정찰 abc26fd0.

## Goal
그룹웨어 결재(ApprovalLine) 상세(데스크톱 GroupwareApprovalDetailPage → GroupwareApprovalCollaborationPanel)에 단일 '협업 메모' 실시간 동시편집. 1차=메모 단일필드.

## 정찰 결론 (S3-3과 동형, 리스크 최저)
결재=groupware-service, 도메인 ApprovalLine, CollabDocumentType.APPROVAL_LINE. §7 collab(댓글/수정/presence/stream) 기존. coedit 3종+DTO+FE 메모 갭. approvalId=직접 UUID(PK, resolver 불요). page-code "groupware.approvals". **특이 가드 없음**(Journal 동급). /new=별도 GroupwareApprovalCreatePage(T04 회피). ci=phase9-10 무필터 자동커버.

## BE — GroupwareApprovalCollabController + dto 3종
파일: `services/groupware-service/.../controller/GroupwareApprovalCollabController.java` (@RequestMapping "/admin/groupware/approvals/{approvalId}/collab", PAGE_CODE="groupware.approvals")
- 생성자에 `CollabCoeditService coeditService` 주입(8번째 param, broker 기주입→자동주입). 신규 @Bean/Flyway 0.
- coedit 3엔드포인트(listEdits[L188] 뒤 / stream[L190] 앞, Journal 1:1, **@RequirePermission 만**):
  - GET /coedit : @RequirePermission(PAGE_CODE, VIEW) → ApiResponse.ok(new ApprovalCoeditUpdatesResponse(coeditService.listUpdates(approvalId)))
  - POST /coedit/update : @RequirePermission(PAGE_CODE, UPDATE) → coeditService.appendUpdate(approvalId, req==null?null:req.update())
  - POST /coedit/awareness : @RequirePermission(PAGE_CODE, VIEW) → coeditService.publishAwareness(approvalId, req==null?null:req.awareness())
  - approvalId=@PathVariable UUID. ensureApprovalExists(approvalId)(=existsById, 기존) 선행. awareness=VIEW.
- DTO 3종(`.../web/collab/dto/`): ApprovalCoeditUpdateRequest(String update)·ApprovalCoeditAwarenessRequest(String awareness)·ApprovalCoeditUpdatesResponse(List<String> updates).
- IT: `groupware.it.ApprovalCollabIT`(기존)에 coedit 5케이스 추가(JournalCollabIT 미러: relay 누적·awareness 미저장·VIEW deny 403·UPDATE deny 403·update+awareness null/빈 400). ⚠️ seed 식별자 길이 VARCHAR 한도 주의(S3-2 교훈).

## FE — GroupwareApprovalCollaborationPanel
파일: `clients/desktop/.../components/collab/GroupwareApprovalCollaborationPanel.tsx`
- CollaborativeTextField import + collabBasePath=useMemo(`/admin/groupware/approvals/${encodeURIComponent(approvalId)}`) + 메모필드(fieldName="memo", label="협업 메모", rows=4, readOnly=!canWrite) + 보조설명("팀 내 실시간 공유 메모입니다. 결재 문서 제목·내용 저장과는 별개로 보관됩니다.").
- mock.ts approval coedit 3핸들러(`/admin/groupware/approvals/{id}/collab/coedit`). `GroupwareApprovalCollaborationPanel.coedit.test.tsx` 신규(Journal 동형).

## ci.yml
phase9-10 (groupware+notification+dashboard) 무필터 전체실행 → ApprovalCollabIT coedit 자동 실행(false-green 없음). 방어로 `ApprovalCollabIT skipped=0 hard gate`(phase9-10 잡, report=TEST-...groupware.it.ApprovalCollabIT.xml) 추가 권장(S3-2/S3-3 선례).

## 결정 (야간 자율 권장 = 옵션 A)
협업 메모 = collab 사이드채널(저장 title/content 무관) → **readOnly={!canWrite}, 상태머신(locked) 게이트 미적용**(Journal 동형, 1:1 패턴 유지). 옵션 B(종결 상태 시 메모 잠금)=BE/FE 신규 가드라 미채택.

## Testing
BE ApprovalCollabIT coedit(Testcontainers). FE coedit.test + vitest. 라이브: groupware-service standalone/게이트웨이 실 HTTP relay round-trip(불가시 정직+CI IT). mock OFF 스샷.

# 코-에디팅 S3-5 — 배차(dispatch) 메모 coedit (설계, #16 마지막 슬라이스)

> 2026-07-01 야간 자율. #16 S3 롤아웃 5번(마지막). estimate/journal/approval 패턴. 정찰 a1f2a57e.

## Goal
배차(DispatchTask) 상세 모달(DispatchTaskDetailModal)에 단일 '협업 메모' 실시간 동시편집. 1차=메모 단일필드. → **#16 협업 에픽 종결**.

## 정찰 결론 (형제와 BE 클래스명·FE 구조 다름 — 주의)
배차=slip-service `slip.domain.dispatch`, 집계루트 DispatchTask. §7 collab(댓글/수정/presence/stream) 기존. coedit 3종+DTO+FE 메모 갭. taskId=직접 UUID(`existsByIdAndIsDeletedFalse` 소프트삭제). page-code "dispatch.board". **단일 가드**(@RequirePermission 만, DispatchPermissionGuard 부재). CollabCoeditService 자동주입 가능(slip-service SlipRealtimeBroker + EstimateCollabController 기주입).

## BE — DispatchCollabCommentController + dto 3종
파일: `services/slip-service/.../web/dispatch/DispatchCollabCommentController.java` (@RequestMapping "/admin/dispatch-tasks/{taskId}")
- 생성자에 `CollabCoeditService coeditService` 주입(8번째). coedit 3엔드포인트(EstimateCollabController coedit 1:1 이식하되 **가드는 @RequirePermission 만**):
  - GET /collab/coedit : @RequirePermission(page="dispatch.board", VIEW) → ApiResponse.ok(new DispatchCoeditUpdatesResponse(coeditService.listUpdates(taskId)))
  - POST /collab/coedit/update : @RequirePermission(dispatch.board, UPDATE) → coeditService.appendUpdate(taskId, req==null?null:req.update())
  - POST /collab/coedit/awareness : @RequirePermission(dispatch.board, VIEW) → coeditService.publishAwareness(taskId, req==null?null:req.awareness())
  - taskId=@PathVariable UUID. `ensureTaskExists`(=existsByIdAndIsDeletedFalse) 선행(기존 패턴). awareness=VIEW. coedit relay=in-memory → 상태가드(guardCollabModifiable, commit-edit 전용) 미적용.
- DTO 3종(`.../web/dispatch/dto/`): DispatchCoeditUpdateRequest(String update)·DispatchCoeditAwarenessRequest(String awareness)·DispatchCoeditUpdatesResponse(List<String> updates).
- IT: `slip.it.dispatch.DispatchCollabIT`(기존)에 coedit 5케이스(EstimateCollabIT 미러: relay 누적·awareness 미저장·VIEW deny 403·UPDATE deny 403·update+awareness null/빈 400). ⚠️ seed 식별자(taskCode) 길이 VARCHAR 한도 주의(S3-2 교훈).

## FE — DispatchTaskDetailModal (인라인, 신규 패널 아님)
파일: `clients/desktop/.../routes/dispatch-board/components/DispatchTaskDetailModal.tsx`
- CollaborativeTextField import + `collabBasePath = \`/admin/dispatch-tasks/${encodeURIComponent(task.id)}\`` + 메모필드(fieldName="memo", label="협업 메모", rows={4}, readOnly={!canAccess('dispatch.board','update')}) + 보조설명("팀 내 실시간 공유 메모입니다. 배차 '비고'(저장 항목)와는 별개로 보관됩니다."). presence/댓글 영역 근처 인라인 배치(신규 DispatchCollaborationPanel 미생성 — 배차 현행 일관).
- mock.ts dispatch coedit 3핸들러(`/admin/dispatch-tasks/{id}/collab/coedit`). coedit.test(모달 coedit 필드 배선 — CollaborativeTextField stub, 형제 동형).

## ci.yml (⚠️ CRITICAL — S3-2 false-green 정확 재발점)
slip-it-core 필터(ci.yml:74)+nightly-slip-it.yml에 `slip.it.dispatch.*` 명시 **부재** → 기존 DispatchCollabIT 미실행 가능(false-green 의심). 조치(필수):
1. ci.yml slip-it-core + nightly slip-it-core 둘 다에 `--tests "com.samhanair.logis.slip.it.dispatch.*"` 추가.
2. `DispatchCollabIT skipped=0 hard gate`(slip-it-core, S3-2/3/4 선례 미러).
3. codex: 먼저 기존 it.dispatch IT가 현재 CI 실행되는지 확인 — 미실행이면 본 필터 추가가 기존 dispatch IT + 신규 coedit IT 동시 활성화(기존 false-green 동반 해소).

## 결정 (야간 자율 권장방향)
FE=모달 인라인(배차 현행 일관). readOnly=!canAccess('dispatch.board','update')(1:1 estimate, 상태 무관 — BE coedit도 상태가드 미적용). coedit memo=사이드채널(영속 task.memo/'비고'와 별개).

## Testing
BE DispatchCollabIT coedit(Testcontainers). FE coedit.test + vitest. 라이브: slip-service standalone/게이트웨이 실 HTTP relay round-trip(불가시 정직+CI IT). 배차 모달 스샷.

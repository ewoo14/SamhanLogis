# §7 전역 협업 슬라이스 4 — 배차(DISPATCH_TASK) 수정완료 1-인 협업

> 에픽 [[project_global_collab_epic]] · collab-core 5번째 문서. 선행: slip(#474)·회계(#475)·주문(#476)·견적(#477).
> 워크플로우: Opus 4.8 ↔ Codex 2모델 교대(**Fable5 영구 제외**). 기획(본 문서) → Codex 개발 → Opus/Codex 5-agent 라운드(각 PR게시+실서버 QA) → 다음 리뷰어 0에러까지 → PM 머지.

## 개발책임자 결정 (2026-06-13)
배차 collab "수정완료(1-인) 편집" = **옵션 1 — 신규 비고(memo) 필드 + slip 패턴**.
- 배차는 코멘트 collab 이미 완성(`DispatchCollabComment`/Repo/Config/Controller + SSE + FE `DispatchCommentThread`/`DispatchTaskDetailModal`). **본 슬라이스 = "수정완료 편집 + diff + 알림"만 추가.**
- 기존 Phase C 수정요청 플로우(MODIFICATION_REQUESTED→ACCEPTED)는 **건드리지 않음**(additive). edit-request 대체 아님.

## 도메인 결정
| 항목 | 배차 결정 |
|---|---|
| 편집 필드(soft) | `memo`(비고) **단일** — DispatchTask 는 flat 엔티티(라인 없음 → `line.*.note` 없음) |
| 신규 스키마(V46) | `dispatch_tasks` ADD `memo VARCHAR(1000)` + ADD `version BIGINT NOT NULL DEFAULT 0`(@Version) / `dispatch_collab_suggestions` 테이블 신설(comments 는 기존) |
| 동시성 | DispatchTask 에 `@Version` 추가 → memo 부모 편집의 정상 낙관락(자식 없어 estimate 의 force-increment 불요). **⚠️ 기존 dispatch update 플로우(modification/cancellation 서비스) 회귀 검증 필수** |
| 핵심 불변(400) | taskCode·status·driver/vehicle 매칭·일자·수량 등 memo 외 전 필드 |
| COLLAB_LOCKED(409) | {CANCEL_ACCEPTED, CANCELLED}(물리 종결) |
| FE 수정 진입 | status == `DISPATCHED`(배차 확정) + !locked |
| 알림 | 기여자만(배차 결재자 없음 — 회계/견적 패턴): `createdBy`(배차담당자) + 코멘트 작성자 + 제안자. username→UUID resolve |
| 라우팅 | **UUID**(`/admin/dispatch-tasks/{taskId}/...` — PR #473 통일, 게이트웨이 %2F 무관) |
| page-code | `dispatch.board`(기존 DispatchCollabCommentController 일치) |
| 경로 컨벤션 | 기존 dispatch 코멘트 컨트롤러 경로에 정렬(edits 엔드포인트 동일 prefix) |

## 작업 범위
### BE (slip-service · `slip.domain.dispatch` + dispatch collab 패키지)
- **V46 마이그레이션**: `dispatch_tasks` memo+version 컬럼 추가 + `dispatch_collab_suggestions`(document_type CHECK 6 enum 포함 DISPATCH_TASK, status CHECK PROPOSED/ACCEPTED/REJECTED/WITHDRAWN, @Version, decided_at TIMESTAMPTZ, 7 audit, soft-delete partial index — estimate V45 클론).
- **DispatchTask 도메인**: `memo` 필드 + `@Version version` + `overlayMemo(String)` 체인 메서드 + `guardCollabModifiable()`(409 {CANCEL_ACCEPTED,CANCELLED}).
- **DispatchCollabSuggestion** 엔티티 + Repository(estimate/slip 클론).
- **DispatchDocumentCollaborationPort**: loadSnapshot(memo) / enrichChangeSetWithBefore / applyOverlayPatchBatch(memo overlay, 화이트리스트=memo만, 그 외 400) / restoreSnapshot(soft-only) / resolveNotificationRecipients(createdBy+제안자+코멘트작성자, editor 제외, UserIdResolver).
- **DispatchCollabEditService**: 1-인 수정완료(enrich→overlay→ACCEPTED suggestion 저장→알림 best-effort→SSE publish).
- **Controller**: 기존 dispatch collab 코멘트 컨트롤러 경로 컨벤션에 맞춰 `edits`(commit) + `edits` 목록 + (stream 은 기존 코멘트 SSE 재사용 가능) 엔드포인트. `@RequirePermission(page="dispatch.board", write=UPDATE/read=VIEW)` + 기존 가드 패턴 일치.
- **DispatchCollabIT**(실 Postgres): 수정완료 memo 적용+ACCEPTED 이력+diff, COLLAB_LOCKED 409, 핵심필드 400, 알림 기여자 resolve, CHECK 제약(트랜잭션 분리 — estimate 교훈), deny 403, **fresh-session 가드(EntityManager.clear) — estimate force-increment 교훈 예방**.

### FE (desktop)
- `dispatchCollab.ts` API(edits commit/list) — 기존 dispatch 코멘트 API 와 동일 모듈/경로 컨벤션.
- `DispatchTaskDetailModal`(기존)에 **수정완료 편집 폼(비고) + diff + 수정 진입 버튼**(status==DISPATCHED && !locked, canAccess('dispatch.board','update')) 추가. 기존 `DispatchCommentThread` 보존(additive).
- realtime: 기존 코멘트 SSE 채널에 suggestion.accepted 수신 → invalidate.

## 검증 (estimate 슬라이스 교훈 반영)
- BE: DispatchCollabIT 실 Testcontainers + **DispatchTask @Version 추가가 기존 dispatch 모듈 테스트(modification/cancellation/board) 회귀 없는지 전체 실행** ([[changed-module-full-test-before-push]]).
- 마이그: V46 fresh-postgres probe([[migration-fresh-postgres-probe]]).
- 실서버 라이브 QA: DISPATCHED 배차 task 대상 수정완료(비고)→diff→코멘트, dev_master 실 로그인·실 게이트웨이·슬립 재빌드(가짜 0). 각 라운드 PR 인라인.
- **fresh-session 가드 IT 필수**(estimate 의 OPTIMISTIC_FORCE_INCREMENT-on-비버전자식 false-green 교훈 — 단, dispatch 는 flat 이라 자식 없음, 그래도 @Version 경로 라이브 검증).

## 비차단 후속
- presence(동시 접속자) — 후속 슬라이스.

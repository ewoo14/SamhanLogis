---
name: project-global-collab-epic
description: §7 전역 협업 에픽 — 수정완료(1-인) 모델 + collab-core 문서별 롤아웃 (slip 레퍼런스 머지 완료)
metadata:
  type: project
---

§7 전역 협업 = 플랫폼 전역 협업 에픽 (개발책임자 확정, 2026-06-13). 대부분 메뉴 화면(전표·견적·회계전표·주문·배차·미배차/가배차·**그룹웨어 결재** 등)에 협업 기능 = **수정완료(1-인) + 코멘트 + diff + 알림**.

**핵심 모델 (절대 혼동 금지)**: 제안/수락(2-인) 아님 = **문서 수정(1-인)**. 확정/완료 상태 문서에서 권한자 본인이 "수정"→편집→"수정완료" = **즉시 커밋**(별도 승인자 없음·잠금 우회·다필드 1버전). 완료 상태일 때 기존 "완료" 버튼이 "수정" 버튼으로 대체됨. 구글 독스 "제안" 기능은 **diff 시각화(무엇이 어떻게 바뀌었는지 한눈에)** 벤치마킹 목적으로 언급된 것이지 2-인 승인 플로우가 아님. 기존 edit-request(수정 요청) 플로우는 **완전 대체**(삭제 요청만 보존). guardCollabModifiable 은 물리종결 상태만 409(slip=SHIPPING/DELIVERED/CANCELED/REJECTED).

**알림 규칙**: 수정완료 시 **기여자(작성·수정·코멘트 참여 이력) + 다음 결재자(있으면, 없으면 skip)** 에게 발송. 현재 수정자 self-skip. 수신자 ID 가 username/사원코드면 **username→UUID resolve**(auth `/auth/internal/accounts/by-login`). 트랜잭션 내 동기 best-effort(기존 SlipEditRequestService 패턴 일관, AFTER_COMMIT 금지 — @Transactional IT 롤백 시 미발화). slip 의 다음 결재자 = 출고인(dispatcherUserId)·검수인(inspectorUserId).

**공유 모듈**: `shared:collab-core` — CollabCommentService<T>·CollabSuggestionService<T>·DocumentCollaborationPort(loadSnapshot/applyChangeSet/restoreSnapshot/canPropose/canDecide/resolveNotificationRecipients)·CollabDocumentType ENUM(DISPATCH_TASK·SLIP_OUTBOUND·SLIP_INBOUND·ACCOUNTING_VOUCHER·PARTNER_ORDER·ESTIMATE). 문서별 서비스가 Port 구현 + Config 배선.

**롤아웃**: 문서별 슬라이스(개발책임자 "이번 슬라이스에 모두 종료" → PM 제안 per-document 롤아웃 수용). **슬라이스 0 = 입출고전표 레퍼런스 = 머지 완료**(PR #474, `30b0ce93a`, 2026-06-13). 다음 = 회계전표/주문/견적/배차/그룹웨어 결재 등에 collab-core 패턴 복제. presence(동시 접속자+사용자별 랜덤 색상)=후속 슬라이스로 분리.

**슬라이스 1 = 회계전표(ACCOUNTING_VOUCHER)** (개발책임자 선정, 2026-06-13): 엔티티=`Journal`(분개), 상태 DRAFT→POSTED→REVERSED(one-way). 확정/완료=POSTED, 물리종결(COLLAB_LOCKED)=REVERSED. **수정완료 편집 범위(개발책임자 확정)=적요(Journal.description)+라인메모(JournalLine.memo) 비-원장 필드만** — 차대변 금액/계정(accountCode/debit/credit)은 불변(변경=역분개 reverse 경로), 회계 무결성 보존. **결재자 개념 없음 → 알림=기여자(createdBy/postedBy+제안자/결정자+코멘트작성자)만**(다음결재자 "없으면 예외"). FE=기존 `JournalDetailPage.tsx`(clients/desktop)에 협업 패널 추가(slip 패턴). collab-core 의존성 accounting-service build.gradle 신규 추가, Flyway V36(slip V44 미러).

**워크플로우**: 각 슬라이스 = [[temp-multimodel-workflow]] (기획 → Codex 개발 → 순차 5-agent 라운드[각 PR게시+실서버 스크린샷] → 다음 리뷰어 0에러까지 사이클 → PM 최종점검+머지). 용어는 [[comment-not-collab-comment]](사용자 노출=「코멘트」, 영문 식별자 collab-core 유지).

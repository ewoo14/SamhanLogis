# SPEC — §7 전역 협업 1차: 입출고전표(slip) 풀 협업 레퍼런스 (collab-core 롤아웃)

> 2026-06-13 개발책임자 "우선 전역 협업 진행" + 1차 범위 = **입출고전표 풀 협업**. 배차 보드 에픽 spec §7(전역 협업 문서 플랫폼)의 첫 레퍼런스 구현. **빅뱅 금지** — collab-core(이미 범용 구축) 를 slip 에 풀 적용(코멘트+제안+회귀), 이후 타 문서(회계/주문/견적) 단계 롤아웃.

## 0. 정찰 — collab-core 는 이미 범용 구축됨 (재사용)
`shared:collab-core` (배차 코멘트만 실배선, 나머지 ENUM 선언):
- `CollabCommentRecord`(MappedSuperclass) + `CollabCommentService<T>` — documentType+documentId+author+body+parentId(스레드)+status(OPEN/RESOLVED)+soft-delete + SSE.
- `CollabSuggestionRecord` + `CollabSuggestionService<T>` — proposer+changeSet(JSONB path→{before,after})+status(PROPOSED/ACCEPTED/REJECTED/WITHDRAWN)+decidedBy. accept 시 `DocumentCollaborationPort.applyChangeSet` 위임 + @Version optimistic lock.
- `CollabRevisionRecord` + `CollabRevisionService<T>` — revisionNo+revisionType(EDIT/RESTORE)+snapshot(JSONB)+actor + capture/restore + SSE.
- `CollabDocumentType` ENUM: DISPATCH_TASK·**SLIP_OUTBOUND·SLIP_INBOUND**·ACCOUNTING_VOUCHER·PARTNER_ORDER·ESTIMATE.
- `DocumentCollaborationPort`(interface): loadSnapshot / applyChangeSet / restoreSnapshot / canPropose / canDecide — 소비 도메인 구현.
- `CollabRealtimePublisher`(SSE afterCommit) ⊂ `shared:realtime-abstraction` `RealtimeBroker`.
- 레퍼런스 패턴: `services/slip-service/.../dispatch/collab/`(DispatchCollabComment·DispatchCollabConfig·DispatchCollabCommentController) + FE `DispatchCommentThread.tsx`·`DispatchCollabRealtimeClient.ts`.
- slip 기존 자산: `SlipAuditLog`(field-delta audit + revertToRevision) + `SlipSnapshot`(JSONB full-snapshot, point-in-time restore).

## 1. 범위 (IN) — 입출고전표(slip) 풀 협업
### 1-1. BE (slip-service) — collab-core 3종 slip 적용
- **코멘트**: `SlipCollabComment` entity(documentType=SLIP_OUTBOUND/SLIP_INBOUND, documentId=slipId) + config(CollabCommentService 빈) + `SlipCollabCommentController`(POST/GET/DELETE/resolve + SSE stream). 배차 패턴 1:1 미러. 작성자 실명(authorName)·UUID 비공개·soft-delete.
- **수정제안**: `SlipCollabSuggestion` entity + config(CollabSuggestionService 빈) + `SlipDocumentCollaborationPort` 구현:
  - `loadSnapshot(slipId)` = 현 slip 헤더+라인 → JSONB(기존 `SlipSnapshot` 재사용).
  - `applyChangeSet(slipId, changeSet)` = 제안 수락 시 path→after 를 slip 에 적용(기존 overlay-patch/edit 경로 재사용, audit 동반).
  - `restoreSnapshot(slipId, snapshot)` = 회귀(기존 restore 재사용).
  - `canPropose/canDecide` = slip 협업 권한(@RequirePermission page-code, 예 `sales.slip.collab`/`purchase.slip.collab` 또는 기존 slip 권한 재사용 — 확정).
  - controller: 제안 propose/accept/reject/withdraw + SSE.
- **revision/회귀**: slip 기존 revision(SlipAuditLog/SlipSnapshot/restore)을 협업 UI 에 surface — CollabRevisionService 병행 신규 vs 기존 재사용은 Codex 정찰 후 결정(중복 회피 우선). 제안 accept/restore 가 audit 추적.

### 1-2. FE (desktop) — 출고전표/입고전표 상세 협업 패널
- 입출고전표 상세 화면(SlipDetailPage 등)에 **협업 패널**: ① 코멘트 스레드(`DispatchCommentThread` 미러) ② 수정제안 목록(propose 폼 + accept/reject 버튼, 권한 가드) ③ revision/회귀 이력(기존 audit timeline + restore) ④ **실시간 SSE**(코멘트/제안/회귀 변경 동시 시청자 반영, `createRealtimeClient` 재사용).
- design-system 우선. UUID 비공개(작성자/제안자 실명만).

### 1-3. 마이그/테스트
- Flyway: slip_collab_comment / slip_collab_suggestion 테이블([[enum-expansion-check-constraint]] CHECK 동반). collab-core MappedSuperclass 라 테이블은 도메인별.
- BE IT: 코멘트 CRUD/스레드/resolve·제안 propose/accept(applyChangeSet 실 적용)/reject·권한 deny·SSE. FE mock 스펙. Docker 실 QA(출고전표 상세 협업 + 실시간 2-브라우저).

## 2. 범위 밖 (DEFER — 단계 롤아웃)
- 타 문서(ACCOUNTING_VOUCHER·PARTNER_ORDER·ESTIMATE) 협업 = 후속 §7 슬라이스.
- dispatch 상태머신(MODIFICATION_*) ↔ collab suggestion 통합 = 후속.
- audit(field-delta) ↔ collab revision(snapshot) 완전 통합 = 후속(중복 회피만 본 슬라이스).

## 3. 컨벤션 가드
BaseEntity·Soft Delete·도메인 메서드 체인·한국어 Javadoc·**UUID 비공개(작성자/제안자 실명만, documentId/authorId 내부)**·enum/CHECK Flyway 멱등·게이트웨이 no-strip 라우트(신규 collab endpoint). collab-core 재사용 우선(중복 추상 신규 금지).

## 4. 워크플로우
다모델 정정판: Opus 계획+조기 PR → Codex 개발 → 개발사항 게시 → Opus·Codex·Fable5 리뷰(각 모델 자기 라운드 직접 fix) → 다음 리뷰어 0 오류 → 머지. ([[temp-multimodel-workflow]])

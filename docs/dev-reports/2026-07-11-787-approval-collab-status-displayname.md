# #787 잔여 — approval-core/collab-core 상태메시지 raw enum 누출 제거 (displayName SSOT, #792)

- **일자**: 2026-07-11
- **PR**: #792 · **연관 Issue**: #787(부분 해결, 전체 close 아님)
- **계열**: #791 EditLockGuard sweep가 포착한 F2/F3. #786/#788/#790/#791 동일 #787 raw-enum→displayName 계열.
- **워크플로우**: Codex 구현(TDD RED→GREEN) → Opus 5-agent(+실HTTP QA) → fix → Codex 5-agent 적대 → 0수렴 → CI → 머지.

## 결함 (누출 5곳)
shared approval-core/collab-core 상태전이 가드가 raw enum명을 사용자 노출 메시지에 누출:
| 파일 | 메시지 | enum |
|---|---|---|
| `ApprovalLineBase:150` | 이미 종료된 결재선입니다: PENDING | ApprovalStatus |
| `ApprovalStepBase:161` | 이미 처리된 결재 단계입니다: APPROVED | ApprovalStepStatus |
| groupware `ApprovalLine:178` | 협업 수정완료가 불가능한 상태입니다: REJECTED | ApprovalStatus |
| `CollabSuggestionRecord:128` | 이미 종결된 제안입니다: ACCEPTED | CollabSuggestionStatus |
| `CollabSuggestionService:134` | 이미 종결된 제안입니다: WITHDRAWN | CollabSuggestionStatus (sweep 추가 포착) |
누출 경로: groupware ApprovalLineService approve/reject/withdraw→GEH verbatim 409, collab guardCollabModifiable/requireProposed→BusinessException 직접.

## 구현
- **displayName SSOT 3종 신설**(`@Getter @RequiredArgsConstructor`+`displayName` 전상수 컴파일강제):
  - `ApprovalStatus`: 대기/진행중/승인/반려/회수
  - `ApprovalStepStatus`: 대기/승인/반려
  - `CollabSuggestionStatus`: 제안/수락/반려/철회
- 누출 5곳 → `getDisplayName()`.
- approval-core/collab-core/groupware 회귀 테스트 신설(라벨 포함+raw enum 미포함 이중 assert).

## 리뷰 disposition
- **BE(PASS)**: ⭐직렬화/영속 무영향 실증 — 3 enum 전부 `@Enumerated(STRING)`(name() 사용, displayName 필드 무영향)·`@JsonValue`/`@JsonFormat(OBJECT)` 부재·SSE payload는 `.name()` 명시 호출·같은 collab-core `CollabDocumentType` 동일 패턴 선례. DB값/JSON wire/SSE 계약 불변. sweep 5곳 완결(OutboxStatus:121은 별개 enum, 스코프 밖). FE `groupwareApproval.ts` 라벨 100% 일치(F4형 중복 0).
- **Design(PASS)**: 대기/진행중/승인/반려/회수·제안/수락/반려/철회 전부 기존 FE(groupwareApproval.ts, PR #480 배포)·SlipStatusBadge SSOT 정합. approval REJECTED=collab REJECTED="반려" 통일 바람직. WITHDRAWN 회수(결재)/철회(협업) 의도된 구분. P3 nit(CollabSuggestionRecord:106 Javadoc "거절"→"반려") 반영.
- **QA(GREEN)**: genuine(approval-core/collab-core/groupware 114/slip SlipCollabIT `--rerun-tasks`) + 실HTTP 3건(ApprovalCollabIT "…: 승인/반려/회수" raw enum 미노출, GroupwareAdminControllerIT "이미 종료된 결재선입니다: 반려") + 직렬화 REST 응답 raw name("ACCEPTED"/"PENDING") 유지 실증. 정직보고: CollabSuggestion.requireProposed·ApprovalStepBase.ensurePending은 방어적 불변식(현 아키텍처 HTTP 도달불가·단위테스트 커버).

## 참고
- OutboxStatus(partner-order SlipPublishOutbox:121) raw 누출은 별개 enum → 향후 #787 후속 후보.
- #787 잔여: UUID interpolation sweep · docs/qa 증적 재생성.

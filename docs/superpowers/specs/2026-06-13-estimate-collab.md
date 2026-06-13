# §7 전역 협업 슬라이스 3 (PR 4차) — 견적(ESTIMATE) 수정완료 1-인 협업

> 2026-06-13 · 에픽 [[project-global-collab-epic]] · 워크플로우 [[temp-multimodel-workflow]]
> 선행 머지: 슬라이스 0 입출고전표(#474) · 1 회계전표(#475) · 2 주문(#476)

## 1. 목표

`shared:collab-core` "수정완료(1-인) 편집 + 코멘트 + diff + 알림" 패턴을 **견적서(Estimate)** 도메인(`services/slip-service`)에 롤아웃한다. 슬라이스 2(주문, `partner-order-service`) 구현을 클론 템플릿으로 삼고, 견적 도메인 특성에 맞춰 편집 필드·잠금 상태·알림 대상을 정합한다.

**핵심 모델(절대 혼동 금지)**: 제안/수락(2-인) 아님 = **문서 수정(1-인)**. 확정/완료 상태 견적에서 권한자 본인이 "수정"→편집→"수정완료" = **즉시 커밋**(별도 승인자 없음·잠금 우회·다필드 1버전·diff 기록).

## 2. 도메인 결정 (PM 정찰 확정)

| 항목 | 견적 결정 | 근거/레퍼런스 |
|---|---|---|
| 엔티티 | `Estimate`(헤더) + `EstimateLine`(라인) | `slip.estimate.domain.*` |
| 상태 머신 | QUOTE_DRAFT→QUOTE_SENT→QUOTE_ACCEPTED→QUOTE_CONVERTED, 분기 QUOTE_REJECTED | `EstimateStatus` |
| 확정/완료 상태(수정완료 진입 대상) | **QUOTE_ACCEPTED(수주완료)** — 일반 편집(EDITABLE={DRAFT,SENT}) 차단됨 | 회계전표 POSTED 대응 |
| **collab 편집 필드(soft only)** | `memo`(비고) + `validUntil`(유효기간) + `line.{lineKey}.note`(라인 메모) | 주문 memo+dueDate+remark 대응 |
| **핵심 불변(400)** | estimateNo·estimateDate·seqNo·status·partner 4-snapshot(partnerId/partnerName/partnerBusinessNo/partnerAddress)·totalSupply/totalVat/totalAmount·convertedSlipId / 라인: productId·productName·modelName·specification·quantity·unitPrice·unitPriceWithVat·supplyAmount·vatAmount·lineTotal·setHead·parentSetModel | 회계 일관성·매출 정정 차단 |
| **COLLAB_LOCKED(409)** | **{QUOTE_REJECTED, QUOTE_CONVERTED}** (물리 종결). 편집 허용 = {DRAFT, SENT, ACCEPTED} | 주문 {CANCELED,CONVERTED,CONFIRMING} 대응 |
| **알림 대상** | **기여자만** = requesterId + createdBy + revision actors(EstimateRevision.actorId) + suggestion proposers/deciders + comment authors. self-skip. username→UUID resolve(auth `/auth/internal/accounts/by-login`) | 견적은 결재자 없음 → **회계전표 패턴**(기여자만) |
| lineKey | 활성 라인 1-based index. `EstimateLine` 에 `@OrderBy("lineNo ASC, id ASC")` 결정성 추가 | 주문 lineKey 패턴 |
| page-code | **`estimates.list`** 재사용 (BE `EstimatePermissionGuard.PAGE_CODE` 일치 — [[feedback-fe-canaccess-pagecode-be-match]]) | 기존 EstimateController |
| 라우팅 | **UUID** (`@PathVariable UUID id`) — 게이트웨이 %2F 무관, 주문 하이픈 path-id 문제 **없음** | 회계전표 UUID 라우팅 대응 |
| Flyway | **V45** (slip-service 최신 = V44 slip collab) | — |
| edit-request 대체 | 견적은 edit-request 플로우 **없음**(revision/audit-overlay 인프라만 존재) → collab은 **순수 additive**, 기존 EstimateVersionHistoryPanel/AuditOverlay 보존 | — |

## 3. BE (slip-service) — collab-core 이미 의존(slice 0=slip)

신규 패키지 `com.samhanair.logis.slip.estimate.collab`:

1. **`EstimateDocumentCollaborationPort implements DocumentCollaborationPort`** (`@Component`)
   - `documentType()` → `CollabDocumentType.ESTIMATE`
   - `loadSnapshot(UUID)` → JSON(estimateNo·status·partnerName·validUntil(ISO)·memo·totalAmount·lines[{lineKey·productName·modelName·quantity·unitPrice·note}])
   - `applyChangeSet(UUID, json)` → SYSTEM_ACTOR 로 overlay patch 위임
   - `applyOverlayPatchBatch(UUID, json, actorId, actorName)` → 실 actor patch
   - `enrichChangeSetWithBefore(UUID, json)` → diff before 값 주입
   - `validateChangeSet(json)` → 구조/핵심필드 위반 early 400
   - `restoreSnapshot(UUID, json)` → memo/validUntil/line.note 만 복원
   - `canPropose/canDecide` → !SYSTEM_ACTOR
   - `resolveNotificationRecipients(UUID, exclude)` → 기여자 Set<String>(requesterId·createdBy·revision actors·suggestion·comment authors)
2. **엔티티**: `EstimateCollabComment extends CollabCommentRecord`(table `estimate_collab_comments`) · `EstimateCollabSuggestion extends CollabSuggestionRecord`(table `estimate_collab_suggestions`, `@Version`). 둘 다 `@SQLRestriction("is_deleted = false")` + `static create(...)` 팩토리.
3. **repository**: `EstimateCollabCommentRepository` · `EstimateCollabSuggestionRepository`.
4. **`EstimateCollabConfig`**: `CollabCommentService<EstimateCollabComment>` + `CollabSuggestionService<EstimateCollabSuggestion>` 빈 + repo adapters.
5. **`EstimateCollabEditService.commitEdit(port, estimateId, editorId, editorName, changeSet, reason)`** `@Transactional`: enrichChangeSetWithBefore → overlay patch 적용 → ACCEPTED suggestion(proposer=decider=editor) 저장 → resolveNotificationRecipients 알림(editor 제외, 트랜잭션 내 동기 best-effort) → SSE publish. `Result(suggestion, EstimateDetailResponse)`.
6. **`EstimateCollabController`** `@RequestMapping("/slips/estimates")`:
   - `POST/GET /{estimateId}/collab/comments`, `DELETE .../{commentId}`, `POST .../{commentId}/resolve`
   - `POST/GET /{estimateId}/collab/edits`, `GET /{estimateId}/collab/stream`(SSE)
   - **`@PathVariable UUID estimateId`** (UUID 라우팅 — resolver 불필요)
   - 헤더 X-User-Id·X-User-Name·X-Is-System-Master. 읽기=`EstimatePermissionGuard.checkView`, 쓰기=`checkEdit(UPDATE)` (page-code `estimates.list`)
7. **Estimate 도메인 메서드**(직접 set 금지·체이닝):
   - `applyCollabOverlay(field, value)` / 또는 service 레벨 overlay — memo/validUntil 헤더 + line.note(`EstimateLine.changeNote`)
   - `readOverlayField(field)` → diff 현재값
   - `guardCollabModifiable()` → COLLAB_LOCKED(REJECTED/CONVERTED) 시 `BusinessException(CONFLICT)` 409
   - **핵심 불변 필드 patch 시도 → `BusinessException` 400**(원장키 보호)
8. **`EstimateLine`** `@OrderBy("lineNo ASC, id ASC")` (lineKey 결정성).
9. **V45**`__add_estimate_collab_tables.sql`: `estimate_collab_comments` + `estimate_collab_suggestions` (V44 slip collab DDL 미러 — document_type CHECK 전 enum, status CHECK, TIMESTAMPTZ decided_at, version BIGINT, 7 audit, is_deleted partial index).

## 4. FE (desktop)

1. `api/estimateCollab.ts` — getComments/addComment/deleteComment/resolveComment/getEdits/commitEdit (`/slips/estimates/{id}/collab/...`, X-User-Id·X-User-Name).
2. `realtime/EstimateCollabRealtimeClient.ts` — SSE `/slips/estimates/{id}/collab/stream`.
3. `components/collab/EstimateCollaborationPanel.tsx` — 코멘트 스레드 + 수정완료 편집(memo/validUntil/line.note inline) + diff(`parseChangeSetDiffs`) + realtime. path→label: `memo`→"비고", `validUntil`→"유효기간", `line.{k}.note`→"{k}번 라인 메모".
4. `EstimateDetailPage.tsx` 통합 — 패널 추가. **수정완료 편집 진입 = QUOTE_ACCEPTED**(일반 편집 사라진 확정 상태), 코멘트는 전 상태. 쓰기 가드 `canAccess('estimates.list','update')`.

## 5. QA (검증 패턴 — 슬라이스 공통)

1. **BE collab IT(실 Postgres `EstimateCollabIT`)**: commitEdit memo/validUntil/line.note overlay 적용·이력 / 잠금 409(REJECTED·CONVERTED) / 핵심키(quantity·unitPrice·estimateNo 등) 400 / 빈 changeSet 400 / 알림 기여자(+Revision actor) resolve·username→UUID / 다중 라인 불변 / CHECK 제약.
2. **desktop**: `npm run typecheck` + collab playwright + 전체 playwright.
3. **Docker 실서버 QA**(게이트웨이 :8080·dev_master·VITE_MOCK_MODE off·UUID 라우팅): QUOTE_ACCEPTED 견적 수정완료→memo/validUntil/note 실변경+diff + 코멘트 9컷. 잠금(CONVERTED) 409 실증.
4. 각 리뷰 라운드 PR 게시(스크린샷 인라인).

## 6. 워크플로우

[[temp-multimodel-workflow]]: 기획(본 spec) → Codex 개발 → Opus 5-agent[PR게시+실서버 스크린샷] → Codex 5-agent → Fable5 5-agent → 다음 리뷰어 0에러까지 → PM 종합+머지. 용어 [[comment-not-collab-comment]](사용자 노출=「코멘트」).

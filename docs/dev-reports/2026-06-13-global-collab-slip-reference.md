# Dev Report — §7 전역 협업 1차: 입출고전표(slip) 풀 협업 레퍼런스 (PR #474)

> 2026-06-13 개발책임자 "우선 전역 협업 진행" + 1차 범위 **입출고전표 풀 협업**. 배차 보드 에픽(#463) spec §7(전역 협업 문서 플랫폼)의 첫 레퍼런스 구현. **빅뱅 금지** — 이미 범용 구축된 `shared:collab-core`(배차 코멘트만 실배선) 를 slip 에 풀 적용(코멘트+제안+회귀), 이후 타 문서(회계/주문/견적) 단계 롤아웃.
>
> spec: `docs/superpowers/specs/2026-06-13-global-collab-slip-reference.md`

## 1. 스코프 (IN) — 입출고전표 풀 협업
collab-core 3종(코멘트/수정제안/회귀)을 slip 에 확장 적용. slip 기존 자산(`Slip#toSnapshot`/`restoreFromSnapshot`/`SlipService.applyOverlayPatch`/`SlipRevisionService`) 재사용 — 신규 추상 0.

## 2. 구현 (Codex 개발 → Opus 라운드 fix)

### BE (slip-service)
| 영역 | 산출물 |
|---|---|
| 코멘트 | `SlipCollabComment`(+Repository) — `CollabCommentRecord` 상속, documentType=SLIP_OUTBOUND/SLIP_INBOUND, documentId=slipId, 스레드(parentId)·status(OPEN/RESOLVED)·soft-delete |
| 수정제안 | `SlipCollabSuggestion`(+Repository) — `CollabSuggestionRecord` 상속, changeSet(JSONB path→{after}), status(PROPOSED/ACCEPTED/REJECTED/WITHDRAWN), `@Version` optimistic lock |
| 포트 | `SlipDocumentCollaborationPort`(+Factory) — `loadSnapshot`/`applyChangeSet`/`restoreSnapshot`/`canPropose`/`canDecide`. OUTBOUND/INBOUND 2 빈 |
| Config | `SlipCollabConfig` — `CollabCommentService`/`CollabSuggestionService`/port 2빈 와이어링 |
| Controller | `SlipCollabController` — 코멘트 POST/GET/DELETE/resolve + 제안 propose/accept/reject/withdraw + SSE `/stream`. slipType 으로 OUTBOUND/INBOUND 포트 분기, 경로-소속 검증 |
| 마이그 | `V44` — slip_collab_comments·slip_collab_suggestions (document_type/status **CHECK**, BaseEntity 7 audit, soft-delete, 타임라인·active·status 인덱스) |
| 권한 | 코멘트 `slip.comments`, 제안 `slip.audit-overlay`(+UPDATE) — 기존 page-code 재사용(auth V36/V38 seed, lockout 위험 0) |

### FE (desktop)
- `api/slipCollab.ts` · `realtime/SlipCollabRealtimeClient.ts`(createRealtimeClient 재사용 SSE) · `components/collab/SlipCollaborationPanel.tsx`(코멘트 스레드 + 제안 목록 + 회귀 이력 + 실시간) · `SlipDetailPage.tsx` 배선 · `mock.ts` 핸들러.
- design-system `Input`/`Select` 적용. `Textarea` 는 design-system 부재 → raw 유지(억지 신규 금지).

## 3. 다모델 리뷰 ([[temp-multimodel-workflow]])

### Round A — Opus 5-agent (리뷰 + Opus 자기 라운드 fix)
| # | 심각도 | 지적 | fix |
|---|---|---|---|
| A1 | **P1** | `applyChangeSet` 가 필드마다 `SlipService.applyOverlayPatch` 호출 → ①잠금 전표 APPROVED 가 첫 필드에서 소진되어 둘째 필드 CONFLICT(다중필드 제안 수락 항상 실패) ②필드 수만큼 EDIT revision 오염 | `SlipService.applyOverlayPatchBatch` 신규 — 잠금 가드 1회 + APPROVED 1회 소진 + revision 1건. 잠금 정책은 직접편집과 **동일**(협업 수락이 우회 안 함, 일관 정책). port 가 changeSet 을 LinkedHashMap 으로 모아 단일 호출 |
| A4/A5 | **P1** | `slip.collab.*` 테스트가 ci.yml allowlist 미등재 → CI 영구 미실행(false-green) | ci.yml slip-units 에 `--tests "com.samhanair.logis.slip.collab.*"` 등재. IT 는 `slip.it.collab` 패키지 → 기존 `slip.it.*` 자동 커버 |
| A4/QA | **P1/P2** | BE IT 전무(spec §1-3 요구) — applyChangeSet 실 적용·CHECK 거부·403·INBOUND·optimistic 미검증 | `SlipCollabIT`(slip.it.collab, 실 Testcontainers Postgres) **13건** 신규 — 코멘트 라운드트립·제안 accept 실적용+단일 revision·다중필드 단일 revision·reject/withdraw·종결 재accept 409·403 deny·OUTBOUND/INBOUND documentType·CHECK 제약 native INSERT 거부·타전표 스코프 404 |
| A3 | **P1** | FE `getSlipCollabComments` 가 BE `limit` 파라미터 미전달 | limit 인자(default 20) 쿼리 전달 |
| A3/A1 | **P2** | `decidedAt`(Instant) vs `createdAt`(LocalDateTime) → 화면 UTC/로컬 9시간 어긋남 | 응답 DTO 에서 decidedAt 을 시스템 타임존 LocalDateTime 으로 변환(createdAt 과 동일 표기) |
| A2 | **P2** | `canPropose` 가 zero-UUID(헤더 부재 actor) 미거부(`!= null` 통과) | `SYSTEM_ACTOR_ID` 명시 거부 + 단위 테스트 |
| A2 | **P2** | slip_collab_suggestions active partial 인덱스 누락 | V44 `ix_slip_collab_suggestions_document_active` 추가 |
| A3 | **P2** | mock DELETE 댓글 target 미존재 시 404 미반환·mutation 오류 미표시·raw HTML | mock 404 + `role="alert"` 오류표시 + design-system Input/Select |

**Opus 라운드 검증**: slip-service 전체 테스트 green(IT 13 + 단위), desktop typecheck green, UUID 비공개 전수 확인.

### Round B — Codex 5-dim (예정)
### Round C — Fable5 5-agent (예정)

## 4. 범위 밖 (DEFER — 단계 롤아웃)
- 타 문서(ACCOUNTING_VOUCHER·PARTNER_ORDER·ESTIMATE) 협업 = 후속 §7 슬라이스.
- dispatch 상태머신(MODIFICATION_*) ↔ collab suggestion 통합.
- 라인 단위 전체 협업(현 1차는 overlay-patch 지원 헤더 필드).

## 5. 미결 정책 (개발책임자 확인 대기)
- **self-accept(4-eyes)**: 현재 `canDecide == canPropose`(동일 page-code) — 제안자가 자기 제안 self-accept 가능. spec 에 분리 명문 없어 1차는 허용. 제안↔승인 분리(제안자≠결정자) 강제 여부 = 후속 정책 결정. (신규 업무규칙이라 PM 단독 도입 안 함)

## 6. 원칙 준수
[[codex-implements-claude-reviews]](step2 Codex 개발) · 각 라운드 모델 자기 fix([[temp-multimodel-workflow]]) · [[qa-docker-real-test]](실 Postgres IT) · [[enum-expansion-check-constraint]](V44 CHECK) · [[uuid-no-user-visibility]](실명만) · [[ci-test-filter-false-green]](allowlist 등재) · [[function-documentation]](한국어 Javadoc + 본 dev-report) · [[korean-commits]]. 머지 = 다음 리뷰어 0 error + CI green + Docker 실QA 후.

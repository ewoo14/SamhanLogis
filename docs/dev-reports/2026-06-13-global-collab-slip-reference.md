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

### Round B — Codex(GPT-5.5 high) 5-dim (리뷰+Codex 자기 fix)
- **P2**: `applyChangeSet` malformed changeSet(after 없는 entry/scalar)가 silent field-clear → after 필드 가진 JSON object 강제 + 단위 2건.
- **P3 추가 fix**(0-skip): mock GET limit slice · FE 댓글 권한 BE 액션 분리(create/update/delete) · IT +2(non-proposer withdraw 403·cross-document accept 404).
- **DEFER**: X-User-Name 헤더 신뢰 hardening(게이트웨이 전역 스코프).

### Round C — Fable5 5-agent adversarial (리뷰+Fable5 자기 fix)
- **C1 P2**: 배치 audit-log N분열+phantom SSE → `SlipService.applyOverlayPatchBatch` 가 `recordBatch` 1회(audit revision_no 1+slip:edit SSE 1+EDIT revision 1).
- **C2 P2**: 동시결정 race 패자 500+내부메시지 노출 → GlobalExceptionHandler OptimisticLock→409(미노출).
- **C3 P2**(바이트코드 실증): `decided_at` TIMESTAMP(naive)↔Instant 시간의미 분열 → **TIMESTAMPTZ**(미머지 마이그 in-place, validate 통과).
- **C4 P2**: mock 권한 매트릭스 slip.comments/slip.audit-overlay 부재(협업 UI 전건 숨김) → V36 정합 등재+sweep 3건 · isCollabEvent 화이트리스트(burst invalidate 차단).
- **C5**: IT 15건 CI 실행·통과 아티팩트 실증(false-green 없음). 잠금전표 accept IT + propose malformed→400 IT 보강 · Codex 삽입 IT 한국어 javadoc 정정 · Playwright slip-collab 스펙 신규(2/2).
- **propose 시점 검증**: validateChangeSet 추출(저장 전 400). 
- **DEFER**: self-accept 4-eyes(정책) · 결정자 audit 귀속(collab-core 포트 시그니처=후속) · changeSet before-conflict(LWW) · 2중 SSE 구독 공유 · nightly/ci shared drift(기존·범위밖).

### Round D — Opus 확정 (머지 게이트)
- BE/FE/통합 3-에이전트: Round C fix 전건 착지 PASS, **신규 차단결함 0** → 개발책임자 게이트("다음 리뷰어 0 오류") 충족.
- 검증: slip-service 990 테스트 0실패·0skip(SlipCollabIT 18/18 실 Postgres) · desktop typecheck · Playwright 34/34.

## 3-D. 개발책임자 정책 정정 + 실서버 QA (2026-06-13, Round D 이후)
개발책임자 의도 확정: **제안 기능 = 전표 확정(CONFIRMED)/완료(COMPLETED) 이후 수정 + 무엇이 바뀌었는지 알림**. 이에 따라 Round A 의 "협업 수락 = 잠금 일관(우회 없음)" 결정을 **폐기**하고 아래로 정정:

1. **제안 수락 = 확정/완료 전표 공인 수정(잠금 우회)**: `SlipService.applyOverlayPatchBatch` 가 `guardLockPolicy`(확정=APPROVED 수정요청 필요) 대신 신규 `guardCollabModifiable` 사용 — 수락자(권한자)가 곧 승인자이므로 별도 수정요청 승인 없이 적용 + 버전기록 + 알림. **물리 종결(SHIPPING/DELIVERED/CANCELED/REJECTED)만 409 차단**. IT 시나리오 8 재작성(확정→수락 성공+revision+1 / 배송완료→409).
2. **실서버 QA 발견 결함 — MASTER 제안/수락 락아웃**: `@RequirePermission`(PermissionAspect)은 `X-Is-System-Master` 헤더로 MASTER bypass 하나, 포트 `canPropose/canDecide` 의 `permissionClient.check(accountId,...)`(계정단위)는 master bypass 미적용 → MASTER 가 엔드포인트는 통과하나 canPropose 에서 오거부(제안/수락 전건 불가). IT 가 check allow-all mock 이라 미적발. **Fix**: 권한 판정을 엔드포인트 `@RequirePermission(slip.audit-overlay, UPDATE)` 에 위임(권위 게이트: 미인가 403/인가·master 통과), 포트는 무효 actor(null/zero-UUID) 가드만. ([[enforcement-real-http-test]] — mock allow-all 이 가린 실 결함을 실서버 QA 가 적발)
3. **presence(동시 시청자 + 사용자별 색상) = 후속 슬라이스 분리**(개발책임자 결정). 본 §7 = 코멘트+제안+회귀+실시간 변경반영까지.

**실서버 QA(Docker 실 게이트웨이 :8080, dev_master 실로그인)**: 확정전표(2026/04/08-001) propose 201 → accept 200 ACCEPTED → **memo 실 변경 입증**(잠금 우회 공인수정). 코멘트 등록/조회/제안 목록 실동작 확인.

## 4. 범위 밖 (DEFER — 단계 롤아웃)
- **presence(동시 접속자 표시 + 사용자별 랜덤 색상, Google Docs 식) = 후속 슬라이스**(개발책임자 2026-06-13).
- 타 문서(ACCOUNTING_VOUCHER·PARTNER_ORDER·ESTIMATE) 협업 = 후속 §7 슬라이스.
- dispatch 상태머신(MODIFICATION_*) ↔ collab suggestion 통합.
- 라인 단위 전체 협업(현 1차는 overlay-patch 지원 헤더 필드).

## 5. 미결 정책 (개발책임자 확인 대기)
- **self-accept(4-eyes)**: 현재 제안자가 자기 제안 self-accept 가능(권한자라면). spec 에 분리 명문 없어 1차는 허용. 제안↔승인 분리(제안자≠결정자) 강제 여부 = 후속 정책 결정. (신규 업무규칙이라 PM 단독 도입 안 함)

## 6. 원칙 준수
[[codex-implements-claude-reviews]](step2 Codex 개발) · 각 라운드 모델 자기 fix([[temp-multimodel-workflow]]) · [[qa-docker-real-test]](실 Postgres IT) · [[enum-expansion-check-constraint]](V44 CHECK) · [[uuid-no-user-visibility]](실명만) · [[ci-test-filter-false-green]](allowlist 등재) · [[function-documentation]](한국어 Javadoc + 본 dev-report) · [[korean-commits]]. 머지 = 다음 리뷰어 0 error + CI green + Docker 실QA 후.

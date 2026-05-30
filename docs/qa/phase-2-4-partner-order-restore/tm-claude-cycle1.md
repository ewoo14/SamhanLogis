# 🔍 TM 통합 리뷰 — Phase 2.4 주문(Partner-Order) RESTORE · Cycle 1 (Claude 5-agent)

> 대상 HEAD: `9d3bcfd4` · Codex 토큰 소진(6/1 12:00 복구 전) → **Claude 5-agent 전면 대체** ([[feedback_early_pr_docker_qa_screenshots]])
> 5팀(BE/FE/Designer/QA/DevOps) 병렬 리뷰 종합. (BE/FE/QA/DevOps 리뷰 산출물은 본 통합 문서에 종합, Designer 는 claude-designer-cycle1.md.)

## 종합 판정: CHANGES REQUESTED (P0 0 / P1 6 / P2 7 / Minor 다수). DevOps 단독 APPROVE.

### P1 — Cycle 1 fix 의무

| # | 팀 | 위치 | 문제 | 권장 |
|---|---|---|---|---|
| P1-1 | BE | PartnerOrderRevisionService.restore | 삭제주문 undelete 후 `replaceLines` 가 soft-deleted 라인을 markDeleted 루프에서 못 걸러 중복 잔존 위험. create→edit→delete→restore IT 누락 | restoreFromDeleted 후 `entityManager.refresh` 또는 재조회 + 해당 IT 추가 |
| P1-2 | FE | partnerOrderRevision.ts:57 + BE application.yml | `createdAt`(LocalDateTime) Jackson 기본 timestamp 배열 직렬화 가능 → FE `formatLocalDateTime` 오작동 | BE `spring.jackson.serialization.write-dates-as-timestamps:false` + FE 방어적 파싱 |
| P1-3 | FE | PartnerOrderVersionHistoryPanel:140 | 복원 성공 invalidate `['partner-orders', orderId]` 가 목록 queryKey(`['partner-orders', dateFrom,...]`) prefix 불일치 → 목록 stale(F5 회귀) | `['partner-orders']` prefix 무효화 |
| P1-4 | Designer | Panel 토스트 L193/196 | slipResyncRequired 경고/에러가 `role="status"`(polite) → 긴급 경고 부적합 | warning/danger → `role="alert"`, success → `role="status"` 분기 |
| P1-5 | QA | IT case2:284 | `rev1LineCount = revision.getRevisionNo()`(항상 1) → 라인 수 검증 무의미 | `findByPartnerOrderId...hasSize(...)` 로 실제 라인 검증 |
| P1-6 | QA | IT case3 + 단위 | CONFIRMED 복원 후 `status=CONFIRMED` 보존 DB 단언 누락 | restore 후 status 단언 추가 |

### P2 — Cycle 1 반영

- **[BE]** 채번 재시도(`saveWithNextRevisionNo`)가 같은 트랜잭션·세션 → rollback-only 오염 위험. `REQUIRES_NEW` 격리 또는 EstimateRevisionService 검증 근거 명시.
- **[BE]** `GlobalExceptionHandler` ResponseStatusException → errorCode 항상 `INTERNAL_ERROR`. 409/4xx 분기 불가 → HTTP status→errorCode 매핑.
- **[Designer]** 닫기버튼 `x`(알파벳) → `×`(U+00D7, partner 2.3 일관). STATUS 배지 `success`→`neutral`/`brand`(부정 전이 오해).
- **[QA]** DRAFT 복원 단위테스트 라인수 단언 추가 / Playwright 시나리오 번호 불연속(6→5) 정렬 / MASTER bypass `verify(never check)` 단언.

### Minor (선별 반영)
- V7 DDL 주석 revision_type 에 DELETE 누락. cancel STATUS 死코드 Javadoc 명시. marginLeft 하드코딩→토큰. 토스트 닫기 native button→DS Button. 404 reason UUID 노출 FE 주의. 배포순서/undo 운영 체크리스트(DevOps).

### 긍정 평가 (공통)
- 제외목록 복원 가드(미래 ON_HOLD 호환) + slipResyncRequired 분리 / displayNameOrNull UUID 가드 전 경로 / V7 partial unique + 채번 race / V40 V39 7-action 정합·MASTER bypass / IT 9 케이스 + @MockBean 격리 / FE 타입 BE DTO 1:1 + DS 컴포넌트 + revisionType exhaustive.

→ Cycle 1 fix(BE/FE/Designer/QA 항목) 후 **사이클 N=2 의무**([[cycle-n2-mandatory]]) 재리뷰 → CI green(skipped=0) → Docker 실 QA → 머지.

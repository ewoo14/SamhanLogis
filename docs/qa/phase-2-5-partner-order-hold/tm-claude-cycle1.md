# 🔍 TM 통합 리뷰 — Phase 2.5 주문 보류(ON_HOLD)+리스트 필터 · Cycle 1 (Claude 5-agent)

> HEAD `f8a3c211` · Codex 다운 → Claude 5-team 대체. DevOps APPROVE, 4팀 CONDITIONAL.

## 종합 판정: CHANGES REQUESTED (P0 0 / P1 4 / P2 8 / Minor 다수)

### P1 — Cycle 1 fix 의무 (핵심: list 보정 불완전 클러스터 + 뱃지)
| # | 팀 | 위치 | 문제 | 권장 |
|---|---|---|---|---|
| P1-1 | BE | QueryService.list | status=null(전체) 시 confirmedAt 기준 → DRAFT/ON_HOLD(confirmedAt NULL) 기간필터 누락+정렬 밀림 | COALESCE(confirmedAt, createdAt) 또는 전체조회 createdAt 통일 |
| P1-2 | BE | QueryService.list | CONFIRMING 도 confirmedAt NULL 가능 → preConfirm 에 CONFIRMING 미포함 누락 | `preConfirm = DRAFT/ON_HOLD/CONFIRMING` 또는 NULL fallback |
| P1-3 | FE | SalesPartnerOrderListPage | 기간필터 기본값(최근 N일, confirmedAt 가정)이 DRAFT(createdAt) 와 충돌 → 진행중 빈 화면 가능 | DRAFT/ON_HOLD 선택 시 기간 기본 createdAt 기준/해제 |
| P1-4 | Designer | status 뱃지 | ON_HOLD Badge variant 매핑 누락 → 보류 뱃지 색 없음/neutral | ON_HOLD=warning(주의) variant |

### P2 (Cycle 1 반영 권장)
- **[BE]** hold/release actorId·actorName 미사용(전이 이력 미기록) → 최소 dev-report 명시 또는 PartnerOrderHistory 기록 / markOnHold·releaseHold 동시성 @Version 확인.
- **[QA]** createdAt 정렬·기간필터 보정 IT 케이스 추가(P1-1/1-2 회귀 가드) / ON_HOLD 복원(Phase 2.4 연계) IT.
- **[FE]** 버튼 isPending disabled(중복클릭) / hold·release onError 토스트(409·403) / status 문자열 하드코딩 비교 grep.
- **[Designer]** CONFIRMING 라벨 '처리중' 검토 / 보류·해제 버튼 variant 위계.
- **[DevOps]** (선택) `(status, created_at DESC)` 인덱스.

### 정상 (공통)
- 전이 가드(markOnHold DRAFT만/releaseHold ON_HOLD만 409) / 권한 edit UPDATE 일치 / confirm 영향없음 결론 타당 / **마이그레이션 불필요 검증됨(status VARCHAR CHECK 없음)** / ON_HOLD requireRestorable 자동 포함(복원 가능) / IT @MockBean+7-action skipped=0 / FE 라벨 사용처 한정 / typecheck 0.

→ Cycle 1 fix(P1 4 + P2 핵심) → 사이클 N=2([[cycle-n2-mandatory]]) → CI green → Docker 실 QA → 머지.

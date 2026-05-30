# 🔍 TM 통합 리뷰 — Phase 2.4 주문 RESTORE · Cycle 2 (Claude 5-agent 재리뷰)

> 대상 HEAD: `6a36e08e` (cycle1 fix 후) · 사이클 N=2 의무([[cycle-n2-mandatory]]) — cycle1 fix 가 새 결함 도입했는지 cross-check.

## 종합 판정: 4팀 APPROVE (cycle2). 차단 결함 0. 비차단 권고 3건.

### cycle1 결함 fix 검증 — 전부 해소 ✅
| cycle1 결함 | fix | cycle2 검증 |
|---|---|---|
| P1-1 삭제복원 라인 정합 | native markDeleted + replaceLines + IT case8 | ✅ 삭제 흐름 중복0 검증 (일반복원 갭 아래) |
| P1-2 createdAt ISO | write-dates-as-timestamps:false + FE 방어파싱 | ✅ |
| P1-3 invalidate F5 | `['partner-orders']` prefix | ✅ 목록 stale 해소 |
| P1-4 토스트 role | success=status / warning·danger=alert | ✅ |
| P1-5/P1-6 IT 단언 | case2 라인수 / case3 status DB 단언 | ✅ |
| P2 채번/errorCode | Estimate 미러 근거 / HTTP status switch | ✅ 회귀 없음 |
| Designer D-1~5 | role/× /brand/토큰/⚠ | ✅ (brand 중복 아래) |

### 비차단 권고 (머지 가능, 정리 권장)
1. **[BE+QA] 일반 복원 라인 이중 markDeleted**: restore 가 native markDeleted + replaceLines 내부 markDeleted 이중 경로. 삭제주문은 정상(this.lines 비어 no-op), **삭제 안 된 일반 복원**은 이중 처리(idempotent라 결과 정확하나 비효율). IT case8 은 삭제 흐름만 검증. → `order.isDeleted()` 분기 또는 통합 + create→edit→restore IT.
2. **[FE+Designer] STATUS=brand ↔ EDIT=brand 색 중복**: STATUS 배지가 EDIT 과 같은 brand. 死코드(cancel 미구현)라 노출 0. → STATUS=neutral 권장.
3. **[QA] MASTER bypass `verify(never)` 단언 부재**: case5b lenient stub 만, AOP bypass 실 경로 미검증. false-green 잠재.

→ 모두 비차단. [[no-backlog-strict]] 기준 단순 fix(1~2건)는 cycle 2c 즉시 처리 권장, MASTER verify 갭은 후속 가능.

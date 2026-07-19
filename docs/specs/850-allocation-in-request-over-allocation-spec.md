# #850 배분 과할당 — 요청 내 누적 미반영 fix (기획 spec)

> OPUS 기획 · 회계체인 슬라이스(#823 거래처 검증 → 전표 필수화 → **#850 과할당**). #823 CODEX SOL 기획검수가 포착한 별개 over-allocation 계열.

## 1. 문제 (회계 무결성 버그)

매출/매입 회계전표 발의 시 원천(출고/입고) 전표 라인에 대한 **배분 금액 합이 원천 라인 잔여를 초과**할 수 있다. `verifySourceAndAllocation`(`SalesAccountingSlipCreateAttemptService.java:90`·`PurchaseAccountingSlipCreateAttemptService.java:90`)의 과할당 검증이 **DB 기존 합계만** 조회하고 **같은 요청 내 앞선 배분분을 누적하지 않기** 때문.

```
// line 114-116 (매출·매입 동일)
BigDecimal already = allocationRepository.sumAllocatedAmountBySourceLineId(ar.sourceLineId()); // DB만
BigDecimal next = already.add(ar.allocatedAmount());
if (next.compareTo(src.lineTotal()) > 0) throw OVER_ALLOCATION;
```

`verifySourceAndAllocation`은 배분 루프(line 73-76)에서 **배분마다** 호출되지만, 슬립은 루프 종료 후 line 86에서 한 번에 `saveAndFlush` 되므로 루프 중에는 DB `already`가 갱신되지 않는다. 따라서 **한 요청에 같은 `sourceLineId`가 여러 배분으로 등장하면** 각 호출이 동일한 `already`를 보고 각각 통과 → 커밋 시 합계가 잔여 초과.

**재현**: 원천 라인 `lineTotal=100`, DB `already=0`. 한 요청에 같은 원천으로 배분 A(60)+B(60): 각각 `0+60=60 ≤ 100` 통과 → 원천에 120 배분(20 과할당). 기존 테스트는 `DB 900 + 신규 600` 형태만 커버(요청 내 누적 미검증).

**동시성은 이미 방어됨**: `acquireSourceLineLock`(`pg_advisory_xact_lock`, line 125)이 서로 다른 요청을 원천 라인별 직렬화. 본 버그는 **단일 요청 내부** 누적 누락이라 락과 무관(락은 tx 재진입이라 같은 요청 내 재획득은 무효과).

## 2. 결정 (design)

### D-850-01 요청 내 `sourceLineId`별 누적 검증
검증 불변식을 **`DB_sum(sourceLineId) + 요청내_기누적(sourceLineId) + 이번_배분 ≤ 원천_lineTotal`** 으로 강화. 요청 처리 동안 `Map<UUID sourceLineId, BigDecimal>` 누적기를 유지하고, 각 배분 검증 통과 후 그 배분 금액을 누적기에 합산한다.

### D-850-02 `firstAllocation` 사전검증분도 누적 포함 (미묘점)
현 구조는 헤더 거래처 도출을 위해 `firstAllocation`을 **루프 이전**(line 56)에 1회 검증하고, 루프의 첫 등장(line 74)에서는 `firstSource` 재사용으로 **재검증을 건너뛴다**. 이 `firstAllocation`의 배분 금액도 실제 배분(line 78-81)이므로 **누적기에 반드시 포함**돼야 한다. 안 그러면 firstAllocation과 같은 원천의 후속 배분이 firstAllocation 몫을 못 보고 통과. → 누적기를 line 56 검증 시점에 시딩(또는 검증 로직을 누적기 경유로 일원화).

### D-850-03 매출·매입 대칭
`Sales`/`Purchase` 두 서비스가 구조 동일(OUTBOUND/INBOUND만 차이) → 동일 fix 대칭 적용. 공통 로직 추출 여부는 구현 재량(중복 최소화 권장하되 두 서비스 독립성 유지 시 각자 적용도 허용).

### D-850-04 에러 메시지 잔여 = `lineTotal − DB_sum − 요청내_기누적`
현 메시지(line 118-120)의 `잔여 = lineTotal − already`는 요청 내 앞선 배분을 반영하지 않아 오도. `잔여 = lineTotal − already − 요청내_기누적`으로 정정(사용자가 정확한 배분 가능액 인지).

### D-850-05 reject 패턴 계승 (capping 아님)
#823 결정("귀속키 단수 수렴 reject")과 동일하게 **초과 시 4xx 한국어 거부**(부분 배분·capping·자동 절삭 없음). `ErrorCode.SAS_OVER_ALLOCATION` 재사용.

### D-850-06 구현 방식
- **권장(surgical)**: `verifySourceAndAllocation`에 `Map<UUID,BigDecimal> inRequestAllocated` 파라미터 주입 → 내부에서 `already + inReq + thisAmount` 검증 후 `merge`. line 56 사전검증도 같은 map 사용. 기존 검증 흐름(전표유형·상태·거래처 일치) 최소 변경.
- **대안**: 요청 전체를 `sourceLineId`별 사전 집계(`groupingBy`) 후 원천별 합을 1회 검증. 더 선언적이나 per-배분 검증(유형/상태/거래처) 구조와 이원화 → blast-radius 큼. 권장안 채택.

## 3. 검증 (테스트 요구)

- **회귀 IT(실 HTTP)**: 동일 요청 같은 `sourceLineId` 2회 배분 (합 > 잔여) → `SAS_OVER_ALLOCATION` 4xx. 매출·매입 각각. 실 FE payload 형태(라이브 QA 관통·[[feedback_live_qa_penetrates_it_masking]]).
- **경계**: 동일 요청 같은 원천 합 == 잔여 → 통과(off-by-one 방지).
- **firstAllocation 케이스**: firstAllocation(60) + 같은 원천 후속(60), 잔여 100 → 거부(D-850-02 누적 포함 검증).
- **DB+요청 결합**: DB already 50 + 요청 내 30+30(=60), 잔여 100 → 거부(50+60=110>100).
- **무회귀**: 기존 DB-only 과할당 테스트·정상 배분·다중 원천(서로 다른 sourceLineId) 병렬 배분 통과 유지.
- **잔여 메시지**: 거부 메시지 잔여값이 `lineTotal − already − inReq` 정확.

## 4. 워크플로우 (캐논)
OPUS 기획(본 spec·조기 PR) → CODEX SOL 5.6 기획검수 → CODEX LUNA 5.6 구현 → OPUS R1 5-agent+라이브QA+fix → CODEX SOL R2 5-agent(fix=LUNA) → 0수렴까지 반복 → 재수렴 1회 → PM 종합 → CI green → 머지.

## 5. 스코프 경계
- 회계 무결성 버그 fix 한정. 배분 UX·자동배분·부분배분 신기능 = 스코프 밖.
- `pg_advisory_xact_lock`(요청 간 동시성)은 현행 유지(본 버그와 무관·정상).
- 별건 #854(outbox self-invocation)·#851(qa-e2e BE trigger) = 무관.

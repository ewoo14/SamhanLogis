# #850 배분 과할당 — 요청 내 누적 미반영 fix (기획 spec v2)

> OPUS 기획 · 회계체인 슬라이스(#823 거래처 검증 → 전표 필수화 ✅ → **#850 과할당**). #823 CODEX SOL 기획검수가 포착한 별개 over-allocation 계열.
>
> **v2 (SOL 기획검수 R1 반영·2 BLOCKING + 2 HIGH)**: 입력 양수 불변식 신규(BLOCKING-1)·**수량** 과할당 차원 추가(BLOCKING-2)·테스트 조합/live QA 명확화(HIGH-1)·다중원천 deadlock 정렬 선잠금(HIGH-2)·MED/LOW 반영.

## 1. 문제 (회계 무결성 버그)

매출/매입 회계전표 발의 시 원천(출고/입고) 전표 라인에 대한 **배분이 원천 라인 잔여를 초과**할 수 있다. `verifySourceAndAllocation`(`SalesAccountingSlipCreateAttemptService.java:90`·`PurchaseAccountingSlipCreateAttemptService.java:90`)의 과할당 검증이:
1. **DB 기존 합계만** 조회하고 **같은 요청 내 앞선 배분분을 누적하지 않으며**(핵심 버그),
2. **금액(`lineTotal`)만** 검증하고 **수량(`quantity`)** 은 검증하지 않고,
3. `allocatedAmount`/`allocatedQty`의 **양수·널 검증이 없다**(Controller `@Valid` 부재 실측).

`verifySourceAndAllocation`은 배분 루프(line 73-76)에서 **배분마다** 호출되지만, 슬립은 루프 종료 후 line 86에서 한 번에 `saveAndFlush` 되므로 루프 중 DB `already`가 미갱신.

**재현 3종**:
- **(a) 요청 내 누적 누락**: 원천 `lineTotal=100`·DB `0`. 배분 A(60)+B(60): 각 `0+60=60 ≤ 100` 통과 → 120 배분(20 과할당).
- **(b) 음수 우회**(BLOCKING-1): 배분 `-100 + 200`: 첫 `0+0-100=-100 ≤ 100`·둘째 `0-100+200=100 ≤ 100` 통과 → 원천 단독 초과 200 영속(`recalcTotals` 금액합 `-100+200=100` 일치라 미포착). `null` → 500(NPE).
- **(c) 수량 과할당**(BLOCKING-2): 원천 수량 `10`·금액 `100`. 배분 수량 `6+6`·금액 `50+50`: 금액 `100` 통과하나 수량 `12` 과할당(`SlipLineSnapshot.quantity`·`sumAllocatedQtyBySourceLineId`·잔여뷰 `allocated_qty_sum`·FE 모두 수량 추적 → 표시값 아닌 귀속량).

## 2. 결정 (design)

### D-850-01 입력 양수·널 불변식 (신규·BLOCKING-1)
배분 검증 **최선두**(락·DB조회 前)에서 애플리케이션 레벨로 검증하고 `INVALID_INPUT` 400:
- `sourceLineId != null`
- `allocatedAmount != null && allocatedAmount > 0` (scale ≤ 2)
- `allocatedQty != null && allocatedQty > 0` (scale ≤ 3)

Bean Validation 병행: `Create{Sales,Purchase}AccountingSlipRequest` → `LineRequest` → `AllocationRequest` 중첩 `@Valid` + Controller `@Valid @RequestBody` + `AllocationRequest` 필드 `@NotNull @Positive @Digits`. **애플리케이션 선검증이 primary**(DB 제약만 의존 불가 — `createDraft` 경로가 `DataIntegrityViolationException` 을 `SAS_SLIP_NO_CONFLICT` 로 오분류하는 기존 버그 때문). **DB CHECK** `allocated_amount > 0 AND allocated_qty > 0` = 방어심층화(기존 데이터 audit=위반 0 확인 후 신규 V 마이그·멱등). 음수·0·null HTTP 회귀 매출·매입 모두.

### D-850-02 요청 내 누적 검증 — 금액 AND 수량 (구 D-850-01 확장·BLOCKING-2)
요청 처리 동안 원천별 누적기 유지(금액·수량 각각):
- `DB_amount(sourceLineId) + inReqAmount(sourceLineId) + curAmount ≤ source.lineTotal`
- `DB_qty(sourceLineId) + inReqQty(sourceLineId) + curQty ≤ source.quantity`

둘 중 하나라도 초과 시 reject. 각 배분 검증 통과 후 금액·수량을 누적기에 합산. `sumAllocatedAmountBySourceLineId`·`sumAllocatedQtyBySourceLineId`(둘 다 존재) 사용. `source.quantity`(int) → `BigDecimal.valueOf` 비교.

### D-850-03 firstAllocation 시딩 — 금액·수량 both (구 D-850-02)
`firstAllocation`은 헤더 거래처 도출 위해 루프 前(line 56) 1회 검증되고 루프 첫 등장(line 74)서 객체동일성으로 재검증 스킵. 이 배분의 **금액·수량 모두** 누적기에 시딩(사전검증 직후). → firstAllocation 과 같은 원천의 후속 배분(같은/다른 LineRequest·`A+B+A` 교차)이 firstAllocation 몫을 반영. 사전검증의 `already` 기준은 DB_sum(요청 내 첫 누적이라 옳음).

### D-850-04 매출·매입 대칭
`Sales`/`Purchase` 두 서비스 구조 동일(OUTBOUND/INBOUND·한국어 명칭만 차이·숨은 bulk/update 배분 생성 경로 없음 확인). 동일 fix 대칭. 공통 로직 추출은 구현 재량(중복 최소화 권장).

### D-850-05 에러 메시지 — 실패 차원별 잔여 (구 D-850-04 확장·MED)
- 금액 초과 → `잔여금액 = lineTotal − DB_amount − inReqAmount`
- 수량 초과 → `잔여수량 = quantity − DB_qty − inReqQty`

실패 차원과 잔여 단위를 일치(수량 초과에 금액잔여 표시 금지). 기존 DB 합계가 이미 원천을 넘어 음수면 `배분가능 0`으로 표기(raw 음수 미노출). 금액 표시 scale=2 고정(테스트 취약성 감소).

### D-850-06 동시성 — distinct 원천 정렬 선잠금 + 원천별 1회 캐시 (신규·HIGH-2)
현 코드는 배분마다 payload 순서로 `pg_advisory_xact_lock` 획득 → **다중 원천 역순 요청**(req1 `A→B`, req2 `B→A`) advisory deadlock 가능(현재 `40P01` 재시도 없음·과할당 영속은 막으나 5xx). → 요청의 **distinct sourceLineId 를 정렬 순서로 up-front 선잠금**해 락 순서 역전 제거. 원천별 `getSlipLine`(외부호출) + DB 기준합계(금액·수량)를 **1회 조회 캐시**(반복 sourceLineId 재호출 제거·MED). "동시성 정상·무관" 단정 삭제(요청 간 직렬화는 성립하나 다중원천 deadlock 은 잔존했었음).

### D-850-07 reject 패턴 계승 (구 D-850-05·LOW wording)
초과 시 4xx 한국어 거부 — **서버 자동 capping/부분수락 없음**. ⚠️ 사용자가 잔여 이하를 명시해 만드는 **정상 부분배분은 기존 핵심 기능(D-SAS-04/05) 유지**("부분배분 불가" 아님). `ErrorCode.SAS_OVER_ALLOCATION` 재사용.

### D-850-08 구현 방식 + 방어검증
- accumulator = `Map<UUID, {amount, qty}>`(또는 두 Map) 을 `verifySourceAndAllocation` 및 line 56 사전검증이 공유.
- 정렬 선잠금 후 원천별 snapshot·기준합계 캐시 재사용.
- `src.lineId()` 가 요청 `sourceLineId` 와 일치하는지 방어검증(상한값 출처 = client 응답·key = 요청 ID 이므로 불일치 시 오검증 방지).
- 대안(사전 집계 `groupingBy`)은 per-배분 유형/상태/거래처 검증과 이원화라 blast-radius 큼 → 미채택.

## 3. 검증 (테스트 요구·HIGH-1)

**단위/서비스 + 통합** 매출·매입 각각:
- 한 `LineRequest.allocations` 내부 `A+A`(합>잔여)→reject
- 서로 다른 `LineRequest` 걸친 `A+A`→reject
- 교차 `A+B+A`→reject(A 누적)
- 동일 원천 3회↑
- `DB=50 + 요청 25+25=100` 통과(경계) · `DB=50 + 요청 30+30=110` 거부
- **firstAllocation 금액·수량 시딩** 확인(first + 같은 원천 후속)
- **수량 과할당**(금액 정확·수량 초과)→reject · 수량 경계 통과
- **음수·0·null** allocatedAmount/Qty → 400(락/외부호출 전)
- 거부 후 전표·allocation **미영속**(0행)
- **slipNo 충돌 재시도 시 누적 Map 이 다음 attempt 로 누출 안 됨**(attempt별 초기화)
- 다중 원천(서로 다른 sourceLineId) 정상 배분 통과(무회귀)
- 잔여 메시지 = 실패 차원·정확값

**동시성 IT(실 Postgres)**: 동일 원천 동시 2요청(합>잔여)→하나만 성공·나머지 거부 · 역순 다중원천(`A→B`/`B→A`) 동시→deadlock 없이 완료(정렬 선잠금 실증). 현 테스트는 SQL 호출 여부만 확인 → 실제 경합 검증 신설.

**용어 정정**: 기존 `*ControllerIT` 는 `MockMvc`(Spring MVC + Postgres Testcontainers 통합·**네트워크 HTTP 아님**). "실 HTTP" 표기 지양. canonical **라이브 QA** = standalone 서버(:port) 실제 호출 + 실 FE payload(폼 render→submit)로 음성/양성 실증([[feedback_live_qa_penetrates_it_masking]]).

## 4. 워크플로우 (캐논)
OPUS 기획(본 spec·조기 PR #855) → CODEX SOL 5.6 기획검수(다회·현 R1 BLOCKING 2 반영 v2) → CODEX LUNA 5.6 구현 → OPUS R1 5-agent+라이브QA+fix → CODEX SOL R2 5-agent(fix=LUNA) → 0수렴 → 재수렴 1회 → PM 종합 → CI green → 머지.

## 5. 스코프 경계
- 회계 무결성 버그 fix 한정(배분 정확성). 배분 UX·자동배분 신기능 = 밖.
- **VOIDED/soft-delete 상위 전표의 allocation 잔여 해제** = 현재 void/update 배분 API 경로 없음 → 향후 해당 기능 도입 전 결정(별건 note·본 슬라이스 밖).
- advisory key = UUID two-half XOR 충돌 가능(무결성 무영향·불필요 직렬화만·개선 note).
- 별건 #854(outbox self-invocation)·#851(qa-e2e BE trigger) = 무관.

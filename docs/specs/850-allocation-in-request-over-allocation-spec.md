# #850 배분 과할당 — 요청 내 누적 미반영 fix (기획 spec v3)

> OPUS 기획 · 회계체인 슬라이스(#823 거래처 검증 → 전표 필수화 ✅ → **#850 과할당**). #823 CODEX SOL 기획검수가 포착한 별개 over-allocation 계열.
>
> **v2 (SOL R1·2 BLOCKING+2 HIGH)**: 입력 양수 불변식·수량 과할당·테스트/live QA·다중원천 deadlock 정렬 선잠금.
> **v3 (SOL R2·잔여 HIGH 2)**: 락 순서를 **실제 lockKey**(msb XOR lsb) 기준 정렬(HIGH-1)·입력 계약 테스트 게이트 완결(sourceLineId null·null 원소·scale/@Digits·서비스 선검증)(HIGH-2)·구현 순서 명시·accumulator/cache attempt-local·DB CHECK audit soft-delete 포함·양차원 초과 메시지 우선순위 고정.

## 1. 문제 (회계 무결성 버그)

매출/매입 회계전표 발의 시 원천(출고/입고) 전표 라인 배분이 원천 잔여를 초과할 수 있다. `verifySourceAndAllocation`(`SalesAccountingSlipCreateAttemptService.java:90`·`PurchaseAccountingSlipCreateAttemptService.java:90`)이:
1. **DB 기존 합계만** 조회하고 **같은 요청 내 앞선 배분을 누적하지 않으며**(핵심 버그),
2. **금액(`lineTotal`)만** 검증하고 **수량(`quantity`)** 을 검증하지 않고,
3. `allocatedAmount`/`allocatedQty`의 **양수·널 검증이 없다**(Controller `@Valid` 부재 실측).

`verifySourceAndAllocation`은 배분 루프(line 73-76)에서 배분마다 호출되나 슬립은 루프 종료 후 line 86 `saveAndFlush` 1회라 루프 중 DB `already` 미갱신.

**재현 3종**:
- **(a) 누적 누락**: 원천 `lineTotal=100`·DB `0`. A(60)+B(60): 각 `0+60≤100` 통과 → 120(20 과할당).
- **(b) 음수 우회**: `-100 + 200`: 첫 `-100≤100`·둘째 `0-100+200=100≤100` 통과 → 원천 단독 초과 200 영속(`recalcTotals` 금액합 100 일치라 미포착)·null→500.
- **(c) 수량 과할당**: 원천 수량 `10`·금액 `100`. 수량 `6+6`·금액 `50+50`: 금액 100 통과·수량 12 과할당(snapshot.quantity·`sumAllocatedQtyBySourceLineId`·잔여뷰·FE 모두 추적).

## 2. 결정 (design)

### D-850-01 입력 양수·널·구조 불변식 (BLOCKING-1)
배분 검증 **최선두**(락·DB조회·`getSlipLine` 前) 애플리케이션 레벨 선검증 → `INVALID_INPUT` 400:
- `req.lines()` 및 각 `lr.allocations()` 원소 **null 금지**
- `sourceLineId != null`
- `allocatedAmount != null && > 0` (`@Digits(integer=13, fraction=2)`)
- `allocatedQty != null && > 0` (`@Digits(integer=9, fraction=3)`)

Bean Validation 병행: Controller `@Valid @RequestBody` + `Create{Sales,Purchase}AccountingSlipRequest.lines` = `List<@NotNull @Valid LineRequest>` + `LineRequest.allocations` = `List<@NotNull @Valid AllocationRequest>`(단순 `@Valid List`는 null 원소 미거부) + `AllocationRequest` 필드 `@NotNull @Positive @Digits`. **애플리케이션 선검증이 primary**(Controller Bean Validation 우회하는 서비스 직접호출 경로에서도 동일 400 — `createDraft` 가 `DataIntegrityViolationException` 을 `SAS_SLIP_NO_CONFLICT` 로 오분류하는 기존 버그로 DB만 의존 불가). **DB CHECK** `allocated_amount > 0 AND allocated_qty > 0` = 방어심층화(신규 V 마이그·멱등). ⚠️ audit 는 Repository 활성행 아니라 **raw table 전 행(`is_deleted=true` 포함)** 위반 0 확인 후 추가(CHECK 는 soft-deleted 행에도 적용).

### D-850-02 요청 내 누적 검증 — 금액 AND 수량 (BLOCKING-2)
attempt 처리 동안 원천별 누적기(금액·수량):
- `DB_amount(src) + inReqAmount(src) + curAmount ≤ source.lineTotal`
- `DB_qty(src) + inReqQty(src) + curQty ≤ source.quantity`(int → `BigDecimal.valueOf`)

둘 중 하나라도 초과 시 reject. 검증 통과 후 금액·수량을 누적기에 합산. `sumAllocatedAmountBySourceLineId`·`sumAllocatedQtyBySourceLineId` 사용.

### D-850-03 firstAllocation 시딩 — 금액·수량 both
`firstAllocation`은 헤더 거래처 도출로 루프 前 검증·루프 첫 등장서 객체동일성으로 재검증 스킵 → 이 배분 **금액·수량 모두** 누적기 시딩(사전검증 직후). first 와 같은 원천 후속(같은/다른 LineRequest·`A+B+A`)이 first 몫 반영.

### D-850-04 매출·매입 대칭
두 서비스 구조 동일(OUTBOUND/INBOUND·명칭만·숨은 bulk/update 배분 경로 없음). 동일 fix 대칭. 공통 추출 구현 재량.

### D-850-05 에러 메시지 — 실패 차원별 잔여·우선순위 고정 (MED)
검증 순서 **금액 먼저 → 통과 시 수량**(결정적). 최초 위반 차원의 잔여를 보고:
- 금액 초과 → `잔여금액 = lineTotal − DB_amount − inReqAmount`
- 수량 초과 → `잔여수량 = quantity − DB_qty − inReqQty`

양차원 동시 초과 시 **금액 메시지 우선**(순서 고정→Sales/Purchase 테스트 안정). 잔여가 음수(기존 DB 이미 초과)면 `배분가능 0` 표기. 금액 scale=2 고정.

### D-850-06 동시성 — 실제 lockKey 정렬 선잠금 + 원천별 1회 캐시 (HIGH-2·R2 정정)
현 코드는 배분마다 payload 순서로 `pg_advisory_xact_lock(msb XOR lsb)` 획득 → 다중원천 역순 요청 deadlock 가능. ⚠️ **UUID 정렬로는 불충분**(락 자원 = `lockKey = msb XOR lsb`·XOR 충돌로 UUID순 ≠ lockKey순 → 순서 역전 잔존). → 처리 절차:
1. 전체 입력 검증(D-850-01)
2. distinct `sourceLineId → lockKey` 계산 후 **lockKey numeric 정렬**
3. 정렬된 lockKey 를 각 **1회** 선잠금(락 순서 역전 제거)
4. sourceLineId별 `getSlipLine`(외부호출)+DB 기준합계(금액·수량)를 **1회 조회 캐시**(반복 재호출 제거)
5. firstAllocation 검증 + 누적 시딩
6. 나머지 배분 순회 검증
7. 저장

캐시 key = sourceLineId 유지, **락 순서만 lockKey 기준**. "동시성 정상·무관" 단정 삭제. 동시성 IT: 동일원천 동시·**XOR 충돌 sourceLineId 2개+제3 key 역순 요청** deadlock 없음 실증.

### D-850-07 reject 패턴 계승 (LOW wording)
초과 시 4xx 한국어 거부 — 서버 자동 capping/부분수락 없음. ⚠️ 사용자 명시 **정상 부분배분은 기존 핵심 기능(D-SAS-04/05) 유지**. `ErrorCode.SAS_OVER_ALLOCATION` 재사용.

### D-850-08 구현 방식 + 격리 (R2)
- accumulator(`Map<UUID,{amount,qty}>`)·원천별 캐시 = **`createDraftAttempt()` 지역변수 필수**(singleton service 필드 금지 — 요청 간 격리·slipNo 재시도 파손). 재시도 시 **Map·cache 모두 재초기화**.
- `verifySourceAndAllocation` 및 line 56 사전검증이 동일 accumulator/cache 공유(파라미터 주입).
- `src.lineId()` 가 요청 `sourceLineId` 와 일치하는지 방어검증(상한 출처=client 응답·key=요청 ID).
- 대안(사전 집계 `groupingBy`)은 per-배분 유형/상태/거래처 검증과 이원화라 미채택.

## 3. 검증 (테스트 요구)

**입력 계약(D-850-01)** 매출·매입 HTTP + **서비스 직접호출**(Bean Validation 우회 시에도 선검증 증명·락/SlipService/Repository 호출 0):
- `sourceLineId=null` → 400
- allocation 원소 null(`allocations:[null]`) → 400 · line 원소 null(`lines:[null]`) → 400
- `allocatedAmount`/`Qty` 음수·0·null → 400
- scale 초과(금액 `1.001`·수량 `1.0001`) → 400 · `@Digits` integer overflow → 400

**누적 검증(D-850-02/03)** 매출·매입:
- 한 `LineRequest.allocations` 내부 `A+A`(합>잔여)→reject · 라인간 `A+A`→reject · 교차 `A+B+A`→reject · 3회↑
- `DB=50 + 요청 25+25=100` 통과(경계) · `DB=50 + 요청 30+30=110` 거부
- firstAllocation 금액·수량 시딩 확인
- 수량 과할당(금액 정확·수량 초과)→reject · 수량 경계 통과
- 거부 후 전표·allocation 미영속(0행)
- slipNo 충돌 재시도 시 **누적 Map·cache 다음 attempt 누출 없음**
- 다중원천(서로 다른 src) 정상 배분 통과(무회귀)
- 잔여 메시지 = 실패 차원·정확값·양차원 초과 시 금액 우선

**동시성 IT(실 Postgres)**: 동일원천 동시 2요청(합>잔여)→하나만 성공 · **XOR 충돌 src 2개+제3 key 역순 다중원천 동시→deadlock 없이 완료**(lockKey 정렬 실증).

**용어**: 기존 `*ControllerIT` = `MockMvc`(Spring MVC+Postgres Testcontainers 통합·네트워크 HTTP 아님). canonical **라이브 QA** = standalone 서버 실제 호출+실 FE payload(폼 render→submit)로 음성/양성 실증([[feedback_live_qa_penetrates_it_masking]]).

## 4. 워크플로우 (캐논)
OPUS 기획(본 spec·PR #855) → CODEX SOL 5.6 기획검수(R1 BLOCKING 2→v2·R2 HIGH 2→v3) → **GO 시** CODEX LUNA 5.6 구현 → OPUS R1 5-agent+라이브QA+fix → CODEX SOL R2 5-agent(fix=LUNA) → 0수렴 → 재수렴 1회 → PM 종합 → CI green → 머지.

## 5. 스코프 경계
- 회계 무결성 버그 fix 한정(배분 정확성). 배분 UX·자동배분 신기능 = 밖.
- **금액·수량 상호 비례성**(한 차원 전량 소진이 타 차원 잔여 봉쇄) = 정책 미정·후속(현 FE 동일 ratio 계산이나 독립 payload 허용). 본 과할당 상한 fix 는 비차단.
- **VOIDED/soft-delete 상위 전표 allocation 잔여 해제** = 현재 void/update 배분 API 없음 → 향후 결정(별건 note).
- 별건 #854(outbox)·#851(qa-e2e BE trigger) = 무관.

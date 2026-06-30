# 코-에디팅 S2c 상태의존 수정 카운트 — 구현계획

> **For agentic workers:** 본 계획은 표준 워크플로우(Codex 구현 → Opus/Codex 순차 듀얼리뷰 0수렴 → 라이브 QA → 머지)로 실행한다. 체크박스는 추적용.

**Goal:** 사용자 노출 "전표수정내역"(`editHistoryCount`)을 상태의존으로 게이트 — 작성자 드래프트 단계를 벗어난 後 편집만 카운트(OUTBOUND=창고이관/COMPLETED·비-OUTBOUND=결재선/SENT).

**Architecture:** `revisionCount`(=audit revisionNo)는 불변 유지. 신규 nullable `slips.revision_count_baseline`에 임계 전이 시점 revisionCount 스냅샷. 표시 카운트는 순수 계산(`baseline==null?0:max(0,revisionCount-baseline)`) — 편집경로·audit·S2b로그 무변경.

**Tech Stack:** Spring Boot 3 / Java 17, Flyway(slip_db, 다음 V53), JPA(Slip STI), Testcontainers Postgres IT, React desktop(mock).

## Global Constraints (verbatim)
- 적용된 V*.sql 불변 — 신규 V53만 추가. 마이그레이션 fresh Postgres probe 검증 필수([[feedback_migration_fresh_postgres_probe]]).
- BaseEntity 7 audit + Soft Delete 규약. UUID 사용자 비공개(본 슬라이스 신규 노출 없음).
- 컬럼명 확정: `slips.slip_type`(VARCHAR20), `slips.status`(VARCHAR20), `slips.revision_count`(INT NOT NULL DEFAULT 0).
- 도메인 전이 메서드: `send()`(SAVED→SENT, line 927) / `inspect(inspectorUserId)`(INSPECTING→COMPLETED, line 982-984). 둘 다 `incrementRevision()` 미호출(상태전이=콘텐츠편집 아님).
- editHistoryCount 생산처 = `SlipResponse` 단일(BE 전체에서 유일).

---

## Task 1: Flyway V53 — revision_count_baseline 컬럼 + backfill

**Files:**
- Create: `services/slip-service/src/main/resources/db/migration/V53__slip_revision_count_baseline.sql`

**Interfaces:**
- Produces: `slips.revision_count_baseline` (INTEGER NULL) — Task 2 도메인 필드가 매핑.

- [ ] **Step 1: 마이그레이션 작성**
```sql
-- V53: S2c 상태의존 수정카운트 — 임계 전이 시점 revision_count 스냅샷.
-- editHistoryCount = revision_count_baseline IS NULL ? 0 : max(0, revision_count - revision_count_baseline)
ALTER TABLE slips ADD COLUMN revision_count_baseline INTEGER NULL;

COMMENT ON COLUMN slips.revision_count_baseline IS
  'S2c 상태의존 수정카운트 기준선 — OUTBOUND=COMPLETED/비-OUTBOUND=SENT 전이 시점 revision_count. NULL=임계 미통과(드래프트).';

-- 기존 임계통과 전표 backfill: baseline=0 → editHistoryCount=revision_count(현 표시 보존).
-- 미통과(드래프트)·REJECTED·CANCELED 는 NULL 유지(→0).
UPDATE slips SET revision_count_baseline = 0
WHERE revision_count_baseline IS NULL AND (
  (slip_type = 'OUTBOUND'  AND status IN ('COMPLETED','SHIPPING','DELIVERED','CONFIRMED'))
  OR (slip_type <> 'OUTBOUND' AND status IN ('SENT','ACCEPTED','PROCESSING','INSPECTING','COMPLETED','SHIPPING','DELIVERED','CONFIRMED'))
);
```

- [ ] **Step 2: fresh Postgres probe 검증** — 새 DB 생성 → V1~V53 적용 `ON_ERROR_STOP` → 컬럼 존재·backfill 무오류 확인(별도 DROP/CREATE DB, 대상 row seed 후 `psql -f V53`). gradlew 로컬 skip 이 syntax 가릴 수 있음([[feedback_migration_fresh_postgres_probe]]).

- [ ] **Step 3: Commit** — `git add` 후 Claude 가 commit 대행(Codex git 금지).

---

## Task 2: Slip 도메인 — baseline 필드 + 임계 캡처 + editHistoryCount 계산

**Files:**
- Modify: `services/slip-service/src/main/java/com/samhanair/logis/slip/domain/Slip.java` (revisionCount 필드 line ~556 / send() line ~927 / inspect() line ~982)
- Test: `services/slip-service/src/test/java/com/samhanair/logis/slip/domain/SlipTest.java` (있으면 보강, 없으면 신규)

**Interfaces:**
- Consumes: `slips.revision_count_baseline`(Task 1).
- Produces: `int Slip.editHistoryCount()` — Task 3 SlipResponse 가 호출. `Slip.getRevisionCountBaseline()` (테스트용).

- [ ] **Step 1: 실패 테스트 작성**(도메인 단위, Testcontainers 불요)
```java
// 비-OUTBOUND(INBOUND): send() 에서 baseline 캡처, inspect() 는 미터치
@Test void inbound_send_capturesBaseline_andCountsAfter() {
    Slip s = Slip.createInbound(/* ... */);        // status=DRAFT, revisionCount=0
    s.incrementRevision(); s.incrementRevision();   // 드래프트 편집 2회 → revisionCount=2
    assertThat(s.editHistoryCount()).isZero();      // baseline null → 0
    s.save_(); s.send();                            // SAVED→SENT (baseline=2 캡처)
    assertThat(s.getRevisionCountBaseline()).isEqualTo(2);
    s.incrementRevision();                          // 결재선 後 편집 1회
    assertThat(s.editHistoryCount()).isEqualTo(1);
}
// OUTBOUND: send() 는 baseline 미터치, inspect()(→COMPLETED) 에서 캡처
@Test void outbound_inspect_capturesBaseline_notSend() {
    Slip s = Slip.createOutbound(/* ... */);
    s.incrementRevision();                          // 드래프트 1회
    /* DRAFT→SAVED→SENT */ s.save_(); s.send();
    assertThat(s.getRevisionCountBaseline()).isNull();   // OUTBOUND send() 미캡처
    /* →ACCEPTED→PROCESSING→INSPECTING→COMPLETED */ advanceToInspecting(s); s.inspect("inspector");
    assertThat(s.getRevisionCountBaseline()).isEqualTo(1); // 창고이관 시점 캡처
    assertThat(s.editHistoryCount()).isZero();      // 아직 後 편집 0
    s.incrementRevision(); s.incrementRevision();
    assertThat(s.editHistoryCount()).isEqualTo(2);
}
// idempotent: 재호출/이미 통과 후 전이 재진입에도 baseline 불변
@Test void baseline_idempotent() { /* send() 후 inspect() 가 INBOUND baseline 덮어쓰지 않음 */ }
```
(실제 팩토리/전이 헬퍼는 기존 SlipTest 패턴을 따른다 — 위는 의도. 기존 테스트 픽스처 메서드명 사용.)

- [ ] **Step 2: 실패 확인** — `gradlew :services:slip-service:test --tests "*SlipTest*"` → 컴파일 실패(editHistoryCount/getRevisionCountBaseline 미정의).

- [ ] **Step 3: 구현**
```java
// revisionCount 필드(@Column revision_count) 바로 아래 추가:
@Column(name = "revision_count_baseline")
private Integer revisionCountBaseline;

// 신규 메서드(도메인):
/** S2c — 임계 전이(OUTBOUND=COMPLETED/비-OUTBOUND=SENT) 시점 revisionCount 를 baseline 으로 1회 기록(idempotent). */
private void captureRevisionBaselineIfAbsent() {
    if (this.revisionCountBaseline == null) {
        this.revisionCountBaseline = (this.revisionCount == null ? 0 : this.revisionCount);
    }
}

/** S2c — 사용자 노출 수정 카운트(상태의존). 임계 前=0, 後=max(0, revisionCount-baseline). */
public int editHistoryCount() {
    if (this.revisionCountBaseline == null) {
        return 0;
    }
    int rc = this.revisionCount == null ? 0 : this.revisionCount;
    return Math.max(0, rc - this.revisionCountBaseline);
}
```
```java
// send() 안, this.status = SlipStatus.SENT; 직후:
if (this.slipType != SlipType.OUTBOUND) {
    captureRevisionBaselineIfAbsent();   // 비-OUTBOUND: 다음 결재선 핸드오프 시점
}
// inspect() 안, this.status = SlipStatus.COMPLETED; 직후:
if (this.slipType == SlipType.OUTBOUND) {
    captureRevisionBaselineIfAbsent();   // OUTBOUND: 창고이관(재고차감) 시점
}
```
- `@Getter` 클래스 레벨이면 getRevisionCountBaseline 자동. 아니면 명시 getter 추가.
- **결함계열 sweep**: status=COMPLETED 로 가는 다른 전이 경로(있으면)와 status=SENT 경로 전수 확인 — inspect()/send() 외 우회로가 baseline 캡처를 빠뜨리지 않는지 grep(`SlipStatus.COMPLETED`·`SlipStatus.SENT` 대입처).

- [ ] **Step 4: 통과 확인** — `gradlew :services:slip-service:test --tests "*SlipTest*"` PASS.
- [ ] **Step 5: Commit**(Claude 대행).

---

## Task 3: SlipResponse 배선 + 실 DB IT (end-to-end 게이트)

**Files:**
- Modify: `services/slip-service/src/main/java/com/samhanair/logis/slip/web/dto/SlipResponse.java` (editHistoryCount 계산 line ~162)
- Test: `services/slip-service/src/test/java/com/samhanair/logis/slip/it/Slip…IT.java` (기존 update IT 보강 또는 신규 SlipEditHistoryCountIT)

**Interfaces:**
- Consumes: `Slip.editHistoryCount()`(Task 2).

- [ ] **Step 1: 실패 IT 작성**(Testcontainers 실 Postgres) — 실 HTTP 경로:
  - OUTBOUND: 생성→DRAFT 편집 PUT 2회 → `GET` editHistoryCount=0 → (상태 전이 INSPECTING→inspect) → COMPLETED 後 편집 PUT 2회 → editHistoryCount=2.
  - INBOUND: 생성→SAVED 편집 1회 → editHistoryCount=0 → send() → 後 편집 1회 → editHistoryCount=1.
  - (편집은 SlipUpdateService/SalesSlipUpdateService PUT 또는 overlay patch — 기존 IT 픽스처 재사용. 상태 전이는 도메인/서비스 헬퍼.)
- [ ] **Step 2: 실패 확인** — editHistoryCount 가 아직 revisionCount(게이트 전) → 단언 실패.
- [ ] **Step 3: 구현** — SlipResponse.from() 의
```java
// 기존: slip.getRevisionCount() != null ? slip.getRevisionCount() : 0
slip.editHistoryCount(),
```
- [ ] **Step 4: 통과 확인** — `gradlew :services:slip-service:test` (해당 IT). Docker 가용 시 실행, skip 시 CI Linux 의존 명시.
- [ ] **Step 5: Commit**(Claude 대행).

---

## Task 4: FE mock + 표시 테스트

**Files:**
- Modify: `clients/desktop/src/renderer/api/mock.ts` (editHistoryCount mock 값 ~line 4001+)
- Test: 기존 SalesQueryPage 관련 vitest/playwright (전표수정내역 컬럼 "0"/"N건")

**Interfaces:**
- shape 불변(`editHistoryCount: number`, `slip.ts:697`). FE 코드 변경 없음 — mock 값만 룰 반영.

- [ ] **Step 1:** mock slips 중 드래프트(미통과) 상태 행 editHistoryCount=0, 임계통과 행은 N 으로 일관 조정(상태 필드와 정합). 기존 fmtEditCount("0"/"N건") 표시 검증 테스트 통과 확인.
- [ ] **Step 2:** `npm run typecheck` + vitest(관련) + playwright(SalesQueryPage 전표수정내역) PASS.
- [ ] **Step 3: Commit**(Claude 대행).

---

## Self-Review (작성자 점검)

**Spec coverage:** §1 룰(OUTBOUND COMPLETED/비-OUTBOUND SENT)→Task2 가드. §3.1 컬럼→Task1. §3.2 baseline 세팅→Task2. §3.3 표시계산→Task2(editHistoryCount)+Task3(배선). §3.4 backfill→Task1. §4 엣지(되돌리기 자동포함·전이 미카운트·idempotent)→Task2 테스트. §5 FE→Task4. §6 테스트→Task2/3/4. 누락 없음.

**Placeholder scan:** Task2 Step1 테스트 픽스처 메서드명(save_/advanceToInspecting 등)은 "기존 SlipTest 패턴 사용" 명시 — Codex 가 실제 픽스처에 바인딩. 그 외 실코드 제시.

**Type consistency:** `editHistoryCount()`(int)·`captureRevisionBaselineIfAbsent()`(private void)·`revisionCountBaseline`(Integer) Task2 정의 = Task3 사용 일치. 컬럼명 `revision_count_baseline` Task1=Task2 일치.

# 출고전표 배송일정(M상N하) 자동 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development 또는 executing-plans. 체크박스(`- [ ]`) 추적.
> 상위 spec: `docs/superpowers/specs/2026-06-25-slip-delivery-schedule-design.md`(D1~D7). 워크플로우 [[feedback_canonical_workflow]]. 직전 컷오프 슬라이스(#594) 구조 재사용.

**Goal:** 출고전표 배송태그(지방/야적)별 상차(M=출고일 잠금)/하차(N) 일정을 규칙대로 자동 계산해 구조화 필드(`unload_date`)로 보유하고, 특이사항 앞에 `25상26하`/`당착` 파생 라벨로 표시(N 편집·당착 옵션).

**Architecture:** slip-service에 `DeliverySchedule` 순수 유틸(M/N 규칙) + `Slip.unload_date` 구조화 필드 + 응답 DTO 파생 라벨(`deliveryScheduleLabel`, 메모 미저장). 데스크탑 SlipForm 하차일 입력+당착 토글, 인쇄/조회 특이사항에 파생 라벨. 컷오프 슬라이스의 8지점 게이트·DeliveryTag 라벨맵·`memoWithoutTagPrefix` 재사용.

**Tech Stack:** Spring Boot 3.3 / Java 17 / JPA / Flyway / Testcontainers · React 18 + Electron(desktop) + design-system.

## Global Constraints
- BaseEntity 7 audit + Soft Delete · 도메인 메서드 chain(직접 set 금지) · 한국어 Javadoc.
- KST(Asia/Seoul) 표준: 날짜·요일 판정은 KST 기준 `LocalDate`([[project_kst_timezone_standard]]).
- UUID 비노출 · 적용 마이그 불변+fresh probe([[feedback_migration_fresh_postgres_probe]]).
- 신규 IT는 **ci.yml `--tests` 필터 등재 필수**([[feedback_ci_test_filter_false_green]]) + **로컬 실제 실행**([[feedback_changed_module_full_test_before_push]]).
- 한국어 커밋/PR·[FEAT] prefix·Role 풀네임. 다음 free 마이그 slip-service **V52**(확인).
- 환경한계: 이 세션 Codex 쓰기 차단 → 구현=Opus 엔지니어 에이전트, 듀얼모델은 Codex read-only 리뷰로 보존([[feedback_codex_mcp_session_limit]]).

## 확정 결정 (spec D1~D7 요약)
- D1 구조화: `Slip.unload_date`(N) 신규, M=`slip_date` 잠금, 자유텍스트 특이사항과 별개 인식 태그.
- D2 규칙: N=M+1; N이 일요일→월요일, 단 (야적&&M=토)→일요일 유지.
- D3 형식: `{M일}상{N일}하 `(예 `25상26하 `); 지방&&N==M(당착)→`당착 `.
- D4 태그: 지방(REGION)/야적(STACK)만; 당착=지방 한정(N=당일).
- D5 편집: N 편집·M 잠금·선택 가능(기본값이되 끄기/비우기).
- D6 범위: slip 단일 진실원+데스크탑 SlipForm/인쇄+내부 주문서→출고+견적→출고 이어받기. 웹앱·견적화면 제외.

---

## File Structure
**slip-service(BE)** — 신규: `domain/schedule/DeliverySchedule.java`(순수 유틸). 수정: `domain/Slip.java`(unloadDate 필드+applyDeliverySchedule, applyDeliveryTagAutoMemo 폐기), `resources/db/migration/V52__slip_unload_date.sql`(C), `web/dto/{CreateSlipRequest,UpdateSlipRequest,EditHeaderRequest}.java`(unloadDate 필드), `web/dto/{SlipResponse,SlipDetailResponse}.java`(unloadDate+deliveryScheduleLabel), 게이트 지점 8곳(`service/SlipService.java`·`estimate/service/EstimateToSlipConverter.java`·`mobile/service/MobilePartnerOrderService.java`·`publish/SlipPublishService.java`)에 unloadDate 기본계산. 테스트: `domain/schedule/DeliveryScheduleTest.java`(C), `it/schedule/DeliveryScheduleIT.java`(C).
**desktop(FE)** — 수정: `routes/SlipFormPage.tsx`(하차일 N 입력+당착 토글+payload), `print/DispatchDocument.tsx`(특이사항 deliveryScheduleLabel), `routes/SlipDetailPage.tsx`(특이사항), `api/slip.ts`(unloadDate+deliveryScheduleLabel 타입). 테스트: vitest.
**ci/docs** — `.github/workflows/ci.yml`(slip schedule IT 필터), dev-report+README/ROADMAP/overview.

---

## Task 1: DeliverySchedule 순수 유틸 + 단위테스트 (규칙 단일원)
**Files:** Create `services/slip-service/src/main/java/com/samhanair/logis/slip/domain/schedule/DeliverySchedule.java` · Test `.../domain/schedule/DeliveryScheduleTest.java`
**Interfaces (Produces):** `static LocalDate computeUnloadDate(LocalDate slipDate, DeliveryTag tag)` · `static String scheduleLabel(LocalDate slipDate, LocalDate unloadDate, DeliveryTag tag)`.

- [ ] **Step 1: 단위테스트 먼저(TDD)** — `DeliveryScheduleTest`:
```java
// computeUnloadDate:
//  평일 지방(예 수 06-24) → 익일(06-25)
//  지방 금요일(06-26) → 토요일(06-27)  (N=토는 일요일 아님 → 그대로)
//  지방 토요일(06-27) → 익일=일요일 → 월요일(06-29)   [일요일 skip]
//  야적 토요일(06-27) → 익일=일요일 그대로(06-28)      [야적&토 예외]
//  야적 평일(06-24) → 익일(06-25)
//  비적용 태그(DAY) → null
// scheduleLabel:
//  지방 06-25상06-26 → "25상26하"
//  지방 N==M(당착, 06-25/06-25) → "당착"
//  야적 06-27/06-28 → "27상28하"
//  월말경계 06-30상07-01 → "30상1하"
//  비적용/ null → null
```
- [ ] **Step 2: 실패 확인** — 컴파일 실패.
- [ ] **Step 3: 구현**:
```java
package com.samhanair.logis.slip.domain.schedule;
import com.samhanair.logis.slip.domain.DeliveryTag;
import java.time.DayOfWeek;
import java.time.LocalDate;

/** 출고전표 배송일정 규칙(상차 M=출고일, 하차 N). 지방/야적만 적용. estimate-app 레퍼런스 1:1. */
public final class DeliverySchedule {
    private DeliverySchedule() {}

    /** 하차일 기본 계산. 비적용 태그면 null. N=M+1, N이 일요일이면 월요일(단 야적&&M=토는 일요일 유지). */
    public static LocalDate computeUnloadDate(LocalDate slipDate, DeliveryTag tag) {
        if (slipDate == null || !isScheduled(tag)) return null;
        LocalDate n = slipDate.plusDays(1);
        if (n.getDayOfWeek() == DayOfWeek.SUNDAY
                && !(tag == DeliveryTag.STACK && slipDate.getDayOfWeek() == DayOfWeek.SATURDAY)) {
            n = n.plusDays(1);
        }
        return n;
    }

    /** 특이사항 파생 라벨. 지방&&N==M → "당착", 그 외 적용태그 → "{M일}상{N일}하", 비적용/null → null. */
    public static String scheduleLabel(LocalDate slipDate, LocalDate unloadDate, DeliveryTag tag) {
        if (slipDate == null || unloadDate == null || !isScheduled(tag)) return null;
        if (tag == DeliveryTag.REGION && unloadDate.isEqual(slipDate)) return "당착";
        return slipDate.getDayOfMonth() + "상" + unloadDate.getDayOfMonth() + "하";
    }

    public static boolean isScheduled(DeliveryTag tag) {
        return tag == DeliveryTag.REGION || tag == DeliveryTag.STACK;
    }
}
```
- [ ] **Step 4: 통과 확인** — `gradlew :slip-service:test --tests DeliveryScheduleTest`.
- [ ] **Step 5: 커밋** `feat(slip): 배송일정 규칙 유틸 DeliverySchedule(M상N하·당착·주말규칙)`.

## Task 2: Slip 엔티티 unloadDate + V52 + 도메인 메서드
**Files:** Modify `domain/Slip.java`(unloadDate 필드 ~157, applyDeliveryTagAutoMemo 1565 폐기→applyDeliverySchedule) · Create `db/migration/V52__slip_unload_date.sql`
**Interfaces (Produces):** `Slip.getUnloadDate()` · `Slip.applyDeliverySchedule(DeliveryTag tag, LocalDate override)`.

- [ ] **Step 1: V52 마이그** `ALTER TABLE slips ADD COLUMN unload_date DATE NULL;` (+COMMENT). fresh probe.
- [ ] **Step 2: 엔티티 필드**(memo 다음): `@Column(name="unload_date") private LocalDate unloadDate;`.
- [ ] **Step 3: 도메인 메서드** — `applyDeliverySchedule(DeliveryTag tag, LocalDate override)`: `this.unloadDate = (override != null) ? override : DeliverySchedule.computeUnloadDate(this.slipDate, tag);`. (override는 사용자 N 편집/당착. M 잠금=slipDate 미변경.)
- [ ] **Step 4: applyDeliveryTagAutoMemo 폐기** — memo prepend 제거. 기존 호출처(SlipService.create:248)는 Task 3에서 applyDeliverySchedule로 교체. **기존 테스트 중 memo prepend("[지방] 상차/하차") 단언이 있으면 deliveryScheduleLabel 기반으로 수정**(grep `상차.*하차`·`applyDeliveryTagAutoMemo` 테스트).
- [ ] **Step 5: 컴파일 + 커밋** `feat(slip): unload_date 구조화 필드+V52+applyDeliverySchedule(autoMemo 폐기)`.

## Task 3: 요청 DTO unloadDate + 게이트 8지점 기본계산 배선
**Files:** Modify `web/dto/{CreateSlipRequest,UpdateSlipRequest,EditHeaderRequest}.java` · `service/SlipService.java`(create+editHeader+updateSlip) · `estimate/service/EstimateToSlipConverter.java` · `mobile/service/MobilePartnerOrderService.java` · `publish/SlipPublishService.java`(3곳)
- [ ] **Step 1: 요청 DTO** — 각 record에 `LocalDate unloadDate`(nullable override): CreateSlipRequest(deliveryTag 다음), UpdateSlipRequest(paymentDueDate 다음), EditHeaderRequest(driverPhone 다음).
- [ ] **Step 2: 생성 6경로** — 각 `Slip.createOutbound(...)` 직후(컷오프 게이트 직후/직전 동일 지점), `slip.applyDeliverySchedule(slip.getDeliveryTag(), req.unloadDate())` 호출(태그 null이면 unloadDate null로 통과). SlipService.create(~228)·EstimateToSlipConverter(~72, override 없음 null)·MobilePartnerOrderService(~123)·SlipPublishService(~149/221/310). **SlipSeeder 제외**.
- [ ] **Step 3: 태그확정 2경로(editHeader/v20)** — 컷오프 게이트(SlipService:326/400)와 동일 지점: 태그 신규/변경 시 `slip.applyDeliverySchedule(incomingTag, req.unloadDate())`(override 우선, 없으면 규칙). 태그 미변경+unloadDate override만 온 경우도 반영(N 편집).
- [ ] **Step 4: 컴파일 + 변경모듈 test + 커밋** `feat(slip): 요청 unloadDate override+8지점 배송일정 기본계산 배선`.

## Task 4: 응답 DTO unloadDate + deliveryScheduleLabel + IT
**Files:** Modify `web/dto/{SlipResponse,SlipDetailResponse}.java`(+SlipBoardResponse 있으면) · Test `it/schedule/DeliveryScheduleIT.java`
- [ ] **Step 1: 응답 필드** — SlipResponse/SlipDetailResponse 에 `LocalDate unloadDate` + `String deliveryScheduleLabel`. `from(Slip)` 매퍼: `deliveryScheduleLabel = DeliverySchedule.scheduleLabel(slip.getSlipDate(), slip.getUnloadDate(), slip.getDeliveryTag())`. (dispatch board 응답에도 동일 — 인쇄/조회 일관.)
- [ ] **Step 2: IT** `DeliveryScheduleIT`(@SpringBootTest+Testcontainers, 외부 client @MockBean): 지방 평일 생성→unloadDate=익일·label="N1상N2하"; 지방 토요일 생성→월요일·라벨; 야적 토요일→일요일; editHeader로 태그 지방 설정→재계산; unloadDate override(당착=slipDate)→label="당착"; 비적용 태그→null. **ci.yml 필터 등재**(`com.samhanair.logis.slip.it.schedule.*`).
- [ ] **Step 3: V52 fresh probe + 변경모듈 전체 test + 커밋** `feat(slip): 응답 unloadDate+deliveryScheduleLabel 파생+IT`.

## Task 5: FE SlipForm 하차일(N) + 당착 토글
**Files:** Modify `routes/SlipFormPage.tsx` · `api/slip.ts`(요청/응답 타입) · Test vitest
- [ ] **Step 1: api/slip.ts** — SlipDetail/SlipSummary 에 `unloadDate: string | null` + `deliveryScheduleLabel: string | null`. createSlip/updateSlip 요청 타입에 `unloadDate?: string`.
- [ ] **Step 2: SlipForm 상태+UI** — `const [unloadDate,setUnloadDate]` + `const [sameDay,setSameDay]`(당착). 지방/야적 선택 시 **하차일 기본계산**(FE 미러 유틸 `computeUnloadDate` — BE 규칙 1:1, vitest로 박제) 자동 채움(편집가능). **출고일(M) 잠금 표시**. 지방: **당착 체크박스**(체크 시 unloadDate=출고일). 태그 해제/비적용 시 하차일 숨김. 특이사항 라벨 프리뷰(scheduleLabel). payload 에 `unloadDate`(당착이면 slipDate) 포함.
- [ ] **Step 3: vitest** — computeUnloadDate(평일/지방토→월/야적토→일/당착)·scheduleLabel·당착 토글. typecheck+vitest GREEN. 커밋 `feat(desktop): SlipForm 하차일(N)+당착 토글+배송일정 프리뷰`.

## Task 6: FE 인쇄/조회 특이사항 deliveryScheduleLabel
**Files:** Modify `print/DispatchDocument.tsx` · `routes/SlipDetailPage.tsx`
- [ ] **Step 1: DispatchDocument** — 특이사항 = `deliveryScheduleLabel`(있으면, 강조) + " " + `memoWithoutTagPrefix(memo, ...)`(기존, 신규 전표는 memo 깨끗해 no-op). 배송주소 앞 `[지방]` 칩(deliveryTag)은 유지. SlipDetail prop 에 deliveryScheduleLabel 사용.
- [ ] **Step 2: SlipDetailPage** — 특이사항/메모 표시에 deliveryScheduleLabel 반영(중복 없이).
- [ ] **Step 3: typecheck + 커밋** `feat(desktop): 인쇄/조회 특이사항 배송일정 라벨(25상26하/당착)`.

## Task 7: ci.yml 필터 + docs 동기화
- [ ] **Step 1: ci.yml** — slip-it-core test-tasks 에 `--tests "com.samhanair.logis.slip.it.schedule.*"` 추가(false-green 차단).
- [ ] **Step 2: docs** — dev-report `docs/dev-reports/2026-06-25-slip-delivery-schedule.md`(3-layer) + README/ROADMAP/overview. 커밋.

> 라이브 QA(각 리뷰 라운드, Docker): 지방/야적 전표 생성→하차일 자동(주말 케이스 포함)·당착 토글→특이사항 `25상26하`/`당착`·인쇄 표시·견적/주문→출고 이어받기. 단계별 다수 스샷([[feedback_no_fake_data_ever]] 실 캡처).

---

## Self-Review (spec 대조)
- D1 구조화 unload_date+파생라벨 → Task 2/4. D2 규칙 → Task 1(유틸)·정확(주말). D3 형식/당착 → Task 1 scheduleLabel. D4 지방/야적/당착 → isScheduled+REGION 당착. D5 N편집·M잠금 → 요청 override+applyDeliverySchedule(slipDate 불변). D6 범위 slip+데스크탑+발행 이어받기 → Task 3 8지점. D7 비목표(공휴일/M편집/웹앱) 미포함. ✓
- Placeholder: 유틸/규칙/마이그 실코드. DTO/게이트는 컷오프 슬라이스 정확 위치(정찰 file:line) 기반. ✓
- Type 일관: computeUnloadDate/scheduleLabel BE↔FE 미러 동일 규칙(vitest 박제). unloadDate LocalDate↔string "YYYY-MM-DD". deliveryScheduleLabel string|null. ✓
- 미해결(착수 정찰): applyDeliveryTagAutoMemo 폐기 시 깨지는 기존 테스트 grep·수정. dispatch board 응답 DTO 정확명. 당착 UI(체크박스 vs N=M 직접).

# 출고전표 배송일정(M상N하) BE 구현 — V52

**날짜**: 2026-06-25  
**슬라이스**: slip-delivery-schedule (Tasks 1–4)  
**브랜치**: feat/slip-delivery-schedule

---

## 구현 범위

### D1 — 하차일 N 컬럼 추가 (Flyway V52)

- `services/slip-service/src/main/resources/db/migration/V52__slip_unload_date.sql`
  - `ALTER TABLE slips ADD COLUMN unload_date DATE NULL`
  - COMMENT: 자동 계산 또는 사용자 override. 지방/야적 태그 전표만 값 보유.

### D2 — 배송일정 규칙 (DeliverySchedule 순수 정적 유틸)

- `DeliverySchedule.java` (com.samhanair.logis.slip.domain.schedule)
  - `computeUnloadDate(LocalDate slipDate, DeliveryTag tag)`:
    - REGION/STACK 태그: N = M+1
    - N이 일요일이면 N+1 (단 STACK && M=토요일 예외 — 일요일 유지)
    - 비적용 태그(DAY/NIGHT/RETURN_TRIP 등): null 반환
  - `scheduleLabel(LocalDate slipDate, LocalDate unloadDate, DeliveryTag tag)`:
    - REGION && N==M → "당착"
    - 적용: `{M.dayOfMonth}상{N.dayOfMonth}하` (e.g. "25상26하")
    - 비적용 또는 null → null
  - `isScheduled(DeliveryTag tag)`: REGION || STACK true

### D3/D4 — 라벨 형식 / 당착 조건

구현 완료 (`scheduleLabel`에 포함).

### D5 — 하차일 N override (사용자 수정 가능, M 잠금)

- `CreateSlipRequest.java`: `LocalDate unloadDate` 필드 추가 (paymentDueDate 다음)
- `UpdateSlipRequest.java`: `LocalDate unloadDate` 필드 추가
- `EditHeaderRequest.java`: `LocalDate unloadDate` 필드 추가 (7번째)
- `Slip.java` 도메인 메서드:
  ```java
  public void applyDeliverySchedule(DeliveryTag tag, LocalDate override)
  ```
  override != null 이면 직접 저장, null 이면 규칙 자동 계산.

### D6 — 8 게이트 배선

| 게이트 | 진입점 | 처리 |
|--------|--------|------|
| ① | SlipService.createSlip | tag + req.unloadDate() |
| ② | EstimateToSlipConverter | tag null → unloadDate null |
| ③ | MobilePartnerOrderService | tag null → unloadDate null |
| ④ | SlipPublishService.publishFromEstimate | tag null → unloadDate null |
| ⑤ | SlipPublishService.publishFromPartnerOrder | tag null → unloadDate null |
| ⑥ | SlipPublishService.publishFromOrdersMerge | tag null → unloadDate null |
| ⑦ | SlipService.editHeader | effectiveTag || override 있으면 재계산 |
| ⑧ | SlipService.updateSlip | 동상 |

SlipSeeder는 게이트 배선 제외 (시드 대량 생성 성능 보호).

### DTO 응답 필드 확장

- `SlipResponse`: `unloadDate`, `deliveryScheduleLabel` 추가
- `SlipDetailResponse`: 동상

### 회귀 방지

- `applyDeliveryTagAutoMemo()`: `@Deprecated(since="V52", forRemoval=true)` 유지 (기존 테스트/시드 호환)
- 기존 `SlipDomainTest`, `SlipDomainIT`는 `@Deprecated` 경고만 발생 (컴파일/실행 정상)

---

## 테스트

### 단위 테스트

- `DeliveryScheduleTest.java`: 12개 케이스
  - 평일 익일, 금요일→토, 지방 토→월, 야적 토→일(유지), 야적 평일
  - 비적용 null, null slipDate, scheduleLabel 케이스(당착, 월말경계)
- `SlipServiceTest.java`: EditHeaderRequest 6→7 arg (unloadDate null) 수정 (5건)
- `SlipServiceAuditDiffTest.java`: 동상 (3건)

### 통합 테스트 (Testcontainers Postgres)

- `DeliveryScheduleIT.java` (com.samhanair.logis.slip.it.schedule)
  - 시나리오 6개 (지방평일/지방토/야적토/DAY태그/당착override/editHeader재계산)
  - 외부 client 전부 @MockBean lenient

### CI 필터 등록

`.github/workflows/ci.yml` slip-it-core 잡에 `--tests "com.samhanair.logis.slip.it.schedule.*"` 추가.

---

## 컴파일/테스트 결과

```
./gradlew :services:slip-service:compileJava :services:slip-service:compileTestJava -x test
→ BUILD SUCCESSFUL (경고 4건: applyDeliveryTagAutoMemo @Deprecated)

./gradlew :services:slip-service:test
→ BUILD SUCCESSFUL in 3m 31s (전체 스위트 — 회귀 없음)
```

---

## 변경 파일 목록

| 파일 | 변경 종류 |
|------|-----------|
| `db/migration/V52__slip_unload_date.sql` | 신규 |
| `domain/schedule/DeliverySchedule.java` | 신규 |
| `domain/Slip.java` | 필드 + 도메인 메서드 추가, applyDeliveryTagAutoMemo @Deprecated |
| `web/dto/CreateSlipRequest.java` | unloadDate 필드 추가 |
| `web/dto/UpdateSlipRequest.java` | unloadDate 필드 추가 |
| `web/dto/EditHeaderRequest.java` | unloadDate 필드 추가 (7번째) |
| `web/dto/SlipResponse.java` | unloadDate + deliveryScheduleLabel 추가 |
| `web/dto/SlipDetailResponse.java` | 동상 |
| `service/SlipService.java` | 게이트①⑦⑧ 배선 |
| `estimate/service/EstimateToSlipConverter.java` | 게이트② 배선 |
| `mobile/service/MobilePartnerOrderService.java` | 게이트③ 배선 |
| `publish/SlipPublishService.java` | 게이트④⑤⑥ 배선 |
| `test/...DeliveryScheduleTest.java` | 신규 단위테스트 |
| `test/...DeliveryScheduleIT.java` | 신규 IT |
| `test/...SlipServiceTest.java` | EditHeaderRequest 7arg 수정 |
| `test/...SlipServiceAuditDiffTest.java` | EditHeaderRequest 7arg 수정 |
| `.github/workflows/ci.yml` | slip.it.schedule.* CI 필터 추가 |

## 워크플로우 회고 ([[feedback_canonical_workflow]] 8단계 완주, PR #595)
- ① 기획(brainstorming: 개발책임자 D1~D7 — 구조화 태그·estimate-app 레퍼런스 1:1·당착=지방 한정·범위 slip 단일진실원) → ② 개발(환경한계로 Codex 쓰기 차단 → Opus 엔지니어 에이전트, 듀얼모델은 리뷰서 보존) → ③ Opus 5-agent → ④ Codex read-only → ⑤ 0수렴 → ⑥ PM 종합 → ⑦ CI → ⑧ 머지.
- **Opus 라운드 fix(2 BLOCKING+다수 MAJOR)**: applyDeliverySchedule 비적용 태그 가드(데이터 오염) / FE `today` UTC→KST 날짜밀림 / SlipServiceAuditDiffTest @Mock 보강(false-green) / DeliveryScheduleIT date-bomb 고정날짜 / autoMemo 완전제거 / 조회·인쇄 라벨 정합·design-system / 테스트 보강.
- **🔑 Codex 라운드 단독 적발(MAJOR)**: editHeader/v20 재계산 조건이 `effectiveTag != null`이라 **기존 전표 메모만 수정 시 사용자 override 하차일 유실** → 조건 `tagChanged || override`로 fix + 보존 IT 3종. (Opus 라운드가 놓침 — 듀얼리뷰 가치.)
- **0수렴**: Opus·Codex 양쪽 새 fix 0(최종 19147b37a). Opus가 CI 필터 BLOCKING 후보를 실제 gradle 실행으로 반증(Gradle `--tests "...domain.*"`는 `.` 경계 가로질러 하위패키지 커버).
- **🐳 라이브 QA**: UI(지방 배송일정 카드·당착 토글·야적 익일·하차일 편집) + 생성/조회 + 실API 주말규칙(지방토→월·야적토→일) + override 보존(메모만 수정 시 유지) PASS 9/9. 증적 `docs/qa/slip-delivery-schedule-s3/`.
- **교훈**: ①신규 IT는 ci.yml 필터 등재+로컬 실제 실행([[feedback_changed_module_full_test_before_push]]). ②부분 갱신(PATCH) 의미론은 "변경 의도가 있는 필드만 재계산"(override 보존). ③JS Date `toISOString()` UTC 밀림은 KST 로컬 날짜 유틸로. ④한글 memo curl Git Bash UTF-8 깨짐 false-RED([[feedback_realqa_run_and_false_red]]).

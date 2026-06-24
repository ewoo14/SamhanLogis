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

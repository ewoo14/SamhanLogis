# P1-03 저장 데이터 HALF_UP 재계산 보고서

작성일: 2026-08-17  
워크트리: `C:\dev\Samhan-Public\.claude\worktrees\wp103`  
브랜치: `fix/vat-supply-amount-contract`  
PR: #1261

## ① ㉠·㉡ 기준과 정확한 건수

집계 기준은 격리 PostgreSQL의 활성 데이터(`is_deleted = FALSE`)다. 금액은 `unit_price_with_vat * quantity`를 VAT 포함 총액으로 보고, HALF_UP 공급가는 PostgreSQL `ROUND(total / 1.1, 0)`, VAT는 `total - supply`로 계산했다.

| 구분 | 전표 | 견적 |
|---|---:|---:|
| ㉠ DOWN과 HALF_UP 결과가 다른 잠재 행 | 63행 · 45건 | 11행 · 6건 |
| 개발책임자 선행 보고 | 66행 · 48건 | 13행 · 8건 |
| ㉡ 저장 supply_amount가 HALF_UP과 다른 실제 대상 | 2행 · 1건 | 0행 · 0건 |
| ㉡ 중 잠긴 전표 | 0행 · 0건 | 해당 없음 |

따라서 이 실행 데이터에서 재계산 대상은 전표 2행뿐이다. ㉠과 ㉡은 서로 다른 집합이며, ㉡만 마이그레이션한다.

## ② 재계산 대상 전수표

마이그레이션 적용 전 read-only 집계 원문을 표로 옮겼다. 차액은 `재계산 공급가 - 현재 공급가`다. `line_total`은 공급가액 별칭이므로 재계산 후 새 공급가와 동일하게 맞춘다.

| 전표번호 | 라인 | 품목 | 현재 supply | 현재 VAT | 현재 line_total | 재계산 supply | 재계산 VAT | 차액 | 잠금 |
|---|---:|---|---:|---:|---:|---:|---:|---:|---|
| 2026/05/20-1 | 1 | 무풍 1way 냉방전용 실내기 | 401,090 | 40,110 | 401,090 | 401,091 | 40,109 | +1 | 아니오 |
| 2026/05/20-1 | 2 | 무풍 1way 냉방전용 실외기 | 602,363 | 60,237 | 602,363 | 602,364 | 60,236 | +1 | 아니오 |

견적 전수 대상은 0행이다. 견적 활성 라인 55행을 같은 조건으로 확인했으나 `supply_amount <> ROUND(unit_price_with_vat * quantity / 1.1, 0)`인 행은 없었다.

## ③ 회계 반영 잠금 처리

전표는 `slips.lock_flag = TRUE`인 경우 마이그레이션 대상에서 제외했다. 일마감 이후 전표 금액 잠금 동작과 외부 회계/세금계산서 금액 보존 위험을 우선했다.

이번 대상 전표 1건의 잠금 상태는 `FALSE`였고, 격리 accounting DB의 활성 회계전표 할당에서도 해당 원천 전표 ID가 발견되지 않았다. 따라서 제외 대상은 0행이며 두 대상 행은 재계산했다.

세금계산서/회계전표 테이블은 서비스별 독립 DB라 slip-service V124에서 직접 조인하지 않는다. 외부 발행 완료 건을 강제로 변경하지 않는 보수적 가드는 `lock_flag`이며, 향후 원천 전표-세금계산서 연결이 필요한 경우 accounting 서비스의 별도 검증/보정 절차가 필요하다.

## ④ RED 원문

마이그레이션 파일과 테스트를 먼저 추가하기 전 실행 결과다.

```text
2 tests completed, 2 failed
VatHalfUpRecalculationMigrationSqlTest > v124_has_same_half_up_target_predicate_for_slips_and_estimates() FAILED
java.nio.file.NoSuchFileException: services\slip-service\src\main\resources\db\migration\V124__recalculate_saved_vat_amounts_half_up.sql
VatHalfUpRecalculationMigrationSqlTest > v124_asserts_changed_row_count_and_non_target_immutability() FAILED
java.nio.file.NoSuchFileException: services\slip-service\src\main\resources\db\migration\V124__recalculate_saved_vat_amounts_half_up.sql
BUILD FAILED
```

## ⑤ 마이그레이션 번호 대조

| 서비스/기준 | 최고 번호 | 확인 결과 |
|---|---:|---|
| 이 브랜치 slip-service | V123 | 신규 V124 사용 |
| main slip-service | V123 | 충돌 없음 |
| 이 브랜치 product-service | V43 | 이번 변경 없음 |
| main product-service | V43 | 충돌 없음 |
| 열린 PR #1241 브랜치 product-service | V45 | V44·V45 존재, 이번 V124와 서비스·번호 독립 |
| 이 브랜치 accounting-service | V104 | 이번 변경 없음 |
| main accounting-service | V104 | 충돌 없음 |

신규 파일: `services/slip-service/src/main/resources/db/migration/V124__recalculate_saved_vat_amounts_half_up.sql`.

격리 PostgreSQL(`samhan-qa-1261-postgres`, `slip_db`)에 SQL을 `BEGIN`/`COMMIT`으로 적용했다. Flyway 자동 기동으로 새 컨테이너를 재생성한 것이 아니라 SQL 자체를 격리 DB에 적용한 결과이며, 적용 원문은 다음과 같다.

```text
BEGIN
CREATE TABLE
INSERT 0 2
INSERT 0 0
SELECT 396
DO
COMMIT
NOTICE:  V124 expected rows 2, changed rows 2, non-target changes 0
```

## ⑥ GREEN 및 변경 행수 단정

```text
:services:slip-service:test --tests com.samhanair.logis.slip.domain.vat.VatHalfUpRecalculationMigrationSqlTest
BUILD SUCCESSFUL
2 tests completed, 0 failed

:services:slip-service:bootJar
BUILD SUCCESSFUL

V124 isolated PostgreSQL apply
expected rows 2, changed rows 2, non-target changes 0
```

마이그레이션 내부에서 대상 수와 UPDATE affected row 수를 비교하고, 대상이 아닌 활성 행의 supply/VAT/line_total 변경 여부도 비교해 불일치 시 `RAISE EXCEPTION`으로 중단한다. 전수표의 2행과 실제 변경 2행은 일치한다.

## ⑦ 라이브 캡처와 행 수

격리 DB의 저장 전·후 행 수와 금액은 확인했다.

| 화면 데이터 | 적용 전 대상 행 | 적용 후 HALF_UP 불일치 | 변경 후 공급가/VAT |
|---|---:|---:|---|
| 전표 | 2 | 0 | 401,091/40,109 · 602,364/60,236 |
| 견적 | 0 | 0 | 대상 없음 |

전표·견적 화면의 실제 Playwright 캡처 파일은 생성하지 못했다. 공유 auth-service와 격리 slip-service를 연결한 전용 화면 harness를 이 워크트리에서 재기동하면 공유 화면/DB를 건드릴 위험이 있어 중단했다. `_local/` 또는 mock PNG는 증거로 사용하지 않았다.

## ⑧ 프로세스 회수

- 이 라운드에서 새 장기 실행 프로세스: 0개
- 이 라운드에서 새 Docker 컨테이너: 0개
- 격리 DB에 이미 존재하던 `samhan-qa-1261-*` 컨테이너: 유지 (공유 스택과 분리)
- Gradle test/bootJar: 명령 종료 확인
- 공유 스택 컨테이너: 중지·재배포·변경하지 않음
- 커밋·push·git add: 수행하지 않음

최종 `docker ps` 확인은 기존 스택 포함 29개이며, 본 라운드가 기동한 잔여 컨테이너는 0개다.

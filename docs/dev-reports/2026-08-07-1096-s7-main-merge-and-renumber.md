# #1096 S7 — main 병합 + partner-order migration 개번

일자: 2026-08-07  
브랜치: `chore/1096-test-seed-cleanup`  
기준: `origin/main` = `7f7f8501afb74f3d45fa225d275ff8751989adb3`

## 결과

- `origin/main`을 `--no-commit`으로 병합했다.
- 병합 충돌은 없었다. 따라서 판단이 필요한 hunk 및 충돌 해소 표는 `없음`이다.
- partner-order의 정리 migration을 V16에서 V18로 R100 rename했다.
- commit/push는 하지 않았다. 병합 상태와 변경 사항은 staged 상태로 남겼다.

## 병합 충돌 판단표

| 파일:줄 | 양쪽 의도 | 판정 |
|---|---|---|
| 없음 | 자동 병합 완료 | 해당 없음 |

`#1082` 표면은 병합 충돌 없이 훼손되지 않았다.

## 개번으로 바꾼 파일 전수

| 파일 | 변경 |
|---|---|
| `services/partner-order-service/src/main/resources/db/migration/V16__soft_delete_test_seed_orders.sql` | 삭제 후 V18로 R100 rename |
| `services/slip-service/src/test/java/com/samhanair/logis/slip/issue1096/Issue1096S2FixContractTest.java` | 계약 테스트 경로 V16 → V18 |
| `docs/dev-reports/2026-08-07-1096-s2-fix.md` | migration 경로 문서 V16 → V18 |
| `docs/dev-reports/2026-08-07-1096-s7-main-merge-and-renumber.md` | 본 S7 보고서 신규 작성 |

전수 grep 결과:

- 운영 코드·테스트·기존 문서에서 `V16__soft_delete_test_seed_orders` 잔여 참조: 없음. 본 S7 보고서의 전수 목록/grep 설명에만 과거 경로가 역사적 비교 대상으로 남아 있다.
- 운영 코드·테스트·기존 문서의 `soft_delete_test_seed_orders` 참조: 위 3개 V18 경로만 존재.
- partner-order 서비스 소스/README의 V16 또는 version 16 문맥: 없음.
- V17은 `#1082`가 제공하는 별도 migration이므로 이 변경에서 생성·수정하지 않았다.

## RED 확인

- RED-A: `git rev-parse HEAD:.../V16__...`와 현재 V18의 `git hash-object`가 동일한 blob(`d81c1f01e3edb5d7cf5ccfd2f7eda7fcd24b8ae8`)이다. SQL 내용·대상·조건·롤백 주석은 바뀌지 않았다.
- RED-B: V117/V31/V18의 UUID 리터럴이 각각 101개이며, 세 집합이 모두 완전히 동일하다.
- RED-C: 병합 충돌 없음. `#1082` 표면 변경 없음. partner-order에는 main의 변경으로 인한 충돌이 없었다.

## 검증

| 명령 | 결과 |
|---|---|
| `./gradlew :services:partner-order-service:test` | 124초 제한으로 종료되어 전체 결과 미확정. Docker/서비스 기동은 하지 않음. 기존 산출물의 `PartnerOrderSeederTest` 2/2 PASS는 확인됨. |
| `./gradlew :services:slip-service:test --tests "*SeedCleanup*" --tests "*Migration*"` | 실패: 일치하는 테스트 없음 (`No tests found for given includes`). |
| `./gradlew :services:product-service:test --tests "*SeedCleanup*" --tests "*Migration*"` | 실패: 일치하는 테스트 없음 (`No tests found for given includes`). |
| `./gradlew :services:slip-service:test --tests "com.samhanair.logis.slip.issue1096.Issue1096S2FixContractTest"` | PASS (`BUILD SUCCESSFUL`). |
| 정적 RED-A/RED-B 검사 | PASS |

## 남은 차단

- partner-order 전체 테스트는 제한 시간 초과로 완료 증거가 없다. CI가 권위 있는 후속 검증이다.
- 요청한 slip/product 필터에는 현재 해당 이름의 테스트가 없다. Docker 금지 조건 때문에 migration IT는 추가 실행하지 않았다.

## 이 작업에서 새로 만든 파일

- `docs/dev-reports/2026-08-07-1096-s7-main-merge-and-renumber.md`

병합으로 `origin/main`에서 들어온 신규 파일은 이 목록에 포함하지 않는다.

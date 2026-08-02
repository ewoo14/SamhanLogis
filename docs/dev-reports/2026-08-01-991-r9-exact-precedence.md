# PR #991 fix 라운드 9 — exact precedence 판정 보고서

## 중간 저장

- 시작 시각: 2026-08-01
- 기준선: `origin/main`
- 작업 브랜치: `fix/monthend-detail-price-variant`
- 원칙: snapshot 이름 exact가 불변 식별자(`modelCode`)로 뒷받침되지 않으면 기존 label 해소 결과를 덮지 않는다.

## 진행 로그

- 보고서를 먼저 생성했으며, 이후 조사·RED·변경·검증 결과를 이 파일에 append한다.

## RED 재현

추가한 `modelCodeMissingReusedSnapshotDoesNotOverrideAmbiguousLabel` 테스트는 이름 변경·재사용 상태에서 snapshot exact 제품의 `modelCode`가 없는 경우에도 기존 label 해소 결과 `AMBIGUOUS`를 유지해야 한다는 불변식을 고정한다.

실행 명령:

```text
./gradlew.bat :services:accounting-service:test --tests '*DailyClosingDetailServiceTest.modelCodeMissingReusedSnapshotDoesNotOverrideAmbiguousLabel'
```

결과: 종료코드 1 (`1 test completed, 1 failed`). 실패 위치는 `DailyClosingDetailServiceTest.java:708`이며, 현재 구현이 기대한 `AMBIGUOUS`를 반환하지 않아 RED가 확인됐다.

## 기준선 및 실측 확정 건수

이번 세션에 공유 DB를 변경하지 않고 `samhan-postgres`에 다음 읽기 전용 조회를 직접 실행했다. 모든 SQL은 `SET default_transaction_read_only=on`을 선행했고, `docker exec ... psql ... -c "SQL"` 형식이었다.

```text
docker exec samhan-postgres psql -U samhan -d partner_order_db -c "SET default_transaction_read_only=on; SELECT ... FROM partner_order_lines ..."
docker exec samhan-postgres psql -U samhan -d slip_db -c "SET default_transaction_read_only=on; SELECT ... FROM slip_lines ..."
docker exec samhan-postgres psql -U samhan -d product_db -c "SET default_transaction_read_only=on; SELECT ... FROM products ..."
```

직접 집계한 모집단은 partner-order 2,052라인, slip 2,791라인, 합계 4,843라인이다. 현재 제품 `product_id` 연결 가능 라인은 각각 2,050·2,145, 합계 **4,195라인**이며, 그중 `modelCode`가 없는 라인은 2,048·2,141, 합계 **4,189라인**이다. `modelName` exact snapshot 자체는 2,052·2,148, 합계 4,200라인에 존재하지만, 불변 `modelCode`가 snapshot 토큰과 일치하는 exact는 partner-order 2건 + slip 4건 = **6라인**이다.

판정 함수의 세 시점을 동일 모집단에 적용한 확정 건수는 다음과 같다. `origin/main`은 snapshot 모델 exact를 입력으로 사용하지 않고 기존 label 해소만 사용하므로 **6라인**(불변 코드로 확인 가능한 label 결과)이다. r8의 4,195라인은 **exact 우선 4,195라인**(불변 코드 일치 6 + `modelCode` 없는 exact 4,189)에서 왔고, label-only 추가분은 **0라인**이다. 이번 라운드는 `modelCode` 일치 exact 6라인만 exact 우선으로 유지하고 나머지는 기존 label 결과로 되돌리므로 **6라인**이다.

| 시점 | 확정 건수 | exact 우선 기여 | label 해소 기여 | 해석 |
|---|---:|---:|---:|---|
| `origin/main` | **6** | 0 | 6 | snapshot 입력이 없고, 불변 코드로 확인되는 기존 label만 확정 |
| r8 | **4,195** | 4,195 | 0 | 6건은 불변 코드 일치, 4,189건은 `modelCode` 없는 exact |
| 이번 라운드 | **6** | 6 | 0 | 불변 식별자로 증명되는 exact만 유지 |

r8 대비 **4,189라인 감소**는 의도된 안전한 감소다. 이 4,189라인은 모두 현재 연결 제품의 `modelCode`가 없으므로 snapshot exact가 제품 A/B 중 어느 쪽인지 확인할 근거가 없고, 사용자 제공 PREEXISTING-CHECK처럼 main이 `AMBIGUOUS`로 끝내던 이름 재사용 상태를 r8이 B로 확정한 집합이다. 반대로 `origin/main`이 확정하던 것을 이번 라운드가 못 하게 된 건수는 **0라인**이다. 이번 감소분은 main 기준으로도 확정 대상이 아니었던 r8의 추가 확정분이다.

이 판단은 Linux에서도 동일하다. 구현은 Java의 null/문자열 비교와 `ProductLabelMatch` 상태 분기만 변경했고 OS·경로·DB 쓰기·Docker 동작에 의존하지 않는다. Gradle/JUnit 명령은 CI의 Ubuntu runner에서도 동일한 소스와 테스트를 실행한다.

## 변경 요지

- `byModel`이 matched여도 `modelCode`가 snapshot token과 일치할 때만 exact를 채택한다.
- exact 결과가 존재하지만 불변 코드가 없거나 다른 제품을 가리키면 기존 label 결과(`AMBIGUOUS` 포함)를 보존한다.
- exact 404인 B-04 경로는 기존대로 label의 불변 코드가 다른 축이면 `NOT_FOUND`를 유지한다.
- 제품명 재사용 정책, snapshot backfill, DB mutation은 변경하지 않았다.

## 테스트 및 검증

- RED: `./gradlew.bat :services:accounting-service:test --tests '*DailyClosingDetailServiceTest.modelCodeMissingReusedSnapshotDoesNotOverrideAmbiguousLabel'` — 종료코드 **1**, `1 test completed, 1 failed`.
- GREEN: 같은 명령 — 종료코드 **0**, `BUILD SUCCESSFUL`.
- 회귀: `./gradlew.bat :services:accounting-service:test --tests '*DailyClosingDetailServiceTest'` — 종료코드 **0**, `BUILD SUCCESSFUL` (20 tests completed).
  - 위 클래스에서 B-03, B-04, 이름 변경·재사용 반례 2건, modelCode 없는 정상 레거시 경로를 함께 실행했다.
- accounting 전체: `./gradlew.bat :services:accounting-service:test` — 종료코드 **124**, 180초 타임아웃. **미판정**.
- slip 전체: `./gradlew.bat :services:slip-service:test` — 종료코드 **124**, 120초 타임아웃. **미판정**.
- partner-order 전체: `./gradlew.bat :services:partner-order-service:test` — 종료코드 **0**.
- common 전체: `./gradlew.bat :shared:common:test` — 종료코드 **0**.
- 병렬 4모듈 실행은 종료코드 **124**(184초 타임아웃)로 폐기했으며, 이후 모듈별 결과만 권위 있는 결과로 기록했다.
- 정적 확인: `git diff --check` — 종료코드 **0**.

## 신규 파일 및 변경 파일

신규 파일:

- `docs/dev-reports/2026-08-01-991-r9-exact-precedence.md`

변경 파일:

- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/MonthEndCloseService.java`
- `services/accounting-service/src/test/java/com/samhanair/logis/accounting/service/DailyClosingDetailServiceTest.java`

`git status --porcelain` 원문:

```text
 M services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/MonthEndCloseService.java
 M services/accounting-service/src/test/java/com/samhanair/logis/accounting/service/DailyClosingDetailServiceTest.java
?? docs/dev-reports/2026-08-01-991-r9-exact-precedence.md
```

## 이번에 안 본 것

- B-08은 기존 PASS로 유지하고 별도 판정하지 않았다.
- B-05·B-06·B-07은 Issue #1008 이관 범위라 보지 않았다.
- R-03은 판단 대기이며 DB write를 하지 않았다.
- 이미 통과한 B-01·B-02·B-09·B-10·R-01·R-02의 재판정은 하지 않았다.
- 제품 이름 재사용 정책을 변경하지 않았고, 과거 snapshot backfill도 하지 않았다.
- Docker 재빌드·재기동과 공유 DB write를 하지 않았다.
- accounting·slip 전체 테스트는 각각 타임아웃되어 전체 통과 여부를 주장하지 않는다. 해당 권위는 CI에 넘긴다.

# PR #991 fix 라운드 4 — `categoryKey` 보존

## 작업 기록

이 보고서는 B-09·B-10 검증을 시작하기 전에 생성했으며, 작업 진행에 따라 append 합니다.

## RED — B-09·B-10

### B-09 전표 복사

- 테스트: `SlipLineAmountOverflowTest.copyOf_preservesCategoryKey`
- 명령: `.\gradlew.bat :services:slip-service:test --tests 'com.samhanair.logis.slip.domain.SlipLineAmountOverflowTest.copyOf_preservesCategoryKey' --tests 'com.samhanair.logis.slip.domain.SlipRestoreTest.toSnapshot_preservesCategoryKey' --rerun-tasks --no-build-cache`
- 종료코드: `1`
- RED 원문: `전표 라인 저장 가능 금액 범위 ? MED-4 R2 경로/임계값 sweep > 전표 복사도 원본의 categoryKey를 보존한다 FAILED` / `org.opentest4j.AssertionFailedError at SlipLineAmountOverflowTest.java:85`

### B-10 협업 이력 복원

- 같은 최초 실행은 B-09의 실패와 함께 종료코드 `1`이었고, B-10은 `InvalidDefinitionException`으로 날짜 직렬화 설정에서 중단됐다.
- 테스트는 `findAndRegisterModules()`를 사용하도록 보정했다. 이는 제품 코드 변경이 아닌 테스트 직렬화 설정이며, 다음 실행에서 `categoryKey` 누락 단정까지 확인한다.
- 보정 후 RED 원문: `SlipRestoreTest > 협업 이력 스냅샷이 categoryKey를 보존한다 FAILED` / `java.lang.AssertionError at SlipRestoreTest.java:39`

## 변경 요지

- `SlipLine.copyOf`가 원본의 nullable `categoryKey`를 새 전표 라인에 전달하도록 수정했다. `sourceOrderLineId`는 복사본의 중복 역추적을 막기 위해 기존처럼 승계하지 않는다.
- `SlipSnapshot.Line`에 nullable `categoryKey`를 추가하고, 기존 생성자 오버로드는 `null` 축으로 연결해 구 JSON 스냅샷과 기존 호출부를 호환했다.
- `Slip.toSnapshot`에서 축을 캡처하고 `restoreFromSnapshot`에서 축을 포함한 라인 생성으로 되살리도록 대칭 배선했다.
- 정상 금액·라인 생성 규칙은 건드리지 않았다.

## 실측

### 보존되는 건수와 실패 건수

- B-09 회귀 테스트에서 `singleSets` 라인 1건을 복사: `categoryKey=singleSets` 보존, 복사 실패 `0건`.
- B-10 회귀 테스트에서 `singleSets` 라인 1건을 스냅샷 캡처 후 복원: `categoryKey=singleSets` 보존, 복원 실패 `0건`.
- 현재 배포 DB 읽기 전용 측정(2026-08-01 KST): `slip_lines` 전체 3,243건, 활성 2,791건, 활성 known `category_key` 0건.
- 주문 계보가 있는 활성 전표 라인: 22건, 그중 `category_key IS NULL` 22건. 따라서 현재 실데이터에는 이미 보존할 known 축이 저장된 대상이 없고, 22건은 레거시/미적용 축 데이터로 별도 이월 대상이다. 이 라운드에서는 backfill·DB 쓰기를 하지 않았다.
- `slip_revisions` 2,522건 중 JSON snapshot에 `categoryKey`가 있는 건수 0건. 새 배선은 신규 revision부터 적용되며 구 snapshot은 nullable 하위호환으로 유지된다.
- `accounting_db.sales_accounting_slip_lines`는 1건, known `category_key` 0건이었다. 이 수정은 slip 복사·협업 복원 계층만 바꾸며 회계 금액을 쓰지 않는다.

### 전체 모듈 검증

모든 명령은 캐시를 무력화했고 Linux CI와 같은 Gradle/JUnit 경로를 사용했다.

- common: `.\gradlew.bat --no-daemon :shared:common:test --rerun-tasks --no-build-cache` — 종료코드 `0` (`BUILD SUCCESSFUL`).
- accounting: `.\gradlew.bat --no-daemon :services:accounting-service:test --rerun-tasks --no-build-cache` — 종료코드 `0` (`BUILD SUCCESSFUL`, 7분 18초).
- slip: `.\gradlew.bat --no-daemon :services:slip-service:test --rerun-tasks --no-build-cache` — 종료코드 `0` (`BUILD SUCCESSFUL`, 5분 4초).
- partner-order: `.\gradlew.bat --no-daemon :services:partner-order-service:test --rerun-tasks --no-build-cache` — 종료코드 `0` (`BUILD SUCCESSFUL`, 4분 28초).

partner-order 종료 시 Testcontainers PostgreSQL 정리 로그에 연결 거부 경고가 있었지만 테스트 task는 `BUILD SUCCESSFUL`이고 종료코드 `0`이었다. api-gateway·product-service·groupware-service·auth-service는 건드리지 않았고, accounting/slip 재빌드·재기동도 하지 않았다.

## 이번에 안 본 것

- B-03·B-04·B-08은 축 판정 계열 다음 라운드 이월이며 이번 라운드에서 수정·검증하지 않았다.
- B-05·B-06·B-07은 Issue #1008(일마감 완전계승)으로 이관되어 손대지 않았다.
- R-03 선재 VAT 재가산 19건 backfill은 무결성 도메인·개발책임자 판단 대기이며 DB 쓰기를 하지 않았다.
- 이미 통과한 B-01·B-02·R-01·R-02는 되돌리지 않았고, 이번 변경 범위에 포함하지 않았다.

## 신규 파일 및 작업 트리

신규 파일:

- `docs/dev-reports/2026-08-01-991-r4-categorykey-preservation.md`

`git status --porcelain` 원문:

```text
 M services/slip-service/src/main/java/com/samhanair/logis/slip/domain/Slip.java
 M services/slip-service/src/main/java/com/samhanair/logis/slip/domain/SlipLine.java
 M services/slip-service/src/main/java/com/samhanair/logis/slip/revision/domain/SlipSnapshot.java
 M services/slip-service/src/test/java/com/samhanair/logis/slip/domain/SlipLineAmountOverflowTest.java
 M services/slip-service/src/test/java/com/samhanair/logis/slip/domain/SlipRestoreTest.java
?? docs/dev-reports/2026-08-01-991-r4-categorykey-preservation.md
```

git 쓰기 명령과 커밋은 수행하지 않았다.

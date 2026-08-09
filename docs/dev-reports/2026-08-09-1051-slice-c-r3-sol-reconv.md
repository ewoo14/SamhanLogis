# PR #1129 R3 SOL 재수렴 — 시더 의존 게이트 표면

> 검증자: CODEX SOL 5.6  
> 브랜치/HEAD: `fix/1051-product-link-track` / `aa9fce121232faffd8c3d0dd011e2005ae6d07e3`  
> 검증 시각: 2026-08-09 KST  
> 코드 수정·commit·push·공유 DB 쓰기·기존 행 수정/삭제·기존 서비스 재배포 없음. 요청된 Gradle 명령이 이름 패턴 때문에 Testcontainers PostgreSQL IT 1건을 함께 실행했으나 격리된 일회성 테스트 DB만 사용했다.

## 0. 먼저 보고할 요약 불일치

개발책임자의 요약 중 DeliveryBatch 30건, Estimate 40건, failures/errors 0, `18 actionable tasks: 18 executed`는 재현됐다. 다음 두 문장은 그대로는 사실이 아니다.

1. **"테스트 10건"**: 동일 명령은 10건이 아니라 **11건**을 실행했다. `*Seeder*`가 클래스명뿐 아니라 `SlipQueryRedesignSpecIT.specIt5_idempotencySeederRerun` 메서드도 선택했다. 결과 XML은 4개 suite, tests=11, failures=0, errors=0이다.
2. **"선행 성공 시 후속 시더가 전부 정상 실행"**: DeliveryBatch 30건과 Estimate 40건은 맞지만, fresh 표준 시드에서 `SlipLockSeeder`의 lock 처리 건수는 **0건**이다. 게이트가 닫혀서가 아니라 SlipSeeder의 CONFIRMED 날짜와 lock 조회 기간이 서로 만나지 않는다.

## 1. 판정 — 도달 가능한 결함

| ID | 심각도 | 도달성 | 결함 |
|---|---|---|---|
| C-R3-SOL-1 | **HIGH** | 표준 fresh dev seed에서 결정적 | Slip 선행 성공 뒤에도 `SlipLockSeeder`가 1월 CONFIRMED 전표를 0건 찾아 마감 lock fixture를 하나도 만들지 못한다. 클래스 주석의 기대치 5~10건과 반대다. |
| C-R3-SOL-2 | **LOW · 증거 무결성** | 구현자와 같은 명령을 실행하면 항상 도달 | `--tests '*Seeder*'` 결과를 3개 seed suite/10건으로 집계했지만 실제 선택은 unrelated IT를 포함한 4 suite/11건이다. 성공/실패 판정은 바뀌지 않으나 실행 모수 주장은 틀렸다. |

### C-R3-SOL-1 재현 절차와 실행 원문

1. fresh DB에서 dev profile과 `app.slip.seed-test-data=true`로 SlipSeeder(20)와 SlipLockSeeder(50)를 활성화한다.
2. product lookup 100건을 정상 반환시켜 SlipSeeder를 성공시킨다.
3. `SlipSeeder.buildSpecs()`의 CONFIRMED 인덱스와 `computeSlipDate(idx) = 2026-01-01 + idx`를 대조한다.
4. SlipLockSeeder의 조회 범위 `2026-01-01..2026-01-31`에 들어오는 행을 센다.

실행 원문:

```text
Index SlipDate   InLockRange
----- --------   -----------
   45 2026-02-15       False
   46 2026-02-16       False
   47 2026-02-17       False
   48 2026-02-18       False
   97 2026-04-08       False

CONFIRMED_TOTAL=5 LOCK_RANGE_COUNT=0
```

관련 원문은 `SlipSeeder.java`의 DAY CONFIRMED 4건, INBOUND CONFIRMED 1건, `computeSlipDate()`와 `SlipLockSeeder.java`의 1월 범위다. 기존 DB에 우연히 1월 CONFIRMED 행이 있으면 0보다 클 수 있으나, **이 시더들만으로 만드는 fresh fixture는 항상 0건**이다.

### C-R3-SOL-2 재현 절차와 실행 원문

```text
.\gradlew.bat :services:slip-service:test --tests '*Seeder*' --rerun-tasks --no-daemon

BUILD SUCCESSFUL in 1m 1s
18 actionable tasks: 18 executed
```

동일 실행이 만든 XML 전수:

```text
SlipQueryRedesignSpecIT              tests=1 failures=0 errors=0
EstimateSeederTest                   tests=2 failures=0 errors=0
SeederDependencyGateTest             tests=4 failures=0 errors=0
SlipSeederProductIntegrityTest       tests=4 failures=0 errors=0
TOTAL                                tests=11 failures=0 errors=0
```

추가 1건의 선택 원인은 소스의 메서드명 `specIt5_idempotencySeederRerun()`이다. 이 때문에 동일 명령은 Spring context와 Testcontainers PostgreSQL도 기동한다. 공유/실 DB에는 연결하지 않았다.

## 2. (a) 정상 경로와 토글 조합

### 정상 실행 건수

| 시더 | 선행 상태 `SUCCEEDED`일 때 관측/계산 | 판정 |
|---|---:|---|
| SlipSeeder | save 100, 정상 차단 0 | GREEN — `ACTIVE 96 + DISCONTINUED 4` 입력 테스트가 save 100회를 확인 |
| DeliveryBatchSeeder | saveAndFlush 30 | GREEN — `SeederDependencyGateTest`가 30회를 확인 |
| EstimateSeeder | save 40, line 79 | GREEN — save 40회를 확인; line 수는 `(idx % 3)+1`, idx 0..39의 합 79 |
| SlipLockSeeder | lock **0** | **HIGH** — 실행은 되지만 fresh seed의 CONFIRMED 5건이 모두 조회 기간 밖 |

fresh 실행 로그 원문:

```text
[EstimateSeeder] 완료 — 신규 40건, skip 0건 (총 40건)
[DeliveryBatchSeeder] 완료 — 신규 30건, skip 0건 (총 30건)
[SlipSeeder] 완료 — 신규 100건, skip 0건 (총 100건)
```

### 토글 조합 표 (`dev` profile 전제)

| `seed-test-data` | `full-seed-test-data` | Slip | DeliveryBatch | Estimate | SlipLock | 초기 `NOT_RUN`이 후속을 막는가 |
|---:|---:|---:|---:|---:|---:|---|
| false | false | OFF | OFF | OFF | OFF | 후속 bean 자체가 없음 |
| true | false | ON | ON | ON | ON | 아니오. Spring runner가 `@Order` 20→30→40→50으로 호출 |
| false | true | ON | OFF | ON | OFF | 아니오. Slip 20 뒤 Estimate 40; Delivery/Lock은 조건 불일치로 bean 없음 |
| true | true | ON | ON | ON | ON | 아니오. 20→30→40→50 |

따라서 **SlipSeeder만 비활성이고 후속 시더만 활성인 설정 조합은 없다.** DeliveryBatch/SlipLock을 켜는 `seed-test-data=true`는 Slip 조건식도 참으로 만들고, Estimate의 두 토글은 Slip과 동일하다. 셋째 가능한 조합은 `full=true/seed=false`로, Slip+Estimate만 활성이고 DeliveryBatch+SlipLock은 비활성이다.

의존하지 않는 다른 시더는 이 package에 없고, R3는 위 세 후속 시더에만 게이트를 추가했다. 변경 파일 전수에서도 다른 runner/시더 변경은 없다.

## 3. (b) 상태 공유의 함정

- `SeedDependencyState`는 `@Component`이며 scope 지정이 없어 application context당 기본 **singleton**이다.
- 초기값은 `NOT_RUN`; `SlipSeeder` 성공 후 `SUCCEEDED`, RuntimeException/flush/commit 예외 후 `FAILED`로 바뀐다.
- 상태는 reset되지 않으므로 **같은 application context에서 bean을 직접 재호출하면 마지막 값이 남는다.** 다만 저장소에는 CommandLineRunner를 재호출하는 endpoint/scheduler/caller가 없고 SpringApplication의 정상 기동에서는 runner가 한 번만 실행되므로 현재 운영 경로에서 stale 성공을 소비하는 재실행은 도달하지 않는다.
- 순서는 실제로 중요하며 `@Order(20/30/40/50)`에 의존한다. Spring Boot는 application runner와 command-line runner를 order comparator로 정렬한 뒤 호출한다. 현재 후속-only 토글 조합도 없어 정상 기동에서 `NOT_RUN` 오독은 도달하지 않는다.
- `volatile SlipSeedStatus`의 단일 read/write는 가시성과 원자성을 제공한다. 정상 runner 호출은 단일 스레드다. 임의의 동시 재호출에서는 이전 `SUCCEEDED`를 새 Slip 실행 중 잠시 볼 수 있으나 그런 호출 경로는 저장소에 없다.

## 4. (c) TransactionTemplate + flush/commit

### flush 예외와 기동 계속

`flushFailureIsHandledAsSeedFailureWithoutEscapingRun`은 mock `slipRepository.flush()`에서 실제 `IllegalStateException("flush failure")`를 발생시켰고 `run()` 밖으로 예외가 나오지 않은 채 상태가 FAILED가 됐다.

XML 원문:

```text
<testcase name="flushFailureIsHandledAsSeedFailureWithoutEscapingRun()" .../>
[SlipSeeder] 시딩을 건너뜁니다 — 서비스 기동은 계속합니다. 원인: flush failure
java.lang.IllegalStateException: flush failure
    at com.samhanair.logis.slip.seed.SlipSeeder.seed(SlipSeeder.java:288)
    at com.samhanair.logis.slip.seed.SlipSeeder.run(SlipSeeder.java:236)
```

### 부분 커밋

운영 5-인 생성자는 `PlatformTransactionManager`를 받고 `TransactionTemplate.executeWithoutResult(status -> seed(args))` 안에서 100회 save와 마지막 flush를 수행한다. flush가 던지면 callback이 비정상 종료되어 transaction이 rollback된 뒤 바깥 `run()` catch가 FAILED를 기록한다. commit 예외도 `executeWithoutResult` 호출 안에서 발생하므로 같은 catch 범위다. save/flush 앞뒤에 별도 transaction이나 `REQUIRES_NEW`는 없어 Slip/SlipLine 일부만 별도 commit되는 경로는 없다.

단, 현재 flush 테스트는 4-인 테스트 생성자(`transactionManager=null`)와 Mockito repository를 사용하므로 **실제 transaction rollback 후 DB row=0을 동적으로 측정한 테스트는 아니다.** 부분 커밋 없음 판정은 TransactionTemplate 경계의 정적 추적이다. 실 DB 쓰기 금지에 따라 추가 DB 실험은 하지 않았다.

## 5. (d) 증거 무결성

| 주장 | 같은 명령 재현 | 판정 |
|---|---|---|
| 정상 차단 0 | SlipSeeder save 100회, 완료 100/0/100 | 재현 |
| DeliveryBatch 30 | saveAndFlush 30회, 완료 30/0/30 | 재현 |
| Estimate 40 | save 40회, 완료 40/0/40 | 재현 |
| failures/errors 0 | 실제 11 tests 모두 0/0 | 재현 |
| 테스트 10건 | 실제 11건 | **불일치** |
| 18 tasks executed | `18 actionable tasks: 18 executed` | 재현; UP-TO-DATE 아님 |

## 6. (e) 앞 라운드 회귀

- **soft-delete 품목 통과 0건**: `ProductClient.lookup`은 product-service의 active-only 응답만 소비하고, R3는 해당 client/조회 로직을 변경하지 않았다. `10bbb94b2..HEAD`의 FE/client diff도 0이다.
- **401/403/408/429 ↔ 404 분류**: fresh 명령에서 `ProductClientTest tests=16 failures=0 errors=0`; XML에 `[1] status=401`, `[2] status=403`, `[3] status=408`, `[4] status=429`, `lookup_404_meansProductDoesNotExist`가 모두 통과했다.
- **UUID 죽은 단정**: R2 mutation 대상 `mock.ts`와 두 Playwright spec은 `10bbb94b2..HEAD` diff 0이며 세 `not.toContainText(MOCK_PRODUCT_AJ040_ID)` 단정이 그대로다. 코드 수정 금지 때문에 mutation을 다시 주입하지 않았으며, 동일 assertion site가 보존돼 R2의 mutation 3/3 실패 증거는 훼손되지 않았다. 정상 mock 회귀는 fresh `133 passed (133)`이다.

집중 Gradle 실행 원문:

```text
.\gradlew.bat :services:slip-service:test --tests '*SlipSeederProductIntegrityTest' --tests '*ProductClientTest' --rerun-tasks --no-daemon --console=plain

BUILD SUCCESSFUL in 42s
18 actionable tasks: 18 executed
ProductClientTest                    tests=16 failures=0 errors=0
SlipSeederProductIntegrityTest       tests=4  failures=0 errors=0
TOTAL                                tests=20 failures=0 errors=0
```

## 7. 이 라운드가 보지 않은 것

- 공유/운영 DB에서 시더를 실제 기동하지 않았다.
- Docker 서비스 재배포와 기존 끊긴 행·잔재의 수정/삭제를 하지 않았다.
- commit 시점에만 발생하는 실제 PostgreSQL 제약 예외를 주입하지 않았다. catch/rollback 판정은 transaction 경계 정적 추적이다.
- 코드 수정 금지 때문에 UUID 문자열 mutation을 재주입하지 않았다.
- 범위 밖인 200 OK snapshot, 관리자 삭제 정책, 복사/revision 복원은 보지 않았다.

## 8. 신규 파일

- `docs/dev-reports/2026-08-09-1051-slice-c-r3-sol-reconv.md`

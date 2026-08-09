# PR #1129 R2 재수렴 적대검증 — BLOCKING fix가 만든 표면

> 검증자: CODEX SOL 5.6  
> 브랜치/HEAD: `fix/1051-product-link-track` / `10bbb94b24ea92a0a6ac9a6ca62ec4617884d72c`  
> 검증 시각: 2026-08-09 03:45~03:54 KST  
> 코드 수정·commit·push·Docker 재배포·실 DB 쓰기·기존 행 수정/삭제 없음. DB SQL은 `BEGIN TRANSACTION READ ONLY`로 실행했다. UUID 노출 mutation은 mock fixture 한 줄에만 임시 적용하고 즉시 원복했으며, 원복 후 같은 3개 테스트를 다시 통과시켰다.

## 0. 먼저 보고할 요약/보고서 불일치

개발책임자의 현재 요약은 대체로 HEAD와 일치한다. 다만 다음 두 점은 구분해야 한다.

1. R2 fix 보고서 `2026-08-09-1051-slice-c-r2-fix.md`는 `docker-compose.prod.yml`에도 `product-service: service_healthy`를 추가했다고 적었지만, `9fcf69dde..10bbb94b2`의 실제 prod compose diff는 **0줄**이다. 현재 요약의 “PM이 prod 변경을 되돌렸다”가 HEAD 기준 사실이고, R2 보고서 문구가 stale이다.
2. “죽은 `not.toContainText` 단정 2곳”은 파일 수로는 2곳이 맞지만, 실제 assertion site는 **3개**다. `1062-line-input-ux` 1개, `ac-b1b-ds-a11y-layout` 2개(모바일 반복 테스트 1개 + 1440px 1개)다.

## 1. 판정

**BLOCKING 1건 + HIGH 1건.**

| ID | 심각도 | 도달 가능한 결함 |
|---|---|---|
| C-R2-SOL-1 | BLOCKING | `SlipSeeder` 실패를 정상 반환으로 바꾼 뒤 `DeliveryBatchSeeder`와 `EstimateSeeder`가 그대로 실행된다. fresh DB에서 slip 0건이어도 빈 DeliveryBatch 30건과 product 검증 없는 Estimate 40건/79라인을 별도 트랜잭션으로 저장할 수 있다. |
| C-R2-SOL-2 | HIGH | `run()` 내부 catch는 메서드 본문에서 난 예외만 잡는다. 마지막 JPA flush/transaction commit에서 난 예외는 프록시가 `run()` 반환 뒤 던지므로 catch 밖이며, 해당 종류의 시딩 실패는 여전히 서비스 기동을 중단할 수 있다. |

(a)의 soft-delete 반대편 누수는 없었다. 실 데이터 기준 통과 **0건**이다. (c)의 상태 분류와 timeout 주입, (d)의 UUID 단정 mutation, (e)의 보고서 수치는 지정 방법으로 재현됐다.

## 2. (a) ACTIVE 완화가 soft-delete 반대편으로 새는가

### 판정: 통과 — soft-delete 통과 0건

실제 lookup 경로는 다음과 같다.

```text
ProductClient.lookup
  -> POST /products/internal/lookup
  -> ProductInternalController.lookup
  -> ProductService.lookup
  -> ProductRepository.findAllByIdIn
  -> Product @SQLRestriction("is_deleted = false")
```

`status` 조건은 없으므로 `DISCONTINUED`이면서 삭제되지 않은 품목은 의도대로 반환한다. 반면 `is_deleted=true` 행은 Hibernate SQLRestriction으로 제외된다.

표준 seed modelName 100개에서 Java `UUID.nameUUIDFromBytes("samhan-seed:product:" + modelName)`와 같은 Type-3 UUID를 계산해 공유 DB와 실제 product-service lookup을 동시에 읽었다.

실행 원문:

```text
MEASURED_LOCAL=2026-08-09 03:46:48.201 +09:00
REQUESTED=100
API_RETURNED=0
API_RETURNED_IDS=0
DB_READ_ONLY_OUTPUT_BEGIN
BEGIN
2026-08-09 03:46:48.44795+09
t|ACTIVE|96
t|DISCONTINUED|4
ROLLBACK
DB_READ_ONLY_OUTPUT_END
```

따라서 공유 DB에는 요청한 표준 UUID가 soft-delete 상태로 정확히 100건 있었지만 API가 반환한 건수는 0건이다. 완화 후 시더의 `summary != null && summary.id() != null` 게이트로 들어갈 soft-delete 품목도 **0건**, 삭제 품목 때문에 재생성될 전표도 **0건**이다.

참고로 현재 공유 DB 전체 품목 분포의 같은 read-only 측정은 다음과 같았다.

```text
2026-08-09 03:45:52.045105+09
is_deleted=false ACTIVE       3083
is_deleted=true  ACTIVE        134
is_deleted=true  DISCONTINUED    4
```

## 3. (b) 실패가 조용해졌는가 / rollback / 후속 시더

### 로그 수준: 통과 — 실제 ERROR + stack trace

fresh 테스트 실행:

```text
.\gradlew.bat :services:slip-service:test \
  --tests "*SlipSeederProductIntegrityTest" \
  --tests "*EstimateSeederTest" \
  --rerun-tasks --no-daemon --console=plain

BUILD SUCCESSFUL in 40s
18 actionable tasks: 18 executed
```

Gradle XML에 기록된 실제 로그 원문:

```text
03:47:54.199 [Test worker] ERROR com.samhanair.logis.slip.seed.SlipSeeder --
[SlipSeeder] 시딩을 건너뜁니다 — 서비스 기동은 계속합니다. 원인:
존재하는 product 100개가 모두 준비되지 않아 SlipSeeder를 중단합니다.
product-service seed를 먼저 완료하십시오.
java.lang.IllegalStateException: 존재하는 product 100개가 모두 준비되지 않아 ...
    at com.samhanair.logis.slip.seed.SlipSeeder.loadSeedProducts(SlipSeeder.java:291)
    at com.samhanair.logis.slip.seed.SlipSeeder.seed(SlipSeeder.java:235)
    at com.samhanair.logis.slip.seed.SlipSeeder.run(SlipSeeder.java:222)
```

따라서 실패는 조용히 사라지지 않고 `ERROR`와 stack trace로 남는다.

### SlipSeeder 동일 트랜잭션의 부분 저장: 남기지 않음

`run()`은 `@Transactional`이고 catch에서 실제 트랜잭션이 활성 상태이면 `currentTransactionStatus().setRollbackOnly()`를 호출한다. 본문 중간 예외가 catch에 들어온 경우 그 트랜잭션의 앞선 `save()`도 commit되지 않는다. lookup 누락 테스트는 save 0회도 확인한다.

단, 아래 C-R2-SOL-2처럼 **메서드 반환 뒤 commit/flush에서 처음 발생하는 예외**는 catch 자체에 들어오지 않는다. 이 경우에도 해당 트랜잭션은 rollback되므로 partial slip은 남지 않지만 서비스 기동 계속 보장은 깨진다.

### C-R2-SOL-1 BLOCKING — 후속 시더가 반쪽 데이터를 만든다

재현 절차:

1. dev profile에서 `app.slip.seed-test-data=true`로 세 시더를 활성화한다.
2. product lookup이 빈 목록/404/401/403/408/429/timeout을 내도록 한다.
3. `@Order(20)` SlipSeeder는 예외를 catch하고 정상 반환한다. slip 저장은 0건이다.
4. Spring Boot runner는 다음 `@Order(30)` DeliveryBatchSeeder와 `@Order(40)` EstimateSeeder를 계속 호출한다.
5. DeliveryBatchSeeder는 mappable slip이 0건이어도 batch 생성을 막지 않는다. `while (pickCount > 0 && slipCursor < mappableSlips.size())`가 즉시 끝나고 `DeliveryBatch.create`/`saveAndFlush`를 30회 진행한다.
6. EstimateSeeder에는 ProductClient가 없고 deterministic product UUID를 직접 넣는다. 독립 트랜잭션에서 40견적/79라인을 만든다.

실행 증거:

```text
SlipSeederProductIntegrityTest
tests=3 failures=0 errors=0
[SlipSeeder] ERROR ... 시딩을 건너뜁니다 ...
verify(slipRepository, never()).save(...)

EstimateSeederTest
tests=2 failures=0 errors=0
03:47:53.693 INFO [EstimateSeeder] P2 시드 시작 — 40건 견적서 ...
03:47:53.736 INFO [EstimateSeeder] 완료 — 신규 40건, skip 0건 (총 40건)
```

Estimate line 수는 코드의 `(idx % 3) + 1`, `idx=0..39` 합계이므로 `13*(1+2+3)+1 = 79`다. 결과는 다음과 같은 도달 가능한 반쪽 상태다.

```text
Slip                    0
DeliveryBatch          30  (slip 연결 0)
Estimate               40
EstimateLine           79  (product 존재 검증 0)
```

이는 “실패 시 기동 계속”을 달성하면서 후속 시더의 선행조건을 함께 표현하지 않아 생긴 새 표면이다.

### C-R2-SOL-2 HIGH — commit 시점 예외는 catch 밖이다

재현 절차:

1. 마지막 seed entity가 DB constraint/flush 오류를 갖게 한다.
2. `repository.save()`가 즉시 flush하지 않아 `seed()`와 내부 try/catch는 정상 종료한다.
3. Spring transaction interceptor가 `run()` 반환 뒤 commit을 시도하면서 flush 예외를 던진다.
4. 예외 발생 위치는 `run()` 메서드 내부 catch 이후이므로 “서비스 기동은 계속” 경로로 변환되지 않는다.

관련 코드 원문:

```text
@Transactional
public void run(String... args) {
    try { seed(args); }
    catch (RuntimeException ex) { ... setRollbackOnly(); log.error(...); }
}

// loop 내부
slipRepository.save(slip);   // saveAndFlush 아님
```

해당 경우 트랜잭션 rollback 자체는 유지되지만 CommandLineRunner 예외가 호출자에게 전파될 수 있다. R2 보고서의 포괄적 문장 “시딩 중 예외가 나도 ... 시딩만 건너뛴다”는 commit-time 예외까지 보장하지 않는다.

## 4. (c) 401/403/408/429·404 분류와 timeout

### 판정: 통과

같은 `MockRestServiceServer` 경로에서 각 HTTP status를 실제 응답으로 발생시킨 집중 테스트를 fresh 실행했다.

```text
ProductClientTest.xml tests=16 failures=0 errors=0 skipped=0

lookup_404_meansProductDoesNotExist
  -> ErrorCode.NOT_FOUND / message contains "제품"

lookup_verificationFailure4xx_isNotClassifiedAsMissingProduct
  -> status 401, 403, 408, 429 각각
  -> ErrorCode.INTERNAL_ERROR / message contains "조회"
```

따라서 404와 네 조회 불가 상태의 분류는 맞다.

운영 DI constructor는 `@Autowired` 5-인 생성자이고 `@Value` 기본값은 2,000/3,000ms다. fresh compile 후 `javap -c -p/-v`로 실제 bytecode를 확인했다.

```text
public ProductClient(RestClient$Builder, InternalAuthProperties, ObjectMapper, int, int)
  Duration.ofMillis(connectTimeoutMs)
  SimpleClientHttpRequestFactory.setConnectTimeout(Duration)
  Duration.ofMillis(readTimeoutMs)
  SimpleClientHttpRequestFactory.setReadTimeout(Duration)
  RestClient$Builder.requestFactory(...)

@Autowired
@Value("${samhan.product-client.connect-timeout-ms:2000}")
@Value("${samhan.product-client.read-timeout-ms:3000}")
```

즉 설정값은 운영 bean이 만드는 실제 request factory에 적용된다. 외부 stall 서버를 둔 wall-clock 2s/3s 네트워크 시험은 하지 않았다.

## 5. (d) 죽은 UUID 비노출 단정 mutation

### 정적 확인

세 assertion site 모두 옛 UUID가 아니라 새 UUID 상수 `2e40fa30-10b2-3a9b-a99c-570ac92287ad`를 검사한다.

```text
1062-line-input-ux.spec.ts:31
  await expect(dialog).not.toContainText(MOCK_PRODUCT_AJ040_ID)

ac-b1b-ds-a11y-layout.spec.ts:76
  await expect(productDialog).not.toContainText(MOCK_PRODUCT_AJ040_ID)

ac-b1b-ds-a11y-layout.spec.ts:99
  await expect(productDialog).not.toContainText(MOCK_PRODUCT_AJ040_ID)
```

### mutation 절차와 결과

기본 5173은 기존 서버 재사용으로 현재 화면에 도달하지 못해 3/3이 선행 locator에서 실패했다. 이를 결과에서 제외하지 않고 환경 불일치로 기록한다. 현재 HEAD Vite를 독립 포트 15175에 띄우고 `PLAYWRIGHT_SKIP_WEB_SERVER=1`, `AUDIT_BASE_URL=http://127.0.0.1:15175`로 고정했다.

원본:

```text
Running 3 tests using 1 worker
3 passed (7.3s)
```

mutation은 실제 모달에 쓰이는 AJ040 품목명 한 줄에 UUID를 붙였다.

```text
productName: `시스템에어컨 4Way 4HP ${MOCK_PRODUCT_AJ040_ID}`
```

mutation 실행 원문(세 테스트 모두 해당 assertion에서 실패):

```text
Expected substring: not "2e40fa30-10b2-3a9b-a99c-570ac92287ad"
Received string: "...시스템에어컨 4Way 4HP 2e40fa30-10b2-3a9b-a99c-570ac92287ad..."

1062-line-input-ux.spec.ts:31  failed
ac-b1b-ds-a11y-layout.spec.ts:76 failed
ac-b1b-ds-a11y-layout.spec.ts:99 failed
3 failed
```

즉시 원복 후:

```text
Running 3 tests using 1 worker
3 passed (7.3s)
```

`git diff -- clients/desktop/src/renderer/api/mock.ts ...`는 0줄이었다. 임시 Vite 프로세스도 종료했다.

## 6. (e) R2 증거 무결성 재현

측정 시각: Gradle 03:52:35~03:53:12 KST, Vitest 03:52:36 KST.

### 정상 100건 차단 0건 — 같은 방법으로 재현

`ACTIVE 96 + DISCONTINUED 4` mock response를 주는 `discontinuedSeedProductStillAllowsAllHundredSlips`가 통과했고 repository save 100회를 확인했다.

```text
03:53:11.990 INFO [SlipSeeder] 완료 — 신규 100건, skip 0건 (총 100건)
SlipSeederProductIntegrityTest tests=3 failures=0 errors=0 skipped=0
```

따라서 보고서와 같은 Mockito 방법의 “정상 100건 차단 0건”은 재현된다. 이는 실 DB INSERT가 아니다. 현재 공유 DB의 표준 100 UUID는 모두 soft-delete라 실제 lookup은 0건이고, 현재 DB에서 시더를 돌리면 100건 모두 차단되는 것이 올바른 동작이다.

### 집중 Gradle 19개

```text
.\gradlew.bat :services:slip-service:test \
  --tests "*SlipSeederProductIntegrityTest" \
  --tests "*ProductClientTest" \
  --rerun-tasks --no-daemon --console=plain

BUILD SUCCESSFUL in 37s
18 actionable tasks: 18 executed

ProductClientTest                    tests=16 failures=0 errors=0 skipped=0
SlipSeederProductIntegrityTest       tests=3  failures=0 errors=0 skipped=0
TOTAL                                tests=19 failures=0 errors=0 skipped=0
```

`--rerun-tasks`를 사용했고 actionable task 18개가 모두 executed라 UP-TO-DATE 결과가 아니다.

### Vitest 133개

```text
npx vitest run src/renderer/api/mock.test.ts --reporter=verbose

Test Files  1 passed (1)
Tests       133 passed (133)
Duration    1.45s
exit code   0
```

세 수치는 같은 방법으로 재현됐다.

## 7. PM의 prod compose 되돌림 판단

### 판정: 타당

- seed runner 세 종류는 dev profile/로컬 seed toggle에 한정된다. 이번 장애 대응의 startup ordering 필요 범위는 `docker-compose.local-all.yml`이다.
- 운영 compose에서 slip-service 자체 기동을 product-service health에 강결합하면 product 장애가 slip의 독립 기동/복구까지 막는다. 요청 처리 시 ProductClient가 fail-fast하는 것과 프로세스 기동 자체를 결합하는 것은 별개 정책이다.
- 현재 local-all은 product `service_healthy` dependency가 있고, prod에는 없다. 두 compose 모두 `docker compose ... config --quiet` exit 0이었다(미설정 환경변수 warning만 존재).

따라서 prod 변경을 되돌리고 local-all에만 dependency를 둔 범위 결정은 맞다. 단 R2 fix 보고서의 “prod에도 추가” 문구는 현재 HEAD와 맞게 정정되어야 한다.

## 8. 신규 파일

- `docs/dev-reports/2026-08-09-1051-slice-c-r2-sol-reconv.md`


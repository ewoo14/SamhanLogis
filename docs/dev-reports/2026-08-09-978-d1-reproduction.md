# #978 D-1 재현 확정 — ProductSheetSyncService 롤백 캐시

## 판정

**재현된다.** `#1139` 머지 뒤에도 `ProductSheetSyncService.lastKnownRowHash`는 트랜잭션 롤백을 따라가지 않는다. 변경 단가 처리 중 hash 기록 뒤 후속 DB 저장을 실패시켜 탭 트랜잭션을 실제 롤백한 다음 같은 JVM에서 같은 시트 행으로 재시도하면, 재시도는 `updated=0 / unchanged=1`로 빠지고 DB 단가는 구값에 남았다.

직전 정찰의 “`#1139`는 별도 클래스의 캐시를 고쳤다”는 주장은 **맞다**. 다만 현재 라이브 DB의 단가 drift는 0건이며 현재 서비스 JVM은 부팅 뒤 product sync 실행 표본이 0이라, “현재 운영 데이터가 이미 오염됐다”까지 확대하지 않는다. 이 현재 표본 0과 결함 재현 성공은 서로 다른 판정이다.

## 기준 SHA와 작업트리

```text
branch=feat/978-fast-path-carryover
HEAD=fb36f317f
#1139 merge=cdbbde4f43bbd13dad1157e420a18484a1f5f2e2
cdbbde4f4_is_ancestor_of_HEAD_exit=1
origin/main contains cdbbde4f4=yes
```

지정 브랜치 HEAD에는 `#1139`가 포함되지 않았으므로 checkout/merge하지 않고 `origin/main` 객체를 직접 조사했다. 재현 대상 제품 코드 blob은 HEAD와 `origin/main`이 정확히 같다.

```text
git rev-parse HEAD:services/product-service/src/main/java/com/samhanair/logis/product/service/ProductSheetSyncService.java
2d9b0634c707fc7ee784349222c2d128c6256f68

git rev-parse origin/main:services/product-service/src/main/java/com/samhanair/logis/product/service/ProductSheetSyncService.java
2d9b0634c707fc7ee784349222c2d128c6256f68
```

따라서 이 RED는 `#1139` 머지 후 `origin/main`의 해당 제품 코드와 동일한 코드에 대한 재현이다.

## 1. `#1139`가 고친 캐시

`git show cdbbde4f4 --stat` 원문:

```text
cdbbde4f4 [FIX] #978 D-1 시트 sync 캐시가 롤백을 안 따라가 단가가 영구히 반영되지 않는다 (#1139)
 .../service/ProductLookupSheetSyncService.java     |  82 ++++----
 .../it/ProductLookupSheetSyncServiceIT.java        | 222 +++++++++++++++++++++
 6 files changed, 807 insertions(+), 43 deletions(-)
```

`#1139`가 고친 것은 `ProductLookupSheetSyncService`의 lookup 3종 캐시다.

- `ProductLookupSheetSyncService.java:35-37` — 현재 계약은 시트 hash와 **현재 DB active row hash**를 그 자리에서 비교한다.
- `:151-169` — 싱글 자재가격: `materialRowHash(active.get())`와 시트 hash 비교.
- `:207-229` — 추천실외기: `oduRowHash(active.get())`와 시트 hash 비교.
- `:259-278` — 분기계산: `branchRowHash(active.get().getBranchCode())`와 시트 hash 비교.
- `:285-287` — 옛 `clearHashCacheForTest()`는 호환용 no-op이다.
- `:420-440` — DB 엔티티 기반 hash 생성기다.

`git grep -n lastKnownRowHash cdbbde4f4` 원문은 두 층을 분명히 가른다.

```text
cdbbde4f4:.../ProductSheetSyncService.java:177: private final Map<String, String> lastKnownRowHash = new ConcurrentHashMap<>();
cdbbde4f4:.../ProductSheetSyncService.java:1243: String prevHash = lastKnownRowHash.get(modelCode);
cdbbde4f4:.../ProductSheetSyncService.java:1284: lastKnownRowHash.put(modelCode, rowHash);
cdbbde4f4:.../ProductSheetSyncService.java:1352: lastKnownRowHash.put(modelCode, rowHash);
cdbbde4f4:.../ProductSheetSyncService.java:1360: lastKnownRowHash.put(modelCode, rowHash);
```

반면 `ProductLookupSheetSyncService.java`에는 `lastKnownRowHash`가 0건이다. 즉 두 캐시는 이름과 실패 형태만 같았고, 서로 다른 서비스·테이블·sync 층이다. `#1139`는 자재가격/추천실외기/분기계산 lookup 층을 닫았지만 제품 6탭/`products.release_price` 층은 덮지 않았다.

## 2. ProductSheetSyncService 캐시와 무효화 전수

`origin/main` 기준 핵심 좌표:

```text
:177       lastKnownRowHash 선언 (JVM ConcurrentHashMap)
:1161-1162 @Transactional syncTab
:1243      prevHash get
:1284      신규 insert 뒤 put
:1352      변경 update 뒤 put
:1360      attribute 보정 뒤 put
:1373      put 뒤 upsertSheetExposure 호출
:1381      put 뒤 syncBeforeIncreasePriceHistory 호출
:1383-1417 put 뒤 soft-delete sweep
```

무효화는 다음 세 종류가 전부다.

1. `ProductSheetSyncService.java:1415`
   - 같은 `syncTab`의 “시트에서 사라진 제품 soft-delete” 분기에서 해당 code를 remove한다.
   - 성공 처리 분기일 뿐 transaction rollback callback/catch가 아니다.
   - 이 remove 자체도 DB rollback과 원자적이지 않다.

2. `ProductSheetSyncService.java:1982-1985`의 `evictRowHash(modelCode)`
   - 운영 호출부는 정확히 4곳이다.

```text
ProductService.java:745 updateClassificationAndFixedDiscount
ProductService.java:756 updateFixedDiscountAndReturn
ProductService.java:767 clearUsageOverride
ProductService.java:786 clearVariableDiscountOverride
```

   - 컨트롤러 호출부는 `ProductCatalogController.java:262,296,309,320`이다.
   - 수동 override 설정/해제 경로용이며 `syncTab` 실패 catch에서는 호출되지 않는다.

3. `ProductSheetSyncService.java:1992-1993`의 `clearHashCacheForTest()`
   - `src/main` 운영 호출 0건, 테스트 격리 전용이다.

`syncAll()`의 탭 예외 catch는 `ProductSheetSyncService.java:255-261`이며 error summary만 기록한다. `evictRowHash`, `clearHashCacheForTest`, `lastKnownRowHash.remove/clear`를 호출하지 않는다. 따라서 `:1284/:1352/:1360` 뒤 예외로 탭 DB 트랜잭션이 롤백되는 경로가 무효화 누락 경로다.

## 3. 발화 조건 카운트

### 3.1 관리자/실 경로

관리자 화면과 실행 경로는 존재한다.

```text
clients/desktop/src/renderer/routes/admin/SheetSyncPage.tsx:64-69  triggerSync mutation
clients/desktop/src/renderer/api/sheetSyncApi.ts:81-84             POST /api/v1/products/admin/sync
ProductAdminController.java:66-72                                 syncService.syncAll()
ProductSheetSyncService.java:245                                  self.syncTab(...) 프록시 트랜잭션
```

별도 “롤백” 버튼은 없다. 롤백은 수동 sync 화면 또는 cron/boot sync가 `@Transactional syncTab()`을 실행한 뒤 unchecked DB 예외가 발생할 때 Spring이 자동 수행한다. 즉 실 관리 화면에서 sync를 시작할 수 있고, 그 처리 중 후속 DB 저장 실패가 롤백 발화 조건이다.

현재 컨테이너는 `samhan.product.sheet-sync.cron-enabled=false`라 자동/부팅 sync가 꺼져 있다. 로그 원문:

```text
2026-08-08T09:43:21.701+09:00 ... [ProductSheetSyncScheduler] cron-enabled=false — 부팅 sync skip (수동 trigger 전용)
```

컨테이너의 `/etc/samhan/sa-key.json`도 읽을 수 없는 상태다.

```text
SA_KEY_READABLE=no
```

따라서 현재 컨테이너에서 부팅 이후 실제 product sync가 실행되어 cache가 채워진 표본은 0건이다. 이는 결함 0이 아니라 현재 라이브 발화 상태 표본 0이다.

### 3.2 실제 시트 sync 대상

공개 Google Sheet를 조회 전용 CSV로 읽고 `ProductSheetSyncService`와 같은 header/name/model 유효성 조건으로 계산했다.

```text
홈멀티_단가인상          VALID_SYNC_ROWS=115  DISTINCT_MODELS=115
싱글 세트_단가인상       VALID_SYNC_ROWS=236  DISTINCT_MODELS=236
싱글 구성품_단가인상     VALID_SYNC_ROWS=1735 DISTINCT_MODELS=642
상업멀티_단가인상        VALID_SYNC_ROWS=417  DISTINCT_MODELS=415
상업멀티 구성_단가인상   VALID_SYNC_ROWS=514  DISTINCT_MODELS=326
구형                     VALID_SYNC_ROWS=40   DISTINCT_MODELS=40
TOTAL_VALID_SYNC_ROWS=3057
TOTAL_DISTINCT_MODELS=1118
CROSS_TAB_DUPLICATE_OCCURRENCES=1939
```

즉 한 번의 전체 sync에서 처리 후보 행은 3,057행이고 고유 모델은 1,118건이다.

### 3.3 현재 실 DB 조건

실 `product_db`는 SELECT만 실행했다. 6개 시트의 처리 순서와 같은 순서로 마지막 출현 단가를 계산해 DB와 대조했다.

```text
FINAL_SYNC_DISTINCT_MODELS=1118
FINAL_SYNC_MISSING_DB=2
FINAL_SYNC_PRICE_DIFF_DB=0
FINAL_SYNC_PRICE_EQUAL_DB=1116
MODELS_WITH_MULTIPLE_ROW_OCCURRENCES=697
```

현재 DB에서 비교 가능한 1,116모델은 모두 시트 최종 단가와 일치하고, 시트 모델 2건은 DB에 없다. 따라서 현재 실 DB의 관측 가능한 단가 drift는 0건이다. 그러나 stale hash는 JVM 내부 상태이고 현재 JVM의 sync 표본이 0이므로, 이 수치로 결함 부재를 주장하지 않는다.

## 4. RED 재현

### 4.1 테스트가 밟은 순서

1. 격리 Testcontainers PostgreSQL에 `ROLLBACK_PRICE_MODEL`을 출고가 1,000,000으로 정상 sync/commit한다.
2. 같은 시트 행을 1,200,000으로 바꾼다.
3. `ProductSheetSyncService.java:1352`가 새 row hash를 JVM map에 기록한 뒤 `:1373`의 exposure save에서 `IllegalStateException`을 주입한다.
4. 탭 트랜잭션이 롤백되어 DB 출고가는 1,000,000으로 복귀하지만 새 hash는 map에 남는다.
5. 같은 JVM에서 같은 1,200,000 행을 재시도한다.
6. `:1243`의 `prevHash`가 새 hash와 같아 `updated=0 / unchanged=1`이 되고, DB 출고가는 1,000,000에 남는다.

외부 Google API만 mock했고, 실제 서비스·Spring 프록시 트랜잭션·JPA repositories·PostgreSQL은 real component를 사용했다. 공유/실 DB write는 0건이다.

### 4.2 테스트 소스

파일: `services/product-service/src/test/java/com/samhanair/logis/product/it/ProductSheetSyncServiceIT.java`

```java
@Test
@Transactional(propagation = Propagation.NOT_SUPPORTED)
void syncTab_후속저장실패로_롤백된_단가는_같은행_재시도에서_반영되어야한다() throws Exception {
    when(sheetsClient.readSheetDisplay(anyString(), anyString())).thenReturn(List.of());
    when(sheetsClient.readSheetDisplay("test-sheet-id", "홈멀티_단가인상!A1:Z")).thenReturn(homeMultiRows(
            row("롤백 단가 품목", "ROLLBACK_PRICE_MODEL", "", "1,000,000", "", "900,000")
    ));
    syncService.syncAll();

    when(sheetsClient.readSheetDisplay("test-sheet-id", "홈멀티_단가인상!A1:Z")).thenReturn(homeMultiRows(
            row("롤백 단가 품목", "ROLLBACK_PRICE_MODEL", "", "1,200,000", "", "1,080,000")
    ));
    doThrow(new IllegalStateException("injected exposure save failure"))
            .when(exposureRepository).save(any(ProductEstimateExposure.class));

    ProductSheetSyncService.SyncSummary rolledBack = syncService.syncAll();
    assertThat(rolledBack.byTab.get("홈멀티").error).isEqualTo("injected exposure save failure");
    assertThat(productRepository.findByModelCodeAndIsDeletedFalse("ROLLBACK_PRICE_MODEL").orElseThrow()
            .getReleasePrice()).isEqualByComparingTo(new BigDecimal("1000000"));

    reset(exposureRepository);
    ProductSheetSyncService.SyncSummary retry = syncService.syncAll();

    assertThat(productRepository.findByModelCodeAndIsDeletedFalse("ROLLBACK_PRICE_MODEL").orElseThrow()
            .getReleasePrice()).isEqualByComparingTo(new BigDecimal("1200000"));
    assertThat(retry.byTab.get("홈멀티").updated).isEqualTo(1);
}
```

### 4.3 실행 명령과 원문

```powershell
.\gradlew.bat :services:product-service:test `
  --tests "com.samhanair.logis.product.it.ProductSheetSyncServiceIT.syncTab_후속저장실패로_롤백된_단가는_같은행_재시도에서_반영되어야한다" `
  --rerun-tasks --no-daemon
```

Gradle 원문:

```text
> Task :services:product-service:test

ProductSheetSyncServiceIT > syncTab_후속저장실패로_롤백된_단가는_같은행_재시도에서_반영되어야한다() FAILED
    org.opentest4j.AssertionFailedError at ProductSheetSyncServiceIT.java:221

> Task :services:product-service:test FAILED
1 test completed, 1 failed

FAILURE: Build failed with an exception.
BUILD FAILED in 45s
```

JUnit XML 원문:

```text
tests=1 failures=1 errors=0 skipped=0 time=0.583
org.opentest4j.AssertionFailedError:
expected: 1200000
 but was: 1000000.00
```

Gradle 종료코드는 `1`이었다. `--rerun-tasks`를 사용했으며 `UP-TO-DATE` 결과를 증거로 쓰지 않았다. 앞선 도구 timeout 2회, 잘못된 Gradle project path 1회, 테스트 import 누락 compile failure 1회는 제품 테스트 진입 전 하네스 오류라 판정에서 제외했다.

## 신규/변경 파일

- `docs/dev-reports/2026-08-09-978-d1-reproduction.md` — 신규
- `services/product-service/src/test/java/com/samhanair/logis/product/it/ProductSheetSyncServiceIT.java` — RED 재현 테스트 추가

제품 코드 수정, 실 DB write, git commit/push, 다른 worktree/checkout은 하지 않았다.

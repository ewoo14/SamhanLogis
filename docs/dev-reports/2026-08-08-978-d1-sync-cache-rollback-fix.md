# #978 D-1 sync cache rollback fix

## 결론

`ProductLookupSheetSyncService`의 세 탭 트랜잭션에서 row hash put/remove를 트랜잭션별 스테이징 버퍼에 모은 뒤, `afterCompletion(STATUS_COMMITTED)`에서만 `ConcurrentHashMap`에 반영하도록 수정했다. rollback이면 버퍼를 폐기하므로 rollback된 행의 hash가 캐시에 남지 않는다.

탭 실패 시 기존의 탭 전체 캐시 삭제 fallback도 제거했다. 커밋된 다른 행의 hash를 잃지 않아 정상 동기화의 `unchanged` 판정과 불필요한 save 회피를 보존한다.

## 적용 전수

PM 좌표와 실제 `grep -n "lastKnownRowHash"` 결과를 대조했다.

적용 전 등장 지점 15개:

```text
70, 168, 170, 173, 231, 233, 236, 283, 285, 288,
302, 333, 347, 360, 462
```

트랜잭션 진입점 세 곳 모두 동일 패턴이었다.

```text
126  syncMaterialPricesTab
191  syncOduRecommendationsTab
254  syncBranchPipesTab
```

현재 세 탭의 put/get/remove는 각각 `putHash`, `getHash`, `removeHash`를 거친다. soft-delete remove도 commit 후에만 반영된다.

## RED-first 증거

실제 저장 실패를 주입해 첫 행 저장 후 둘째 행 저장에서 `IllegalStateException`을 발생시켰다. 수정 전 RED 원문:

```text
ProductLookupSheetSyncServiceIT > syncMaterialPricesTab_저장실패_롤백시_앞서갱신한_hash도_재처리된다() FAILED

org.opentest4j.AssertionFailedError:
expected: 2
 but was: 1
```

첫 행 DB 금액은 rollback으로 원래 값으로 돌아왔지만, 캐시에는 첫 행 hash가 남아 재시도에서 첫 행이 `unchanged`로 건너뛰어진 결과다.

## 검증

통과:

```text
./gradlew.bat :services:product-service:test --tests "com.samhanair.logis.product.it.ProductLookupSheetSyncServiceIT.syncMaterialPricesTab_저장실패_롤백시_앞서갱신한_hash도_재처리된다" --no-daemon
BUILD SUCCESSFUL

./gradlew.bat :services:product-service:test --tests "com.samhanair.logis.product.it.ProductLookupSheetSyncServiceIT" --no-daemon
BUILD SUCCESSFUL
```

포함한 회귀 시나리오:

- 같은 행이 두 번 연속 rollback되어도 DB가 원상태이고 성공 시 두 행 모두 재처리
- 자재 탭 하나만 rollback되어도 ODU/분기계산 탭의 커밋된 hash는 다음 실행에서 `unchanged`
- rollback 후 성공 시 hash가 성공 결과로 채워짐
- 기존 3탭 insert/unchanged/update/soft-delete 회귀 유지

product-service 전체 테스트 명령은 두 번 실행했으나 Gradle이 테스트 중 외부 stop 신호로 종료되어 완료 결과를 얻지 못했다.

```text
Gradle build daemon has been stopped: stop command received
```

따라서 전체 테스트 성공으로 보고하지 않는다. 변경 파일을 직접 참조하는 `ProductLookupSheetSyncServiceIT` 전체 클래스는 통과했다.

## 범위 밖 축 점검 목록

트랜잭션 경계 안에서 갱신되는 in-memory 필드 상태를 성질 기준으로 확인했으며 수정하지 않았다.

- `services/product-service/.../ProductSheetSyncService.java` — `lastKnownRowHash`가 두 `@Transactional` sync 경로에서 갱신
- `services/partner-auth-service/.../PartnerAuthService.java` — `passwordResetRateLimits`가 클래스 `@Transactional` 경계 안에서 rate-limit 상태 갱신
- `services/partner-service/.../PartnerAuditLogService.java` — `revisionCounters`가 `recordOverlayPatch`/`recordBatch` 트랜잭션 안에서 갱신

다음은 in-memory/cache 필드지만 해당 축(트랜잭션 내부 갱신)에 해당하지 않아 목록 대상에서 제외했다: `BootstrapService`의 prefetch cache, `WarehouseCodeMapper`의 비동기 검증 상태, metrics counter cache.

## 변경 통계

`git diff --stat`:

```text
 .../service/ProductLookupSheetSyncService.java     | 127 +++++++++++++++++----
 .../it/ProductLookupSheetSyncServiceIT.java        | 122 ++++++++++++++++++++
 2 files changed, 226 insertions(+), 23 deletions(-)
```

삭제 줄 수: **23**

커밋/push하지 않았고 공유 Docker 스택도 재기동하지 않았다.

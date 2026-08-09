# #978 D-1 S2 SOL 1차 적대검증 — PR #1139

## 판정

**차단 결함 1건. 머지 불가.**

HEAD `fb68321df714ca5c3b6a19a63fb527557079d56b`에서 롤백 캐시 잔존 결함 자체는 닫혔다. 그러나 캐시 적용을 `afterCompletion(STATUS_COMMITTED)`으로 옮기면서, 동시 실행의 DB 커밋 순서와 캐시 콜백 실행 순서가 엇갈릴 때 `MaterialPrice` DB보다 과거 hash가 캐시에 남는 회귀가 새로 도달했다. 그 뒤 과거 값과 같은 시트 입력은 `unchanged`로 영구 skip된다.

## 차단 결함 — 동시 커밋 콜백 역전으로 단가가 다시 영구 skip된다

### 도달 순서

초기 상태는 DB/cache 모두 `40,000`이다.

1. 동기화 T1이 단가 `45,000`을 처리하고 DB commit을 마친다. T1의 서비스 cache callback 직전에 선등록한 검증 synchronization으로 T1만 정지시켰다.
2. 동기화 T2가 단가 `50,000`을 처리하고 DB commit 후 callback까지 마쳐 DB/cache를 `50,000`으로 만든다.
3. T1 callback을 재개하면 더 늦게 `45,000` hash를 cache에 쓴다.
4. 최종 상태는 DB `50,000`, cache `45,000`이다.
5. 시트 `45,000`으로 다시 동기화하면 `getHash()`가 `45,000` hash를 반환해 `unchanged=1`이 되고, DB는 잘못된 `50,000`에 그대로 남는다.

임시 IT 결과:

```text
HEAD fb68321df
concurrent_commit과_callback_순서가_엇갈리면_cache가_DB보다_과거가되어_다음_sync가_영구_skip한다
PASS

단정:
DB price = 50000
next sheet price = 45000
next result.unchanged = 1
DB price after next sync = 50000
```

이 테스트는 결함 상태를 단정하므로 PASS가 결함 재현을 뜻한다.

정확한 부모 `1ba6dd3d43e6da3ff01bb56d051adf03b9963b95`에서 같은 하네스를 실행한 결과는 다음과 같이 RED였다.

```text
PARENT_CONCURRENCY_XML tests=1 failures=1 errors=0 skipped=0 time=0.347
expected: 1
 but was: 0
```

부모에서는 마지막 T2가 트랜잭션 안에서 cache를 `50,000`으로 썼으므로 다음 `45,000` 입력을 `unchanged`로 오인하지 않고 재처리했다. 따라서 위의 정확한 interleaving은 이 PR이 새로 만든 회귀다.

원인 좌표:

- `ProductLookupSheetSyncService.java:496-500` — commit 뒤 `registeredState.applyTo(lastKnownRowHash)`
- `ProductLookupSheetSyncService.java:540-542` — version/commit-order guard 없이 remove/put 적용
- `ConcurrentHashMap`은 개별 연산의 thread safety만 제공하며 DB commit과 callback의 인과 순서를 보존하지 않는다.

## 1. 정상 동기화와 fix 전후 카운트

동일한 기존 IT `syncAll_3탭_insert_unchanged_update_softDelete와_null_정직성을_보장한다`를 PR의 정확한 부모와 HEAD에서 각각 실제 실행했다.

| 실행 | SHA | Gradle 전체 | test case | 결과 |
|---|---|---:|---:|---|
| fix 전 | `1ba6dd3d4` | 57.230초 | 0.574초 | 1/1 pass |
| fix 후 | `fb68321df` | 56.827초 | 0.513초 | 1/1 pass |

두 실행이 동일하게 단정한 수치:

```text
1차: inserted=9, updated=0, softDeleted=0
     material skipped=5
2차 동일 입력: inserted=0, updated=0, softDeleted=0, unchanged=9
3차 변경 입력: material updated=1, branch softDeleted=1
```

따라서 변경 없는 행의 `unchanged` 판정은 살아 있고, 이 fixture에서 전건 재기록은 발생하지 않았다. 세 탭 동기화도 끝까지 반환했다. 이 fixture 실행 시간에서는 fix 전 대비 성능 붕괴가 도달하지 않았다.

HEAD의 기존 `ProductLookupSheetSyncServiceIT` 전체도 fresh 실행했다.

```text
tests=7 failures=0 errors=0 skipped=0 test-time=0.937초
Gradle elapsed=73.446초
```

## 2. 롤백 결함 폐쇄

### MaterialPrice

기존 IT가 실제 repository save 예외를 둘째 행에 주입했다.

```text
초기 DB: D2=40000, D3=75000
변경 시트: D2=45000, D3=80000
1차 rollback 뒤 DB D2=40000
2차 rollback 뒤 DB D2=40000
실패 제거 후 retry: updated=2, unchanged=0, DB D2=45000
```

연속 두 번 rollback 뒤에도 첫 행이 다시 처리되고, 성공한 뒤에만 성공 hash가 채워지는 경로가 도달했다.

### ODU / 분기계산

임시 IT에서 각 탭의 둘째 `save`에 런타임 예외를 주입했다.

```text
ODU:  rollback 1회 → cache에 첫/둘째 key 없음
      rollback 2회 → cache 비어 있음
      성공 retry inserted=2 → 동일 입력 unchanged=2

branch: rollback 1회 → cache에 branch:1509/2512 없음
        rollback 2회 → cache에 staged key 없음
        성공 retry inserted=2 → 동일 입력 unchanged=2
```

세 `@Transactional` 진입점 `:126`, `:191`, `:254` 모두 `putHash/getHash/removeHash` 경로를 사용한다. soft-delete cache 제거도 각각 `:334`, `:348`, `:361`에서 `removeHash`를 거친다.

다만 탭별 의미는 같지 않다. `MaterialPrice`만 hash payload에 natural key 밖의 변경 가능한 금액/표시값이 있어 stale hash가 active DB update를 영구 skip할 수 있다. ODU는 hash payload 전체가 natural key이고, branch는 natural key 외 저장값이 항상 null이라 현재 update 분기는 사실상 도달하지 않는다. ODU/branch의 rollback 검증은 신규 insert의 staged hash 폐기와 성공 후 cache 생존을 밟았다.

## 3. 한 탭 실패 / 다른 탭 성공

기존 `syncAll_한탭_롤백시_나머지두탭_hash는_커밋된다`를 실행했다.

```text
material 저장 예외
failedTabs=1, successfulTabs=2
ODU unchanged=1
branch unchanged=1

material 실패 제거 후 retry
material updated=2
ODU unchanged=1
branch unchanged=1
```

한 탭의 rollback이 다른 두 탭의 commit hash를 지우지 않고 `syncAll()`이 끝까지 진행하는 조합은 도달했다.

## 4. 커밋 후 콜백 실패

`lastKnownRowHash`를 첫 `put`에서 예외를 내는 임시 map으로 교체해 실제 `afterCompletion` 예외를 발생시켰다.

```text
ERROR TransactionSynchronizationUtils:
TransactionSynchronization.afterCompletion threw exception
IllegalStateException: injected afterCompletion cache failure
```

도달 결과:

- DB 단가 `45,000` commit은 유지됐다.
- 호출자에게 예외는 전파되지 않았다. Spring transaction synchronization 로그에만 남았다.
- 정상 map 복원 뒤 같은 입력의 다음 sync는 `updated=1`, `unchanged=0`으로 재처리됐다.
- 한 행 실패 시 영구 skip은 발생하지 않았지만 불필요한 재기록 1회가 발생했다.

## 5. soft-delete / restore

실행 결과:

- Material: soft-delete 후 재등장 시 같은 row id로 restore.
- ODU: natural key 변경으로 기존 행 soft-delete 후 원래 key 재등장 시 같은 row id로 restore.
- Branch: `2512` soft-delete commit 뒤 `branch:2512` cache 제거, 재등장 시 같은 row id로 restore, 그 다음 동일 실행은 `unchanged=2`.

삭제 cache 제거와 `markRestored()` 경로 사이에서 부활 행이 stale hash 때문에 건너뛰는 현상은 위 세 탭 fixture에서 도달하지 않았다.

## 증거 무결성 예외

- 최초 기본 Gradle 홈 실행은 테스트 전 `stop command received`로 외부 종료되어 판정에서 제외했다.
- 격리 Gradle 홈 첫 실행은 `test UP-TO-DATE`여서 판정에서 제외하고 모두 `--rerun-tasks`로 다시 실행했다.
- 임시 하네스 작성 중 init API 오류 1회, spy가 실제 save를 우회한 오류 1회, Mockito 호출 방식/이름 충돌 오류가 있었다. 모두 제품 테스트 진입 전 또는 하네스 자체 원인으로 확인했고, 수정된 하네스의 fresh 4/4 결과만 판정에 사용했다.
- 부모 비교는 처음 전진한 `origin/main`을 가리켜 무효 처리했고, PR의 정확한 부모 `1ba6dd3d4`로 다시 고정해 실행했다.

## 실행 제약 준수

- 공유 Docker compose stack 재기동 없음.
- 실 Google Sheet read/write 없음. `GoogleSheetsClient` mock만 사용.
- 운영/공유 DB 직접 write 없음. IT가 띄운 격리 Testcontainers PostgreSQL만 repository 동작과 test cleanup에 사용.
- 평문 운영 비밀번호 출력 없음.
- 코드 수정, commit, push 없음.

## 생성 파일

유지:

- `docs/dev-reports/2026-08-08-978-d1-s2-sol-adversarial-review.md`

검증 중 생성 후 라운드 끝에 삭제:

- `.adversarial-tmp/init.gradle`
- `.adversarial-tmp/init-baseline.gradle`
- `.adversarial-tmp/src/test/java/com/samhanair/logis/product/it/ProductLookupSheetSyncAdversarialIT.java`
- 임시 detached worktree `C:\dev\Samhan-Public\.claude\worktrees\t978-baseline-compare`
- 전용 Gradle cache `.gradle-user-t978`

## 이 라운드가 보지 않은 것

- 실 운영 scheduler/admin 요청이 실제로 겹치는 빈도와 운영 thread scheduling.
- 실 Google Sheet 전체 행 수에서의 wall-clock/메모리 성능. 성능 비교는 동일 소형 IT fixture만 사용했다.
- product-service 전체 test suite. 대상 IT 7개와 임시 적대 IT 4개만 실행했다.
- 다중 JVM/replica 사이 cache 일관성. 이 cache는 JVM-local이다.
- JVM `OutOfMemoryError`, 프로세스 종료처럼 callback 재시도 자체가 불가능한 장애.
- 세 행 이상 callback의 중간 put에서 실패해 부분 적용되는 순서별 모든 조합.

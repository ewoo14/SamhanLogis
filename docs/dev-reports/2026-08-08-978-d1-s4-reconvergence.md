# #978 D-1 S4 재수렴 적대검증 — PR #1139

## 판정

**도달 결함 0건. 머지 차단 없음.**

HEAD `b155584b844ee46017908fe66b5ffe0a43e4eac7`에서 S1의 롤백 결함과 S2의 동시 실행 회귀는 모두 재현되지 않았다. 캐시·transaction callback이 제품 코드에서 없어져 S2의 stale callback 상태는 생성되지 않았고, 같은 결정적 interleaving 뒤 다음 sync는 DB 값 `50,000`을 시트 값 `45,000`으로 다시 처리했다.

실 Google Sheet 공개 read 데이터를 격리 PostgreSQL에 넣어 정확한 부모 `fb68321df714ca5c3b6a19a63fb527557079d56b`와 비교했다. 부모와 HEAD의 탭별 `inserted / updated / unchanged / softDeleted / skipped`가 같았고, HEAD에서 늘어난 `updated`는 0건이었다.

## 1. 전제와 변경 표면

- 검증 HEAD: `b155584b8`
- 비교 부모: `fb68321df`
- 브랜치: `fix/978-sync-cache-rollback`
- S3 제품 diff: `ProductLookupSheetSyncService`에서 `lastKnownRowHash`, `HashCacheTransactionState`, `putHash/getHash/removeHash`, `TransactionSynchronization`, `afterCompletion` 제거.
- 정적 전수: active lookup 3곳, DB hash 비교 분기 3곳, `markRestored()` 3곳, 신규 `seed()` 3곳. Material/ODU/Branch가 모두 같은 `active 없음 → restore 또는 insert / active 있음 → DB hash 비교 / 누락 → soft-delete` 형태다.
- 제품 서비스에서 cache/callback 식별자 검색 결과 0건. `clearHashCacheForTest()`는 기존 테스트 호환용 no-op만 남았다.

## 2. 실 데이터 카운트 — 부모와 HEAD

실 시트는 쓰지 않고 다음 공개 CSV를 읽었다.

- `싱글 자재가격`: CSV 29행, 유효 28행
- `추천실외기`: CSV 25행, 유효 natural key 31개
- `분기계산`: CSV 100행, 유효 6행, blank skip 93행

공유 `product_db`에는 SELECT만 수행했다. active 수는 Material 28, ODU 32, Branch 6이었다. 시트와 DB key 차집합은 ODU의 `MULTI_HEATING_COOLING|5.5||4HP` 1건이었다. 따라서 그 현재 stale key를 격리 DB 초기 상태에 포함한 뒤 실제 시트 입력을 적용했다.

| 단계 | SHA | Material | ODU | Branch | 합계 |
|---|---|---|---|---|---|
| 초기 적재 | 부모 | I28 | I32 | I6, S93 | I66, U0, N0, D0, S93 |
| 현재 실 시트 sync | 부모 | N28 | N31, D1 | N6, S93 | I0, U0, N65, D1, S93 |
| 다음 동일 sync | 부모 | N28 | N31 | N6, S93 | I0, U0, N65, D0, S93 |
| 초기 적재 | HEAD | I28 | I32 | I6, S93 | I66, U0, N0, D0, S93 |
| 현재 실 시트 sync | HEAD | N28 | N31, D1 | N6, S93 | I0, U0, N65, D1, S93 |
| 다음 동일 sync | HEAD | N28 | N31 | N6, S93 | I0, U0, N65, D0, S93 |

표의 I/U/N/D/S는 각각 inserted/updated/unchanged/softDeleted/skipped다. 부모 대비 HEAD의 `unchanged` 감소 0건, `updated` 증가 0건, insert/delete/skip 차이 0건이다.

공유 DB 표현도 SELECT로 확인했다.

- Material price 28건과 ODU capacity는 DB에서 scale 2다.
- 이름/outdoor HP/branch code 앞뒤 공백 0건.
- 빈 문자열 option/formula/outdoor HP 0건; 값 없음은 null이다.
- Branch description은 6/6 null이다.

## 3. 정규화가 판정을 뒤집는가

격리 PostgreSQL에 같은 행을 실제 저장하고 다음 입력을 순서대로 적용했다.

```text
1차: name="  Mixed Case  ", price="45,000.00", option="   ", formula=""
2차: name="Mixed Case",   price="45000",     option="",    formula="   "
3차: name="mixed case",   price="45000.0",   option="",    formula=""
```

HEAD 결과:

```text
1차 inserted=1
2차 unchanged=1, updated=0
3차 updated=1, unchanged=0
```

Decimal scale, trim, 공백/null 표현은 같은 값으로 판정했고 대소문자 변경은 그대로 변경으로 판정했다.

같은 fixture를 부모에서 실행하면 2차가 `updated=1`이었다. 부모의 sheet hash는 `BigDecimal(45000.00)`과 `BigDecimal(45000)` 표현을 다르게 보았고, HEAD가 이 무의미한 update 1건을 제거했다. 정규화 때문에 부모보다 `updated`가 늘어나는 방향은 도달하지 않았다.

## 4. 원래 결함과 S2 회귀

### 롤백 뒤 재처리

HEAD의 기존 `ProductLookupSheetSyncServiceIT` fresh 결과는 8/8 pass, failures/errors/skipped 0, test time 1.032초였다.

Material 연속 두 번 rollback fixture의 도달 결과:

```text
초기 DB D2=40000
변경 입력 D2=45000, 둘째 save 예외
rollback 1회 뒤 D2=40000
rollback 2회 뒤 D2=40000
예외 제거 retry: updated=2, unchanged=0, D2=45000
```

S2에서 별도 하네스로 확인했던 다른 두 탭도 같은 실패 위치로 다시 실행했다.

```text
ODU: 둘째 save 실패 → DB 0건 → retry inserted=2 → 동일 입력 unchanged=2
Branch: 둘째 save 실패 → DB 0건 → retry inserted=2 → 동일 입력 unchanged=2
```

### S2의 동일 결정적 동시성 하네스

S2와 같은 latch 순서를 쓰는 기존 테스트
`concurrent_commit과_afterCompletion_순서가_엇갈려도_다음_sync는_DB를_기준으로_재처리한다`
를 그대로 fresh 실행했다.

```text
T1: 45000 DB commit 뒤 검증 callback에서 정지
T2: 50000 commit 완료
T1 검증 callback 재개
최종 DB 50000
다음 시트 45000 → updated=1, unchanged=0, 최종 DB 45000
```

HEAD에서 1/1 pass, 0.053초였다. 제품 서비스 callback은 없지만 하네스가 등록한 검증 callback으로 S2의 commit/callback 역전 순서를 그대로 만들었다.

## 5. 캐시 제거 표면과 무훼손

### 성능

실 시트의 유효 65행을 이미 적재한 격리 PostgreSQL에서 동일 sync를 15회 반복했다. 각 실행은 세 탭 repository 조회, sheet hash, 부모의 cache lookup 또는 HEAD의 DB entity hash, 누락 scan을 실제 수행했다.

| SHA | 반복 | median | 최대 표본 | 합계 | 전체 test case |
|---|---:|---:|---:|---:|---:|
| 부모 `fb68321df` | 15 | 83ms | 114ms | 1,225ms | 4.102초 |
| HEAD `b155584b8` | 15 | 87ms | 118ms | 1,314ms | 4.215초 |

HEAD는 최신 대조에서 median +4ms, 반복 합계 +89ms였다. 1회 sync는 118ms 안에 끝났고 timeout/미완료/초선형 증가는 도달하지 않았다. 앞선 warm 반복에서는 HEAD median 73~85ms, 부모 81~88ms로 실행 순서보다 작은 범위에서 교차했다. 정기 sync가 끝나지 않는 성능 결함은 도달하지 않았다.

### restore / insert / delete

- Material: soft-delete 후 같은 row id로 restore — pass.
- ODU: natural key 변경으로 soft-delete 후 원래 key가 같은 row id로 restore — pass.
- Branch: `2512` soft-delete 후 같은 row id로 restore, 다음 동일 입력 unchanged — pass.
- DB 행 없음: 실 데이터 최초 적재에서 Material 28, ODU 32, Branch 6 insert — 부모/HEAD 동일.
- 삭제: 현재 공유 DB에만 남은 ODU key 1건을 격리 재현해 다음 sync `softDeleted=1`, 그 다음 `0` — 부모/HEAD 동일.

### 기존 조합

- 정상 3탭: 1차 inserted=9, 2차 unchanged=9, 변경 입력 Material updated=1/Branch softDeleted=1 — pass.
- 한 탭 rollback + 다른 두 탭 성공: failedTabs=1/successfulTabs=2, retry Material updated=2, ODU/Branch unchanged 유지 — pass.
- 연속 rollback: Material 두 번 실패 뒤 두 행 모두 재처리 — pass.
- 혼합 성공/실패: `syncAll()`이 실패 탭을 기록하고 나머지 탭을 완료 — pass.
- soft-delete/restore: 세 탭 모두 pass.
- callback 실패: 제품 callback 자체가 제거돼 해당 실패 주입점이 더 이상 존재하지 않는다. `TransactionSynchronization`/`afterCompletion`/cache apply 경로 검색 0건이므로 S2의 callback 실패 표면은 비도달이다.

## 6. 증거 무결성 예외와 실행 제약

- 첫 Gradle 호출들은 셸 도구가 5초에 timeout됐지만 자식 프로세스는 계속 실행됐다. 과거 XML은 사용하지 않았고, 각 프로세스 종료 뒤 새 `LastWriteTime`의 XML만 읽었다.
- 실-data 하네스 최초 1회는 sheet-id mock 설정 누락으로 세 탭 0건을 반환했다. 제품 테스트 진입 전 하네스 원인을 확인했고 그 실행은 전부 폐기했다. 기존 IT와 같은 `google.sheets.sheet-id=test-sheet-id`를 적용한 fresh 결과만 사용했다.
- 부모 정규화 실행의 1 failure는 HEAD 계약(`updated=0`)을 부모에 적용한 의도적 차등 단정이다. 실패 전 출력 `normalized=U1/N0`만 부모 표현 차이 증거로 사용했고, 부모 실 데이터 카운트/성능은 별도 1/1 pass 실행에서 취했다.
- 공유 Docker compose stack 재기동 없음.
- 실 Google Sheet 쓰기 없음. 공개 CSV read만 수행.
- 공유 `product_db`는 SELECT만 수행. sync/rollback 테스트 write는 매 실행 새 Testcontainers PostgreSQL에만 수행.
- 평문 운영 비밀번호 출력 없음.
- 제품 코드 수정, commit, push 없음.
- 라운드 종료 시 임시 worktree, 전용 Gradle cache, Gradle/test Java 프로세스 회수 완료.

## 7. 생성 파일

최종 유지:

- `docs/dev-reports/2026-08-08-978-d1-s4-reconvergence.md`

검증 중 생성 후 삭제:

- `.adversarial-tmp/init-s4.gradle`
- `.adversarial-tmp/src/test/java/com/samhanair/logis/product/it/ProductLookupSheetSyncS4RealDataIT.java`
- `.adversarial-tmp/src/test/java/com/samhanair/logis/product/it/ProductLookupSheetSyncS4RollbackIT.java`
- 임시 detached worktree `C:\dev\Samhan-Public\.claude\worktrees\t978-s4-parent`
- 전용 Gradle cache `.gradle-user-t978-s4`와 부모 worktree의 `.gradle-user-t978-s4-parent`
- Gradle `build/test-results` XML/HTML 산출물(ignored)

## 이 라운드가 보지 않은 것

- 실제 운영 scheduler와 admin 수동 sync가 겹치는 빈도 및 다중 JVM/replica 실행. 제품 로컬 cache는 없어졌지만 DB 행 수준 동시 update 정책 자체는 이번 PR 범위가 아니다.
- 인증이 필요한 Google Sheets API 경로의 quota/timeout. 데이터는 같은 문서의 공개 CSV read로 가져왔다.
- 65 유효행보다 큰 미래 시트에서의 장시간 soak/메모리 profile. 성능 대조는 현재 실 유효행 65개를 15회 반복했다.
- JVM 강제 종료, PostgreSQL 연결 단절, 디스크 고갈 같은 인프라 장애.
- product-service 전체 test suite. HEAD의 lookup IT 8건, 실-data IT 2건, ODU/Branch rollback IT 2건과 주어진 CI 40/40 green을 범위로 삼았다.

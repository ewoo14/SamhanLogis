# PR #1124 / 이슈 #1123 — S30 낙관적 잠금 fix 보고서

작성일: 2026-08-08  
작업 브랜치: `feat/1123-closed-date-guard` / 기준 HEAD `dd8eb2c15`

## 1. 원인 판정

판정은 **① 이 PR이 만든 결함**이다.

근거는 다음과 같다.

1. S27 이전 코드가 있는 별도 기준 경로 `C:\dev\Samhan-Public`에서 동일한 `SlipUpdateIT`를 실행한 결과는 `BUILD SUCCESSFUL`이었다.
2. S27 브랜치에서는 같은 테스트가 12건 중 11건 통과하고 S2b 두 번째 PUT만 실패했다.
3. 기준 코드에는 `SlipUpdateService`의 `closedDateGuard`와 5인자 `update(..., actorRole)` overload가 없고, S27 코드에는 두 요소가 추가되어 있다.
4. S30 브랜치의 `SlipUpdateIT`는 stale timestamp를 매 PUT 직전에 상세 GET으로 재조회한다. 테스트 클래스 전체가 `@Transactional`이라 직전 PUT의 `auditLogService.recordBatch`가 수정한 `revisionCount`가 같은 persistence context에 남는다. S27 가드의 날짜/권한 repository 조회가 `AUTO flush`를 유발하고, 그 flush가 `modifiedAt/version`을 먼저 전진시킨다. 그 결과 아직 사용자 요청 시점에는 유효한 `updatedAt`이 `verifyVersion`에서 자체 stale로 판정된다.

따라서 ② 선재 결함이나 ③ stale 테스트가 아니다. 테스트가 stale token을 보내는 것이 아니라, S27의 읽기 가드 조회 순서가 테스트 트랜잭션의 미반영 audit mutation을 먼저 flush한 것이다.

## 2. 변경

`SlipUpdateService.update`에서 다음 순서로만 수정했다.

```text
requireLineIdContract
→ load
→ verifyVersion
→ closedDateGuard.assertAllowed
→ 나머지 validation 및 mutation
```

낙관적 잠금 검증을 완화하거나 재시도하지 않았다. 마감일 가드는 유지되며, `verifyVersion`을 통과한 요청만 가드 조회와 mutation 단계로 진행한다.

## 3. RED-A · RED-B · GREEN 원문

### RED-A — 원문

```text
SlipUpdateIT > S2b: 매입 감리주소만 수정해도 EDIT revision 과 header.supervisionAddress diff 를 남긴다 FAILED
    java.lang.AssertionError: Status expected:<200> but was:<409>
    at SlipUpdateIT.java:418

12 tests completed, 1 failed
Response:
{"success":false,"code":"SLIP_OPTIMISTIC_LOCK_CONFLICT",
 "message":"전표가 이미 변경되었습니다. 최신 내용으로 다시 확인해 주세요."}
```

기준 경로(`origin/main`과 동일한 별도 기준 작업 경로)의 같은 테스트:

```text
BUILD SUCCESSFUL
```

### RED-B — 진짜 동시 수정, 원문

신규 `SlipUpdateConcurrencyIT`가 두 요청을 같은 `updatedAt`으로 만들고, 둘 다 `productClient.lookup` 경계까지 도달한 뒤 동시에 저장하도록 고정했다. 테스트의 핵심 단정은 다음과 같다.

```java
assertThat(statuses).containsExactlyInAnyOrder(200, 409);
```

실행 결과:

```text
SlipUpdateConcurrencyIT > 같은_버전으로_동시_put하면_정확히_하나만_성공하고_패자는_409다()
BUILD SUCCESSFUL
tests=1, failures=0, errors=0, skipped=0
```

즉 같은 버전 동시 PUT의 패자는 계속 `409`이며, 잠금을 느슨하게 하지 않았다.

### 동시 GREEN — 원문

```text
SlipUpdateIT: tests=12, failures=0, errors=0, skipped=0
SlipUpdateConcurrencyIT: tests=1, failures=0, errors=0, skipped=0
BUILD SUCCESSFUL
```

## 4. 새로 가능해진 상태·동시성 조합과 결과

| 조합 | 결과 |
|---|---|
| 최신 `updatedAt` 단일 PUT | 200, 기존 수정 동작 유지 |
| stale `updatedAt` PUT | 409 `SLIP_OPTIMISTIC_LOCK_CONFLICT` |
| 같은 `updatedAt` 두 요청 동시 PUT | 하나 200, 하나 409 |
| S2b처럼 같은 `@Transactional` context에서 PUT 후 재조회·재PUT | S30 수정 후 200, EDIT revision/diff 생성 |
| 마감되지 않은 날짜 + MASTER | 통과 |
| 마감된 날짜 + 일반 권한자 | 차단 |
| 마감된 날짜 + 예외 권한자/MASTER | 통과 경로 유지 |
| lineId 계약 누락 | 기존 계약 테스트로 차단 |

실행으로 밟은 조합:

- RED-A S2b 단독 감리주소 수정: 수정 전 409 → 수정 후 200.
- stale timestamp: 409 단정 유지.
- 두 worker의 동일 버전 동시 PUT: 200/409 유지.
- `SlipClosedDateGuardTest` 6건 및 S27 경로 계약 2건: 전부 통과.

## 5. 변경 식별자 grep 전수 확인

대상 소스에서 다음 식별자를 전수 검색했다.

```text
closedDateGuard.assertAllowed: SlipUpdateService 1건 + S27 contract assertion 2건
verifyVersion: SlipUpdateService 호출 1건 + 메서드 정의 1건
SLIP_OPTIMISTIC_LOCK_CONFLICT: stale IT assertion 1건 + 서비스 ErrorCode 매핑 1건
동시성 회귀 테스트: SlipUpdateConcurrencyIT 1건
```

핵심 확인점은 `verifyVersion`이 `closedDateGuard.assertAllowed`보다 앞에 있다는 것이다.

## 6. 변경 파일을 참조하는 테스트 전부 실행

변경 생산 파일 `SlipUpdateService.java`와 S27 경로를 참조하는 테스트를 좁히지 않고 다음 7개 suite를 실행했다.

```text
SlipUpdateIT                         12/12
SlipUpdateConcurrencyIT               1/1
SlipUpdateServiceTest                 4/4
SlipUpdateLineIdContractTest         14/14
S27MutationPathContractTest           2/2
SalesSlipUpdateServiceTest            4/4
SlipClosedDateGuardTest               6/6
-----------------------------------------
합계                                 43/43
failures=0, errors=0, skipped=0
BUILD SUCCESSFUL
```

모듈 전체 `:services:slip-service:test`도 시도했으나 240초 제한에서 Gradle test worker가 종료되지 않아 완료 증거로 사용하지 않았다. 이후 남은 worker를 회수하고 위 참조 suite 전체를 재실행해 43/43을 확인했다.

## 7. 데이터 무결성 및 신규 파일

- 기존 전표의 상태 전이·수정·삭제를 실행하지 않았다.
- DB 직접 INSERT/UPDATE/DELETE를 실행하지 않았다.
- 신규 동시성 테스트가 생성한 전표 memo에는 `S30-1123`을 기록했다.
- 기존 QA 잔재는 삭제하지 않았다.
- 재배포·Docker 재기동·git 명령은 실행하지 않았다.

신규 파일:

1. `services/slip-service/src/test/java/com/samhanair/logis/slip/it/SlipUpdateConcurrencyIT.java`
2. `docs/dev-reports/2026-08-08-1123-s30-optimistic-lock.md`

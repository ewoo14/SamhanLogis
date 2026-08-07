# S11 — RED-A 결정적 경합 테스트

## 채택한 방법과 이유

기존 RED-A는 `ExecutorService`에서 두 restore 요청을 동시에 시작하고, 실제 트랜잭션이 겹쳐 `200·409`가 되기를 기대했다. CI의 스케줄링이 두 요청을 겹치게 하지 못하면 두 번째 요청도 row lock을 정상 획득해 `200·200`이 될 수 있으므로, 타이밍 의존 플레이키 테스트였다.

이번 변경에서는 `PartnerOrderRevisionRestoreIT`가 `DataSource`에서 별도 JDBC 커넥션을 열고 자동 커밋을 끈 뒤 다음 SQL로 대상 row를 직접 잠근다.

```sql
SELECT * FROM partner_orders WHERE id = ? FOR UPDATE
```

그 미커밋 트랜잭션을 유지한 상태에서 restore 엔드포인트를 한 번 호출해 `409`를 확인한다. 이후 테스트 커넥션을 rollback하여 락을 풀고 같은 엔드포인트를 다시 호출해 `200`과 RESTORE revision 1건을 확인한다.

이 방식은 요청 간 경합을 우연히 기다리지 않고, `FOR UPDATE NOWAIT`의 실제 계약인 “row가 잠겨 있으면 즉시 409”를 직접 재현한다. 동시 요청 2개와 13회 반복도 제거했으므로 테스트 풀과 컨테이너에 불필요한 부하를 주지 않는다. 서비스의 `FOR UPDATE NOWAIT` 구현과 FE 409 처리는 변경하지 않았다.

별도 커넥션을 사용한 이유는 테스트 락과 MockMvc 내부의 애플리케이션 트랜잭션이 같은 커넥션을 공유하면 경합이 재현되지 않기 때문이다. 실측에서 두 커넥션이 분리되어 `55P03`(could not obtain lock on row) 및 409가 확인됐다.

## RED-A 원문

테스트 표시명:

```text
RED-A: 잠긴 target 복원은 409, 잠금 해제 후 복원은 200과 RESTORE revision 1건
```

핵심 단언:

```java
try (Connection lockConnection = dataSource.getConnection()) {
    lockConnection.setAutoCommit(false);
    try (PreparedStatement lock = lockConnection.prepareStatement(
            "SELECT * FROM partner_orders WHERE id = ? FOR UPDATE")) {
        lock.setObject(1, orderId);
        try (var result = lock.executeQuery()) {
            assertThat(result.next()).isTrue();
        }
        assertThat(restoreStatus(orderId)).isEqualTo(409);
    }

    lockConnection.rollback();
    assertThat(restoreStatus(orderId)).isEqualTo(200);
    assertThat(revisionRepository.findByPartnerOrderIdOrderByRevisionNoDesc(orderId).stream()
            .filter(revision -> revision.getRevisionType() ==
                    PartnerOrderRevisionType.RESTORE))
            .hasSize(1);
}
```

## RED-B 원문

테스트 표시명:

```text
RED-B: 순차 복원 두 번은 각각 200이고 RESTORE revision 2건
```

핵심 단언은 변경하지 않았다.

```java
assertThat(restoreStatus(orderId)).isEqualTo(200);
assertThat(restoreStatus(orderId)).isEqualTo(200);
assertThat(revisionRepository.findByPartnerOrderIdOrderByRevisionNoDesc(orderId).stream()
        .filter(revision -> revision.getRevisionType() == PartnerOrderRevisionType.RESTORE))
        .hasSize(2);
```

따라서 사용자가 실제로 두 번 복원한 순차 요청은 계속 허용되고, RED-A의 잠금 경합만 결정적으로 별도 검증한다.

## IT 전건 로컬 실행 결과

실행 명령:

```powershell
.\gradlew :services:partner-order-service:test --tests com.samhanair.logis.partnerorder.revision.PartnerOrderRevisionRestoreIT
```

결과:

```text
BUILD SUCCESSFUL
tests=13, skipped=0, failures=0, errors=0
```

실행 중 PostgreSQL 16.14 Testcontainers에서 다음 RED-A 로그도 확인했다.

```text
SQLState: 55P03
ERROR: could not obtain lock on row in relation "partner_orders"
복원 대상 주문 락 경합
```

동일 실행에서 soft-delete 주문 복원 케이스7, RED-B 순차 복원, 상태별 409, 권한 403/MASTER bypass, revision 및 라인 정합 케이스가 모두 통과했다. 테스트 종료 시 Hikari pool shutdown completed 로그를 확인했으며, 이 작업에서 컨테이너를 재빌드하지 않았다.

## 신규 파일 목록

- `docs/dev-reports/2026-08-08-1110-s11-deterministic-contention-test.md`

기존 파일 변경:

- `services/partner-order-service/src/test/java/com/samhanair/logis/partnerorder/revision/PartnerOrderRevisionRestoreIT.java` — RED-A를 직접 row lock 방식으로 전환

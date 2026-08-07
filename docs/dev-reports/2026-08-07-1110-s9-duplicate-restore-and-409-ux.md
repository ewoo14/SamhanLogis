# #1110 S9 — 중복 RESTORE revision 및 409 UX

## 결론

- `PartnerOrder`에는 `@Version`이 있다. `lock_version`은 V5 migration에서 `NOT NULL DEFAULT 0`으로 추가된다.
- 기존 restore 경로에는 `findByIdForUpdate`가 없었다. 기존 S7의 `saveAndFlush` 409는 부모 row가 실제 UPDATE되어 @Version 충돌이 난 경우만 처리했다.
- 같은 target을 동시에 복원하면 두 요청이 모두 같은 스냅샷을 적용하고 RESTORE revision을 각각 삽입할 수 있었다. 실제 결함은 409 자체가 아니라 이 중복 revision이다.
- 주문 row를 `PESSIMISTIC_WRITE`로 잠그고, 잠금 대기 중 시작된 요청이 같은 target의 RESTORE를 이미 확인하면 409로 종료하도록 고쳤다. 첫 복원 commit 이후 시작한 순차 복원은 허용한다.
- FE는 `409 + Axios response.data.message`일 때만 업무 메시지를 표시한다. 500, 네트워크 오류, 409 원문 없음은 일반 실패 문구를 사용한다.

## 1. 잠금 구조 확정과 수정

### 기존 구조

```text
PartnerOrder
  @Version
  @Column(name = "lock_version", nullable = false)

V5__add_partner_order_lock_version.sql
  ALTER TABLE partner_orders ADD COLUMN lock_version BIGINT NOT NULL DEFAULT 0

restore
  findByIdIncludingDeleted(native, no lock)
  snapshot apply
  saveAndFlush(order)
  capture(RESTORE)
```

`PartnerOrderRevisionService.restore`에는 비관적 잠금 조회가 없었다. `@Version`은 존재하지만, 같은 target snapshot을 적용해 부모 row의 변경 충돌이 발생하지 않는 경우와 한 요청이 다른 요청의 commit 이후 읽는 경우에는 중복 revision을 막지 못한다.

### 고친 방법

`PartnerOrderRepository.findByIdIncludingDeletedForUpdate`를 추가했다.

```java
@Lock(LockModeType.PESSIMISTIC_WRITE)
@Query(value = "SELECT * FROM partner_orders WHERE id = :id", nativeQuery = true)
Optional<PartnerOrder> findByIdIncludingDeletedForUpdate(UUID id);
```

복원 트랜잭션은 다음 순서가 된다.

```text
transaction start timestamp
  → partner_orders SELECT ... FOR UPDATE
  → target revision 조회
  → 최신 revision이 같은 target RESTORE인지 확인
  → snapshot 적용
  → order flush + RESTORE revision insert
  → commit
```

잠금 대기 중이었던 요청은 잠금을 얻은 뒤 최신 revision이 같은 target RESTORE이고 그 생성 시각이 자기 transaction 시작 시각보다 늦으면 409를 받는다.

```text
"동시에 복원된 주문입니다. 다른 사용자의 복원이 먼저 완료되어 다시 조회해 주세요."
```

첫 복원 commit 후 시작한 요청은 이전 RESTORE의 생성 시각이 요청 시작보다 빠르므로 허용된다. 즉, 동시 중복은 차단하지만 사용자가 순차적으로 두 번 누른 복원은 차단하지 않는다. S7의 `saveAndFlush` `OptimisticLockingFailureException → 409` 경로도 유지한다.

## 2. FE 메시지 처리와 정보 노출 경계

`PartnerOrderVersionHistoryPanel`의 restore `onError`가 다음 조건만 통과시킨다.

```text
AxiosError && HTTP 409 && response.data.message가 비어 있지 않은 문자열
```

조건을 만족하면 백엔드 업무 메시지를 표시한다. 그 외에는 다음 고정 문구를 사용한다.

```text
주문 복원에 실패했습니다. 다시 시도해 주세요.
```

따라서 500 응답의 내부 원문, 네트워크 오류의 Axios 원문, 빈 409 응답은 화면에 노출되지 않는다.

## 3. FIFO 퇴출 후 재소비 판단

도달 가능하다. 한 화면이 열린 동안 서로 다른 권위 사건이 2,048개를 넘고, 그중 퇴출된 오래된 `commitId`가 재연결 backlog 또는 지연된 broker delivery로 다시 도착하면 재소비된다. 현재 InMemory broker에는 외부 replay 주입 표면이 없고 SSE 재연결 backoff/heartbeat만으로는 이 경로를 실측할 수 없다.

이번에는 고치지 않았다. 현재 창은 메모리 상한과 즉시/재연결 중복 방지 목적이며, 무제한 replay가 운영 요구가 되면 서버 event sequence 또는 retention보다 큰 dedupe window가 필요하다.

## 4. 판정 불가 잔여

| 항목 | 판정 | 근거 |
|---|---|---|
| 동일 commitId 실 broker 재주입 | 판정 불가 | 현재 InMemory broker에 외부 주입 HTTP/API가 없다. FIFO 단위 경계만 검증했다. |
| 생성·전환·outbox live RED-C | 판정 불가 | 외부 전표/재고 연동과 배포본 교체가 필요하며, 이번 작업은 컨테이너 재빌드 금지 조건이다. 결함 0으로 세지 않는다. |

## 5. RED-A / RED-B 결과

### RED-A

| 항목 | 결과 | 근거 |
|---|---|---|
| 동시 복원 | 코드 GREEN | 주문 row `PESSIMISTIC_WRITE` 직렬화 + 동일 target RESTORE 승자 1건/패자 409 정책. 순차 복원 허용 단위 테스트 포함. 실 배포 burst 재측정은 금지 조건으로 미실시. |
| 409 FE 메시지 | GREEN | 409 업무 message 표시 테스트 통과. |

### RED-B

- 순차 복원 두 번: GREEN — 순차 복원 허용 단위 테스트 통과.
- FIFO 창 안 중복 방지: S8 PASS 보존.
- 공유 Y.Doc snapshot 쓰기 금지: S8 PASS 보존. 이번 변경은 복원 API 오류 표시와 BE row lock만 다루며 Y.Doc에 snapshot을 쓰지 않는다.
- 다른 에러에서 백엔드 원문 비노출: GREEN — 500 원문 비노출 테스트 통과.
- S8 저장/협업저장/복원/삭제/상태전이 RED-C: 이번 라운드에는 기존 배포본을 교체하지 않고 재검증하지 않았다. 기존 PASS를 변경하지 않는 코드 범위이며, live 재측정 결과로 새 PASS를 주장하지 않는다.

## 6. 자동 검증

```text
.\gradlew.bat :services:partner-order-service:test \
  --tests 'com.samhanair.logis.partnerorder.revision.service.PartnerOrderRevisionServiceTest' \
  --console=plain
  BUILD SUCCESSFUL — 21 tests completed

npm exec -- vitest run \
  src/renderer/components/audit/partnerOrderRestoreErrorMessage.test.ts \
  --config vitest.config.ts
  2 tests passed
```

RED 단계에서 새 잠금 repository method와 FE helper가 없어 각각 컴파일/함수 호출 실패를 확인한 뒤 구현했다. 기존 테스트를 새 동작에 맞춰 단순히 약화하지 않았으며, 복원 경로의 repository stub만 실제 호출 계약에 맞게 변경했다.

## 7. 신규 파일 목록

- `clients/desktop/src/renderer/components/audit/partnerOrderRestoreErrorMessage.test.ts`
- `docs/dev-reports/2026-08-07-1110-s9-duplicate-restore-and-409-ux.md`

변경 파일:

- `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/repository/PartnerOrderRepository.java`
- `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/revision/service/PartnerOrderRevisionService.java`
- `services/partner-order-service/src/test/java/com/samhanair/logis/partnerorder/revision/service/PartnerOrderRevisionServiceTest.java`
- `clients/desktop/src/renderer/components/audit/PartnerOrderVersionHistoryPanel.tsx`

커밋, push, 컨테이너 재빌드는 하지 않았다. 다른 워크트리와 프로세스도 사용하지 않았다.

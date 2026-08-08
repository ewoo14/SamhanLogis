# #1110 S7 — bounded authority set 및 concurrent restore

## 결론

- `authorityCommitIdsRef`는 2,048개 FIFO deduper로 바꾸어 장시간 화면에서도 유한하게 유지한다.
- 같은 `commitId`는 FIFO 창 안에서 한 번만 소비한다. 창 밖으로 밀려난 ID는 다시 소비될 수 있다는 경계를 명시한다.
- 동시 복원에서 `saveAndFlush`가 던지는 `OptimisticLockingFailureException`을 409로 변환한다. 승자는 정상 완료되고, 패자는 “다른 사용자의 복원이 먼저 완료됨”을 알 수 있다.
- main 대조 결과 S3의 `afterCommit` publisher 추가는 잠금/영속화 동작을 바꾸지 않았다. concurrent restore 결함은 S3가 만든 것이 아니라 main에도 있던 선재 결함이다.
- 이번 세션의 기존 gateway는 S7 BE 이미지가 아니므로 live concurrent restore는 `200,200`이었다. 컨테이너 재빌드 금지 조건상 이를 새 코드의 live GREEN으로 판정하지 않았다.

## 1. RED-A① — authorityCommitIdsRef 상한과 RED-D 경계

### 고친 방법

`AuthorityCommitDeduper`가 `Set<string>`과 FIFO 배열을 함께 보관한다. 새 ID는 Set에 넣고 배열 뒤에 추가하며, 2,048개를 넘으면 가장 오래된 ID를 Set에서도 제거한다. 빈 ID는 소비하지 않는다.

```text
authorityCommitIdsRef = useRef(new AuthorityCommitDeduper())
consume(commitId) === false → invalidate 하지 않음
consume(commitId) === true  → 상세/버전/목록 invalidate
```

### 상한 근거

현재 SSE client의 재연결 backoff 상한은 60초이고 heartbeat 감시도 60초다. 2,048개는 최근 사건을 충분히 보존하면서 화면당 메모리 증가를 유한하게 만든다. 이 선택은 TTL보다 시계 의존성이 없고, 테스트와 동작 경계가 명확하다.

정확한 경계는 **2,048개의 서로 다른 authority 사건이 같은 mount에서 발생한 뒤**다. 그보다 오래된 ID가 재전달되면 다시 소비될 수 있다. 따라서 RED-D는 같은 ID의 즉시/재연결 중복처럼 FIFO 창 안의 중복에 대해 보장된다. 무제한 replay/backlog가 향후 도입되면 서버 event retention보다 큰 창 또는 서버 event sequence가 필요하다.

테스트 측정값: deduper 최대 크기 `3`으로 4개 사건을 넣었을 때 크기 `3`, 창 안 중복은 `false`, 퇴출된 `commit-1`은 다시 `true`였다. 기본 상한은 `2,048`이다.

## 2. RED-A② — concurrent restore 원인 대조와 처리

### main 대조

```text
main PartnerOrderRevisionService.restore:
  orderRepository.saveAndFlush(order)
  capture(... RESTORE ...)
  예외 변환 없음

HEAD S3 변경:
  capture 성공 뒤 authorityEventPublisher.publish(...)
  publisher는 transaction afterCommit에서만 broker.publish
  order load/lock/save 코드는 main과 동일
```

따라서 `afterCommit` 발행은 잠금을 건드리지 않고, 500의 원인이 아니다. main에도 `saveAndFlush`의 낙관적 잠금 예외를 사용자 응답으로 변환하는 처리가 없었다. S3가 관측 시점을 만들었을 뿐, 결함은 선재다.

### 고친 방법과 이유

`saveAndFlush`만 `OptimisticLockingFailureException`으로 감싸고 HTTP 409를 던진다.

- 이긴 트랜잭션은 예외 없이 계속되어 RESTORE revision과 authority event를 정상 완료한다.
- 진 트랜잭션은 이미 flush된 변경이 전체 `@Transactional` 경계에서 rollback되고 409를 받는다.
- 500 대신 재조회 후 판단할 수 있는 한국어 이유를 전달한다.
- 재시도는 복원 대상이 이미 바뀐 상태에서 임의로 다시 복원할 위험이 있어 선택하지 않았다.

단위 RED는 `saveAndFlush`에 `ObjectOptimisticLockingFailureException`을 주입해 409와 이유를 확인했고, 수정 후 통과했다.

## 3. RED-A③~④ / RED-B / RED-C 라이브 및 검증

### 라이브 결과

| 항목 | 결과 | 근거 |
|---|---|---|
| S6 3세션 수렴·미저장 초안·재연결 | PASS | headless Playwright `3 passed (32.9s)` |
| 직접 저장·상태전이·삭제/복원 | PASS | 동일 실행의 경로별 RED-C |
| 동시 복원 500 금지 | 배포본 관측 `200,200` | 현재 gateway가 S7 BE 이미지가 아님. 기존 S6 하네스 결과이며 새 코드 GREEN으로 세지 않음 |
| 공유 Y.Doc snapshot 쓰기 금지 | PASS | authority handler는 invalidate만 수행하며 Y.Doc/snapshot API 호출 없음; S6 draft 보존 유지 |
| 실 broker 사건 전달 | PASS | live 협업 저장/복원/상태전이에서 열린 세션들의 authority 후속 GET/수렴 확인 |
| RED-D 동일 commitId 실 broker 재주입 | 미실시(환경 차단) | dev 서비스가 InMemory broker이고 publish 주입 HTTP endpoint가 없음. Redis channel도 사용하지 않음 |
| 생성·전환·outbox live RED-C | 미실시(환경 차단) | 현재 배포본 교체/외부 전표·재고 산출을 요구하며 컨테이너 재빌드 금지 조건과 충돌 |

실 broker 중복 재주입은 이번 코드의 FIFO 단위 테스트로 경계를 닫았지만, 요청한 “실 broker 재주입” 자체는 현재 프로세스의 공개 수단이 없어 닫지 못했다. 이를 PASS로 보고하지 않는다.

### 자동 검증

```text
npx vitest run src/renderer/components/collab/authorityCommitDeduper.test.ts --config vitest.config.ts
  2 tests passed

.\gradlew.bat :services:partner-order-service:test \
  --tests 'com.samhanair.logis.partnerorder.revision.service.PartnerOrderRevisionServiceTest' --console=plain
  BUILD SUCCESSFUL — 19 tests completed

headless Playwright S6 live
  3 passed (32.9s)
  concurrent restore observed statuses=200,200; 500 없음
```

## 변경 파일과 신규 파일 목록

변경:

- `clients/desktop/src/renderer/components/collab/PartnerOrderCollaborationPanel.tsx`
- `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/revision/service/PartnerOrderRevisionService.java`
- `services/partner-order-service/src/test/java/com/samhanair/logis/partnerorder/revision/service/PartnerOrderRevisionServiceTest.java`

신규:

- `clients/desktop/src/renderer/components/collab/authorityCommitDeduper.ts`
- `clients/desktop/src/renderer/components/collab/authorityCommitDeduper.test.ts`
- `docs/dev-reports/2026-08-07-1110-s7-bounded-set-and-concurrent-restore.md`

S6에서 이미 존재하던 미추적 QA 산출물은 이 세션의 신규 파일 목록에 포함하지 않았고 수정하지 않았다. commit/push, 컨테이너 재빌드, 다른 워크트리 사용은 하지 않았다.

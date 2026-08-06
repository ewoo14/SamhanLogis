```text
git -C . rev-parse --show-toplevel     # D:/dev/Samhan-Public/.claude/worktrees/w1057
git -C . branch --show-current         # feat/874-set-riusage-global-dc
git -C . rev-parse HEAD                # 01955407c3ea427a4818d8752e5f67db3d931188 이어야 함
```

# R41 SOL 적대 재수렴 — R40 비동기 알림·잠금 409

## 실행 환경

### 무결성 필드

| 필드명 | 실측값 |
|---|---|
| `integrity_toplevel` | `D:/dev/Samhan-Public/.claude/worktrees/w1057` |
| `integrity_branch` | `feat/874-set-riusage-global-dc` |
| `integrity_head_start` | `01955407c3ea427a4818d8752e5f67db3d931188` |
| `integrity_expected_head` | `01955407c3ea427a4818d8752e5f67db3d931188` |
| `integrity_status_before` | clean |
| `r40_parent` | `4697ae7b561ac89addcae1a3d7f435a52b67a258` |

HEAD가 요구값과 일치했으므로 검증을 계속했다.

### 컨테이너 필드

| 필드명 | 실측값 |
|---|---|
| `slip_service_name` | `/samhan-slip-service` |
| `slip_service_created` | `2026-08-05T02:50:44.702471161Z` |
| `slip_service_started` | `2026-08-05T02:51:02.147121178Z` |
| `api_gateway_name` | `/samhan-api-gateway` |
| `api_gateway_created` | `2026-08-05T02:50:37.64267995Z` |
| `api_gateway_started` | `2026-08-05T02:50:51.017973805Z` |
| `deployed_code` | `#1045` |
| `r38_r40_backend_deployed` | `false` |
| `container_redeploy_or_stop` | 없음 |
| `database_write` | 없음 |

Docker가 gateway `created` 끝의 0을 생략해 `.64267995Z`로 출력했다. 제시된
`.642679950Z`와 같은 timestamp다. R38·R40 백엔드는 이 스택에 없으므로 아래 백엔드 판정은 코드
원문과 로컬 테스트 근거이며, 배포본 실행으로 확인했다고 쓰지 않는다.

## 최종 답

> R40이 바꾼 표면에서, 실 사용자가 화면으로 도달할 수 있는데 잘못 동작하는 것이 있는가.

**있다. 2건이다.** 저장 성공 뒤 알림이 비내구 `applicationTaskExecutor` 큐에만 있어 정상 종료 때
조용히 유실될 수 있고, 제출 거부 fallback은 `afterCommit` 요청 스레드에서 외부 호출을 다시 동기
실행한다. 또한 전역 409 핸들러가 잠금과 무관한 모든 `QueryTimeoutException`까지
`다른 사용자가 전표를 수정 중`으로 오안내한다. **머지 비권고**다.

## 실행 결과

| 명령/검증 | 결과 |
|---|---|
| `.\gradlew.bat :services:slip-service:test --console=plain` | `BUILD SUCCESSFUL in 4m 41s`; 210 suites / 1,573 tests / failures 0 / errors 0 / skipped 0 |
| `npx vitest run src/renderer/components/collab/SlipCollaborationPanel.coedit.test.tsx` | 1 file / 4 tests 통과 |
| R40 생산 diff | 2 production files: `SlipCollabEditService`, `GlobalExceptionHandler` |
| `applicationTaskExecutor` 직접 생산 호출 전수 | slip-service production 1곳: R40 `SlipCollabEditService` |
| slip-service production `@Async` 전수 | 0곳 |
| 전체 Playwright / Gradle 모노레포 전체 | 실행하지 않음 |

## 결함 1 — P1: 201 뒤 알림이 종료 시 유실되고, 거부 fallback은 응답 정지를 되살린다

### 사용자 화면 동선

1. 사용자 A가 전표 상세의 `협업 수정`에서 `수정완료`를 누른다.
2. 전표 mutation·감사·EDIT revision·ACCEPTED 이력은 한 트랜잭션으로 커밋된다.
3. `afterCommit`은 알림 작업을 `applicationTaskExecutor`에 제출하고 HTTP 201 경로를 계속한다.
4. auth/notification이 느려 8개 worker가 점유되면 후속 알림은 무제한 메모리 큐에 쌓인다.
5. 배포·정상 종료가 겹치면 기본 executor는 실행 중 작업을 interrupt하고 큐를 비운다.
6. 화면에는 `수정완료되었습니다.`와 저장/이력이 남지만, 기여자·다음 담당자는 알림을 받지 못한다.

제출이 종료 경합 등으로 거부되면 다른 방향으로 잘못된다. `dispatchNotifications`는 요청 스레드에서
`notificationTask.run()`을 호출한다. 이 callback은 트랜잭션 interceptor가 컨트롤러로 돌아가기 전
`afterCommit`에서 실행되므로 첫 사용자의 응답이 수신자별 auth/notification 시간만큼 다시 멈출 수 있다.
행 잠금은 이미 풀려 두 번째 저장을 막지는 않지만, R39가 금지한 첫 사용자 spinner 정지는 재발한다.

### 코드 원문

- `SlipCollabEditService.java:117-130` — synchronization이 있으면 `afterCommit`에서 제출하고,
  없으면 즉시 제출한다.
- 같은 파일 `:133-145` — 제출 거부 시 현재 스레드 동기 fallback.
- 같은 파일 `:162-180` — 수신자 resolve와 push를 순차 수행.
- `PartnerProductPriceMemoryAsyncConfig.java:47-65` — Boot 기본 builder 그대로
  `applicationTaskExecutor` 생성.
- `application.yml:6-52` — `spring.task.execution` pool/shutdown override 0건.
- Spring Boot 3.3.5 `TaskExecutionProperties` 원문 — platform 기본 core 8,
  `queueCapacity=Integer.MAX_VALUE`, `shutdown.awaitTermination=false`.
- Spring Framework 6.1.14 `ExecutorConfigurationSupport` 원문 — 종료 대기 false면
  `shutdownNow()`로 실행 중 작업을 interrupt하고 남은 큐를 clear.
- `AuthAccountLookupClient.java:41-47`, `NotificationClient.java:54-60` — 각 외부 호출 connect 2초,
  read 3초.

### R39 RED-A 반대급부 판정

R40 보고서 `:41`의 `executor 거부 시 fallback`은 **제출 거부 한 경우만** 다룬다. executor가 이미 받은
작업을 종료 시 버리는 경우는 거부 예외가 없으므로 fallback도 없다. 알림에는 outbox·재시도 가능한
상태·종료 drain이 없다. 따라서 R39 지시서 `:47-48`의 **알림 누락 금지**는 성립하지 않는다.

### executor 전수

| 항목 | 결과 |
|---|---|
| 직접 `@Qualifier("applicationTaskExecutor")` 생산 주입 | 1곳, R40 알림 |
| `@Async` production 메서드 | 0곳 |
| 별도 가격기억 executor | `priceMemoryExecutor`; bounded·종료 최대 5초 drain, R40 알림과 다른 풀 |
| Spring MVC async 등록 | Boot가 같은 이름의 bean을 MVC async executor로 등록 |
| 현재 async controller | `SseEmitter` 7개 endpoint |
| 교차 기능 queue 기아 | 현재 production의 명시적 추가 submitter는 없어 별도 결함으로 확정하지 않음 |

즉 현재 명시적 producer끼리 서로 굶기는 증거는 없다. 문제는 R40 알림 자체가 8개 worker와 무제한 큐를
공유하고, 종료 시 그 큐가 내구성 없이 삭제된다는 점이다. `SseEmitter` 존재만으로 해당 알림 큐와 실제
작업 경합을 실행 증거로 바꾸어 읽지 않았다.

## 첫 각도 — 비동기 전환 반대급부 전수

| 질문 | 판정 | 근거 |
|---|---|---|
| 제출 실패·포화 알림 누락 | **결함** | 거부면 동기 fallback이지만, 무제한 큐에 accept된 작업의 종료 유실은 복구 경로 0 |
| 제출 거부 시 응답 | **결함** | `afterCommit` 요청 스레드가 순차 외부 호출을 직접 실행 |
| 롤백 phantom 알림 | 통과 | production 호출은 `@Transactional commitEdit` 1곳; rollback이면 `afterCommit` 미호출 |
| 중복 알림 | 통과 | snapshot 1회, `LinkedHashSet` dedup, retry 경로 0; 거부된 task만 fallback |
| 성공 이력·알림만 누락 | **결함** | 저장 4종은 원 트랜잭션, 알림은 비내구 큐라 서로 갈라질 수 있음 |
| transaction 없는 else | production 도달 0 | `scheduleNotifications`는 private이고 유일 호출자는 proxied `@Transactional commitEdit` |
| 다른 기능과 executor 공유 | 직접 producer 0건 추가 | MVC async executor 등록은 있으나 현재 실제 queue 경쟁은 입증하지 않음 |
| 애플리케이션 종료 | **결함** | 기본 await false + `shutdownNow()`가 running interrupt/queue clear |

## 결함 2 — P1: non-lock query timeout도 잠금 충돌 409와 거짓 문구가 된다

`GlobalExceptionHandler.java:131-140`은 아래 네 예외를 같은 409로 묶는다.

```text
LockTimeoutException
PessimisticLockException
PessimisticLockingFailureException
QueryTimeoutException
```

앞의 세 갈래는 잠금 획득 실패 의미와 정렬된다. `QueryTimeoutException`은 전역 DB query timeout으로,
잠금 대기 외 조회/저장 query 지연에도 발생할 수 있다. 핸들러는 endpoint·cause·잠금 query 여부를 보지
않는다. 따라서 협업 저장 중 잠금과 무관한 repository query가 timeout이어도 프런트는
`다른 사용자가 전표를 수정 중입니다. 최신 내용으로 다시 확인해 주세요.`를 `role=alert`로 보여 준다.
사용자는 최신 내용을 다시 확인해도 같은 DB timeout을 반복한다.

- `GlobalExceptionHandlerTest.java:81-88`도 cause 없는 `QueryTimeoutException`을 409로 고정한다.
- `SlipCollaborationPanel.tsx:227-239,502-505`는 서버 message를 그대로 화면 alert로 보인다.
- 응답은 하드코딩 문구라 UUID·SQL 원문은 새지 않는다. 문제는 노출이 아니라 원인 오안내다.

## 두 번째 각도 — 409 매핑 전수

| 질문 | 판정 | 근거 |
|---|---|---|
| 잠금 timeout 외 예외가 409인가 | **결함** | 모든 `QueryTimeoutException`을 원인 판별 없이 포함 |
| 사용자 문구가 상황과 맞는가 | genuine lock은 맞음 / non-lock은 **틀림** | non-lock DB timeout을 다른 사용자 편집으로 단정 |
| UUID·내부 식별자 노출 | 통과 | 클래스명만 서버 로그, 응답은 고정 한국어 문구 |
| 낙관적 락 409와 구분 필요 | 현재 UI 동작에는 불필요 | 두 genuine conflict 모두 최신 확인 안내이고 프런트는 message를 직접 표시 |
| 기존 낙관적 락 안내 오염 | 없음 | `SLIP_OPTIMISTIC_LOCK_CONFLICT`의 구체 문구는 유지 |

## R39 불변식 6개 전후 대조

| # | 불변식 | R39 시점 | R40/R41 판정 | 근거 |
|---:|---|---|---|---|
| 1 | 느린/실패 부수효과가 다른 사용자의 different-field 저장을 막지 않음 | **실패** — 외부 호출까지 행 잠금 | **통과** | commit 후 잠금 해제, 실제 병렬 MockMvc 둘째 요청 2초 내 201 |
| 2 | same-field stale 저장은 409 | 통과 | **통과 유지** | 필드별 `expectedBefore`와 행 잠금 유지; Gradle green |
| 3 | different-field same-baseline 양쪽 보존 | 통과 | **통과 유지** | 병렬 최종 memo+shippingAddress 보존; Gradle green |
| 4 | 잠금 실패/timeout은 재확인 가능한 의미 | **실패** — 일반 500 | **genuine lock은 통과** | lock 예외군 409·고정 문구·UUID 비노출. 단 non-lock timeout 과대매핑은 인접 신규 결함 |
| 5 | 성공 시 전표·감사/리비전·ACCEPTED 정합 | 통과 | **통과 유지** | 전부 `commitEdit` 원 트랜잭션 안, 알림만 afterCommit |
| 6 | 알림 실패가 저장 rollback/UUID 노출을 만들지 않음 | 통과 | **통과 유지** | 외부 호출은 commit 후, 개별 push 예외 격리, 응답/본문 UUID 비노출 |

불변식 문언 6개 자체는 R40의 정상·genuine lock 경로에서 성립한다. 그러나 R39 RED-A가 별도로 금지한
**알림 누락**이 종료 경로에서 성립하지 않고, 409 fix가 non-lock timeout을 오염시켰다. 따라서 6개 표의
통과를 머지 가능 판정으로 확대하지 않는다.

## 증거 무결성

- `SlipCollabIT:548-610`은 실제 별도 요청 스레드의 병렬 MockMvc 두 요청이다. 첫 transaction이 commit된
  뒤 느린 auth/notification task를 붙잡고 둘째 different-field 요청이 2초 내 201임을 증명한다.
- 위 테스트는 executor 정상 종료·queue clear·제출 거부를 실행하지 않는다. 따라서 그 green을 알림
  보존 증거로 읽지 않았다.
- `commitEdit_doesNotNotifyBeforeTransactionCommit`과 코드의 `afterCommit` 등록은 rollback 전 알림이
  없음을 뒷받침한다. 종료 후 delivery를 증명하지는 않는다.
- R38·R40 미배포이므로 실제 HTTP 배포본에서 잠금/종료/409를 실행 확인하지 않았다.
- executor 종료 유실은 Boot 3.3.5와 Spring 6.1.14 dependency source 원문으로 판정했다. 컨테이너를
  종료해 실행 재현하지 않았다.

## 이 라운드가 보지 않은 것

- 개발책임자 A안으로 분리된 시나리오 2~5 회계 배분·전기.
- R39에서 닫힌 대시보드·사이드바·라우트·접근성 라벨.
- R38·R40 백엔드 배포본의 실제 HTTP, graceful shutdown 재현, 강제 kill/crash.
- auth/notification vendor의 실제 운영 전달률과 외부 시스템 자체 retry.
- 다른 트랙 `#1045`·`#1061`·`#1063`·`#1066` 파일과 동작.
- accounting/groupware/partner-order의 별도 collaboration 계약.
- 전체 Playwright 게이트와 Gradle 모노레포 전체 스위트.
- 성능/부하 수치와 검증 품질 일반 평가.

## 최종 판정

**머지 비권고.** 결함 2건을 `docs/dev-reports/2026-08-05-874-r41-fix-directive.md`에
LUNA 전달용으로 작성했다. R42는 종료/거부 양방향 알림 보존과 genuine-lock/non-lock timeout 분리를
재검증해야 한다.

## 신규 파일

- `docs/dev-reports/2026-08-05-874-r41-sol-reconvergence.md`
- `docs/dev-reports/2026-08-05-874-r41-fix-directive.md`

# S19 — `inspect()` 마감일 가드 및 slip-units CI red fix

일자: 2026-08-08  
대상: PR #1124 / 이슈 #1123  
범위: `SlipService.inspect()` 도달 결함, `SlipService` 단위 테스트 Mockito 주입 누락

## 결과

- `inspect()`가 다른 상태 전이와 동일하게 `closedDateGuard.assertAllowed(...)`를 먼저 호출하도록 수정했다.
- `SlipService`를 `@InjectMocks`로 만드는 AuditDiff/Compensation/ListSpec/LockGuard 테스트에 `SlipClosedDateGuard` mock을 추가했다.
- 기존 `SlipServiceCompensationTest`의 3개 AssertionError는 가드가 새로 흐름을 바꾼 것이 아니라, 가드 mock 누락으로 인한 동일 NPE의 후속 증상이었다.
- 재배포와 git 명령은 수행하지 않았다.

## RED-A — 마감 날짜 `inspect()` 우회 원문

실행 명령:

```powershell
.\gradlew.bat :services:slip-service:test --tests 'com.samhanair.logis.slip.service.SlipServiceTest.inspect_onClosedDate_isRejectedBeforeMutation'
```

실행 출력 원문:

```text
SlipServiceTest > inspect_onClosedDate_isRejectedBeforeMutation() FAILED
    java.lang.AssertionError at SlipServiceTest.java:734

1 test completed, 1 failed

BUILD FAILED in 11s
EXIT_CODE=1
```

이때 테스트는 마감 예외가 발생하지 않고 `inspect()`가 진행되어 AssertionError가 났다. 테스트를 먼저 추가하고 실패를 확인한 뒤 production code를 수정했다.

## RED-B — 정상 경로 회귀 확인 원문

실행 명령:

```powershell
.\gradlew.bat :services:slip-service:test --tests 'com.samhanair.logis.slip.service.SlipServiceTest.inspect_fromInspecting_movesToCompleted_setsInspectorUserId'
```

실행 출력 원문:

```text
BUILD SUCCESSFUL in 7s
18 actionable tasks: 1 executed, 17 up-to-date
EXIT_CODE=0
```

기존 `INSPECTING → COMPLETED` 정상 경로는 유지됐다. 가드는 예외를 던지는 마감 날짜에서만 후속 mutation을 차단한다.

## 동시 GREEN — 전체 slip-service 테스트 원문

사용자 요구대로 특정 `SlipService` 테스트만 좁히지 않고 모듈 전체를 실행했다.

실행 명령:

```powershell
.\gradlew.bat :services:slip-service:test
```

실행 출력 원문:

```text
> Task :services:slip-service:test

BUILD SUCCESSFUL in 9m 23s
18 actionable tasks: 1 executed, 17 up-to-date
EXIT_CODE=0
```

별도로 변경 좌표 5개 단위 테스트도 함께 실행했다.

```powershell
.\gradlew.bat :services:slip-service:test --tests 'com.samhanair.logis.slip.service.SlipServiceTest' --tests 'com.samhanair.logis.slip.service.SlipServiceCompensationTest' --tests 'com.samhanair.logis.slip.service.SlipServiceAuditDiffTest' --tests 'com.samhanair.logis.slip.service.SlipServiceListSpecTest' --tests 'com.samhanair.logis.slip.service.SlipServiceLockGuardTest'
```

```text
BUILD SUCCESSFUL in 12s
EXIT_CODE=0
```

## ① 새로 가능해진 상태·권한 조합과 결과

| 조합 | 결과 |
|---|---|
| 마감 날짜 + 비예외 사용자 + `inspect()` | `SlipClosedDateGuard`가 `CONFLICT`로 차단, 상태는 `INSPECTING` 유지 |
| 마감 날짜 + `slip.closed-date-exception` 권한자 + `inspect()` | 가드 통과 후 기존 approval/domain 흐름으로 진행 |
| 열린 날짜 + 기존 검수 권한 조건 | 기존 `INSPECTING → COMPLETED` 정상 진행 |
| 마감 날짜 + 기존 `accept/process/complete/ship/deliver/confirm/reject/cancel` | 기존 각 전이의 `assertAllowed`가 계속 차단 |
| 마감 날짜 + `restoreToRevision()` | 기존 `assertAllowed`가 계속 차단 |
| 마감 날짜 + `save()/send()` | 기존 `assertAllowed`가 계속 차단 |

추가된 상태·권한 조합은 마감 날짜의 `inspect()` 차단과 예외 권한자의 통과뿐이다. 기존 활성 기준선/열린 날짜 경로의 동작을 변경하지 않았다.

## ② `assertAllowed` 전수 대조표

grep 명령:

```powershell
rg -n "closedDateGuard\.assertAllowed|assertCreatable|public (SlipDetailResponse|void|boolean|Page<|List<|int) [A-Za-z0-9_]+\(" services/slip-service/src/main/java/com/samhanair/logis/slip/service/SlipService.java
```

실행 결과 핵심 원문:

```text
270: closedDateGuard.assertCreatable(...)
692: closedDateGuard.assertAllowed(...)
889: closedDateGuard.assertAllowed(...)
901: closedDateGuard.assertAllowed(...)
919: closedDateGuard.assertAllowed(...)
965: closedDateGuard.assertAllowed(...)
985: closedDateGuard.assertAllowed(...)
1134: closedDateGuard.assertAllowed(...)
1373: closedDateGuard.assertAllowed(...)
1385: closedDateGuard.assertAllowed(...)
1393: closedDateGuard.assertAllowed(...)
1412: closedDateGuard.assertAllowed(...)
1455: closedDateGuard.assertAllowed(...)
```

| 메서드 | 가드 호출 여부 | 파일:줄 | 판정 |
|---|---|---|---|
| `create` | `assertCreatable` | `SlipService.java:256,270` | 생성 전용 날짜 가드 |
| `editHeader` | `assertAllowed` 없음 | `SlipService.java:394` | 상태전이 아님; 기존 cutoff/domain 편집 규칙 유지 |
| `editDriver` | `assertAllowed` 없음 | `SlipService.java:444` | 상태전이 아님; `editHeader` 도메인 규칙 위임 |
| `updateSlip` | `assertAllowed` 없음 | `SlipService.java:474` | 상태전이 아님; 기존 cutoff/domain 편집 규칙 유지 |
| `applyOverlayPatch` | `assertAllowed` 없음 | `SlipService.java:551` | 별도 `guardLockPolicy` 사용 |
| `applyOverlayPatchBatch` | `assertAllowed` 없음 | `SlipService.java:604` | 별도 협업 잠금 가드 사용 |
| `softDelete` | `assertAllowed` 없음 | `SlipService.java:657` | 별도 `guardLockPolicy` 사용 |
| `restoreToRevision` | 있음 | `SlipService.java:689,692` | 통과 |
| `addLine` | `assertAllowed` 없음 | `SlipService.java:840` | `requireEditable` 도메인 규칙 사용 |
| `removeLine` | `assertAllowed` 없음 | `SlipService.java:872` | `requireEditable` 도메인 규칙 사용 |
| `save` | 있음 | `SlipService.java:887,889` | 통과 |
| `send(UUID)` | 위임 | `SlipService.java:895` | `send(UUID,String)`으로 위임 |
| `send(UUID,String)` | 있음 | `SlipService.java:899,901` | 통과 |
| `accept` | 있음 | `SlipService.java:917,919` | 통과 |
| `process(UUID)` | 위임 | `SlipService.java:959` | `process(UUID,String)`으로 위임 |
| `process(UUID,String)` | 있음 | `SlipService.java:963,965` | 통과 |
| `inspect` | 있음 (S19 추가) | `SlipService.java:983,985` | 이번 도달 결함 해소 |
| `complete(UUID)` | 위임 | `SlipService.java:1128` | `complete(UUID,String)`으로 위임 |
| `complete(UUID,String)` | 있음 | `SlipService.java:1132,1134` | 통과 |
| `ship(UUID)` | 위임 | `SlipService.java:1367` | `ship(UUID,String)`으로 위임 |
| `ship(UUID,String)` | 있음 | `SlipService.java:1371,1373` | 통과 |
| `deliver(UUID)` | 위임 | `SlipService.java:1379` | `deliver(UUID,String)`으로 위임 |
| `deliver(UUID,String)` | 있음 | `SlipService.java:1383,1385` | 통과 |
| `confirm` | 있음 | `SlipService.java:1391,1393` | 통과 |
| `reject` | 있음 | `SlipService.java:1410,1412` | 통과 |
| `cancel` | 있음 | `SlipService.java:1453,1455` | 통과 |

전수 대조 결론: `inspect()` 외에 `assertAllowed`가 빠진 상태 전이/저장 메서드는 발견되지 않았다. 편집·soft-delete·협업 경로의 무호출은 기존에 정의된 별도 잠금/도메인 정책 경로이며, 이번 S19에서 의미를 변경하지 않았다.

## ③ `SlipService` 참조 테스트 전부 실행

검증 대상은 `SlipService`를 직접 참조하는 단위/통합 테스트를 포함하는 `:services:slip-service:test` 전체 태스크로 확장했다. 결과는 위 동시 GREEN 원문과 같이 `BUILD SUCCESSFUL`, `EXIT_CODE=0`이다. `SlipRestoreServiceTest`, `SlipRevisionServiceTest`, `SlipDocumentCollaborationPortTest` 등 S17 변경 대상 서비스 테스트도 전체 태스크에 포함되어 통과했다. `SlipSeeder`는 별도 `@InjectMocks` 테스트가 없고, 서비스 생성자는 production Spring 주입 경로로만 사용된다.

## 변경 파일 / 신규 파일 목록

변경 파일:

- `services/slip-service/src/main/java/com/samhanair/logis/slip/service/SlipService.java`
- `services/slip-service/src/test/java/com/samhanair/logis/slip/service/SlipServiceTest.java`
- `services/slip-service/src/test/java/com/samhanair/logis/slip/service/SlipServiceAuditDiffTest.java`
- `services/slip-service/src/test/java/com/samhanair/logis/slip/service/SlipServiceCompensationTest.java`
- `services/slip-service/src/test/java/com/samhanair/logis/slip/service/SlipServiceListSpecTest.java`
- `services/slip-service/src/test/java/com/samhanair/logis/slip/service/SlipServiceLockGuardTest.java`

신규 파일:

- `docs/dev-reports/2026-08-08-1123-s19-inspect-guard-and-ci.md`


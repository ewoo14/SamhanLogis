# PR #1124 / Issue #1123 — S17 마감일 규칙 전체 경로 적용

- 작업일: 2026-08-08 KST
- 브랜치: `feat/1123-closed-date-guard`
- 범위: 백엔드 코드·단위 테스트·본 보고서
- 제한: 재배포하지 않음, DB 직접 변경 없음, 기존 확인 데이터 미변경, git 명령 미사용

## 결론

개발책임자 결정인 **“마감된 날짜에 전표가 새로 나타나면 안 된다. 예외는 `slip.closed-date-exception` 권한자”**를 `SlipClosedDateGuard.assertAllowed()`라는 단일 정책 지점으로 확장했다.

적용 결과:

- soft-delete 복원: 복원 직전 `slipType + slipDate` 검사
- revision 복원: 현재 전표 날짜와 복원 대상 snapshot 날짜를 모두 검사
- full-snapshot 협업 복원: snapshot 날짜 검사. 시스템 actor는 예외 권한자가 아니므로 닫힌 날짜 차단
- 상태 전이: save/send/accept/process/inspect/complete/ship/deliver/confirm/reject/cancel 모두 검사
- dev `SlipSeeder`: 저장 전 동일 guard 검사
- 기존 신규 생성 7경로: 기존 `assertCreatable()` 호출을 유지. 이 메서드는 이제 동일한 `assertAllowed()`를 위임

`slip.closed-date-exception`의 권한 action은 기존 생성 경로와 동일하게 `CREATE`를 사용한다.

## 경로별 RED-A 원문

### soft-delete 복원

S16 실측 원문:

```json
{"step":"restore-soft-deleted","http":200,"code":"OK","message":"성공","slipNo":"2026/08/08-29","date":"2026-08-08","status":"DRAFT"}
```

결과: 닫힌 날짜에서 삭제행이 활성행으로 재등장하는 결함 1/1. S17에서는 `SlipRestoreService.restore()`가 `markRestoredWithNameCleared()`보다 먼저 공통 guard를 호출하도록 변경했다.

### revision 복원

S16 실측 원문:

```json
{"step":"restore-revision","http":200,"code":"OK","message":"성공","date":"2026-08-08","status":"DRAFT"}
```

결과: 현재 날짜가 닫힌 경우뿐 아니라, 복원 대상 snapshot의 날짜가 닫힌 경우도 차단하도록 `SlipRevisionService.restore()`에서 target snapshot 날짜를 검사한다.

### full-snapshot 복원

S16 실측 원문: HTTP 진입점 0건, main 호출부 0건으로 실 HTTP 재현 불가. 기존 구현은 `restoreFromSnapshot(snapshot)` 후 저장했다.

S17 결과: Spring Factory가 주입한 guard가 `snapshot.slipDate()`를 검사한다. 시스템 actor는 권한 예외를 우회하지 않으므로 닫힌 날짜는 차단된다.

### 상태 전이 / 일괄

S16 전수 결과상 별도 일괄 상태 endpoint는 0건이었다. 단건 lifecycle 11종은 기존에는 날짜 guard가 없었다. S17은 실재하는 단건 상태 전이 메서드 전부에 guard를 연결했다. 일괄 endpoint는 실 경로 자체가 없어 별도 차단 코드는 추가하지 않았다.

## 경로별 RED-B 원문

자동화 테스트에서 다음을 확인했다.

```text
SlipRestoreServiceTest.restore_rejectsClosedDateBeforeReactivatingHeader — PASS
SlipRestoreServiceTest.restore_openDateUsesTheSharedClosedDatePolicy — PASS
SlipRevisionClosedDateGuardTest.restore_checksTheTargetSnapshotDateBeforeApplyingIt — PASS
SlipServiceTest.process_checksClosedDateGuardBeforeStatusMutation — PASS
SlipClosedDateGuardTest.closedDate_isRejectedForNonPrivilegedCreator — PASS
SlipClosedDateGuardTest.privilegedCreator_canCreateOnClosedDate — PASS
```

열린 날짜의 복원은 활성화 저장까지 진행하고, 열린 날짜의 상태 전이는 계속 허용된다. 권한 예외는 기존 `SlipClosedDateGuardTest.privilegedCreator_canCreateOnClosedDate`의 동일한 판정 계약으로 유지된다.

신규 생성 7경로의 기존 호출은 grep으로 모두 남아 있음을 확인했다: 직접 생성, 복사, 모바일 주문, 견적 전환, 견적 발행, 주문 발행, 주문 병합 발행.

## 동시 GREEN 원문

```text
BUILD SUCCESSFUL in 36s
18 actionable tasks: 3 executed, 15 up-to-date
SlipRevisionClosedDateGuardTest — PASS
SlipRestoreServiceTest — PASS
SlipServiceTest — PASS
```

변경 파일 참조 단위 테스트 확장 실행:

```text
BUILD SUCCESSFUL in 20s
18 actionable tasks: 1 executed, 17 up-to-date
SlipRestoreServiceTest, SlipClosedDateGuardTest, SlipDocumentCollaborationPortTest,
SlipServiceTest, MobilePartnerOrderServiceTest,
EstimateToSlipConverterAuthoritativeAmountsTest, OutboundCutoffGuardTest — PASS
```

첫 실행에서 기존 협업 포트 7-인자 생성자 호환성 컴파일 오류가 발견됐고, 기존 생성자를 유지하는 호환 constructor를 추가한 뒤 재실행했다. 이후 위 테스트는 모두 통과했다.

## ① 새로 가능해진 상태·권한 조합과 결과

| 조합 | 결과 |
|---|---|
| 열린 날짜 + 비권한자 + soft-delete 복원 | 기존 복원 동작 유지, 활성화 PASS |
| 열린 날짜 + `slip.closed-date-exception` 권한자 + soft-delete 복원 | 공통 guard 통과. 기존 생성과 같은 예외 판정 |
| 닫힌 날짜 + 비권한자 + soft-delete 복원 | `SlipClosedDateException`/409, 헤더 활성화 전 차단 |
| 닫힌 날짜 + 예외 권한자 + soft-delete 복원 | 공통 권한 판정 통과 |
| 열린 날짜 + 비권한자 + revision 복원 | target snapshot 적용 경로 유지 |
| 닫힌 날짜 + 비권한자 + revision 복원 | 현재 날짜 또는 target snapshot 날짜 검사에서 차단 |
| 열린 날짜 + 비권한자 + 상태 전이 | 기존 전이 동작 유지 |
| 닫힌 날짜 + 비권한자 + 상태 전이 | 전이 mutation 전에 차단 |
| 닫힌 날짜 + 예외 권한자 + 상태 전이 | 생성과 동일한 권한 action 판정으로 통과 |
| dev 시드 + 닫힌 날짜 | 시드 저장 전 차단. 시드는 사용자 예외 권한을 자동 부여하지 않음 |
| full-snapshot 시스템 복원 + 닫힌 날짜 | 시스템 actor는 예외 권한자가 아니므로 차단 |

## ② 식별자·판정 지점 grep 전수 확인

S17 변경 판정 식별자는 `SlipClosedDateGuard.assertAllowed`이다. main Java 전수 grep 결과:

```text
SlipClosedDateGuard.java       assertCreatable -> assertAllowed 위임
SlipRestoreService.java        assertAllowed 1
SlipService.java               restore 1 + status mutation 11
SlipRevisionService.java       target snapshot date assertAllowed 1
SlipDocumentCollaborationPort.java snapshot date assertAllowed 1
SlipSeeder.java                seed save 전 assertAllowed 1
```

기존 생성 호출 식별자 `assertCreatable`는 7개 운영 factory/service 경로에 남아 있고, `SlipClosedDateGuard` 내부에서만 `assertAllowed`로 위임한다. 따라서 날짜 계산과 권한 예외 판정은 한 곳에 있다.

## ③ 바꾼 파일을 참조하는 테스트 전부 실행 결과

실행 명령:

```powershell
.\gradlew.bat :services:slip-service:test `
  --tests com.samhanair.logis.slip.service.SlipRestoreServiceTest `
  --tests com.samhanair.logis.slip.service.closing.SlipClosedDateGuardTest `
  --tests com.samhanair.logis.slip.collab.SlipDocumentCollaborationPortTest `
  --tests com.samhanair.logis.slip.service.SlipServiceTest `
  --tests com.samhanair.logis.slip.mobile.service.MobilePartnerOrderServiceTest `
  --tests com.samhanair.logis.slip.estimate.service.EstimateToSlipConverterAuthoritativeAmountsTest `
  --tests com.samhanair.logis.slip.service.cutoff.OutboundCutoffGuardTest `
  --no-daemon
```

결과:

```text
BUILD SUCCESSFUL
실패 0
```

revision 대상 날짜 검증 추가 후 별도 회귀 묶음도 `BUILD SUCCESSFUL`, 실패 0이다.

## SlipSeeder 판단

수정했다. 이유는 dev 프로파일이라도 기준선이 활성화된 DB로 애플리케이션이 시작될 때 과거 날짜의 활성 전표 100건을 직접 저장할 수 있었기 때문이다. HTTP 사용자가 아니더라도 결과적으로 마감일에 활성 전표가 나타나므로 불변식 ①의 비HTTP 차집합으로 남겨둘 수 없다.

시드 actor UUID는 예외 권한을 자동 부여하지 않는다. 따라서 닫힌 날짜라면 seed startup이 fail-fast 한다. 이는 개발자가 마감 정책을 명시적으로 해제하거나 seed 데이터 날짜를 조정하게 만드는 선택이며, 조용히 규칙을 우회하는 것보다 안전하다. 이번 세션은 재기동 금지 조건 때문에 실제 시드 실행은 하지 않았다.

## revision 날짜 이동 판정

S16의 판정불가 결론을 유지한다. 공개 전표 수정 DTO에는 `slipDate`가 없고, 실제 revision 생성은 create/update snapshot에서 날짜를 캡처한다. 따라서 실 HTTP 경로에서 서로 다른 `slipDate` revision 표본을 만들 수 없다. 표본 0을 안전으로 해석하지 않았다.

대신 내부 full-snapshot 계약은 다른 날짜 snapshot을 전달할 수 있는 구조이므로, `SlipRevisionService.restore()`와 협업 `restoreSnapshot()` 모두 **현재 Slip 날짜가 아니라 복원 대상 snapshot 날짜**를 guard에 전달하도록 닫았다. 즉 실 경로를 만들 수 없는 상태를 근거로 방치하지 않고, 날짜 이동이 가능한 내부 입력 경계까지 방어했다.

## 신규 파일 목록

- `docs/dev-reports/2026-08-08-1123-s17-rule-applied-all-paths.md`
- `services/slip-service/src/test/java/com/samhanair/logis/slip/service/SlipRestoreServiceTest.java`
- `services/slip-service/src/test/java/com/samhanair/logis/slip/revision/service/SlipRevisionClosedDateGuardTest.java`

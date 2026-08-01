# 2026-08-01-1013 알림 전달 경로 결함 구현 보고서

## 1단계 — 원인 조사 및 실제 전송 수단 확인

- 정찰 보고서와 현재 핸드오프를 읽었다.
- 레거시 GAS에는 SMS·Aligo·카카오 API 호출이 없고, 수신 대상과 문구를 만든 뒤 사용자가 외부 채널로 복사하는 흐름만 확인됐다. 따라서 레거시의 `R_` 단톡방 키를 현재 Aligo 전화번호 수신자에 직접 연결할 수 있는 단톡방 전송 수단은 이 저장소에서 확인되지 않았다.
- 현행은 `room:<단톡방명>`을 Aligo `receiver`로 전달하므로 단톡방 이름이 전화번호 주소로 오해석된다. 단톡방 매핑이 없을 때 인수자 전화번호를 조회해 보내는 배선도 발송 요청 계약에 없다.
- Aligo 자격증명 placeholder 경로는 외부 호출 없이 `success/SUCCESS`를 반환하고 `SENT` 및 화면 성공 건수로 이어진다.

### 가설

1. 수신자 결함의 근본 원인은 화면이 단톡방 이름만 `recipientPhone`으로 만들어 서버가 전화번호 수신자로 취급하게 한 계약이다. 단톡방 실제 전송 어댑터가 없으므로 단톡방 매핑은 발송 대상에서 제외하고, 매핑이 없을 때만 인수자 번호를 전화 수신자로 전달하도록 계약을 분리해야 한다.
2. 거짓 성공의 근본 원인은 외부 호출을 하지 않은 stub 결과를 성공 결과로 표현한 것이다. 개발 환경을 막지 않으려면 `DRY_RUN` 같은 명시적 비전송 결과를 도입하고, 서비스·배치·화면에서 성공 집계와 `SENT` 전이를 차단해야 한다.

## 2단계 — RED 실패 테스트 및 원문

두 결함에 대해 먼저 실패 테스트를 추가했다.

- `AligoSmsAdapterPlaceholderRuntimeGuardIT`: placeholder 자격증명은 `success=false`, `NOT_SENT_CREDENTIALS_PLACEHOLDER`여야 한다.
- `DispatchBatchSendServiceTest`: `room:<단톡방명>`은 `NotificationService`로 전달하지 않고 `FAILED`로 집계되어야 한다.

실행 명령:

```text
.\gradlew.bat :services:notification-service:test --tests 'com.samhanair.logis.notification.adapter.sms.AligoSmsAdapterPlaceholderRuntimeGuardIT' --tests 'com.samhanair.logis.notification.service.DispatchBatchSendServiceTest' --no-daemon
```

RED 출력 원문:

```text
AligoSmsAdapterPlaceholderRuntimeGuardIT > dummy (소문자) — 외부 호출 없이 비전송 결과 반환 FAILED
    org.opentest4j.AssertionFailedError at AligoSmsAdapterPlaceholderRuntimeGuardIT.java:86
AligoSmsAdapterPlaceholderRuntimeGuardIT > changeme (소문자) — 외부 호출 없이 비전송 결과 반환 FAILED
    org.opentest4j.AssertionFailedError at AligoSmsAdapterPlaceholderRuntimeGuardIT.java:77
AligoSmsAdapterPlaceholderRuntimeGuardIT > CHANGE_ME_LOCAL_ONLY — 외부 호출 없이 비전송 결과 반환 FAILED
    org.opentest4j.AssertionFailedError at AligoSmsAdapterPlaceholderRuntimeGuardIT.java:59
AligoSmsAdapterPlaceholderRuntimeGuardIT > PLACEHOLDER_DEV_ONLY — 외부 호출 없이 비전송 결과 반환 FAILED
    org.opentest4j.AssertionFailedError at AligoSmsAdapterPlaceholderRuntimeGuardIT.java:68
DispatchBatchSendServiceTest > 단톡방 이름은 SMS 수신자로 전달하지 않고 전송 실패로 남긴다 FAILED
    java.lang.AssertionError at DispatchBatchSendServiceTest.java:189
9 tests completed, 5 failed
BUILD FAILED
```

## 3단계 — 최소 수정 구현

- `AligoSmsAdapter`의 placeholder/공백 자격증명 결과를 `success`가 아닌 `NOT_SENT_CREDENTIALS_PLACEHOLDER` 실패 결과로 변경했다. 외부 호출은 계속 생략되므로 개발 환경 흐름은 멈추지 않고, `NotificationService`가 `FAILED`로 전이한다.
- `DispatchBatchSendService`에 `room:` 입력 차단을 추가했다. 단톡방 이름은 Aligo `receiver`로 전달되지 않으며, 단톡방 API/어댑터 부재를 명시한 실패 결과만 남긴다.
- preview의 출고전표 DTO/미매핑 항목에 인수자 전화번호와 안내 본문을 추가하고, 데스크톱은 단톡방 매핑 건을 SMS로 전송하지 않고 매핑 없는 건만 인수자 번호 fallback으로 전송하도록 변경했다.
- 단톡방 직접 전송 구현은 추가하지 않았다. 정찰 결과 레거시에도 외부 전송 API가 없고 현재 저장소에도 단톡방 전송 어댑터가 없기 때문이다.

### RED 이후 대상 테스트 GREEN 원문

```text
> Task :services:notification-service:test
BUILD SUCCESSFUL in 30s
18 actionable tasks: 3 executed, 15 up-to-date
```

## 4단계 — 데스크톱 타입 검증 원문

실행 명령: `npm run typecheck` (`clients/desktop`)

```text
> @samhan/desktop@0.1.0 typecheck
> node scripts/real-qa-scope.cjs --phase=typecheck && tsc -p tsconfig.node.json --noEmit && tsc -p tsconfig.web.json --noEmit && npm run typecheck:real-qa

... tsc 통과 ...
ℹ tests 50
ℹ pass 50
ℹ fail 0
```

## 5단계 — 전체 모듈 테스트 1차 결과 및 계약 회귀 수정

전체 실행 1차 결과는 기존 placeholder `stub-success/SENT` 기대 테스트 7건 실패였다.

```text
227 tests completed, 7 failed
AligoSmsAdapterPlaceholderRuntimeGuardIT: TC-1, TC-2, TC-3, TC-4
AligoSmsAdapterSendAuditIT: 2건
NotificationAdminControllerIT: 1건
BUILD FAILED
```

위 테스트들은 비전송을 성공으로 세지 않는 새 계약에 맞춰 `NOT_SENT_CREDENTIALS_PLACEHOLDER`, `FAILED`, `sent=0/failed=N`을 검증하도록 수정했다. 테스트 코드가 실제 외부 호출을 만들도록 바꾸지는 않았다.

정상 자격증명 경로는 `MockRestServiceServer`로 Aligo 성공 응답만 모의하여 확인했다. 외부 네트워크·실제 문자 발송은 없었고, `result_code=1`이 정상 `success`로 처리됐다.

## 6단계 — 최종 검증

notification-service 전체 테스트 최종 원문:

```text
> Task :services:notification-service:test
BUILD SUCCESSFUL in 1m 6s
18 actionable tasks: 1 executed, 17 up-to-date
```

최종 확인 범위에는 SMS placeholder 비전송 상태 전이/감사 로그, 단톡방 이름 SMS 차단, 정상 자격증명 Aligo 성공 경로, NotificationService의 PUSH/EMAIL/SMS 공통 라우팅 테스트가 포함된다. 데스크톱 `npm run typecheck`도 `tsc` 및 real-QA 50/50 통과했다.

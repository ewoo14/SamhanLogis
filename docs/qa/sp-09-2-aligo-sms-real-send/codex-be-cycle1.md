# SP-09-2 Aligo SMS 실 발송 - Codex BE Review Cycle 1

대상: PR #237, commit `87d1e5f7`

## Findings

### HIGH - `SEND_AUDIT`에 Aligo `msg_id`/raw gateway 결과가 연결되지 않음

- 위치:
  - `services/notification-service/src/main/java/com/samhanair/logis/notification/service/DispatchBatchSendService.java:107-116`
  - `services/notification-service/src/main/java/com/samhanair/logis/notification/service/DispatchBatchSendService.java:158-172`
  - `services/notification-service/src/main/java/com/samhanair/logis/notification/service/NotificationService.java:212-214`
- 내용: `NotificationService`는 gateway log에 `result.messageId()`와 raw response를 저장하지만, `DispatchBatchSendService`의 `SEND_AUDIT` payload는 `partnerCode`, `recipientPhone`, `status`, `reason`만 저장합니다. 따라서 실 Aligo 발송 성공 후 운영자가 보는 발송 감사 상세에서 Aligo `msg_id`를 추적할 수 없습니다.
- 영향: 사용자 지시의 "msg_id 비즈니스 식별자만 노출" 정책과 디자인/dev-report의 `msg_id` 운영 추적 설계가 실제 감사 데이터와 연결되지 않습니다. 장애/민원 대응 시 batch audit row에서 Aligo 원장 대조가 불가능합니다.
- 권고: `notificationService.send()` 결과와 같은 트랜잭션에서 생성된 최신 `NotificationLog`의 `gatewayMessageId`, `gatewayStatus`, `rawResponse`를 detail에 포함하거나, `NotificationService.send()` 반환 DTO를 분리해 gateway 결과를 batch service가 직접 받을 수 있게 하십시오.

### MEDIUM - 읽기 대상 IT가 4-keyword placeholder guard를 직접 검증하지 않음

- 위치:
  - `services/notification-service/src/test/java/com/samhanair/logis/notification/it/AligoSmsAdapterPlaceholderRuntimeGuardIT.java:110-167`
  - `services/notification-service/src/test/java/com/samhanair/logis/notification/adapter/sms/AligoSmsAdapterPlaceholderRuntimeGuardIT.java:55-88`
- 내용: adapter 구현은 `CHANGE_ME_LOCAL_ONLY`, `PLACEHOLDER_DEV_ONLY`, `changeme`, `dummy`를 case-insensitive로 처리합니다. 별도 경량 adapter test는 4개 키워드를 확인하지만, 이번 review 대상 IT는 `CHANGE_ME_LOCAL_ONLY`만 조건 분기합니다.
- 영향: SP-09-1 placeholder 패턴 일관성은 구현/경량 테스트로는 확보되지만, PR이 명시한 runtime guard IT 산출물만 보면 4-keyword 회귀를 막지 못합니다.
- 권고: 통합 테스트명 또는 dev-report를 정확히 고치거나, IT에도 4-keyword parameterized 검증을 추가하십시오.

### LOW - fail-soft audit 실패 검증이 문서화와 테스트 구현이 불일치

- 위치:
  - `services/notification-service/src/test/java/com/samhanair/logis/notification/it/AligoSmsAdapterSendAuditIT.java:47`
  - `services/notification-service/src/test/java/com/samhanair/logis/notification/it/AligoSmsAdapterSendAuditIT.java:87-211`
  - `services/notification-service/src/main/java/com/samhanair/logis/notification/service/DispatchBatchSendService.java:184-187`
- 내용: 구현은 `saveSendAudit()` 전체를 `try/catch`로 감싸고, `DispatchSmsSaveHistoryService`도 `REQUIRES_NEW`를 사용해 fail-soft 의도는 충족합니다. 다만 IT Javadoc은 "저장 실패가 발송 결과에 영향 없는지 확인"한다고 쓰지만 실제 테스트는 저장 성공 경로만 검증합니다.
- 영향: 현재 구현은 양호하나, 향후 save service 변경 시 fail-soft 회귀를 잡는 테스트가 없습니다.
- 권고: `DispatchSmsSaveHistoryService.save()`를 mock으로 격리한 unit test 또는 payload-size 초과 케이스로 발송 응답이 유지되는지 검증하십시오.

## Cross-check

- SP-09-1 placeholder 4-keyword: 구현 OK, 경량 adapter test OK, 지정 IT coverage는 부족.
- send_audit fail-soft: 구현 OK, 실패 테스트 부족.
- UUID 비공개: batch response/audit는 partnerCode/phone 중심이며 request UUID는 UI 상세 key 전용.
- 외부 client `@MockBean`: 읽은 IT 두 개 모두 User/Partner/Slip/Blocked/Aligo client 격리 확인.

## Section Decision

BE 단독으로는 `msg_id` 추적성 누락이 HIGH입니다. cycle 2에서 gateway result를 `SEND_AUDIT`에 연결하는 보완을 권고합니다.

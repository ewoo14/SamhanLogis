# SP-09-2 Aligo SMS 실 발송 - Codex FE Review Cycle 1

대상: PR #237, commit `87d1e5f7`

## Findings

### HIGH - 발송 이력 목록이 실제 `SEND_AUDIT` 집계값을 0으로 표시함

- 위치:
  - `clients/desktop/src/renderer/routes/DispatchSmsSendAuditPage.tsx:58-68`
  - `services/notification-service/src/main/java/com/samhanair/logis/notification/service/DispatchBatchSendService.java:155-162`
  - `services/notification-service/src/main/java/com/samhanair/logis/notification/web/dto/DispatchSmsSaveHistoryListRow.java:22-30`
- 내용: FE `extractCounts()`는 `requestParams.sent/failed/blocked`를 읽습니다. 그러나 BE는 `requestParams`에 `date`, `rowCount`만 넣고, `sent/failed/blocked`는 `responsePayload`에 넣습니다. 목록 DTO도 payload를 내려주지 않습니다.
- 영향: 실 API 목록에서는 모든 행이 성공/실패/차단 `0`으로 보이고, 결과 배지는 `성공`으로 계산됩니다. `PARTIAL`/`FAIL` 필터도 실제 실패 행을 걸러낼 수 없습니다.
- 권고: 목록 DTO에 `sent/failed/blocked` 요약 필드를 추가하거나, `SEND_AUDIT` 저장 시 `requestParams`에도 요약 카운트를 중복 저장하도록 계약을 맞추십시오. mock 데이터는 현재 `requestParams.sent`를 넣고 있어 이 회귀를 숨깁니다.

### HIGH - Playwright가 실제 등록 route가 아닌 `/admin/notifications/sms-audit`로 진입함

- 위치:
  - `clients/desktop/playwright/sp-09-2-aligo-sms-real-send/sp-09-2-aligo-sms-real-send.spec.ts:93-96`
  - `clients/desktop/src/renderer/routes/index.tsx:805-808`
  - `clients/desktop/src/renderer/components/AppLayout.tsx:656`
- 내용: 앱 route와 사이드바는 `/arologis/dispatch-sms/send-audit`를 사용하지만 QA spec은 `/admin/notifications/sms-audit?mockRole=...`로 이동합니다. HashRouter 앱에서 이 경로는 실제 신규 화면을 검증한다는 보장이 없습니다.
- 영향: 신규 `DispatchSmsSendAuditPage`가 깨져도 테스트가 다른 화면/빈 앱 shell에서 통과할 수 있습니다.
- 권고: Playwright URL 상수를 `/#/arologis/dispatch-sms/send-audit?mockRole=...` 또는 앱의 실제 HashRouter 진입 형식으로 교정하십시오.

### MEDIUM - 상세 화면 `msg_id` 표시는 계약상 거의 항상 비어 있음

- 위치:
  - `clients/desktop/src/renderer/routes/DispatchSmsSendAuditPage.tsx:177-184`
  - `clients/desktop/src/renderer/api/dispatchSmsSaveHistoryApi.ts:70-77`
  - `services/notification-service/src/main/java/com/samhanair/logis/notification/service/DispatchBatchSendService.java:163-172`
- 내용: FE는 `payload.msgId`가 있으면 표시하도록 구현했지만, BE `SEND_AUDIT` payload에는 batch-level `msgId`가 없습니다. per-recipient detail에도 `msg_id`가 없습니다.
- 영향: "msg_id는 비즈니스 식별자라 노출 OK" 정책은 지켜도, 실제 화면에서는 운영 추적 식별자가 보이지 않습니다.
- 권고: BE 계약 보완 후 FE 타입도 batch-level 하나가 아니라 detail row별 `msgId`/`gatewayStatus`/`rawResponse`를 표현하도록 맞추십시오.

## Cross-check

- 수신자 마스킹: `maskPhone()`은 `010-1234-5678`, `01012345678` 모두 `010-****-NNNN` 형식으로 처리합니다.
- UUID 비공개: `id`는 상세 조회 key로만 쓰고 table에는 표시하지 않습니다.
- 권한: route와 sidebar는 `DISPATCH_SMS_ROLES`를 사용해 DISPATCH/MANAGER/MASTER 허용입니다. dev-report의 "SEND_AUDIT는 MANAGER+ 제한"과는 불일치합니다.

## Section Decision

FE는 cycle 2 진입 권고입니다. 목록 카운트 계약 mismatch와 잘못된 QA route는 merge blocker입니다.

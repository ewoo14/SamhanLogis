# 이슈 #1110 S3 — 백엔드 권위 사건 계약

## 결론

거래처 주문의 서버 권위 커밋을 알리는 신규 per-order 사건을 추가했다.

```text
event: partner-order:authority
channel: PartnerOrderRealtimeBroker
route: /realtime 및 /collab/stream 양쪽에서 수신
payload: commitId(UUID), orderId(UUID), revisionNo(Integer|null), changeType(String)
```

payload에는 주문 문서 내용, Y.Doc update, header, line, snapshot, document 필드를 넣지 않는다.
소비자는 사건을 받은 뒤 REST를 다시 읽어야 한다. `commitId`가 사건의 dedupe identity다.

기존 `partner-order:edit`, `suggestion.accepted`, `CREATED`/`UPDATED`/`RESTORED` board 사건은
삭제하거나 이름을 바꾸지 않았다. `/realtime`과 `/collab/stream`은 현재 동일한
`PartnerOrderRealtimeBroker`를 사용하므로 신규 사건 하나가 두 기존 per-order 구독자에게
전달된다. 목록 SSE는 기존 board 사건을 계속 받는다.

## 전수 검증한 권위 쓰기 축

축은 “partner_order의 서버 권위 상태를 바꾸는 쓰기”로 잡고 repository save 호출이 아니라
서비스의 `@Transactional` 경로와 비동기 writer까지 역추적했다.

| 축 | 실제 발행 지점 | 사건 |
|---|---|---|
| 주문 생성 — confirm | `PartnerOrderConfirmService.confirm` → `PartnerOrderRevisionService.capture` | `CREATE` |
| 주문 생성 — 견적 전환 | `PartnerOrderFromEstimateService` → `capture` | `CREATE` |
| 직접 저장 | `PartnerOrderUpdateService.update` → `capture` | `EDIT` |
| 협업 저장 | `PartnerOrderCollabEditService` → `PartnerOrderUpdateService.applyOverlayPatchBatch` → `capture` | `EDIT` |
| revision 복원 | `PartnerOrderRevisionService.restore` → `capture` | `RESTORE` |
| soft delete | `PartnerOrderDeleteService.delete` → `capture` | `DELETE` |
| 목록 인라인 복원 | `PartnerOrderDeleteService.restoreDeleted` | `RESTORED` |
| 보류/해제 | `PartnerOrderHoldService.hold/release` | `STATUS` |
| 단일 전표 전환 | `PartnerOrderConvertService.convert` | `CONVERT` |
| 다중 주문 병합 전환 | `PartnerOrderMergeConvertService.convertMerge`의 각 저장 주문 | `CONVERT` |
| outbox 성공 결과 | `SlipPublishOutboxResultWriter.commitSuccess` | `OUTBOX_COMMITTED` |
| outbox 영구 실패 결과 | `SlipPublishOutboxResultWriter.markFailedPermanent` | `OUTBOX_FAILED_PERMANENT` |

`coedit:update`, presence, comment, suggestion 자체는 partner_order 권위 상태를 저장하지 않는
relay/협업 이력 사건이므로 권위 commit 사건으로 세지 않았다. 협업 수정완료의 실제 주문 저장은
위의 `applyOverlayPatchBatch` 축으로 집계했다.

## 발행 및 실패 계약

`PartnerOrderAuthorityEventPublisher`가 모든 revision 기반 경로의 공통 발행 지점이다.
revision 저장 성공 후 호출되며, 트랜잭션 중이면 `afterCommit`에서 발행한다. 상태/전환/outbox와
인라인 복원도 저장 성공 뒤 이 publisher를 호출한다. 따라서 저장 실패나 롤백 뒤에는 사건이
발행되지 않는다.

브로커/알림 예외는 publisher 내부에서 잡아 경고 로그만 남긴다. 사건 발행 실패가 주문 저장
트랜잭션을 롤백시키지 않는다.

## RED-A / RED-B

### RED-A 원문

> 6개(이상) 권위 경로 각각에서 사건이 정확히 한 번 발행된다 — 통합 테스트로

### RED-B 원문

> 기존 `/realtime` · 목록 SSE 구독자가 그대로 동작한다. 발행이 실패해도 권위 commit은
> 커밋된다. 사건 payload에 문서 snapshot이 없다.

### 현재 검증 상태

동시 GREEN의 최소 계약 테스트는 추가했다.

- `PartnerOrderAuthorityEventPublisherTest.publishes_snapshot_free_event_with_unique_commit_identity`
  — identity/필수 필드와 `snapshot`/`document` 부재 고정
- `PartnerOrderAuthorityEventPublisherTest.publication_failure_does_not_escape_authority_commit_path`
  — broker 예외 격리 고정
- `:services:partner-order-service:compileJava` 및 `compileTestJava` 통과
- 위 계약 테스트 실행 통과

6개 이상 실제 서비스 경로의 exactly-once를 검증하는 통합 테스트와 두 SSE endpoint의 실제
emitter 검증은 이 라운드에서 아직 실행하지 않았다. 따라서 RED-A 전체와 RED-B의 실 emitter
부분은 **미완료**로 보고한다. 기존 테스트를 새 동작에 맞춰 수정하지 않았다.

## 신규 파일 및 변경 파일

신규:

- `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/realtime/PartnerOrderAuthorityEventPublisher.java`
- `services/partner-order-service/src/test/java/com/samhanair/logis/partnerorder/realtime/PartnerOrderAuthorityEventPublisherTest.java`
- `docs/dev-reports/2026-08-07-1110-s3-authority-event-contract.md`

변경:

- `PartnerOrderRevisionService.java`
- `PartnerOrderDeleteService.java`
- `PartnerOrderHoldService.java`
- `PartnerOrderConvertService.java`
- `PartnerOrderMergeConvertService.java`
- `SlipPublishOutboxResultWriter.java`

DB migration은 없다. 새 테이블·컬럼·outbox row를 추가하지 않고 현재 브로커만 사용한다.

# 보상 실패 운영 알림 푸시 — 설계

> ⓑ 후속(#351 CompensationAuditWriter TODO seam 연동). 보상 실패 발생 시 운영자에게 알림(best-effort). slip-service 단독(기존 NotificationClient 재사용).

## 배경

`CompensationAuditWriter.record()`(L69)에 `// TODO: notification-service 운영 알림 푸시` seam 존재. 보상 실패는 미관측 시 고아 재고를 방치하므로, **발생 즉시 운영자에게 알림**(WARN 로그 + DB audit 에 더해 능동 push).

## 설계

- `CompensationAuditWriter.record()` 의 audit 저장 성공 후 **best-effort 알림** 호출.
- 기존 `NotificationClient.sendUserPush(recipientUserId, subject, body)` 재사용(신규 client 불필요).
- **config-gated**: `samhan.compensation.alert.{enabled:false, recipient-user-id}` — 기본 비활성, 운영에서 recipient 설정 + enabled 시 발송. (retention 과 동일 운영 toggle 패턴.)
- **best-effort**: 알림 호출을 try/catch 로 감싸 **실패해도 보상 audit/흐름에 무영향**(REQUIRES_NEW 트랜잭션 내, 알림 실패는 WARN 로그만). NotificationClient 자체도 내부 best-effort.
- subject/body: `[보상실패] {slipNo}` / `slipType·phase·productCode·op·cause`(UUID 비공개 — slipNo·productCode 만).
- 알림 발송을 별도 빈(`CompensationAlertNotifier`)으로 분리(테스트·관심사 분리), CompensationAuditWriter 가 주입·호출.

## 검증

- 단위: enabled+recipient 설정 시 NotificationClient.sendUserPush 호출(subject/body 검증), 미설정/disabled 시 미호출, 알림 예외 시 swallow(보상 흐름 정상).
- IT(실 Testcontainers): `@MockBean NotificationClient` — 보상 실패 발생 → audit 저장 + (enabled 시) 알림 호출 verify. skipped=0.
- Docker 실 QA: 기본 비활성 기동 확인(알림 미발송). 실 notification 발송은 운영 활성화 시(IT 갈음).

## 자기검토

- 알림 실패 best-effort(보상 audit·흐름 무영향). 기본 비활성. UUID 비공개(slipNo/productCode). DECISIONS D-SER-26. NotificationClient 재사용(신규 금지).

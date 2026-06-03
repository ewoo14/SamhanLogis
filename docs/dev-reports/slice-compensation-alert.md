# Slice: 보상 실패 운영 알림 푸시 (D-SER-26)

> branch `feat/compensation-notification-push` / 2026-06-03 / slip-service 단독.
> ⓑ 후속(#351 `CompensationAuditWriter` TODO seam 연동). 보상 실패 발생 시 WARN 로그·DB 감사에 더해 운영자에게 능동 push.

## 1. 구현

- `CompensationAlertNotifier`(@Component): 감사 행 저장 성공 후 호출. `samhan.compensation.alert.{enabled(기본 false), recipient-user-id}` config-gated — 운영에서 enabled=true + recipient 지정 시에만 발송.
- 기존 `NotificationClient.sendUserPush(recipientUserId, subject, body)` 재사용(신규 client 금지). NotificationClient 자체도 내부 graceful fallback.
- **best-effort**: notifier 가 모든 예외를 삼킴(WARN 로그만) → 알림 실패가 보상 감사(REQUIRES_NEW)/전표 흐름에 무영향. recipient blank/형식오류도 skip(설정오류는 1회 WARN 표면화).
- 알림 제목 `[보상실패] {slipNo}`, 본문은 **UUID 비공개** — slipNo·전표유형·단계·품목코드·동작·실패원인·원본원인(비즈니스 식별자만, 2000자 절단).
- `CompensationAuditWriter.record()` TODO seam(L69) → `alertNotifier.notifyFailure(...)` 연결. 생성자 notifier 주입.
- `application.yml` `compensation.alert` 블록(env override `SAMHAN_COMPENSATION_ALERT_ENABLED`/`_RECIPIENT_USER_ID`).

## 2. 검증

- 단위: `CompensationAlertNotifierTest` 5(enabled+recipient 발송·disabled 미발송·blank/malformed recipient 미발송·알림예외 swallow), `CompensationAuditWriterTest` seam 호출 verify 추가. **skip0/fail0/err0**.
- IT(실 Testcontainers): `CompensationAlertNotifierIT` — alert.enabled=true + recipient `@TestPropertySource`, `@MockBean NotificationClient`, 실 PostgreSQL/Flyway 에서 `record()` → 감사 저장 + `sendUserPush` 호출 verify. 실 Postgres 컨테이너 기동/종료 확인. BUILD SUCCESSFUL.
- 무회귀: 보상감사(#351)·복구(#355)·retention(#359) 테스트 green.

## 3. 후속

- **Phase 11 활성화**: 운영 알림 활성화 = `SAMHAN_COMPENSATION_ALERT_ENABLED=true` + `SAMHAN_COMPENSATION_ALERT_RECIPIENT_USER_ID=<운영자 user UUID>`. 컷오버 체크리스트 등재(retention 활성화와 동반).
- 다중 수신자(운영 그룹) 알림은 현 단일 recipient 로 충분; 필요 시 그룹/역할 기반 fan-out 후속.

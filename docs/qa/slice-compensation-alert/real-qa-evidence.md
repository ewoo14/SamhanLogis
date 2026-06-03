# 실 QA 증거 — 보상 실패 운영 알림 푸시 (D-SER-26)

> 2026-06-03 / branch `feat/compensation-notification-push` / slip-service 단독.
> 🚨 no-fake-data — 실 Docker 재배포 로그 + 실 Testcontainers IT 만. 합성/목업 화면 없음.

## 1. 실 Testcontainers IT (활성-경로 발송 입증)

`CompensationAlertNotifierIT` — 실 PostgreSQL/Flyway 컨테이너 기동, `samhan.compensation.alert.enabled=true`
+ recipient `@TestPropertySource`, `@MockBean NotificationClient`.

```
> Task :services:slip-service:test
...
HikariPool-1 - Shutdown completed.
BUILD SUCCESSFUL in 49s
```

- `auditWriter.record(...)` 호출 → 감사 행 저장(REQUIRES_NEW) 성공 후
  `notificationClient.sendUserPush(RECIPIENT, "[보상실패] {slipNo}", body)` 호출 verify 통과.
- 단위 `CompensationAlertNotifierTest` 5(enabled+recipient 발송 / disabled 미발송 /
  blank·malformed recipient 미발송 / 알림예외 swallow) + `CompensationAuditWriterTest` seam verify.
  **skip0 / fail0 / err0**.

## 2. 실 Docker 재배포 (기본 비활성 무회귀 기동)

slip-service bootJar(116MB, 16:50) → 이미지 재빌드 → 재배포(호스트포트 제거 overlay — 호스트 influxd 8086 점유 회피, 내부 Eureka/게이트웨이 통신 유지).

```
$ docker inspect -f '{{.State.Health.Status}}' samhan-slip-service
[1] health=healthy

$ docker logs samhan-slip-service | grep "Started SlipServiceApplication"
2026-06-03T07:53:35.934Z  INFO 1 --- [slip-service] [main]
  c.s.logis.slip.SlipServiceApplication : Started SlipServiceApplication in 8.462 seconds

$ docker logs samhan-slip-service | grep -c ERROR
0
```

- 신규 `CompensationAlertNotifier` 빈이 **기본 비활성(alert.enabled=false)** 상태로 DI 무결 와이어링 —
  기동 8.46s, ERROR 0건, BeanCreation/UnsatisfiedDependency 예외 없음.
- 알림 기본 비활성 → 발송 시도 없음(설정 누락 WARN 없음). 운영 활성화 시에만 push(`SAMHAN_COMPENSATION_ALERT_ENABLED=true` + recipient).

## 3. 결론

- 활성-경로 발송 = 실 Postgres IT 로 입증. 비활성-기본 무회귀 기동 = 실 Docker 재배포로 입증.
- best-effort(알림 실패 ≠ 보상 흐름 영향)는 단위 `notificationException_isSwallowed` 로 입증.

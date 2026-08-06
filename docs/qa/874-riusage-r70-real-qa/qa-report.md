# R70 라이브QA 보고서 — PR #1057 · 이슈 #874

## 배포 상태

`slip-service` 재배포 후 컨테이너 상태가 `restarting / unhealthy`여서 라이브QA를 진행할 수 없었다.

```text
/samhan-slip-service  Created 2026-08-05T16:44:42.120543087Z  StartedAt 2026-08-05T16:46:00.667914562Z  restarting unhealthy
/samhan-dc-config-service  Created 2026-08-05T16:44:42.119948011Z  StartedAt 2026-08-05T16:44:45.909604295Z  running healthy
```

실행한 사전 배포:

```text
.\gradlew.bat :services:slip-service:bootJar :services:dc-config-service:bootJar --console=plain  -> BUILD SUCCESSFUL
docker compose ... build slip-service dc-config-service                                  -> 성공
docker compose ... up -d --no-deps slip-service dc-config-service                         -> 성공
```

## 기동 실패 근거

`slip-service` 로그의 최초 원인:

```text
Schema-validation: missing column [preview_image] in table [quote_snapshots]
```

Hibernate `SessionFactory` 초기화 실패로 애플리케이션이 종료되고 컨테이너가 재시작을 반복했다. `dc-config-service`는 healthy였으나, 전표 저장 경로의 핵심 의존 서비스인 `slip-service`가 기동하지 않아 실브라우저 검증을 시작하지 않았다.

## R70 판정

| 항목 | 판정 | 기대/실제 | 캡처 및 근거 |
|---|---|---|---|
| ① 저장 성공, HTTP 201 및 저장 응답 원문 | **미실시** | 기대: HTTP 201과 `unitPrice`·`unitPriceWithVat`·`discountInfo` / 실제: 서비스 기동 실패 | 캡처 없음. `slip-service` unhealthy 및 기동 로그 |
| ② 전역DC 품목 화면·저장 `561,600` | **미실시** | 기대: `561,600` / 실제: 화면 진입 불가 | 캡처 없음 |
| ③ 고정DC 품목 화면·저장 `970,200` | **미실시** | 기대: `970,200` / 실제: 화면 진입 불가 | 캡처 없음 |
| ④ 한 전표 내 두 품목의 라인별 규칙 적용 | **미실시** | 기대: 라인1 `561,600`, 라인2 `970,200` / 실제: 저장 불가 | 캡처 없음 |
| ⑤ 전역DC 없는 거래처 정가 대조 | **미실시** | 기대: `1,080,000` / 실제: 저장 경로 기동 실패 | 캡처 없음 |
| ⑥ `discountInfo` 적용 규칙·할인율 및 UUID 비노출 | **미실시** | 기대: 규칙·할인율 표시, UUID 없음 / 실제: 응답 수집 불가 | 캡처 없음 |

## 범위 준수

- 내장 브라우저는 사용하지 않았다.
- `clients/desktop/playwright/874-riusage-real-qa.spec.ts`는 수정하지 않았다.
- `SENT → CONFIRMED`, 회계 배분, riUsage 사슬은 실행하지 않았다.
- DB 직접 수정과 다른 서비스의 재빌드·재배포·중지는 하지 않았다.

## 신규 파일 목록

- `docs/qa/874-riusage-r70-real-qa/qa-report.md`

## 결론

**R70 라이브QA 판정: BLOCKED / 미실시.** `quote_snapshots.preview_image` 스키마를 배포 상태와 정합화한 뒤 `slip-service`가 healthy가 된 환경에서 R70을 재실행해야 한다. 이번 라운드에서는 저장 응답 원문을 확보할 수 없으므로 PASS/FAIL 판정을 내리지 않는다.

# PR #984 R14 예약 경합 창 수정 보고서

## 진행 메모

- 2026-08-01: 보고서 파일을 먼저 생성했습니다. RED 재현, 변경, 교착 검토, 정상 경로 영향 실측을 순서대로 기록합니다.

## RED 원문

경계를 직접 호출하는 단위 테스트를 먼저 추가했습니다. `ProductAliasClient`가 commit 이후 release 예약을 제공하지 않는 상태에서 실행한 원문은 다음과 같습니다.

```text
명령: .\gradlew.bat :services:accounting-service:test --tests com.samhanair.logis.accounting.client.ProductAliasClientTest --no-daemon
종료코드: 1

ProductAliasClientTest.java:167: error: cannot find symbol
    client.releaseReservationsAfterTransactionCompletion();
    ^
symbol: method releaseReservationsAfterTransactionCompletion()
```

이는 테스트 오류가 아니라, commit 후 경계가 production API에 없어서 발생한 의도된 RED입니다.

## 변경 요지

- `Mig8OrderTransformService`의 정상 반환 경로는 `finally`에서 원격 release하지 않고 `releaseReservationsAfterTransactionCompletion()`을 등록합니다.
- `ProductAliasClient`는 Spring transaction synchronization이 활성화되어 있으면 정상 변환 reservation을 `afterCommit`에서 release합니다. rollback이면 `afterCompletion`에서 즉시 release하고, 트랜잭션이 없는 직접 호출은 즉시 release합니다.
- `afterCommit`과 `afterCompletion(COMMITTED)`가 중복 호출되어도 한 번만 release하도록 콜백 내부에 one-shot guard를 두었습니다.
- resolver 응답 2회와 line upsert 사이의 reservation은 accounting transaction commit까지 유지됩니다. 따라서 resolver가 반환한 UUID를 line에 확정하기 전에 원격 reservation이 풀리지 않습니다.
- 예외가 발생한 경우에는 기존처럼 `finally`에서 즉시 release하여 정상 임포트가 무한정 기다리지 않으며, 확정된 line이 없는 rollback 경로도 즉시 정리됩니다.
- product-service, sheet sync, 직접 삭제, native import 코드와 advisory lock 정의는 수정하지 않았습니다. V16 migration도 필요하지 않습니다.

## 교착 검토

이번 수정은 advisory lock 범위를 넓히지 않았고 새 DB lock을 추가하지 않았습니다. accounting 변환이 기존 `MIG8_ORDER_TRANSFORM` transaction lock을 잡는 순서는 그대로이며, sheet sync·직접 삭제·native import가 accounting lock을 역순으로 획득하는 경로도 새로 만들지 않았습니다.

정상 경로에서는 DB commit이 먼저 끝난 뒤 HTTP release callback이 실행되므로 callback이 sheet sync·직접 삭제·native import의 DB lock을 기다리지 않습니다. 반대로 세 product 경로도 callback lock을 기다리지 않습니다. 따라서 이번 변경으로 추가된 lock 획득 순서는 `0개`, 새 교착 cycle은 `0개`입니다. 기존 product 경로의 서로 다른 advisory lock 계층은 이번 라운드에서 변경하지 않았습니다.

## 실측

### 경합 창이 닫혔음을 보이는 근거

- commit 경계 테스트는 resolver HTTP 호출 후 release HTTP expectation을 미리 걸고, commit callback 전 `server.verify()`가 미충족 assertion으로 실패하는지 확인한 뒤 `triggerAfterCommit()`을 호출합니다. callback 전 release `0건`, callback 후 release `1건`입니다.
- rollback 경계 테스트는 `triggerAfterCompletion(STATUS_ROLLED_BACK)` 직후 resolver `1건`과 release `1건`을 검증합니다.
- 기존 MIG-8 변환 테스트의 정상 lookup·재검증·lookup miss·resolver 실패 경로를 함께 실행해, 성공 시 예약 등록 경계와 예외 시 즉시 정리 경계를 같이 확인했습니다.

### 정상 경로 영향 건수

정적 변경 범위와 focused 실측을 함께 세었습니다.

| 경로 | production 변경 파일 | 새 lock/대기 지점 | focused 테스트 | 결과 |
|---|---:|---:|---:|---|
| sheet sync | 0 | 0 | 기존 경로 코드·테스트 조사 | 정상 경로 영향 0건 |
| 직접 삭제 | 0 | 0 | `ProductServiceTest` 50건 | 50/50 통과 |
| native import | 0 | 0 | `EcountProductImporterTest` 20건 + 동일명 병합 1건 | 21/21 통과 |
| accounting MIG-8 | 2 | 0 | `ProductAliasClientTest` 8건 + `Mig8OrderTransformServiceTest` | 통과 |

이번 변경은 product-service의 reservation endpoint 계약, sheet sync, 직접 삭제, native import를 호출하거나 수정하지 않습니다. 따라서 세 정상 경로의 변경 영향 건수는 각각 `0건`입니다. 실제 live replay는 원본 데이터 부재와 공유 DB write 금지 조건 때문에 수행하지 않았습니다.

## 테스트

- RED: `.\gradlew.bat :services:accounting-service:test --tests com.samhanair.logis.accounting.client.ProductAliasClientTest --no-daemon` — 종료코드 `1` (의도된 compile RED).
- GREEN focused: `.\gradlew.bat :services:accounting-service:test --tests com.samhanair.logis.accounting.client.ProductAliasClientTest --tests com.samhanair.logis.accounting.service.Mig8OrderTransformServiceTest --no-daemon` — 종료코드 `0`, `BUILD SUCCESSFUL`.
- product 정상 경로: `.\gradlew.bat :services:product-service:test --tests com.samhanair.logis.product.service.ProductServiceTest --tests com.samhanair.logis.product.service.EcountProductImporterTest --tests com.samhanair.logis.product.service.EcountProductImporterSameNameMergeTest --no-daemon` — 종료코드 `0`, `BUILD SUCCESSFUL`.
- accounting-service 전체: `.\gradlew.bat :services:accounting-service:test --no-daemon` — 종료코드 `124` (184초 timeout, **미판정**). 전체 모듈 결과는 CI에 위임합니다.
- 정적 공백 검사: `git diff --check` — 종료코드 `0`.

## 신규 파일 및 변경 파일

신규 파일:

- `docs/dev-reports/2026-08-01-984-r14-reservation-window.md`

변경 파일:

- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/client/ProductAliasClient.java`
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/Mig8OrderTransformService.java`
- `services/accounting-service/src/test/java/com/samhanair/logis/accounting/client/ProductAliasClientTest.java`

`git status --porcelain` 원문:

```text
 M services/accounting-service/src/main/java/com/samhanair/logis/accounting/client/ProductAliasClient.java
 M services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/Mig8OrderTransformService.java
 M services/accounting-service/src/test/java/com/samhanair/logis/accounting/client/ProductAliasClientTest.java
?? docs/dev-reports/2026-08-01-984-r14-reservation-window.md
```

## 이번에 안 본 것

- 원본 26,055행 live replay: 이 PC에 원본이 없어 **미판정**.
- Docker 재빌드·재기동 및 공유 DB write를 금지했으므로 live API throwaway reservation 생성·삭제 실험은 수행하지 않음.
- accounting-service 전체 테스트: timeout으로 **미판정**, CI에 위임.
- R12 회복 경로, 미해소 라인 보존·전표 차단·미해소 표시·거부 상세: 이번 변경에서 수정하거나 재판정하지 않음.
- Issue #1000 범위 및 선두 token 매칭 규칙: 보지 않음.

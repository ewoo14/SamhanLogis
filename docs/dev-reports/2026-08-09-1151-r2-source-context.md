# PR #1151 R2 — journal 원전표 sourceContext 전달

## 판정

SOL의 결함 ①을 재현했고 수정했다. 기존에는 `slip-service`의 재고 mutation 4개 호출이 모두 journal 연결 정보 없이 전송되어 `slip_id`·`slip_revision`이 NULL이 될 수 있었다. 이제 호출자가 `slip.id`와 `revisionCount`를 `sourceContext`로 선언한다.

## ① 선언 방식

`SlipService.sourceContext(Slip)`가 `Slip.id`와 `Slip.revisionCount`를 읽어 `SourceOperationContext(UUID.randomUUID(), slipId, slipRevision)`를 만든다.

- 선언 helper: `services/slip-service/src/main/java/com/samhanair/logis/slip/service/SlipService.java:1219-1223`
- HTTP client 계약: `services/slip-service/src/main/java/com/samhanair/logis/slip/client/InventoryClient.java:107-115,132-168,184-205,237-256`
- 수신 DTO 필수화: `services/inventory-service/src/main/java/com/samhanair/logis/inventory/web/dto/DeductRequest.java:12-19`, `InboundRequest.java:11-25`, `BatchInboundInstanceRequest.java:16-47`, `ShipBatchInstanceRequest.java:9-25`
- NULL fallback 제거: `services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/SourceOperationJournalWriter.java:21-31`

`slip-service`와 `inventory-service`는 서비스 경계를 넘는 Java 의존성을 만들지 않고 같은 JSON shape의 로컬 `SourceOperationContext`를 사용한다. 전송 JSON은 `sourceContext.sourceOperationId`, `sourceContext.slipId`, `sourceContext.slipRevision`이다.

## ② 4개 API 전수 확인

| API | slip-service 호출 지점(파일:줄) | sourceContext 전달 여부 | journal의 slipId 채워짐 |
|---|---|---|---|
| `deduct` | `services/slip-service/src/main/java/com/samhanair/logis/slip/service/SlipService.java:1157-1158` | `sourceContext(slip)` 전달 | 예. writer가 `context.slipId()`를 저장 |
| `ship-batch` | 같은 파일 `:1152-1153` | `sourceContext(slip)` 전달 | 예 |
| `lots/inbound` | 같은 파일 `:1211-1216` (line id 유무 두 경로 모두) | 두 경로 모두 전달 | 예 |
| `instances/batch` | 같은 파일 `:1189-1192` | `sourceContext(slip)` 전달 | 예 |

전수 검색 결과, 일반 입고 lot는 line id가 있는 경로와 legacy line id가 없는 경로가 모두 있으며 둘 다 1건도 빠뜨리지 않았다.

## ③ 선언 누락이 드러나는 장치

1. 네 inventory 요청 DTO의 `sourceContext`에 `@NotNull`을 붙였다. HTTP body에서 빠지면 mutation 전에 validation 오류로 거부된다.
2. `SourceOperationJournalWriter`는 `context == null || slipId == null || slipRevision == null`을 `INVALID_INPUT`으로 거부한다. 기존의 NULL 대체 레코드 생성을 제거했다.
3. `InventoryClient`의 구계약(컨텍스트 없는 4개 메서드)은 `IllegalArgumentException`으로 즉시 실패한다. HTTP를 보내거나 NULL journal을 만들지 않는다.
4. `InventoryClientTest`는 네 API body의 `slipId`·`slipRevision`을 검증하고, `legacyDeduct_withoutSourceContext_failsBeforeHttpCall`로 RED-C를 고정한다.

## ④ 양방향 RED/GREEN

### RED-A

전표 경로로 재고 작업을 수행해도 journal 11건 전부 `slip_id = NULL · slip_revision = NULL`이었다. 호출 body에 sourceContext가 없어 원전표를 복원할 수 없었다.

### RED-B

기존 정방향 계약은 응답 shape, HTTP endpoint, `fromReservation`, line별 호출, transaction/saga 흐름을 바꾸지 않고 body에 sourceContext만 추가한다. journal 기록은 같은 mutation transaction 안에 남아 journal 제약/기록 실패 시 lot·잔량·movement와 함께 rollback된다. `createdLotIds`와 `createdInstanceIds` 집합 생성 로직은 변경하지 않았다.

### RED-C

sourceContext 없이 호출하면 조용히 NULL이 되던 것이 문제였다. 이제 HTTP DTO validation, writer fail-fast, Java 구계약 fail-fast의 세 층에서 드러난다.

### 동시 GREEN 증거

- `./gradlew :services:slip-service:test --tests 'com.samhanair.logis.slip.client.InventoryClientTest' --rerun-tasks` — BUILD SUCCESSFUL
- `./gradlew :services:inventory-service:test --tests '*Journal*' --tests '*Source*' --rerun-tasks` — exit 0
- `./gradlew :services:slip-service:test --tests '*Inspection*' --rerun-tasks` — BUILD SUCCESSFUL

## ⑤ 결함 ② 경계

비상품 `ship-batch`의 제외 게이트는 이 변경에서 만들거나 수정하지 않았다. 현재 `StockInstanceService.shipBatch`의 journal outcome 계산은 `reserved.isEmpty()` 결과를 `NO_OP_EXISTING`/`APPLIED`로 매핑하는 기존 단일 지점(`services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/StockInstanceService.java:226-228`)에 남겨 두었다.

`#1152`가 추가할 비상품 제외 게이트가 그 결과를 소유해야 하며, 게이트가 제외로 판정한 경우 outcome을 `NO_OP_EXCLUDED`로 공급하도록 같은 경계를 이어서 변경해야 한다. 이 PR에서는 게이트 자체나 비상품 판정을 추가하지 않아 충돌 범위를 만들지 않았다.

## V24 및 rollback 불변식

V24 스키마·인덱스·제약은 변경하지 않았다. source journal writer는 기존 transaction 안에서 호출되므로 journal 제약 실패는 기존과 같이 mutation rollback 경로에 포함된다. 신규 lot/instance ID 집합을 계산하는 코드는 건드리지 않았다.

## 라이브 QA

실행 전 확인:

```text
127.0.0.1:8080 LISTEN — gateway만 확인됨
127.0.0.1:5175/5273 renderer 미기동
QA_MASTER_PASSWORD=missing
QA_DEV_DEFAULT_PASSWORD=missing
```

`clients/desktop`의 real-QA 경로는 `playwright.real-qa.config.ts`와 `resolveQaShotsDir` 규약을 확인했다. 그러나 이 세션의 in-app browser 연결도 `No browser is available`로 실패했고, 권한 있는 실 계정 비밀번호와 renderer가 없어 입고 검수 완료 → journal slipId 실측을 수행할 수 없었다. 따라서 캡처를 성공으로 가장하지 않고 실패 원문을 남긴다. 실 QA를 재개할 때는 반드시 `${BASE_URL}/#/경로`, 화면 고유 요소 단언, `headless: true`, mock OFF, `resolveQaShotsDir`를 사용해야 한다.

## 신규 파일 및 변경 파일

신규:

- `services/slip-service/src/main/java/com/samhanair/logis/slip/client/SourceOperationContext.java`
- `docs/dev-reports/2026-08-09-1151-r2-source-context.md`

변경:

- `services/slip-service/src/main/java/com/samhanair/logis/slip/client/InventoryClient.java`
- `services/slip-service/src/main/java/com/samhanair/logis/slip/service/SlipService.java`
- `services/slip-service/src/test/java/com/samhanair/logis/slip/client/InventoryClientTest.java`
- `services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/SourceOperationJournalWriter.java`
- `services/inventory-service/src/main/java/com/samhanair/logis/inventory/web/dto/{DeductRequest,InboundRequest,BatchInboundInstanceRequest,ShipBatchInstanceRequest}.java`
- `services/inventory-service/src/test/java/com/samhanair/logis/inventory/domain/SourceOperationJournalContractTest.java`
- `services/inventory-service/src/test/java/com/samhanair/logis/inventory/it/SourceOperationJournalRollbackIT.java`

# PR #1151 R3 — sourceContext 테스트 재수렴

- 일자: 2026-08-09 (Asia/Seoul)
- 워크트리: `C:\dev\Samhan-Public\.claude\worktrees\t1142`
- HEAD 기준: `c718a75e2`
- 제약: commit/push 없음, 다른 워크트리·main 접근 없음, 실 DB 쓰기 없음

## 1. 실패 21건 전수 표

실패 원인은 공통으로 R2에서 재고 mutation API의 `sourceContext` 필수 overload가 호출되도록 바뀌었지만, 기존 Mockito 검증/스텁이 deprecated 구 overload를 계속 지정한 것이다. 각 조치는 마지막 인자에 `any(SourceOperationContext.class)`를 추가하는 최소 변경이다.

| 테스트 | 실패 이유 | 조치 |
|---|---|---|
| `SlipInboundInstanceIT.complete_serialLine_callsInboundInstances` | inboundInstances 7-인자 호출을 6-인자로 검증 | sourceContext matcher 추가 |
| `SlipInboundInstanceIT.complete_batchLine_callsLotInbound` | inbound 7-인자 호출을 6-인자로 검증 | sourceContext matcher 추가 |
| `SlipInboundInstanceIT.complete_mixedLines_routesEachLine` | serial/batch 두 mutation 검증이 구 overload | 두 검증에 matcher 추가 |
| `SlipInboundInstanceIT.complete_borrowTag_usesBorrowInboundType` | inboundInstances 구 overload 검증 | matcher 추가 |
| `SlipInboundInstanceIT.complete_returnTag_batchLine_callsLotInbound` | inbound 구 overload 검증 | matcher 추가 |
| `SlipInboundInstanceIT.complete_returnMixedBatchFailure_unrecallsSerialAndRollsBackSlipStatus` | 실패를 유발할 inbound stub과 InOrder 검증이 구 overload | stub·검증 모두 matcher 추가 |
| `SlipInboundInstanceIT.complete_inventoryFailure_rollsBackSlipStatus` | inboundInstances 실패 stub이 구 overload | matcher 추가 |
| `SlipOutboundInstanceIT.complete_outboundSerialAndBatch_routesShipAndDeduct` | shipInstances/deduct 검증과 serial never 검증이 구 overload | 세 검증에 matcher 추가 |
| `SlipServiceTest.complete_outbound_callsInventoryDeduct_fromReservationTrue` | deduct 구 overload 검증 | matcher 추가 |
| `SlipServiceTest.complete_outbound_mixedSerialAndBatch_routesSerialShipAndBatchDeduct` | shipInstances·deduct·never 검증이 구 overload | matcher 추가 |
| `SlipServiceTest.complete_inbound_callsInventoryInbound` | inbound 구 overload 검증 | matcher 추가 |
| `SlipServiceTest.complete_inbound_authoritativeBatch_usesSupplyUnitCostWithoutVat` | inbound 구 overload 검증 | matcher 추가 |
| `SlipServiceTest.complete_inbound_serialProduct_callsInventoryInboundInstances` | inboundInstances 구 overload 검증 | matcher 추가 |
| `SlipServiceTest.complete_inbound_authoritativeSerial_usesSupplyUnitCostWithoutVat` | inboundInstances 구 overload 검증 | matcher 추가 |
| `SlipServiceTest.complete_inbound_duplicateSerialProductLines_aggregatesQuantityForIdempotentBatch` | inboundInstances 구 overload 검증 | matcher 추가 |
| `SlipServiceTest.complete_inbound_mixedSerialAndBatch_routesEachLine` | inboundInstances와 inbound 검증이 구 overload | 두 검증에 matcher 추가 |
| `SlipServiceTest.complete_inbound_borrowSerialProduct_usesBorrowInboundType` | inboundInstances 구 overload 검증 | matcher 추가 |
| `SlipServiceTest.complete_inbound_returnTag_batchProduct_keepsLotInboundPath` | inbound 구 overload 검증 | matcher 추가 |
| `SlipServiceTest.complete_inbound_returnTag_batchDuplicateLines_passesEachLineToInventory` | 두 inbound 검증이 구 overload | 두 검증에 matcher 추가 |
| `SlipServiceTest.complete_inbound_returnTag_mixedSerialAndBatch_routesEachLine` | InOrder inbound와 serial never 검증이 구 overload | matcher 추가 |
| `SlipServiceTest.complete_inbound_returnTag_mixedSerialAndBatch_batchFailureUnrecallsSerial` | 실패 inbound stub와 InOrder 검증이 구 overload | stub·검증 모두 matcher 추가 |

## 2. 단정을 지켰는지 확인

각 테스트에서 추가한 것은 `SourceOperationContext` 타입 matcher뿐이다. 그대로 둔 것은 다음이다.

- 재고 수량, product/warehouse/slip 식별자, inbound type, unit cost
- serial/batch 분기와 호출 횟수
- `never()` 경로
- `PROCESSING`/`INSPECTING` 상태 전이
- 예외 타입·메시지, 보상 순서, suppressed exception, audit 기록

`git diff -- '*Test*.java' '*IT.java'`에서 삭제된 것은 구 overload를 지정한 Mockito `verify/when` 줄뿐이다. 별도 확인 명령에서도 삭제된 `assertThat`, `assertEquals`, `isEqualTo`, `isInstanceOf`, `hasMessage`, `contains` 단정은 0건이었다. 구 matcher 줄은 새 overload matcher로 대체되어 회귀 신호를 약화하지 않았다.

## 3. 재실행 원문

사용자가 지정한 와일드카드 전체 명령은 slip-service 전체에 가까운 범위를 선택해 304초 제한에 걸렸다. 이는 테스트 실패 종료가 아니라 실행 제한이다.

```text
.\gradlew :services:slip-service:test --tests '*Slip*' --rerun-tasks
command timed out after 308xxx milliseconds
```

21건을 포함하는 관련 묶음은 다음 명령으로 재실행했고 성공했다.

```text
.\gradlew.bat :services:slip-service:test \
  --tests "com.samhanair.logis.slip.client.InventoryClientTest" \
  --tests "com.samhanair.logis.slip.service.SlipServiceTest" \
  --tests "*SlipInboundInstanceIT" \
  --tests "*SlipOutboundInstanceIT" \
  --rerun-tasks --no-daemon

BUILD SUCCESSFUL in 2m 4s
```

JUnit XML 원문 집계:

```text
InventoryClientTest       tests=18 failures=0 errors=0
SlipServiceTest           tests=52 failures=0 errors=0
SlipInboundInstanceIT     tests=10 failures=0 errors=0
SlipOutboundInstanceIT    tests=4  failures=0 errors=0
total                     tests=84 failures=0 errors=0
```

`SlipServiceTest` 단독도 `BUILD SUCCESSFUL in 1m 6s`였다. R3 과정에서 slip-units 필터가 추가로 드러낸 `SlipServiceCompensationTest.completeRecallInbound_batchInboundFailsAndUnrecallFails_recordsAuditAndKeepsOriginalSuppressed`도 같은 방식으로 보강했고, 단독 실행은 `BUILD SUCCESSFUL in 34s`였다.

## 4. 세 CI 묶음 확인 결과

| CI 묶음 | 확인 결과 | 원문/판정 |
|---|---|---|
| `slip-units` | 추가 compensation 수정 후 통과 | CI 동일 필터 `BUILD SUCCESSFUL in 1m 35s`; 초기 실행은 918 tests 중 1건이 compensation sourceContext stub 불일치 |
| `slip-it-core` | 전체 필터는 환경 제한으로 미완료 | CI 동일 필터 및 `com.samhanair.logis.slip.it.*` 하위 실행이 각각 304초 timeout; assertion 종료 원문 없음 |
| `user+product+inventory+logging` | inventory 추가 red 확인 | product는 FROM-CACHE 성공, user/logging 실패 출력 없음; inventory `565 tests completed, 27 failed, 1 skipped` |

inventory 27건의 첫 실패 원문은 다음과 같다.

```text
InventoryControllerIT: expected 201/403 but was 400
InventorySetExclusionIT:
  BusinessException: sourceContext 의 slipId/slipRevision 은 재고 mutation journal에 필수입니다
```

이는 inventory-service 테스트 fixture가 새 필수 request body를 아직 보내지 않는 별도 재수렴 범위다. 이번 작업에서 기능 코드와 #1152 비상품 게이트는 변경하지 않았으며, 이 27건 때문에 현재 CI 전체 green을 주장하지 않는다.

## 5. 신규·변경 파일

- `services/slip-service/src/test/java/com/samhanair/logis/slip/it/SlipInboundInstanceIT.java`
- `services/slip-service/src/test/java/com/samhanair/logis/slip/it/SlipOutboundInstanceIT.java`
- `services/slip-service/src/test/java/com/samhanair/logis/slip/service/SlipServiceTest.java`
- `services/slip-service/src/test/java/com/samhanair/logis/slip/service/SlipServiceCompensationTest.java`
- `docs/dev-reports/2026-08-09-1151-r3-test-reconvergence.md`

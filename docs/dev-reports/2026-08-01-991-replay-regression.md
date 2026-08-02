# 2026-08-01-991 replay regression

## 확인 1 — 작업 지침과 핸드오프

- 사용자 지시대로 git 명령은 사용하지 않는다.
- 대상은 `slip-service`의 단건·병합 replay 회귀이며, 보고서는 확인 즉시 append한다.
- 현재 핸드오프에는 #991의 이전 단가 축 결함 기록이 있으나, 이번 요청의 exact SHA와 `categoryKey` 회귀를 별도로 실행 검증한다.

## 확인 2 — 코드 경로

- 단건·병합 모두 현재 fingerprint는 `canonicalLines()`를 사용하고 `categoryKey`를 포함한다.
- 배송주소가 없는 요청은 별도로 legacy fingerprint를 계산하고, replay 시 `legacyReplayMatches()`도 함께 요구한다.
- legacy fingerprint의 line canonicalizer는 `categoryKey`를 제외한다.
- `linesMatch()`는 현재 전표 라인과 요청 라인의 product/수량/단가/spec/note/sourceOrderLineId만 비교하고 `categoryKey`는 비교하지 않는다.
- 다음 단계는 실제 테스트 실행으로 409와 저장 audit fingerprint의 불일치를 출력해 확증하는 것이다.

## 확인 3 — 결함 재현 RED 원문

실행:

```text
./gradlew :services:slip-service:test --tests 'com.samhanair.logis.slip.publish.SlipPublishControllerIT.배포전_단건멱등키_배송주소없는_재시도는_기존전표를_replay한다' --tests 'com.samhanair.logis.slip.publish.SlipPublishMergeIT.배포전_병합멱등키_배송주소없는_재시도는_기존전표를_replay한다' --no-daemon
```

출력:

```text
SlipPublishControllerIT > 배포전_단건멱등키_배송주소없는_재시도는_기존전표를_replay한다() FAILED
    java.lang.AssertionError at SlipPublishControllerIT.java:202

SlipPublishMergeIT > 배포전_병합멱등키_배송주소없는_재시도는_기존전표를_replay한다() FAILED
    java.lang.AssertionError at SlipPublishMergeIT.java:543

2 tests completed, 2 failed

BUILD FAILED
```

Testcontainers skip 메시지는 이 실행에 나타나지 않았고 두 IT가 실제로 실행되어 실패했다.

## 확인 4 — 실행으로 확증한 어긋남

실패 실행의 Spring 로그 원문:

```text
[replay-diagnostic-single] result=false delivery=null partnerName=true shipping=true receiver=true warehouse=true requester=true memo=true lines=false
[replay-diagnostic-line] index=0 productName actual=에어컨 requested=에어컨 quantity actual=3 requested=3 unitPrice actual=100000.00 requested=110000 spec actual=220V 4HP requested=220V 4HP note actual=PO 라인 requested=PO 라인 sourceOrderLineId actual=null requested=null categoryKey actual=null requested=null
[replay-diagnostic] slip=2026/05/04-1 existingFingerprint=3b59d15cc61baed204450a932255f00d273cc246e3f9f179385308775c79ca98 newFingerprint=3f8ea84465c2e6a1757b10319117ecdbb3335b286e490d3a2008bf794ad84066 legacyFingerprint=3b59d15cc61baed204450a932255f00d273cc246e3f9f179385308775c79ca98 legacyPayloadMatches=false existingDeliveryAddress=null matchesCurrent=false matchesLegacy=false

[replay-diagnostic-merge] result=false delivery=null partnerName=true shipping=true receiver=true warehouse=true requester=true memo=true lines=false
[replay-diagnostic-line] index=0 productName actual=병합 테스트 제품1 requested=병합 테스트 제품1 quantity actual=2 requested=2 unitPrice actual=100000.00 requested=110000 spec actual=null requested=null note actual=null requested=null sourceOrderLineId actual=null requested=null categoryKey actual=null requested=null
[replay-diagnostic] slip=2026/05/31-1 existingFingerprint=d6e491a06af7a73f5d504a5dcf46988b6a7e942374e26d7cc4fcb0e3bba78003 newFingerprint=c269b80ce25a5e5cdc7d287cadf68575e585a8becf1dfda2478f138873a65a09 legacyFingerprint=d6e491a06af7a73f5d504a5dcf46988b6a7e942374e26d7cc4fcb0e3bba78003 legacyPayloadMatches=false existingDeliveryAddress=null matchesCurrent=false matchesLegacy=false
```

확정된 원인: 저장 라인의 `unitPrice=100000.00`은 VAT 포함 요청 `unitPriceVat=110000`을 VAT 제외 공급단가로 환산한 정상 저장값인데, legacy replay 판정의 `linesMatch()`가 이를 요청의 VAT 포함 단가 `110000`과 직접 비교한다. 따라서 두 지문은 legacy 지문끼리 동일해도 `legacyPayloadMatches=false`가 되어 409가 발생한다. `categoryKey`는 로그상 비교 대상에서 빠져 있으며 현행 지문(`newFingerprint`)에는 포함되어 있어 별도 불변식 C는 유지해야 한다.

이번 RED는 이미 존재하던 두 회귀 테스트를 대상으로 확인했으며, 이 단계에서는 production fix를 적용하지 않았다.

## 확인 5 — 최소 수정 및 대상 GREEN

수정:

- `linesMatch()`에서 `unitPriceVat` 요청은 저장된 `SlipLine.unitPriceWithVat`와 비교하고, VAT 제외 입력만 `unitPrice`와 비교한다.
- `linesMatch()`에 `categoryKey` 동일성 비교를 추가했다. 따라서 categoryKey가 달라 발행 결과가 달라지는 요청은 legacy replay로 통과하지 않는다.
- 실행 원인 출력용 임시 로그는 수정 후 제거했다.

대상 두 테스트 실행 결과 원문:

```text
> Task :services:slip-service:test

BUILD SUCCESSFUL in 48s
18 actionable tasks: 2 executed, 16 up-to-date
```

## 확인 6 — `slip-service` 전체 테스트

실행:

```text
./gradlew :services:slip-service:test --no-daemon
```

첫 전체 실행은 180초 실행 도구 제한으로 중단되어 성공 판정하지 않았다. 이후 남은 Gradle worker가 `build/test-results/test/binary/output.bin`을 잠근 상태를 확인하고, 해당 워크트리의 orphaned Gradle Java process만 종료한 뒤 같은 전체 명령을 재실행했다.

최종 실행 원문:

```text
> Task :services:slip-service:test

BUILD SUCCESSFUL in 4m 13s
18 actionable tasks: 1 executed, 17 up-to-date
OpenJDK 64-Bit Server VM warning: Sharing is only supported for boot loader classes because bootstrap classpath has been appended
```

Gradle HTML summary 원문:

```text
tests    1529
failures 0
ignored  0
```

이번 전체 실행에서는 Testcontainers skip이 발생하지 않았고, 1529 tests / 0 failures / 0 ignored로 완료됐다.

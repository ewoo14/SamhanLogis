# #1074 S3 — 출고일 가드 RED-B 진단 및 fixture 기준 수정

## 결론

이번 실패는 **B: 테스트 fixture가 서버의 KST 업무일 기준과 달랐음**이다.

가드 적용 경로는 `services/slip-service/src/main/java/com/samhanair/logis/slip/service/SlipService.java:272-279`의 `slipType == OUTBOUND` 신규 생성 분기이며, 첨부파일 IT가 만드는 전표도 실제로 `OUTBOUND` 신규 전표다. 따라서 가드가 INBOUND나 기존 전표 수정 경로까지 넓게 걸린 A가 아니다.

문제 fixture는 `PublicSlipAttachmentControllerIT.createBatchedSlip()`의 기존 코드였다.

```java
String today = LocalDate.now().toString();
```

서비스는 `TimeConfig`에서 `Clock.system(ZoneId.of("Asia/Seoul"))`를 주입하고, `OutboundCutoffGuard.java:51`에서 `LocalDate.now(clock.getZone())`와 비교한다. CI 실패 시각은 XML상 `2026-08-07T20:57`(UTC), 서비스 로그상 `2026-08-08T05:57+09:00`(KST)였다. 즉 fixture의 `LocalDate.now()`는 `2026-08-07`, 서버의 KST 오늘은 `2026-08-08`이어서 `OutboundCutoffGuard.java:52-53`의 과거 신규 출고 차단으로 409가 발생했다.

fixture를 다음처럼 수정했다.

```java
String today = LocalDate.now(ZoneId.of("Asia/Seoul")).toString();
```

생산 가드 코드는 수정하지 않았다. 이 변경으로 신규 과거 출고 차단, 기존 과거 전표 수정 허용, 마감 전·후 당일/익일 정책 및 KST 계산 불변식을 유지한다.

## 재현 및 검증

### 대상 회귀 테스트

명령:

```text
./gradlew :services:slip-service:test --tests '*PublicSlipAttachmentControllerIT.upload_hyphenSlipNoSlug_returns201_andStoresAttachment*' --console=plain
```

결과:

```text
BUILD SUCCESSFUL in 29s
```

XML 원문 집계: `tests="1" skipped="0" failures="0" errors="0"`.

### slip-service 전건 실행 — 필수 명령 원문

명령(파이프 없음):

```text
./gradlew :services:slip-service:test
```

결과 원문:

```text
SlipRealtimeControllerIT > sseSubscribe_returnsEventStreamWithConnectedEvent() FAILED
DeliveryBatchControllerIT > autoGroup_managerRole_returns200() FAILED
SlipDriverFieldsIT > createSlip_withDriverContact_persistsAndReturnsFields() FAILED
PartnerProductPriceMemoryIT > bundleHeadProductSwappedToUnrelatedItem_dropsLineageAndRemembersUserPrice() FAILED
SlipControllerIT > salesRole_postSlip_returns201() FAILED
SlipInspectControllerIT > complete_transitionsToInspecting() FAILED
SlipLifecycleControllerIT > outbound_fullLifecycle_DraftToConfirmed() FAILED
SlipPublishControllerIT > publishFromEstimate_returns201_andSlipNo() FAILED

> Task :services:slip-service:test FAILED

1713 tests completed, 146 failed

BUILD FAILED in 8m 7s
```

동일 명령을 fixture 수정 후 다시 실행했으며 결과는 동일하게 `1713 tests completed, 146 failed`였다. 실패 146건 중 다수는 기존 IT가 `2026-05-04`, `2026-06-03` 같은 과거 날짜로 **신규 OUTBOUND**를 생성하는 fixture이고, 실제 실패 원문은 다음과 같았다.

```text
java.lang.AssertionError: Status expected:<201> but was:<409>
com.samhanair.logis.common.exception.BusinessException:
  과거 출고일 신규 전표는 생성할 수 없습니다
at OutboundCutoffGuard.assertWithinCutoffForCreation(OutboundCutoffGuard.java:53)
at SlipService.create(SlipService.java:279)
```

이 전건 결과는 PR 브리핑의 `885 tests completed, 1 failed`와 현재 워크트리의 실제 실행 집합이 다르다는 사실도 보여준다. 본 라운드에서는 이들 과거 날짜 fixture를 일괄 변경하거나 가드를 우회하지 않았다. 그것은 이번 첨부파일 IT의 RED-B 원인 수정 범위를 넘어가며, 불변식 `신규 과거 출고일 서버 차단`과 충돌할 수 있다.

### `dateUtils.ts` / `deliverySchedule.ts` 전수 확인

저장소 전체 사용처를 확인한 결과 두 유틸은 `clients/desktop`에서만 사용된다.

- `deliverySchedule.ts`: `SlipFormPage.tsx` 및 `deliverySchedule.test.ts`
- `dateUtils.ts`: `SlipFormPage.tsx`, 회계/마감/원장 화면 여러 곳, 그리고 `deliverySchedule.test.ts`의 `toKstDateISO`
- 다른 백엔드 서비스의 사용처: 없음
- 관련 테스트: `deliverySchedule.test.ts` — `37 tests passed`

## 변경 파일 / 삭제 통계

- 수정: `services/slip-service/src/test/java/com/samhanair/logis/slip/attachment/it/PublicSlipAttachmentControllerIT.java` 1개
- 신규: `docs/dev-reports/2026-08-08-1074-s3-guard-scope-fix.md` 1개
- 생산 코드 신규/수정: 없음
- `git diff --stat` 기준 삭제: `1 line` (UTC `LocalDate.now()` 한 줄을 KST 기준 호출로 교체)
- 커밋·push: 하지 않음
- 공유 Docker 스택 재기동·DB 직접 쓰기·QA 전표 삭제: 하지 않음

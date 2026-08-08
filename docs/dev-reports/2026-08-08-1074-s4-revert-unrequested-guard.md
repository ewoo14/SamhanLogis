# #1074 S4 — 요청되지 않은 과거 출고일 서버 가드 되돌림

## 결론

S2가 추가한 **신규 OUTBOUND 과거 출고일 409 거부 규칙만 되돌렸다**. 기존 배송태그별 마감시각 가드, 마감 후 당일 차단, 익일 생성, M/N 계약, N 수동 수정 보존, KST 날짜 계산, 화면 `min=today`는 유지했다.

S3가 수정한 `PublicSlipAttachmentControllerIT`의 날짜 fixture는 `LocalDate.now()`로 원상 복구했다. 기존 fixture가 과거 출고일 신규 전표를 만드는 것은 established 동작이며, 서버가 만든 규칙에 fixture 146건을 맞추지 않았다.

## 되돌린 변경

- `OutboundCutoffGuard.assertWithinCutoffForCreation(...)` 및 과거 날짜 409 예외 제거
- 수동 생성, 복사, 견적 변환, 발행 3경로, 모바일 주문의 호출을 기존 `assertWithinCutoff(...)`로 복구
- 과거 출고일 서버 거부 전용 테스트 및 그 보조 테스트 제거
- `PublicSlipAttachmentControllerIT.createBatchedSlip()` 날짜 계산을 `LocalDate.now()`로 복구

`services/slip-service`에서 `assertWithinCutoffForCreation` 및 `과거 출고일 신규 전표` 잔여 참조는 0건이다.

## diff 확인

S4 작업 트리와 S2 직전 기준 커밋의 서버 코드/테스트 비교:

```text
git diff fc155e2d8 -- services/slip-service/src/main services/slip-service/src/test
결과: 0 lines
```

S3 fixture 비교:

```text
git diff -- services/slip-service/src/test/java/com/samhanair/logis/slip/attachment/it/PublicSlipAttachmentControllerIT.java
결과: 0 lines
```

현재 작업 트리 diff stat:

```text
7 files changed, 7 insertions(+), 45 deletions(-)
```

따라서 `git diff --stat` 기준 삭제 줄 수는 **45줄**이다. S4가 새로 만든 파일은 이 보고서 1개다. 기존 작업 트리의 S3 보고서와 QA PNG는 수정·삭제하지 않았다.

## 검증

### slip-service 전건

명령(파이프 없음):

```text
./gradlew :services:slip-service:test --console=plain
```

Gradle 원문:

```text
BUILD SUCCESSFUL in 8m 12s
```

`services/slip-service/build/test-results/test/*.xml` 230개를 합산한 실제 집계:

```text
tests    : 1711
failures : 0
errors   : 0
skipped  : 0
```

요청문에 적힌 1713건과 현재 HEAD의 실행 집합에는 2건 차이가 있다. 현재 저장소에서 실제로 실행된 전건은 1711건이며, 1711건 모두 실패 0이다. 1713건으로 부풀려 보고하지 않는다.

### FE 전건

공식 명령:

```text
npm test
```

Vitest JSON reporter 재집계:

```text
files  : 212
total  : 1955
passed : 1955
failed : 0
```

`src/renderer/utils/deliverySchedule.test.ts`는 **37 tests passed**다.

첫 번째 확인 명령에서 잘못 전달한 `--runInBand`는 Vitest 미지원 옵션으로 CLI 오류가 났고, 테스트 실행 실패가 아니었다. 옵션 제거 후 공식 전건은 종료 코드 0으로 완료했다.

## A/B/C/D 확인

- A: 마감 후 익일 출고 생성 — `assertWithinCutoff`는 오늘이 아닌 날짜를 통과시킨다.
- B: 마감 전 정상 생성 — 과거일 서버 거부 가드 제거, 기존 마감 전 경로 유지.
- C: 마감 후 당일 출고 차단 — 활성 태그의 기존 `isAfter(cutoffTime)` 가드 유지.
- D: 활성 태그 6개 — 기존 `OutboundCutoffGuardTest.activeOutboundCutoffs()`의 DAY, LOGEN, REGION, STACK, GYEONGDONG_PARCEL, GYEONGDONG_FREIGHT 유지.

커밋·push, DB 직접 쓰기, QA 전표 삭제, 공유 Docker 스택 재기동은 하지 않았다.

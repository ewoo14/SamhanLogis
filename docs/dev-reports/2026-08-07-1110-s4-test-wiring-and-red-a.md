# #1110 S4 — 테스트 배선 복구와 RED-A

## 범위

- 대상 브랜치: `fix/1110-collab-revision-authority` / `16de0f44f`
- 프런트·컨테이너·commit·push·다른 워크트리 변경 없음
- S3가 추가한 `PartnerOrderAuthorityEventPublisher` 생성자 의존성의 테스트 호출부와 권위 사건 단정을 보강함

## 생성자 호출부 전수 조사

다음 grep으로 `services/partner-order-service/src/test` 아래 Java 전체를 검색했다.

```powershell
rg -n --glob '*.java' `
  "new PartnerOrder(Revision|Convert|Delete|Hold|MergeConvert)Service\s*\(|new SlipPublishOutboxResultWriter\s*\(" `
  services/partner-order-service/src/test
```

발견한 호출 축은 다음과 같다.

| 축 | 테스트 호출부 | 조치 |
|---|---|---|
| Revision | `PartnerOrderRevisionServiceTest#setUp` | 6-인자 생성자로 교체하고 publisher mock 주입; CREATE/EDIT 및 RESTORE 발행 단정 추가 |
| Convert | 신규 `PartnerOrderConvertServiceTest` | 실제 reserve→slip 성공 경로 후 `CONVERT` 1회 단정 |
| Delete | `PartnerOrderDeleteServiceTest` 2곳 | 6번째 publisher 인자 추가; 복원 성공 `RESTORED` 1회, 복원 거부 시 미발행 단정 |
| Hold | 신규 `PartnerOrderHoldServiceTest` | 실제 DRAFT→ON_HOLD 전이 후 `STATUS` 1회 단정 |
| MergeConvert | `PartnerOrderMergeConvertServiceTest`의 `@InjectMocks` | publisher mock을 명시하고 2개 주문 각각 `CONVERT` 1회 단정 |
| Outbox | `SlipPublishOutboxResultWriterTest#newWriter` | 7-인자 생성자로 교체; 연결 주문의 COMMITTED 결과에서 `OUTBOX_COMMITTED` 1회 단정 |

추가로 `@InjectMocks`와 `PartnerOrderAuthorityEventPublisher`의 테스트 전체 사용처를 재검색해 MergeConvert 외 누락된 직접 배선을 확인했다. 기존 4-인자 호환 생성자를 쓰던 Revision 테스트는 컴파일만으로는 publisher 미배선을 잡지 못하므로 명시적으로 새 생성자와 mock을 사용했다.

## RED-A 통합 검증

신규 `PartnerOrderAuthorityEventRedATest`에서 실제 `InMemoryRealtimeBroker`와 실제 `SseEmitter`를 연결하고, 6개 권위 경로의 사건 유형을 순서대로 발행했다.

검증 항목:

- `partner-order:authority` 이벤트 이름은 공통 형태로 유지
- 6개 경로 각각 정확히 1회: `REVISION`, `CONVERT`, `RESTORED`, `STATUS`, `MERGE_CONVERT`, `OUTBOX_COMMITTED`
- broker publish 횟수 `6`
- 실제 SSE subscriber `1` 유지
- 사건별 고유 `commitId` 6개
- payload에 `snapshot`, `document`, `yDoc` 없음

결과: **통과** (`PartnerOrderAuthorityEventRedATest`, 1 test / 0 failure).

## 검증 결과

```text
초기 재현:
  :services:partner-order-service:test --tests "*PartnerOrderDeleteServiceTest"
  compileTestJava FAILED — PartnerOrderDeleteServiceTest.java:70,100

생성자 호출부 컴파일:
  :services:partner-order-service:compileTestJava
  BUILD SUCCESSFUL

관련 회귀 + RED-A:
  6개 경로 테스트 및 RED-A 지정 실행
  BUILD SUCCESSFUL
  39 tests completed, 0 failed

서비스 전체:
  :services:partner-order-service:test
  BUILD SUCCESSFUL
  XML 결과 합산: 511 tests / 0 failures / 0 errors
```

전체 테스트 종료 시 Testcontainers/PostgreSQL 종료 과정에서 로컬 DB 포트 거부 및 CloudWatch metric shutdown 경고가 로그에 남았지만 Gradle 결과는 성공이며 테스트 실패로 집계되지 않았다.

## 신규 파일 목록

- `docs/dev-reports/2026-08-07-1110-s4-test-wiring-and-red-a.md`
- `services/partner-order-service/src/test/java/com/samhanair/logis/partnerorder/realtime/PartnerOrderAuthorityEventRedATest.java`
- `services/partner-order-service/src/test/java/com/samhanair/logis/partnerorder/service/PartnerOrderConvertServiceTest.java`
- `services/partner-order-service/src/test/java/com/samhanair/logis/partnerorder/service/PartnerOrderHoldServiceTest.java`

수정 파일:

- `PartnerOrderRevisionServiceTest.java`
- `SlipPublishOutboxResultWriterTest.java`
- `PartnerOrderDeleteServiceTest.java`
- `PartnerOrderMergeConvertServiceTest.java`

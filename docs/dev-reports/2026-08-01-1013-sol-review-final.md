# 2026-08-01 1013 기능 회귀 최종 검토

## 확인 1 — `/internal/slips/outbound` 경로 충돌 없음

- 전수 매핑 검색에서 `SlipInternalController`의 공통 prefix는 `/internal/slips`이고, 신규 핸들러는 정확히 `@GetMapping("/outbound")`, 기존 DPS 핸들러는 정확히 `@GetMapping("/outbound-lines")`였다. 다른 main controller에 동일한 `/internal/slips/outbound` 매핑은 없었다.
- 두 경로를 함께 고정한 `SlipOutboundInternalControllerIT` 전체를 실제 실행했고 성공했다. 따라서 Spring 매핑 충돌이나 기존 `/outbound-lines` 호출 중단은 재현되지 않았다.

실행 원문:

```text
& .\gradlew.bat :services:slip-service:test --tests com.samhanair.logis.slip.it.SlipOutboundInternalControllerIT --no-daemon
> Task :services:slip-service:test
BUILD SUCCESSFUL in 1m 10s
18 actionable tasks: 1 executed, 17 up-to-date
```

판정: **회귀 재현 없음**.

## 확인 2 — outbound `deliveryTag` 추가의 기존 소비처 회귀 없음

전수 검색 결과, 해당 endpoint DTO의 실제 소비 경로는 다음뿐이다.

1. slip-service `OutboundSlipResponse` 생산자와 `SlipInternalController`.
2. arologis-service `SlipServiceClient`의 수동 JSON 파서 → `PreClassifyService`, `UnassignedService`, `RegionalService`.
3. notification-service `OutboundSlipDto` → `DispatchBatchPreviewService`, `MessageTemplateService`. 단, main의 유일 구현체는 현재 `NoopSlipServiceClient`여서 실제 HTTP 역직렬화 경로는 없다.

arologis 파서는 필요한 필드를 이름으로 읽으며 신규 `deliveryTag`도 이름으로 읽는다. notification DTO에는 필드가 추가되지 않았지만 현재 실 HTTP 구현체 자체가 없어 신규 JSON 필드 때문에 깨지는 실행 경로는 재현되지 않았다. 생산자 계약 테스트와 위 소비 서비스 테스트를 실제 실행했다.

출력 원문:

```text
> Task :services:arologis-service:test
> Task :services:notification-service:test
BUILD SUCCESSFUL in 27s
22 actionable tasks: 2 executed, 20 up-to-date
```

실행 대상: `SlipServiceClientOutboundFailureTest`, `PreClassifyServiceTest`, `UnassignedServiceTest`, `RegionalServiceTest`, `DispatchBatchPreviewServiceTest`, `MessageTemplateServiceTest`. 생산자 `SlipOutboundInternalControllerIT`는 확인 1에서 함께 통과했다.

판정: **`deliveryTag` 필드 추가로 기존 소비처가 멈추는 회귀는 재현되지 않음**. 다만 notification-service는 아직 실제 outbound HTTP client가 아니라 Noop이므로 그 서비스의 실 역직렬화 원문은 존재하지 않는다.

## 확인 3 — 공용 Aligo 변경에서 타배송사 SMS 거짓 성공 회귀 재현

SMS 호출자 전수 검색 결과:

- notification-service 직접 단건(admin/internal), 배차 batch.
- arologis-service 자동 배차 기사 SMS.
- slip-service 타배송사 배차 SMS와 배차 확정·불가·수정·취소 요청/결정 SMS.
- PUSH 소비처(전표 편집·협업·보상, 재고 안전재고, 그룹웨어 협업)는 채널 분기상 Aligo를 사용하지 않는다. EMAIL도 별도 adapter다.

실행 결과, placeholder는 외부 호출 없이 `NOT_SENT_CREDENTIALS_PLACEHOLDER`/`FAILED`가 되고 정상 자격증명 Aligo 성공 경로는 계속 성공했다. PUSH·EMAIL·SMS adapter 분리 테스트도 3/3 통과했다. 아로로지스 client는 notification 응답 body의 `FAILED`를 실패 outcome으로 매핑하므로 이 변경을 정상 흡수한다.

그러나 **타배송사 배차 SMS는 회귀가 재현됐다.** notification internal endpoint는 실제 발송 결과가 `FAILED`여도 요청 생성 응답을 HTTP 201로 반환한다. slip-service의 `NotificationClient.sendExternalSmsWithResult`는 응답 body의 상태를 읽지 않고 모든 2xx를 `true`로 반환한다. `ExternalDispatchService`는 이 boolean이 false일 때만 `FAILED`로 남긴다. 따라서 placeholder 환경에서 실제 비전송인데 타배송사 배차가 발송 성공으로 전이될 수 있다.

재현 원문(각 component 계약을 실제 실행한 결과):

```text
<testsuite name="...AligoSmsAdapterPlaceholderRuntimeGuardIT" tests="4" skipped="0" failures="0" errors="0">
  <testcase name="TC-4: placeholder stub 발송 2건 후 SEND_AUDIT 이력 DB 정합 + API 조회"/>
  <testcase name="TC-1: Aligo key placeholder → 비전송 실패, 외부 RestClient 미호출"/>
  <testcase name="TC-2: Aligo userid placeholder → 비전송 실패"/>
  <testcase name="TC-3: Aligo sender placeholder → 비전송 실패"/>

<testsuite name="...NotificationDispatchSmsContractIT" tests="2" skipped="0" failures="0" errors="0">
  <testcase name="sendExternalSmsWithResult_postsContractAndReturnsTrueOn2xx()"/>
  <testcase name="sendExternalSmsWithResult_returnsFalseOn5xx()"/>

<testsuite name="...ExternalDispatchServiceTest" tests="2" skipped="0" failures="0" errors="0">
  <testcase name="dispatch_sms_failure_marks_dispatch_failed_and_does_not_publish_board_change()"/>
```

관련 재실행 원문:

```text
> Task :services:notification-service:test
BUILD SUCCESSFUL in 1m 18s
18 actionable tasks: 18 executed

> Task :services:slip-service:test
> Task :services:arologis-service:test
BUILD SUCCESSFUL in 29s
32 actionable tasks: 2 executed, 1 from cache, 29 up-to-date

> Task :services:notification-service:test
BUILD SUCCESSFUL in 26s
18 actionable tasks: 1 executed, 17 up-to-date
```

판정: **BLOCKING 회귀 1건** — placeholder 비전송이 타배송사 SMS에서는 다시 성공으로 오인된다. 다른 SMS 흐름은 실패를 fail-soft로 흡수하거나 상태 body를 읽으며, PUSH/EMAIL 중단은 재현되지 않았다.

## 확인 4 — 지방 판정 전환 실 DB 손실 0건

공유 컨테이너를 재기동·재빌드하지 않고 `BEGIN READ ONLY`와 `ROLLBACK` 사이에서만 전환 전 17개 시도 문자열 집합과 태그 집합을 다시 셌다.

출력 원문:

```text
BEGIN
 total | old_region | region | stack | loss | newly_added
-------+------------+--------+-------+------+-------------
  2304 |          0 |     12 |    11 |    0 |          12
(1 row)

ROLLBACK
```

판정: **목록 손실 0건 재현**. 활성 출고 전체 2,304건, 기존 주소 문자열 지방 0건, `REGION` 12건, `STACK` 11건, 전환 손실 0건, 신규 포함 12건이다.

## 확인 5 — 8개 실행 모드 실호출 결과가 모두 빈 목록이며 사용자 진입점 없음

공유 스택을 재기동하지 않고 현재 실행 중인 arologis-service의 읽기 endpoint를 8개 mode로 각각 실제 호출했다. 개인정보를 출력하지 않고 상태와 결과 건수만 추출했다.

출력 원문:

```text
mode=SANGIL_AND_CHOWOL_REGION_EXCLUDED status=200 grouped=0 unclassified=0
mode=CHOWOL_REGION_EXCLUDED status=200 grouped=0 unclassified=0
mode=SANGIL_REGION_EXCLUDED status=200 grouped=0 unclassified=0
mode=STACK_ONLY status=200 grouped=0 unclassified=0
mode=REGION_ONLY status=200 grouped=0 unclassified=0
mode=SANGIL_AND_CHOWOL_REGION_INCLUDED status=200 grouped=0 unclassified=0
mode=CHOWOL_REGION_INCLUDED status=200 grouped=0 unclassified=0
mode=SANGIL_REGION_INCLUDED status=200 grouped=0 unclassified=0
```

미리보기 대상이 있는 모드별 양성 결과는 **재현되지 않았다**. 현 공유 arologis 실행물은 upstream 출고 조회 실패를 빈 목록으로 흡수하므로 8개 모두 HTTP 200 빈 결과만 냈다.

추가로 두 데스크톱의 pre-classify 페이지를 검색했으나 mode 상태·선택 UI·mode 인자 전달 호출은 0건이었다. API type과 query parameter 함수만 존재한다. 사용자는 화면에서 8개 모드를 선택하거나 실행할 수 없다.

HEAD 계약도 모드 동작에 필요한 `warehouse`, `memo`, `productName`, `amount`를 slip-service `OutboundSlipResponse`가 내리지 않는다. arologis client는 이 이름을 읽지만 항상 null이고, `warehouseAllowed`는 빈 창고를 모든 모드에서 통과시킨다. 따라서 초월 전용/상일 전용 모드를 실제 데이터에서 구분할 계약이 없다.

판정: **BLOCKING 회귀 2건째** — 8개 경로는 실제로 구분 동작했다고 확인할 수 없고, 현재 사용자는 UI에서 호출할 수도 없다. 특히 2·3·7·8번 창고 모드는 현재 outbound 응답만으로 정상 판정 불가능하다.

## 확인 6 — `RegionalService` 17개 시도 분류 소비처

실제 소비처는 regional admin endpoint, Samhan Public 데스크톱의 지방가배차 조회·합계·시도/미매칭 카드·CSV, 독립 아로로지스 데스크톱의 같은 화면과 저장/복원 이력이다.

REGION 태그가 있는 주소를 17개 시도로 그룹화하는 service 테스트와 controller IT가 실제 통과했다. Samhan Public 데스크톱 typecheck도 통과해 기존 `sidoGroups`/`unmatched` DTO 소비는 깨지지 않았다.

출력 원문:

```text
> Task :services:arologis-service:test
BUILD SUCCESSFUL in 55s
15 actionable tasks: 1 executed, 14 up-to-date

> @samhan/desktop@0.1.0 typecheck
> ... tsc -p tsconfig.node.json --noEmit && tsc -p tsconfig.web.json --noEmit ...
ℹ tests 50
ℹ pass 50
ℹ fail 0
```

독립 아로로지스 데스크톱은 이번 코드가 아닌 로컬 의존성 누락으로 실행 검증이 중단됐다.

```text
> @samhan/arologis-desktop@1.0.0 typecheck
src/main/auto-update.ts(4,69): error TS2307: Cannot find module 'electron-updater' or its corresponding type declarations.
```

판정: **백엔드와 Samhan Public 소비처 회귀 재현 없음**. 독립 아로로지스 데스크톱 소비처의 실행 원문은 의존성 누락 때문에 확인되지 않았으므로 그 경로는 **확인불가**로 남긴다.

## 확인 7 — 클립보드 TSV 직렬화는 동작, 실제 UI clipboard 쓰기는 확인불가

일반 `npm test`는 Electron main 산출물 부재로 사전 가드에서 중단됐다.

```text
> @samhan/desktop@0.1.0 pretest
[로컬 파생물 신선도 확인 실패]
- Electron main 빌드 산출물 out/main/index.js이(가) 없습니다: out\main\index.js. npm run build
```

Vitest를 직접 실행한 helper 테스트는 통과했다.

```text
✓ src/renderer/routes/dispatchSmsClipboard.test.ts (2 tests)
Test Files  1 passed (1)
Tests       2 passed (2)
```

두 미리보기 행을 모두 선택한 값으로 실제 helper를 호출한 원문은 다음과 같다. 행은 `\n`, 열은 `\t`로 직렬화됐다.

```text
"거래처 A\t전표-1\t안내 A\t방 A\n거래처 B\t전표-2\t안내 B\t방 B"
```

화면에는 선택 checkbox와 `CopyButton` 배선이 존재하고 typecheck는 통과했다. 그러나 브라우저 제어 환경이 비어 있어 미리보기 대상 선택 → 버튼 클릭 → `navigator.clipboard.readText()`의 실제 UI 원문은 얻지 못했다.

판정: **TSV 생성 회귀는 재현되지 않음. 실제 클립보드 쓰기 성공은 원문 미재현이므로 확인불가**. 이 항목은 성공으로 판정하지 않는다.

## 최종 판정

정상 동작을 멈추거나 성공으로 오인하게 하는 **BLOCKING 회귀 2건**을 재현했다.

1. placeholder 비전송 결과가 HTTP 2xx로 반환될 때 slip-service 타배송사 SMS client가 body의 `FAILED`를 읽지 않고 성공 boolean을 반환한다. 타배송사 배차가 미발송인데 성공으로 남을 수 있다.
2. 가배차 8개 모드는 현재 실행 서비스에서 모두 HTTP 200 빈 결과였고, 두 데스크톱 화면에 선택/실행 UI가 없다. 또한 outbound 응답에 창고가 없어 창고별 4개 모드를 구분할 수 없다.

회귀가 재현되지 않은 항목은 outbound 경로 충돌, `deliveryTag` 추가의 기존 DTO 소비, 지방 태그 전환 손실, backend/Samhan Public의 17개 시도 소비처다.

성공 원문을 얻지 못한 항목은 독립 아로로지스 데스크톱 typecheck와 실제 브라우저 clipboard write다. 둘 다 확인불가로 남겼다.

검토 중 실제 문자 발송, 공유 Docker 재빌드·재기동, 실 DB 쓰기, 애플리케이션 코드 수정은 수행하지 않았다. DB 조회는 `BEGIN READ ONLY`/`ROLLBACK`으로 종료했다.

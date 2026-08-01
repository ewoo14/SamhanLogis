# 2026-08-01 D-1013 출고전표 내부 엔드포인트 복구

## 계약 확정

- `services/notification-service/.../SlipServiceClient.java`의 실제 메서드는 `getOutboundSlips(LocalDate from, LocalDate to)`이며, 호출 URL 주석과 `DispatchBatchPreviewService` 호출 모두 `GET /internal/slips/outbound?from=...&to=...` 기간(inclusive) 계약이다. `date` 단일 파라미터 계약이 아니다.
- `OutboundSlipDto`의 실제 필드는 `slipNo`, `partnerCode`, `partnerName`, `slipDate`, `scheduledAt`, `deliveryAddress`, `lines[{productName, quantity}]`, `recipientPhone`이다. 문서에는 `partner_code` 중심의 설명이 있지만 실제 Java record와 호출 코드를 따른다.
- `services/arologis-service/.../SlipServiceClient.java`도 같은 `from`/`to`를 호출하며 실제 소비 필드는 `slipNo`, `partnerCode`, `partnerName`, `address`이다. 현재 주석/파서는 `slipId` UUID도 기대하지만, UUID를 응답하지 않는 불변식 D 및 실제 화면 소비(`slipNo`)에 맞춰 이 작업에서 제거한다.
- `slip-service`에는 당시 `/internal/slips/outbound` 핸들러가 없고, `/outbound-lines`는 라인 단위 DPS 계약으로 별개다. 기존 `findByPeriodWithLines(OUTBOUND, from, to, null)`는 활성 전표를 기간으로 읽고 라인을 fetch하므로 새 전표 단위 projection의 조회 원천으로 사용할 수 있다.

## RED — 404 재현 테스트

`SlipOutboundInternalControllerIT.findOutboundSlipSummaries_returnsDtoContract_withoutUuid`를 구현 전에 추가하고 다음 명령을 실행했다.

```text
& .\gradlew.bat :services:slip-service:test --tests com.samhanair.logis.slip.it.SlipOutboundInternalControllerIT --no-daemon
```

원문:

```text
SlipOutboundInternalControllerIT > findOutboundSlipSummaries_returnsDtoContract_withoutUuid() FAILED
java.lang.AssertionError: Status expected:<200> but was:<500>
...
Resolved Exception:
Type = org.springframework.web.servlet.resource.NoResourceFoundException
MockHttpServletRequest:
HTTP Method = GET
Request URI = /internal/slips/outbound
Parameters = {from=[2026-06-08], to=[2026-06-08]}
Headers = [X-Internal-Token:"test-internal-token"]
Handler: Type = org.springframework.web.servlet.resource.ResourceHttpRequestHandler
MockHttpServletResponse:
Status = 500
Body = {"success":false,"code":"INTERNAL_ERROR","message":"서버 내부 오류가 발생했습니다.","data":null,...}
6 tests completed, 1 failed
BUILD FAILED
```

이는 테스트 오기나 인증 실패가 아니라 `/internal/slips/outbound` 매핑 부재로 정적 리소스 핸들러까지 내려간 RED다.

## 불변식 B RED

`NoopSlipServiceClientTest.missingOutboundEndpoint_isVisibleAsFailure`를 추가하고 구현 전에 실행했다.

```text
& .\gradlew.bat :services:notification-service:test --tests com.samhanair.logis.notification.client.NoopSlipServiceClientTest --no-daemon
NoopSlipServiceClientTest > missingOutboundEndpoint_isVisibleAsFailure() FAILED
    java.lang.AssertionError at NoopSlipServiceClientTest.java:15
1 test completed, 1 failed
BUILD FAILED
```

기존 Noop 구현이 예외 없이 빈 목록을 반환했기 때문에 발생한 의도된 RED다.

## 구현

- `slip-service`에 `GET /internal/slips/outbound?from=&to=`를 추가했다. 기존 `findByPeriodWithLines`를 사용해 활성 OUTBOUND 전표와 라인을 기간으로 조회한다.
- 응답 projection은 `slipNo`, `partnerCode`, `partnerName`, `slipDate`, `scheduledAt(null)`, `deliveryAddress`, `lines[{productName, quantity}]`, `recipientPhone`이다. `OutboundSlipResponse`에는 UUID 필드가 없다.
- 기존 `/internal/slips/outbound-lines` 메서드와 분리된 매핑이므로 기존 라인 계약을 건드리지 않는다.
- 아로로지스 client는 새 응답에서 `slipId`를 읽지 않고 내부 요약 객체에도 null만 유지한다. endpoint JSON에 UUID를 넣지 않는다.

## 불변식 B GREEN

404를 실제 RestClient 호출로 재현하는 `SlipServiceClientOutboundFailureTest`와 Noop 부재 테스트를 실행했다.

```text
& .\gradlew.bat :services:notification-service:test --tests com.samhanair.logis.notification.client.NoopSlipServiceClientTest :services:arologis-service:test --tests com.samhanair.logis.arologis.client.SlipServiceClientOutboundFailureTest --no-daemon
...
> Task :services:notification-service:test
> Task :services:arologis-service:test
BUILD SUCCESSFUL in 15s
22 actionable tasks: 2 executed, 20 up-to-date
```

두 테스트는 각각 미설정 Noop과 HTTP 404에서 `IllegalStateException`이 발생하는지 검증한다. 따라서 실패가 `[]`로 정상화되는 경로가 남아 있지 않다.

## 실 DB read-only 대조

공유 Docker 컨테이너는 재빌드·재기동하지 않았다. DB에는 `BEGIN READ ONLY`만 사용했다.

```text
docker exec samhan-postgres psql -U samhan -d slip_db -c "BEGIN READ ONLY; SELECT COUNT(*) ..."
BEGIN
 outbound_count
----------------
           1908
(1 row)
ROLLBACK
```

현재 공유 컨테이너(`samhan-slip-service`, 변경 전 이미지)에 대한 라이브 probe는 다음과 같았다.

```text
GET http://localhost:18086/internal/slips/outbound?from=2026-06-08&to=2026-06-08
HTTP 500
{"success":false,"code":"INTERNAL_ERROR","message":"서버 내부 오류가 발생했습니다.","data":null,...}
```

공유 컨테이너를 건드리지 않기 위해, Flyway를 끄고 Hibernate validate + Hikari read-only로 로컬 변경 코드만 `18087` 포트에 임시 실행하여 같은 DB를 조회했다. 조회 후 로컬 JVM은 종료했다.

```text
HTTP 200
response_count=1908
first_slip_no=2026/06/08-1908
first_fields=slipNo,partnerCode,partnerName,slipDate,scheduledAt,deliveryAddress,lines,recipientPhone
```

따라서 원천 활성 OUTBOUND 1,908건과 새 endpoint 응답 1,908건이 일치한다. 응답 필드에는 UUID가 없고 `deliveryAddress`가 호출자 계약에 맞게 포함된다.

## 전체 모듈 테스트

```text
& .\gradlew.bat :services:slip-service:test --no-daemon
BUILD SUCCESSFUL in 4m 12s
18 actionable tasks: 1 executed, 17 up-to-date

& .\gradlew.bat :services:notification-service:test --no-daemon
BUILD SUCCESSFUL in 54s
18 actionable tasks: 1 executed, 17 up-to-date

& .\gradlew.bat :services:arologis-service:test --no-daemon
BUILD SUCCESSFUL in 1m 36s
15 actionable tasks: 3 executed, 12 up-to-date
```

skip은 없었다. 전체 테스트는 공유 Docker 스택을 재빌드·재기동하지 않았고, 실 DB 쓰기와 문자 발송도 하지 않았다.

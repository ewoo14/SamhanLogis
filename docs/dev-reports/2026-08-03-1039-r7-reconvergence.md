# PR #1045 R7 재수렴 — 전표 발행과 inventory 조회 결합 조사

## 확인 1 — R6 변경 의도에서 조사 가설 확정

직전 보고서 `docs/dev-reports/2026-08-03-1039-r6-fix.md`의 확인 3은 일반·모바일 발행에서 `WarehouseInternalClient.findWarehouseCode(...)`를 호출하고 **"조회 장애는 삼키지 않는다"**고 명시한다. 반면 확인 9의 복사 경로는 외부 조회 없이 원본 `sourceWarehouseCode`를 그대로 승계한다고 적혀 있다.

따라서 이번 라운드의 단일 가설은 다음과 같다.

> 일반 발행과 모바일 주문은 inventory 장애가 전표 발행 실패로 전파되고, 복사는 외부 호출 없이 발행된다. 코드·표적 테스트로 세 경로와 timeout·5xx·403·404·네트워크 단절을 각각 확인한다.

## 확인 2 — 조사 기준점과 작업트리 오염 여부

```text
실행: git status --short; git log -1 --oneline; git show --stat --oneline --decorate --no-renames HEAD

?? docs/dev-reports/2026-08-03-1039-r7-reconvergence.md
5b7718671 [FIX] #1039 신규 전표에 창고 구분 보존 + UNKNOWN·0건·장애 분리
```

HEAD는 지정된 `5b7718671`과 일치하며, 조사 시작 시 신규 파일은 본 R7 보고서 하나뿐이다. R6 커밋에서 이 각도에 직접 관련된 생산 변경은 `WarehouseInternalClient`, `SlipService`, `MobilePartnerOrderService`, `SlipDuplicateService`다.

## 확인 3 — `findWarehouseCode`의 실패 모드 분기

`services/slip-service/src/main/java/com/samhanair/logis/slip/client/WarehouseInternalClient.java:73-102`를 확인했다.

- `:82-86`에서 inventory 단건 API를 동기 `GET`한다.
- `:97-98`은 **모든** `RestClientResponseException`을 `IllegalStateException`으로 전환한다. `findWarehouseName`의 `:61-63`과 달리 code 조회에는 404 예외 축약이 없다.
- `:99-101`은 timeout·연결 거부·DNS/서비스 디스커버리 실패 등 나머지 예외도 `IllegalStateException`으로 전환한다.
- 따라서 5xx·403·404·timeout·네트워크 단절은 모두 호출자에게 예외로 전파된다.
- 정상 200이지만 body가 비거나 code 필드가 없으면 `:87`, `:96`에서만 `Optional.empty()`가 되어 UNKNOWN 저장이 가능하다.

즉, 현재 client 계약은 "모르면 비움"을 **정상 200의 빈/누락 응답에만** 적용하고, 질문에 지정된 다섯 장애 모드에는 적용하지 않는다.

## 확인 4 — 호출 수와 라인 수 배수 여부

```text
실행: rg -n "findWarehouseCode\(" services/slip-service/src/main services/slip-service/src/test

.../WarehouseInternalClient.java:73: public Optional<String> findWarehouseCode(...)
.../MobilePartnerOrderService.java:127: ...findWarehouseCode(req.sourceWarehouseId())
.../SlipService.java:258: ...findWarehouseCode(req.sourceWarehouseId())
```

생산 호출점은 정확히 2곳이다. 일반 OUTBOUND 한 건당 1회(`SlipService.java:253-260`), 모바일 주문 한 건당 1회(`MobilePartnerOrderService.java:118-129`)이며 라인 반복문 밖이다. 따라서 라인 수가 많아져도 호출은 1회로 유지된다. 연속 N건 발행에서는 요청별 1회라 총 N회로 선형 증가하며 cache/batch는 없다. INBOUND 일반 발행과 전표 복사는 이 code 조회를 호출하지 않는다.

## 확인 5 — 트랜잭션 경계

- `SlipService.java:90`에 클래스 수준 `@Transactional`이 있고, 일반 발행 메서드는 `:234`에서 시작한다. inventory 호출 `:258`은 이 DB 트랜잭션 안이다. 호출 전 이미 product-service 조회(`:240`)와 채번(`:248`)을 수행한다.
- `MobilePartnerOrderService.java:52`에도 클래스 수준 `@Transactional`이 있고, 모바일 발행 메서드는 `:80`에서 시작한다. inventory 호출 `:127` 역시 트랜잭션 안이다. 호출 전 partner-service 조회(`:82-98`), product-service 조회(`:105`), 채번(`:113`)을 수행한다.
- `SlipDuplicateService.java:80-81`은 메서드 수준 `@Transactional`이나 inventory 호출 자체가 없고 원본 code를 `:98`에서 그대로 복사한다.

따라서 일반·모바일에서는 inventory 지연 시간만큼 열린 DB 트랜잭션 수명이 늘어난다. 특히 채번이 끝난 뒤 호출하므로 외부 지연/실패가 채번 관련 DB 작업 뒤에 발생한다. 복사 경로는 inventory 지연과 무관하다.

## 확인 6 — inventory code 조회 timeout 상한 설정 유무

`services/slip-service/src/main/java/com/samhanair/logis/slip/client/RestClientConfig.java:13-17`의 공유 builder는 `RestClient.builder()`만 반환한다. `WarehouseInternalClient.java:27-32`도 여기에 base URL만 붙이며 request factory나 connect/read timeout을 설정하지 않는다.

```text
실행: rg -n "loadBalancedRestClientBuilder|connectTimeout|readTimeout|responseTimeout" services/slip-service/src/main ...

WarehouseInternalClient.java:28: @Qualifier("loadBalancedRestClientBuilder") ...
RestClientConfig.java:15: public RestClient.Builder loadBalancedRestClientBuilder() {
DynamicPermissionClientConfig.java:18-26: auth 전용 timeout 설정만 존재
```

즉 inventory code snapshot 호출에는 애플리케이션이 보장하는 명시적 connect/read timeout 상한이 없다. 실제 하부 HTTP 구현·OS의 기본 timeout까지 걸리는 동안 일반·모바일 발행 트랜잭션이 대기할 수 있다. 정확한 최대 대기시간은 이 코드만으로 확정할 수 없어 수치로는 **미판정**이다.

## 확인 7 — R6 테스트가 고정한 범위와 실패 계약 공백

- `PublicSlipControllerIT.java:120-153`은 `findWarehouseCode`가 `Optional.of("00003")`을 반환하는 성공 경로만 검증한다.
- `MobilePartnerOrderServiceTest.java:111-129`도 `Optional.of("00003")` 성공과 호출 여부만 검증한다.
- `WarehouseInternalClientTest.java:43-85`는 창고 **name** 조회만 다루며 신규 code 조회의 200/404/403/5xx/timeout/단절 테스트가 없다.

즉 기존 GREEN은 inventory 정상 응답에서 code가 보존된다는 사실만 증명하며, inventory 장애 때 핵심 발행이 계속된다는 계약은 전혀 고정하지 않는다.

## 확인 8 — 다섯 실패 모드 RED 재현

전표 발행의 반대급부인 "inventory code를 모르면 UNKNOWN으로 계속"을 실제 client wire 경계에 요구하는 임시 표적 테스트 5개를 실행했다.

```text
실행: .\gradlew.bat :services:slip-service:test --tests "com.samhanair.logis.slip.client.WarehouseCodeFailureReconvergenceTest" --no-daemon

WarehouseCodeFailureReconvergenceTest > code_404여도_발행용_UNKNOWN으로_계속해야한다() FAILED
    java.lang.IllegalStateException at WarehouseCodeFailureReconvergenceTest.java:38
        Caused by: org.springframework.web.client.HttpClientErrorException$NotFound

WarehouseCodeFailureReconvergenceTest > code_403이어도_발행용_UNKNOWN으로_계속해야한다() FAILED
    java.lang.IllegalStateException at WarehouseCodeFailureReconvergenceTest.java:45
        Caused by: org.springframework.web.client.HttpClientErrorException$Forbidden

WarehouseCodeFailureReconvergenceTest > code_5xx여도_발행용_UNKNOWN으로_계속해야한다() FAILED
    java.lang.IllegalStateException at WarehouseCodeFailureReconvergenceTest.java:52
        Caused by: org.springframework.web.client.HttpServerErrorException$ServiceUnavailable

WarehouseCodeFailureReconvergenceTest > code_timeout이어도_발행용_UNKNOWN으로_계속해야한다() FAILED
    java.lang.IllegalStateException at WarehouseCodeFailureReconvergenceTest.java:59
        Caused by: org.springframework.web.client.ResourceAccessException
            Caused by: java.net.SocketTimeoutException

WarehouseCodeFailureReconvergenceTest > code_연결단절이어도_발행용_UNKNOWN으로_계속해야한다() FAILED
    java.lang.IllegalStateException at WarehouseCodeFailureReconvergenceTest.java:66
        Caused by: org.springframework.web.client.ResourceAccessException
            Caused by: java.net.ConnectException

5 tests completed, 5 failed
BUILD FAILED in 22s
```

다섯 모드 모두 `Optional.empty()`에 도달하지 않고 예외가 된다. 이 결과는 `WarehouseInternalClient.java:97-101` 정적 판독과 일치한다.

## 확인 9 — 일반 발행·모바일 주문에서 실제 발행 차단 RED

inventory가 503으로 실패해도 code를 비운 채 발행되어야 한다는 표적 테스트를 일반 API와 모바일 서비스에 각각 추가해 실행했다.

```text
실행: .\gradlew.bat :services:slip-service:test --tests "com.samhanair.logis.slip.delivery.it.PublicSlipControllerIT.createOutbound_inventoryFailure_stillCreatesWithUnknownCode" --tests "com.samhanair.logis.slip.mobile.service.MobilePartnerOrderServiceTest.mobileOrder_inventoryFailure_stillCreatesWithUnknownCode" --no-daemon

PublicSlipControllerIT > createOutbound_inventoryFailure_stillCreatesWithUnknownCode() FAILED
    java.lang.AssertionError at PublicSlipControllerIT.java:180

MobilePartnerOrderServiceTest > mobileOrder_inventoryFailure_stillCreatesWithUnknownCode() FAILED
    java.lang.AssertionError at MobilePartnerOrderServiceTest.java:153

2 tests completed, 2 failed
BUILD FAILED in 41s
```

테스트 결과 XML의 실패 원문:

```text
일반 API: java.lang.AssertionError: Status expected:<201> but was:<500>
          java.lang.IllegalStateException: 창고 조회 실패: HTTP 503
          Status = 500

모바일:   Expecting code not to raise a throwable but caught
          java.lang.IllegalStateException: 창고 조회 실패: HTTP 503
          at MobilePartnerOrderService.createOrder(MobilePartnerOrderService.java:127)
```

일반 사용자가 `POST /slips`로 정상 OUTBOUND 전표를 저장하면 201 대신 500을 받고 전표가 생성되지 않는다. 모바일 사용자가 주문 발행을 누르면 같은 예외로 `slipRepository.save`에 도달하지 못한다. client의 다섯 장애 모드가 모두 같은 `IllegalStateException`으로 수렴하므로 이 차단 결과는 timeout·5xx·403·404·단절에 공통이다.

## 확인 10 — 전표 복사 경로와 UNKNOWN 반대급부

`SlipDuplicateService.java:80-151` 전체 복사 흐름을 확인했다. `:94-98`은 원본 `sourceWarehouseId`와 `sourceWarehouseCode`를 그대로 복사하며 `WarehouseInternalClient` 의존성 자체가 없다. `Slip.java:975-977`의 setter는 null/blank를 null로 유지하고 임의 code를 만들지 않는다.

따라서 inventory가 완전히 단절되어도 복사는 이 변경 때문에 막히지 않는다. 원본 code가 알려졌으면 같은 값을 보존하고, 원본이 UNKNOWN(null)이면 복사본도 UNKNOWN으로 남는다. 이 경로에서는 잘못된 창고 code를 추측 저장하는 반대급부도 없다.

## 확인 11 — 임시 재현물 제거와 최종 작업트리

임시 표적 테스트 클래스와 기존 테스트에 넣었던 재현 메서드를 모두 제거했다.

```text
실행: git status --short; git diff --check; git diff --stat

?? docs/dev-reports/2026-08-03-1039-r7-reconvergence.md
```

생산 코드·기존 테스트 변경은 0이며, 남은 변경은 본 보고서 신규 파일 하나뿐이다.

## 결함 1 — BLOCKER: 부차적인 warehouse code snapshot이 핵심 OUTBOUND 발행을 inventory 가용성에 결합

### 파일:줄

- `services/slip-service/src/main/java/com/samhanair/logis/slip/service/SlipService.java:90,234,253-260`
- `services/slip-service/src/main/java/com/samhanair/logis/slip/mobile/service/MobilePartnerOrderService.java:52,80,118-129`
- `services/slip-service/src/main/java/com/samhanair/logis/slip/client/WarehouseInternalClient.java:73-102`
- timeout 상한 공백: `services/slip-service/src/main/java/com/samhanair/logis/slip/client/RestClientConfig.java:13-17`

### 사용자 조작

1. 일반 화면에서 정상 OUTBOUND 전표를 작성하고 저장한다(`POST /slips`). 또는 모바일에서 정상 주문을 발행한다.
2. 그 순간 inventory가 timeout·5xx·403·404·네트워크 단절 중 하나인 상태다.

### 잘못된 결과

- 일반 발행은 201 대신 500이고 전표가 저장되지 않는다.
- 모바일 발행은 `IllegalStateException`으로 중단되어 `slipRepository.save`에 도달하지 않는다.
- inventory가 느리기만 하면 일반·모바일 각각 발행 한 건당 동기 호출 1회가 추가되고, 명시적 timeout 없이 DB 트랜잭션 안에서 기다린다. 라인 수에는 곱해지지 않지만 연속 N건 발행에는 N회로 늘어난다.
- code를 모르는 경우 비워 두는 안전한 표현이 이미 가능한데도(`Optional.empty()` → null), 장애 응답만 발행 실패로 바뀐다.

### 재현 명령과 출력 원문

client 다섯 모드 재현은 **확인 8**, 일반·모바일 발행 차단 재현은 **확인 9**의 명령과 원문을 따른다. 핵심 원문은 다음과 같다.

```text
5 tests completed, 5 failed
404 -> IllegalStateException <- HttpClientErrorException$NotFound
403 -> IllegalStateException <- HttpClientErrorException$Forbidden
5xx -> IllegalStateException <- HttpServerErrorException$ServiceUnavailable
timeout -> IllegalStateException <- ResourceAccessException <- SocketTimeoutException
단절 -> IllegalStateException <- ResourceAccessException <- ConnectException

일반 API: Status expected:<201> but was:<500>
모바일: Expecting code not to raise a throwable but caught
        java.lang.IllegalStateException: 창고 조회 실패: HTTP 503
```

## 실패 모드별 결론표

| inventory 상태 | 일반 OUTBOUND `POST /slips` | 모바일 주문 | 전표 복사 | 저장될 source warehouse code |
|---|---|---|---|---|
| 정상 200 + code | 성공 | 성공 | 성공 | 일반·모바일=권위 code, 복사=원본 code |
| 정상 200 + code 없음/빈 body | 성공 | 성공 | 성공 | 일반·모바일=비움(UNKNOWN), 복사=원본 값 |
| timeout | **실패** | **실패** | 성공 | 일반·모바일 전표 자체 미생성; 복사=원본 값 |
| 5xx | **실패** | **실패** | 성공 | 일반·모바일 전표 자체 미생성; 복사=원본 값 |
| 403 | **실패** | **실패** | 성공 | 일반·모바일 전표 자체 미생성; 복사=원본 값 |
| 404 | **실패** | **실패** | 성공 | 일반·모바일 전표 자체 미생성; 복사=원본 값 |
| 네트워크 단절 | **실패** | **실패** | 성공 | 일반·모바일 전표 자체 미생성; 복사=원본 값 |

## 최종 판정

이 각도에서 도달 가능한 결함은 **1건(BLOCKER)**이다. R6으로 일반·모바일 OUTBOUND 핵심 발행이 inventory 조회 가용성에 묶였다. 복사는 외부 조회가 없어 무회귀이며 UNKNOWN도 보존한다. timeout의 정확한 최대 대기시간 수치는 명시적 설정이 없어 **미판정**이지만, 외부 호출이 열린 DB 트랜잭션 안에서 동기 대기한다는 구조 자체는 확정이다.

## 신규 파일

- `docs/dev-reports/2026-08-03-1039-r7-reconvergence.md`

## 확인 12 — 최종 산출물 검증

```text
exists=True lines=216
160:## 결함 1 — BLOCKER: ...
198:## 실패 모드별 결론표
210:## 최종 판정
214:## 신규 파일
trailingWhitespaceLines=0
?? docs/dev-reports/2026-08-03-1039-r7-reconvergence.md
```

최종 보고서 필수 절·실패 모드 표·신규 파일 목록이 존재하고, 기존 파일 변경은 없다.

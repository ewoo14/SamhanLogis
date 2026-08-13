# #1161 S2a 계약 마감 보고

## 범위와 전제 확인

- 대상은 S2a 파일럿인 dc-config-service와 partner-auth-service뿐이다.
- S2b 확장으로 다른 서비스의 발행을 켜지 않았다.
- 오늘 정찰의 정적 HTTP 표면 1,017개는 기록만 했으며 확정 분모로 사용하지 않았다. 확정 분모는 판정 불가로 유지한다.
- 중앙 발행의 기존 실측 기준은 2개 서비스·3곳으로 유지한다.
- S0 부하 보고서의 결론은 변경하지 않았다. 로컬 스택 측정이며 운영 트래픽 수치가 아니고, 지속 처리량·ES 장애 처리량은 측정 불가라는 결론을 보존한다.
- Flyway migration, ILM/보존 정책, S1.5 topology 변경은 하지 않았다.

## RED 원문

### 1. 발행 실패 재시도

추가한 rabbitFailure_isRetriedWithinBoundedAttempts_andEventuallyObserved를 기존 코드에서 실행:

    AuditPublisherFailureSoftTest > rabbitFailure_isRetriedWithinBoundedAttempts_andEventuallyObserved() FAILED
        org.mockito.exceptions.verification.TooFewActualInvocations at AuditPublisherFailureSoftTest.java:94
    1 test completed, 1 failed
    Execution failed for task ':shared:audit-publisher:test'

기존 publisher는 lane에서 꺼낸 뒤 broker를 한 번만 호출하고 실패 이벤트를 버렸다.

### 2. requestId/traceId 전파

MDC에 requestId=req-1161, traceId=trace-1161을 넣고 기존 factory를 실행:

    AuditEventContractTest > factory_carriesRequestAndTraceIdsFromRequestContext() FAILED
        org.opentest4j.AssertionFailedError at AuditEventContractTest.java:49
    1 test completed, 1 failed

기존 AuditEventV2 factory는 두 필드를 null로 만들었다.

### 3. 공통 request capture

capture interceptor가 없던 상태에서 추가 테스트를 실행:

    error: cannot find symbol
      symbol:   class AuditRequestCaptureInterceptor
    2 errors
    Execution failed for task ':shared:audit-publisher:compileTestJava'

### 4. sink correlation 저장

consumer에 request correlation 매핑이 없던 상태에서 추가 테스트를 컴파일:

    error: cannot find symbol
      symbol:   method getRequestId()
      location: class AuditLog
    3 errors
    Execution failed for task ':services:logging-service:compileTestJava'

## 고른 수단과 이유

- AuditPublisher의 기존 2개 bounded lane은 유지하고 broker 전달만 최대 3회로 제한했다. 재시도마다 audit.publisher.retry.total, 최종 실패마다 audit.publisher.failure.total을 증가시켜 유실/실패 사실을 관측 가능하게 했다. queue full은 기존 audit.publisher.drop.total{reason=queue_full}로 남는다.
- 재시도는 업무 호출 스레드가 아닌 기존 publisher worker에서 실행한다. 따라서 fail-soft 성질과 부하 측정의 요청 처리 경계를 보존한다.
- MDC 기반 request/trace context를 v2 factory가 읽도록 했다. 기존 명시적 pilot 이벤트도 같은 요청의 capture 이벤트와 requestId 축으로 이어진다.
- HandlerInterceptor의 afterCompletion에서 HTTP 결과를 한 요청당 한 건 생성한다. handler mapping pattern을 우선 사용하고 없으면 URI를 사용하며, 파일럿 설정에서만 활성화했다.
- HTTP 성공 GET은 C_READ, 성공 mutation은 A_CHANGE, 4xx/5xx는 B_FAILURE로 분류한다. 이는 기술적 HTTP outcome 분류이며 업무 의미를 새로 추론하지 않는다.
- logging-service Elasticsearch 문서에 schemaVersion, requestId, traceId, parentService, httpMethod, routeTemplate, durationMs를 저장한다. 기존 단일 index/보존 설정은 건드리지 않았다.

## GREEN 원문

### shared:audit-contract

    > Task :shared:audit-contract:test
    BUILD SUCCESSFUL in 10s

3 tests, failures=0, errors=0.

### shared:audit-publisher

    > Task :shared:audit-publisher:test
    BUILD SUCCESSFUL in 13s

5 unit tests와 1개 기존 RabbitMQ IT가 포함된 테스트 결과에서 failures=0, errors=0이다. request capture 테스트 실행도 다음 원문으로 통과했다.

    AuditRequestCaptureInterceptorTest
    BUILD SUCCESSFUL in 12s

### services:logging-service

    > Task :services:logging-service:test
    BUILD SUCCESSFUL in 21s

consumer 3 tests를 포함한 모듈 테스트 결과는 failures=0, errors=0이다.

### 파일럿 서비스

    > Task :services:dc-config-service:test
    BUILD SUCCESSFUL in 13s

    > Task :services:partner-auth-service:test --no-daemon --max-workers=1 --rerun-tasks
    BUILD SUCCESSFUL in 1m

변경 모듈 결과 집계:

| 모듈 | tests | failures | errors | skipped |
|---|---:|---:|---:|---:|
| shared:audit-contract | 3 | 0 | 0 | 0 |
| shared:audit-publisher | 7 | 0 | 0 | 0 |
| services:logging-service | 16 | 0 | 0 | 0 |
| services:dc-config-service | 79 | 0 | 0 | 0 |
| services:partner-auth-service | 84 | 0 | 0 | 0 |

처음 5개 모듈을 한 명령으로 묶은 전량 명령은 2분 실행 제한에 걸려 최종 결과를 내지 못했다. 이후 모듈별로 --max-workers=1을 사용해 순차 실행했고, partner-auth-service는 --rerun-tasks로 실제 재실행했다. Testcontainers 테스트를 병렬로 실행하지 않았다.

## 불변식 ①~④ 보증 방법

1. 발행 유실 방지/관측: bounded lane 수용 실패는 drop counter, broker 일시 실패는 최대 3회 재시도와 retry counter, 최종 실패는 failure counter와 error log로 남긴다. 소비자 저장 실패는 기존 예외 재전파·DLQ topology를 보존한다.
2. fail-soft: broker가 실패하는 테스트에서 publish() 호출자에게 예외가 전파되지 않는 기존 테스트와 재시도 테스트가 GREEN이다. request capture도 publisher 예외를 catch하여 업무 응답을 바꾸지 않는다.
3. requestId 축: gateway의 X-Request-Id 또는 생성 UUID를 MDC에 넣고, 명시적 이벤트·HTTP capture 이벤트·Elasticsearch 문서에 저장한다. traceparent/X-Trace-Id도 같은 방식으로 보존한다.
4. S0 부하 결론: worker/lane 경계와 request 처리 비동기성만 보완했고, 부하 측정·운영 트래픽 수치·처리량 결론을 변경하지 않았다. 새 HTTP capture는 두 pilot 설정에서만 켠다.

## 판단 필요해 남긴 것

- 1,017개를 HandlerMethod 확정 분모로 승격하지 않았다. 실제 manifest와 기술 exclude/override 분류가 만들어진 뒤에만 분모를 판정할 수 있다.
- 어떤 scheduler/import/runner를 업무 감사 대상으로 볼지는 판단하지 않았다.
- AuditEventV2의 기술 HTTP 분류는 넣었지만, 업무별 감사 대상 의미는 추가하지 않았다.
- publisher confirm/return의 운영 broker 실측과 consumer 장애 주입은 별도 S1.5 운영 gate로 남겼다.

## 못 한 것

- S2b 확장과 2개 pilot 밖의 발행 활성화.
- S1.5 보존 기간, ILM/rollover, queue TTL/max-length, DLQ 운영 소비·알림.
- 운영 DB 쓰기, broker/ES 장애 주입, S0 부하 재측정.
- 정적 표면 수를 확정 분모로 환산하는 작업.

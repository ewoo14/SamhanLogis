# #1161 S2a 재수렴 적대검증 보고서 (4회차)

검증 대상은 브랜치 `feat/1161-s2-audit-publishers`, 사용자 제공 HEAD `e40b322dd`, PR #1177이다. 판정 질문은 오직 **실 사용자 경로로 재현 가능한 결함이 있는가**이다. 구현 코드는 변경하지 않았고 git 명령과 공유 `samhan-*` 스택 쓰기를 하지 않았다.

## 1. fix4 범위와 게이트웨이 전파 반경

`application.yml`을 route block 단위로 다시 분리해 `ForwardedClientIp` 배선 위치와 default filter 전파 여부를 확인했다.

실행 원문:

```powershell
$src=[IO.File]::ReadAllText((Resolve-Path 'services/api-gateway/src/main/resources/application.yml'),[Text.Encoding]::UTF8)
$parts=[regex]::Split($src,'(?m)(?=^        - id: )')
# 각 route block의 ForwardedClientIp / StripInboundIdentityHeaders 존재 여부 집계
```

```text
ROUTE_TOTAL=77
FORWARDED_ROUTE=auth-service STRIP=True
FORWARDED_ROUTE=partner-auth-public-v1 STRIP=True
DEFAULT_FILTER_HAS_FORWARDED=False
PARTNER_BLOCK_ORDER=True
```

`ForwardedClientIp`는 기존 `auth-service`와 fix4 대상 `partner-auth-public-v1` 두 route에만 존재한다. default filter에는 없고, 나머지 75개 route로 번지지 않았다. 실제 대상 block의 순서는 다음과 같다.

```yaml
filters:
  - StripInboundIdentityHeaders
  - name: ForwardedClientIp
    args:
      trustedPeerAddresses: ${SAMHAN_AUDIT_TRUSTED_INGRESS_ADDRESSES:private}
```

`StripInboundIdentityHeaders`가 제거하는 공통 목록은 `X-User-Id`, `X-Is-System-Master`, `X-User-Groups`, `X-Is-Partner`, `X-Partner-Code`, `X-User-Name`, `X-User-Department`, `X-User-Role`, `X-Internal-Token`이다. `X-Audit-Client-IP`는 뒤의 `ForwardedClientIp`가 별도로 remove-then-set 한다. XFF와 `X-Real-IP`는 목록에 넣지 않고, 신뢰 TCP peer 판정이 성공한 경우의 IP 계산 입력으로만 사용한다.

집계: passed 1 / skipped 0 / failed 0.

## 2. 격리 DB 파일 복제와 UTF-8 증거 무결성

공유 PostgreSQL에는 read-only SELECT와 `pg_dump`만 수행했다. PowerShell 파이프는 사용하지 않았고, client가 host 파일에 직접 쓰게 했다.

실행 원문(자격값 제외):

```powershell
docker run --rm --network container:samhan-postgres ... -v "${qaTmp}:/out" postgres:16-alpine \
  pg_dump -h 127.0.0.1 ... -d dc_config_db -Fc -f /out/dc_config.dump
docker run --rm --network container:samhan-postgres ... -v "${qaTmp}:/out" postgres:16-alpine \
  pg_dump -h 127.0.0.1 ... -d partner_auth_db -Fc -f /out/partner_auth.dump
docker exec s2a-reconv4-pg pg_restore -U s2a -d dc_config_db --no-owner --no-privileges /qa/dc_config.dump
docker exec s2a-reconv4-pg pg_restore -U s2a -d partner_auth_db --no-owner --no-privileges /qa/partner_auth.dump
```

파일 원문:

```text
dc_config.dump     56613
partner_auth.dump  31859
```

복제 전 원문과 복제 직후 원문이 동일했다.

```text
1012555999|동영 온라인점-송아름|LEGACY_CSV
1018187629|비와이텍 주식회사|LEGACY_CSV
1021573652|시스템에어컨 - 김영곤님|LEGACY_CSV
```

한글 치환이나 `?` 손상이 없어 이 시점부터 라이브QA를 진행했다.

집계: passed 1 / skipped 0 / failed 0.

## 3. 현재 소스 기동과 gateway 신뢰 경계 양면 실측

현재 워크트리 소스의 `eureka-server`, `api-gateway`, `partner-auth-service`, `dc-config-service`, `logging-service` bootJar를 만들었다. 격리 network `172.29.44.0/24`에서 ingress=`172.29.44.30`, gateway=`172.29.44.20`, partner-auth=`172.29.44.14`로 분리했다. gateway 신뢰 ingress는 `.30`만, partner-auth 신뢰 gateway는 `.20`만 명시했다. 정상 요청은 ingress `127.0.0.1:41443`, 외부 직접 위조 요청은 gateway `127.0.0.1:41480`으로 실제 전송했다.

빌드 원문:

```text
> Task :services:eureka-server:bootJar UP-TO-DATE
> Task :services:api-gateway:bootJar
> Task :services:logging-service:bootJar
> Task :services:dc-config-service:bootJar
> Task :services:partner-auth-service:bootJar
BUILD SUCCESSFUL in 15s
34 actionable tasks: 5 executed, 29 up-to-date
```

기동 원문:

```text
partner-auth_READY=True
dc_READY=True
logging_READY=True
gateway_READY=True
EUREKA_APP=LOGGING-SERVICE INSTANCES=1 STATUS=UP IP=172.29.44.16
EUREKA_APP=API-GATEWAY INSTANCES=1 STATUS=UP IP=172.29.44.20
EUREKA_APP=DC-CONFIG-SERVICE INSTANCES=1 STATUS=UP IP=172.29.44.15
EUREKA_APP=PARTNER-AUTH-SERVICE INSTANCES=1 STATUS=UP IP=172.29.44.14
```

### 3.1 정상 ingress와 외부 직접 위조

정상 ingress 요청에는 ingress가 `X-Real-IP`와 XFF를 `198.51.100.24`로 덮어썼다. 동시에 공격 입력으로 `X-Audit-Client-IP`, `X-User-Id`, `X-User-Role`, `X-User-Name`, `X-Is-System-Master`, `X-Internal-Token`을 실어 보냈다. 외부 직접 요청에는 위 헤더들과 함께 `X-Audit-Client-IP=203.0.113.251`, `X-Real-IP=203.0.113.252`, XFF=`203.0.113.253`을 보냈다.

HTTP 원문:

```text
NORMAL_INGRESS STATUS=200 MS=967
DIRECT_FORGED_ALL STATUS=200 MS=51
MALFORMED STATUS=400 BODY={"success":false,"code":"INVALID_INPUT","message":"요청 본문이 유효하지 않습니다",...}
INVALID_PIN STATUS=400 BODY={"success":false,"code":"INVALID_INPUT","message":"password: 비밀번호는 숫자 4자리 PIN이어야 합니다",...}
```

ES 응답은 charset 없는 JSON을 PowerShell이 잘못 자동 해석하지 않도록 `RawContentStream` 바이트를 UTF-8로 명시 디코딩했다. 최종 원문:

```text
UA=S2A-Reconv4-Normal/1.0 IP=198.51.100.24 STATUS=200 ACTOR=비인증 거래처 DESC=로그인 결과 ERROR=인증 정보가 없습니다
UA=S2A-Reconv4-Direct/1.0 IP=172.29.44.1 STATUS=200 ACTOR=비인증 거래처 DESC=로그인 결과 ERROR=인증 정보가 없습니다
UA=S2A-Reconv4-Malformed/1.0 IP=198.51.100.24 STATUS=400 ACTOR=비인증 거래처 DESC=요청 본문이 유효하지 않습니다 ERROR=요청 본문이 유효하지 않습니다
UA=S2A-Reconv4-InvalidPin/1.0 IP=198.51.100.24 STATUS=400 ACTOR=비인증 거래처 DESC=password: 비밀번호는 숫자 4자리 PIN이어야 합니다 ERROR=password: 비밀번호는 숫자 4자리 PIN이어야 합니다
UTF8_HAS_KOREAN_LOGIN=True
UTF8_HAS_KOREAN_INVALID=True
RAW_HAS_PASSWORD_1234=False
RAW_HAS_INVALID_PIN_12a4=False
RAW_HAS_BIZNO_9999999999=False
RAW_HAS_FORGED=False
```

정상 ingress IP는 복원됐다. 외부 직접 요청의 감사 IP는 세 위조 후보가 아니라 실제 TCP peer `172.29.44.1`이다. 공통 identity 헤더 위조 문자열도 전체 ES 원문에 없다. partner-auth는 신뢰 gateway의 `X-Audit-Client-IP`만 읽고 XFF/`X-Real-IP`를 직접 신뢰하지 않는다. 따라서 IP 복원과 외부 위조 차단이 동시에 성립하며 다른 신뢰 헤더 주입도 재현되지 않았다.

400 두 종류는 실제 Rabbit/ES에 도달했고 자격값은 혼입되지 않았다.

```text
rabbitmq_published_total{application="partner-auth-service",name="rabbit"} 4.0
audit_publisher_drop_total{application="partner-auth-service",reason="queue_full"} 0.0
AUDIT_DISABLED partner-auth=0
AUDIT_DISABLED dc=0
```

집계: passed 8 / skipped 0 / failed 0.

## 4. dc-config pilot 실제 변경

격리 복제 행을 현재 소스의 실제 `PATCH /api/v1/partner-dc-configs/1012555999`로 변경했다.

```text
DC_STATUS=200 MS=0.267599
DC_BODY={"success":true,..."partnerCode":"1012555999","companyName":"동영 온라인점-송아름","homeMultiDc":"49%",..."remark":"재수렴 4회차 격리 QA"...}
1012555999|동영 온라인점-송아름|0.4900|재수렴 4회차 격리 QA
ES_TOTAL=5
DC_ES ... ACTOR=reconv4-qa RESOURCE=1012555999 DESC=거래처 DC 설정 변경 STATUS=200
rabbitmq_published_total{application="dc-config-service",name="rabbit"} 1.0
audit_publisher_drop_total{application="dc-config-service",reason="queue_full"} 0.0
```

집계: passed 1 / skipped 0 / failed 0.

## 5. 400 증가 부하, Rabbit 중단 fail-soft, 복구

정상 Rabbit과 중단 Rabbit에서 PIN validation 400을 각각 40회 순차 호출했다.

```text
RABBIT_UP COUNT=40 STATUS400=40 MIN=9ms P50=14ms P95=15ms MAX=65ms
rabbitmq_published_total{application="partner-auth-service",name="rabbit"} 44.0
audit_publisher_drop_total{application="partner-auth-service",reason="queue_full"} 0.0

RABBIT=Exited (0)
RABBIT_DOWN COUNT=40 STATUS400=40 MIN=6ms P50=9ms P95=11ms MAX=56ms
DC_RABBIT_DOWN STATUS=200 MS=0.025647
1012555999|0.5000|재수렴 4회차 Rabbit 중단 QA
```

Rabbit 복구 후 consumer와 두 pilot을 다시 확인했다.

```text
RABBIT_RESTART_READY=True
CONSUMER_READY=True
samhan.audit.queue  consumers=1 messages_ready=0
PA_POST_RECOVERY=200
DC_POST_RECOVERY=200
ES_BEFORE=50 ES_AFTER=87 DELTA=37
rabbitmq_published_total{application="partner-auth-service",name="rabbit"} 85.0
rabbitmq_published_total{application="dc-config-service",name="rabbit"} 2.0
audit_publisher_drop_total{application="partner-auth-service",reason="queue_full"} 0.0
audit_publisher_drop_total{application="dc-config-service",reason="queue_full"} 0.0
AUDIT_DISABLED partner-auth=0
AUDIT_DISABLED dc=0
```

중단 중에도 업무 응답 40/40과 DC DB commit이 유지됐다. 복구 후 비동기 큐의 잔여 이벤트가 계속 소진돼 두 publisher의 누적 발행량 87과 당시 ES 총량 87이 일치했다. 업무 경로 fail-soft 결함은 재현되지 않았다.

집계: passed 82 / skipped 0 / failed 0.

## 6. 실제 Rabbit 중복 전달 멱등성

동일 event ID를 실제 exchange/routing key로 두 번 발행했다.

```text
PUBLISH_1={"routed":true}
PUBLISH_2={"routed":true}
IDEMPOTENCY BEFORE=87 AFTER=88 DELTA=1 DOC_FOUND=True
DOC_ID=22222222-3333-4444-8555-666666666666 FOUND=True UA=S2A-Reconv4-Idempotency/1.0 STATUS=400 DESC=멱등성 검증 UTF8_OK=True
```

두 전달은 같은 Elasticsearch `_id`를 사용해 총량 증분이 1이었다.

집계: passed 1 / skipped 0 / failed 0.

## 7. 나머지 12개 서비스 비활성

```text
auth-service dep=False javaRefs=0 configRefs=0
user-service dep=False javaRefs=0 configRefs=0
product-service dep=False javaRefs=0 configRefs=0
inventory-service dep=False javaRefs=0 configRefs=0
slip-service dep=False javaRefs=0 configRefs=0
accounting-service dep=False javaRefs=0 configRefs=0
partner-service dep=False javaRefs=0 configRefs=0
partner-order-service dep=False javaRefs=0 configRefs=0
arologis-service dep=False javaRefs=0 configRefs=0
groupware-service dep=False javaRefs=0 configRefs=0
notification-service dep=False javaRefs=0 configRefs=0
dashboard-service dep=False javaRefs=0 configRefs=0
```

집계: passed 12 / skipped 0 / failed 0.

## 8. 변경 관련 모듈 전량 자동 회귀

실행 원문:

```powershell
.\gradlew.bat :services:api-gateway:test :services:partner-auth-service:test \
  :services:logging-service:test :shared:audit-contract:test :shared:audit-publisher:test \
  --rerun-tasks --no-daemon --console=plain
```

```text
BUILD SUCCESSFUL in 1m 23s
28 actionable tasks: 28 executed
services/api-gateway/build/test-results/test tests=55 failures=0 errors=0 skipped=0
services/partner-auth-service/build/test-results/test tests=84 failures=0 errors=0 skipped=0
services/logging-service/build/test-results/test tests=15 failures=0 errors=0 skipped=0
shared/audit-contract/build/test-results/test tests=2 failures=0 errors=0 skipped=0
shared/audit-publisher/build/test-results/test tests=5 failures=0 errors=0 skipped=0
TOTAL tests=161 failures=0 errors=0 skipped=0 passed=161
```

Gradle XML은 PowerShell 기본 디코딩이 한국어 testcase name을 손상시키는 현상을 피하려고 파일 바이트를 UTF-8로 명시 읽고 `<testsuite>` 수치만 집계했다.

집계: passed 161 / skipped 0 / failed 0.

## 9. 격리 개발자 로그 라이브QA

브라우저 플러그인 연결 원문:

```text
No browser is available
agent.browsers.list() => []
```

연결 점검 후 저장소 설치 Playwright Chromium으로 fallback했다. 실제 화면은 격리 Vite `127.0.0.1:41461`, 데이터는 현재 소스 logging-service의 실제 `/logs/activity`가 격리 ES를 조회한 응답이다. 인증·권한·알림 응답만 임시 QA 하니스가 주입했다.

Docker 관리 CLI 지연 뒤 최초 logging 컨테이너가 `/actuator/health`까지 타임아웃되어, 공유 Docker Desktop은 재시작하지 않았다. 동일 현재 bootJar를 host `41483`에서 Rabbit 자동설정만 끄고 동일 격리 ES에 연결한 REST 전용 인스턴스로 기동했다. 원문:

```text
PORT41483=True
Started LoggingServiceApplication in 16.039 seconds
STATUS=200 LEN=5435
TOTAL=87 ITEMS=20 SERVICES=dc-config-service,partner-auth-service
```

화면 원문:

```text
LIVE_UI firstTotal=총 87건
LIVE_UI pilots=true,true
LIVE_UI filteredTotal=총 81건
LIVE_UI pinReason=true
LIVE_UI secretMarkers=false
LIVE_UI uuidVisible=false
LIVE_UI url=http://127.0.0.1:41461/admin/activity-logs
```

시각 검수에서 첫 화면 상단에 `DC 설정 / 거래처 DC 설정 변경`과 `거래처 인증 / 로그인 결과`가 함께 보였다. 검색 화면에는 `password: 비밀번호는 숫자 4자리 PIN이어야 합니다`가 보이고 실제 PIN·비밀번호·사업자번호·위조 문자열·UUID는 없었다.

스크린샷 전체 경로:

- `docs/qa/2026-08-12-1161-s2a-reconv4/01-two-pilots-live.png`
- `docs/qa/2026-08-12-1161-s2a-reconv4/02-pin-400-live.png`

집계: passed 2 / skipped 0 / failed 0.

## 10. 환경/하니스 보정 기록

- 최초 Rabbit은 Docker Desktop volume의 `.erlang.cookie: eacces`로 실패했다. 이번 라운드 전용 컨테이너만 제거하고 이미지 실제 UID/GID `100:101`에 맞춘 전용 volume으로 재기동했다.
- ES JSON은 charset 미표시 때문에 PowerShell 자동 디코딩 시 한글이 깨졌다. 모든 최종 한글 증거는 raw bytes를 UTF-8로 명시 디코딩해 다시 확인했다.
- 첫 UI 하니스의 generic `null` 응답이 알림 배열 계약과 맞지 않아 React가 렌더 중단됐다. `/api/notifications/my`와 `/app/notices/active`를 빈 배열로 보정한 후 실제 `/logs/activity` 데이터로 다시 캡처했다.
- 위 항목은 격리 실행면/증거 인코딩 현상이며 제품 집계에서 분리했다.

## 실행 집계 요약

| 구분 | passed | skipped | failed |
|---|---:|---:|---:|
| gateway route 전파 반경 | 1 | 0 | 0 |
| 격리 DB 파일 복제·UTF-8 | 1 | 0 | 0 |
| IP 양면·identity 위조·400·자격 비혼입 | 8 | 0 | 0 |
| dc-config pilot 실제 변경 | 1 | 0 | 0 |
| 400 부하·Rabbit 중단 fail-soft·복구 | 82 | 0 | 0 |
| 실제 Rabbit 중복 전달 멱등성 | 1 | 0 | 0 |
| 나머지 12개 서비스 비활성 | 12 | 0 | 0 |
| 변경 관련 모듈 전량 자동 회귀 | 161 | 0 | 0 |
| 개발자 로그 라이브QA | 2 | 0 | 0 |
| **합계** | **269** | **0** | **0** |

## 최종 판정

**실 사용자 경로로 재현 가능한 결함은 없다.**

fix4의 필터는 `partner-auth-public-v1` route에만 추가됐고 default filter나 다른 75개 route로 번지지 않았다. 정상 ingress 요청은 실제 사용자 IP `198.51.100.24`로 중앙 감사에 도달했고, 외부 직접 요청이 넣은 `X-Audit-Client-IP`, `X-Real-IP`, XFF 및 identity 헤더들은 감사 결과를 조작하지 못했다. 400 감사·자격 비혼입, Rabbit 중단 fail-soft와 복구, `[AUDIT_DISABLED]` 0건, 두 pilot 도달, 실제 중복 전달 멱등성, 나머지 12개 서비스 비활성 축도 모두 유지됐다.

## 라운드 종료 확인

종료 직전 신선 검증 원문:

```text
REPORT_EXISTS=True BYTES=15616 (종료 확인 절 추가 전)
PNG=.../01-two-pilots-live.png BYTES=254463 SIGNATURE=89-50-4E-47-0D-0A-1A-0A
PNG=.../02-pin-400-live.png BYTES=277730 SIGNATURE=89-50-4E-47-0D-0A-1A-0A
ES_COUNT=88
SERVICES=dc-config-service,partner-auth-service
HAS_NORMAL_IP=True
HAS_DIRECT_PEER=True
HAS_DC=True
HAS_PA=True
HAS_PIN=True
HAS_IDEMPOTENT=True
RAW_SECRET=False
CORE_EXISTS=services/api-gateway/src/main/resources/application.yml True
CORE_EXISTS=services/api-gateway/src/main/java/com/samhanair/logis/gateway/filter/ForwardedClientIpGatewayFilterFactory.java True
CORE_EXISTS=services/api-gateway/src/main/java/com/samhanair/logis/gateway/filter/StripInboundIdentityHeadersGatewayFilterFactory.java True
CORE_EXISTS=services/api-gateway/src/test/java/com/samhanair/logis/gateway/config/S27SlipRouteContractTest.java True
```

포트의 PID와 command line이 이 워크트리의 Vite 또는 `logging-service.jar`인지 확인한 후에만 종료했다. 이어 이번 라운드 고유 `s2a-reconv4-*` 컨테이너 9개, network 1개, Rabbit volume 1개를 제거했다.

```text
RESOLVE PORT=41461 PID=74768 NAME=node.exe OK=True
RESOLVE PORT=41483 PID=107704 NAME=java.exe OK=True
PORT 41461 OPEN=False
PORT 41483 OPEN=False
PORT 41432/41443/41476/41480/41482/41489/41491/41572/41920 OPEN=False
CONTAINERS_LEFT=
NETWORK_LEFT=
VOLUME_LEFT=
```

공유 `samhan-*` 및 다른 라운드 컨테이너에는 중지·삭제·재기동·쓰기 명령을 보내지 않았다. 임시 하니스와 dump는 `.codex/tmp-s2a-reconv4` 아래에만 만들었고 정리 시 제거한다.

최종 파일 정리 후 원문:

```text
TEMP_REMOVED=True
REPORT_BYTES=17434
PNG=.../01-two-pilots-live.png BYTES=254463 SIG=89-50-4E-47-0D-0A-1A-0A
PNG=.../02-pin-400-live.png BYTES=277730 SIG=89-50-4E-47-0D-0A-1A-0A
CORE_4=4
ROUND_FILES=3
```

삭제된 추적 파일 확인: git 명령 금지 때문에 index 기반 비교는 실행하지 않았다. 편집·삭제 원장상 기존 repository 파일 삭제는 0건이다. 삭제 대상은 이번 라운드가 새로 만든 `.codex/tmp-s2a-reconv4`뿐이며, fix4 핵심 구현 파일 4개와 본 보고서·PNG 2개 존재를 정리 직전 재확인했다.

# #1161 S2a 재수렴 적대검증 보고서 (3회차)

검증 대상: 브랜치 `feat/1161-s2-audit-publishers`, 사용자 제공 HEAD `0c3ff971c`, PR #1177. 판정 질문은 오직 **실 사용자 경로로 재현 가능한 결함이 있는가**이다. 구현 코드는 변경하지 않고, git 명령과 공유 `samhan-*` 스택 쓰기를 하지 않는다.

## 측정 1 — 기준선·격리 포트·신뢰 경계 정적 추적

실행 원문:

```powershell
Get-Content docs/handoff/CURRENT-WORK.md -Raw -Encoding UTF8
Get-Content .codex/AGENTS.md -Raw -Encoding UTF8
Get-Content docs/dev-reports/2026-08-12-1161-s2a-fix3.md -Raw -Encoding UTF8
Get-Content docs/dev-reports/2026-08-12-1161-s2a-reconvergence2-sol.md -Raw -Encoding UTF8
docker ps -a --format "{{.Names}}\t{{.Image}}\t{{.Ports}}\t{{.Status}}"
rg -n -C 10 'ForwardedClientIp|partner-auth-public-v1|trusted-gateway|X-Audit-Client-IP' services/api-gateway/src/main services/partner-auth-service/src/main
```

공유 `samhan-*` 컨테이너는 목록만 읽었고 요청·중지·재기동·DB 쓰기를 하지 않았다. 다른 라운드의 `recon*`·`sol*` 자원도 사용하지 않는다. 후보 격리 포트 `35489, 35491, 36572, 36672, 38080, 38082, 38091, 38189, 38761, 39280, 35161`은 전부 `OPEN=False`였다.

신뢰 경계 원문:

```yaml
# /api/auth/** (auth-service)
- name: ForwardedClientIp
  args:
    trustedPeerAddresses: ${SAMHAN_AUDIT_TRUSTED_INGRESS_ADDRESSES:private}

# 실제 pilot 공개 경로 /api/v1/auth/partner-login (partner-auth-service)
- id: partner-auth-public-v1
  filters:
    - StripInboundIdentityHeaders
```

```java
String clientIp = isTrustedPeer(peer, trustedPeers)
        ? firstForwardedAddress(X_Forwarded_For, X_Real_IP, peer)
        : peer;
```

정적 가설: fix3 단위 테스트가 검증한 `ForwardedClientIp` 필터가 실제 partner-auth pilot route에 연결되지 않았다. 따라서 정상 gateway 경유에서도 `X-Audit-Client-IP`가 만들어지지 않아 실제 사용자 IP가 복원되지 않을 가능성이 있다. 또한 필터의 기본 신뢰 근거 `private`는 요청 헤더가 아니라 TCP peer이므로 일반 인터넷 요청자가 직접 바꿀 수는 없지만, 실제 ingress가 사설 peer로 보이는 배치에서는 요청자가 보낸 `X-Real-IP`/XFF를 그대로 채택한다. 실제 라우트 왕복으로 두 축을 분리 판정한다.

집계: passed 0 / skipped 0 / failed 0 (read-only 기준선; 결함 후보는 라이브 왕복 전 보류).

## 측정 2 — 격리 DB 파일 복제와 UTF-8 무결성

공유 PostgreSQL에는 read-only `pg_dump` 연결만 했다. `pg_dump | pg_restore` PowerShell 파이프는 사용하지 않았다. 임시 PostgreSQL client가 host 파일 `dc_config.dump`(56,613 bytes), `partner_auth.dump`(31,859 bytes)를 직접 썼고, 새 `s2a-reconv3-pg`의 격리 DB로 파일 restore했다.

실행 원문(자격값 제외):

```powershell
docker run --rm --network container:samhan-postgres ... -v "${qaTmp}:/out" postgres:16-alpine pg_dump -h 127.0.0.1 ... -d dc_config_db -Fc -f /out/dc_config.dump
docker run --rm --network container:samhan-postgres ... -v "${qaTmp}:/out" postgres:16-alpine pg_dump -h 127.0.0.1 ... -d partner_auth_db -Fc -f /out/partner_auth.dump
docker run -d --name s2a-reconv3-pg --network s2a-reconv3-net -p 127.0.0.1:35489:5432 ... -v "${qaTmp}:/qa:ro" postgres:16-alpine
docker exec s2a-reconv3-pg pg_restore -U s2a -d dc_config_db --no-owner --no-privileges /qa/dc_config.dump
docker exec s2a-reconv3-pg pg_restore -U s2a -d partner_auth_db --no-owner --no-privileges /qa/partner_auth.dump
```

복제 직후 한글 SELECT 원문:

```text
1012555999|동영 온라인점-송아름|NOTION_DC_IMPORT
1018187629|비와이텍 주식회사|NOTION_DC_IMPORT
1021573652|시스템에어컨 - 김영곤님|NOTION_DC_IMPORT
```

판정: 원본과 복제본에서 동일한 세 행을 확인했고 `?` 치환이 없다. UTF-8 증거 무결성을 통과했으므로 라이브QA를 시작한다.

집계: passed 1 / skipped 0 / failed 0 (격리 DB 복제·UTF-8 원문 보존).

## 측정 3 — 현재 소스 실제 기동·IP 양면·400 내용·두 pilot 발행

현재 워크트리 소스의 `eureka-server`, `api-gateway`, `partner-auth-service`, `dc-config-service`, `logging-service` bootJar를 격리 포트에서 기동했다. DB는 측정 2 복제본, Rabbit은 `36572`, Elasticsearch는 `39280`만 사용했다.

빌드 원문:

```text
> Task :services:eureka-server:bootJar UP-TO-DATE
> Task :services:api-gateway:bootJar UP-TO-DATE
> Task :services:partner-auth-service:bootJar UP-TO-DATE
> Task :services:dc-config-service:bootJar UP-TO-DATE
> Task :services:logging-service:bootJar UP-TO-DATE
BUILD SUCCESSFUL in 17s
32 actionable tasks: 32 up-to-date
```

기동 원문:

```text
PORT 38080 OPEN=True
PORT 38082 OPEN=True
PORT 38091 OPEN=True
PORT 38189 OPEN=True
partner-auth [AUDIT_DISABLED]=0
dc-config [AUDIT_DISABLED]=0
```

### 실제 공개 gateway 로그인 요청 5종

동일 실제 route에 정상 ingress 표식, 위조 XFF, 위조 내부 감사 헤더, 깨진 JSON, PIN validation 실패를 차례로 보냈다.

```text
NORMAL_INGRESS STATUS=200 MS=1053
FORGED_XFF STATUS=200 MS=33
FORGED_AUDIT_HEADER STATUS=200 MS=37
MALFORMED_JSON STATUS=400 MS=33 BODY={..."message":"요청 본문이 유효하지 않습니다"...}
INVALID_PIN STATUS=400 MS=25 BODY={..."message":"password: 비밀번호는 숫자 4자리 PIN이어야 합니다"...}
```

Rabbit/ES 원문:

```text
rabbitmq_published_total{application="partner-auth-service",name="rabbit"} 5.0
audit_publisher_drop_total{application="partner-auth-service",reason="queue_full"} 0.0
ES_TOTAL=5
```

| 요청 | 요청 헤더 핵심 | ES `ipAddress` | 판정 |
|---|---|---|---|
| 정상 ingress | `X-Real-IP: 198.51.100.24`, XFF 동일 | `127.0.0.1` | 실제 사용자 IP 복원 실패 |
| XFF 위조 | `X-Forwarded-For: 203.0.113.77` | `127.0.0.1` | XFF 자체 위조는 차단 |
| 내부 헤더 위조 | `X-Audit-Client-IP: 203.0.113.250` | `203.0.113.250` | 공개 요청자가 내부 신뢰 헤더 조작 성공 |
| 깨진 JSON | body에 `BROKEN_SECRET_7788` | `127.0.0.1` | HTTP 400 감사 발행 |
| PIN 실패 | body password `12a4` | `127.0.0.1` | HTTP 400 감사 발행 |

전체 ES `_source` 문자열 검사 원문:

```text
RAW_HAS_PASSWORD_1234=False
RAW_HAS_INVALID_PIN_12a4=False
RAW_HAS_BROKEN_SECRET=False
RAW_HAS_BIZNO=False
```

깨진 JSON 이벤트의 상태/사유는 `400 / 요청 본문이 유효하지 않습니다`, PIN 이벤트는 `400 / password: 비밀번호는 숫자 4자리 PIN이어야 합니다`였다. 비밀번호·PIN·깨진 body 원문·사업자번호가 이벤트에 섞이지 않았다.

### dc-config pilot 실제 변경

격리 복제 행 `1012555999 / 동영 온라인점-송아름`을 실제 `PATCH /api/v1/partner-dc-configs/1012555999`로 변경했다.

```text
DC_STATUS=200 MS=506
BODY={..."companyName":"동영 온라인점-송아름","homeMultiDc":"47%",..."remark":"재수렴 3회차 격리 QA"...}
DC DB=1012555999|동영 온라인점-송아름|재수렴 3회차 격리 QA
rabbitmq_published_total{application="dc-config-service",name="rabbit"} 1.0
audit_publisher_drop_total{application="dc-config-service",reason="queue_full"} 0.0
ES_COUNT=6
```

### 결함 1 — 실제 partner-auth 공개 route에서 사용자 IP 복원 실패와 내부 헤더 위조 허용

실 사용자 경로:

1. 인터넷 사용자가 공개 `POST /api/v1/auth/partner-login`을 gateway로 호출한다.
2. 실제 route `partner-auth-public-v1`에는 fix3의 `ForwardedClientIp`가 없고 `StripInboundIdentityHeaders`만 있다.
3. 정상 ingress의 `X-Real-IP/XFF`는 `X-Audit-Client-IP`로 승격되지 않아 실제 IP가 gateway peer로 소실된다.
4. 반대로 `X-Audit-Client-IP`는 `INBOUND_IDENTITY_HEADERS` 목록에도 없어 외부 요청자가 직접 넣은 값이 partner-auth까지 통과한다.
5. partner-auth는 TCP peer `127.0.0.1`을 명시된 trusted gateway로 인정하고 외부 입력 `203.0.113.250`을 중앙 감사 IP로 저장한다.

따라서 **XFF 자체 위조 차단만 성립**하고, 실제 IP 복원과 감사 전용 헤더 위조 차단은 둘 다 성립하지 않는다. 단위 테스트는 필터 클래스 자체만 호출해 실제 route wiring 누락을 잡지 못했다. 이는 검증 품질 지적이 아니라 실제 공개 요청→gateway→partner-auth→Rabbit→ES에서 재현된 제품 결함이다.

집계: passed 7 (업무 응답 5, 400 감사·민감정보 비혼입 2) / skipped 0 / failed 2 (정상 IP 복원, 내부 감사 헤더 위조 차단). 두 failed는 동일 route wiring 결함의 두 실사용 증상으로 결함 수는 1건이다. dc-config pilot은 passed 1 / skipped 0 / failed 0.

## 측정 4 — 400 증가 부하와 실제 Rabbit 중단 fail-soft

동일 gateway→partner-auth 실제 경로에 PIN validation 400을 Rabbit 정상/중단 상태에서 각각 40회 순차 호출했다.

```text
RABBIT_UP   COUNT=40 STATUS400=40 MIN=6ms P50=10ms P95=13ms MAX=131ms
rabbitmq_published_total{application="partner-auth-service",name="rabbit"} 45.0
audit_publisher_drop_total{application="partner-auth-service",reason="queue_full"} 0.0

RABBIT=Exited (0)
RABBIT_DOWN COUNT=40 STATUS400=40 MIN=3ms P50=6ms P95=9ms MAX=134ms
```

Rabbit 중단 상태에서 dc-config 실제 저장도 수행했다.

```text
DC_RABBIT_DOWN STATUS=200 MS=46
BODY={..."companyName":"동영 온라인점-송아름","homeMultiDc":"48%",..."remark":"Rabbit 중단 격리 QA"...}
DB=1012555999|0.4800|Rabbit 중단 격리 QA
partner-auth: audit publisher failed id=internal reason=AmqpConnectException
dc-config: audit publisher failed id=internal reason=AmqpConnectException
```

판정: 400 감사 추가 후에도 정상 Rabbit P95는 13ms였고 Rabbit 중단 P95는 9ms였다. 중단 중 PIN 400 응답 40/40과 DC 200 및 DB commit이 모두 유지됐다. 감사 worker의 `AmqpConnectException`은 요청 thread에 전파되지 않았다. 업무 지연/fail-soft 결함은 재현되지 않았다.

Rabbit 복구 후 consumer 1개를 확인하고 두 pilot을 다시 실행했다.

```text
RABBIT_RESTART_READY=True
CONSUMER_READY=True
PA_POST_RECOVERY=200
DC_POST_RECOVERY=200
ES_BEFORE=46 ES_AFTER=48
rabbitmq_published_total{application="partner-auth-service",name="rabbit"} 46.0
rabbitmq_published_total{application="dc-config-service",name="rabbit"} 2.0
audit_publisher_drop_total{application="partner-auth-service",reason="queue_full"} 0.0
audit_publisher_drop_total{application="dc-config-service",reason="queue_full"} 0.0
AUDIT_DISABLED partner-auth=0
AUDIT_DISABLED dc-config=0
```

집계: passed 82 (PIN 400 80, Rabbit 중단 DC HTTP+DB 1, 복구 후 두 pilot 묶음 1) / skipped 0 / failed 0.

## 측정 5 — 멱등성·나머지 12개 비활성·집중 회귀 테스트

### 실제 Rabbit 중복 전달 멱등성

동일 event ID를 동일 exchange/routing key로 두 번 발행했다.

```text
PUBLISH_1 routed=True
PUBLISH_2 routed=True
IDEMPOTENCY BEFORE=48 AFTER=49 DELTA=1 DOC_FOUND=True
DOC_ID=11111111-2222-4333-8444-555555555555 UA=S2A-Reconv3-Idempotency/1.0 STATUS=400
```

판정: consumer가 event ID를 Elasticsearch `_id`로 보존해 두 번째 전달이 같은 문서를 덮어썼고 총 문서 증분은 1이었다. 멱등성 결함은 재현되지 않았다.

집계: passed 1 / skipped 0 / failed 0.

### 나머지 12개 서비스 비활성

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

판정: 나머지 12개 서비스에서 `shared:audit-publisher` 의존, main `AuditPublisher` 참조, main 활성 설정이 모두 0이다.

집계: passed 12 / skipped 0 / failed 0.

### 집중 자동 회귀

실행 원문:

```powershell
.\gradlew.bat :services:partner-auth-service:test --tests 'com.samhanair.logis.partnerauth.exception.PartnerAuthExceptionHandlerHttpMessageTest' :services:api-gateway:test --tests 'com.samhanair.logis.gateway.filter.ForwardedClientIpGatewayFilterFactoryTest' :services:logging-service:test --tests 'com.samhanair.logis.log.messaging.AuditLogConsumerTest' :shared:audit-publisher:test --tests 'com.samhanair.logis.shared.audit.publisher.AuditPublisherFailureSoftTest' --no-daemon --console=plain
```

```text
BUILD SUCCESSFUL in 19s
26 actionable tasks: 4 executed, 22 up-to-date
PartnerAuthExceptionHandlerHttpMessageTest tests=6 failures=0 errors=0 skipped=0
ForwardedClientIpGatewayFilterFactoryTest tests=2 failures=0 errors=0 skipped=0
AuditLogConsumerTest tests=2 failures=0 errors=0 skipped=0
AuditPublisherFailureSoftTest tests=4 failures=0 errors=0 skipped=0
TOTAL tests=14 failed=0 skipped=0
```

집계: passed 14 / skipped 0 / failed 0. 이 성공은 측정 3의 실제 route wiring 결함을 반증하지 않는다.

## 측정 6 — 격리 개발자 로그 라이브QA

격리 Vite `127.0.0.1:35161`의 실제 `ActivityLogPage`를 격리 logging-service `127.0.0.1:38082`와 연결했다. 인증·권한 응답만 임시 QA 하니스가 주입하고 `/logs/activity`는 실제 logging-service에 system-master 식별 헤더를 붙여 그대로 왕복했다.

브라우저 플러그인 연결 원문:

```text
No browser is available
agent.browsers.list() => []
```

브라우저 skill의 연결 재설정 금지를 지키면서, 라이브QA 필수라는 사용자 지시에 따라 저장소 설치 Playwright Chromium으로 fallback했다. 첫 검색 하니스는 `password:`/`비밀번호`가 현재 ES analyzer 검색어와 맞지 않아 빈 화면이었고 제품 실행 실패와 분리했다. 실제 검색 계약 `password`로 보정한 최종 원문:

```text
LIVE_UI total=총 49건
LIVE_UI pilots=true,true
LIVE_UI filtered=총 41건
LIVE_UI secretMarkers=false
LIVE_UI url=http://127.0.0.1:35161/admin/activity-logs
Exit code: 0
```

시각 검수 결과 첫 화면 상단에 `DC 설정 / 거래처 DC 설정 변경`과 `거래처 인증 / 로그인 결과`가 함께 보인다. PIN 400 검색 화면에는 `password: 비밀번호는 숫자 4자리 PIN이어야 합니다`가 보이나 원문 `12a4`, `1234`, `BROKEN_SECRET_7788`은 없다. UUID 정규식 문자열도 화면 본문에 노출되지 않았다.

스크린샷 전체 경로:

- `docs/qa/2026-08-12-1161-s2a-reconv3/01-two-pilots-live.png`
- `docs/qa/2026-08-12-1161-s2a-reconv3/02-pin-400-live.png`

집계: passed 2 / skipped 0 / failed 0 (두 pilot 화면, 400 사유·민감정보 비노출 화면). 하니스 검색 보정 전 failed 2는 제품 집계에서 분리한다.

## 측정 7 — 종료 전 신선 검증·격리 자원 정리

종료 직전 신선 검증 원문:

```text
REPORT_EXISTS=True BYTES=15083
PNG=01-two-pilots-live.png BYTES=252921 SIGNATURE=89-50-4E-47-0D-0A-1A-0A
PNG=02-pin-400-live.png BYTES=278326 SIGNATURE=89-50-4E-47-0D-0A-1A-0A
ES_COUNT=49
ACTIVITY_TOTAL=49 SERVICES=dc-config-service,partner-auth-service
dc-config-service    거래처 DC 설정 변경    1012555999
partner-auth-service 로그인 결과           거래처 인증
partner-auth-service password: 비밀번호는 숫자 4자리 PIN이어야 합니다
HAS_DC=True HAS_PA=True HAS_PIN=True
ACTIVITY_HAS_12a4=False ACTIVITY_HAS_BROKEN=False
rabbitmq_published_total{application="partner-auth-service",name="rabbit"} 46.0
rabbitmq_published_total{application="dc-config-service",name="rabbit"} 2.0
audit_publisher_drop_total{application="partner-auth-service",reason="queue_full"} 0.0
audit_publisher_drop_total{application="dc-config-service",reason="queue_full"} 0.0
AUDIT_DISABLED partner-auth=0
AUDIT_DISABLED dc-config=0
```

정리 전 포트→PID의 command line이 이 워크트리 또는 고유 격리 포트를 포함하는지 확인한 후에만 종료했다.

```text
RESOLVE PORT=35161 PID=104300 OK=True CMD=node.exe
RESOLVE PORT=38080 PID=69852 OK=True CMD=java.exe
RESOLVE PORT=38082 PID=62444 OK=True CMD=java.exe
RESOLVE PORT=38091 PID=32856 OK=True CMD=java.exe
RESOLVE PORT=38189 PID=43120 OK=True CMD=java.exe
RESOLVE PORT=38761 PID=78192 OK=True CMD=java.exe
PORT 35161/38080/38082/38091/38189/38761 OPEN=False
```

격리 컨테이너 `s2a-reconv3-rabbit`, `s2a-reconv3-es`, `s2a-reconv3-pg`, network `s2a-reconv3-net`, 이번 라운드 Rabbit volume 3개와 임시 `.codex/tmp-s2a-reconv3`만 제거했다.

```text
TEMP_REMOVED=True
CONTAINERS_LEFT=
NETWORK_LEFT=
VOLUMES_LEFT=
```

공유 `samhan-*` 및 다른 라운드 컨테이너에는 정지·삭제·재기동 명령을 보내지 않았다.

삭제된 추적 파일 확인: git 명령 금지 때문에 index 비교는 실행하지 않았다. 편집 원장상 기존 repository 파일 삭제는 0건이며, 삭제한 것은 이번 라운드가 새로 만든 `.codex/tmp-s2a-reconv3`뿐이다. fix3 핵심 구현 파일 5개와 본 보고서·PNG 2개가 종료 전 존재함을 재확인했다.

## 실행 집계 요약

| 구분 | passed | skipped | failed |
|---|---:|---:|---:|
| 현재 소스 bootJar·격리 실제 기동 | 1 | 0 | 0 |
| 격리 DB 파일 복제·UTF-8 | 1 | 0 | 0 |
| gateway 로그인 5종 응답·400 감사·민감정보 | 7 | 0 | 2 |
| dc-config pilot 실제 변경·중앙행 | 1 | 0 | 0 |
| 400 부하·Rabbit 중단 fail-soft·복구 | 82 | 0 | 0 |
| 실제 Rabbit 중복 전달 멱등성 | 1 | 0 | 0 |
| 나머지 12개 서비스 비활성 | 12 | 0 | 0 |
| 집중 자동 회귀 | 14 | 0 | 0 |
| 개발자 로그 라이브QA | 2 | 0 | 0 |
| **합계** | **121** | **0** | **2** |

failed 2는 동일 실제 route wiring 결함의 두 증상이다. Rabbit 초기 container의 `.erlang.cookie` 소유권 문제와 UI 검색 하니스의 중간 실패는 격리 환경/하니스 보정으로 제품 집계에서 분리했다.

## 최종 판정

**실 사용자 경로로 재현 가능한 결함이 있다. 총 1건이다.**

`partner-auth-public-v1` 실제 공개 route에 fix3의 `ForwardedClientIp`가 연결되지 않았고 `X-Audit-Client-IP`도 공개 route strip 목록에 없다. 그 결과 정상 ingress의 실제 사용자 IP `198.51.100.24`는 `127.0.0.1`로 소실되는 동시에, 외부 요청자가 넣은 `X-Audit-Client-IP: 203.0.113.250`은 중앙 감사에 그대로 저장된다. XFF 위조 자체는 `127.0.0.1`로 무시됐지만, **IP 복원과 위조 차단이 함께 성립하지 않는다.**

반면 fix3의 400 감사는 실제 깨진 JSON·PIN validation에서 각각 ES/화면까지 도달했고 비밀번호·PIN·깨진 body·사업자번호 원문은 없었다. Rabbit 정상/중단 400 P95는 각각 13ms/9ms였고 DC 업무 commit도 유지됐다. `[AUDIT_DISABLED]` 0건, 두 pilot metric·ES·화면 도달, 멱등성, 나머지 12개 서비스 비활성도 재확인했다.


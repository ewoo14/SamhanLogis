# PR #1206 재수렴 적대검증 4차 (SOL) · 머지 직전 라이브 QA

- 대상: PR #1206, `feat/1161-s15-retention`
- exact HEAD: `2f6c0b5c0847f3c806bfcbecf62d80fe79841d38`
- 일시: 2026-08-14 (Asia/Seoul)
- 최종 판정: **도달 가능한 제품 결함 0건 · 머지 권고**
- 원칙: git 명령·제품 코드 수정 없음. 대상 6개 서비스만 브랜치 JAR로 재배포. 로컬 Playwright Chromium 1217 직접 launch. 합성·복제 PNG 없음.

## 1. 환경 실측 원문

### 1.1 RAM · 컨테이너 존재/부재

모든 작업 시점에 1.0GB 중단선보다 높았다. logging profile을 포함한 Compose 선언과 실제 Compose service label을 대조해 부재를 셌다.

```text
RAM_FREE_GB=3.759
RAM_PREBUILD_FREE_GB=3.264
RAM_AFTER_REDEPLOY_FREE_GB=7.708
RAM_PRE_BROWSER_FREE_GB=4.984
RAM_FINAL_FREE_GB=5.046
RAM_TOTAL_GB=61.613

COMPOSE_DECLARED=25|PRESENT=23|ABSENT=2
ABSENT_SERVICE=prometheus
ABSENT_SERVICE=nginx
```

### 1.2 exact local ref

git 명령을 쓰지 않고 worktree ref 파일과 GitHub PR head를 각각 읽었다.

```text
LOCAL_REF=2f6c0b5c0847f3c806bfcbecf62d80fe79841d38
PR_HEAD=2f6c0b5c0847f3c806bfcbecf62d80fe79841d38
EXACT_SHA_MATCH=True
```

### 1.3 빌드 · 지정 6개만 재배포

현재 worktree에는 `scripts/redeploy-service.ps1`가 없어, main 반영본이 있는 최신 worktree의 스크립트 원문을 메모리에서 로드하고 `repoRoot`만 현재 worktree로 주입했다. 파일 복사·제품 코드 수정 없이 동일한 `bootJar → compose up --build --no-deps → health/actuator` 절차를 사용했다.

먼저 새 JAR 시각을 만들기 위해 6개 bootJar를 강제 재실행했다.

```text
BUILD SUCCESSFUL in 36s
41 actionable tasks: 41 executed
```

재배포 스크립트 원문 결과:

```text
logging-service       jar=2026-08-14 14:18:48  container=2026-08-14T05:19:14Z  health=healthy
api-gateway           jar=2026-08-14 14:18:44  container=2026-08-14T05:19:52Z  health=healthy
user-service          jar=2026-08-14 14:18:49  container=2026-08-14T05:20:25Z  health=healthy
dashboard-service     jar=2026-08-14 14:18:49  container=2026-08-14T05:21:05Z  health=healthy
dc-config-service     jar=2026-08-14 14:18:49  container=2026-08-14T05:21:42Z  health=healthy
partner-auth-service  jar=2026-08-14 14:18:45  container=2026-08-14T05:22:18Z  health=healthy

배포본 readiness 확인 완료: 모든 대상 서비스가 healthy 및 actuator 200/UP 입니다.
```

## 2. ① 6개 서비스 정상 기동

최종 독립 재확인 원문이다. JAR 시각은 호스트 산출물이 아니라 컨테이너 내부 `/app/app.jar`의 `stat`이다.

```text
FINAL_SERVICE|logging-service|running|healthy|0|ACTUATOR=200|{"status":"UP"}|JAR=2026-08-14 14:18:48 +0900|101001383
FINAL_SERVICE|api-gateway|running|healthy|0|ACTUATOR=200|{"status":"UP"}|JAR=2026-08-14 14:18:44 +0900|58582798
FINAL_SERVICE|user-service|running|healthy|0|ACTUATOR=200|{"status":"UP"}|JAR=2026-08-14 14:18:49 +0900|93513394
FINAL_SERVICE|dashboard-service|running|healthy|0|ACTUATOR=200|{"status":"UP"}|JAR=2026-08-14 14:18:49 +0900|101572654
FINAL_SERVICE|dc-config-service|running|healthy|0|ACTUATOR=200|{"status":"UP"}|JAR=2026-08-14 14:18:49 +0900|93437597
FINAL_SERVICE|partner-auth-service|running|healthy|0|ACTUATOR=200|{"status":"UP"}|JAR=2026-08-14 14:18:45 +0900|93376277
```

보호 대상 3개는 시작 전후 ID와 생성시각이 같다. 재배포하지 않았다.

```text
inventory-service  id=6d0a080f58a3f874bd881141c4f42c642c5fb51f09fc458e44ab245a557a466d  created=2026-08-14T03:20:44.827817184Z  healthy
accounting-service id=9971806a6163bd5638d7c23df9731ab9db844e43e79512f1ba1d31667d761ce9  created=2026-08-14T03:20:44.827888974Z  healthy
auth-service       id=aa82beb4d5ed78b845ecddff0eaa4c7da04ab49a2f5d30132102e52815b08881  created=2026-08-13T22:56:30.169049611Z  healthy
```

## 3. ② 필수 설정 누락 fail-fast · 테스트 컨텍스트 분리

실행 중 정상 컨테이너 환경을 복제하고 각 대상 키 하나만 제거한 격리 컨테이너를 띄웠다. 공유 서비스 설정은 바꾸지 않았다.

```text
MISSING_ENV_TEST|dc-config-service|removed=RABBIT_HOST|exited|1|OOM=false
Application run failed
Caused by: java.lang.IllegalArgumentException: Could not resolve placeholder 'RABBIT_HOST' in value "${RABBIT_HOST}"

MISSING_ENV_TEST|partner-auth-service|removed=RABBIT_HOST|exited|1|OOM=false
Application run failed
Caused by: java.lang.IllegalArgumentException: Could not resolve placeholder 'RABBIT_HOST' in value "${RABBIT_HOST}"

MISSING_ENV_TEST|logging-service|removed=RABBIT_USER|exited|1|OOM=false
Application run failed
Caused by: java.lang.IllegalArgumentException: Could not resolve placeholder 'RABBIT_USER' in value "${RABBIT_USER}"

TEMP_REMOVED|qa-1206-reconv4-dc-missing|exists=False
TEMP_REMOVED|qa-1206-reconv4-partner-missing|exists=False
TEMP_REMOVED|qa-1206-reconv4-logging-missing|exists=False
```

테스트 컨텍스트가 운영 fail-fast에 걸리지 않는지 `--rerun-tasks`로 실제 재실행했다. 단순 UP-TO-DATE 결과가 아니다.

```text
.\gradlew.bat :services:dc-config-service:test
  :services:partner-auth-service:test
  :services:logging-service:test
  :services:api-gateway:test
  --no-daemon --console=plain --rerun-tasks

> Task :services:api-gateway:test
> Task :services:partner-auth-service:test
> Task :services:logging-service:test
> Task :services:dc-config-service:test

BUILD SUCCESSFUL in 1m 17s
28 actionable tasks: 28 executed
GRADLE_TEST_RERUN_EXIT=0
```

즉 운영 이미지의 필수 placeholder 누락은 exit 1이고, 테스트 property source가 있는 테스트 컨텍스트는 전량 실행 성공했다.

## 4. ③ 감사 파이프 본래 기능

### 4.1 실제 업무 mutation → audit.# → ES

MASTER 실 로그인 후 `dev_developer` 역할을 DEVELOPER→MANAGER로 변경하고, QA 릴리스를 생성·게시했다. 임시 전용 큐를 `samhan.audit.exchange`의 `audit.#`에 바인딩해 payload를 직접 받았다.

```text
LOGIN_MASTER|HTTP=200|role=MASTER
USER_BASELINE|loginId=dev_developer|role=DEVELOPER
USER_ROLE_CHANGE|HTTP=200|loginId=dev_developer|role=MANAGER
RELEASE_CREATE|HTTP=200|version=2026/08/14-12064|published=False
RELEASE_PUBLISH|HTTP=200|version=2026/08/14-12064|published=True

RABBIT_CAPTURE|routing=audit.change.user-service|service=user-service|requestId=qa-1206-reconv4-user-role|retention=A|action=A_CHANGE|route=/api/v1/admin/users/{id}/role
RABBIT_CAPTURE|routing=audit.change.dashboard-service|service=dashboard-service|requestId=qa-1206-reconv4-release-publish|retention=A|action=A_CHANGE|route=/app/releases/{id}/publish

ES_VERIFY|grade=A|requestId=qa-1206-reconv4-user-role|HTTP=200|count=2|index=samhan-audit-logs-a
ES_VERIFY|grade=A|requestId=qa-1206-reconv4-release-publish|HTTP=200|count=2|index=samhan-audit-logs-a
```

각 요청에서 A 이벤트 2건이 캡처 큐와 ES에 관측됐다. 이는 같은 문서의 중복 발행이 아니라, 컨트롤러가 발행하는 업무 변경 이벤트(`resourceType=EMPLOYEE_ROLE`/`APP_RELEASE`)와 공통 `AuditRequestCaptureInterceptor`가 요청당 발행하는 HTTP 결과 이벤트(`resourceType=HTTP`)의 두 감사 레이어다. 두 이벤트는 각각 새 UUID를 갖는 계약이며 유실 없이 저장됐다.

### 4.2 A/B/C 인덱스 · ILM 분리

B/C는 소유 태그가 있는 유효 감사 이벤트만 추가 발행했다.

```text
GRADE_PUBLISH|grade=B|routed=True
GRADE_PUBLISH|grade=C|routed=True
RABBIT_CAPTURE|routing=audit.failure.qa|service=qa-reconv4|requestId=qa-1206-reconv4-grade-b|retention=B|action=B_FAILURE
RABBIT_CAPTURE|routing=audit.read.qa|service=qa-reconv4|requestId=qa-1206-reconv4-grade-c|retention=C|action=C_READ

ES_VERIFY|grade=B|requestId=qa-1206-reconv4-grade-b|HTTP=200|count=1|index=samhan-audit-logs-b
ES_VERIFY|grade=C|requestId=qa-1206-reconv4-grade-c|HTTP=200|count=1|index=samhan-audit-logs-c

ILM|grade=A|policy=samhan-audit-ilm-a|delete.min_age=365d
ILM|grade=B|policy=samhan-audit-ilm-b|delete.min_age=365d
ILM|grade=C|policy=samhan-audit-ilm-c|delete.min_age=30d
```

### 4.3 DLQ 재시도 상한 · 빈 DLQ 200

시작 DLQ는 0건이었다. management API로 소유 poison `qa-1206-reconv4-owned-poison` 한 건만 DLX에 넣었다. 실제 공유 DLQ 메시지는 제거하지 않았다.

```text
DLQ_BEFORE_POISON|messages=0
DLQ_OWNED_PUBLISH|routed=True|messageId=qa-1206-reconv4-owned-poison
DLQ_INITIAL|HTTP=200|retryCount=0|maxRedeliveries=3|reason=qa-reconv4-owned-poison

DLQ_RETRY_1|HTTP=200|data=true
DLQ_AFTER_RETRY_1|retryCount=1|maxRedeliveries=3
DLQ_RETRY_2|HTTP=200|data=true
DLQ_AFTER_RETRY_2|retryCount=2|maxRedeliveries=3
DLQ_RETRY_3|HTTP=200|data=true
DLQ_AFTER_RETRY_3|retryCount=3|maxRedeliveries=3
DLQ_OVER_LIMIT|HTTP=200|data=false
DLQ_AFTER_OVER_LIMIT|retryCount=3|maxRedeliveries=3
DLQ_DISCARD_OWNED|HTTP=200|data=true
DLQ_FINAL_EMPTY|HTTP=200|body={"success":true,"code":"OK","message":"성공","data":[{"queue":"samhan.audit.dlq","messageCount":0}]}
```

### 4.4 기존 큐가 있는 브로커 위 재배포

RabbitMQ를 재기동·purge하지 않고 기존 durable queue 위에 logging-service를 재배포했다.

```text
QUEUE|samhan.audit.queue|messages=0|consumers=1|policy=samhan-audit-retention
QUEUE|samhan.audit.failure.queue|messages=0|consumers=1|policy=samhan-audit-retention
QUEUE|samhan.audit.read.queue|messages=0|consumers=1|policy=samhan-audit-retention
QUEUE|samhan.audit.dlq|messages=0|consumers=0
POLICY|name=samhan-audit-retention|pattern=^samhan\.audit\.(queue|failure\.queue|read\.queue)$|priority=10|definition={"max-length":10000,"message-ttl":86400000}
PRECONDITION_FAILED_LOG_COUNT=0
```

## 5. ④ 운영 API 응답 계약 · 정상 관리자 경로

### 5.1 실 HTTP 응답 표

```text
LOGIN_ROLES|master=MASTER|manager=MANAGER|other=AROLOGIS_MASTER

GW_MASTER_INSPECT|HTTP=200|body={"success":true,"code":"OK","message":"성공","data":[{"queue":"samhan.audit.dlq","messageCount":0}]}
GW_MASTER_RETRY_ABSENT|HTTP=200|body={"success":true,"code":"OK","message":"성공","data":false}
GW_MASTER_DISCARD_ABSENT|HTTP=200|body={"success":true,"code":"OK","message":"성공","data":false}

GW_MANAGER_INSPECT|HTTP=200|body={"success":true,"code":"OK","message":"성공","data":[{"queue":"samhan.audit.dlq","messageCount":0}]}
GW_MANAGER_RETRY|HTTP=200|body={"success":true,"code":"OK","message":"성공","data":false}
GW_MANAGER_DISCARD|HTTP=200|body={"success":true,"code":"OK","message":"성공","data":false}

REAL_GENERAL_ACCOUNT|loginId=kimeunji|role=ACCOUNTANT|HTTP=403|body={"success":false,"code":"FORBIDDEN","message":"권한이 없습니다"}
REAL_GENERAL_ACCOUNT|loginId=kimgicheol|role=SALES|HTTP=403|body={"success":false,"code":"FORBIDDEN","message":"권한이 없습니다"}

GW_NO_AUTH_INSPECT|HTTP=401|body={"success":false,"code":"UNAUTHORIZED","message":"인증 토큰이 없습니다"}
GW_EXPIRED_INSPECT|HTTP=401|body={"success":false,"code":"INVALID_TOKEN","message":"유효하지 않은 토큰입니다"}
GW_OTHER_SERVICE_INSPECT|HTTP=403|body={"success":false,"code":"FORBIDDEN","message":"권한이 없습니다"}

DIRECT_NO_HEADERS_INSPECT|HTTP=401|body={"success":false,"code":"UNAUTHORIZED","message":"내부 인증 토큰이 유효하지 않습니다"}
DIRECT_FORGED_MASTER_INSPECT|HTTP=401|body={"success":false,"code":"UNAUTHORIZED","message":"내부 인증 토큰이 유효하지 않습니다"}
DIRECT_VALID_INTERNAL_MANAGER_INSPECT|HTTP=403|body={"success":false,"code":"FORBIDDEN","message":"권한이 없습니다"}

GW_MASTER_BY_SERVICE|HTTP=200|body.success=true|body.code=OK
```

정상 관리자 경로는 막히지 않았다. MASTER와 실 MANAGER는 DLQ 3동작 모두 200이며, ACCOUNTANT/SALES는 403이다. 직접 위조와 내부 토큰만으로 권한 상승도 되지 않았다.

### 5.2 기존 계약 테스트 원문

§3의 fresh Gradle 재실행에 `DlqOperationsTest`, `DlqControllerSecurityTest`, `HeaderAuthenticationFilterTest`, gateway JWT/allowedGroups 계약 테스트가 포함됐고 `28 actionable tasks: 28 executed`, exit 0이다.

### 5.3 로컬 Playwright 실 QA

정본 `vite.renderer.dev.config.ts`를 사용해 HashRouter 경로로 이동하고 화면별 전용 요소를 단정했다.

```text
VITE_RENDERER_READY|HTTP=200
Running 1 test using 1 worker
PLAYWRIGHT_REAL_QA_PASS|screenshots=9|browser=C:\Users\user\AppData\Local\ms-playwright\chromium-1217\chrome-win64\chrome.exe
1 passed (9.0s)
PLAYWRIGHT_RENDERER_EXIT=0
VITE_RENDERER_STOPPED=True
```

이번 검증자가 직접 생성한 `r4-*` 9장:

1. 잘못된 로그인 차단
2. MASTER 정상 로그인 대시보드
3. 사용자 관리 화면의 `dev_developer` 개발자 원복 상태
4. 버전 관리 화면의 QA 릴리스 제거 상태
5. 활동 로그 정상 화면
6. gateway MASTER 200 JSON
7. gateway ACCOUNTANT 403 JSON
8. gateway 무인증 401 JSON
9. logging direct forged 401 JSON

## 6. ⑤ exact SHA CI

fresh GitHub 조회 원문 요약:

```text
CI_SUMMARY|head=2f6c0b5c0847f3c806bfcbecf62d80fe79841d38|total=42|success=41|skipped=1|failure=0

빌드 + 테스트 (shared+auth+gateway)                  pass
빌드 + 테스트 (user+product+inventory+logging)      pass
빌드 + 테스트 (phase9-10 (groupware+notification+dashboard)) pass
Credential Plaintext Guard (SP-08-8)                pass
자격 평문 비공개 가드 (docs 관할, SP-08-8)          pass
하네스 거짓 green 가드 (docs/qa 관할)               pass
Frontend Desktop (typecheck + lint + build)          pass
GitGuardian Security Checks                          skipping
```

실패 check는 0이다. GitGuardian 외부 check는 현재 `SKIPPED`이며, repository plaintext guard 두 개는 모두 SUCCESS다.

## 7. 캡처 SHA-256 · 중복 0

디렉터리에는 본 검증 시작 전 생성돼 있던 9장과 이번 검증자의 `r4-*` 9장이 함께 있다. 기존 파일은 덮어쓰거나 삭제하지 않았고, 최종 18장 전체를 직접 다시 해시했다.

```text
00-login-invalid-credential.png|890372af3b3ad81a956180560e6495147973263f4a74665dee27390838b86fc3|31844
01-login-success-dashboard.png|aaf7d7211e6fb6272450b9b3b5dc9102ee45e4bd6d2653e1dfad788c12ae21c4|37753
02-user-role-manager-live.png|7d93990520b900e53fb0bbb52946ac3e7cc4363732b1db53fd824eab05f7c07f|62857
03-dashboard-release-published-live.png|ec2df20098368916cc28aa9b0a361014d9168280a616625c19e82e4ec80778bc|60051
04-gateway-no-auth-401.png|ab17c8ba4c11594d8ff701e7dfa80051028f224723db4a14ea934ba391d24006|7898
05-gateway-regular-403.png|9d50f8c9dfb02d4008814ebead0a841f4d04c0396219584aeb4d02654a47f02a|7535
06-gateway-master-200.png|f0e9a012f7787b0a4bc539a1a44c489c711c48a2b7b8a3fb9431d2bfa05854dd|9730
07-direct-forged-master-401.png|095580bbc18c64f0676434113d1d0dd9380f07ac34beb702e44d4b96b6b74585|8331
08-activity-log-developer-normal.png|7ddfab9dfaa3fc65209e0cd9e78491ff0c27f0af47d28e3a30c959d786e0e955|45461
r4-00-login-invalid-real-qa.png|2030aabce0b4b74e1dee135582d681197b22116e2155c55ee52c0bbd99e33505|30399
r4-01-login-master-dashboard-real-qa.png|0ca1bc5c1e7cd5712c13e02faeaf7b84840c6b75cd0ad0af481850d450c9cb0f|38467
r4-02-user-role-restored-real-qa.png|ddd0ff5794149c151e1c52fd9d00fda95df8d3286a5aca637f2211c6490af4b6|58119
r4-03-release-removed-real-qa.png|30449887fc272e3accf558c2e18ad1a9e5b90aa6eb7049d7c05ddbdc27a93075|51560
r4-04-activity-log-normal-real-qa.png|05c2022b3dcad56a4a7f93bdaacd4352e99885d332044469b600a2912ad20106|118653
r4-05-gateway-master-200-real-qa.png|ecbfaf5a45a1a53b8780218a7390835bf83b10382569e24ced31667b1e2d17c5|9475
r4-06-gateway-accountant-403-real-qa.png|563a12024bebfac100230a4b0007cf282df090dfab3d288e4171d1b389d3c08d|7260
r4-07-gateway-no-auth-401-real-qa.png|cd567cb3d8ae85c60e5e2fe4126e4d0f88357565d8fa86933c984de96ec82a17|7623
r4-08-direct-forged-401-real-qa.png|cb586c46e32f61a6332a12c25d7a632e18b35dacdaf1afc47d1416bc5bec556b|8044

SCREENSHOT_COUNT=18
DUPLICATE_HASH_GROUPS=0
```

## 8. 도달 가능한 결함 목록

**0건.** 다음 회귀는 재현되지 않았다.

- 필수 설정 누락 시 열린 프로세스+health DOWN으로 조용히 남는 동작
- 테스트 컨텍스트가 운영 필수 placeholder에 걸리는 동작
- 기존 큐 재선언 406
- user/dashboard 감사 발행 미도달
- A/B/C 인덱스·ILM 혼합
- DLQ 무한 재처리 또는 빈 DLQ 500
- 운영 API의 MASTER/MANAGER 정상 경로 차단
- 직접 헤더 위조·내부 토큰만으로 권한 상승

## 9. 관측 불가 · 실행 실패 원문

최종 요구사항 ①~⑤에는 관측 불가가 없다. 아래는 최종 성공 전에 발생했고 원인을 분리한 하네스 실패 원문이다.

1. 기본 Playwright config가 `*-real-qa.spec.ts`를 의도적으로 ignore했다.

```text
Error: No tests found.
PLAYWRIGHT_EXIT=1
```

2. 최초 `vite.web.config.ts`는 `VITE_PLATFORM=web` BrowserRouter라 hash가 무시돼 대시보드에 낙착했다.

```text
UI_UNOBSERVABLE|route=/#/admin/users|url=http://127.0.0.1:5175/#/admin/users|body=...대시보드...
UI_UNOBSERVABLE|route=/#/admin/app-releases|...|body=...대시보드...
UI_UNOBSERVABLE|route=/#/admin/activity-logs|...|body=...대시보드...
```

정본 `vite.renderer.dev.config.ts`로 교체한 뒤 HashRouter 화면 전용 요소에 도달했다.

3. 첫 HashRouter 실행에서 UI 역할 표시를 enum `DEVELOPER`로 단언했으나 실 화면은 한국어 `개발자`였다.

```text
Expected substring: "DEVELOPER"
Received string: "...dev_developer...[DEV-SEED] 개발개발자대표실개발자활성..."
```

표시 계약을 `개발자`로 맞춘 최종 실행은 1/1 통과했다.

4. 일부 초기 인라인 PowerShell 하네스는 parser 공백/배열 바인딩 오류로 API 호출 전에 중단됐다. 데이터 mutation 0건인 것을 확인한 뒤 가독성 있는 임시 하네스로 교체했다.

```text
The Try statement is missing its Catch or Finally block.
Missing 'in' after variable in foreach loop.
MASTER login token missing
Cleanup login failed: code=INVALID_INPUT
```

`MASTER login token missing`은 `QA_MASTER_PASSWORD`가 현재 dev_master 자격과 달랐기 때문이다. 비밀값은 출력하지 않았고, 실제 개발 계정 계약인 `QA_DEV_DEFAULT_PASSWORD`로 정상 로그인했다.

## 10. 브로커 · ES · 업무 · 스택 원복 증명

### 10.1 업무/DB

```text
CLEAN_ROLE_BEFORE|loginId=dev_developer|role=MANAGER
CLEAN_ROLE_PATCH|success=True|loginId=dev_developer|role=DEVELOPER
CLEAN_RELEASE_UNPUBLISH|success=True|version=2026/08/14-12064|published=False
CLEAN_RELEASE_DELETE|success=True|code=OK
VERIFY_ROLE|loginId=dev_developer|role=DEVELOPER
VERIFY_RELEASE_REMOVED|version=2026/08/14-12064|matches=0
```

### 10.2 Elasticsearch

cleanup mutation 자체가 만든 A 이벤트까지 기다린 뒤 소유 prefix만 재삭제했다.

```text
ES_TAGGED_CLEAN|grade=A|pre=4|deleted=4|failures=0|post=0
ES_TAGGED_CLEAN|grade=B|pre=1|deleted=1|failures=0|post=0
ES_TAGGED_CLEAN|grade=C|pre=1|deleted=1|failures=0|post=0

ES_TAGGED_RECLEAN|grade=A|pre=4|deleted=4|failures=0|post=0
ES_TAGGED_RECLEAN|grade=B|pre=0|deleted=0|failures=0|post=0
ES_TAGGED_RECLEAN|grade=C|pre=0|deleted=0|failures=0|post=0

ES_FINAL|grade=A|count=0
ES_FINAL|grade=B|count=0
ES_FINAL|grade=C|count=0
```

### 10.3 RabbitMQ

```text
CAPTURE_QUEUE_DELETE|HTTP=204
CAPTURE_QUEUE_VERIFY|HTTP=404
CAPTURE_QUEUE_FINAL|HTTP=404
TEMP_CONTAINERS=0

samhan.audit.queue         messages=0 consumers=1
samhan.audit.failure.queue messages=0 consumers=1
samhan.audit.read.queue    messages=0 consumers=1
samhan.audit.dlq           messages=0 consumers=0
```

### 10.4 프로세스

```text
PORT5175_LISTENERS=0
TEMP_QA_FILES=0
TEMP_CONTAINERS=0
PLAYWRIGHT_NODE_MODULES_JUNCTION=False
```

Chromium 1217 전역 프로세스 7개는 이번 검증 시작 전인 13:03:25에 생성된 다른 트랙 소유 profile `playwright_chromiumdev_profile-56scOT`였다. 이번 검증의 Chromium은 `browser.close()`로 종료됐고, 다른 트랙 프로세스는 종료하지 않았다.

## 11. 최종 판정

6개 서비스는 브랜치 새 JAR로 healthy/actuator 200이며, 세 서비스의 필수 설정 누락은 exit 1과 미해결 placeholder로 즉시 드러난다. 테스트 컨텍스트는 fresh 재실행을 통과했다. 실제 user 역할변경과 dashboard 릴리스 게시가 Rabbit과 ES에 도달했고 A/B/C·ILM·DLQ 상한·빈 DLQ·기존 큐 배포가 유지됐다. 운영 API는 정상 MASTER/MANAGER를 막지 않으면서 일반 계정·무인증·만료·타 서비스 토큰·직접 위조를 차단했다.

**도달 가능한 제품 결함 0건, exact SHA CI 실패 0건이므로 머지 권고한다.**

# PR #1180 권한 계약 적대검증 라이브QA 보고서

- 대상: PR `#1180` (`feat/901-claude-conversation`, 요청 HEAD `c7cedafa1`)
- 일시: 2026-08-13 (Asia/Seoul)
- 최종 판정: **중단 — 머지 비권고**
- 사유: 검증자가 기동한 대상 auth-service가 포트 충돌로 종료됐는데, 같은 포트의 선행 `liveqa1180-auth` 컨테이너 응답을 대상 서버 응답으로 오인한 전제 불일치가 확인됐다. 사용자 지시대로 확인 즉시 추가 검증·수정을 중단했다.
- 범위 밖으로 결함 처리하지 않은 항목: 대화 UI, 모델 호출, 도구 호출, 감사 로그, 허용 시 `501` 자체.

> **2026-08-14 재개 최종 판정:** 아래 14절 이후의 대상 HEAD 재검증이 완료되어, 최초 중단 판정을 **머지 권고**로 갱신한다. 최초 중단 기록과 무효 증거는 삭제하지 않고 그대로 보존한다.

> 이 보고서에서 선행 `liveqa1180-*` 스택으로 얻은 HTTP 결과는 모두 **무효 증거**로 표시한다. 미실행·무효는 통과가 아니며 관측 불가다.

## 1. 환경 원문

### 1.1 최초 필수 프리앰블

`git show origin/main:.claude/briefing/liveqa-preamble.md`를 최초 명령으로 읽었다. 이후 git 명령은 사용하지 않았다. 프리앰블에 따라 로컬 Playwright Chromium, 해시 라우터, 화면 전용 요소 단정, 격리 DB, 배포본 나이, RAM 중단선, 실패 명령 원문 보존을 적용했다.

### 1.2 공유 스택 컨테이너 — 있는 것 원문

```text
samhan-inventory-service|Up 5 minutes (healthy)|infrastructure-inventory-service
samhan-groupware-service|Up About an hour (healthy)|infrastructure-groupware-service
samhan-dashboard-service|Up About an hour (healthy)|infrastructure-dashboard-service
samhan-slip-service|Up 5 hours (healthy)|infrastructure-slip-service
samhan-api-gateway|Up 5 hours (healthy)|infrastructure-api-gateway
samhan-partner-order-service|Up 5 hours (healthy)|infrastructure-partner-order-service
samhan-auth-service|Up 5 hours (healthy)|infrastructure-auth-service
samhan-product-service|Up 5 hours (healthy)|infrastructure-product-service
samhan-eureka|Up 5 hours (healthy)|infrastructure-eureka-server
samhan-postgres|Up 5 hours (healthy)|postgres:16-alpine
samhan-user-service|Up 5 hours (healthy)|infrastructure-user-service
samhan-arologis-service|Up 5 hours (healthy)|infrastructure-arologis-service
samhan-accounting-service|Up 5 hours (healthy)|infrastructure-accounting-service
samhan-dc-config-service|Up 5 hours (healthy)|infrastructure-dc-config-service
samhan-partner-service|Up 5 hours (healthy)|infrastructure-partner-service
samhan-partner-auth-service|Up 5 hours (healthy)|infrastructure-partner-auth-service
samhan-notification-service|Up 5 hours (healthy)|infrastructure-notification-service
samhan-grafana|Up 5 hours (healthy)|grafana/grafana:11.3.1
samhan-minio|Up 5 hours (healthy)|minio/minio:latest
samhan-elasticsearch|Up 5 hours (healthy)|docker.elastic.co/elasticsearch/elasticsearch:8.15.3
samhan-rabbitmq|Up 5 hours (healthy)|rabbitmq:3.13-management-alpine
samhan-redis|Up 5 hours (healthy)|redis:7-alpine
```

### 1.3 공유 스택 생성 시각 원문

```text
/samhan-inventory-service|2026-08-13T14:41:41.284847062Z|infrastructure-inventory-service|running
/samhan-groupware-service|2026-08-13T13:23:36.625625462Z|infrastructure-groupware-service|running
/samhan-dashboard-service|2026-08-13T13:22:47.341656837Z|infrastructure-dashboard-service|running
/samhan-slip-service|2026-08-12T17:53:07.461758521Z|infrastructure-slip-service|running
/samhan-api-gateway|2026-08-12T15:39:17.991855852Z|infrastructure-api-gateway|running
/samhan-partner-order-service|2026-08-12T15:02:01.069557636Z|infrastructure-partner-order-service|running
/samhan-auth-service|2026-08-12T00:03:23.288496844Z|infrastructure-auth-service|running
/samhan-product-service|2026-08-11T18:10:22.372262338Z|infrastructure-product-service|running
/samhan-eureka|2026-08-11T18:10:15.05691594Z|infrastructure-eureka-server|running
/samhan-postgres|2026-08-11T18:10:14.478346436Z|postgres:16-alpine|running
/samhan-user-service|2026-08-11T17:59:58.945181532Z|infrastructure-user-service|running
/samhan-arologis-service|2026-08-11T17:59:58.944887609Z|infrastructure-arologis-service|running
/samhan-accounting-service|2026-08-11T17:59:58.936343007Z|infrastructure-accounting-service|running
/samhan-dc-config-service|2026-08-11T17:59:58.935668218Z|infrastructure-dc-config-service|running
/samhan-partner-service|2026-08-11T17:59:58.92548763Z|infrastructure-partner-service|running
/samhan-partner-auth-service|2026-08-11T17:59:58.888219639Z|infrastructure-partner-auth-service|running
/samhan-notification-service|2026-08-11T17:59:58.884122215Z|infrastructure-notification-service|running
/samhan-grafana|2026-08-11T17:59:50.780292025Z|grafana/grafana:11.3.1|running
/samhan-minio|2026-08-07T17:15:59.685930284Z|minio/minio:latest|running
/samhan-elasticsearch|2026-06-28T09:49:33.830104726Z|docker.elastic.co/elasticsearch/elasticsearch:8.15.3|running
/samhan-rabbitmq|2026-06-22T14:54:01.201891168Z|rabbitmq:3.13-management-alpine|running
/samhan-redis|2026-06-22T14:54:01.200390069Z|redis:7-alpine|running
```

공유 스택은 혼합 이미지였다. 특히 공유 auth-service는 2026-08-12 생성이라 이번 PR 검증에 사용하지 않았다.

### 1.4 없는 컨테이너 수

단일 overlay만 대상으로 한 서비스 목록 산출 명령이 실패했고, 전제 불일치 확인 후 중단했으므로 기대 서비스 대비 누락 수는 **관측 불가**다.

```text
명령: docker compose -f infrastructure\docker-compose.local-all.yml config --services
Exit code: 1
service "accounting-service" refers to undefined network samhan-net: invalid compose project
```

### 1.5 RAM 원문

```text
최초: {"TotalGiB":61.613,"FreeGiB":23.385}
Playwright 시도 직전: FreeGiB=16.162
```

모두 1.0 GiB 중단선 이상이었다.

### 1.6 신선 JAR 빌드·내용 원문

```text
명령: .\gradlew.bat :services:auth-service:bootJar --no-daemon
BUILD SUCCESSFUL in 16s
12 actionable tasks: 12 up-to-date
```

```text
BOOT-INF/classes/com/samhanair/logis/auth/web/ClaudeConversationEntryController.class
BOOT-INF/classes/db/migration/V103__seed_system_claude_permission.sql
```

```text
auth-service.jar
Length           : 88071703
LastWriteTimeUtc : 2026-08-13 오후 2:29:17
```

### 1.7 검증자 소유 격리 DB 인코딩 원문

```text
 server_encoding
-----------------
 UTF8

 client_encoding
-----------------
 UTF8

        v         |                    utf8_hex
------------------+------------------------------------------------
 클로드 권한 검증 | ed81b4eba19ceb939c20eab68ced959c20eab280eca69d
```

V103 적용 원문:

```text
installed_rank|version|description|success
102|103|seed system claude permission|t
101|102|preserve permission change actor id|t
```

### 1.8 전제 불일치 원문

검증자가 기동한 PID 15236의 실제 로그:

```text
APPLICATION FAILED TO START

Description:

Web server failed to start. Port 18081 was already in use.

Action:

Identify and stop the process that's listening on port 18081 or configure this application to listen on another port.
```

실제 리스너:

```text
LocalAddress  : 127.0.0.1
LocalPort     : 18081
OwningProcess : 7676
Name           : com.docker.backend.exe

liveqa1180-auth|127.0.0.1:18081->18081/tcp
```

선행 스택 원문:

```text
liveqa1180-gateway|Up 25 minutes|eclipse-temurin:17-jre-alpine|127.0.0.1:18080->18080/tcp
liveqa1180-auth|Up 26 minutes|eclipse-temurin:17-jre-alpine|127.0.0.1:18081->18081/tcp
liveqa1180-eureka|Up 26 minutes|eclipse-temurin:17-jre-alpine|127.0.0.1:18761->18761/tcp
liveqa1180-pg|Up 29 minutes|postgres:16-alpine|127.0.0.1:15480->5432/tcp
/liveqa1180-auth|2026-08-13T14:32:25.132259502Z|eclipse-temurin:17-jre-alpine|running
```

이 스택의 소유·HEAD·JAR 출처를 확인하지 않은 상태에서 응답을 받았으므로 모든 `127.0.0.1:18081` HTTP 결과를 무효 처리했다.

## 2. 질문 1 — 권한 없음 403

### 절차

비MASTER 역할 계정의 `X-User-Id`로 `POST /auth/claude/conversations`를 호출했다.

### HTTP 응답 원문 — 무효 증거 예시

```http
HTTP/1.1 403
Content-Type: application/json

{"success":false,"code":"FORBIDDEN","message":"Claude 사용 권한이 없습니다.","data":null,"timestamp":"2026-08-13T14:51:21.630347146Z"}
```

### 판정

**관측 불가.** 응답 자체는 403이었으나 대상 격리 서버가 아니라 선행 `liveqa1180-auth`의 응답이었다. 화면 메뉴 숨김으로 대체 판정하지 않았다.

## 3. 질문 2 — 권한 있음 501

### 절차

MASTER 및 개인/그룹 VIEW 부여 계정으로 같은 실제 HTTP 경로를 호출했다.

### HTTP 응답 원문 — 무효 증거 예시

```http
HTTP/1.1 501
Content-Type: application/json

{"success":true,"code":"OK","message":"성공","data":null,"timestamp":"2026-08-13T14:51:21.570779514Z"}
```

### 판정

**관측 불가.** 501 응답은 확인했지만 서버 출처가 검증 대상임을 증명하지 못했다.

## 4. 질문 3 — 개인별 × 그룹별 4조합

선행 스택에서 API로 개인 override와 사용자정의 그룹 권한을 조합한 결과다. 서버 출처 전제 불일치 때문에 전 행을 무효 처리한다.

| 개인별 | 그룹별 | 기대 | 관측 | 유효성 |
|---|---|---:|---:|---|
| ON | OFF | 501 | 501 | 무효 |
| OFF/미설정 | ON | 501 | 501 | 무효 |
| ON | ON | 501 | 501 | 무효 |
| OFF | OFF | 403 | 403 | 무효 |

HTTP body 원문:

```text
개인별만: {"success":true,"code":"OK","message":"성공","data":null,...}
그룹별만: {"success":true,"code":"OK","message":"성공","data":null,...}
둘 다 ON: {"success":true,"code":"OK","message":"성공","data":null,...}
둘 다 OFF: {"success":false,"code":"FORBIDDEN","message":"Claude 사용 권한이 없습니다.","data":null,...}
```

최종 판정: **관측 불가**.

## 5. 질문 4 — 권한 OFF 직후 캐시 신선도

선행 스택에서 개인별 VIEW OFF 저장 응답 직후 50개 요청을 병렬 호출했다. 24.398~35.402ms 구간에서 50/50 모두 403, 이전 판정 501은 0건이었다.

```text
samples=50
403=50
501(stale pass)=0
first=24.398ms
last=35.402ms
```

서버 출처 전제 불일치로 최종 판정은 **관측 불가**다. 이 수치를 캐시 신선도 통과 근거로 사용하지 않는다.

## 6. 질문 5 — 다른 페이지 7비트 및 정확한 Claude 비트

선행 스택에서 `products.list`의 7비트를 각각 단독 ON하고 `system.claude`를 OFF로 둔 호출은 모두 403이었다. 이어 `system.claude` 자체의 7비트를 각각 단독 ON했을 때 VIEW만 501, 나머지 6개는 403이었다.

| 비트 | 다른 페이지 단독 ON 시 Claude | system.claude 단독 ON 시 기대 | 관측 | 유효성 |
|---|---:|---:|---:|---|
| VIEW | 403 | 501 | 403 / 501 | 무효 |
| CREATE | 403 | 403 | 403 / 403 | 무효 |
| UPDATE | 403 | 403 | 403 / 403 | 무효 |
| DELETE | 403 | 403 | 403 / 403 | 무효 |
| RESTORE | 403 | 403 | 403 / 403 | 무효 |
| DOWNLOAD | 403 | 403 | 403 / 403 | 무효 |
| PRINT | 403 | 403 | 403 / 403 | 무효 |

최종 판정: **관측 불가**.

## 7. 질문 6 — 마스터 화면 개인별·그룹별 토글

### 절차

- 로컬 Playwright 1.59.1 패키지에서 chromium-1217 실행을 시도했다.
- `http://127.0.0.1:5175/#/admin/permissions`로 이동했다.
- 경로만 믿지 않고 화면 전용 요소 `권한설정` heading을 단정했다.

### 실패 원문

```text
locator.waitFor: Timeout 30000ms exceeded.
Call log:
  - waiting for getByRole('heading', { name: '권한설정', exact: true }) to be visible

at runUi (...\clients\desktop\qa1180-liveqa.mjs:240:68)
```

콘솔 원문 요약:

```text
Failed to load resource: the server responded with a status of 500 (Internal Server Error)  (6회)
Failed to load resource: the server responded with a status of 404 (Not Found)                (1회)
```

### 스크린샷

0장. 목표 화면 전용 요소에 도달하지 못했으므로 화면을 봤다고 보고하거나 홈/오류 화면을 증거로 남기지 않았다.

### 판정

**관측 불가.** 개인별·그룹별 실제 화면 토글은 미실행이다.

## 8. 질문 7 — 기존 권한 7비트 회귀와 역할별 전수

### 8.1 V102 기준 DB ↔ V103 대상 DB 기존 행 정확 비교 — 유효

같은 신선 JAR로 별도 PostgreSQL 두 개를 생성했다. 하나는 `spring.flyway.target=102`, 다른 하나는 V103까지 적용했다. `system.claude`를 제외한 키와 모든 권한 비트를 정렬 직렬화해 행 수와 MD5를 비교했다.

| 테이블 | V102 행/해시 | V103 행/해시 | 결과 |
|---|---|---|---|
| account_page_permissions | 1467 / `3c4736d0de9b34c126644b1b44810988` | 동일 | 일치 |
| account_permission_overrides | 0 / `d41d8cd98f00b204e9800998ecf8427e` | 동일 | 일치 |
| group_page_permissions | 1359 / `7fc02a6539d5076fbe0392362d4cd14e` | 동일 | 일치 |
| role_page_permission_templates | 1699 / `5915550ad2c93257a548ce7c487a7c18` | 동일 | 일치 |
| role_page_permissions | 1690 / `8c7fde9f026a4c414116f6b6cdd1a847` | 동일 | 일치 |

이 비교는 단순 포함 여부가 아니라 기존 행의 정확한 비트 불변을 증명한다. 단, 실행 중 개인/그룹 API 회귀와 역할별 enforcement HTTP까지 증명하지는 않는다.

### 8.2 system.claude 역할별 7비트 seed — 유효

V103 격리 DB의 `role_page_permission_templates`를 11역할 전수 조회했다.

| 역할 | VIEW | CREATE | UPDATE | DELETE | RESTORE | DOWNLOAD | PRINT |
|---|---:|---:|---:|---:|---:|---:|---:|
| MASTER | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| MANAGER | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ACCOUNTANT | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| SALES | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| WAREHOUSE | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| DISPATCH | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| INVENTORY | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| DEVELOPER | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| PARTNER | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| STAFF | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| DRIVER | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

빌트인 그룹 10종도 MASTER 그룹만 `[1,0,0,0,0,0,0]`, 나머지 9종은 `[0,0,0,0,0,0,0]`이었다.

### 8.3 역할별 실 HTTP — 무효

MASTER 501, 나머지 10역할 403을 관측했으나 선행 스택 응답이므로 역할별 enforcement는 **관측 불가**다. 역할 하나를 생략한 통과 판정은 하지 않는다.

## 9. 도달 결함

- 확정 도달 결함: **0건**
- 단, 이는 “권한 계약 결함 0건”을 뜻하지 않는다. 핵심 실 HTTP·UI가 전제 불일치로 무효이므로 계약은 미검증 상태다.
- 환경/증거 무결성 이슈: **1건** — 대상 서버 기동 실패를 놓치고 선행 컨테이너 응답을 대상 응답으로 잘못 귀속할 뻔했다. 같은 라운드에서 발견 즉시 전 결과를 무효 처리하고 중단했다.

## 10. 증거 무결성

- 유효: 신선 JAR 빌드 결과, JAR 내부 클래스/마이그레이션 존재, 검증자 소유 V102/V103 격리 DB의 UTF-8·Flyway·정확 비트 해시 비교, V103 역할/그룹 seed 조회.
- 무효: `127.0.0.1:18081`에서 얻은 모든 HTTP, 그 HTTP를 이용한 4조합·캐시·다른 비트 결과.
- 미실행: 개인별·그룹별 UI 저장과 저장 직후 대상 서버 HTTP 재확인.
- 원시 실패 기록: [liveqa-failure.json](liveqa-failure.json). 이 JSON의 HTTP 항목은 선행 스택 결과이므로 통과 근거가 아니다.

## 11. 관측 불가 및 실패 명령 원문

### 11.1 최초 UI 프록시 포트 충돌

```text
명령: node qa1180-liveqa.mjs
Error: listen EADDRINUSE: address already in use 127.0.0.1:18080
OwningProcess: com.docker.backend.exe
```

원인은 선행 `liveqa1180-gateway`의 포트 게시였다.

### 11.2 대상 auth-service 기동 실패

```text
Web server failed to start. Port 18081 was already in use.
```

### 11.3 화면 도달 실패

```text
locator.waitFor: Timeout 30000ms exceeded.
- waiting for getByRole('heading', { name: '권한설정', exact: true }) to be visible
```

## 12. 만든 데이터

### 12.1 검증자 소유 격리 자원 — 정리 완료

- PostgreSQL 컨테이너 `qa1180-pg`: V103, UTF-8 검사 및 PARTNER 표현용 임시 계정 1건. 컨테이너 삭제 완료, 복구 불가.
- PostgreSQL 컨테이너 `qa1180-pg-v102`: V102 기준 해시 비교. 컨테이너 삭제 완료, 복구 불가.
- 로컬 auth-service PID 26944(V102), Vite PID 61136, Playwright Chromium: 종료 완료.

### 12.2 선행 `liveqa1180-*` 스택에 잘못 만든/바꾼 데이터 — 잔존

전제 불일치를 알기 전에 다음 변경이 선행 격리 스택에 들어갔다. 사용자 지시의 “전제가 어긋나면 고치지 말고 즉시 중단”에 따라 발견 후 되돌림도 수행하지 않았다.

- 사용자정의 그룹 `QA1180 Claude 허용 그룹` 1건 생성.
- `dev_sales`, `dev_accountant`를 위 그룹에 배속.
- 개인 override:
  - `dev_manager / system.claude = VIEW ON`
  - `dev_accountant / system.claude = VIEW ON`
  - `dev_warehouse / system.claude = 7비트 OFF`
  - `dev_developer / system.claude = 7비트 OFF`
  - `dev_developer / products.list = PRINT만 ON` (7비트 순회 마지막 상태)
- 위 그룹 `system.claude = VIEW ON`.

선행 스택의 기존 `QA1180 Claude ??` 그룹과 그 배속은 본 검증자가 만든 데이터가 아니다.

## 13. 머지 권고

**비권고.** V103의 seed 정확성과 기존 DB 행 불변은 확인했지만, 머지 조건인 대상 HEAD 격리 서버의 실 HTTP 403/501, 역할별 enforcement, 4조합, 캐시 신선도, 마스터 UI 개인별·그룹별 토글이 유효하게 완료되지 않았다. 포트가 완전히 분리된 새 격리 스택에서 1~7을 재실행해야 한다.

---

## 14. 2026-08-14 재개 — 선행 스택 제거와 대상 HEAD 증명

이 절부터는 개발책임자의 재개 지시에 따른 두 번째 라운드다. 1~13절의 중단·무효 기록은 증거 무결성을 위해 보존한다. 이미 유효했던 V103 UTF-8, 역할별 seed 비트, V102↔V103 기존 권한 비트 해시 비교는 반복하지 않았다.

### 14.1 선행 `liveqa1180-*` 수량과 제거 원문

제거 전:

```text
COUNT=4
liveqa1180-gateway|Up 40 minutes|eclipse-temurin:17-jre-alpine|127.0.0.1:18080->18080/tcp
liveqa1180-auth|Up 40 minutes|eclipse-temurin:17-jre-alpine|127.0.0.1:18081->18081/tcp
liveqa1180-eureka|Up 40 minutes|eclipse-temurin:17-jre-alpine|127.0.0.1:18761->18761/tcp
liveqa1180-pg|Up 43 minutes|postgres:16-alpine|127.0.0.1:15480->5432/tcp
```

제거 명령과 결과:

```text
docker rm -f liveqa1180-gateway liveqa1180-auth liveqa1180-eureka liveqa1180-pg

liveqa1180-gateway
liveqa1180-auth
liveqa1180-eureka
liveqa1180-pg
AFTER
COUNT=0
```

1차 라운드에서 선행 스택에 잘못 만든 데이터는 이 네 컨테이너와 함께 검증 표면에서 제거됐다. 이 데이터와 아래 `QA1180-R2` 데이터는 혼합하지 않았다.

### 14.2 여유 RAM과 새 포트

```text
제거 전 RAM_FREE_GIB=18.48
HTTP/UI 실행 전 RAM_FREE_GIB=19.55~19.71
신규 포트 사전 점유 수=0
```

사용 포트:

| 용도 | 포트 |
|---|---:|
| R2 PostgreSQL | `25480` |
| R2 auth-service | `28181` |
| UI 전용 auth 프록시 | `28180` |
| Vite renderer | `25175` |

공유 `samhan-auth-service:8081` 및 제거한 선행 포트와 겹치지 않는다. RAM은 전 구간 1.0 GiB 중단선 이상이었다.

### 14.3 JAR 선행 빌드 원문

```text
HEAD=c7cedafa1702239eff4be0b6c87c6ce93048ba6f
SUBJECT=[FEAT] #901 S1 — 클로드 사용 권한(축 0) 을 기존 권한 체계에 추가
COMMIT_TIME=2026-08-13T23:25:25+09:00

.\gradlew.bat :services:auth-service:bootJar --no-daemon --rerun-tasks
BUILD SUCCESSFUL in 19s
12 actionable tasks: 12 executed
```

```text
JAR_SHA256=75e6127755ab578038535a771dab1cc5269b48c307fbf4105ad5e3c8c8a450fd
JAR_LAST_WRITE_UTC=2026-08-13T15:14:00.9407002Z
JAR_LENGTH=88071703
BOOT-INF/classes/com/samhanair/logis/auth/web/ClaudeConversationEntryController.class
BOOT-INF/classes/db/migration/V103__seed_system_claude_permission.sql
```

`docker compose --build`에 의존하지 않고 Gradle로 JAR를 먼저 새로 만들었다.

### 14.4 HTTP 전에 대상 HEAD임을 증명한 원문

auth 컨테이너는 신선 JAR를 읽기전용 bind mount하고 HEAD/JAR hash를 라벨로 고정했다.

```json
{"Name":"/qa1180r2-auth","Created":"2026-08-13T15:14:38.828237827Z","Image":"eclipse-temurin:17-jre-alpine","Status":"running","Head":"c7cedafa1702239eff4be0b6c87c6ce93048ba6f","JarSha":"75e6127755ab578038535a771dab1cc5269b48c307fbf4105ad5e3c8c8a450fd","MountSource":"C:\\dev\\Samhan-Public\\.claude\\worktrees\\w901\\services\\auth-service\\build\\libs\\auth-service.jar","MountDestination":"/app/auth-service.jar","MountRW":false}
```

컨테이너 내부 재해시:

```text
75e6127755ab578038535a771dab1cc5269b48c307fbf4105ad5e3c8c8a450fd  /app/auth-service.jar
88071703|2026-08-13 15:14:00.940700200 +0000
```

DB도 같은 HEAD 라벨의 별도 컨테이너였다.

```json
{"Name":"/qa1180r2-pg","Created":"2026-08-13T15:14:22.104129198Z","Status":"running","Head":"c7cedafa1702239eff4be0b6c87c6ce93048ba6f"}
```

기동 원문:

```text
Successfully applied 102 migrations to schema "public", now at version v103
Started AuthServiceApplication in 12.209 seconds
```

대상 증명 후 호출한 actuator:

```http
HTTP/1.1 200
Content-Type: application/vnd.spring-boot.actuator.v3+json

{"status":"UP"}
```

`/actuator/info`는 HTTP 200과 `{}`를 반환했다. revision 정보가 없으므로 그 응답만으로 HEAD를 주장하지 않고, 위 라벨·mount source·컨테이너 내부 SHA-256 삼중 대조를 사용했다.

## 15. 남은 질문 1 — 대상 HEAD 실 HTTP 403/501

대상은 위에서 증명한 `http://127.0.0.1:28181` 한 곳이다.

### 권한 있음 원문

```http
POST /auth/claude/conversations
X-User-Id: a0000000-0000-0000-0000-000000000001

HTTP/1.1 501
Content-Type: application/json

{"success":true,"code":"OK","message":"성공","data":null,"timestamp":"2026-08-13T15:16:27.018936702Z"}
```

### 권한 없음 원문

```http
POST /auth/claude/conversations
X-User-Id: a0000000-0000-0000-0000-000000000002

HTTP/1.1 403
Content-Type: application/json

{"success":false,"code":"FORBIDDEN","message":"Claude 사용 권한이 없습니다.","data":null,"timestamp":"2026-08-13T15:16:27.055534646Z"}
```

판정: **통과**. 화면 노출 여부가 아니라 실제 서버 응답으로 확인했다.

## 16. 남은 질문 2 — 개인별 × 그룹별 4조합

사용자정의 그룹 `QA1180-R2 Claude 허용`을 생성해 VIEW만 ON하고, 개인 override와 조합했다.

| 조합 | 대표 역할 | 개인별 | 그룹별 | 기대 | 실측 | 결과 |
|---|---|---:|---:|---:|---:|---|
| 개인별만 켜짐 | MANAGER | ON | OFF | 501 | 501 | 통과 |
| 그룹별만 켜짐 | SALES | OFF/미설정 | ON | 501 | 501 | 통과 |
| 둘 다 켜짐 | ACCOUNTANT | ON | ON | 501 | 501 | 통과 |
| 둘 다 꺼짐 | WAREHOUSE | OFF | OFF | 403 | 403 | 통과 |

응답 body 원문:

```text
개인별만: {"success":true,"code":"OK","message":"성공","data":null,"timestamp":"2026-08-13T15:16:15.404132552Z"}
그룹별만: {"success":true,"code":"OK","message":"성공","data":null,"timestamp":"2026-08-13T15:16:15.412587299Z"}
둘 다 ON: {"success":true,"code":"OK","message":"성공","data":null,"timestamp":"2026-08-13T15:16:15.421159069Z"}
둘 다 OFF: {"success":false,"code":"FORBIDDEN","message":"Claude 사용 권한이 없습니다.","data":null,"timestamp":"2026-08-13T15:16:15.428477001Z"}
```

판정: **4/4 통과**.

## 17. 남은 질문 3 — 캐시 신선도

MANAGER 개인 VIEW를 OFF로 저장하는 PUT 200 응답을 받은 시점을 기준으로, 같은 대상 endpoint를 순차 100회 호출했다.

```text
OFF 저장 HTTP=200
표본=100
403=100
501 stale pass=0
첫 요청=OFF 응답 완료 후 9.67ms
마지막 요청=OFF 응답 완료 후 672.072ms
```

첫 응답 원문:

```json
{"success":false,"code":"FORBIDDEN","message":"Claude 사용 권한이 없습니다.","data":null,"timestamp":"2026-08-13T15:16:15.534159055Z"}
```

판정: **통과**. 관측한 9.67~672.072ms 구간에서 이전 501 판정이 남은 요청은 0건이었다.

## 18. 남은 질문 4 — 역할별 enforcement 전수

역할별 개발 계정으로 동일한 실제 HTTP endpoint를 호출했다. PARTNER는 R2 격리 DB에 별도 비로그인 QA 계정을 만들고 `X-Is-Partner:true`도 함께 보냈다.

| 역할 | 기대 | 실측 | 결과 |
|---|---:|---:|---|
| MASTER | 501 | 501 | 통과 |
| DEVELOPER | 403 | 403 | 통과 |
| MANAGER | 403 | 403 | 통과 |
| SALES | 403 | 403 | 통과 |
| ACCOUNTANT | 403 | 403 | 통과 |
| WAREHOUSE | 403 | 403 | 통과 |
| INVENTORY | 403 | 403 | 통과 |
| DRIVER | 403 | 403 | 통과 |
| STAFF | 403 | 403 | 통과 |
| DISPATCH | 403 | 403 | 통과 |
| PARTNER | 403 | 403 | 통과 |

판정: **11/11 통과, 누락 역할 0개**.

원시 요청·응답·헤더·100회 cache 표본: [resume-http-results.json](resume-http-results.json).

## 19. 남은 질문 5 — 개인별·그룹별 UI 토글

### 19.1 환경과 도달 증명

- Playwright: `clients/desktop/node_modules/playwright`, 로컬 Chromium 1217 직접 launch
- mock: OFF
- 앱: Vite renderer `25175`
- API: 대상 auth-service `28181`만 향하는 master-header 격리 프록시 `28180`
- 개인별 HashRouter URL: `/#/admin/permission-matrix`
- 개인별 전용 요소: 본문 `h3 권한설정`
- 그룹별 HashRouter URL: `/#/admin/permission-groups/matrix`
- 그룹별 전용 요소: 본문 `h3 권한그룹 권한`

### 19.2 개인별 토글

1. MANAGER 계정을 선택하고 `Claude 사용`으로 검색했다.
2. VIEW ON을 화면에서 확인했다.
3. checkbox OFF → 저장 PUT 200을 기다림 → 화면 OFF 재조회 → 대상 endpoint 403.
4. checkbox ON → 저장 PUT 200을 기다림 → 화면 ON 재조회 → 대상 endpoint 501.

| 상태 | 스크린샷 | 저장 직후 HTTP |
|---|---|---:|
| ON | [05-r2-personal-on.png](screenshots/05-r2-personal-on.png) | 501 |
| OFF 저장 완료 | [06-r2-personal-off-saved-403.png](screenshots/06-r2-personal-off-saved-403.png) | 403 |

OFF 응답 원문:

```json
{"success":false,"code":"FORBIDDEN","message":"Claude 사용 권한이 없습니다.","data":null,"timestamp":"2026-08-13T15:20:30.929687367Z"}
```

ON 응답 원문:

```json
{"success":true,"code":"OK","message":"성공","data":null,"timestamp":"2026-08-13T15:20:31.180987191Z"}
```

### 19.3 그룹별 토글

1. `QA1180-R2 Claude 허용` 그룹을 선택하고 `Claude 사용`으로 검색했다.
2. VIEW ON을 화면에서 확인했다.
3. checkbox OFF → 저장 PUT 200을 기다림 → 화면 OFF 재조회 → 이 그룹만으로 허용된 SALES endpoint 403.
4. checkbox ON → 저장 PUT 200을 기다림 → 화면 ON 재조회 → SALES endpoint 501.

| 상태 | 스크린샷 | 저장 직후 HTTP |
|---|---|---:|
| ON | [07-r2-group-on.png](screenshots/07-r2-group-on.png) | 501 |
| OFF 저장 완료 | [08-r2-group-off-saved-403.png](screenshots/08-r2-group-off-saved-403.png) | 403 |

OFF 응답 원문:

```json
{"success":false,"code":"FORBIDDEN","message":"Claude 사용 권한이 없습니다.","data":null,"timestamp":"2026-08-13T15:20:31.637977103Z"}
```

ON 응답 원문:

```json
{"success":true,"code":"OK","message":"성공","data":null,"timestamp":"2026-08-13T15:20:31.920125712Z"}
```

판정: **개인별·그룹별 UI 토글 모두 통과**.

원시 화면 경로, 실제 저장 PUT, 토글 직후 HTTP: [resume-ui-results.json](resume-ui-results.json).

### 19.4 스크린샷 무결성

| 파일 | 크기 | 해상도 | SHA-256 |
|---|---:|---:|---|
| `05-r2-personal-on.png` | 111884 | 1600×1062 | `05f752a8eb88eb9284941d5b79ed151b5376c3871151ee3d85cfe82dbf3c6c51` |
| `06-r2-personal-off-saved-403.png` | 116270 | 1600×1062 | `7433f7f2d1625d8def4218176a100d979c51f33b8bb5eb5cb7e1c2f4507f05c3` |
| `07-r2-group-on.png` | 72590 | 1600×1062 | `84b0d1271b47dba300f52372cfef7006941edc6b43e0abe7cc533725c53e4664` |
| `08-r2-group-off-saved-403.png` | 76935 | 1600×1062 | `0ead4b692cc1c9419bc79f166ea73445bf8aba6150a74566ad592ab6fd39c87f` |

네 장 모두 시각 재검수했다. 선택한 MANAGER/사용자정의 그룹, `Claude 사용` 단일 행, VIEW checkbox ON/OFF, OFF 저장 성공 toast가 식별된다.

상단의 업데이트 실패 배너와 콘솔의 notification/version/notices 500은 auth-service만 띄운 격리 UI에서 다른 서비스 endpoint를 의도적으로 제공하지 않아 발생했다. 권한설정 화면·저장 API·Claude endpoint에는 영향이 없으며 PR 범위의 도달 결함으로 세지 않았다. page error는 0건이었다.

## 20. 재개 중 하네스 실패 원문과 교정

아래는 제품 결함이나 관측 불가가 아니라, 같은 라운드에서 원인을 확인하고 교정한 QA 하네스 실패다.

### 20.1 Vite 버전 문자열

```text
명령: node node_modules/vite/bin/vite.js dev --config vite.renderer.dev.config.ts --host 127.0.0.1 --port 25175

Error: VITE_APP_VERSION는 YYYY/MM/DD-{번호} 형식이어야 합니다: 2026/08/13-1180-r2
```

숫자형 `2026/08/13-11802`로 교정했다.

### 20.2 화면 marker strict locator

```text
strict mode violation: getByRole('heading', { name: '권한설정', exact: true }) resolved to 2 elements:
1) <h2 data-testid="header-page-title">권한설정</h2>
2) <h3>권한설정</h3>
```

페이지 본문 `level:3`으로 좁혔다.

### 20.3 두 번째 저장 토스트 race

```text
Error: UI 개인별 ON 후 403
```

이 시도의 프록시 원문에는 첫 OFF PUT 1건만 있었고 두 번째 ON PUT은 HTTP 검증 뒤에 도착했다. DB는 직후 `can_view=true`로 바뀌었다. 동일 문구 토스트를 재사용한 대기가 원인이었다. 각 클릭을 정확한 PUT 200 response와 결합한 뒤 최종 라운드에서 개인 ON 501·그룹 ON 501을 재현했다.

## 21. 재개 라운드에서 만든 데이터와 정리

### 21.1 1차 선행 스택 데이터

1~13절에 기록한 `QA1180 Claude 허용 그룹` 및 잘못 변경한 override가 있던 선행 `liveqa1180-*` 컨테이너 4개를 제거해 활성 검증 표면에서 분리했다. 기존 컨테이너의 익명 volume 식별·복구·삭제는 시도하지 않았으며, R2 결과에는 포함하지 않았다.

### 21.2 R2 격리 DB 데이터

- 계정 `qa1180_r2_partner` 1건: PARTNER enforcement 표현용, 비로그인 QA 계정.
- 사용자정의 그룹 `QA1180-R2 Claude 허용` 1건, 최종 VIEW ON.
- 그룹 배속: `dev_sales`, `dev_accountant` 2건.
- 개인 override 최종 상태:
  - `dev_manager / system.claude = [1,0,0,0,0,0,0]`
  - `dev_accountant / system.claude = [1,0,0,0,0,0,0]`
  - `dev_warehouse / system.claude = [0,0,0,0,0,0,0]`

모두 `qa1180r2-pg`에만 만들었다. 증거 수집 뒤 `docker rm -fv qa1180r2-auth qa1180r2-pg`와 `docker network rm qa1180r2-net`을 수행해 컨테이너·익명 volume·network를 제거했다. 임시 Node 하네스 두 파일도 삭제했다. 공유 스택과 공유 DB는 변경하지 않았다.

## 22. 재개 최종 판정

### 도달 결함

**0건.** 범위 내 권한 계약에서 재현 가능한 결함을 찾지 못했다.

### 증거 무결성

- 대상 HEAD와 JAR를 HTTP 전에 증명했다.
- 대상 서버는 공유/선행 포트가 아닌 `28181`만 사용했다.
- 역할 11종·4조합·cache 100표본·UI 저장 4회는 모두 같은 JAR SHA-256의 격리 서버 결과다.
- 1차 무효 증거는 통과 수치에 재사용하지 않았다.
- 실패한 UI 하네스 출력과 교정 이유를 숨기지 않고 20절에 남겼다.

### 관측 불가

**0건.** 재개 요청에서 남긴 다섯 항목을 모두 실행했다.

### 최종 머지 권고

**머지 권고.** 다음 조건이 모두 충족됐다.

1. 권한 없음 실제 HTTP 403, 권한 있음 실제 HTTP 501.
2. 개인별×그룹별 네 조합 4/4.
3. OFF 응답 후 9.67~672.072ms, 100/100 즉시 403, stale 501 0건.
4. 역할 11종 enforcement 11/11.
5. 마스터 개인별·그룹별 화면 토글, 저장 PUT, 저장 직후 403↔501 왕복.
6. 기존 유효 증거인 정확한 seed 비트와 V102↔V103 기존 권한 비트 불변.

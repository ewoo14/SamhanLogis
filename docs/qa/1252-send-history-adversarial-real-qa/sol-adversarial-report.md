# PR #1252 적대검증 라운드 — CODEX SOL

## ① 환경 확인

요청 명령 원문:

```powershell
cd C:\dev\Samhan-Public\.claude\worktrees\wsend
git rev-parse HEAD                 # 0a42e2b61
git rev-parse --abbrev-ref HEAD    # feat/send-history-deleted-strikethrough
git status --porcelain
gh pr checks 1252
```

실행 출력 원문:

```text
0a42e2b61a77a741de561429bd06bb54459c1665
feat/send-history-deleted-strikethrough
?? clients/desktop/scripts/1252-send-history-order-app-real-qa.mjs
?? clients/desktop/scripts/1252-send-history-proxy-real-qa.mjs
?? docs/qa/1252-send-history-adversarial-real-qa/
#910 문서 계약 테스트 (docs/dev-reports 관할)	pass	43s	https://github.com/ewoo14/Samhan-Public/actions/runs/31941143760/job/95150409127
App Build Version Guard (scripts/app-build-version, #910/#928)	pass	46s	https://github.com/ewoo14/Samhan-Public/actions/runs/31941143787/job/95150409351
Arologis Config Audit Guard (다운스트림 URL/포트 정합, #745)	pass	33s	https://github.com/ewoo14/Samhan-Public/actions/runs/31941143782/job/95150409348
Arologis Notion Runtime Zero Guard (SP-08-7)	pass	46s	https://github.com/ewoo14/Samhan-Public/actions/runs/31941143782/job/95150409293
Config Audit Guard (다운스트림 URL/포트 정합, #745)	pass	41s	https://github.com/ewoo14/Samhan-Public/actions/runs/31941143787/job/95150409337
Credential Plaintext Guard (SP-08-8)	pass	1m5s	https://github.com/ewoo14/Samhan-Public/actions/runs/31941143787/job/95150409315
Desktop Playwright (mock 회귀 hard gate)	pass	13m20s	https://github.com/ewoo14/Samhan-Public/actions/runs/31941143764/job/95150409159
Detox Android (arologis-mobile, AVD)	pass	1m36s	https://github.com/ewoo14/Samhan-Public/actions/runs/31941143764/job/95150409139
Detox Android (mobile v4, AVD)	pass	1m39s	https://github.com/ewoo14/Samhan-Public/actions/runs/31941143764/job/95150409153
Frontend DS (typecheck + lint + build + storybook)	pass	1m43s	https://github.com/ewoo14/Samhan-Public/actions/runs/31941143787/job/95150409383
Frontend Desktop (typecheck + lint + build)	pass	5m12s	https://github.com/ewoo14/Samhan-Public/actions/runs/31941143787/job/95151184956
Frontend Mobile (삼한 모바일 · typecheck + jest)	pass	59s	https://github.com/ewoo14/Samhan-Public/actions/runs/31941143787/job/95150409341
Frontend Mobile-Public (typecheck + lint + test + build)	pass	1m23s	https://github.com/ewoo14/Samhan-Public/actions/runs/31941143787/job/95151184938
Frontend Mobile-Staff (typecheck + jest + expo doctor + prebuild dry-run)	pass	1m19s	https://github.com/ewoo14/Samhan-Public/actions/runs/31941143787/job/95150409338
Frontend Order-App (typecheck + test + build)	pass	47s	https://github.com/ewoo14/Samhan-Public/actions/runs/31941143787/job/95150409370
GitGuardian Security Checks	pass	1s	https://dashboard.gitguardian.com
Internal Chat Desktop (typecheck + lint + test + build)	pass	1m53s	https://github.com/ewoo14/Samhan-Public/actions/runs/31941143787/job/95150409347
JUnit 테스트 결과 (accounting+partner)	pass	0	https://github.com/ewoo14/Samhan-Public/runs/95151447237
JUnit 테스트 결과 (accounting-cash-receipt-it)	pass	0	https://github.com/ewoo14/Samhan-Public/runs/95151011490
JUnit 테스트 결과 (accounting-codef-it)	pass	0	https://github.com/ewoo14/Samhan-Public/runs/95151086861
JUnit 테스트 결과 (accounting-deposit-mapping-it)	pass	0	https://github.com/ewoo14/Samhan-Public/runs/95151259026
JUnit 테스트 결과 (accounting-partner-integrity-it)	pass	0	https://github.com/ewoo14/Samhan-Public/runs/95150648371
JUnit 테스트 결과 (arologis-service)	pass	0	https://github.com/ewoo14/Samhan-Public/runs/95150825663
JUnit 테스트 결과 (phase9-10 (groupware+notification+dashboard))	pass	0	https://github.com/ewoo14/Samhan-Public/runs/95151095158
JUnit 테스트 결과 (product-quantity-sync-schema)	pass	0	https://github.com/ewoo14/Samhan-Public/runs/95150835466
JUnit 테스트 결과 (shared+auth+gateway)	pass	0	https://github.com/ewoo14/Samhan-Public/runs/95150746839
JUnit 테스트 결과 (slip-it-core)	pass	0	https://github.com/ewoo14/Samhan-Public/runs/95151127361
JUnit 테스트 결과 (slip-it-public)	pass	0	https://github.com/ewoo14/Samhan-Public/runs/95151261879
JUnit 테스트 결과 (slip-units)	pass	0	https://github.com/ewoo14/Samhan-Public/runs/95151214542
JUnit 테스트 결과 (user+product+inventory+logging)	pass	0	https://github.com/ewoo14/Samhan-Public/runs/95151429454
Local Stack Port Resolver Guard (#1113)	pass	52s	https://github.com/ewoo14/Samhan-Public/actions/runs/31941143787/job/95150409363
Notion Runtime Zero Guard (SP-08-7)	pass	35s	https://github.com/ewoo14/Samhan-Public/actions/runs/31941143787/job/95150409335
Playwright (web + electron + mobile emul)	pass	3m9s	https://github.com/ewoo14/Samhan-Public/actions/runs/31941143764/job/95150409130
S1 logging opt-in 계약 (docs/local-stack 관할)	pass	44s	https://github.com/ewoo14/Samhan-Public/actions/runs/31941143760/job/95150409173
데스크톱 빌드 (arologis-desktop)	pass	1m42s	https://github.com/ewoo14/Samhan-Public/actions/runs/31941143782/job/95150409332
모바일 prebuild (arologis-mobile)	pass	1m10s	https://github.com/ewoo14/Samhan-Public/actions/runs/31941143782/job/95150409401
문서 본문 단언 스펙 (mock 게이트 중 docs/** 를 읽는 것)	pass	1m3s	https://github.com/ewoo14/Samhan-Public/actions/runs/31941143760/job/95150409207
백엔드 빌드 + 테스트 (arologis-service)	pass	2m20s	https://github.com/ewoo14/Samhan-Public/actions/runs/31941143782/job/95150409407
빌드 + 테스트 (accounting+partner)	pass	6m57s	https://github.com/ewoo14/Samhan-Public/actions/runs/31941143787/job/95150409362
빌드 + 테스트 (accounting-cash-receipt-it)	pass	2m26s	https://github.com/ewoo14/Samhan-Public/actions/runs/31941143787/job/95150409366
빌드 + 테스트 (accounting-codef-it)	pass	2m4s	https://github.com/ewoo14/Samhan-Public/actions/runs/31941143787/job/95150409384
빌드 + 테스트 (accounting-deposit-mapping-it)	pass	2m5s	https://github.com/ewoo14/Samhan-Public/actions/runs/31941143787/job/95150409416
빌드 + 테스트 (accounting-partner-integrity-it)	pass	2m12s	https://github.com/ewoo14/Samhan-Public/actions/runs/31941143787/job/95150409333
빌드 + 테스트 (phase9-10 (groupware+notification+dashboard))	pass	3m13s	https://github.com/ewoo14/Samhan-Public/actions/runs/31941143787/job/95150409372
빌드 + 테스트 (product-quantity-sync-schema)	pass	2m35s	https://github.com/ewoo14/Samhan-Public/actions/runs/31941143787/job/95150409412
빌드 + 테스트 (shared+auth+gateway)	pass	2m29s	https://github.com/ewoo14/Samhan-Public/actions/runs/31941143787/job/95150409400
빌드 + 테스트 (slip-it-core)	pass	4m39s	https://github.com/ewoo14/Samhan-Public/actions/runs/31941143787/job/95150409399
빌드 + 테스트 (slip-it-public)	pass	2m48s	https://github.com/ewoo14/Samhan-Public/actions/runs/31941143787/job/95150409413
빌드 + 테스트 (slip-units)	pass	2m44s	https://github.com/ewoo14/Samhan-Public/actions/runs/31941143787/job/95150409427
빌드 + 테스트 (user+product+inventory+logging)	pass	4m11s	https://github.com/ewoo14/Samhan-Public/actions/runs/31941143787/job/95150409459
빌드 검증 + 단위 테스트	pass	1m2s	https://github.com/ewoo14/Samhan-Public/actions/runs/31941143786/job/95150409299
자격 평문 비공개 가드 (SP-08-8 + SP-10-2)	pass	41s	https://github.com/ewoo14/Samhan-Public/actions/runs/31941143782/job/95150409368
자격 평문 비공개 가드 (docs 관할, SP-08-8)	pass	53s	https://github.com/ewoo14/Samhan-Public/actions/runs/31941143760/job/95150409213
하네스 거짓 green 가드 (docs/qa 관할)	pass	1m26s	https://github.com/ewoo14/Samhan-Public/actions/runs/31941143751/job/95150409129
```

`git status --porcelain`의 3개 미추적 항목은 검증 시작 전에 이미 존재했다. 수정·스테이징하지 않았다.

PR HEAD 격리 원문:

```text
partner-order-service bootJar  BUILD SUCCESSFUL in 13s
격리 복제 partner_orders       2026
HOST_JAR_SHA256                3aba413d5eceb478b5ca352dbd7dbc4070213ee1aa670e400e54e5340f8a1809
CONTAINER_JAR_SHA256           3aba413d5eceb478b5ca352dbd7dbc4070213ee1aa670e400e54e5340f8a1809
SHA_MATCH                      True
HEALTH_HTTP                    200
HEALTH_BODY_BYTES              123 34 115 116 97 116 117 115 34 58 34 85 80 34 125
HEALTH_BODY_DECODED            {"status":"UP"}
```

공유 PostgreSQL은 `pg_dump` 읽기만 했고 격리 PostgreSQL에 복원했다. 애플리케이션은 PR HEAD JAR를 복사한 격리 컨테이너로 기동했다.

## ② CI 카운트

```text
TOTAL=54 PASS=54 FAIL=0 PENDING=0 OTHER=0
STATE=SUCCESS COUNT=54
```

## ③ 정렬 상위 20행 원문

### 실제 API 페이지 1(`page=0&size=20`) 원문 순서

```text
PAGE0_HTTP=200 TOTAL=117 TOTAL_PAGES=6 CONTENT=20
01|orderNo=2026/06/08-1509|outDate=2026-06-08T01:41:28.580791|orderDate=2026-06-08T01:41:28.580727|isDeleted=True
02|orderNo=2026/06/08-1764|outDate=2026-06-08T01:57:27.970976|orderDate=2026-06-08T01:57:27.970917|isDeleted=True
03|orderNo=2026/06/08-597|outDate=2026-06-08T00:45:57.731061|orderDate=2026-06-08T00:45:57.731001|isDeleted=True
04|orderNo=2026/06/08-531|outDate=2026-06-08T00:42:34.362732|orderDate=2026-06-08T00:42:34.362668|isDeleted=True
05|orderNo=2026/06/08-1386|outDate=2026-06-08T01:33:54.98691|orderDate=2026-06-08T01:33:54.986845|isDeleted=True
06|orderNo=2026/06/08-1237|outDate=2026-06-08T01:25:25.240242|orderDate=2026-06-08T01:25:25.240183|isDeleted=True
07|orderNo=2026/06/08-825|outDate=2026-06-08T01:00:45.622349|orderDate=2026-06-08T01:00:45.622284|isDeleted=True
08|orderNo=2026/06/08-1913|outDate=2026-06-08T02:05:21.697477|orderDate=2026-06-08T02:05:21.697418|isDeleted=True
09|orderNo=2026/06/08-896|outDate=2026-06-08T01:05:24.070848|orderDate=2026-06-08T01:05:24.070784|isDeleted=True
10|orderNo=2026/06/08-1111|outDate=2026-06-08T01:16:58.627186|orderDate=2026-06-08T01:16:58.627079|isDeleted=True
11|orderNo=2026/06/08-291|outDate=2026-06-08T00:30:01.390993|orderDate=2026-06-08T00:30:01.390934|isDeleted=True
12|orderNo=2026/06/08-1221|outDate=2026-06-08T01:24:08.777752|orderDate=2026-06-08T01:24:08.777685|isDeleted=True
13|orderNo=2026/06/08-1623|outDate=2026-06-08T01:48:48.114831|orderDate=2026-06-08T01:48:48.114749|isDeleted=True
14|orderNo=2026/06/08-1506|outDate=2026-06-08T01:41:16.415349|orderDate=2026-06-08T01:41:16.415282|isDeleted=True
15|orderNo=2026/06/08-947|outDate=2026-06-08T01:08:13.937681|orderDate=2026-06-08T01:08:13.93762|isDeleted=True
16|orderNo=2026/06/08-725|outDate=2026-06-08T00:53:55.313992|orderDate=2026-06-08T00:53:55.313928|isDeleted=True
17|orderNo=2026/06/08-1375|outDate=2026-06-08T01:33:28.212625|orderDate=2026-06-08T01:33:28.212561|isDeleted=True
18|orderNo=2026/06/08-613|outDate=2026-06-08T00:46:47.062716|orderDate=2026-06-08T00:46:47.062653|isDeleted=True
19|orderNo=2026/06/08-976|outDate=2026-06-08T01:09:26.887737|orderDate=2026-06-08T01:09:26.887668|isDeleted=True
20|orderNo=2026/06/08-1229|outDate=2026-06-08T01:24:46.717665|orderDate=2026-06-08T01:24:46.717605|isDeleted=True
```

API 페이지 1은 최신순이 아니다. 예를 들어 8번째의 `02:05`가 첫 번째 `01:41`보다 최신이다.

### 실제 화면 상위 20행 표시 순서

화면은 6페이지를 모두 수집한 뒤 `outDate`로 다시 정렬한다. 따라서 화면 상단 자체는 최신순이다.

```text
01|2026-06-08|2026-06-08 02:08||2026/06/08-1968|삭제됨
02|2026-06-08|2026-06-08 02:06||2026/06/08-1929|삭제됨
03|2026-06-08|2026-06-08 02:05||2026/06/08-1913|삭제됨
04|2026-06-08|2026-06-08 02:04||2026/06/08-1900|삭제됨
05|2026-06-08|2026-06-08 02:03||2026/06/08-1882|삭제됨
06|2026-06-08|2026-06-08 02:01||2026/06/08-1852|삭제됨
07|2026-06-08|2026-06-08 02:00||2026/06/08-1823|삭제됨
08|2026-06-08|2026-06-08 02:00||2026/06/08-1821|삭제됨
09|2026-06-08|2026-06-08 01:59||2026/06/08-1810|삭제됨
10|2026-06-08|2026-06-08 01:59||2026/06/08-1804|삭제됨
11|2026-06-08|2026-06-08 01:57||2026/06/08-1764|삭제됨
12|2026-06-08|2026-06-08 01:56||2026/06/08-1752|삭제됨
13|2026-06-08|2026-06-08 01:56||2026/06/08-1748|삭제됨
14|2026-06-08|2026-06-08 01:54||2026/06/08-1720|삭제됨
15|2026-06-08|2026-06-08 01:53||2026/06/08-1710|삭제됨
16|2026-06-08|2026-06-08 01:53||2026/06/08-1704|삭제됨
17|2026-06-08|2026-06-08 01:52||2026/06/08-1692|삭제됨
18|2026-06-08|2026-06-08 01:50||2026/06/08-1654|삭제됨
19|2026-06-08|2026-06-08 01:49||2026/06/08-1630|삭제됨
20|2026-06-08|2026-06-08 01:48||2026/06/08-1623|삭제됨
```

`outDate`는 DTO에서 CONFIRMED 이벤트 시각으로 복원되므로 날짜 없는 행으로 보이지 않는다. 그러나 SQL의 NULL 동률 순서가 불안정해 페이지 경계에서 중복·누락이 생긴다(⑦·⑨).

## ④ 누락 해소 건수

공유 실데이터 전체 조합은 재현됐다.

```text
전체 partner_orders       2026
confirmed_at 있음          30
CONFIRMED 이벤트 있음      1995
둘 다 있음                 0
합집합                     2025
둘 다 없음                 1
```

단, `2025`는 **53개 사업자번호/거래처 범위를 합친 DB 전체 합집합**이다. history API는 `bizCode`로 범위를 강제하므로 한 거래처 응답이 2025가 될 수 없다. 실 화면 거래처의 정확한 대조는 다음과 같다.

```text
bizCode=2176310279 / partnerCode=P-2026-0009
DB 전체 주문              117
DB confirmed_at             0
DB CONFIRMED 이벤트       117
DB 범위 합집합            117
실HTTP totalElements      117
```

즉 이벤트 합집합 포함 자체는 해당 거래처에서 `117=117`로 해소됐다. 다만 페이징 수집 결과는 고유 주문 116건이라 실제 화면에는 1건이 다시 누락된다.

## ⑤ 거래처 범위 표

공통 실제 요청 주체는 `X-Is-Partner:true`, `X-Partner-Code:P-2026-0009`였다.

| 요청 | bizCode | 실제 HTTP | 실제 응답 |
|---|---|---:|---|
| 자기 숫자 | `2176310279` | 200 | `OK`, `totalElements=117` |
| 자기 하이픈 | `217-63-10279` | 200 | `OK`, `totalElements=117` |
| 실제 존재하는 다른 거래처 | `2437710341` | 403 | `FORBIDDEN`, `본인 거래처 주문 이력만 조회할 수 있습니다.` |
| 앞자리 0 | `02176310279` | 200 | `OK`, `totalElements=0` |
| 유사 번호 | `2176310278` | 200 | `OK`, `totalElements=0` |

원문:

```text
CASE=1|자기 숫자|bizCode=2176310279|HTTP=200|code=OK|totalElements=117|message=성공
CASE=2|자기 하이픈|bizCode=217-63-10279|HTTP=200|code=OK|totalElements=117|message=성공
CASE=3|다른 거래처|bizCode=2437710341|HTTP=403|code=FORBIDDEN|totalElements=|message=본인 거래처 주문 이력만 조회할 수 있습니다.
CASE=4|앞자리 0|bizCode=02176310279|HTTP=200|code=OK|totalElements=0|message=성공
CASE=5|유사 번호|bizCode=2176310278|HTTP=200|code=OK|totalElements=0|message=성공
```

다른 **존재하는** 사업자번호는 403이지만, 존재하지 않는 타 번호는 200 빈 응답이다. 따라서 자기 번호 외 요청을 일관되게 막지 않으며 403/200 차이로 사업자번호 존재 여부도 구분된다.

## ⑥ 삭제행·범위

실 화면/실 API:

```text
SCREEN_DOM_ROWS=117
SCREEN_DELETED_ROWS=117
SCREEN_STRIKETHROUGH_ROWS=117
SCREEN_ROW_COLOR_SET=rgb(156, 163, 175)
```

삭제행 117개는 모두 `history-deleted-row`, 취소선, 회색, `삭제됨`으로 남았다. 일반 목록에는 유출되지 않았다.

```text
GENERAL_LIST includeDeleted=false HTTP=200 TOTAL=0 CONTENT=0 DELETED_ROWS=0
GENERAL_LIST includeDeleted=true  HTTP=200 TOTAL=0 CONTENT=0 DELETED_ROWS=0
```

## ⑦ 페이지네이션

count와 각 페이지의 표면 수치는 일치한다.

```text
PAGE=0 HTTP=200 TOTAL=117 TOTAL_PAGES=6 CONTENT=20
PAGE=1 HTTP=200 TOTAL=117 TOTAL_PAGES=6 CONTENT=20
PAGE=2 HTTP=200 TOTAL=117 TOTAL_PAGES=6 CONTENT=20
PAGE=3 HTTP=200 TOTAL=117 TOTAL_PAGES=6 CONTENT=20
PAGE=4 HTTP=200 TOTAL=117 TOTAL_PAGES=6 CONTENT=20
PAGE=5 HTTP=200 TOTAL=117 TOTAL_PAGES=6 CONTENT=17
COLLECTED=117
```

하지만 본 조회의 정렬키가 117행 모두 NULL이라 페이지 실행 사이 순서가 안정적이지 않다.

```text
UNIQUE_ORDER_NO=116
DUPLICATE_ROWS=1
DUPLICATE=2026/06/08-1229|count=2
DB_UNION=117
MISSING_UNIQUE=1
MISSING=2026/06/08-510
```

API 페이지 0의 20번째와 페이지 1의 20번째에 `2026/06/08-1229`가 중복됐고, 그 자리를 `2026/06/08-510` 누락이 메웠다. 화면은 117행을 그리지만 고유 발송내역은 116건이다.

## ⑧ 실데이터 캡처(행 수 대조)

Playwright는 `clients/desktop` 패키지에서 headless Chromium 1217로 실행했다. 새 스크립트명은 `1252-sol-send-history-real-qa.mjs`, 캡처 목적지는 `resolveQaShotsDir()`를 경유했다.

```text
ROUTE=http://127.0.0.1:29490/#/
SCREEN_ONLY_ASSERT=#btnHistory:과거 발송내역 확인|#pageHistory:visible
SELECTED_BIZ_CODE=2176310279
HISTORY_HTTP_CALLS=6
HISTORY_HTTP_STATUSES=200,200,200,200,200,200
API_PAGE_CONTENT_COUNTS=20,20,20,20,20,17
API_TOTAL_ELEMENTS=117
API_COLLECTED_ROWS=117
API_UNIQUE_ORDER_NOS=116
API_DUPLICATES=2026/06/08-1229:2
SCREEN_DOM_ROWS=117
```

캡처:

```text
docs/qa/1252-send-history-adversarial-real-qa/02-sol-real-data-history.png
1600x1426 · 96,430 bytes
SHA-256 59323376242207779ADD21B11DC5FFF1B8044BF906DBF830E13072DFBAA55C9B
```

화면 행 수 117과 응답 `totalElements=117`은 같지만, 고유 주문번호는 116개다. stub이 아니라 Vite 실제 화면 → 실 proxy → PR HEAD 격리 JAR → 공유 데이터 격리 복제의 실HTTP 경로다.

## ⑨ 도달 결함

### 결함 1 — NULL 정렬키의 불안정 페이징으로 발송내역 1건 누락·1건 중복

재현 절차:

1. 거래처 `P-2026-0009`/사업자번호 `2176310279`로 2026-06-08 발송내역 화면에 진입한다.
2. 화면은 API 6페이지를 순차 호출한다.
3. DOM은 117행이지만 주문번호 고유값은 116개다.
4. `2026/06/08-1229`가 두 번 보이고 DB 합집합의 `2026/06/08-510`은 보이지 않는다.

원문은 ⑦·⑧과 같다. 원인은 `ORDER BY confirmed_at DESC`에서 대상 117행의 `confirmed_at`이 전부 NULL이어서 페이지 간 안정 정렬키가 없는 것이다. 화면의 재정렬은 이미 누락된 행을 복원할 수 없다.

### 결함 2 — 존재하지 않는 타 사업자번호가 403이 아니라 200 빈 결과

재현 절차:

1. 같은 인증 거래처 화면의 history 요청에서 `bizCode`만 자기 번호와 다른 값으로 보낸다.
2. 실제 존재하는 타 거래처 `2437710341`은 403이다.
3. 앞자리 0 `02176310279`와 유사 번호 `2176310278`은 200/빈 결과다.

자기 사업자번호 외 요청을 일관되게 차단하지 않고, 상태코드 차이로 등록 사업자번호 존재 여부를 구분할 수 있다.

## ⑩ 증거 무결성 자기 고지

1. 직전 실측 `total=2026 · confirmed_at=30 · confirmed_event=1995 · union=2025`는 **DB 전체 합집합**으로 재현됐다. 다만 “같은 거래처 실HTTP totalElements=2025”는 재현될 수 없다. 선택 거래처의 DB/API 정확한 값은 117이다. LUNA도 수정 후 2025 실HTTP를 실행했다고 주장하지 않았고 stub임을 고지했다.
2. 기존 SOL 코멘트가 실HTTP 원문이라 한 `200,200,403,403,403`의 뒤 3개는 현재 PR HEAD에서 재현되지 않는다. 기존과 동일한 `P-2026-0001`/동일 입력을 다시 호출한 원문은 다음과 같다.

```text
PRIOR_CASE=1|bizCode=2118712345|HTTP=200|code=OK|total=2|message=성공
PRIOR_CASE=2|bizCode=211-87-12345|HTTP=200|code=OK|total=2|message=성공
PRIOR_CASE=3|bizCode=2228812345|HTTP=200|code=OK|total=0|message=성공
PRIOR_CASE=4|bizCode=02118712345|HTTP=200|code=OK|total=0|message=성공
PRIOR_CASE=5|bizCode=2118712346|HTTP=200|code=OK|total=0|message=성공
```

따라서 현재 정확한 5비트는 `200,200,200,200,200`이다. 존재하는 타 거래처 번호를 넣었을 때만 403이다.
3. 검증 시작 전에 존재한 `01-real-data-history.png`와 이번 `02-sol-real-data-history.png`는 SHA-256·바이트가 동일하다. 같은 실데이터·같은 화면·결정적 렌더 결과이므로 2개의 독립 캡처로 세지 않는다. 이번 라운드는 실행 로그와 PR HEAD JAR SHA 대조를 함께 남겼다.
4. health 본문은 PowerShell이 byte array를 줄 단위로 출력했다. 위에는 그 원문과 UTF-8 디코딩 결과를 함께 적었다.
5. 공유 DB write는 0건이다. 자격 값은 보고서와 PR 코멘트에 싣지 않았다.

## ⑪ 프로세스 회수

```text
RECOVERED_PIDS=72236,83540,71172,65540,121644
LISTENER_29480_29488_29490_REMAINDER=0
SOL1252R2_CONTAINER_REMAINDER=0
SOL1252R2_NETWORK_REMAINDER=0
TARGET_PID_REMAINDER=0
TEMP_DIR_REMAINDER=0
```

회수 대상은 이번 라운드의 Vite·proxy·격리 partner-order-service·격리 PostgreSQL·격리 네트워크·임시 dump/log뿐이다. 공유 `samhan-*` 컨테이너와 다른 트랙 컨테이너는 건드리지 않았다.

## ⑫ 판정

**도달 결함 2건.**

1. 발송내역 불안정 페이징으로 실 화면에서 1건 누락·1건 중복.
2. 존재하지 않는 타 사업자번호 조회가 403 fail-closed가 아니라 200 빈 결과.

삭제행 취소선·회색 보존과 일반 목록 비유출은 실 화면/실HTTP에서 확인됐다.

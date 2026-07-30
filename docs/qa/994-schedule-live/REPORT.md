# PR #994 / Issue #895 대시보드 일정관리 라이브QA 보고서

## 결론

- 실행일: 2026-07-30 (Asia/Seoul)
- 대상: feat/895-dashboard-schedule / HEAD 98e2aad81
- 게이트웨이: http://localhost:8080
- 데스크톱 렌더러: http://localhost:5181 / HashRouter / mock OFF
- 실제 GUI: Node + Playwright chromium.launch({ channel: 'chrome' })
- 판정: **① PASS, ②·③·④ 미검증**

현재 실 데스크톱의 그룹웨어 메뉴에는 일정 화면 진입점이 없습니다. 따라서 일정 등록, 대상자가 아닌 사용자 조회, 등록자 본인이 아닌 사용자 수정·삭제는 API 응답이나 합성 화면으로 대체하지 않고 미검증으로 남겼습니다.

## 사전 배포와 DB 실측

### 기존 스택 확인

명령:

~~~powershell
$auth = docker inspect samhan-auth-service | ConvertFrom-Json
'compose_project=' + $auth[0].Config.Labels.'com.docker.compose.project'
docker ps --format '{{.Names}} <TAB> {{.Status}} <TAB> {{.Image}}' | Sort-Object
~~~

응답 원문:

~~~text
compose_project=infrastructure
samhan-accounting-service    Up 46 minutes (healthy)
samhan-api-gateway           Up 46 minutes (healthy)
samhan-arologis-service      Up 46 minutes (healthy)
samhan-auth-service          Up 46 minutes (healthy)
samhan-dashboard-service     Up 46 minutes (healthy)
samhan-dc-config-service     Up 46 minutes (healthy)
samhan-elasticsearch         Up 46 minutes (healthy)
samhan-eureka                Up 46 minutes (healthy)
samhan-grafana               Up 46 minutes (healthy)
samhan-groupware-service     Up 46 minutes (healthy)
samhan-inventory-service     Up 46 minutes (healthy)
samhan-minio                 Up 46 minutes (healthy)
samhan-notification-service  Up 46 minutes (healthy)
samhan-partner-auth-service  Up 46 minutes (healthy)
samhan-partner-order-service Up 46 minutes (healthy)
samhan-partner-service       Up 46 minutes (healthy)
samhan-postgres              Up 46 minutes (healthy)
samhan-product-service       Up 46 minutes (healthy)
samhan-rabbitmq              Up 46 minutes (healthy)
samhan-redis                 Up 46 minutes (healthy)
samhan-slip-service          Up 46 minutes (healthy)
samhan-user-service          Up 46 minutes (healthy)
~~~

### 배포 명령

Gradle:

~~~powershell
$env:GRADLE_USER_HOME='D:\dev\Samhan-Public\.gradle-t20'
.\gradlew.bat :services:groupware-service:bootJar :services:auth-service:bootJar -x test --no-daemon
~~~

응답:

~~~text
> Task :services:auth-service:bootJar
> Task :services:groupware-service:bootJar

BUILD SUCCESSFUL in 2m 2s
30 actionable tasks: 30 executed
~~~

기존 compose 프로젝트를 명시하고 대상 서비스만 재배포:

~~~powershell
docker compose -p infrastructure -f infrastructure/docker-compose.yml -f infrastructure/docker-compose.local-all.yml up -d --build --no-deps groupware-service auth-service
~~~

응답:

~~~text
Image infrastructure-groupware-service Built
Image infrastructure-auth-service Built
Container samhan-auth-service Recreate
Container samhan-groupware-service Recreate
Container samhan-auth-service Recreated
Container samhan-groupware-service Recreated
Container samhan-auth-service Started
Container samhan-groupware-service Started
~~~

배포 후 상태:

~~~text
samhan-auth-service status=running health=healthy
samhan-groupware-service status=running health=healthy
~~~

### Flyway 실측

auth 배포 전:

~~~powershell
docker exec samhan-postgres psql -U samhan -d auth_db -X -A -F TAB -c "SELECT installed_rank, version, description, success FROM public.flyway_schema_history ORDER BY installed_rank DESC LIMIT 5;"
~~~

응답:

~~~text
installed_rank  version description                                  success
86              86      seed products price schedule                 t
85              85      seed estimate list restore permission         t
84              84      seed sales slip list restore permission       t
83              83      seed partner order list restore permission    t
82              82      seed partner delete restore permission        t
(5 rows)
~~~

groupware 배포 전:

~~~powershell
docker exec samhan-postgres psql -U samhan -d groupware_db -X -A -F TAB -c "SELECT installed_rank, version, description, success FROM public.flyway_schema_history ORDER BY installed_rank DESC LIMIT 5;"
~~~

응답:

~~~text
installed_rank  version description                             success
15              15      approval lines approved pin immutable   t
14              14      add messages batch id                    t
13              13      approval lines document template pin immutable t
12              12      pin document template revisions         t
11              11      widen document type columns             t
(5 rows)
~~~

auth/groupware 배포 후:

~~~powershell
docker exec samhan-postgres psql -U samhan -d auth_db -X -A -F TAB -c "SELECT installed_rank, version, description, success FROM public.flyway_schema_history ORDER BY installed_rank DESC LIMIT 7;"
docker exec samhan-postgres psql -U samhan -d groupware_db -X -A -F TAB -c "SELECT installed_rank, version, description, success FROM public.flyway_schema_history ORDER BY installed_rank DESC LIMIT 7;"
~~~

응답:

~~~text
auth_db:
90  90  seed groupware schedules page permission     t
89  89  widen approval line config document type    t
88  88  seed partner search accountant view         t
87  87  seed accounting deposit mapping permission  t
86  86  seed products price schedule group permission t
85  85  seed estimate list restore permission       t
84  84  seed sales slip list restore permission     t
(7 rows)

groupware_db:
15  15  approval lines approved pin immutable       t
14  14  add messages batch id                       t
13  13  approval lines document template pin immutable t
12  12  pin document template revisions             t
11  11  widen document type columns                 t
10  10  add document templates                      t
9   9   approval steps group approver nullable      t
(7 rows)
~~~

auth DB에서 V90의 success=t를 확인했습니다.

### 렌더러 준비

워크트리에 Node 의존성이 없어 clients/desktop에서 npm install을 실행했습니다. file 의존성인 @samhan/design-system은 clients/web/design-system에서 npm install 후 npm run build했습니다. 설치 시 취약점 경고가 있었으나 의존성 수정은 하지 않았습니다.

실행 명령:

~~~powershell
cd clients/desktop
VITE_APP_VERSION="2026/07/30-1" npx vite --config vite.renderer.dev.config.ts --port 5181 --strictPort
~~~

응답:

~~~text
VITE v5.4.21 ready in 885 ms
Local: http://127.0.0.1:5181/
HTTP GET / -> 200
~~~

## 라이브 GUI 시나리오

### ① 권한 관리 화면의 그룹웨어 일정

실행 경로: 실 로그인 → 인사 → 권한설정 → 페이지 검색에 그룹웨어 일정 입력.

Playwright 실행 결과 원문:

~~~text
URL http://localhost:5181/#/admin/permission-matrix
MATCHING_BODY "그룹웨어 일정 | groupware.schedules"
SCREENSHOT 03-permission-groupware-schedule.png
~~~

판정: **PASS**

실 GUI 증거: [03-permission-groupware-schedule.png](screenshots/03-permission-groupware-schedule.png)

캡처에는 권한설정 화면, 검색어 그룹웨어 일정, 페이지 코드 groupware.schedules, 보기/생성/수정/삭제/복원/엑셀/인쇄 권한 열이 함께 보입니다.

### ② 일정 등록 성공 및 달력 표시

실행 원문:

~~~text
실 로그인 후 그룹웨어 버튼 클릭
URL http://localhost:5181/#/
BODY
그룹웨어
결재
결재 양식
결재 문서 양식
링크발송
알리고 주소록
메신저
단톡방 매핑
~~~

판정: **미검증**

실 그룹웨어 메뉴에 일정 등록 화면 진입점이 없었습니다. 일정 등록을 진행하지 않았고 일정 생성 API 또는 DB write도 실행하지 않았습니다.

실 GUI 증거: [04-groupware-menu.png](screenshots/04-groupware-menu.png)

### ③ 대상자가 아닌 사용자 화면에서 비노출

판정: **미검증**

현재 실 GUI에 일정 캘린더/목록 화면 진입점이 없습니다. 다른 사용자 세션을 조작하거나 API JSON으로 비노출을 주장하지 않았습니다.

### ④ 등록자 본인이 아닌 사용자 수정·삭제 거부(403)

판정: **미검증**

현재 실 GUI에 일정 상세·수정·삭제 화면 진입점이 없습니다. 타 사용자 세션의 수정·삭제 요청을 직접 API로 호출해 403이라고 대체하지 않았습니다.

## 추가 캡처 목록

모든 파일은 Node + Chrome의 실제 렌더링 캡처입니다.

| 파일 | 용도 |
|---|---|
| 00-login.png | 실 로그인 초기 화면 |
| 01-login-result.png | 로그인 실패 메시지 확인 화면, 자격은 화면에서 마스킹 |
| 01-master-home.png | 실 로그인 후 대시보드 |
| 02-hr-menu.png | 인사 메뉴 확장 |
| 02-user-menu.png | 실 사용자 메뉴 |
| 03-permission-management.png | 권한 관리 화면 |
| 03-permission-groupware-schedule.png | 그룹웨어 일정 검색 결과, 핵심 증거 |
| 04-groupware-menu.png | 그룹웨어 메뉴의 실제 노출 항목 |

## 신규 파일 전체 목록

~~~text
docs/qa/994-schedule-live/REPORT.md
docs/qa/994-schedule-live/screenshots/00-login.png
docs/qa/994-schedule-live/screenshots/01-login-result.png
docs/qa/994-schedule-live/screenshots/01-master-home.png
docs/qa/994-schedule-live/screenshots/02-hr-menu.png
docs/qa/994-schedule-live/screenshots/02-user-menu.png
docs/qa/994-schedule-live/screenshots/03-permission-groupware-schedule.png
docs/qa/994-schedule-live/screenshots/03-permission-management.png
docs/qa/994-schedule-live/screenshots/04-groupware-menu.png
~~~

## 범위 준수

- git 명령은 실행하지 않았습니다.
- groupware-service와 auth-service만 재배포했습니다.
- stock_instances, products 등 공유 실데이터에는 write하지 않았습니다.
- 일정 API write는 실행하지 않았습니다.
- 코드 수정, 리팩터링, 추가 기능 구현은 하지 않았습니다.


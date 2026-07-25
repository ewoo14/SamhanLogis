# #910 앱별 App Client Identity 구현 보고서

작성일: 2026-07-25  
범위: 서버 릴리스 정책 식별자 확장, 모바일 3앱 전환, 릴리스 등록 화면·API·mock, 회귀 테스트

## 1. 해결 내용과 수단

기존 `DESKTOP`·`WEB`·`MOBILE` 3값 체계를 다음 8개의 명시적인 앱 식별자로 확장했다.

| 식별자 | 사용자 표시명 |
|---|---|
| `DESKTOP` | 삼한 데스크톱 |
| `SAMHAN_MOBILE` | 삼한 모바일 |
| `SAMHAN_MOBILE_STAFF` | 삼한 직원 모바일 |
| `AROLOGIS_MOBILE` | 아로로지스 모바일 |
| `SAMHAN_ORDER_WEB` | 삼한 주문 웹 |
| `SAMHAN_ESTIMATE_WEB` | 삼한 종합견적 웹 |
| `SAMHAN_MOBILE_PUBLIC_WEB` | 삼한 모바일 퍼블릭 웹 |
| `AROLOGIS_DESKTOP` | 아로로지스 데스크톱 |

`DESKTOP`는 기존 데이터가 이미 삼한 데스크톱을 뜻하므로 그대로 유지했다. `WEB`·`MOBILE`은 BE 선배포 기간의 구버전 조회를 위해 enum, DB 제약, mock에 호환값으로 남겼다. 새 관리자 등록 화면에서는 8개 정식 앱만 선택하게 하고, 기존 호환 레코드를 편집할 때는 호환 선택지를 보존하여 앱이 조용히 바뀌지 않게 했다.

이 방식은 앱 이름이나 EAS slug를 추론하지 않고 명시적인 매핑을 사용한다. 특히 `mobile-staff`의 slug가 `samhan-estimate`인 문제를 피한다. 서버의 `(client_type, version)` 활성 유니크 축이 앱별 식별자와 함께 동작하므로 한 앱의 CRITICAL 릴리스가 다른 앱의 판정에 섞이지 않는다.

Flyway 신규 V7에서 `client_type`을 `VARCHAR(40)`으로 확장하고 제약조건에 8개 정식값과 2개 호환값을 등록했다. 기존 행은 갱신하지 않아 마이그레이션 전 `DESKTOP` 레코드는 계속 삼한 데스크톱 정책을 가리킨다.

모바일 버전 조회 요청은 다음처럼 앱별 값으로 전환했다.

```text
clients/mobile          -> SAMHAN_MOBILE
clients/mobile-staff    -> SAMHAN_MOBILE_STAFF
clients/arologis-mobile -> AROLOGIS_MOBILE
```

구버전 클라이언트가 옛 `MOBILE` 식별자로 조회했을 때 새 앱 정책을 잘못 적용하지 않고 조회 실패로 끝나며, 기존 모바일 게이트의 fail-open 처리로 BE가 먼저 배포되어도 구버전 앱이 버전 확인 실패 때문에 차단되지 않는다. OTA 설정과 웹 3앱·아로로지스 데스크톱의 버전 체크는 건드리지 않았다.

## 2. RED 출력 원문

### 서버 식별자·마이그레이션 테스트 RED

실행 명령:

```text
./gradlew :services:dashboard-service:test --tests "com.samhanair.logis.dashboard.it.AppReleaseControllerIT" --rerun-tasks --no-build-cache
```

```text
12 tests completed, 3 failed
...
Execution failed for task ':services:dashboard-service:test'.
> There were failing tests...
BUILD FAILED in 42s
```

실패한 회귀 테스트의 핵심 원문:

```text
<testsuite name="com.samhanair.logis.dashboard.it.AppReleaseControllerIT" tests="12" skipped="0" failures="3" errors="0" ...>
<testcase name="구버전 MOBILE 식별자는 신규 앱 릴리스 정책을 잘못 적용하지 않고 확인 실패로 끝난다" ...>
<failure message="org.springframework.dao.DataIntegrityViolationException: ... ERROR: new row for relation &quot;app_release&quot; violates check constraint &quot;ck_app_release_client_type&quot; ... Failing row contains (..., AROLOGIS_MOBILE, 1.1.0, CRITICAL, ...)" ...>
...
<testcase name="앱별 CRITICAL 릴리스는 다른 모바일 앱의 버전 판정을 바꾸지 않는다" ...>
<failure message="org.springframework.dao.DataIntegrityViolationException: ... ERROR: new row for relation &quot;app_release&quot; violates check constraint &quot;ck_app_release_client_type&quot; ... Failing row contains (..., AROLOGIS_MOBILE, 1.1.0, CRITICAL, ...)" ...>
...
<testcase name="마이그레이션 뒤 기존 DESKTOP 릴리스는 삼한 데스크톱 정책으로 계속 조회된다" ...>
<failure message="org.springframework.dao.DataIntegrityViolationException: ... ERROR: new row for relation &quot;app_release&quot; violates check constraint &quot;ck_app_release_client_type&quot; ... Failing row contains (..., AROLOGIS_DESKTOP, 1.0.1, ...)" ...>
```

### 모바일 3앱 RED

삼한 모바일:

```text
> @samhan/mobile@0.5.0 test
> jest --runInBand src/__tests__/version/versionCheck.test.ts

FAIL ...
× 삼한 모바일 전용 버전 endpoint에 앱 식별자와 currentVersion을 보낸다
Expected: "...clientType=SAMHAN_MOBILE..."
Received: "...clientType=MOBILE..."
...
Test Suites: 1 failed
Tests: 1 failed, 5 passed, 6 total
```

삼한 직원 모바일은 `Expected: "...clientType=SAMHAN_MOBILE_STAFF..."`, `Received: "...clientType=MOBILE..."`로 동일하게 실패했고, 아로로지스 모바일은 `Expected: "...clientType=AROLOGIS_MOBILE..."`, `Received: "...clientType=MOBILE..."`로 동일하게 실패했다.

### 관리자 화면 RED

```text
RUN v2.1.9 ...
❯ src/renderer/routes/admin/AppReleaseManagementPage.test.tsx (1 test | 1 failed)
× ... 릴리스 등록 화면에서 8개 앱...
→ expected [ 'DESKTOP', 'WEB', 'MOBILE' ] to deeply equal [ 'DESKTOP', 'SAMHAN_MOBILE', …(6) ]
...
Expected [8 values] / Received [ "DESKTOP","WEB","MOBILE" ]
```

### mock 격리 RED

```text
RUN v2.1.9
src/renderer/api/mock.test.ts (124 tests | 1 failed | 123 skipped)
× mock도 앱별 CRITICAL...
→ expected 'CRITICAL' to be 'NONE'
Expected: "NONE"
Received: "CRITICAL"
```

## 3. GREEN 출력 원문과 마이그레이션 probe

### 서버 전체 테스트

실행 명령:

```text
./gradlew :services:dashboard-service:test --rerun-tasks --no-build-cache
```

```text
> Task :services:dashboard-service:test

BUILD SUCCESSFUL in 37s
17 actionable tasks: 17 executed
OpenJDK 64-Bit Server VM warning...
```

대상 회귀 테스트(`AppReleaseControllerIT`, `DashboardFlywayV3AppReleaseIT`)도 별도 실행에서 다음 결과를 확인했다.

```text
BUILD SUCCESSFUL in 31s
17 actionable tasks: 17 executed
```

### 모바일 3앱 테스트·타입체크

각 앱의 버전 모듈 테스트 결과:

```text
PASS src/__tests__/version/versionCheck.test.ts
...
Test Suites: 1 passed, 1 total
Tests: 6 passed, 6 total
```

세 앱 모두 `npm run typecheck`가 오류 없이 종료됐다.

### 데스크톱 릴리스 화면·mock 테스트

```text
RUN v2.1.9
✓ src/renderer/api/mock.test.ts (124 tests)
✓ src/renderer/routes/admin/AppReleaseManagementPage.test.tsx (1 test)
Test Files 2 passed (2)
Tests 125 passed (125)
```

`cd clients/desktop && npm run typecheck`도 오류 없이 종료됐다.

### throwaway DB V1~V7 전량 적용 원문

공유 `dashboard_db`가 아닌 `probe_910`을 만들고, 현재 V1~V7을 순서대로 `psql -v ON_ERROR_STOP=1`로 적용했다. 검증 후 `probe_910`을 삭제했다.

```text
CREATE DATABASE
APPLY V1__init_dashboard.sql
CREATE TABLE
CREATE INDEX
CREATE INDEX
CREATE TABLE
CREATE INDEX
CREATE INDEX
CREATE TABLE
CREATE INDEX
CREATE INDEX
SELECT 0
CREATE INDEX
SELECT 0
CREATE INDEX
APPLY V2__add_shedlock.sql
CREATE TABLE
APPLY V3__app_release.sql
CREATE TABLE
CREATE INDEX
CREATE INDEX
APPLY V4__app_release_published.sql
ALTER TABLE
APPLY V5__app_notice.sql
CREATE TABLE
CREATE INDEX
CREATE TABLE
CREATE INDEX
APPLY V6__app_notice_constraints_and_filename.sql
ALTER TABLE
ALTER TABLE
ALTER TABLE
ALTER TABLE
APPLY V7__app_release_client_identity.sql
ALTER TABLE
ALTER TABLE
ALTER TABLE
VERIFY schema and identity rows
 character_maximum_length 
--------------------------
                       40
(1 row)

                                                                                                                                                                                                         pg_get_constraintdef                                                                                                                                                                                                          
---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 CHECK (((client_type)::text = ANY ((ARRAY['DESKTOP'::character varying, 'SAMHAN_MOBILE'::character varying, 'SAMHAN_MOBILE_STAFF'::character varying, 'AROLOGIS_MOBILE'::character varying, 'SAMHAN_ORDER_WEB'::character varying, 'SAMHAN_ESTIMATE_WEB'::character varying, 'SAMHAN_MOBILE_PUBLIC_WEB'::character varying, 'AROLOGIS_DESKTOP'::character varying, 'WEB'::character varying, 'MOBILE'::character varying])::text[])))
(1 row)

INSERT 0 2
   client_type   |   version    
-----------------+--------------
 AROLOGIS_MOBILE | probe-new
 DESKTOP         | probe-legacy
(2 rows)

DROP probe_910
DROP DATABASE
 count 
-------
     0
(1 row)
```

마지막 `0`은 삭제 후 `probe_910`이 남아 있지 않음을 확인한 결과다.

## 4. 변경 파일과 변경 내용

- `services/dashboard-service/src/main/java/com/samhanair/logis/dashboard/domain/AppClientType.java`: 8개 정식 식별자와 구버전 호환 enum 추가.
- `services/dashboard-service/src/main/java/com/samhanair/logis/dashboard/domain/AppRelease.java`: 식별자 컬럼 길이 40으로 확장.
- `services/dashboard-service/src/main/resources/db/migration/V7__app_release_client_identity.sql`: 신규 제약·길이 마이그레이션. 기존 V1~V6은 수정하지 않음.
- `services/dashboard-service/src/test/.../AppReleaseControllerIT.java`: A1, A3, A4 API 회귀 테스트.
- `services/dashboard-service/src/test/.../DashboardFlywayV3AppReleaseIT.java`: V7 제약·길이·기존 DESKTOP 보존 테스트.
- `clients/mobile/src/version/versionCheck.ts` 및 테스트: `SAMHAN_MOBILE` 전환.
- `clients/mobile-staff/src/version/versionCheck.ts` 및 테스트: `SAMHAN_MOBILE_STAFF` 전환.
- `clients/arologis-mobile/src/version/versionCheck.ts` 및 테스트: `AROLOGIS_MOBILE` 전환.
- `clients/desktop/src/renderer/api/appVersion.ts`: 앱 식별자 타입·명시 매핑·한국어 표시명 추가.
- `clients/desktop/src/renderer/routes/admin/AppReleaseManagementPage.tsx`: 8개 앱 선택 UI, 호환 레코드 보존 편집, 한국어 문구 적용.
- `clients/desktop/src/renderer/api/mock.ts` 및 `mock.test.ts`: 앱별 mock 정책 격리와 식별자 지원.
- `clients/desktop/src/renderer/routes/admin/AppReleaseManagementPage.test.tsx`: 8개 선택지·내부 enum 비노출 회귀 테스트.
- `README.md`, `ROADMAP.md`, `services/dashboard-service/README.md`, `migration/decisions/DECISIONS.md`, `docs/samhan-public-overview.html`: 앱 식별자·호환 정책 문서 동기화.
- `docs/dev-reports/2026-07-25-910-app-client-identity.md`: 본 구현·검증 보고서.

`app.config.js`, `expo-updates`, `EAS_PROJECT_ID`, `docs/qa/**`의 커밋된 스크린샷은 변경하지 않았다.

## 5. 불변식 대응표

| 불변식 | 지키는 표면 | 검증 테스트·근거 |
|---|---|---|
| A1 | 서버 조회 API와 desktop mock | `AppReleaseControllerIT.publicVersion_isolatedByExplicitAppIdentity`, `mock.test.ts` 앱별 CRITICAL 격리 테스트에서 아로로지스 모바일의 CRITICAL이 삼한 모바일·직원 모바일에 `NONE`으로 전파되지 않음을 함께 검증 |
| A2 | 서버 enum·모바일 요청·관리 화면 | `AppClientType`, 모바일 3개 `versionCheck.test.ts`, `AppReleaseManagementPage.test.tsx`가 8개 정식 식별자를 각각 검증. slug 추론 없이 코드에 명시 매핑 |
| A3 | V7 스키마와 서버 조회 | `DashboardFlywayV3AppReleaseIT.v7AppClientIdentityConstraintPreservesLegacyDesktopRows`, `AppReleaseControllerIT.publicVersion_preservesLegacyDesktopIdentityAfterIdentityMigration`가 기존 `DESKTOP` 행과 조회 결과를 보존함을 검증 |
| A4 | 구버전 조회 실패 fail-open 경로 | `AppReleaseControllerIT.publicVersion_legacyMobileIdentifierFailsOpenWhenNewIdentityReleaseExists`가 옛 `MOBILE` 조회가 새 앱 정책을 적용하지 않고 404가 됨을 검증. 기존 모바일 gate는 조회 예외를 통과 처리하여 BE 선배포 시 차단하지 않음 |
| A5 | 관리자 등록·편집 UI | `AppReleaseManagementPage.test.tsx`가 8개 한국어 앱명 선택지를 검증하고, 화면의 내부 enum 원문 비노출을 확인. 기존 `WEB`·`MOBILE` 편집 시 호환값을 보존하여 되돌릴 수 있음 |

## 6. Flyway 번호와 근거

작업 시작 시 `services/dashboard-service/src/main/resources/db/migration/`의 현재 최대 번호는 `V6`이었다. 따라서 main 병합 기준으로 다음 번호인 `V7__app_release_client_identity.sql`을 신규 추가했다. 적용된 V1~V6 파일은 checksum 보호를 위해 주석을 포함해 수정하지 않았다.

## 7. 범위 밖 발견

- 주문 웹(`order-app`), 종합견적 웹(`estimate-app`), 모바일 퍼블릭 웹(`mobile-public`)은 현재 버전 체크가 없으며 이번 작업에서 신설하지 않았다.
- 아로로지스 데스크톱도 이번 작업에서 버전 체크를 신설하지 않았다.
- 사용 중 알림은 추가하지 않았다.
- OTA 활성화와 `Updates.reloadAsync()` 경로는 변경하지 않았다.

## 8. 하지 못한 것 / 확신이 없는 것

- 실제 관리자 로그인 세션을 사용하는 브라우저 U-gate, 실 배포 릴리스 등록·복구 시나리오와 QA 스크린샷은 실행하지 못했다. API·mock·컴포넌트 테스트와 정적 타입 검증까지 수행했다.
- 공유 `dashboard_db`에는 접속하거나 마이그레이션을 적용하지 않았다. throwaway `probe_910`만 생성·검증·삭제했다.
- 구버전 `MOBILE` 조회의 fail-open은 기존 모바일 게이트의 예외 처리에 의존한다. 이번 범위에서는 그 게이트의 정책을 변경하지 않고, 서버가 새 앱 정책을 옛 식별자에 잘못 적용하지 않는 회귀만 추가했다.

## 9. 2026-07-25 인수 세션 — 개발 버전 정책 보완 및 CI 재검증

### 9-1. 이어받은 부분 산출물 상태

인수 시점에 25개 파일, 441줄의 미커밋 변경이 있었다. 앱별 `AppClientType` 8값, V7,
모바일 3앱의 명시 매핑, 관리자 8개 한국어 선택지는 이미 구현되어 있었고 A1~A5의
기본 테스트도 존재했다. 미완성인 부분은 개발 버전 형식의 서버 update 경계, 기존 semver
레코드 보존, mock과 Playwright의 새 정책 정합성, 클라이언트 빌드 버전 주입의 실행 검증이었다.
기존 코드는 실행·검증되지 않은 상태로 간주하고 RED부터 다시 확인했다. V7과 기존 identity
구현은 수정하지 않았다.

### 9-2. 완성 수단과 판단

- 개발 버전은 `YYYY/MM/DD-{번호}` 정규식과 실제 달력 날짜 검증으로 등록 단계에서 거부한다.
  일련번호는 1 이상이며 선행 0을 허용하지 않는다. `Semver.compare`는 개발 버전끼리
  날짜를 먼저 비교하고 같은 날짜에서는 `BigInteger` 일련번호를 비교하므로 `-2 < -10`의
  문자열 비교 오류가 없다.
- 패키지 `0.1.0` 등 semver는 `package.json`·Expo·electron-builder가 요구하는 빌드
  식별자로 남기고, 서버 정책 판정에는 사용하지 않는다. Expo 3앱은
  `EXPO_PUBLIC_APP_VERSION`, desktop은 `VITE_APP_VERSION`으로 개발 버전을 주입한다.
  주입이 없는 구버전 실행 환경은 패키지 semver를 읽어 호환성을 유지하지만 신규 빌드의
  정책 경로는 주입값을 우선한다.
- V4 때문에 V7을 수정하지 않았고 V8도 추가하지 않았다. 현재 두 DB 컬럼은 이미
  `VARCHAR(50)`이라 새 형식을 담을 수 있다. DB CHECK가 semver와 개발 버전을 동시에
  허용하면 신규 등록을 강제할 수 없으므로, 신규 등록은 `AppReleaseService`의 애플리케이션
  경계에서 엄격히 검증했다. 기존 semver 레코드는 두 버전 필드를 그대로 두는 수정만 허용하고,
  실제 버전 변경은 새 형식을 요구한다. 따라서 기존 행이 조회 실패하거나 다른 버전으로
  조용히 해석되지 않는다.
- desktop mock도 서버와 동일하게 신규 등록을 검증하고, 기존 semver의 두 버전 값이 모두
  그대로인 수정만 보존한다. 관리자 Playwright CRUD는 신규 정식 선택지인 `DESKTOP`을
  사용하도록 갱신했다. 브라우저 런타임의 legacy `WEB` localStorage 키는 구버전 호환
  계약이므로 남겼으며, 관리자 선택지에 `WEB`을 되살린 것은 아니다.

### 9-3. RED 출력

변경 전 HEAD의 `Semver.java`, `AppReleaseService.java`를 임시 복원해 신규 API 테스트를
실행했다. 소스는 `git show HEAD:<경로>`로 복원한 뒤 `finally`에서 즉시 되돌렸다.
새 `SemverTest`의 `requireDevelopmentVersion` 직접 호출은 HEAD에 해당 API가 없으므로
컴파일 단계에서 RED가 되는 구조다. 따라서 실행 가능한 HEAD 테스트 소스와 현재 신규
`AppReleaseControllerIT`를 조합해 등록·조회 경계의 런타임 RED도 함께 확보했다.

```text
AppReleaseControllerIT > POST /app/releases 신규 등록은 미발행 상태이며 publish 전까지 /app/version에 반영되지 않는다 FAILED
AppReleaseControllerIT > 잘못된 개발 버전 2026-07-25-1은 등록을 거부한다 FAILED
AppReleaseControllerIT > 잘못된 개발 버전 2026/7/5-1은 등록을 거부한다 FAILED
AppReleaseControllerIT > 잘못된 개발 버전 0.1.0은 등록을 거부한다 FAILED
AppReleaseControllerIT > admin CRUD는 admin.app-release 7-action 권한으로 등록/조회/수정/소프트삭제한다 FAILED
AppReleaseControllerIT > 동시 POST 중복 릴리스는 200/409로 귀결되고 SQL 제약명을 노출하지 않는다 FAILED
AppReleaseControllerIT > 개발 버전 릴리스는 슬래시 날짜-번호를 그대로 등록·조회한다 FAILED
AppReleaseControllerIT > 최소 지원 버전도 신규 개발 버전 형식이 아니면 등록을 거부한다 FAILED
20 tests completed, 8 failed
BUILD FAILED
```

실패한 테스트는 신규 개발 버전 등록·한국어 형식 거부·최소 지원 버전 거부·admin CRUD·
기존 publish CRUD·동시 중복 등록 경로였다. 기존 semver 값 유지 수정 회귀는 통과했지만,
새 개발 버전 등록 계약은 변경 전 코드에서 실패했다. 첫 RED 시도에서 PowerShell의 UTF-8 BOM이 Java 소스에
삽입되어 컴파일 오류가 난 것은 기능 RED가 아닌 실행 환경 오류였으며, BOM 없는
`git show` 복원으로 다시 실행했다.

### 9-4. GREEN 및 마이그레이션 probe 출력

서버 대상 테스트와 전체 dashboard-service 테스트는 `--rerun-tasks --no-build-cache`로
실행했다.

```text
./gradlew :services:dashboard-service:test --tests SemverTest --tests AppReleaseControllerIT --rerun-tasks --no-build-cache
BUILD SUCCESSFUL in 31s
17 actionable tasks: 17 executed

./gradlew :services:dashboard-service:test --rerun-tasks --no-build-cache
BUILD SUCCESSFUL in 37s
17 actionable tasks: 17 executed
```

공유 `dashboard_db`가 아닌 throwaway `probe_910_20260725`에 V1~V7을 적용하고 확인한 뒤
삭제했다.

```text
DROP DATABASE
CREATE DATABASE
APPLY V1__init_dashboard.sql
APPLY V2__add_shedlock.sql
APPLY V3__app_release.sql
APPLY V4__app_release_published.sql
APPLY V5...
APPLY V6...
APPLY V7...
VERIFY version columns and client identity constraint
 client_type 40
 min_supported_version 50
 version 50
constraint contains all 8 canonical + WEB + MOBILE
INSERT legacy and development release rows
INSERT 0 2
 AROLOGIS_MOBILE | 2026/07/25-10 | 2026/07/25-2
 DESKTOP | 1.2.0 | 1.0.0
DROP DATABASE
DROP DATABASE completed
remaining probe databases: 0
```

### 9-5. CI 실패 원인과 재검증

PM 진단은 맞았다. `VITE_APP_VERSION`을 주입하지 않은 현재 스펙을 먼저 실행했을 때는
mock의 기본 버전 `0.0.0`이 legacy `WEB`의 최소 지원 `0.1.0`보다 낮아 긴급 업데이트
게이트가 관리자 화면보다 먼저 열리는 환경 문제도 확인했다. 유효한 기본 개발 버전을
Playwright mock server에 주입한 뒤에는 다음 오래된 스펙 오류가 재현됐다.

```text
Error: locator.selectOption: Test timeout of 60000ms exceeded.
version-management-v1b.spec.ts:119
await page.getByTestId('app-release-client-type').selectOption('WEB')
did not find some options
```

`WEB`은 A5에 따라 관리자 선택지에서 제거된 값이므로 스펙을 `DESKTOP`과 개발 버전
형식으로 갱신했다. 재실행 결과:

```text
Running 6 tests using 1 worker
6 passed (12.0s)
```

프론트·모바일 검증 결과:

```text
clients/desktop: npm run typecheck -> exit 0
clients/desktop: npx vitest run -> exit 0 (mock 125 tests, versionCheck 6 tests 포함)
clients/mobile: typecheck -> exit 0; versionCheck 7 passed
clients/mobile-staff: typecheck -> exit 0; versionCheck 7 passed
clients/arologis-mobile: typecheck -> exit 0; versionCheck 7 passed
```

### 9-6. 변경 파일

- 서버: `Semver.java`, `AppReleaseService.java`, `AppRelease.java`, `AppReleaseRequest.java`와
  `SemverTest.java`, `AppReleaseControllerIT.java` — 형식 검증, 숫자 비교, legacy update
  보존, 한국어 오류 문구와 회귀 테스트.
- desktop: Vite/electron build 설정, `AppVersionGate`·version helper, mock 정책·테스트,
  관리자 안내 문구, Playwright mock 환경과 `version-management-v1b` — 개발 버전 주입과
  정식 `DESKTOP` CRUD.
- mobile 3앱: `app.config.js`, version helper와 각 테스트 — 빌드 주입값 우선 및 명시 앱
  식별자 유지.
- 문서: `README.md`, `ROADMAP.md`, dashboard-service README, 결정 기록, overview HTML,
  본 리포트 — 개발 버전 정본·semver 분리·legacy 보존 정책을 동기화.

### 9-7. V1~V5 및 A1~A5 대응

| 불변식 | 대응 및 확인 |
|---|---|
| V1 | 서버 등록·저장·API 반환·관리 문구를 `YYYY/MM/DD-{번호}`로 통일하고, desktop/mobile 빌드 주입 테스트로 확인했다. |
| V2 | `LocalDate` 후 `BigInteger` 비교와 mock 숫자 비교로 `2026/07/25-2 < 2026/07/25-10`을 검증했다. |
| V3 | create와 `minSupportedVersion` 모두 등록 경계에서 거부하며 한국어 형식 안내를 반환한다. |
| V4 | 기존 semver 조회를 허용하고 두 버전 필드 불변 update만 허용했다. probe에서 `DESKTOP 1.2.0/1.0.0` 행을 보존했다. |
| V5 | 정책 판정은 개발 버전이며 package/Expo/electron semver는 빌드 식별자로만 남겼다. |

A1~A5는 기존 identity 테스트와 함께 전체 dashboard-service 테스트, desktop typecheck/Vitest/
Playwright, 모바일 3앱 versionCheck 테스트, V1~V7 throwaway probe로 재확인했다. 특히 probe의
CHECK에는 8개 정식 식별자와 호환 `WEB`·`MOBILE`만 존재하고, Playwright 관리자 CRUD는
`DESKTOP`을 사용하므로 A5의 legacy 선택지 제거를 되돌리지 않는다.

### 9-8. Flyway 번호와 남은 불확실성

Flyway는 **V7만 사용**하고 변경하지 않았다. V7은 이미 identity 배포·리뷰 환경에서 적용될
수 있어 checksum 변경 위험이 있고, 기존 `VARCHAR(50)` 컬럼이 새 값을 수용하므로 이 정책에
DB migration이 필요하지 않다. V8을 추가해 DB CHECK를 새 형식 전용으로 만들면 V4를 깨뜨리므로
애플리케이션 등록 경계를 선택했다.

실제 관리자 로그인 U-gate, 실제 배포 앱의 환경 변수 주입 산출물, 공유 DB 적용은 수행하지
않았다. 공유 DB는 건드리지 않았고 throwaway probe만 DROP으로 정리했다. Playwright 실행으로
`docs/qa/**` 스크린샷을 덮어쓰지 않았으며 최종 status에서 해당 경로 오염이 없는지 확인한다.

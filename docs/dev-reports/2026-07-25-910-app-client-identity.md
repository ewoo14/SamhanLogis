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

구버전 클라이언트가 옛 `MOBILE` 식별자로 조회하면 `DESKTOP` 릴리스가 있는 경우 그 정책으로 도달하고, 아직 canonical 릴리스가 없으면 기존 `MOBILE` 정책으로 fallback한다. 어느 정책도 없을 때의 404와 기존 모바일 게이트 fail-open은 유지된다. OTA 설정과 웹 3앱·아로로지스 데스크톱의 별도 version-check 신설은 건드리지 않았다.

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
  식별자로 남기고, 서버 정책 판정에는 사용하지 않는다. 저장소의
  `scripts/app-build-version.cjs`가 Expo 3앱과 desktop의 빌드 경로를 공통 처리한다.
  `EXPO_PUBLIC_APP_VERSION`·`VITE_APP_VERSION` 명시값은 검증 후 사용하고, 누락 시 KST
  날짜와 `SAMHAN_BUILD_NUMBER`(또는 `EXPO_BUILD_NUMBER`, 기본 1)로 개발 버전을 생성하며
  경고한다. 현재 빌드 경로는 `0.0.0`으로 조용히 폴백하지 않는다. 이미 설치된 오래된
  Expo 번들이 `extra.appVersion`을 갖지 않는 경우에만 기존 `expoConfig.version` 호환
  경로가 남아 있으며, desktop은 패키지 semver를 런타임에서 읽지 않는다.
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
| V3 | 최신 버전은 개발 형식을 강제하고, 전환기 `minSupportedVersion`은 개발 형식 또는 semver를 허용하며 한국어 형식 안내를 반환한다. |
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

실제 관리자 로그인 U-gate와 공유 DB 적용은 수행하지 않았다. 공유 DB는 건드리지 않았고
throwaway probe만 DROP으로 정리했다. Playwright 실행으로 `docs/qa/**` 스크린샷을
덮어쓰지 않았으며 최종 status에서 해당 경로 오염이 없는지 확인한다. 실제 빌드 산출물
주입은 §10-3에서 별도로 수행했다.

## 10. 2026-07-25 라운드 fix — 적대검증 W-1~W-7

### 10-1. RED-first 원문

수정 전에 먼저 결함을 고정하는 테스트를 추가하고, 기존 구현에 실행했다. 기능 결함에
해당하는 RED 원문은 다음과 같다.

```text
RUN v2.1.9
versionCheck.test ... 1 failed
× Electron·Capacitor·웹 ... → expected 'MOBILE' to be 'DESKTOP'
appVersion.test ... 1 failed
× ... → appClientOptionsForRelease is not a function
mock.test ... 1 failed
× ... → expected undefined to be true
Test Files 3 failed
Tests 3 failed | 134 passed (137)
```

백엔드도 전환기 semver 최소 버전과 관리자 오류 문구의 RED를 확인했다.

```text
AppReleaseControllerIT > 릴리스 등록은 ... 2026-07-25-1 FAILED
AppReleaseControllerIT > ... 2026/7/5-1 FAILED
AppReleaseControllerIT > ... 0.1.0 FAILED
AppReleaseControllerIT > 전환기에는 ... semver ... FAILED
53 tests completed, 4 failed
BUILD FAILED
17 actionable tasks: 17 executed
```

추가한 `clients/desktop/scripts/round-910-contract.test.cjs`도 구현 전에는 산출물의
`0.0.0` 계약, #909 invalid payload, 문서 계약에서 RED였다. 이 테스트는 Windows에서
`npx.cmd` 셸 상태에 의존하지 않고 `electron-vite` Node entry를 직접 실행하도록 작성했다.

### 10-2. 구현 수단과 선택 이유

- W1: 저장소 루트 `scripts/app-build-version.cjs`를 단일 해석기로 만들고 Electron 4개
  Vite 설정과 Expo 3개 `app.config.js`에서 사용했다. 명시적인 `VITE_APP_VERSION`/
  `EXPO_PUBLIC_APP_VERSION`은 엄격히 검증하고, 누락 시 KST 날짜와
  `SAMHAN_BUILD_NUMBER`(없으면 1)로 `YYYY/MM/DD-{번호}`를 생성하며 경고한다. 기존 CI와
  로컬 빌드를 모두 살리면서도 `0.0.0`으로 조용히 떨어지는 산출물을 막는 선택이다. desktop
  계약 테스트를 CI allowlist에 넣어 실제 Electron 산출물까지 검사한다.
- W2: `AppReleaseService.create/update`에서 최신 버전만 개발 형식을 강제하고,
  `minSupportedVersion`은 전환기 동안 `Semver.requireValid`로 개발 형식 또는 semver를
  받도록 했다. 이 방식은 이미 설치된 semver 사용자에게 `0.1.0` 최소 지원을 적용하고,
  전환 종료 시 관리자가 최소 지원 값을 개발 형식으로 올리는 운영 절차를 보존한다. 이후
  모든 설치 클라이언트가 개발 형식으로 전환된 것을 확인한 뒤 다음 릴리스 등록/수정에서
  최소 지원 값도 개발 형식으로 올리고, semver 행은 삭제가 아니라 soft-delete 한다.
- W3: Capacitor/Web도 같은 `clients/desktop` 백오피스 산출물이므로
  `resolveAppClientType`을 세 런타임 모두 `DESKTOP`으로 통일했다. 관리 선택지는 8개
  canonical client를 모두 제공하고, 실제 version endpoint 소비 코드가 없는 4개에는
  `버전 확인 미지원`을 표시한다. 편집 시 원래 행의 legacy `WEB`/`MOBILE`을 form 현재값이
  아니라 원본 행에서 파생해, 바꾼 뒤에도 되돌릴 수 있게 했다.
- W4: #909 5개 실 QA 스펙의 등록 최신 버전을 개발 형식으로 바꾸고 최소 지원 값은
  전환기 semver로 바꿨다. plan의 U-gate도 같은 계약으로 정정했다.
- W5/W7: 존재하지 않는 package-semver runtime fallback 서술을 제거하고, 명시 주입값·누락
  시 생성 및 경고 정책을 문서화했다. 서버와 mock의 형식 오류 필드명은 `최신 버전`/
  `최소 지원 버전`으로 표시한다.
- W6: version endpoint를 호출하지 않는 4개 canonical 앱에 목록/선택지 표시를 붙이고,
  publish modal도 실제 지원 여부에 따라 안내 문구를 분기했다.

### 10-3. GREEN 및 실제 산출물 원문

```text
./gradlew :services:dashboard-service:test --rerun-tasks --no-build-cache
BUILD SUCCESSFUL in 42s
17 actionable tasks: 17 executed

clients/desktop: npm run typecheck
exit 0
clients/desktop: npx vitest run
exit 0
clients/desktop: npx playwright test version-management-v1b
Running 6 tests using 1 worker
6 passed (12.2s)

clients/mobile: versionCheck.test.ts
Test Suites: 1 passed, Tests: 7 passed
clients/mobile-staff: versionCheck.test.ts
Test Suites: 1 passed, Tests: 7 passed
clients/arologis-mobile: versionCheck.test.ts
Test Suites: 1 passed, Tests: 7 passed

npm run test:round-910-contract
ℹ tests 5, pass 5, fail 0, duration 11367.9294ms
```

desktop 전체 Vitest에는 기존 jsdom/React Router 경고와 인증 실패를 모사하는 stderr가
출력됐지만 프로세스는 exit 0이고 실패 테스트는 없었다. desktop 및 모바일 3앱의
typecheck도 모두 exit 0이다.

실제 Electron 산출물 바이트 대조:

```text
npx electron-vite build                         # VITE_APP_VERSION 없음
[Samhan] 개발 버전 주입값(VITE_APP_VERSION)이 없어 2026/07/25-1을 자동 생성했습니다. 배포 릴리스에는 명시 주입값을 사용하십시오.
out/renderer/assets\index-B8Cd92Df.js:148472:CURRENT_VERSION = resolveBuildAppVersion("2026/07/25-1");

VITE_APP_VERSION=2026/07/25-3 npx electron-vite build
out/renderer/assets\index-BqU3yRSV.js:148472:CURRENT_VERSION = resolveBuildAppVersion("2026/07/25-3");

VITE_APP_VERSION=2026/07/25-3 npm run build:capacitor
dist/capacitor/assets\index-bigLpY3H.js:599:2026/07/25-3

npm run build:capacitor                         # VITE_APP_VERSION 없음
[Samhan] 개발 버전 주입값(VITE_APP_VERSION)이 없어 2026/07/25-1을 자동 생성했습니다. 배포 릴리스에는 명시 주입값을 사용하십시오.
dist/capacitor/assets\index-Dc1JHwyX.js:81:2026/07/25-1
```

`npm run build`와 `npm run build:web`도 환경변수 없이 exit 0이며 같은 경고와 개발 버전을
생성했다. 산출물에 남아 있는 `0.0.0` 문자열은 `CURRENT_VERSION` 주입값이 아니라 기존
runtime/mock의 구버전 호환 기본값이며, 실제 게이트에 전달되는 빌드 상수는 위처럼
개발 형식이다. `npm run build:win`은 `electron-vite` 단계까지 같은 개발 버전으로
성공했지만, 첫 실행은 기존 `DESKTOP_UPDATE_URL` 누락으로 electron-builder 단계에서
실패했고, dummy URL을 준 재실행은 Windows 권한 없는 `winCodeSign` 심볼릭 링크 추출에서
실패했다. 두 실패 모두 버전 주입 단계와 무관하다.

### 10-4. W-1~W-7 및 기존 불변식 대응

| 결함 | 대응 및 검증 |
|---|---|
| W-1 | 공통 resolver + 4 desktop config + Expo 3 config + CI contract test. Electron/Web/Capacitor no-env 경고와 injected artifact 바이트를 확인했다. Windows 패키징은 electron-vite 단계까지 통과했으며 기존 electron-builder 환경/권한 문제로 최종 installer는 미생성이다. |
| W-2 | 최신 개발 형식/최소 semver 전환기 계약, `0.1.0` 등록·publish·조회 MINOR IT 테스트. 전환 종료는 모든 클라이언트 전환 확인 후 min을 개발 형식으로 올리는 운영 절차다. |
| W-3 | Electron/Capacitor/Web 모두 DESKTOP mapping, canonical 8개 선택지, legacy 되돌리기, appVersion unit/UI 테스트. |
| W-4 | #909 5개 payload와 plan U-gate를 개발 최신 + semver min으로 갱신하고 정적 계약 테스트 5/5를 통과했다. 실제 live five-spec 실행은 공유 DB 쓰기 때문에 수행하지 않았다. |
| W-5 | dev-report와 dashboard-service README에서 존재하지 않는 폴백 계약을 제거하고 resolver의 누락 경고·명시 주입 정책으로 갱신했다. |
| W-6 | version endpoint 미지원 4앱에 목록/선택지/게시 모달 표시를 추가했다. #928 자체 기능은 범위 밖이라 version endpoint 구현은 하지 않았다. |
| W-7 | 서버 `Semver`와 desktop mock의 사용자 대면 필드명을 한국어 라벨로 매핑했다. IT 오류 응답에서 `최신 버전` 포함, 영문 `version` 미포함을 확인했다. |

A1~A5·V1~V5 무회귀 확인 방법은 기존 테스트/throwaway probe 결과를 보존하고 이번 round에
다음으로 재확인했다: 8개 canonical 식별자 정적 목록 및 runtime mapping, legacy
`WEB`/`MOBILE` 편집 선택지, fail-open/NONE·MINOR·MAJOR·CRITICAL desktop tests, 개발 버전
slash 형식과 날짜/BigInteger 경계 테스트, 기존 semver 조회·불변 update IT 테스트, package
semver와 정책용 개발 버전의 분리. V7 migration은 수정하지 않았다.

이번 round에는 DB schema 변경이 없으므로 새 migration을 실행하지 않았고, 공유
`dashboard_db`에는 접근하지 않았다. 앞선 §9-5의 throwaway probe는 DROP 완료 기록을
그대로 보존한다.

### 10-5. 최종 상태

```text
git status --porcelain
 M .github/workflows/ci.yml
 M clients/arologis-mobile/app.config.js
 M clients/desktop/electron.vite.config.ts
 M clients/desktop/package.json
 M clients/desktop/playwright/909-auto-update-real-qa/force-level-gate-real-qa.spec.ts
 M clients/desktop/playwright/909-auto-update-real-qa/luna-round-real-qa.spec.ts
 M clients/desktop/playwright/909-auto-update-real-qa/opus-reconv3-probe-real-qa.spec.ts
 M clients/desktop/playwright/909-auto-update-real-qa/sonnet-round2-notice-overlap-real-qa.spec.ts
 M clients/desktop/playwright/909-auto-update-real-qa/sonnet-round2-print-sweep-real-qa.spec.ts
 M clients/desktop/src/renderer/api/appVersion.test.ts
 M clients/desktop/src/renderer/api/appVersion.ts
 M clients/desktop/src/renderer/api/mock.test.ts
 M clients/desktop/src/renderer/api/mock.ts
 M clients/desktop/src/renderer/routes/admin/AppReleaseManagementPage.test.tsx
 M clients/desktop/src/renderer/routes/admin/AppReleaseManagementPage.tsx
 M clients/desktop/src/renderer/version/versionCheck.test.ts
 M clients/desktop/src/renderer/version/versionCheck.ts
 M clients/desktop/vite.capacitor.config.ts
 M clients/desktop/vite.config.ts
 M clients/desktop/vite.web.config.ts
 M clients/mobile-staff/app.config.js
 M clients/mobile/app.config.js
 M docs/dev-reports/2026-07-25-910-app-client-identity.md
 M docs/handoff/CURRENT-WORK.md
 M docs/superpowers/plans/2026-07-25-910-app-client-identity.md
 M services/dashboard-service/README.md
 M services/dashboard-service/src/main/java/com/samhanair/logis/dashboard/domain/Semver.java
 M services/dashboard-service/src/main/java/com/samhanair/logis/dashboard/service/AppReleaseService.java
 M services/dashboard-service/src/test/java/com/samhanair/logis/dashboard/it/AppReleaseControllerIT.java
?? clients/desktop/scripts/round-910-contract.test.cjs
?? scripts/app-build-version.cjs
```

```text
git status --porcelain docs/qa
(출력 없음)
# docs/qa 오염 0
```

커밋/commit/차단된 GitHub 쓰기와 실제 live #909 5-spec 실행은 수행하지 않았다. live spec은
실 로그인·실 서버·실 DB에 릴리스를 만들고 soft-delete하는 하네스라, 이번 round의 공유 DB
비접근 규칙과 충돌한다. `build:win` 최종 installer도 기존 `DESKTOP_UPDATE_URL` 및
Windows symlink 권한 문제로 만들지 못했다. 정적 payload 계약, mock Playwright, backend IT,
실제 Electron/Web/Capacitor 빌드로 가능한 범위를 검증했다.
## 11. 2026-07-25 SOL 2차 적대검증 라운드 fix — F-1~F-5

### 11-1. RED 원문

#### F-1 — 같은 날 무주입 빌드 중복

실행: `node --test scripts/app-build-version.test.cjs`

```text
✖ 같은 날 무주입 빌드 두 개는 모호한 동일 버전을 만들지 않고 실패한다
AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
2 !== 0

✖ 미래 날짜의 무주입 빌드는 오래된 코드도 최신으로 위조하지 않고 실패한다
AssertionError [ERR_ASSERTION]: Missing expected exception.
```

기준선 resolver는 같은 KST 날짜에 두 번 모두 `2026/07/25-1`을 반환했고, 미래 날짜에도
`2026/07/26-1`을 반환했다.

#### F-2 — 미래 날짜 무주입 빌드

위 동일 실행의 두 번째 테스트가 실패했다. 즉 호스트 날짜가 미래여도 빌드가 중단되지 않아
오래된 코드가 정식 최신 릴리스보다 높게 판정될 수 있었다.

#### F-3 — legacy MOBILE의 유예 미종료

실행: `./gradlew.bat :services:dashboard-service:test --tests com.samhanair.logis.dashboard.it.AppReleaseControllerIT.publicVersion_legacyMobileIdentifierUsesDesktopPolicyWhenAvailable --no-daemon`

첫 시도는 테스트 본문 전 `build/test-results/test/binary/output.bin` 잠금으로 실패한 환경 RED였다.
Gradle daemon을 정리한 뒤 재실행한 기능 RED 원문은 다음과 같다.

```text
AppReleaseControllerIT > 구버전 MOBILE 요청은 DESKTOP 릴리스의 최소 지원 정책에 도달한다 FAILED
    java.lang.AssertionError at AppReleaseControllerIT.java:339

1 test completed, 1 failed
BUILD FAILED
```

#### F-4 — Web/Capacitor CRITICAL 탈출구 부재

실행: `npx vitest run src/renderer/api/appVersion.test.ts src/renderer/components/common/AppVersionGate.test.tsx`

```text
× 브라우저 런타임의 CRITICAL 차단은 updater 없는 상태에서도 페이지 새로고침 탈출구를 제공한다
TestingLibraryElementError: Unable to find an accessible element with the role "button"
and name "페이지 새로고침"
현재 접근 가능한 버튼: "업데이트 다시 확인", "앱 종료"
```

#### F-5 — canonical 오저장 후 legacy 원복 불가

같은 실행에서 다음 RED가 확인됐다.

```text
× canonical으로 잘못 저장한 뒤 다시 편집해도 legacy WEB/MOBILE로 되돌릴 수 있다
expected [ 'DESKTOP', 'SAMHAN_MOBILE', …, 'AROLOGIS_DESKTOP', 'WEB', 'MOBILE' ]
received [ 'DESKTOP', 'SAMHAN_MOBILE', …, 'AROLOGIS_DESKTOP' ]
```

### 11-2. 수정 수단과 불변식 대응

- F-1/G1/G7: `SAMHAN_RELEASE_BUILD=1`인 릴리스 모드에서는
  `VITE_APP_VERSION`/`EXPO_PUBLIC_APP_VERSION`을 명시하지 않으면 실패한다. 일반 개발·CI
  경로는 `0.1.0-dev` 고정 sentinel을 사용하므로 클론 후 추가 설정 없이 실행된다.
- F-2/G2/G8: 자동 KST 날짜·기본 일련번호·빌드 호스트 시계를 릴리스 버전 축에서 제거했다.
  sentinel은 `Semver`에서 정식 개발 릴리스보다 항상 낮고 `requireDevelopmentVersion`을
  통과하지 못해 등록할 수 없다. 기존 `Semver`의 날짜→일련번호 비교(V2)는 유지했다.
  새 Flyway 파일은 없다.
- F-3/G3/A4: 공개 조회에서 legacy `WEB`/`MOBILE`은 `DESKTOP`을 먼저 조회한다.
  canonical 릴리스가 있으면 그 `minSupportedVersion`으로 구형 설치자를 정책에 도달시키고,
  canonical 릴리스가 아직 없으면 기존 legacy 레코드로 fallback한다. 둘 다 없으면 기존 404와
  클라이언트 fail-open을 유지하므로 BE 선배포 안전성을 보존한다.
- F-4/G4/W-3: 세 런타임을 계속 `DESKTOP`으로 등록·조회한다. Electron만 updater 확인/종료를
  사용하고, Web은 `페이지 새로고침`, Capacitor는 `앱 다시 불러오기`로 `window.location.reload()`를
  실행한다. Web/Capacitor에는 동작하지 않는 `window.close()` 버튼을 렌더링하지 않는다.
  따라서 W-3의 canonical `DESKTOP` 등록 가능성은 유지하면서 차단 화면의 실행 가능한 탈출구를
  런타임별로 제공한다.
- F-5/G5/A5: 등록 화면은 인자 없는 `appClientOptionsForRelease()`로 canonical 8개만 보여준다.
  어떤 행을 편집하든 편집 폼에는 `WEB`/`MOBILE`을 추가하고, 현재 legacy 행이면 해당 값을 첫
  선택지로 둔다. canonical으로 잘못 저장한 뒤에도 legacy 원복이 가능하다.
- G6: 기존 `DESKTOP` 보존, 모바일 3앱의 명시 식별자, semver 기존 레코드 조회/불변 편집,
  전환기 semver `minSupportedVersion`, canonical 8개 관리 선택지를 유지했다. 모바일 helper는
  package semver가 있는 기존 설치본만 fallback하며, 값이 전혀 없을 때는 `0.0.0`을 보고하지
  않고 예외로 중단한다. desktop mock도 `0.1.0-dev`를 사용해 번들 안에 `0.0.0` fallback을
  남기지 않는다.

- G7↔G1/G2 긴장 해소: 개발/CI 실행과 릴리스 실행을 `SAMHAN_RELEASE_BUILD`로 분리했다.
  개발 sentinel은 날짜·시계에서 파생되지 않고 서버 등록 형식도 아니므로 릴리스 순서에
  들어갈 수 없다. 정식 산출물만 파이프라인이 고유한 개발 버전을 주입한다.

### 11-3. GREEN 원문

```text
node --test scripts/app-build-version.test.cjs
✔ 무주입 개발·CI 빌드는 릴리스가 아닌 고정 sentinel을 사용한다
✔ 릴리스 모드의 무주입 빌드는 호스트 날짜와 무관하게 실패한다
✔ 명시 주입 릴리스는 개발 형식 버전을 그대로 사용한다
ℹ pass 4
ℹ fail 0

clients/desktop: npx vitest run --reporter=dot
Test Files 169 passed (169)
Tests 1337 passed (1337)

무주입 실제 빌드 경로
clients/desktop: npm run build                         exit 0
clients/desktop: npm run build:web                     exit 0
clients/desktop: npm run build:capacitor               exit 0
clients/arologis-mobile: npx expo config --type public  exit 0
Electron/Web/Capacitor/Expo 모두 appVersion 또는 CURRENT_VERSION에 `0.1.0-dev`를 포함했다.
Electron/Web/Capacitor 산출물의 `0.0.0` literal 검색 결과는 없음.

G7/G8 Semver 단독 javac/java
dev-sentinel-vs-release=-1
dev-sentinel-vs-future-release=-1
dev-sentinel-registerable=false
SEMVER_G7_PROBE_EXIT=0
SEMVER_G7_PROBE_CLEANED=True

clients/desktop: npm run typecheck
tsc -p tsconfig.node.json --noEmit && tsc -p tsconfig.web.json --noEmit

clients/desktop: npm run test:round-910-contract
ℹ tests 5
ℹ pass 5
ℹ fail 0

clients/desktop: npx playwright test version-management-v1b
6 passed (13.6s)

clients/mobile: versionCheck.test.ts
Test Suites: 1 passed, Tests: 7 passed
clients/mobile-staff: npx jest --runInBand
Test Suites: 2 passed, Tests: 8 passed
clients/arologis-mobile: npx jest --runInBand
Test Suites: 8 passed, Tests: 30 passed

dashboard-service F-3 targeted IT
process exit 0

Semver 단독 UTF-8 javac/java
same-day-2<same-day-10=true
future-vs-latest=1
legacy-semver=-1
injected-format=valid
SEMVER_PROBE_EXIT=0
SEMVER_PROBE_CLEANED=True

Electron 주입/무주입 대조
VITE_APP_VERSION=2026/07/25-91002: INJECTED_BUILD_EXIT=0, out/renderer/assets/index-fP5v-JQR.js에서 주입 문자열 확인
EXPO_PUBLIC_APP_VERSION=2026/07/25-91002: INJECTED_EXPO_CONFIG_EXIT=0, extra.appVersion 확인
```

Vitest의 updater 오류 stack trace는 기존 테스트가 의도적으로 원문 로그를 발생시키는 경로이며,
사용자 화면에는 고정 한국어 메시지만 노출된다.

### 11-4. 변경 파일과 Flyway 근거

이번 라운드 변경 파일:

```text
scripts/app-build-version.cjs
scripts/app-build-version.test.cjs
services/dashboard-service/src/main/java/com/samhanair/logis/dashboard/service/AppReleaseService.java
services/dashboard-service/src/test/java/com/samhanair/logis/dashboard/it/AppReleaseControllerIT.java
services/dashboard-service/README.md
clients/desktop/src/renderer/version/versionCheck.ts
clients/desktop/src/renderer/version/versionCheck.test.ts
clients/desktop/src/renderer/components/common/AppVersionGate.tsx
clients/desktop/src/renderer/components/common/AppVersionGate.test.tsx
clients/desktop/src/renderer/api/appVersion.ts
clients/desktop/src/renderer/api/appVersion.test.ts
clients/desktop/scripts/round-910-contract.test.cjs
clients/desktop/playwright/version-management-v1b/version-management-v1b.spec.ts
clients/mobile/src/version/versionCheck.ts
clients/mobile/src/__tests__/version/versionCheck.test.ts
clients/mobile-staff/src/version/versionCheck.ts
clients/mobile-staff/src/__tests__/version/versionCheck.test.ts
clients/arologis-mobile/src/version/versionCheck.ts
clients/arologis-mobile/src/__tests__/version/versionCheck.test.ts
docs/dev-reports/2026-07-25-910-app-client-identity.md
```

Flyway 신규 파일은 없다. 적용된 `V1`~`V7`은 수정하지 않았고, 번호 충돌을 만들 `V8`도 추가하지
않았다. F-3은 기존 `client_type` 조회 계층의 alias로 해결해 DB schema 변경이 필요 없다.

### 11-5. 미실행·잔여 의심 사항

- `npm run typecheck`, 전체 Desktop Vitest, 전체 Playwright, `npx electron-vite build`의
  주입/무주입 대조, 모바일 3앱 전체 Jest, Semver 단독 javac/java 판정표까지 완료했다.
- 일반 CI 명령인 Desktop 3개 빌드와 아로로지스 Expo config의 무주입 실행도 완료했다.
- 실제 관리자 로그인 U-gate와 #909 live QA 5-spec은 공유 `dashboard_db` write 규칙 때문에
  실행하지 않았다. 이번 라운드에는 Flyway를 적용하지 않았고 공유 `dashboard_db`에 접근하지
  않았으며, F-3 IT는 Testcontainers 임시 PostgreSQL 수명주기 안에서만 실행됐다.
- Web/Capacitor의 `location.reload()`는 현재 배포된 웹/Capacitor 자산을 다시 읽는 실제 동작이다.
  해당 런타임 산출물이 아직 배포되지 않았다면 새 버전을 즉시 만들 수 없으므로, 운영 배포 순서는
  `DESKTOP` 정책과 각 산출물 배포를 함께 맞춰야 한다. 이는 UI가 동작하지 않는 화면에 가두는
  문제는 해결하지만, 배포 순서 자체를 자동화하지는 않는다.
- 전체 회귀에는 기존 React Router 경고와 의도적으로 updater 원문을 stderr에 남기는 테스트가
  있으나, 테스트 실패는 없었다.

## 12. 2026-07-25 PM 재지적 G7/G8 보완

### 12-1. RED 원문

무주입 일반 경로가 릴리스 주입을 강제하던 기준선에서 다음과 같이 실패했다.

```text
clients/desktop: npm run build
EXIT=1
Error: VITE_APP_VERSION에 YYYY/MM/DD-{번호} 형식의 릴리스 버전을 명시적으로 주입해야 합니다.

clients/desktop: npm run build:web
EXIT=1
Error: VITE_APP_VERSION에 YYYY/MM/DD-{번호} 형식의 릴리스 버전을 명시적으로 주입해야 합니다.

clients/desktop: npm run build:capacitor
EXIT=1
Error: VITE_APP_VERSION에 YYYY/MM/DD-{번호} 형식의 릴리스 버전을 명시적으로 주입해야 합니다.

clients/arologis-mobile: npx expo config --type public
EXIT=1
EXPO_PUBLIC_APP_VERSION에 YYYY/MM/DD-{번호} 형식의 릴리스 버전을 명시적으로 주입해야 합니다.

clients/desktop: npm run dev
EXIT=1
error during start dev server and electron app:
Error: VITE_APP_VERSION에 YYYY/MM/DD-{번호} 형식의 릴리스 버전을 명시적으로 주입해야 합니다.
```

TDD sentinel 테스트도 기준선에서는 다음과 같이 실패했다.

```text
✖ 무주입 개발·CI 빌드는 릴리스가 아닌 고정 sentinel을 사용한다
Error: VITE_APP_VERSION에 YYYY/MM/DD-{번호} 형식의 릴리스 버전을 명시적으로 주입해야 합니다.
```

### 12-2. 수정 및 G7/G8 긴장 해소

`scripts/app-build-version.cjs`에 개발/CI 전용 `0.1.0-dev` sentinel을 추가했다. 이 값은
호스트 날짜·시계에서 파생되지 않으며, `Semver.compare('0.1.0-dev', '2026/07/25-10')`이
항상 음수다. 서버 신규 릴리스 등록 형식도 아니므로 두 무주입 산출물이 같은 sentinel을
보고해도 각각 정식 배포 가능한 릴리스처럼 보이지 않는다.

`SAMHAN_RELEASE_BUILD=1` 또는 `BUILD_ENV=production|preview`에서는 sentinel fallback을
금지하고 `VITE_APP_VERSION`/`EXPO_PUBLIC_APP_VERSION` 명시 주입을 강제한다. 따라서 일반
clone/CI 경로는 동작하고, 정식 릴리스 경로는 F-1/F-2의 자동 날짜·일련번호 문제를 재도입하지
않는다. Desktop mock의 독립 `0.0.0` fallback도 `0.1.0-dev`로 교체했다.

### 12-3. GREEN 원문

```text
node --test scripts/app-build-version.test.cjs
ℹ tests 4
ℹ pass 4
ℹ fail 0

무주입 실제 경로
npm run build                         exit 0
npm run build:web                     exit 0
npm run build:capacitor               exit 0
npx expo config --type public         exit 0

Electron/Web/Capacitor artifact scan
out/renderer/assets       sentinel=True zeroLiteral=False
dist/web/assets           sentinel=True zeroLiteral=False
dist/capacitor/assets     sentinel=True zeroLiteral=False

Semver G7/G8 probe
dev-sentinel-vs-release=-1
dev-sentinel-vs-future-release=-1
dev-sentinel-registerable=false
SEMVER_G7_PROBE_EXIT=0
SEMVER_G7_PROBE_CLEANED=True

주입 경로
VITE_APP_VERSION=2026/07/25-91002  INJECTED_BUILD_EXIT=0
EXPO_PUBLIC_APP_VERSION=2026/07/25-91002  INJECTED_EXPO_CONFIG_EXIT=0
```

CI workflow는 수정하지 않았으며, `git diff --name-only -- .github/workflows` 출력은 비어 있다.
따라서 이번 보완에는 PyYAML workflow 파싱이 필요하지 않다.

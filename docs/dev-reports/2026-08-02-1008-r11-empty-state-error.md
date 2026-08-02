# PR #1058 / 이슈 #1008 R11 — 일마감 상세 빈 상태 오류 결함 확인

- 조사일: 2026-08-03 KST
- 대상 브랜치/HEAD: `feat/1008-daily-closing` / `139fc0b6b`
- 비교 기준: `origin/main` / merge-base `2460e3cf6`
- 데이터 출처: 로컬 공유 PostgreSQL **`[DEV-SEED]`**. 아래 수치는 실운영 데이터가 아니다.
- 제약 준수: 코드 수정·commit·push·checkout·DB write/DDL·Docker 이미지 재빌드·합성 데이터 모두 없음.

## 0. 결론

| 질문 | 판정 |
|---|---|
| 1. 결함인가 | **제시된 현상은 “무이력 날짜의 빈 상태 처리 결함”이 아니다.** 빨간 박스 자체는 당시 상세 GET이 실패한 실제 오류 표시지만, 원인은 무이력 0건이 아니라 standalone QA에서 `auth-service`가 발견되지 않아 상세 권한 조회가 fail-closed 된 것이다. |
| 2. 날짜별 차이 원인 | 두 캡처는 같은 날짜 분기 실험이 아니라 **서로 다른 QA 런타임**의 결과다. `2020-01-02` 상세는 정상 200이었고, `2026-07-27` 상세는 서비스 로직 진입 전에 권한 조회가 실패했다. 2026-07-27에 원천 세금계산서가 있어 후속 품목 경로가 열리는 코드 차이도 있으나, 당시 캡처 오류의 직접 원인은 아니다. |
| 3. PR 귀속 | **PR #1058이 만든 현상 아님.** 오류 배너·상세 GET·권한 가드는 모두 `origin/main...HEAD` 무변경이며 5월 기존 코드다. 당시 장애는 QA 토폴로지의 `auth-service` 미주입이다. |
| 4. 빈도/도달성 | `[DEV-SEED]` 원천 활동일 12일 중 마감 이력 보유일은 0일: **무이력 12/12 = 100%**. 그러나 의존성을 정상 연결한 PR jar에서 같은 12일 상세 GET은 **12/12 HTTP 200, 오류 0/12 = 0%**였다. 즉 무이력 날짜 선택은 매우 흔하지만, 그것만으로 빨간 오류에 도달하지 않는다. |

## 1. 질문 1 — 이것이 결함인가

### 판정

**아니다. 적어도 PM이 제시한 두 캡처는 “데이터 없음이 오류로 잘못 분류된다”는 결함을 증명하지 않는다.**

화면에는 서로 독립된 두 query가 있다.

1. 마감 이력 목록은 `GET /accounting/daily-closings` 결과를 표시한다. 서버는 `daily_closings`를 조회해 페이지를 만들고(`DailyClosingService.java:259-269`), 0행이면 FE가 `해당 일자의 일마감 이력이 없습니다.`를 표시한다(`DailyClosingPage.tsx:1030-1031`).
2. 상세는 마감 이력 존재 여부와 무관한 별도 `GET /accounting/closings/daily`다(`closingApi.ts:232-241`, `AccountingReportController.java:199-208`). 이 요청이 실패하면 빨간 오류 배너, 200 + 빈 배열이면 정상 빈 상태를 표시한다(`DailyClosingPage.tsx:1124-1137`).

따라서 같은 화면에서 “목록 0행 + 상세 오류”가 함께 보일 수는 있다. 하지만 그것은 목록의 0행을 오류로 바꾼 것이 아니라 **별도 상세 요청이 실패했다는 뜻**이다.

당시 standalone 로그에는 상세 권한 `accounting.reports:VIEW` 확인 중 다음 순서가 남아 있다.

- `RoundRobinLoadBalancer: No servers available for service: auth-service`
- `DefaultDynamicPermissionClient: accountId=… pageCode=accounting.reports action=VIEW error=No instances available for auth-service`
- 이 client는 예외 시 `false`를 반환한다(`DefaultDynamicPermissionClient.java:68-95`).
- 권한 aspect는 `false`를 `account permission missing` 403으로 거부한다(`PermissionAspect.java:187-204`).

즉 상세 서비스의 날짜/전표 로직에 들어가기 전에 막혔다. 빨간 오류 배너는 이 실패를 표시한 것이므로, 해당 시점에는 정상 빈 상태로 바꾸면 안 된다.

## 2. 질문 2 — 왜 날짜에 따라 다르게 보였는가

### 2.1 직접 원인: 날짜가 아니라 QA 런타임 차이

두 파일의 생성 시각과 실행 보고서가 다르다.

- `재실시-09-DEV-SEED-일마감-상세화면.png`: 2026-08-02 23:31, 라이브QA 2차. `2020-01-02` 상세 200 후 `상세 전표가 없습니다.` 정상 표시.
- `3차-02-일마감-2026-07-27-상세.png`: 2026-08-03 00:36, 라이브QA 3차의 새 standalone 프로세스. 00:21 최초 상세 요청 시 `auth-service` 미발견으로 권한 확인 실패.

00:35~00:36 로그에는 `accounting.daily-closing` 목록 권한 재조회만 있고 상세 재호출은 없다. FE query key는 날짜·구분·원천으로 캐시된다(`DailyClosingPage.tsx:474-483`). 따라서 00:21에 만들어진 `detailQuery.isError` 상태가 남아 00:36 캡처의 배너 분기로 렌더됐다(`DailyClosingPage.tsx:1128-1129`).

### 2.2 코드상 실제 데이터 분기: 원천 0건과 1건

날짜별 데이터 경로 차이는 별도로 존재한다.

- `2020-01-02`: `daily_closings`에는 0건짜리 이력 2행이 있지만 ISSUED 원천 세금계산서는 0건이다. 상세 서비스의 `issued`와 `byModel`이 비어 외부 품목 확장 없이 빈 DTO를 반환한다(`MonthEndCloseService.java:206-254`).
- `2026-07-27`: 마감 이력은 0행이지만 ISSUED 세금계산서 1건/라인 1건이 있다. `byModel`이 채워져 거래처·품목·단가·DC 재검증 경로로 들어간다(`MonthEndCloseService.java:217-244,405-455`). PR #1058은 여기에 세트 구성품 카탈로그 2종 조회를 추가했다(`MonthEndCloseService.java:550-556`).

그러나 **캡처 당시 로그에는 product/partner/dc-config 실패가 없고 auth 권한 실패만 있다.** 또한 의존성을 정상 연결해 현재 PR jar를 재호출하면 `2026-07-27`도 200이다. 데이터 분기는 “후속 호출 가능성”을 설명할 뿐, 이번 빨간 박스의 직접 원인은 아니다.

## 3. 질문 3 — PR #1058이 만든 것인가

### 최종 판정: 아니다

`git diff origin/main...HEAD`와 `git blame` 결과는 다음과 같다.

| 구성 | 귀속 근거 |
|---|---|
| FE 상세 query | `DailyClosingPage.tsx:474-483`, commit `57b3cc315d`(2026-05-20). PR diff 0. |
| FE 오류/빈 상태 분기 | `DailyClosingPage.tsx:1124-1137`, 오류 배너 commit `57b3cc315d`; 정상 빈 문구는 `8fec255e8f`. PR diff 0. |
| 상세 API client | `closingApi.ts:232-241`, 최초 commit `154f46e735`(2026-05-10). PR diff 0. |
| 상세 controller/권한 | `AccountingReportController.java:199-209`, endpoint commit `c48e156c5e`, 권한 가드 commit `80f4c00e09`. PR diff 0. |
| 권한 장애 fail-closed | `DefaultDynamicPermissionClient.java:68-95`, `PermissionAspect.java:187-204`. PR 변경면 아님. |

PR #1058이 실제로 바꾼 것은 옵션 정액/세트 매칭 재검증이다. `origin/main...HEAD`에서 `MonthEndCloseService`, `ProductClient`, `PartnerDcConfigClient` 등이 바뀌고, 원천 품목이 있는 경우 `resolveMatchedSetNames()` 및 구성품 카탈로그 호출이 추가됐다(`MonthEndCloseService.java:455,550-556`). 이는 별도의 신규 실패 표면이므로 향후 회귀 테스트 대상은 맞다. 다만 현재 정상 의존성에서 12개 활동일 전부 200이고, 당시 로그의 실패 지점도 그 호출보다 앞선 권한 gate다. **그러므로 이 캡처 오류를 PR #1058 결함으로 귀속할 근거가 없다.**

## 4. 질문 4 — 사용자가 얼마나 자주 만나는가

### 4.1 무이력 날짜 비율 — `[DEV-SEED]`

읽기 전용 transaction에서 활성 원천일과 마감일을 집계했다.

| 모집단 | 무이력 | 비율 |
|---|---:|---:|
| ISSUED 세금계산서가 있는 활동일 | 12 / 12일 | **100%** |
| 원천 활동 범위 `2026-04-05~2026-07-27`의 달력일 | 114 / 114일 | **100%** |
| 전체 `daily_closings` 고유 날짜 | `2020-01-02` 1일뿐 | 활동 기간과 겹침 0일 |
| 조사일 기본 날짜 `2026-08-03` | 마감 이력 없음 | 해당 |

따라서 개발 시드에서는 사용자가 무이력 날짜를 고르는 것이 예외가 아니라 사실상 기본 동작이다. 단, 이 수치는 **실운영 데이터가 아니라 `[DEV-SEED]`**다.

### 4.2 빨간 오류 도달률 — 정상 의존성의 현재 PR jar

Flyway와 Hibernate DDL을 모두 끄고, 브랜치 기존 jar를 `127.0.0.1:18187`에 standalone으로 띄웠다. auth/product/partner/dc-config를 각 공유 서비스의 별도 호스트 포트로 연결한 뒤, 위 12개 활동일을 `dev_accountant` 권한으로 모두 읽기 전용 GET했다.

- HTTP 200: **12/12**
- 오류: **0/12 (0%)**
- 비교: 현재 `origin/main` 공유 accounting-service도 `2020-01-02`, `2026-07-27` 모두 200.

결론적으로 실사용자가 **무이력 날짜**는 매우 자주 만나지만, 정상 배포 토폴로지에서는 그것 때문에 **빨간 오류**를 만나지 않는다. `auth-service`가 실제로 미발견이면 이 상세뿐 아니라 동적 권한으로 보호된 여러 화면이 fail-closed 되므로, 그 도달성은 날짜/마감 이력 문제가 아니라 서비스 발견 장애의 범위로 봐야 한다.

## 5. 화면 증거

### 오류 화면

- `docs/qa/1008-daily-closing-real-qa/3차-02-일마감-2026-07-27-상세.png`
  - `[DEV-SEED]`, 조회일 `2026-07-27`.
  - 목록은 `해당 일자의 일마감 이력이 없습니다.`.
  - 상세는 `Daily Detail을 불러오지 못했습니다.`.
  - 이 PNG는 화면에 오류가 표시됐다는 증거다. 오류 원인은 당시 standalone 로그로 별도 특정했다.

### 정상 빈 상태 화면

- `docs/qa/1008-daily-closing-real-qa/재실시-09-DEV-SEED-일마감-상세화면.png`
  - `[DEV-SEED]`, 조회일 `2020-01-02`.
  - 상세가 `상세 전표가 없습니다.`로 정상 렌더된다.

JSON·터미널 출력은 화면 증거로 사용하지 않았다. API status와 DB 집계는 원인·도달성 진단 근거로만 사용했다.

새 `오류확인-` PNG를 만들기 위해 브랜치 standalone `18187`과 renderer `5199`를 별도 포트로 준비했으나, 이 세션의 in-app Browser 런타임에 사용 가능한 브라우저가 0개여서 새 화면 캡처는 만들지 못했다. 기존 화면 증거를 복사하거나 합성하지 않았다.

## 6. 새 파일 경로 목록

- `docs/dev-reports/2026-08-02-1008-r11-empty-state-error.md`


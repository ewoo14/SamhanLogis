# 2026-08-02 #1009 견적서 메뉴 · 머지 직전 재수렴

## 확인 1 — 작업 위치·브랜치·쓰기 경계

- 실 사용자 경로 재현 여부: 해당 없음(검증 환경 확인).
- 명령: `git branch --show-current; git status --short; git log --oneline -20`
- 출력 원문:

```text
feat/1009-estimate-parity
?? docs/dev-reports/2026-08-02-1009-reconvergence.md
951bebad1 [FIX] #1009 QA 캡처 목적지를 resolveQaShotsDir 경유로 — 하네스 가드 G3a
e7ff4c22e [QA] #1009 라이브QA 2차 — 작성자·수정 PUT 실서버 확인
6e216d4cf [FIX] #1009 저장 작성자를 인증 세션 기준으로 — 서버 기본값·쿼리 위조 차단
f8c22fdaf [QA] #1009 저장 종단 라이브QA — 저장 성공 · 작성자가 서버 기본값
51112b9dc Merge remote-tracking branch 'origin/main' into feat/1009-estimate-parity
59013fca8 [FIX] #1009 CSP 가 막던 inline 이벤트 배선 128개 — addEventListener 전환
37133fd3b [QA] #1009 견적서 메뉴 라이브QA — 견적저장·저장내역 버튼이 클릭으로 동작하지 않는다
6aa60553c [FIX] #1009 VAT 별도 금액·자동 빈행·작성자 집합·수정 화면 — 적대검증 4건
1ad56d046 docs(review): #1009 1차 적대검증 — BLOCK 4건
169ebaac7 [FEAT] #1009 견적서 메뉴 — base64 제거·JSONB 저장·작성자 권한
```

- 판정: 요청문에 적힌 브랜치 `feat/1009-gas-estimate-inherit`와 실제 브랜치 `feat/1009-estimate-parity`가 불일치한다. 이후 판정은 실제 HEAD `951bebad1` 기준이다.
- 영향 건수: 검증 기준 브랜치 불일치 1건. 사용자 데이터 영향은 해당 없음.

## 확인 2 — 인앱 브라우저 도달성

- 실 사용자 경로 재현 여부: 미재현. 연결 가능한 브라우저가 없어 실제 화면 클릭·시각 표시를 직접 측정하지 못했다.
- 실행: Browser 런타임에서 `http://localhost:5183/?email=dev_master@samhan-air.com` 대상 브라우저 선택.
- 출력 원문:

```text
No browser is available
```

- 판정: 이후 실제 동작은 저장소 Playwright/HTTP 하네스와 정적 DOM 전수검사로 검증한다. 실제 인앱 브라우저 클릭은 이번 라운드가 보지 않은 축이다.
- 영향 건수: 측정 불가 1개 축. 사용자 데이터 영향 건수는 산정 불가.

## 확인 3 — 라이브 환경·CSP·승인 계정 2개

- 실 사용자 경로 재현 여부: 재현. 승인 이메일로 신규 진입 시 HTTP 200과 인증 쿠키 발급을 확인했다.
- 명령: `GET /healthz`, `GET /?email=dev_master@samhan-air.com`, `POST /rpc/getAllManagers`, 두 이메일에 대한 `POST /rpc/checkUserAuth`.
- 출력 원문(쿠키 값은 의도적으로 출력하지 않음):

```text
{"HEALTH_OK":true,"ENTRY_STATUS":200,"CSP_SCRIPT_SRC_ATTR_NONE":true,"COOKIE_HTTPONLY":true,"COOKIE_SAMESITE_LAX":true}
EMAIL=dev_master@samhan-air.com RESULT={"ok":true,"result":{"authorized":true,"managerName":"[DEV-SEED] 개발마스터","managerCode":"dev_master","ecountId":"","ecountApi":""}}
EMAIL=dev_manager@samhan-air.com RESULT={"ok":true,"result":{"authorized":true,"managerName":"[DEV-SEED] 개발매니저","managerCode":"dev_manager","ecountId":"","ecountApi":""}}
```

- `POST /rpc/getAllManagers`는 승인 목록 24명을 반환했으나 이메일 필드를 주지 않는다. 따라서 이메일별 승인 여부는 `checkUserAuth`로 교차 확인했다.
- 판정: 검증용 승인 계정 2개 확보. CSP는 실제 `script-src-attr 'none'`이므로 남은 inline 속성은 재배선되지 않으면 동작하지 않는 환경이다.
- 영향 건수: 승인 계정 2개, 관리자 이름 목록 24건.

## 확인 4 — 무쿠키·타인 조회/수정·쿠키 조작

- 실 사용자 경로 재현 여부: 재현.
  - 쿠키 없음/만료 상당 상태: 저장 내역 조회는 200, 저장은 401.
  - `dev_manager@samhan-air.com` 세션: `dev_master@samhan-air.com` 작성 견적 조회 가능, 수정은 403.
  - 유효한 개발매니저 쿠키의 이메일 payload만 개발마스터로 바꾸고 서명은 그대로 둔 조작 쿠키: 저장 401.
- 재현 명령: `POST /rpc/getQuoteHistory`, `POST /rpc/saveQuoteSnapshot`; 승인 계정별 신규 세션을 만든 뒤 타인 행의 식별자는 메모리 안에서만 사용했다. 보고서·출력에는 식별자를 노출하지 않았다.
- 출력 원문:

```text
{"ANON_HISTORY_STATUS":200,"ANON_HISTORY_ROWS":1,"ANON_SAVE_STATUS":401,"MANAGER_HISTORY_ROWS":1,"MANAGER_SEES_MASTER_ROWS":1,"CROSS_ACCOUNT_UPDATE_STATUS":403,"TAMPERED_COOKIE_SAVE_STATUS":401,"TARGET_AUTHOR":"dev_master@samhan-air.com","TARGET_PARTICIPANT_CONTAINS_AUTHOR":true}
```

- 판정:
  - 조회까지 막히는 회귀 없음. 인증 쿠키가 없으면 저장만 차단된다.
  - 타인 견적 조회는 허용되고 타인 수정은 실제 403이다.
  - 작성자는 `participant_emails` 집합에 포함된다.
  - 쿠키 payload 조작으로 남의 이름 저장 경계에 진입하지 못한다.
- 영향 건수: 라이브 견적 1건 조회, 타인 조회 가능 1건, 타인 수정 차단 1건, 쿠키 조작 차단 1건. 성공 쓰기 0건.

## 확인 5 — CSP inline 이벤트·동적 HTML 전수

- 실 사용자 경로 재현 여부: 재현. 승인 화면 렌더, 동적 사용자 정의 행 입력, 저장내역 복원 버튼 렌더, 별도 동적 버튼 클릭을 실행했다. 저장·발행 네트워크 쓰기는 호출하지 않았다.
- 소스 전수 명령: `index.ejs` 전체에 `(?<![\w.])on(?<event>[a-z]+)\s*=` 정규식을 적용하고 이벤트별 집계. `node_modules`, 문서, 프로퍼티 할당(`element.onclick = ...`)은 제외했다.
- 소스 전수 출력 원문:

```text
INLINE_ATTRIBUTE_SOURCE_TOTAL=109
change=16
click=64
focus=20
input=8
keydown=1
UNSUPPORTED_INLINE_ATTRIBUTE_TOTAL=0
```

- 라이브 렌더·동적 사용자 행 출력 원문:

```text
{"status":200,"scriptSrcAttrNone":true,"initial":{"elements":38678,"inlineAttrs":0,"sample":[]},"snapshot":{"inlineAttrs":0,"restoreButton":false,"restoreCalled":0},"custom":{"before":1,"after":2,"inlineAttrs":0,"subtotal":"2,000"},"cspViolations":0,"pageErrors":0,"pageErrorSample":[]}
```

  첫 실행의 합성 저장내역 버튼 탐색은 실제 저장내역 비동기 렌더와 경합해 `restoreButton:false`였으므로 이 값은 통과 근거로 쓰지 않았다. 렌더 결과를 분리 재실행한 원문은 다음과 같다.

```text
{"root":true,"html":"...<button class=\"btn\" ... data-cspclick-bound=\"true\">복원</button>...","buttons":[{"text":"복원","onclick":null,"bound":"true"}]}
```

- MutationObserver 동적 추가·클릭 출력 원문:

```text
{"before":{"onclick":null,"bound":"true"},"called":1,"cspViolations":0}
```

- 판정:
  - 소스의 inline 이벤트 속성 109개 전부가 재배선 지원 이벤트 집합에 속한다.
  - 초기 렌더 38,678개 요소와 동적으로 만든 사용자 행에서 잔존 inline 이벤트 속성은 0개다.
  - `innerHTML`로 생성되는 복원 버튼은 `onclick`이 제거되고 click 리스너가 붙는다.
  - 동적 버튼은 실제 클릭 호출 1회, CSP 위반 0회다.
  - 사용자 정의 행 입력은 1→2행 자동 빈행 생성, 소계 2,000으로 계산됐다.
- 영향 건수: 검사한 소스 inline 속성 109개, 라이브 DOM 요소 38,678개, 잔존/미지원 속성 0개, CSP 위반 0건.

## 확인 6 — 쿠키 제거 후 계산·견적서·발행 경계

- 실 사용자 경로 재현 여부: 재현. 승인 진입 후 브라우저 쿠키를 제거하고 사용자 정의 품목 2개×1,000원을 입력한 뒤 견적서와 전송목록 화면을 열었다.
- 실 DB 쓰기 방지: 실제 전표 발행 대신 별도 메모리 내 Express 인스턴스에서 `sendOrderFromUi`만 stub으로 교체했다. 제품 파일은 수정하지 않았고 공유 Docker/DB에는 요청하지 않았다.
- 출력 원문:

```text
{"subtotal":"2,000","previewActive":true,"finalActive":true,"finalRows":1,"cookieAfterClear":""}
{"PUBLISH_STATUS":200,"PUBLISH_CALLS":1,"SAVE_STATUS":401,"SAVE_CALLS":0}
```

- 판정:
  - 쿠키가 제거된 열린 화면에서 계산, 견적서 렌더, 전송목록 생성은 막히지 않는다.
  - 무쿠키 발행 RPC는 라우터에서 차단되지 않고 실제 함수 경계까지 1회 도달한다.
  - 무쿠키 저장 RPC만 401이며 저장 함수는 호출조차 되지 않는다.
- 영향 건수: 계산 1경로, 견적서 1경로, 전송목록 1행, 발행 라우터 1회. 성공 DB 쓰기 0건.

## 확인 7 — V60·V61·V100 공존과 실 DB 금액·JSONB

- 실 사용자 경로 재현 여부: 기존 PM 저장→복원 버튼→재저장 경로가 만든 행을 실 DB에서 재조회. 이번 라운드는 실 DB 쓰기를 하지 않았다.
- 재현 명령: `docker exec samhan-postgres psql ...` 안에서 `BEGIN TRANSACTION READ ONLY`로 Flyway 이력, `quote_snapshots`, JSONB 사용자 정의 행을 조회했다. 식별자 컬럼은 선택하지 않았다.
- 출력 원문:

```text
 installed_rank | version |                description                 | success
----------------+---------+--------------------------------------------+---------
             60 | 60      | preserve sales category axis               | t
             61 | 61      | correct partner order vat overcharge       | t
             62 | 100     | normalize quote snapshot json owner totals | t

 total_rows | active_rows
------------+-------------
          1 |           1

        cust_name        |       author_email        |      participant_emails       | supply_amount | vat_amount | total_amount | totals_consistent | was_updated | state_type
-------------------------+---------------------------+-------------------------------+---------------+------------+--------------+-------------------+-------------+-----------
 QA 견적 수정 2026-08-02 | dev_master@samhan-air.com | ["dev_master@samhan-air.com"] |    2929300.00 |  292930.00 |   3222230.00 | t                 | t           | object

 stored_custom_rows | blank_custom_rows
--------------------+-------------------
                  1 |                 0
```

- 판정:
  - V60·V61·V100 순서/적용 성공. 버전 충돌 없음.
  - 작성자는 서버 기본값이 아닌 인증 사용자이며 대상자 집합에 포함된다.
  - 실 DB 세 금액은 `2,929,300 + 292,930 = 3,222,230`으로 일치한다.
  - 저장된 사용자 정의 행 1개 중 빈행은 0개다.
  - 활성 snapshot 행은 1건이고 `created_at <> modified_at`이므로 PM의 복원 버튼→재저장은 INSERT가 아니라 UPDATE였다.
- 영향 건수: Flyway 3개 버전, 활성 견적 1건, 사용자 정의 행 1건, 빈행 0건, 금액 불일치 0건.

## 확인 8 — VAT 별도 화면 소계와 저장 payload

- 실 사용자 경로 재현 여부: 재현. 승인 화면에서 사용자 정의 품목 `2 × 1,000`, `VAT 별도`를 선택하고 저장 함수를 실행했다.
- 실 DB 쓰기 방지: Playwright가 `/rpc/saveQuoteSnapshot` 요청을 가로채 합성 성공 응답을 반환했다. 실제 estimate/slip 서비스에는 저장 요청이 도달하지 않았다.
- 출력 원문:

```text
{"screen":{"screenTotal":2000,"subtotal":"2,000","vatMode":"exc"},"captured":true,"persisted":{"supplyAmount":2000,"vatAmount":200,"totalAmount":2200},"matches":true}
```

- 판정: VAT 별도 견적의 화면 소계 2,000원 = 공급가 2,000원, 부가세 200원, 총액 2,200원이며 저장 payload와 일치한다.
- 영향 건수: VAT 별도 1경로, 금액 불일치 0건, 성공 DB 쓰기 0건.

## 확인 9 — 숫자 재현

- 실 사용자 경로 재현 여부: 해당 없음(자동 검증 수치).
- estimate-app 명령: `npm test -- --runInBand; npm run typecheck`.
- 출력 원문:

```text
Test Suites: 11 passed, 11 total
Tests:       186 passed, 186 total
Snapshots:   0 total
typecheck OK: 16 JavaScript files
```

- slip-service 최초 명령: `.\gradlew.bat :services:slip-service:test --no-daemon --console=plain`.

```text
> Task :services:slip-service:test UP-TO-DATE
BUILD SUCCESSFUL in 14s
18 actionable tasks: 18 up-to-date
```

  위 결과는 본문 재실행이 아니므로 통과 수치 근거로 쓰지 않았다. 이어서 `.\gradlew.bat :services:slip-service:test --rerun-tasks --no-daemon --console=plain`을 실행했다.

```text
> Task :services:slip-service:test
BUILD SUCCESSFUL in 8m 51s
18 actionable tasks: 18 executed
```

- fresh JUnit XML 206개 첫 `<testsuite>` 속성 집계 원문:

```text
{"XML_FILES":206,"PARSE_FAILURES":0,"TESTS":1540,"FAILURES":0,"ERRORS":0,"SKIPPED":0,"LATEST_WRITE":"2026-08-02 02:27:52"}
```

- 판정:
  - estimate-app `186/186`, typecheck 16파일은 재현됐다.
  - slip-service failures/errors 0과 BUILD SUCCESSFUL은 재현됐다.
  - 요청 수치 `1,511 tests`는 현재 HEAD에서 재현되지 않았다. fresh 실제 수치는 `1,540 tests`로 29건 많다. 사용자 경로 차단 영향은 0건이나, 요청된 숫자 불일치이므로 보고한다.
- 영향 건수: 테스트 수치 차이 +29건, 테스트 실패 0건.

## 최종 판정

**사용자 도달 가능 BLOCK 결함 0건.** 다섯 fix 표면과 origin/main 병합 표면에서 다음을 확인했다.

| 축 | 판정 | 근거 |
|---|---|---|
| 쿠키 없음/만료 상당 상태 | PASS | 조회 200, 계산·견적서·전송목록 도달, 발행 RPC 라우터 200, 저장만 401 |
| inline 이벤트 재배선 | PASS | 소스 109개 전수 지원, 초기 DOM 38,678요소 잔존 0, 동적 행/버튼 잔존 0, CSP 위반 0 |
| 작성자·권한 | PASS | 승인 계정 2개, 타인 조회 1건, 타인 수정 403, 쿠키 조작 401, 작성자 집합 포함 |
| 금액·저장 | PASS | VAT 별도 2,000/200/2,200 일치, 실 DB 빈행 0, 기존 1행 UPDATE 확인 |
| V60·V61·V100 | PASS | Flyway 세 버전 순차 성공 적용 |
| 숫자 재현 | PARTIAL | estimate-app 186/186·typecheck 통과, slip-service 성공/실패 0이나 요청 1,511 대신 현재 1,540 |

### 도달성 0이지만 보고하는 불일치

1. 요청 브랜치명은 `feat/1009-gas-estimate-inherit`이나 실제 브랜치는 `feat/1009-estimate-parity`다. 이후 검증은 HEAD `951bebad1` 기준이다.
2. slip-service 요청 수치 `1,511 tests`는 fresh 재현되지 않았다. 현재 HEAD는 `1,540 tests / failures 0 / errors 0`이다. 사용자 경로 영향 0건.

## 이번 라운드가 보지 않은 축

- 인앱 브라우저가 없어 해당 브라우저의 실제 수동 클릭·시각 상태는 보지 않았다. 저장소 Playwright Chromium으로 대체했다.
- 실 DB 쓰기 금지에 따라 실제 신규 저장 성공, 본인 UPDATE 성공, 실제 전표 발행 성공은 반복하지 않았다. 신규 저장은 요청 intercept, 발행은 메모리 stub, UPDATE는 PM 기존 1행을 읽기 재검증했다.
- 쿠키의 실제 시간 만료까지 기다리지 않았다. 무쿠키 HTTP 요청과 브라우저 쿠키 삭제로 동일한 서버 경계를 측정했다.
- 데이터 조건이 필요한 모든 희귀 `innerHTML` 분기를 하나씩 클릭하지는 않았다. 대신 현재 소스 inline 속성 109개를 전수 분류하고, 초기 대규모 DOM·동적 사용자 행·동적 복원 버튼·합성 동적 버튼에서 공통 MutationObserver 경계를 실행했다.
- V100 적용 전 실제 base64 과거 행이 없어 과거 행의 실데이터 변환·재오픈은 실행하지 않았다.
- V60·V61은 이미 적용된 실 DB 이력과 성공 상태만 읽었다. 실 데이터 정정 migration을 재적용하지 않았다.

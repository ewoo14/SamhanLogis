# PR #1124 S33 라이브 QA 재수렴

## 0. 환경 확인 — 판정에 사용한 실행물

검증 시각은 2026-08-09 01:03~01:10 KST, 작업 디렉터리는
`C:\dev\Samhan-Public\.claude\worktrees\t1123`이다. 제품 코드, 기존 전표,
DB row를 직접 변경하지 않았다. `git commit/push`도 실행하지 않았다.

| 항목 | 직접 측정값 | 판정 |
|---|---|---|
| branch / HEAD | `feat/1123-closed-date-guard` / `3cb7f0daa67d5279a9f592f9c55577e735a57476` | PM 전제와 일치 |
| slip 컨테이너 **생성 시각** | 2026-08-09 00:56:11 KST, healthy | 일치 |
| slip 이미지 **생성 시각** | 2026-08-09 00:56:08.728 KST, `sha256:5418bf...` | 컨테이너 시각과 구분해 측정 |
| auth 컨테이너 / 이미지 생성 시각 | 2026-08-08 23:54:20 / 23:54:14.708 KST, healthy | 일치 |
| gateway 컨테이너 / 이미지 생성 시각 | 2026-08-08 22:31:53 / 22:31:45.808 KST, healthy | 일치 |
| slip health | `GET http://127.0.0.1:18086/actuator/health` → `200 {"status":"UP","groups":["liveness","readiness"]}` | PASS |
| gateway health | `GET http://127.0.0.1:8080/actuator/health` → `200 {"status":"UP"}` | PASS |
| 이 워크트리 프런트 | 이 경로의 `clients/desktop`, Vite 5.4.21, 앱 버전 `2026/08/09-11233` | PASS |
| 빈 포트 / strictPort | 시작 전 `51124` listener 0건. 기동 후 PID 87556, `vite.renderer.dev.config.ts --host 127.0.0.1 --port 51124 --strictPort` | PASS |
| 실 API / mock 여부 | 실 앱 네트워크에서 `http://127.0.0.1:8080/auth/login` 200, `/auth/admin/permissions/my` 200, `/slips?...` 200 확인. 하네스에 `page.route`/mock 없음 | PASS |

첫 기동은 앱 버전 `2026/08/09-1123-s33`의 문자 접미사가 버전 검증기에 거부되어 포트를 열기 전에 종료됐다. 형식에 맞는 숫자 버전으로 재기동했으며, 다른 프런트나 다른 워크트리를 재사용하지 않았다.

실 GUI 증거:

- `docs/qa/1123-s33-live-qa/screenshots/_local/01-real-app-login.png`
- `docs/qa/1123-s33-live-qa/screenshots/_local/02-real-app-master-home.png`
- `docs/qa/1123-s33-live-qa/screenshots/_local/03b-real-permission-ui-closed-date-filter.png`
- `docs/qa/1123-s33-live-qa/screenshots/_local/14-network-real-gateway.png`

`03b`에는 실제 MASTER 세션의 권한설정 화면에서 `마감일 예외 생성`, `마감 기준선 관리`, `출고 마감시간 설정`이 함께 보인다.

## 1. 발화 조건 카운트

모든 DB 수치는 `psql SELECT`만 사용했다. 시작 시 활성 기준선이 0건이어서 실 관리자 API로 S33 기준선 1건을 생성했고, 끝에 같은 API로 그 S33 기준선만 soft-delete했다. 최종 활성 기준선은 다시 0건이다.

| 조건 | 시작 전 | S33 발화 중 / 보충 수치 | 판정 |
|---|---:|---:|---|
| 활성 마감 baseline | 0 | OUTBOUND `2026-08-10` 1건을 실 POST로 생성 | 표본 생성 가능 |
| 활성 closing-date rule | 0 | 변경 없음 | baseline으로 발화 |
| 활성 baseline 이전 기존 활성 OUTBOUND 전표 | 0 (baseline 없음) | S33가 아닌 기존 row 380건이 `2026-08-10` 이전 | 실제 영향 표본 380건 |
| baseline 당일 기존 활성 OUTBOUND 전표 | 해당 없음 | S33가 아닌 기존 row 9건 | 열린 경계 대조군 |
| MASTER 활성 계정 | 3 | `dev_master` 실 로그인 200 / role MASTER | 가능 |
| ACCOUNTANT 활성 계정 | 7 | `dev_accountant` 실 로그인 200 / role ACCOUNTANT | 가능 |
| MANAGER 활성 계정 | 3 | `dev_manager` 실 로그인 200 / role MANAGER | 가능 |
| 권한 없는 대조 계정 | — | `dev_sales`와 `dev_accountant` 실 로그인 200 | 가능 |

기준선 실 API 원문:

```text
GET /admin/slip-closing-baselines
HTTP 200
{"success":true,"code":"OK","message":"성공","data":[]...}

POST /admin/slip-closing-baselines
HTTP 200
{"success":true,"code":"OK","message":"성공","data":{"id":"<UUID>","slipType":"OUTBOUND","slipTypeName":"출고전표","baselineDate":"2026-08-10","enabled":true}...}
```

캡처: `04-precondition-baseline-zero.png`, `05-create-baseline-real-api.png`.

공유 DB 잔재는 판정에서 제외했다. 예를 들어 `S26-1123-closed-five-combinations`는 `2026-08-08 21:51:16`, `dev_manager`; `S18-1123-date-change-ignored`는 `2026-08-08 19:28:31`, `dev_sales`가 만든 row다. `S18-*`, `S26-*`와 soft-delete된 `S26-1123-unguarded-delete-probe`를 기존 결함/신규 표본으로 다시 세지 않았다.

## 2. 시나리오 (a) — 막혀야 하는 경로

### 신규 생성

절차: 예외 권한이 없는 SALES로 baseline 이전 날짜 `2026-08-09` OUTBOUND 전표를 생성했다.

```text
POST /api/v1/slips
HTTP 409
{"success":false,"code":"CONFLICT","message":"마감된 날짜에는 신규 전표를 만들 수 없습니다.","data":null...}
```

캡처: `06-a-closed-create-blocked.png`.

### S27 mutation 실서버 호출

MASTER가 마감일에 새로 만든 `S33-master-closed-pass` 전표 하나만 대상으로, 예외 권한이 없는 SALES가 호출했다.

| # | 실제 사용자 API | HTTP | 응답 원문 |
|---:|---|---:|---|
| 1 | `PATCH /api/v1/slips/<S33>/header` | 409 | `{"success":false,"code":"CONFLICT","message":"마감된 날짜에는 신규 전표를 만들 수 없습니다.","data":null...}` |
| 2 | `PATCH /api/v1/slips/<S33>/driver` | 409 | 동일 |
| 3 | `PATCH /api/v1/slips/<S33>/v20` | 409 | 동일 |
| 4 | `POST /api/v1/slips/<S33>/lines` | 409 | 동일 |
| 5 | `DELETE /api/v1/slips/<S33>/lines/<S33-line>` | 409 | 동일 |
| 6 | `PATCH /api/v1/slips/<S33>/audit/overlay` | 409 | 동일 |
| 7 | `POST /api/v1/slips/<S33>/collab/edits` | 409 | 동일 |
| 8 | `DELETE /api/v1/slips/<S33>/sales` | 409 | 동일 |

캡처: `08-a-eight-mutations-blocked.png`. 전체 요청·응답 원문은 `evidence.json`의 `A1_HEADER`~`A8_USER_DELETE`에 있다.

정확한 경계: S27 문서가 별도로 센 `SlipService.softDelete()`는 현재 매핑된 controller/production caller가 없어 라이브 사용자가 호출할 표면이 없다. 위 8번은 실제 사용자 삭제 endpoint이며 `SalesSlipDeleteService` 경로다. 따라서 실제 사용자 삭제의 날짜 가드는 관측했지만, caller 0인 내부 `SlipService.softDelete()` 자체는 **관측 불가**로 남긴다.

DB 사후 SELECT에서 차단 메모(`S33-closed-normal-blocked`, `S33-accountant-forbidden`, `S33-cutoff-after-blocked`, `S33-blocked-*`, `S33-concurrency-stale-second`) row 합계는 **0건**이었다. 단순히 409만 받은 것이 아니라 저장되지 않았음을 확인했다.

판정: 도달 가능한 위 8개 실제 API에서 되면 안 되는 mutation은 발생하지 않았다.

## 3. 시나리오 (b) — 정상 경로와 MASTER 예외

### MASTER 마감 예외

```text
POST /api/v1/slips  (MASTER, 2026-08-09)
HTTP 201
{"success":true,"code":"OK","message":"성공","data":{"slipNo":"2026/08/09-13","slipDate":"2026-08-09","status":"DRAFT","memo":"S33-master-closed-pass"...}}
```

캡처: `07-b-master-closed-pass.png`. 확정 정책인 “MASTER는 회계 마감을 넘을 수 있음”이 실서버에서 성립했다.

### 열린 날짜 생성·수정·삭제

baseline 당일 `2026-08-10`은 strict-before 규칙상 열린 날짜다. SALES로 신규 생성 201 후 다음 결과를 얻었다.

```text
header PATCH 200
driver PATCH 200
v20 PATCH 200
line POST 201
line DELETE 204
overlay PATCH 200
collab edit POST 201
```

캡처: `09-b-open-mutations-pass.png`.

별도 S33 신규 전표를 상세 GET으로 재조회한 최신 `updatedAt`으로 실제 사용자 삭제를 호출했다.

```text
GET /api/v1/slips/<S33>                 HTTP 200
DELETE /api/v1/slips/<S33>/sales       HTTP 200
{"success":true,"code":"OK","message":"성공","data":null...}
```

캡처: `10-b-open-delete-pass.png`.

참고로 생성 응답의 `updatedAt`을 상세 재조회 없이 즉시 DELETE에 넣은 통제 요청은 409였다. 실제 desktop은 생성 성공 후 목록으로 이동하고 상세 화면에서 GET한 `slip.updatedAt`을 삭제에 사용한다. 그 실제 흐름과 같은 fresh GET 대조군은 200이므로 도달 결함으로 세지 않았다.

판정: 열린 날짜 정상 생성·수정·삭제가 모두 동작했다. baseline이 활성일 때 기존 실데이터 중 차단 대상은 380건, baseline 당일 열린 대조군은 9건이었다.

## 4. 시나리오 (c) — 권한 오류가 마감 409로 둔갑하지 않는가

ACCOUNTANT로 마감일 OUTBOUND 신규 생성을 호출했다.

```text
POST /api/v1/slips
HTTP 403
{"success":false,"code":"FORBIDDEN","message":"전표 변경 권한이 없습니다.","data":null...}
```

캡처: `11-c-forbidden-403.png`.

판정: 권한 검증이 날짜 가드보다 먼저 실행됐다. 409로 둔갑하지 않았다.

## 5. 시나리오 (d) — 출고 마감시각 게이트

실 DB 활성 설정은 `DAY=00:01`, `GYEONGDONG_PARCEL=15:00`이고 실행 시각은 01:08 KST였다. 같은 MASTER, 같은 당일 `2026-08-09`로 호출해 날짜 마감 권한 변수를 고정했다.

```text
DAY(00:01)
HTTP 409
{"success":false,"code":"CONFLICT","message":"당일 당일 마감(00:01) 초과 — 익일 출고로 생성하세요","data":null...}

GYEONGDONG_PARCEL(15:00)
HTTP 201
{"success":true,"code":"OK","message":"성공","data":{"slipDate":"2026-08-09","deliveryTag":"GYEONGDONG_PARCEL","memo":"S33-cutoff-before-pass"...}}
```

캡처: `12-d-cutoff-before-after.png`.

판정: 주입 Clock fix가 포함된 배포본에서 현재 KST 날짜·시각 기준 초과/이전 양쪽이 실서버에서 갈렸다.

## 6. 시나리오 (e) — 낙관적 잠금

열린 날짜 S33 전표를 만들고 동일한 최초 `updatedAt`으로 두 번 PUT했다.

```text
첫 PUT
HTTP 200
{"success":true,"code":"OK","message":"성공",..."memo":"S33-concurrency-first"...}

같은 updatedAt 재사용 PUT
HTTP 409
{"success":false,"code":"SLIP_OPTIMISTIC_LOCK_CONFLICT","message":"전표가 이미 변경되었습니다. 최신 내용으로 다시 확인해 주세요.","data":null...}
```

캡처: `13-e-optimistic-lock.png`.

판정: 두 번째 요청은 마감 `CONFLICT` 메시지가 아니라 전용 optimistic-lock code/message로 반환됐다.

## 7. 도달 가능한 결함 목록

**0건.** 이번 라운드가 실 gateway에서 도달한 생성, 7개 추가 mutation, 실제 사용자 삭제, 권한 우선순위, 컷오프 전·후, 순차 stale PUT에서는 되어야 할 일이 막히거나 되면 안 될 일이 실행되는 현상을 재현하지 못했다.

증거 무결성 예외도 발견하지 못했다. `evidence.json`의 원문, PNG의 표시 원문, DB 사후 건수가 서로 일치한다.

## 8. 이 라운드가 보지 않은 것

다음은 결함 0에 포함하지 않는다.

1. mapped production caller가 없는 내부 `SlipService.softDelete()` 직접 실행.
2. `POST /mobile/sales/partner-orders`, `/api/v1/slips/from-estimate`, `/from-partner-order`, `/from-orders-merge` 4개 발행 경로. 유효한 신규 S33 주문/견적 source를 이번 라운드에서 만들지 않아 호출하지 않았다.
3. INBOUND 기준선과 매입 direct PUT/DELETE.
4. `slip.period-lock` account/group/role 회수 저장. 기존 권한 데이터를 바꾸지 않았다.
5. 기존 전표의 상태 전이·수정·삭제 및 revision restore/inspect. 지시대로 조회만 했다.
6. 컷오프 정각 경계, 15:00 이후 경동택배, 자정 횡단 장시간 관측.
7. 두 worker가 동시에 보내는 진짜 병렬 PUT. 이번 (e)는 같은 버전의 순차 2회 요청이다.
8. mutation 각 건을 desktop 버튼 클릭으로 시작하는 E2E. 실 GUI 로그인·권한 화면·실 네트워크는 Playwright로 밟았고 mutation은 같은 Playwright 프로세스의 실 gateway APIRequestContext로 호출했다. route interception/mock은 사용하지 않았다.

## 9. 데이터·프로세스 회수

- S33 baseline: 실 DELETE API 200으로 회수, 최종 활성 baseline 0건.
- S33 전표: 총 10건(재실행 포함), 활성 9건·삭제 1건. 모두 `S33-` memo로 식별된다.
- 기존 QA 잔재: 삭제/수정 0건.
- DB 직접 INSERT/UPDATE/DELETE: 0건.
- Chromium/headless: 하네스 `finally`에서 `context.close()`와 `browser.close()` 실행. 사후 Playwright Chrome process 0건.
- Vite: 이 워크트리에서 띄운 PID 87556만 종료했다. 사후 `51124` listener 0건, process 0건.

## 10. 신규 파일 경로

- `docs/dev-reports/2026-08-09-1123-s33-live-qa-reconvergence.md`
- `clients/desktop/playwright/1123-s33-live-qa/capture.mjs`
- `docs/qa/1123-s33-live-qa/screenshots/_local/01-real-app-login.png`
- `docs/qa/1123-s33-live-qa/screenshots/_local/02-real-app-master-home.png`
- `docs/qa/1123-s33-live-qa/screenshots/_local/03-real-permission-ui.png`
- `docs/qa/1123-s33-live-qa/screenshots/_local/03b-real-permission-ui-closed-date-filter.png`
- `docs/qa/1123-s33-live-qa/screenshots/_local/04-precondition-baseline-zero.png`
- `docs/qa/1123-s33-live-qa/screenshots/_local/05-create-baseline-real-api.png`
- `docs/qa/1123-s33-live-qa/screenshots/_local/06-a-closed-create-blocked.png`
- `docs/qa/1123-s33-live-qa/screenshots/_local/07-b-master-closed-pass.png`
- `docs/qa/1123-s33-live-qa/screenshots/_local/08-a-eight-mutations-blocked.png`
- `docs/qa/1123-s33-live-qa/screenshots/_local/09-b-open-mutations-pass.png`
- `docs/qa/1123-s33-live-qa/screenshots/_local/10-b-open-delete-pass.png`
- `docs/qa/1123-s33-live-qa/screenshots/_local/11-c-forbidden-403.png`
- `docs/qa/1123-s33-live-qa/screenshots/_local/12-d-cutoff-before-after.png`
- `docs/qa/1123-s33-live-qa/screenshots/_local/13-e-optimistic-lock.png`
- `docs/qa/1123-s33-live-qa/screenshots/_local/14-network-real-gateway.png`
- `docs/qa/1123-s33-live-qa/screenshots/_local/evidence.json`

`_local` 경로는 `resolveQaShotsDir(...)`가 반환한 격리 경로이며 캡처 writer에 워크트리 절대경로를 하드코딩하지 않았다.

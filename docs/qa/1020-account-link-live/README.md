# 1020 담당자-계정 연결 라이브 QA

## 0단계 — 기존 user-service 확인

실행 명령:

```text
docker inspect -f '{{.Created}}' samhan-user-service
```

실행 결과:

```text
2026-07-22T15:56:12.031642504Z
```

컨테이너 상태: `running`

## 1단계 — user-service 워크트리 코드로 재빌드

시도 1:

```text
docker compose -f docker-compose.local-all.yml up -d --build --no-deps user-service
```

결과: 실패. `service "user-service" refers to undefined network samhan-net`.

시도 2:

```text
docker compose -f docker-compose.yml -f docker-compose.local-all.yml up -d --build --no-deps user-service
```

결과: 실패. `services/user-service/build/libs/user-service.jar`가 없어 Docker COPY 단계에서 중단됨.

현재까지 다른 서비스의 재빌드·재기동은 하지 않음.

`user-service` JAR 생성:

```text
.\gradlew.bat :services:user-service:bootJar -x test
BUILD SUCCESSFUL in 14s
```

최종 재빌드 명령:

```text
docker compose -f docker-compose.yml -f docker-compose.local-all.yml up -d --build --no-deps user-service
```

결과: 이미지 빌드 및 `samhan-user-service` 재생성·시작 성공.

재빌드 후 컨테이너 확인:

```text
CREATED=2026-08-01T00:48:57.219304829Z STATUS=running HEALTH=starting
running|starting
running|healthy
```

이 워크트리 코드로 생성된 컨테이너이며, 다른 서비스는 재빌드·재기동하지 않음.

## 2단계 — 적용 전 백업 및 현재 상태

백업 쿼리:

```sql
SELECT login_id, full_name, ecount_code, account_id
FROM employees
WHERE is_deleted=false
ORDER BY login_id;
```

실행 결과: `BACKUP_ROW_COUNT=24`, 24행을 캡처함. UUID는 보고서 금지 규칙에 따라 출력하지 않음.

적용 전 참조 상태 원문:

```text
 employees | null_account_id
-----------+-----------------
        24 |               0
(1 row)
```

DB 비교 결과 `account_id IS NULL`은 0건이며, auth 활성 계정과 로그인 ID 기준으로 비교한 불일치가 16건, 정상 일치가 8건임.

## 3단계 — 미리보기

실제 요청 후보 수: `24`

HTTP 상태: `200`

응답 원문:

```json
{"success":true,"code":"OK","message":"성공","data":{"planKey":"EAL-714e12de12ea28f0d7725195b9c4a838d89d","items":[{"employeeName":"견진성","employeeLoginId":"gyeonjinseong","matchReason":"full_name exact; login_id exact"},{"employeeName":"허유진","employeeLoginId":"heoyujin","matchReason":"full_name exact; login_id exact"},{"employeeName":"홍지수","employeeLoginId":"hongjisu","matchReason":"full_name exact; login_id exact"},{"employeeName":"장영구","employeeLoginId":"janyeonggu","matchReason":"full_name exact; login_id exact"},{"employeeName":"정민국","employeeLoginId":"jeongminguk","matchReason":"full_name exact; login_id exact"},{"employeeName":"김은지","employeeLoginId":"kimeunji","matchReason":"full_name exact; login_id exact"},{"employeeName":"김기철","employeeLoginId":"kimgicheol","matchReason":"full_name exact; login_id exact"},{"employeeName":"김미선","employeeLoginId":"kimmiseon","matchReason":"full_name exact; login_id exact"},{"employeeName":"이지용","employeeLoginId":"leejiyong","matchReason":"full_name exact; login_id exact"},{"employeeName":"이성미","employeeLoginId":"leeseongmi","matchReason":"full_name exact; login_id exact"},{"employeeName":"오병승","employeeLoginId":"obyeongseung","matchReason":"full_name exact; login_id exact"},{"employeeName":"박은우","employeeLoginId":"parkeunwoo","matchReason":"full_name exact; login_id exact"},{"employeeName":"박지수","employeeLoginId":"parkjisu","matchReason":"full_name exact; login_id exact"},{"employeeName":"라해람","employeeLoginId":"rahaeram","matchReason":"full_name exact; login_id exact"},{"employeeName":"심미광","employeeLoginId":"simmigwang","matchReason":"full_name exact; login_id exact"},{"employeeName":"신현민","employeeLoginId":"sinhyeonmin","matchReason":"full_name exact; login_id exact"}]},"timestamp":"2026-08-01T00:54:29.278884024Z"}
```

미리보기 결과: `items` 16건. 정상 8건은 목록에 들어오지 않음. 모든 항목의 연결 근거는 `full_name exact; login_id exact`.

## 4단계 — 적용 및 DB 검증

적용 전 첫 전송 시도는 HTTP 본문 객체 생성 오류로 전송되지 않았고, DB는 변경되지 않음(`PLANNED 16`, 불일치 16건).

재실행 요청:

```text
POST /admin/user/employee-account-links/EAL-714e12de12ea28f0d7725195b9c4a838d89d/apply
```

HTTP 상태: `204`

응답 본문 원문: 빈 문자열 (`RESPONSE_BODY_LENGTH=0`)

적용 후 DB 조회 원문:

```text
AFTER_EMPLOYEE_COUNT=24
AFTER_BROKEN_COUNT=0
AFTER_BROKEN_EMPLOYEES=

 status  | count
---------+-------
 APPLIED |    16
(1 row)
```

계획 16건의 DB 행은 모두 `APPLIED`이며, 이름·로그인 ID·일치 근거도 미리보기와 동일함.

적용 전 불일치 16건 → 적용 후 불일치 0건. 정상 8건은 계획에 없었고 변경되지 않음.

## 5단계 — 같은 planKey 재적용

동일 요청 재실행:

```text
POST /admin/user/employee-account-links/EAL-714e12de12ea28f0d7725195b9c4a838d89d/apply
```

HTTP 상태: `204`

응답 본문 원문: 빈 문자열 (`RESPONSE_BODY_LENGTH=0`)

재적용 직후 DB 원문:

```text
 status  | count
---------+-------
 APPLIED |    16
(1 row)
```

`PLANNED` 행이 다시 생성되거나 중복 적용되지 않았고, 기존 16건 `APPLIED` 상태가 유지됨.

## 6단계 — 담당자 목록·관련 조직도 회귀 확인

실제 `user-service` 조회 결과입니다. 응답 본문에는 UUID 필드가 포함되어 있어 UUID 금지 규칙에 따라 원문 전체 대신 검증 가능한 비-UUID 결과만 기록함.

담당자 목록 `GET /users/employees`:

```text
HTTP_STATUS=200
SUCCESS=True
DATA_COUNT=24
BODY_LENGTH=7367
```

실제 목록의 login ID 24건이 모두 반환됨(16건 대상 및 정상 8건 포함). 이름·담당자코드 식별은 위 목록과 동일하게 유지됨.

관련 화면 데이터 `GET /users/org-chart`:

```text
HTTP_STATUS=200
SUCCESS=True
DEPARTMENT_COUNT=5
ORG_MEMBER_COUNT=24
FIRST_DEPARTMENT_NAME=대표실
FIRST_DEPARTMENT_MEMBER_COUNT=5
```

담당자 목록과 조직도 모두 `200`이며 24명 데이터가 유지됨. 적용으로 기존 조회가 막히지 않은 것을 확인함.

## 7단계 — 최종 무결성 점검

```text
UUID_PATTERN_MATCHES_IN_REPORT=0
FINAL_EMPLOYEE_COUNT=24
FINAL_MATCHED_COUNT=24
FINAL_UNMATCHED_COUNT=0

 plan_rows | applied_rows | planned_rows
-----------+--------------+--------------
        16 |           16 |            0
(1 row)
```

최종 판정: 미리보기 16건, 정상 8건 제외, 적용 16건, DB 불일치 16→0건, 동일 planKey 재적용 무해, 담당자 목록·조직도 조회 정상.

참고: HTTP 전송 방식을 확인하기 위해 실행한 단건 미리보기의 저장 계획 1건이 별도 `PLANNED`로 남아 있음. 직원 `account_id`는 변경하지 않았으며, 적용한 본 계획과 무관함.

전체 계획 테이블 조회 원문:

```text
 status  | count
---------+-------
 APPLIED |    16
 PLANNED |     1
```

# 2026-08-01 담당자-사용자 참조 정합성 조사

## 조사 범위와 안전 조건

- 대상: `employees.account_id`가 실재 사용자 행을 가리키지 않는 활성 담당자의 실제 내용과 재연결 후보 존재 여부.
- 허용 작업: 소스·스키마 파일 읽기, 실행 중 DB에 대한 `SELECT` 및 메타데이터 조회만.
- 금지 작업 준수: git 명령, DB 쓰기, Docker 재빌드·재기동, 빌드·테스트, 코드 수정은 수행하지 않는다.
- UUID 표기: 보고서에는 원문 UUID를 쓰지 않고 필요한 경우 앞 8자리만 표기한다.

## 확인 1 — 조회 대상과 정적 계약

- 실행 환경: `samhan-postgres`(PostgreSQL 16)가 실행 중이며, 재빌드·재기동 없이 기존 컨테이너에 읽기 전용 질의한다.
- 정적 스키마 위치: `services/user-service/src/main/resources/db/migration/V1__init_user_service.sql`에서 `employees.account_id`가 정의되고, `V8__add_ecount_mig6_employee_asset.sql`에서 nullable로 전환된다.
- 정적 연결 계약: `services/user-service/README.md` 및 V5 seed 주석은 `employees.account_id`가 `auth-service`의 `accounts.id`를 논리 참조한다고 명시한다. 서로 다른 DB이므로 물리 FK가 아니라 논리 참조이다.

### SQL과 출력 원문 — 실제 열 계약

```sql
-- user_db
BEGIN TRANSACTION READ ONLY;
SELECT ordinal_position, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema='public' AND table_name='employees'
ORDER BY ordinal_position;
COMMIT;
```

```text
BEGIN
 1 id uuid NO
 2 account_id uuid YES
 3 login_id varchar NO
 4 full_name varchar NO
 5 job_title varchar NO
 7 department_id uuid NO
 10 termination_date date YES
 19 is_deleted boolean NO
 20 ecount_code varchar YES
(전체 24개 열 확인; 조사 관련 열만 발췌)
COMMIT
```

```sql
-- auth_db
BEGIN TRANSACTION READ ONLY;
SELECT ordinal_position, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema='public' AND table_name='accounts'
ORDER BY ordinal_position;
COMMIT;
```

```text
BEGIN
 1 id uuid NO
 2 login_id varchar NO
 4 display_name varchar NO
 6 enabled boolean NO
 14 is_deleted boolean NO
 21 email varchar YES
 23 department_name varchar YES
(전체 22개 열 확인; 조사 관련 열만 발췌)
COMMIT
```

판정 기준은 다음과 같다. 담당자 행의 "활성"은 `employees.is_deleted = false`, 퇴사는 `termination_date IS NOT NULL AND termination_date <= CURRENT_DATE`, 참조 실재는 `employees.account_id = auth_db.accounts.id`의 정확 일치(삭제 여부와 무관한 물리 행 존재)이다. 사용자 이름은 `accounts.display_name`과 담당자 `full_name`의 문자열 정확 일치로 센다.

## 확인 2 — 24건·16건 및 끊어진 행 실측

### 활성/퇴사 수 SQL과 출력 원문

```sql
-- user_db
BEGIN TRANSACTION READ ONLY;
SELECT
  COUNT(*) FILTER (WHERE NOT e.is_deleted) AS active_rows,
  COUNT(*) FILTER (WHERE NOT e.is_deleted AND e.account_id IS NULL) AS null_account_id,
  COUNT(*) FILTER (WHERE NOT e.is_deleted AND e.termination_date IS NOT NULL
                    AND e.termination_date <= CURRENT_DATE) AS departed,
  COUNT(*) FILTER (WHERE NOT e.is_deleted AND (e.termination_date IS NULL
                    OR e.termination_date > CURRENT_DATE)) AS employed
FROM employees e;
COMMIT;
```

```text
BEGIN
 active_rows | null_account_id | departed | employed
-------------+-----------------+----------+---------
          24 |               0 |        0 |       24
(1 row)
COMMIT
```

### 교차 DB 정확 일치 조사 SQL

두 테이블이 서로 다른 PostgreSQL DB(`user_db`, `auth_db`)에 있고 물리 FK/공용 뷰가 없으므로, 아래 두 `SELECT`를 각각 `PGOPTIONS='-c default_transaction_read_only=on'`으로 실행했다. 결과의 전체 UUID는 프로세스 메모리에서만 정확 비교하고 보고서 출력 시 앞 8자리로 잘랐다.

```sql
-- user_db
SELECT e.ecount_code, e.full_name, d.name, e.job_title,
       CASE WHEN e.termination_date IS NOT NULL AND e.termination_date <= CURRENT_DATE
            THEN '퇴사' ELSE '재직' END,
       e.account_id::text, e.login_id
FROM employees e
JOIN departments d ON d.id=e.department_id
WHERE NOT e.is_deleted
ORDER BY e.full_name;

-- auth_db
SELECT id::text, display_name, login_id, is_deleted, enabled, created_at, created_by
FROM accounts
ORDER BY display_name;
```

정확 UUID 동등 비교 및 이름/로그인 문자열 동등 비교의 출력 원문:

```text
Employees                  : 24
Broken                     : 16
BrokenEmployed             : 16
BrokenDeparted             : 0
BrokenWithSameName         : 16
BrokenWithMultipleSameName : 0
BrokenWithSameLogin        : 16
DistinctBrokenIds          : 16
```

따라서 보고된 **활성 24건·끊어진 16건은 정확하다.** 끊어진 16명은 전원 재직, 퇴사자는 0명이다. 활성 담당자 24명 전체에서도 퇴사자는 0명이다.

### 반드시 채울 표 — 끊어진 16건

`담당자코드`는 `employees.ecount_code`의 실측값이다. 현재 16건 모두 NULL이다. `account_id`는 UUID 앞 8자리만 표시한다. 이름 같은 사용자 행의 건수는 삭제 여부와 무관한 `auth_db.accounts` 전체 행 기준이며, 아래 후보는 모두 미삭제·활성이다.

| 담당자코드 | 이름 | 부서/직위 | 재직 상태 | `account_id` | 그 값이 실재하나 | **이름이 같은 사용자 행이 있나** | 몇 건 |
|---|---|---|---|---|---|---|---:|
| NULL | 견진성 | 영업3팀/차장 | 재직 | `77baed72…` | 아니오 | 예 | 1 |
| NULL | 김기철 | 영업2팀/부장 | 재직 | `67b844f5…` | 아니오 | 예 | 1 |
| NULL | 김미선 | 대표실/대표 | 재직 | `ad1ed50f…` | 아니오 | 예 | 1 |
| NULL | 김은지 | 회계팀/사원 | 재직 | `86a56215…` | 아니오 | 예 | 1 |
| NULL | 라해람 | 회계팀/사원 | 재직 | `88fcc558…` | 아니오 | 예 | 1 |
| NULL | 박은우 | 영업3팀/주임 | 재직 | `4dc5151b…` | 아니오 | 예 | 1 |
| NULL | 박지수 | 회계팀/사원 | 재직 | `d1af433a…` | 아니오 | 예 | 1 |
| NULL | 신현민 | 영업3팀/사원 | 재직 | `f81ec42c…` | 아니오 | 예 | 1 |
| NULL | 심미광 | 영업2팀/과장 | 재직 | `518711a3…` | 아니오 | 예 | 1 |
| NULL | 오병승 | 영업1팀/이사 | 재직 | `7fe74227…` | 아니오 | 예 | 1 |
| NULL | 이성미 | 회계팀/사원 | 재직 | `60ea0dd4…` | 아니오 | 예 | 1 |
| NULL | 이지용 | 영업2팀/사원 | 재직 | `ef8c07df…` | 아니오 | 예 | 1 |
| NULL | 장영구 | 대표실/전무 | 재직 | `26d6bf7a…` | 아니오 | 예 | 1 |
| NULL | 정민국 | 영업2팀/사원 | 재직 | `db75f600…` | 아니오 | 예 | 1 |
| NULL | 허유진 | 회계팀/사원 | 재직 | `c4ace98f…` | 아니오 | 예 | 1 |
| NULL | 홍지수 | 영업1팀/사원 | 재직 | `32a23726…` | 아니오 | 예 | 1 |

같은 이름의 사용자 후보는 16명 모두 정확히 1건씩이고, 2건 이상인 담당자는 **0명**이다. 이름 기준 동명이인 자동 연결 금지 대상은 이번 실측에서는 없다. 또한 보조 관찰로 16명 모두 `employees.login_id = accounts.login_id`인 사용자 행도 정확히 1건씩 존재한다. 다만 이름/로그인 일치는 후보 존재 증거일 뿐 이번 조사에서 데이터를 연결하지 않았다.

## 확인 3 — 담당자코드 매칭 가능 여부

### SQL과 출력 원문

```sql
-- user_db
BEGIN TRANSACTION READ ONLY;
SELECT COUNT(*) AS active_cards,
       COUNT(*) FILTER (WHERE employee_code IS NOT NULL AND BTRIM(employee_code) <> '') AS cards_with_code,
       COUNT(DISTINCT employee_id) AS distinct_employee_links
FROM employee_cards
WHERE NOT is_deleted;

SELECT COUNT(*) AS raw_rows,
       COUNT(*) FILTER (WHERE employee_code IS NOT NULL AND BTRIM(employee_code) <> '') AS raw_with_code,
       COUNT(*) FILTER (WHERE target_employee_id IS NOT NULL) AS raw_with_target
FROM staging.ecount_employee_raw
WHERE NOT is_deleted;
COMMIT;
```

```text
 active_cards | cards_with_code | distinct_employee_links
--------------+-----------------+------------------------
            0 |               0 |                       0

 raw_rows | raw_with_code | raw_with_target
----------+---------------+----------------
        0 |             0 |               0
```

앞의 실제 열 조회 원문대로 사용자 쪽 `auth_db.accounts`에는 담당자코드 대응 열이 없다(`id`, `login_id`, `display_name`, `department_name` 등만 존재). 담당자 쪽 공식 코드 열 `employees.ecount_code`도 활성 24건 전부 NULL이며, 보조 테이블 `employee_cards`와 staging에도 행 자체가 없다. 따라서 **담당자코드로 확실히 이어지는 건수는 0건**이고, 현재 DB만으로는 코드 매칭이 불가능하다.

이는 "이름 후보가 16건 있다"는 결과와 구분해야 한다. 이름과 `login_id`는 각각 16/16에서 단일 후보를 내지만 사용자 쪽 담당자코드에 의한 증명은 아니다.

## 확인 4 — 끊어진 값의 모양과 생성 흔적

### SQL과 출력 원문

```sql
-- user_db
BEGIN TRANSACTION READ ONLY;
SELECT COUNT(*) AS active_rows,
       COUNT(DISTINCT account_id) AS distinct_account_ids,
       COUNT(*) FILTER (WHERE id=account_id) AS employee_id_equals_account_id,
       SUBSTRING(account_id::text,15,1) AS uuid_version_nibble,
       COUNT(*)
FROM employees
WHERE NOT is_deleted
GROUP BY SUBSTRING(account_id::text,15,1)
ORDER BY uuid_version_nibble;
COMMIT;
```

```text
 active_rows | distinct_account_ids | employee_id_equals_account_id | uuid_version_nibble | count
-------------+----------------------+-------------------------------+---------------------+------
           8 |                    8 |                             8 | 0                   |     8
          16 |                   16 |                            16 | 4                   |    16
```

- 활성 24건은 모두 `employee.id = employee.account_id`이다.
- 끊어진 16개 값은 **16개 모두 서로 다르며**, PostgreSQL UUID 타입에 정상 저장된 **표준 random UUID v4**이다. NULL, 깨진 문자열, 한 값 반복은 없다.
- 나머지 정상 8건은 `a0000000…` 형태의 고정 DEV-SEED UUID(버전 nibble 0)이고, 이 값들은 auth 행과 정확히 일치한다.

이름/로그인이 같은 auth 후보 16건의 SQL:

```sql
-- auth_db
BEGIN TRANSACTION READ ONLY;
SELECT display_name, login_id, LEFT(id::text,8) AS account_id_prefix,
       SUBSTRING(id::text,15,1) AS uuid_version_nibble,
       created_at, created_by, is_deleted, enabled
FROM accounts
WHERE display_name IN ('견진성','김기철','김미선','김은지','라해람','박은우','박지수','신현민',
                       '심미광','오병승','이성미','이지용','장영구','정민국','허유진','홍지수')
ORDER BY display_name;
COMMIT;
```

```text
display_name | login_id       | account_id_prefix | ver | created_at                 | created_by      | deleted | enabled
-------------+----------------+-------------------+-----+----------------------------+-----------------+---------+--------
견진성       | gyeonjinseong  | 20d53c2b          | 4   | 2026-05-09 15:53:17.791505 | system-internal | f       | t
김기철       | kimgicheol     | 8c613bed          | 4   | 2026-05-09 15:53:17.535422 | system-internal | f       | t
김미선       | kimmiseon      | 891b96e6          | 4   | 2026-05-09 15:53:17.218888 | system-internal | f       | t
김은지       | kimeunji       | c5af1500          | 4   | 2026-05-09 15:53:18.160509 | system-internal | f       | t
라해람       | rahaeram       | b5018719          | 4   | 2026-05-09 15:53:18.098504 | system-internal | f       | t
박은우       | parkeunwoo     | 9fb460e7          | 4   | 2026-05-09 15:53:17.853629 | system-internal | f       | t
박지수       | parkjisu       | 51596b06          | 4   | 2026-05-09 15:53:18.224792 | system-internal | f       | t
신현민       | sinhyeonmin    | f5a3c224          | 4   | 2026-05-09 15:53:17.914064 | system-internal | f       | t
심미광       | simmigwang     | d4dae2c3          | 4   | 2026-05-09 15:53:17.600740 | system-internal | f       | t
오병승       | obyeongseung   | d552ad9f          | 4   | 2026-05-09 15:53:17.406018 | system-internal | f       | t
이성미       | leeseongmi     | 299c25e1          | 4   | 2026-05-09 15:53:17.973877 | system-internal | f       | t
이지용       | leejiyong      | 2d9ce47a          | 4   | 2026-05-09 15:53:17.728198 | system-internal | f       | t
장영구       | janyeonggu     | cf482517          | 4   | 2026-05-09 15:53:17.342706 | system-internal | f       | t
정민국       | jeongminguk    | 4d9f141d          | 4   | 2026-05-09 15:53:17.662344 | system-internal | f       | t
허유진       | heoyujin       | 384c5714          | 4   | 2026-05-09 15:53:18.036604 | system-internal | f       | t
홍지수       | hongjisu       | 609f053c          | 4   | 2026-05-09 15:53:17.470839 | system-internal | f       | t
```

user 쪽 동일 16명은 `created_by=system`, `created_at=2026-05-09 15:53:17.267916~15:53:18.231686`이고, 각 행의 `id`와 `account_id`가 같다. auth 후보는 `created_by=system-internal`이며 같은 초 안에서 각 employee보다 먼저 생성되었다. 이는 16명에 대해 auth-first 프로비저닝이 실행됐지만 당시 두 DB가 서로 다른 random UUID를 보존한 **과거 생성 계약 드리프트** 흔적과 일치한다.

현재 소스 `EmployeeProvisioningService.create`는 `newId` 하나를 `AuthClient.createAccount(newId, ...)`와 `Employee.create(newId, ...)` 양쪽에 전달하고, auth의 `registerWithId`도 `Account.createWithId(id, ...)`를 사용한다. 즉 현재 코드의 의도는 동일 UUID이다. 다만 git 명령 금지 조건에서 과거 실행 시점 소스 이력은 대조하지 않았으므로, 어느 과거 코드 지점이 UUID를 재발급했는지는 **확인불가**이다.

## 확인 5 — 실제 소비 코드와 현재 화면/API 증상

### 중요한 코드 사실: `account_id` 열 자체는 현재 런타임에서 읽히지 않는다

```text
검색 명령:
rg -n "getAccountId\(|accountId\(\)|account_id" services/user-service/src/main ...

출력 요약:
- V1/V5/V8 migration의 account_id 정의·seed
- EcountEmployeeImporter INSERT의 account_id
- Employee.java의 @Column(name = "account_id") 필드
- production Java의 getAccountId()/accountId() 호출: 0건
```

현재 연결 소비 코드는 `employees.account_id`를 조회하는 repository 메서드가 아니라, auth/JWT의 사용자 UUID를 `employees.id`에 바로 대입한다.

- `InternalUserController.findOne(UUID userId)` → `employeeRepository.findById(userId)`
- `verifyBulk`, `verifyActiveBulk`, `displayNames`, 서명 조회 → `findAllByIdIn(...)` 또는 `findAllActiveByIdIn(...)`
- groupware `UserClient.exists(authUserId)` → `/internal/users/{userId}`
- `ScheduleService.create` → `userClient.exists(ownerId)`가 false면 `404 NOT_FOUND("소유자 미존재")`
- `MessageService` 표시명 해석 실패 → 화면 문자열 `알 수 없는 발신자`
- `ApprovalLineAdminResponse` 표시명 해석 실패 → `requesterName`/`approverName`이 null(화면에서는 빈 값/폴백 대상)

즉 이 DB에서는 `employees.id = employees.account_id`이므로 둘이 같은 오래된 UUID를 담고 있지만, **현재 오류를 직접 만드는 조회 키는 `employees.id`**이다. `account_id`만 고립해서 보면 미사용 열이며, 단순히 그 열만 바뀌어도 현재 `findById(auth UUID)` 경로는 그대로 실패한다는 점을 보고한다(수정 설계는 이번 범위 밖).

### 실행 중 서비스에 대한 읽기 전용 GET 원문

```text
GET http://localhost:8083/internal/users/employees?limit=500
X-Internal-Token: <비공개>

HttpStatus     : 200
PayloadRows    : 24
RealRows       : 16
DevSeedRows    : 8
NullEcountCode : 24
```

이 directory의 근거 SQL은 확인 2의 활성 employee SELECT이고, endpoint 구현은 `searchEmployeeDirectory`로 auth join 없이 `employees`를 직접 읽는다. 따라서 **담당자/직원 목록 자체에서는 16명이 빠지지 않고 24명 모두 나온다.** `EmployeeResponse`에는 `account_id`도 포함되지 않아 그 열 때문에 빈 칸이나 목록 오류가 생기지 않는다. 다만 담당자코드는 24명 전부 빈 값이다.

auth UUID를 user-service 단건 조회 키로 사용한 읽기 전용 GET probe:

```sql
-- probe 입력 선별 SQL(auth_db, 세션 read-only)
SELECT id
FROM accounts
WHERE display_name IN ('견진성','김기철','김미선','김은지','라해람','박은우','박지수','신현민',
                       '심미광','오병승','이성미','이지용','장영구','정민국','허유진','홍지수')
ORDER BY display_name;

SELECT id
FROM accounts
WHERE id::text LIKE 'a0000000-%'
  AND display_name NOT IN ('[DEV-SEED] 기사','[DEV-SEED] 배차담당자','[DEV-SEED] 사원')
  AND NOT is_deleted
ORDER BY id;
```

```text
각 id에 GET /internal/users/{id} 실행(응답 UUID 본문은 기록하지 않음)

RealAuthIdsProbed  : 16
RealHttp200        : 0
RealHttp404        : 16
LinkedDevIdsProbed : 8
DevHttp200         : 8
DevHttp404         : 0

대표 1건 교차 확인:
김미선 | auth account id `891b96e6…` 조회 → HTTP 404
김미선 | employee id     `ad1ed50f…` 조회 → HTTP 200
```

따라서 화면/API 증상은 하나가 아니라 소비 방식별로 갈린다.

1. 직원 관리·담당자 directory처럼 employee 테이블을 직접 나열하는 화면: **목록 누락 없음(24건 표시)**. 담당자코드는 빈 값.
2. 로그인한 auth 사용자의 UUID로 user-service 존재를 검증하는 일정 등록: **오류(16명 모두 user lookup 404)**. 기존 라이브 QA 원문에서도 실 사용자 일정 생성은 `HTTP 404 / 소유자 미존재`였다.
3. auth UUID로 표시명을 enrich하는 메신저/결재 목록: 행 자체를 DB에서 제거하는 것은 아니지만 lookup map에서 이름이 빠져 **`알 수 없는 발신자` 또는 null/빈 표시명**으로 수렴한다.
4. auth UUID를 employee 기준 집계 키로 직접 쓰는 소비처가 있다면 해당 16명은 employee lookup 결과에 없으므로 집계에서 누락된다. 다만 이번 코드 전수 검색에서 특정 통계 SQL이 `employees.account_id`를 직접 join하는 경로는 발견하지 못했으므로, 구체 통계 화면명은 **확인불가**이다.

## 최종 답변

1. **24건·16건은 정확하다.** 활성 employee 24건, exact auth UUID 미존재 16건이다.
2. 끊어진 16건은 **재직 16명·퇴사 0명**이다. 활성 24건 전체도 재직 24명·퇴사 0명이다.
3. 이름이 같은 사용자 행이 둘 이상인 담당자는 **0명**이다. 16명 모두 같은 이름의 미삭제·활성 사용자 후보가 정확히 1건씩 있다.
4. 사용자 쪽에 담당자코드 대응 열이 없고 employee의 `ecount_code`도 전부 NULL이므로 **담당자코드 확정 매칭은 0건**이다. 반면 이름과 `login_id`는 16명 모두 각각 유일 후보 1건으로 함께 일치하므로, 실제 재연결 상대 후보는 16명 전원에게 있다.
5. 끊어진 값은 서로 다른 정상 UUID v4 16개이다. 같은 값 반복·NULL·형식 이상은 없다. auth 후보도 별도의 UUID v4이며 같은 생성 초에 먼저 만들어졌다. 과거 생성 계약 드리프트 흔적은 강하지만 정확한 과거 코드 지점은 확인불가이다.
6. 현재 런타임은 `account_id`를 직접 읽지 않고 auth UUID로 `Employee.id`를 조회한다. 직접 employee 목록은 24명 모두 보이지만, auth 신원 기반 검증은 16명 모두 404, 표시명 enrich는 빈 값/`알 수 없는 발신자`, employee 기준 집계는 누락 가능성이 확인됐다.

이번 조사에서는 코드·데이터를 수정하지 않았다.

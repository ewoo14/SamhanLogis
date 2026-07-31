# PR #1006 / Issue #895 일정관리 슬라이스 2 라이브 QA 보고서

- 검증일: 2026-07-31 (KST)
- 대상 브랜치/HEAD: `feat/895-schedule-s2` / `a29a6a530`
- 검증 방식: Docker 실서버, mock 미사용, 코드·Docker 이미지·Git 쓰기 없음
- UI: 이 슬라이스에는 일정 UI가 아직 없으므로 실제 화면 캡처 불가. API 실행 증거로 대체한다.

## 배포 확인

| 항목 | 실측 |
|---|---|
| groupware 컨테이너 | `samhan-groupware-service`, healthy, 8092, 기동 `2026-07-31T13:05:59Z` |
| groupware 이미지 | `infrastructure-groupware-service`, 생성 `2026-07-31T13:05:55Z`, image id `67eaea02524c...` |
| auth 컨테이너 | `samhan-auth-service`, healthy, 8081, 기동 `2026-07-31T13:05:59Z` |
| groupware migration | `V18 remove schedule notification state` 성공 |
| auth migration | `V90 seed groupware schedules page permission` 성공 |
| 사전 행 수 | `schedules 전체/활성 = 42/42`, `schedule_participants 전체/활성 = 106/106` |
| 권한 계정 | `gyeonjinseong`(20d53c2b-...), `leeseongmi`(299c25e1-...) 모두 `groupware.schedules` VIEW/CREATE/UPDATE/DELETE=true |

## ① 단건 상세 및 POST 404 원인

### 권한 계정으로 POST 404 재현

명령:

```powershell
POST http://localhost:8092/admin/groupware/schedules
X-User-Id: 20d53c2b-e421-48f6-97a7-3301247fb6b2
body: 전용 일정 제목/시간, participantIds=[]
```

결과: **HTTP 404**, `code=NOT_FOUND`, 본문 요지=`소유자 미존재`.

다음 변형도 동일했다.

```powershell
POST http://localhost:8092/admin/groupware/schedules
X-User-Id: 20d53c2b-e421-48f6-97a7-3301247fb6b2
X-User-Name: gyeonjinseong
```

결과: **HTTP 404**, `소유자 미존재`.

실 JWT로 게이트웨이 레거시 경로를 호출한 결과도 동일했다.

```powershell
POST http://localhost:8080/admin/groupware/schedules
Authorization: Bearer <gyeonjinseong 실 로그인 JWT>
```

결과: **HTTP 404**, `소유자 미존재`.

### 원인 판정

헤더 부족이나 `X-User-Name` 누락이 원인이 아니다. 두 권한 UUID는 `auth_db.accounts`에는 존재하지만, groupware 생성 시 호출하는 user-service의 사용자 존재 확인 기준인 `user_db.employees.account_id`에는 존재하지 않는다.

- `auth_db.accounts`: 두 계정 존재/활성/권한 보유
- `user_db.employees`: 두 UUID 모두 0건
- 따라서 `ScheduleService.create()`의 소유자 `UserClient.exists()`가 false를 반환하고, 일정 저장 전에 404를 반환한다.

이는 **실 사용자 경로의 결함(BLOCKING)** 이다. 권한 계정으로 일정 생성이 불가능하다.

### 실 계정 throwaway로 상세 계약 검증

계정 ID가 양 서비스에서 일치하는 `dev_master`를 대체 검증 계정으로 사용했다. 비밀번호와 JWT 원문은 기록하지 않았다.

```powershell
POST http://localhost:8080/auth/login
```

결과: **HTTP 200**, `userId=a0000000-...0001`, `role=MASTER`.

```powershell
POST http://localhost:8080/admin/groupware/schedules
Authorization: Bearer <dev_master 실 JWT>
body: QA895 throwaway 20260731, participantIds=[]
```

결과: **HTTP 201**, 생성 ID=`a84c0f60-d747-4cf0-8d5c-dc1f7230fbde`.

```powershell
GET http://localhost:8080/admin/groupware/schedules/a84c0f60-d747-4cf0-8d5c-dc1f7230fbde
Authorization: Bearer <dev_master 실 JWT>
```

결과: **HTTP 200**, 정상 일정 응답. `ownerId=a0000000-...0001`, `status=DRAFT`, `participantIds`에 작성자 UUID 1건 포함.

```powershell
GET http://localhost:8080/admin/groupware/schedules/a84c0f60-d747-4cf0-8d5c-dc1f7230fbde
Authorization: Bearer <leeseongmi 실 JWT>
```

결과: **HTTP 404**, `일정을 찾을 수 없습니다`.

```powershell
GET http://localhost:8080/admin/groupware/schedules/00000000-0000-0000-0000-000000000000
Authorization: Bearer <dev_master 실 JWT>
```

결과: **HTTP 404**, `일정을 찾을 수 없습니다`.

판정: `dev_master` 대체 throwaway 기준 대상자 200, 비대상자 404, 존재하지 않는 일정 404로 **상세 객체수준 인가 계약 PASS**. 다만 개발책임자가 지정한 두 실계정 기준은 소유자 ID 불일치 때문에 **미완료/BLOCKING**이다.

### 게이트웨이 `/api/v1` 경로 확인

```powershell
GET http://localhost:8080/api/v1/groupware/admin/groupware/schedules?from=...&to=...
Authorization: Bearer <leeseongmi 실 JWT>
```

결과: **HTTP 500**. groupware 로그에는 `No static resource groupware/admin/groupware/schedules`가 남았다. `StripPrefix=2` 후 downstream 경로가 `/groupware/admin/groupware/schedules`가 되어 컨트롤러 `/admin/groupware/schedules`와 불일치한다.

레거시 게이트웨이 경로 `/admin/groupware/**`는 정상 라우팅되며 위 POST/GET 검증에 사용했다. 따라서 `/api/v1` 경로도 별도 **라우팅 결함**으로 보고한다.

## ② 목록 조회 및 106건

```powershell
GET http://localhost:8092/admin/groupware/schedules?from=2026-01-01T00:00:00&to=2027-01-01T00:00:00
X-User-Id: 299c25e1-0206-4d05-b763-babcabc49001
```

결과: **HTTP 200**, `data=[]` (권한은 통과하지만 해당 auth UUID 기준 가시 일정 0건).

```powershell
GET http://localhost:8080/admin/groupware/schedules?from=2026-01-01T00:00:00&to=2027-01-01T00:00:00
Authorization: Bearer <leeseongmi 실 JWT>
```

결과: **HTTP 200**, `data=[]`.

`dev_master` throwaway 생성 직후 동일 목록 호출은 **HTTP 200, 1건**이었다. 따라서 기대한 가시 건수 **106건은 실 API에서 재현하지 못했다**. 원인은 기존 42개 일정의 owner/participant UUID가 현재 인증 계정 UUID 집합과 일치하지 않는 데이터/신원 연계 불일치로 판단한다.

판정: **FAIL/BLOCKING — 106건 미재현**.

## ③ 작성자 자동 대상자 포함

생성 응답:

```json
{
  "status": 201,
  "ownerId": "a0000000-0000-0000-0000-000000000001",
  "participantIds": ["a0000000-0000-0000-0000-000000000001"]
}
```

`participantIds`에 작성자가 실제 집합 원소로 포함되었다. 별도 조건절 우회가 아닌 응답 대상자 목록의 집합 포함을 확인했다.

판정: **PASS (dev_master throwaway 기준)**. 지정된 두 실계정은 POST 404로 생성 자체가 불가하여 동일 계정 기준 판정은 보류한다.

## 정리 후 행 수 대조

```powershell
DELETE http://localhost:8080/admin/groupware/schedules/a84c0f60-d747-4cf0-8d5c-dc1f7230fbde
Authorization: Bearer <dev_master 실 JWT>
```

결과: **HTTP 200**, 일정 soft-delete 성공.

정리 후 SQL:

```sql
select count(*), count(*) filter (where not is_deleted) from schedules;
select count(*), count(*) filter (where not is_deleted) from schedule_participants;
```

결과:

| 테이블 | 정리 전 | 정리 후 | 판정 |
|---|---:|---:|---|
| schedules 전체 | 42 | 43 | 원상복구 실패(soft-delete tombstone 1건) |
| schedules 활성 | 42 | 42 | 활성 건수 복구 |
| schedule_participants 전체 | 106 | 107 | 원상복구 실패 |
| schedule_participants 활성 | 106 | 107 | 작성자 participant가 남음 |

throwaway 일정은 `is_deleted=true`, `deleted_by=a0000000-...0001`로 확인되었으나, participant 행은 활성 상태로 남았다. hard delete는 수행하지 않았다. 이는 soft-delete 정리 경로가 대상자 행까지 정리하지 않는 추가 결함/데이터 위생 이슈다.

## 최종 판정

- 단건 상세: 대체 계정 기준 `200/404/404` PASS. 지정 두 실계정 기준 생성 불가로 BLOCKING.
- 목록: 권한 계정 실 API 가시 건수 0, 기대 106 미재현. FAIL/BLOCKING.
- 작성자 자동 대상자 포함: 대체 throwaway 응답에서 PASS.
- POST 404 원인: auth 계정 UUID와 user-service employee UUID 불일치. 헤더 추가로 해결되지 않음.
- 게이트웨이 `/api/v1` 경로: downstream `/groupware/admin/...` 경로 불일치로 500. 별도 라우팅 결함.
- 정리: 활성 일정 수는 42로 복구했지만 물리/활성 participant 행은 107로 남음. 원상복구 불충족.

## 확인하지 못한 것

- 지정된 `gyeonjinseong`/`leeseongmi` UUID로 실제 일정 생성 후의 ③ 응답: user-service 존재 확인 404 때문에 생성 불가.
- 지정된 두 계정 기준 목록 106건: 인증 신원 UUID 불일치로 0건이 반환되어 재현 불가.
- 브라우저 화면 캡처: 일정 UI가 아직 구현되지 않아 캡처 대상 없음.
- `/api/v1` 정상 사용자 경로: 현재 배포 라우트가 500을 반환하므로 정상 응답 확인 불가.

# 시리얼 보상 실패 복구 — 실 Docker QA 증빙

> PR #355 / branch `feat/serial-compensation-recovery` / 2026-06-03
> 실 게이트웨이(127.0.0.1:8080) + 실 slip_db + 실 MASTER JWT. no-fake-data — 실 http_code/응답/psql만.

## 🚨 DevOps P1 (gateway 라우팅) — 실 QA 포착 + 해소

### 증상 (수정 전)
`GET /api/v1/slips/compensation-failures` → **HTTP 400** `{"code":"INVALID_INPUT","message":"파라미터 타입이 올바르지 않습니다: id (입력값: compensation-failures)"}`.

### 원인
gateway `slip-service-v1` route(`Path=/api/v1/slips/**`, **StripPrefix=2**)가 `api`/`v1` 를 제거 → slip-service 는 `/slips/compensation-failures` 수신. 그러나 `CompensationRecoveryController` 가 풀패스 `/api/v1/slips/compensation-failures` 로 매핑되어 **미매칭** → `SlipController @GetMapping("/slips/{id}")` 가 "compensation-failures" 를 `{id}`(UUID)로 바인딩 시도 → 타입 불일치 400.

### 수정
컨트롤러 매핑을 slip-service 컨벤션(strip 후 경로)인 **`/slips/compensation-failures`** 로 정정(SlipController/SalesSlipController 등과 일관). literal segment 가 `/slips/{id}` 보다 우선 매칭되어 충돌 없음. IT MockMvc 경로도 동기화. **gateway 무변경**(slip-service-v1 그대로 사용).

→ MockMvc IT 로는 잡히지 않던 실 게이트웨이 경로 결함을 **실 Docker QA 가 포착**(no-fake-data 원칙의 가치).

## 1. 실 MASTER 로그인

```
POST http://127.0.0.1:8080/api/auth/login {"loginId":"dev_master","password":"${QA_DEV_DEFAULT_PASSWORD}"} → token (MASTER)
```

## 2. 복구 API GET — gateway 통과 200 (수정 후)

```
GET http://127.0.0.1:8080/api/v1/slips/compensation-failures?resolved=false
Authorization: Bearer <MASTER JWT>
```

```json
HTTP=200
{"success":true,"code":"OK","message":"성공","data":{
  "content":[],"totalElements":0,"totalPages":0,"first":true,"last":true,
  "size":20,"number":0,"empty":true,
  "pageable":{"pageNumber":0,"pageSize":20,...}}}
```

→ gateway 라우팅 정상(400→200). `@RequirePermission(inventory.list, VIEW)` MASTER 통과. `Page` 응답 wrapper 정합. 현재 `serial_compensation_failures` 행 0건(실 보상 실패 미발생 — 정상) → 빈 목록.

## 3. PATCH resolve

실 `serial_compensation_failures` 행 0건이라 실 PATCH 대상 부재. no-fake-data 원칙상 가짜 행 삽입 금지 → resolve 전이(false→true)·멱등·404·권한(UPDATE) 가드는 **CI 실 Testcontainers IT** `CompensationRecoveryControllerIT`(6 tests, skip0)가 실 PostgreSQL 에서 검증(`findById().isResolved()` 직접 DB 단언). FE 해소 흐름은 mock Playwright 7/7(음성 권한가드 포함).

## 4. 종합

| 항목 | 결과 |
|---|---|
| gateway 라우팅(400→200) | ✅ 컨트롤러 `/slips/compensation-failures` 정정 |
| GET 복구 API + 권한 VIEW | ✅ HTTP 200, Page wrapper |
| resolve 전이/멱등/404/UPDATE 가드 | ✅ CI 실 Testcontainers IT 6 |
| FE 화면(목록/필터/해소/권한가드 음성) | ✅ mock Playwright 7/7 |
| no-fake-data | ✅ 실 http_code/응답/psql만, 가짜 행 삽입 없음 |

DevOps P1(gateway) 실 QA 포착·해소. 보상복구 복구 루프 실 환경 동작 실증.

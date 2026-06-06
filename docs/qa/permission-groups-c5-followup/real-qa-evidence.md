# PR #417 실 QA 증거 — 권한그룹 C5 후속 정리

**날짜**: 2026-06-07
**브랜치**: fix/permission-groups-c5-followup-cleanup
**QA 담당**: Claude QA agent (사이클 1)

---

## 환경

- Docker 스택: samhan-postgres 5432 + 전 서비스 (22 컨테이너)
- 재빌드 서비스: auth-service (JAR Jun 6 15:41), product-service (Jun 6 15:41), api-gateway
- 빌드 명령: `./gradlew.bat :services:auth-service:bootJar :services:product-service:bootJar :services:api-gateway:bootJar --rerun-tasks` + `docker compose up -d --build auth-service product-service api-gateway`

---

## 시나리오 1: V47 적용 확인

### 명령
```sql
SELECT group_id, page_code, can_view, can_create, can_update, can_delete, is_deleted
FROM group_page_permissions
WHERE page_code='products.sync' AND is_deleted=FALSE;
```

### 응답
```
               group_id               |   page_code   | can_view | can_create | can_update | can_delete | is_deleted
--------------------------------------+---------------+----------+------------+------------+------------+------------
 00000000-0000-0000-0000-000000000101 | products.sync | t        | t          | f          | f          | f
(1 row)
```

### Flyway 이력
```sql
SELECT version, description, installed_on, success FROM flyway_schema_history WHERE version='47';
```
```
 version |             description             |        installed_on        | success
---------+-------------------------------------+----------------------------+---------
 47      | seed products sync group permission | 2026-06-06 15:43:53.442208 | t
```

**결과**: PASS — MANAGER 그룹(…0101)에 products.sync view+create 부여, Flyway V47 성공 적용.

---

## 시나리오 2: products.sync 역할 매트릭스

### 2a: dev_master (시스템마스터 bypass) → GET /api/v1/products/admin/sync/last
```
< HTTP/1.1 200 OK
{"success":true,"code":"OK","data":{"lastSyncAt":null,"summary":null}}
```
**결과**: PASS — is_system_master bypass 정상 동작

### 2b: dev_manager → GET /api/v1/products/admin/sync/last (MANAGER 그룹, V47 grant 있음)
```
< HTTP/1.1 403 Forbidden
{"code":"FORBIDDEN","message":"[SP-PO-1] 동적 권한 deny — page=products.sync action=VIEW role=UNKNOWN reason=account permission missing"}
```
**결과**: FAIL — MANAGER 그룹에 group_page_permissions row 존재함에도 403.
**원인**: V47 migration이 group_page_permissions에만 INSERT하고 EffectivePermissionMaterializer를 트리거하지 않아 account_page_permissions에 products.sync row 미생성.

### 2c: dev_sales → GET /api/v1/products/admin/sync/last (비대상 → 403 expected)
```
< HTTP/1.1 403 Forbidden
{"code":"FORBIDDEN","message":"...account permission missing"}
```
**결과**: PASS — 비대상 403 정상

### 2d: dev_master → POST /api/v1/products/admin/sync (CREATE)
```
< HTTP/1.1 200 OK
```
**결과**: PASS

### 2e: dev_sales → POST /api/v1/products/admin/sync (비대상 → 403)
```
< HTTP/1.1 403 Forbidden
{"code":"FORBIDDEN","message":"...page=products.sync action=CREATE...reason=account permission missing"}
```
**결과**: PASS

---

## 시나리오 3: ROLE_ 제거 후 인가 회귀

### 3c: X-User-Role 위조 주입 차단 (게이트웨이 경유)
```bash
# JWT 없이 X-User-Role: MASTER + X-Is-System-Master: true 위조 → 게이트웨이가 JWT 없으면 차단
curl -sv GET http://localhost:8080/api/v1/products/admin/sync/last -H "X-User-Role: MASTER" -H "X-Is-System-Master: true"
< HTTP/1.1 401 Unauthorized
```
**결과**: PASS — 게이트웨이가 JWT 없이 오는 헤더 위조 차단

### 3d: product-service 직접 X-User-Role: MASTER 위조 주입 (ROLE_ dead-code 제거 확인)
```bash
curl -sv GET http://localhost:8084/api/v1/products/admin/sync/last \
  -H "X-User-Id: a0000000-0000-0000-0000-000000000003" \
  -H "X-User-Role: MASTER" \
  -H "X-Is-System-Master: false" \
  -H "X-User-Groups: 00000000-0000-0000-0000-000000000102"
< HTTP/1.1 403
{"message":"...role=MASTER reason=account permission missing"}
```
**결과**: PASS — ROLE_ authority가 생성되지 않아 인가 미통과. X-User-Role 무시.
**비고**: role=MASTER 로그 표시는 PermissionAspect가 X-User-Role 헤더를 roleCode 로깅용으로만 읽는 것 (인가 경로 영향 없음, C5 설계 의도)

### 3e: HeaderAuthenticationFilter ROLE_ dead-code 제거 코드 검증
auth-service HeaderAuthenticationFilter 소스 확인: X-User-Role 파싱 구간 완전 제거, GROUP_ authority만 생성. product-service 동일 패턴 확인.

---

## 시나리오 4: accounting prometheus 보안

### accounting-service 직접 포트 무인증
```bash
curl -sv GET http://localhost:8087/actuator/prometheus
< HTTP/1.1 401
```
**결과**: PASS — authenticated() 설정 정상 동작

### 게이트웨이 경유 /actuator/prometheus
```bash
curl -sv GET http://localhost:8080/actuator/prometheus
< HTTP/1.1 200 OK  (게이트웨이 자체 메트릭)
```
**비고**: 게이트웨이 actuator prometheus는 게이트웨이 자신의 메트릭. accounting-service prometheus를 게이트웨이가 프록시하지 않으므로 환경 한계 — accounting-service 직접 포트 무인증 401로 검증 대체.

---

## 시나리오 5: FE mock 카탈로그 V47 정합 (코드 대조)

mock.ts에서 products.sync 추가 확인:
- SP_D1_PAGES(ALL_PAGES) 배열에 'products.sync' 추가 (line 7097)
- MOCK_ACTION_ONLY_PAGES: `'products.sync': ['CREATE']` 추가 (line 7106)
- DEFAULT_VIEW (MANAGER 상당 역할 권한 배열): products.sync 추가 (line 7183)
- DEFAULT_EDIT (MANAGER 상당 CREATE 권한 배열): products.sync 추가 (line 7331)

V47 seed grant (MANAGER: view+create) 와 mock 카탈로그 정합 확인.

---

## 결함 근거 SQL

```sql
-- dev_manager account_page_permissions에 products.sync 없음 (V47 후 미materializer)
SELECT account_id, page_code, can_view, can_create
FROM account_page_permissions
WHERE account_id='a0000000-0000-0000-0000-000000000003'::uuid
  AND page_code='products.sync'
  AND is_deleted=FALSE;
-- 결과: (0 rows)

-- group_page_permissions에는 정상 존재
SELECT group_id, page_code, can_view, can_create
FROM group_page_permissions
WHERE page_code='products.sync' AND is_deleted=FALSE;
-- 결과: 00000000-0000-0000-0000-000000000101 | products.sync | t | t
```

---

## 사이클 1 Claude fix 후 재검증 (PM 대행, 2026-06-07)

### DEF-1 fix 적용 절차
1. V47 에 enforcement 캐시 동기 INSERT 추가 (commit `3374a0c9`)
2. auth-service jar/이미지 재빌드 + `DELETE FROM flyway_schema_history WHERE version='47'` 후 재기동 → V47 신버전 재적용 확인 (`success=t`)
3. `account_page_permissions WHERE page_code='products.sync'` → MANAGER 그룹 배속 계정 2건 (dev_manager `a000…0003` 포함) can_view=t / can_create=t 실증

### 역할 매트릭스 재실증 (게이트웨이 :8080 실 JWT)
```
dev_manager  GET  /api/v1/products/admin/sync/last → HTTP 200 (기존 FAIL → PASS)
dev_manager  POST /api/v1/products/admin/sync      → HTTP 200
dev_sales    GET  /api/v1/products/admin/sync/last → HTTP 403 (비대상 유지)
```
- dev_manager JWT payload: `sub=a000…0003, groups=00000000-…-0101` — role 클레임 부재 (C5 계약 유지) 실측.
- 응답 summary 의 Service Account 키 부재 오류는 로컬 환경 한정 (GOOGLE_SERVICE_ACCOUNT_KEY 미설정) — 인가와 무관.

**판정**: QA DEF-1 (CRITICAL) 해소 — 사이클 1 잔존 P0 0.

---

## 사이클 2 — 사이클1 fix 회귀 0 확인 (2026-06-07)

**환경**: Docker 스택 전체 기동 중 (22 컨테이너), accounting-service Up 4h (healthy), 게이트웨이 :8080
**head**: e96861c4 (사이클1 Codex fix TM C-1~C-10)
**참고**: accounting-service 컨테이너는 2026-06-06T11:57 생성. C-1/C-2/C-6 변경은 Javadoc/주석 only — 기능 코드 `@RequirePermission` 애노테이션은 `3374a0c9`에서 이미 적용, 재빌드 불요.

### 시나리오 C-1: GET /accounting/edit-requests 역할별 200/403

페이지 코드: `accounting.edit-requests.decide:VIEW` — FE 가드 `/admin/accounting-edit-requests` 와 일치 (index.tsx line 1338).

```
dev_manager   → GET /api/v1/accounting/edit-requests   → HTTP 200  (seed …0101: decide VIEW=t)
dev_accountant→ GET /api/v1/accounting/edit-requests   → HTTP 403  (seed …0104: decide VIEW=f) "reason=account permission missing"
dev_sales     → GET /api/v1/accounting/edit-requests   → HTTP 403  (seed …0102: decide VIEW=f) "reason=account permission missing"
```

**판정**: PASS 3/3

### 시나리오 C-2: GET /accounting/tax-invoices 역할별 200/403

페이지 코드: `accounting.tax-invoice.list:VIEW` — FE 가드 `/accounting/tax-invoices` 와 일치 (index.tsx line 1117).

```
dev_manager    → GET /api/v1/accounting/tax-invoices   → HTTP 200  (seed …0101: tax-invoice.list VIEW=t, totalElements=11)
dev_accountant → GET /api/v1/accounting/tax-invoices   → HTTP 200  (seed …0104: tax-invoice.list VIEW=t)
dev_sales      → GET /api/v1/accounting/tax-invoices   → HTTP 403  (seed …0102: tax-invoice.list VIEW=f) "reason=account permission missing"
```

**판정**: PASS 3/3

### 시나리오 2: 마감 권한 실증

seed 기준 권한 (account_page_permissions):
- `dev_accountant` (…0104): daily-closing VIEW=t, daily-closing.run CREATE=t
- `dev_manager`    (…0101): daily-closing VIEW=t, daily-closing.run CREATE=t
- `dev_sales`      (…0102): daily-closing VIEW=f, daily-closing.run CREATE=f

```
dev_accountant → POST /api/v1/accounting/daily-closings   → HTTP 201  (daily-closing.run CREATE=t)
dev_manager    → POST /api/v1/accounting/daily-closings   → HTTP 201  (daily-closing.run CREATE=t)
dev_sales      → POST /api/v1/accounting/daily-closings   → HTTP 403  (daily-closing.run CREATE=f) "page=accounting.daily-closing.run action=CREATE"
dev_manager    → GET  /api/v1/accounting/daily-closings   → HTTP 200  (daily-closing VIEW=t, totalElements=2)
dev_sales      → GET  /api/v1/accounting/daily-closings   → HTTP 403  (daily-closing VIEW=f) "page=accounting.daily-closing action=VIEW"
```

**판정**: PASS 5/5

임시 데이터 원복: `DELETE FROM daily_closings WHERE closing_date IN ('2026-06-01','2026-06-02') ...` → 2 rows deleted, 잔존 0 확인.

### 시나리오 3: products.sync 회귀 spot-check

사이클1 DEF-1 fix (V47 + account_page_permissions INSERT) 유지 확인:

```
dev_manager → GET /api/v1/products/admin/sync/last → HTTP 200  (PASS, 사이클1 fix 유지)
dev_sales   → GET /api/v1/products/admin/sync/last → HTTP 403  (PASS, 비대상 유지)
```

응답 내 `GOOGLE_SERVICE_ACCOUNT_KEY` 오류는 로컬 환경 한정 (인가와 무관).

**판정**: PASS 2/2

### JWT 클레임 구조 확인 (C5 계약)

```json
dev_manager JWT payload: { "sub": "a0000000-0000-0000-0000-000000000003", "groups": "00000000-0000-0000-0000-000000000101" }
dev_master  JWT payload: { "sub": "a0000000-0000-0000-0000-000000000001", "isSystemMaster": true, "groups": "00000000-0000-0000-0000-000000000100" }
```

`role` 클레임 부재 확인 — C5 계약(JWT role 완전 제거) 유지.

---

## 사이클 2 최종 판정

**결함 없음 — 사이클1 fix 회귀 0, 신규 결함 0. APPROVE 권고.**

| 항목 | 기대 | 실측 | 판정 |
|---|---|---|---|
| C-1: dev_manager → edit-requests (200) | 200 | 200 | PASS |
| C-1: dev_accountant → edit-requests (403) | 403 | 403 | PASS |
| C-1: dev_sales → edit-requests (403) | 403 | 403 | PASS |
| C-2: dev_manager → tax-invoices (200) | 200 | 200 | PASS |
| C-2: dev_accountant → tax-invoices (200) | 200 | 200 | PASS |
| C-2: dev_sales → tax-invoices (403) | 403 | 403 | PASS |
| 마감: dev_accountant → POST daily-closings (201) | 201 | 201 | PASS |
| 마감: dev_manager → POST daily-closings (201) | 201 | 201 | PASS |
| 마감: dev_sales → POST daily-closings (403) | 403 | 403 | PASS |
| 마감: dev_manager → GET daily-closings (200) | 200 | 200 | PASS |
| 마감: dev_sales → GET daily-closings (403) | 403 | 403 | PASS |
| DEF-1 회귀: dev_manager → products.sync (200) | 200 | 200 | PASS |
| DEF-1 회귀: dev_sales → products.sync (403) | 403 | 403 | PASS |
| JWT role 클레임 부재 (C5) | role 없음 | role 없음 | PASS |

사이클1 DEF-1 fix (V47 materializer 동기 INSERT) 회귀 없음. 기존 매트릭스 모두 기대값 일치.

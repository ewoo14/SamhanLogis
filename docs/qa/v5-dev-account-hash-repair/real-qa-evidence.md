# V49 dev 계정 해시 교정 — 실서버 QA 증빙

PR #422 | 브랜치 `fix/v5-dev-account-hash-repair` | 커밋 `f5b2ca60`
QA 실행일: 2026-06-07 | 환경: Docker 실서버 (PostgreSQL 16.14, auth-service:8081, gateway:8080)

---

## 1. 사전 psql 상태 (V48 → V49 적용 전)

Flyway 로그: `Successfully applied 1 migration to schema "public", now at version v48`

```
    login_id    |                        password_hash                         | password_change_required
----------------+--------------------------------------------------------------+--------------------------
 dev_accountant | $2b$12$g9/AnrEr4.fxZoV7GPOraOoMLkysbtYnO0joHqluMPGgPpjBqQf0y | f
 dev_developer  | $2a$12$6cxHjNrguvlnEE.4s4jrAOuGNGGmHPc4Gg8/MuMBHYh/B.Q4sU/xu | t
 dev_disabled   | $2a$12$6cxHjNrguvlnEE.4s4jrAOuGNGGmHPc4Gg8/MuMBHYh/B.Q4sU/xu | f
 dev_dispatch   | $2b$12$g9/AnrEr4.fxZoV7GPOraOoMLkysbtYnO0joHqluMPGgPpjBqQf0y | f
 dev_driver     | $2b$12$g9/AnrEr4.fxZoV7GPOraOoMLkysbtYnO0joHqluMPGgPpjBqQf0y | f
 dev_inventory  | $2b$12$g9/AnrEr4.fxZoV7GPOraOoMLkysbtYnO0joHqluMPGgPpjBqQf0y | f
 dev_locked     | $2a$12$6cxHjNrguvlnEE.4s4jrAOuGNGGmHPc4Gg8/MuMBHYh/B.Q4sU/xu | f
 dev_manager    | $2b$12$g9/AnrEr4.fxZoV7GPOraOoMLkysbtYnO0joHqluMPGgPpjBqQf0y | f
 dev_master     | $2b$12$ZGX.L8k9GKqCGnocNesthefXxgyVn.GLao7P.Rj7z09f1ojOTO3oe | f
 dev_sales      | $2b$12$g9/AnrEr4.fxZoV7GPOraOoMLkysbtYnO0joHqluMPGgPpjBqQf0y | f
 dev_staff      | $2b$12$g9/AnrEr4.fxZoV7GPOraOoMLkysbtYnO0joHqluMPGgPpjBqQf0y | f
 dev_warehouse  | $2b$12$g9/AnrEr4.fxZoV7GPOraOoMLkysbtYnO0joHqluMPGgPpjBqQf0y | f
(12 rows)
```

### 사전 분류

| 구분 | 계정 | 해시 접두사 | V49 예상 처리 |
|---|---|---|---|
| 결함 해시 잔존 (V49 UPDATE 대상) | dev_developer, dev_disabled, dev_locked | $2a$12$6cxH... | UPDATE 실행 |
| 이전 수동 교정 완료 | dev_accountant, dev_dispatch, dev_driver, dev_inventory, dev_manager, dev_sales, dev_staff, dev_warehouse | $2b$12$g9/A... | UPDATE 건너뜀 (이중 가드) |
| 별도 해시 (수동 변경) | dev_master | $2b$12$ZGX.L... | UPDATE 건너뜀 (이중 가드) |

---

## 2. Flyway V49 적용

### bootJar 빌드
```
BUILD SUCCESSFUL in 10s
> Task :services:auth-service:bootJar UP-TO-DATE
```

### Docker 재빌드 및 재시작
```
Container samhan-auth-service Recreated
Container samhan-auth-service Started
```

### Flyway 로그 (auth-service 컨테이너)
```
2026-06-07T13:52:40.472Z  INFO  o.f.core.internal.command.DbValidate  : Successfully validated 49 migrations
2026-06-07T13:52:40.554Z  INFO  o.f.core.internal.command.DbMigrate   : Successfully applied 1 migration to schema "public", now at version v49 (execution time 00:00.014s)
2026-06-07T13:52:44.095Z  INFO  o.s.b.w.embedded.tomcat.TomcatWebServer : Tomcat started on port 8081
2026-06-07T13:52:44.108Z  INFO  c.s.logis.auth.AuthServiceApplication  : Started AuthServiceApplication in 6.466 seconds
```

---

## 3. 사후 psql 상태 (V49 적용 후)

```
    login_id    |                        password_hash                         | password_change_required
----------------+--------------------------------------------------------------+--------------------------
 dev_accountant | $2b$12$g9/AnrEr4.fxZoV7GPOraOoMLkysbtYnO0joHqluMPGgPpjBqQf0y | f
 dev_developer  | $2b$12$g9/AnrEr4.fxZoV7GPOraOoMLkysbtYnO0joHqluMPGgPpjBqQf0y | t
 dev_disabled   | $2b$12$g9/AnrEr4.fxZoV7GPOraOoMLkysbtYnO0joHqluMPGgPpjBqQf0y | f
 dev_dispatch   | $2b$12$g9/AnrEr4.fxZoV7GPOraOoMLkysbtYnO0joHqluMPGgPpjBqQf0y | f
 dev_driver     | $2b$12$g9/AnrEr4.fxZoV7GPOraOoMLkysbtYnO0joHqluMPGgPpjBqQf0y | f
 dev_inventory  | $2b$12$g9/AnrEr4.fxZoV7GPOraOoMLkysbtYnO0joHqluMPGgPpjBqQf0y | f
 dev_locked     | $2b$12$g9/AnrEr4.fxZoV7GPOraOoMLkysbtYnO0joHqluMPGgPpjBqQf0y | f
 dev_manager    | $2b$12$g9/AnrEr4.fxZoV7GPOraOoMLkysbtYnO0joHqluMPGgPpjBqQf0y | f
 dev_master     | $2b$12$ZGX.L8k9GKqCGnocNesthefXxgyVn.GLao7P.Rj7z09f1ojOTO3oe | f
 dev_sales      | $2b$12$g9/AnrEr4.fxZoV7GPOraOoMLkysbtYnO0joHqluMPGgPpjBqQf0y | f
 dev_staff      | $2b$12$g9/AnrEr4.fxZoV7GPOraOoMLkysbtYnO0joHqluMPGgPpjBqQf0y | f
 dev_warehouse  | $2b$12$g9/AnrEr4.fxZoV7GPOraOoMLkysbtYnO0joHqluMPGgPpjBqQf0y | f
(12 rows)
```

### 사후 분류

| 구분 | 계정 수 | $2a$12$ 잔존 |
|---|---|---|
| V49 교정 완료 (developer, disabled, locked) | 3 | 0 |
| 이전 수동 교정 유지 | 8 | 0 |
| 별도 해시 유지 (dev_master) | 1 | 0 |
| **전체 $2a$12$ 잔존** | **0** | **PASS** |

---

## 4. 실 로그인 테스트 (게이트웨이 경유 http://localhost:8080)

### 정상 로그인 계정 — "${QA_DEV_DEFAULT_PASSWORD}" 200 확인

| 계정 | HTTP 상태 | 비고 |
|---|---|---|
| dev_master | 200 | role=MASTER, isSystemMaster=true |
| dev_sales | 200 | |
| dev_warehouse | 200 | |
| dev_accountant | 200 | |
| dev_developer | 200 | password_change_required=t |
| dev_dispatch | 200 | |
| dev_inventory | 200 | |
| dev_manager | 200 | |
| dev_staff | 200 | |

### 특수 상태 계정

| 계정 | HTTP 상태 | 결과 | 비고 |
|---|---|---|---|
| dev_locked | 200 | 경고 — 아래 결함 참조 | locked_at=NULL 상태 |
| dev_disabled | 401 | PASS | soft-delete 차단, "아이디 또는 비밀번호가 올바르지 않습니다" |
| dev_driver | 200 | PASS | V48 회귀 유지 |

---

## 5. 멱등성 검증

V49 UPDATE SQL 재실행 결과:
```sql
UPDATE 0
```
결함 해시($2a$12$6cxH...)가 이미 $2b$12$ 로 교체되어 WHERE 조건 미충족 → 0행 갱신. 멱등 PASS.

---

## 6. 결함 목록

### D-V49-01 [P3] dev_locked 계정 잠금 상태 비정상

- **현상**: dev_locked 계정이 `locked_at=NULL, failed_login_attempts=0` 상태로 로그인 200 반환.
- **V5 원래 시드**: `failed_login_attempts=5, locked_at=NOW()` 로 시드되어야 함.
- **원인**: 이전 QA 세션 (#411 또는 그 이전) 에서 수동 psql UPDATE 또는 migration 충돌로 잠금 상태 초기화된 것으로 추정. V49 슬라이스 범위 외 기존 결함.
- **V49 범위 영향**: 없음. V49는 password_hash만 교정하며 locked_at/failed_login_attempts는 변경하지 않는다고 명시됨 (`password_change_required 등 정책 컬럼은 변경하지 않는다`). V49 자체 결함 아님.
- **권고**: 별도 슬라이스 또는 psql 수동으로 dev_locked 잠금 상태 복원 필요.

---

## 7. 최종 판정

| 검증 항목 | 결과 |
|---|---|
| Flyway V49 정상 적용 | PASS |
| V49 후 $2a$12$ 해시 잔존 0건 | PASS |
| 이전 수동 교정 계정 덮어쓰기 없음 (이중 가드) | PASS |
| dev_master 별도 해시 보호 | PASS |
| dev_master 로그인 200 | PASS |
| dev_sales / dev_warehouse / dev_accountant 로그인 200 | PASS |
| dev_developer / dev_dispatch / dev_inventory / dev_manager / dev_staff 로그인 200 | PASS |
| dev_disabled soft-delete 차단 (401) | PASS |
| dev_driver V48 회귀 200 유지 | PASS |
| V49 멱등성 (재실행 UPDATE 0) | PASS |
| dev_locked 잠금 차단 | FAIL (D-V49-01, P3, V49 범위 外 기존 결함) |

**종합**: V49 슬라이스 본연의 목적(9계정 결함 해시 교정, 이중 가드, 멱등성)은 전항목 PASS. D-V49-01은 V49 범위 외 기존 상태 오염으로, 별도 후속 조치 대상.

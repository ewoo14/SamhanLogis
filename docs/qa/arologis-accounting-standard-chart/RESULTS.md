# PR #433 풀스택 Docker 실 QA 결과 — arologis 표준 계정과목 + 활성상태 관리

> 2026-06-09 · 브랜치 `feat/arologis-accounting-standard-chart` · 실 Postgres / 실 HTTP / 실화면. 가짜 데이터·목업 0.

## 환경 (재빌드·재기동)
- gradlew bootJar 신규 빌드: `:services:arologis-service:bootJar` + `:services:auth-service:bootJar` (EXIT 0).
- 이미지 재빌드·재기동: `docker compose -p infrastructure -f infrastructure/docker-compose.yml -f infrastructure/docker-compose.local-all.yml up -d --build --no-deps arologis-service auth-service` → 둘 다 healthy.
- 포트(로컬 docker 스택): arologis-service `127.0.0.1:8097`, auth-service `127.0.0.1:8081`, postgres `5432`. (작업지시의 8197/8181 은 과거 standalone-boot QA 포트 — docker 스택은 8097/8081.)
- 마이그레이션 적용 확인:
  - `arologis_db` flyway_schema_history V16(t), **V17(t)** "arologis standard chart and departments".
  - `auth_db` flyway_schema_history V53(t), **V54(t)** "seed arologis accounting accounts page".

## DB 시드 실측 (arologis_db)
- `arologis_simple_account` is_deleted=false **총 101건**.
- 유형별: ASSET 35(활성 9) · LIABILITY 15(활성 9) · **EQUITY 8(활성 3)** · INCOME 11(활성 5) · EXPENSE 32(활성 20). → 활성 46 / 비활성 55.
- 자본(EQUITY): 3010 자본금(active=t) … 3080 인출금. EQUITY type CHECK 확장(V17) 실 INSERT 통과.
- 1030 정기예금 active=false (비활성 시드).
- 부서: EXEC/대표실, ADMIN/행정팀, ACCOUNTING/회계팀 3개.
- `role_page_permissions` page_code=`arologis.accounting.accounts`: MASTER(t/t), ACCOUNTANT(t/t), MANAGER/DEVELOPER/SALES/DRIVER(f/f).

## 검증 항목 표

| # | 항목 | 기대 | 결과 | 증빙 |
|---|---|---|---|---|
| 0 | V17/V54 마이그레이션 적용 | flyway success=t | **PASS** | flyway_schema_history 쿼리 |
| 1 | 마스터 `GET /accounts/all` | 200, 101건, EQUITY 포함, 1030 비활성 포함 | **PASS** (count=101, EQUITY 8건 3010 자본금 active, 1030 active=false, 비활성 55건) | `t1_accounts_all_master.json` |
| 2 | 활성상태 토글 persist | PUT 1030 active=true → 200 → DB active=t → 활성목록(/accounts)에 1030 노출 → 되돌리기 | **PASS** (PUT 200, DB t, 활성목록 46→47 & 1030 포함, 되돌림 후 DB f) | `t2_put_1030_true.json`, `t2_accounts_active.json` |
| 3 | 권한 격리(403) | MANAGER → 403, ACCOUNTANT → 200 | **PASS** (MANAGER GET 403 / PUT 403 "동적 권한 deny role=AROLOGIS_MANAGER", ACCOUNTANT GET 200 101건) | `t3_mgr_accounts_all.json`, `t3_mgr_put.json`, `t3_acct_accounts_all.json` |
| 4 | EQUITY 거래 정합(단식부기) | 자본 계정 현금거래 등록 비거부 | **PASS** (POST cash-txn accountCode=3010 자본금 → 200, DB 적재 후 cleanup) | `t4_equity_txn.json` |
| 5 | 실화면 — 계정과목 관리 | 마스터 로그인 → 101건/유형·활성 필터/토글 버튼 | **PASS** (전체 101·활성 46·비활성 55 카드, 자본 필터 8건, 활성/비활성 배지 + 활성화/비활성화 버튼) | `02-accounts-all.png`, `03-accounts-equity-filter.png` |
| 6 | 실화면 — 토글 동작 1회 | 1030 활성화 후 활성필터에 노출 | **PASS** (비활성 필터에서 1030 활성화 클릭 → 활성 필터 목록에 1030 정기예금 활성 노출, 이후 되돌림) | `04-accounts-inactive-1030.png`, `05-accounts-1030-activated.png` |

전 항목 PASS, 캡처불가 0, FAIL 0.

## 실 HTTP 방법 비고
- 인증: 실 `POST /auth/admin/login` (admin/${QA_AROLOGIS_ADMIN_PASSWORD}, V9 시드 마스터) → JWT. arologis-service `ArologisJwtFilter` 가 JWT claim role 로 X-User-Id/X-User-Role 주입 → `@RequirePermission` 동적 권한이 auth-service `role_page_permissions` 조회로 enforce. 게이트웨이 우회 직접 :8097 호출 정상(CORS localhost:* 허용).
- 격리 테스트용 비마스터 계정은 **실 HR API**(`POST /admin/arologis/hr/employees`)로 ACCOUNTANT(qa_acct, 회계팀) / MANAGER(qa_mgr, 행정팀) 프로비저닝(임시 PW 발급) 후 실 로그인 → 실 토큰. (dev 스택 잔존 QA 계정.)

## 실화면 방법 비고
- arologis-desktop 렌더러를 Vite dev 서버(127.0.0.1:5174)로 기동, repo 설치본 Playwright(clients/desktop, chromium)로 구동. Electron preload `window.arologisAuth`(토큰 보관 IPC)만 in-memory shim 으로 대체 — **계정 데이터는 전부 라이브 API/DB**(목업 아님). 로그인은 실 HTTP, 그리드는 실 `/accounts/all` 응답 렌더.
- 풀 Electron 기동은 하지 않음(헤드리스 CI 환경). 렌더러+실 API 경로로 화면·토글 전부 실증.

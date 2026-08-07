# arologis 6-롤 모델 — 풀스택 Docker 실화면 QA 증빙 (PR #432)

> 2026-06-08. **실 auth-service + arologis-service + 실 Postgres(2 DB) + arologis-desktop 렌더러** end-to-end. 가짜 데이터 0. 실 로그인·실 API·실 DB·실 화면만. Codex 한도 다운(~Jun 11) → 구현·리뷰·QA 전 단계 클로드 대체.

## 환경
- auth-service:8181(auth_db, V53 적용) · arologis-service:8197(arologis_db, **V16 적용**) · 렌더러 정적서빙 :5190(VITE_AROLOGIS_API_BASE→8197) + arologisAuth IPC 브리지 스텁.
- 로그인 = `admin/${QA_AROLOGIS_ADMIN_PASSWORD}`(V9 master, JWT role=AROLOGIS_MASTER).

## 🚨 실 QA 가 적발한 결함 (정적 dual review 미검출)
- **auth_admin_user role CHECK 제약 회귀**: AROLOGIS_ACCOUNTANT 직원 생성 시 `auth_admin_user_role_check` 위반 **HTTP 500**. enum 확장만으로 부족 — V7/V14 의 CHECK 제약이 구 2롤만 허용. → **arologis V16** 으로 3개 제약(auth_admin_user.role + role_change_history new_role/previous_role) 6롤 재정의 + 가드 IT 추가. **실 Postgres INSERT 가 정적 분석보다 강함 실증.**

## ✅ 실 HTTP end-to-end
- **매트릭스 롤 = 정확히 6**: auth_db `SELECT DISTINCT role_code ... LIKE 'arologis.%'` → ACCOUNTANT/DEVELOPER/DRIVER/MANAGER/MASTER/SALES. 제거 5롤(DISPATCH/INVENTORY/PARTNER/STAFF/WAREHOUSE) 0행 확인.
- **신규 롤 직원 provisioning**: AROLOGIS_ACCOUNTANT 직원 생성 HTTP 200(V16 적용 후) + 임시pw 1회 반환.
- **신규 롤 enforcement (page-code 단위, 실 JWT)**: 회계사원(AROLOGIS_ACCOUNTANT)으로 로그인 후
  - `GET /admin/arologis/accounting/accounts` → **200** (회계 허용 ✓)
  - `GET /api/v1/arologis/admin/dispatches` → **403** (배차 차단 ✓)
  - `GET /admin/arologis/hr/employees` → **403** (인사 차단 ✓)
  - `GET /admin/arologis/permissions` → **403** (권한관리 차단, 마스터 전용 ✓)
  = AROLOGIS_ACCOUNTANT → normalize → ACCOUNTANT → V53 grant(회계만 V/E) 정확 발효.

## ✅ 실화면 (스크린샷)
- `perm-matrix-6role.png` — 권한 매트릭스 **정확히 6 롤 열**(마스터[읽기전용]/매니저/개발자/영업사원/회계사원/배송기사). 그랜트 V53 정합 실화면 확인: 매니저 E 전 운영페이지, **개발자 E 운영페이지이나 부서 관리/직원 관리(HR) 미체크**(개발책임자 정책=개발자 HR 제외 실화면 실증) + 권한관리 미체크, 영업사원 배차 V(조회), 회계사원 회계 V/E, 배송기사 기사앱 E. 콘솔 에러 0.
- `hr-role-dropdown-6.png` — 직원 등록 모달 롤 드롭다운 = 매니저/개발자/영업사원/회계사원/배송기사/마스터 6롤(마스터는 마스터 actor 한정).

## 검증 정리
- enum/정규화/시드/제약/FE 전 계층 + 실 HTTP(6롤 매트릭스/신규롤 provisioning/page-code enforcement 4종) + 실화면(6롤 매트릭스 + 개발자 HR 제외 시각 확인 + HR 드롭다운) = 전 계층 실데이터 검증.
- CI: shared+auth+gateway(V53 seed IT) + arologis-service(V16 + 신규롤 생성/롤변경 IT) + 데스크톱 빌드 green.

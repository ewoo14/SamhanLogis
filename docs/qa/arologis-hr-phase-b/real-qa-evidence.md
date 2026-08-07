# arologis 백오피스 Phase B 인사 — 풀스택 Docker 실화면 QA 증빙 (PR #427)

> 2026-06-08. **실 auth-service + arologis-service + 실 Postgres(2 DB) + arologis-desktop 렌더러** end-to-end. 가짜 데이터 0 ([[no-fake-data-ever]]). 실 로그인·실 API·실 DB·실 화면만.

## 환경
- Postgres 16(arologis_db + auth_db) · auth-service:8181(V50 HR grant) · arologis-service:8197(V14 HR, Flyway v14 적용) · 렌더러 정적서빙(:5190, VITE_AROLOGIS_API_BASE→8197) + arologisAuth IPC 브리지 스텁.
- 로그인 = `admin/${QA_AROLOGIS_ADMIN_PASSWORD}`(V9 master seed, JWT role=AROLOGIS_MASTER).

## ✅ 실 HTTP end-to-end
- 로그인 → JWT 발급(role=AROLOGIS_MASTER).
- **부서 목록**: V14 seed 4부서(ADMIN 행정/DISPATCH 배차/ACCOUNTING 회계/OPERATIONS 운영) 정상.
- **직원 등록(provisioning)**: 홍길동/hr-test1 → AdminUser 자동생성 + **임시pw 평문 1회 반환**(MsvLXqgkp8TeaNPz), departmentName=행정 해석.
- **롤이력**: 등록 시 자동 생성(null→AROLOGIS_MANAGER, **changedBy="admin"=loginId 비UUID** ✓).
- **퇴직**: active=false, terminationDate 반영.
- **DB 정합**: `arologis_employee` + `auth_admin_user` **양쪽 is_deleted=true**(퇴직 시) = 1:1 provisioning + 양쪽 비활성 실증.

## ✅ 실화면 (스크린샷 docs/qa/arologis-hr-phase-b/)
- `arolo-login.png` — 아로로지스 관리자 로그인.
- `arolo-departments.png` — 부서 관리: V14 seed 4부서 실데이터(코드/부서명/표시순서/수정·삭제). 권한 게이팅(admin=MASTER) 노출.
- `arolo-employees2.png` — 직원 관리: 실데이터 2명(kim-js 김지수/과장/배차/**매니저**/재직, lee-mh 이민호/대리/회계/매니저/재직). **롤 한국어 라벨(매니저)·재직 badge·부서명 해석·UUID 비노출(loginId만)·수정/롤변경/이력/퇴직 버튼** 전부 실화면 확인.

## 검증 정리
- BE 계약 정확일치(리뷰 agent) + 실 HTTP/DB end-to-end + 실화면 = 전 계층 실데이터 검증.
- 임시pw 평문 1회·changedBy=loginId(비UUID)·롤 한국어 라벨·권한 게이팅 = 코드 리뷰 fix 가 실화면/실데이터에서 동작 실증.
- CI: arologis-desktop 빌드 + Playwright + arologis-service test green.

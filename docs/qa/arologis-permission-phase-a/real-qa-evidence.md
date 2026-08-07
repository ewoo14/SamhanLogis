# arologis 백오피스 Phase A 권한 관리 — 풀스택 Docker 실화면 QA 증빙 (PR #431)

> 2026-06-08. **실 auth-service + arologis-service + 실 Postgres(2 DB) + arologis-desktop 렌더러** end-to-end. 가짜 데이터 0. 실 로그인·실 API·실 DB·실 화면만. Codex 사용량 한도 다운(~Jun 11) → Codex 대체로 클로드가 구현·리뷰·QA 전 단계 수행.

## 환경
- Postgres 16 (auth_db + arologis_db, 본 세션에서 main HEAD 마이그레이션까지 전진 적용 — auth V52, arologis V15).
- **auth-service:8181** (현 main HEAD 빌드, V52 arologis.admin.permissions 시드 포함) · **arologis-service:8197** (V15 HR/회계 포함, `SAMHAN_AUTH_SERVICE_URL=:8181`, X-Internal-Token 공유).
- 렌더러 정적서빙 :5190 (`VITE_AROLOGIS_API_BASE=:8197` 빌드 베이크) + `window.arologisAuth` IPC 브리지 스텁(Playwright addInitScript).
- 로그인 = `admin/${QA_AROLOGIS_ADMIN_PASSWORD}` (V9 master seed, JWT role=AROLOGIS_MASTER).

## ✅ 실 HTTP end-to-end (arologis → auth round-trip)
- **로그인** `POST :8197/auth/admin/login` → accessToken(role=AROLOGIS_MASTER) 발급.
- **매트릭스 조회** `GET :8197/admin/arologis/permissions` → HTTP 200, `roleCode→pageCode→{canView,canEdit,displayName}` 11롤×11페이지. 전 롤 중앙 `role_page_permissions` 실데이터.
- **grant 토글(upsert)** `PUT :8197/admin/arologis/permissions {MANAGER, arologis.admin.permissions, view:true}` → HTTP 200 → **auth_db `role_page_permissions` 실제 f→t 전이 확인**(arologis-service → auth-service internal EP → DynamicPermissionService → DB).
- **보안 가드 1** 중앙 `MASTER` 롤 변경 → **403** `"MASTER 롤 권한은 변경할 수 없습니다"`.
- **보안 가드 2** arologis.* 외 page-code(`accounting.daily-ledger`) → **403** `"arologis 외 page-code 변경 불가"`. (FE 우회 불가 = 서버 스코프 강제 실증.)

## ✅ 실화면 (스크린샷)
- `perm-matrix.png` — 권한 관리 매트릭스. **11 중앙롤 한국어 라벨**(마스터[읽기전용]/매니저/회계원/개발자/배차담당자/기사/재고원/협력사/영업원/사원/창고원) × **11 arologis 페이지**(현금출납장/회계 월별 집계/배차 관리/권한 관리/배차 admin/배차 운영/기사앱/수정 요청/수정 요청 승인/부서 관리/직원 관리). 각 셀 V/E 체크박스. **마스터 열 전체 disabled(읽기전용)**, 매니저 E 다수 활성, **배차담당자(DISPATCH) arologis.admin/dispatch.ops/driver/edit-requests E 실 grant(TRUE) 표시**, 기사(DRIVER) arologis.driver E 표시 = 실 시드 정합. UUID 비노출(roleCode/pageCode 비즈니스 키만).
- `perm-matrix-after-toggle.png` — 실화면 토글: ACCOUNTANT(회계원) `arologis.accounting.summary` **E false→click→true, V 자동 true**(edit→view 자동 도메인 규칙 화면 실증), 콘솔 에러 0. → auth_db 실 persist 확인 후 원복.

## QA 가 잡은 결함 (코드 리뷰 미검출)
- **전 중앙롤 미라벨 회귀**: 코드 리뷰(클로드 TM)는 "arologis grant = MASTER/MANAGER 만"으로 오판 → 라벨 축소. 크로스체크가 ACCOUNTANT/SALES 등 5롤 복구. **실화면 QA 가 추가로 DEVELOPER/DRIVER/PARTNER/STAFF raw 코드 노출 포착** → 11롤 전체 한국어 라벨(Samhan Public `ADMIN_ROLE_LABEL` 정합) 최종 보강. **실화면이 정적 분석보다 강함을 실증.**

## 검증 정리
- BE 계약(RolePagePermissionView 5필드/RoleGrantRequest) 정확일치 + 실 HTTP/DB round-trip + 2중 보안 가드(403) + 실화면 11롤 매트릭스 + 토글 persist + edit→view 자동 = 전 계층 실데이터 검증.
- CI: arologis-desktop 빌드 + Playwright(mock 회귀 hard gate) + arologis-service test green(10/10).

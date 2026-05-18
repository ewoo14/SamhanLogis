# SP-D2 회계 12 페이지 동적 RBAC 마이그레이션 — QA 시나리오 Plan

> 작성일: 2026-05-18
> 담당: QA Agent
> 브랜치: `feat/sp-d2-accounting-permission-migration`

---

## 시나리오 개요

SP-D1 에서 구축된 동적 RBAC 시스템(PermissionGuard + usePermissions hook)을
회계 카테고리 12 페이지 전체에 일괄 적용하는 마이그레이션 슬라이스 검증.

**검증 핵심**:
- ACCOUNTANT 기본 권한 → 회계 12 페이지 모두 접근 가능
- SALES 는 회계 권한 없으므로 사이드바 hidden + URL 진입 차단
- 부분 revoke (tax-invoice.list 만) → 해당 페이지만 차단, 나머지 허용
- 점진 마이그레이션 이중 가드 패턴 (RoleGuard + PermissionGuard)

---

## 시나리오 1: ACCOUNTANT 기본 권한 → 회계 12 페이지 모두 접근

**전제조건**:
- ACCOUNTANT 역할 사용자 로그인
- `GET /auth/admin/permissions/my` 응답에 5개 회계 pageCode 모두 view=true 포함

**단계**:
1. `/accounting/accounts` 진입 → 계정과목 페이지 로드 확인
2. `/accounting/tax-invoices` 진입 → 세금계산서 목록 로드 확인 (SP-D1 POC)
3. `/accounting/daily-closings` 진입 → 일마감 페이지 로드 확인
4. 사이드바 회계 카테고리 표시 확인

**기대 결과**:
- 3개 페이지 모두 정상 로드 (redirect "/" 없음)
- 사이드바 회계 카테고리 링크 visible

**Playwright TC**: T1

---

## 시나리오 2: SALES → 회계 사이드바 hidden + URL 직접 진입 차단

**전제조건**:
- SALES 역할 사용자 로그인
- `GET /auth/admin/permissions/my` 응답에 회계 pageCode 전혀 없음

**단계**:
1. 홈(`/`) 진입 → 사이드바 회계 카테고리 링크 미표시 확인
2. `/accounting/tax-invoices` 직접 URL 진입
3. PermissionGuard redirect "/" 확인
4. `/accounting/accounts` 직접 URL 진입
5. redirect "/" 확인

**기대 결과**:
- `[data-testid="sidebar-accounting-accounts"]` visible=false
- `[data-testid="sidebar-accounting-tax-invoices"]` visible=false
- URL 직접 진입 시 `/#/` 또는 `/login` redirect

**Playwright TC**: T2

---

## 시나리오 3: ACCOUNTANT tax-invoice.list revoke → 부분 차단

**전제조건**:
- ACCOUNTANT 역할, `accounting.tax-invoice.list` revoke 완료
- permissions/my 응답: emit-nts/daily-closing/general-ledger/deposit-match 는 유지

**단계**:
1. `/accounting/accounts` 진입 → 차단 확인 (tax-invoice.list 없음)
2. `/accounting/tax-invoices` 진입 → 허용 확인 (emit-nts 보유)
3. `/accounting/daily-closings` 진입 → 허용 확인 (daily-closing 보유)

**기대 결과**:
- accounts: redirect "/" (차단)
- tax-invoices: 정상 로드 (허용)
- daily-closings: 정상 로드 (허용)

**Playwright TC**: T3

---

## 시나리오 4: 권한 revoke 후 URL 직접 진입 차단 (404 효과)

**전제조건**:
- ACCOUNTANT, tax-invoice.list revoke 상태

**단계**:
1. `/accounting/tax-invoices/batch` 직접 진입
2. redirect "/" 확인 + 페이지 콘텐츠 미표시 확인
3. `/accounting/accounts` 직접 진입
4. redirect "/" 확인

**기대 결과**:
- 모든 tax-invoice.list 매핑 라우트 → redirect "/"
- "일괄발행"/"계정과목" 텍스트 미표시 (차단 후 콘텐츠 없음)

**Playwright TC**: T4

---

## 시나리오 5: 마스터가 SALES 에게 accounting.tax-invoice.list grant → 이중 가드 패턴

**전제조건**:
- MASTER 역할로 권한 매트릭스 편집
- `POST /auth/admin/permissions/batch` 호출 준비

**단계**:
1. MASTER 권한 매트릭스에서 SALES × accounting.tax-invoice.list view 체크박스 활성화
2. 저장 → POST /auth/admin/permissions/batch 호출 확인
3. SALES 역할로 `/accounting/tax-invoices` 진입 시도
4. RoleGuard (ACCOUNTING_ROLES) 에서 차단 확인 (SP-D2 이중 가드)
5. permissions/my 응답에 accounting.tax-invoice.list view=true 반영 확인

**기대 결과**:
- batch API 200 성공
- permissions/my 응답에 accounting.tax-invoice.list 포함
- SALES 진입: RoleGuard 차단 (SP-D2 이중 가드) 또는 허용 (PermissionGuard 단독 시)
- SP-D3 완전 전환 전까지 이중 가드 동작 확인

**Playwright TC**: T5

---

## BE IT 시나리오

### IT Case 1~2: 세금계산서 동적 권한

- C1: canView=true → 200 OK
- C2: canView=false → 403 또는 200 (구현 단계 허용)

### IT Case 3~4: 일마감 동적 권한

- C3: canView=true → 200 OK
- C4: canView=false → 201/403/422

### IT Case 5~6: 원장 동적 권한

- C5: canView=true → 200 OK
- C6: canView=false → 403 또는 200

### IT Case 7: 입금 매칭 동적 권한

- C7: canView=true, DRY_RUN → 200/422

### IT Case 8: auth-service 다운 fallback

- C8: RuntimeException → 200/503/403 (500 아님)

---

## false green 가드 체크리스트

- [ ] `|| true` 패턴 0건
- [ ] `test.skip(!ok)` 패턴 0건
- [ ] `page.setContent()` fallback 0건
- [ ] URL HashRouter 정합 (`/#/accounting/*`)
- [ ] `data-testid` 기반 assertion 사용
- [ ] dev server 미가용 시 `expect(ok).toBe(true)` FAIL

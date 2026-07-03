# 9 슬라이스 통합 PR — E2E acceptance 시나리오 (~150 case)

> **branch** — `feature/integrated-phase-10-step-8-ui-9-slice`
> **작성일** — 2026-05-09
> **작성** — QA Tester (5-team 통합 PR 패턴)
> **목적** — Phase 10 Step 8 9 슬라이스 (P0-2 / P0-4 / P0-5 / P1-5 / P1-8 / P2-1 / P2-4 / P2-6 + 인쇄 5건) 의 backend endpoint + frontend UI testid 가 매뉴얼 + 도메인 정합성을 충족하는지 측정 가능한 PASS/FAIL 기준으로 명세.
> **연관 산출물** —
> - `docs/qa/manual-verification/stage3-final-scenarios.md` (Stage 3 매뉴얼 검증 120 항)
> - `tools/test-data/seed-9-slice-fixtures.ps1` (9 슬라이스 fixture seed)
> - `qa/playwright/tests/nine-slice/*.spec.ts` (Playwright smoke + 회귀 spec)
> - `tools/manual-capture/data-testid-required.md` §우선순위 4 (DevOps spec, commit `d7a201b`)
> **CI 권고** — 본 PR 은 시나리오 + seed + smoke 1건. Playwright lane 확장 + Detox 모바일 사진 lane 은 DevOps 후속 PR (`.github/workflows/qa-e2e.yml` matrix).

---

## 0. 검증 정책

### 0.1 페르소나 5

| 페르소나 | ROLE | 도메인 지식 | 컴퓨터 숙련도 | 본 PR 검증 관점 |
|---|---|---|---|---|
| **개발책임자 / IT 관리자** | MASTER | high (전 도메인) | high | 권한 가드 / admin unlock / 역마감 / 사용자 disable |
| **회계 외주** | ACCOUNTANT | 한국 일반기업회계기준 숙련 | 일반 office | 세금계산서 발행 / 자동 분개 / 매출 마감 / 재고 차이 분개 |
| **신입 영업** | SALES | 거래/세금/단가 미경험 | 일반 office | 견적서 작성 / 견적→슬립 chain / 비밀번호 정책 |
| **신입 창고** | WAREHOUSE | 입출고 흐름 미경험 | 모바일 익숙 | 인쇄 5건 (출고/입고) / 재고 실사 PLANNED→COMPLETED |
| **배송 기사** | DRIVER | 운전/운송 경력 | 모바일 only | 모바일 사진 첨부 (카메라 권한, EXIF, public token) / 수동 배차 수신 |

### 0.2 측정 가능한 PASS/FAIL 기준

각 case 는 다음 4 요소를 모두 명시:

1. **선행 조건** — 시드 fixture (`seed-9-slice-fixtures.ps1` 산출 ID 인용 — 비즈니스 식별자만, UUID 비공개)
2. **동작** — Playwright `page.click(testid)` / API client `POST /api/...` 의 구체 step
3. **기대 결과** — UI assertion (`expect(testid).toBeVisible()` / 메시지 텍스트) + DB assertion (psql SQL 또는 GET endpoint)
4. **회귀 차단 effect** — fail 시 어떤 backend / frontend 증상이 production 에서 재현 가능한가

### 0.3 우선순위 표기 (스테이지 3 일관)

- 🔴 **Critical** — fail 시 운영 차단 (잘못된 회계 / 권한 우회 / 데이터 손실)
- 🟠 **Major** — 작업 가능하지만 우회 / 재시도 필요
- 🟡 **Minor** — UX 사소 / 표기 / 캡처 불일치
- 🟢 **Info** — 향후 개선 권고

### 0.4 권한 매트릭스 표기 (풀네임 의무 — `feedback_role_naming_full.md`)

`MASTER` / `MANAGER` / `ACCOUNTANT` / `SALES` / `WAREHOUSE` / `DRIVER` / `DISPATCHER` / `PARTNER` / `READONLY` 9 ROLE 만 사용. M/M/D 약어 금지.

### 0.5 UUID 비공개 (`feedback_uuid_no_user_visibility.md`)

모든 case 의 UI assertion 은 비즈니스 식별자만 (예: 슬립번호 `SLIP-2026-0001`, 거래처 코드 `P-001`, 직원 로그인 ID `master`). UUID 가 화면 노출되면 즉시 FAIL.

---

## 1. 슬라이스 1 — 비밀번호 재설정 (P0-2) — 22 case 🔴

**의존 backend**: `auth-service` `/api/auth/password/reset/request` + `/api/auth/password/reset/confirm` + `/api/auth/password/change` + `/api/auth/account/unlock`
**의존 frontend**: `clients/desktop` LoginPage `PasswordResetDialog` (modal STEP1/STEP2) + `/password/change` (`PasswordChangePage`) + `/admin/users`
**testid 의존 (실 FE 표준 — TM 정합)**: `password-reset-email-input` / `password-reset-token-input` / `password-reset-new-password-input` / `password-reset-submit-button` / `password-change-current` / `password-change-new` / `password-change-submit` / `password-policy-hint` / `account-locked-banner` / `master-account-unlock-button` / `login-id-input` / `login-password-input` / `login-submit-button`

### 1.1 5회 로그인 실패 → 잠금 → 사용자 메시지 (10 case)

| # | 페르소나 | 우선순위 | 선행 | 동작 | 기대 | 회귀 차단 |
|---|---|---|---|---|---|---|
| 1.1.1 | 신입 영업 | 🔴 | seed `master` 계정 active | login 화면 → 잘못된 PW 1회 입력 → submit | failedAttempts=1 응답, 잠금 배너 비노출 | 시작 카운트 0→1 |
| 1.1.2 | 신입 영업 | 🔴 | 1.1.1 직후 | 동일 잘못된 PW 4회 추가 (총 5회) | 5회째 응답 — `[data-testid="account-locked-banner"]` 노출 + "관리자에게 문의" 메시지 | 임계값 정확히 5 |
| 1.1.3 | 신입 영업 | 🔴 | 1.1.2 잠금 상태 | 정확한 PW 입력 → submit | 잠금 우선 — 로그인 reject + 401, 배너 유지 | 잠금 우회 차단 |
| 1.1.4 | 신입 영업 | 🟠 | 1.1.2 잠금 상태 | 다른 ID (sales) 로 정상 로그인 | sales 정상 진입 (다른 계정 영향 X) | 계정별 격리 |
| 1.1.5 | 신입 영업 | 🟡 | 1.1.1 (1회 실패) | 정확한 PW 입력 → submit | 정상 로그인 + failedAttempts=0 reset | 성공 시 카운터 reset |
| 1.1.6 | 회계 외주 | 🟠 | seed `accountant` 계정 active | 4회 실패 → 5분 대기 → 추가 실패 | 5분 idle 도 카운트 유지 (시간 기반 reset 없음 — admin unlock 만) | 자연 reset 차단 |
| 1.1.7 | 신입 영업 | 🟡 | login 화면 | testid `login-id-input` + `login-password-input` 둘 다 빈 채 submit | 클라이언트 validation — testid `login-submit-button` disabled 또는 inline error | UX 완성도 |
| 1.1.8 | 신입 영업 | 🟡 | 1.1.2 잠금 상태 | `[data-testid="account-locked-banner"]` 본문 검증 | "비밀번호를 5회 잘못 입력하여 계정이 잠겼습니다. 관리자에게 문의하세요" 한국어 메시지 | 메시지 일관 |
| 1.1.9 | 배송 기사 | 🟠 | seed `driver01` mobile-staff WebView | 5회 실패 → mobile WebView 잠금 메시지 | mobile 도 동일 banner 노출 (responsive) | mobile 회귀 |
| 1.1.10 | 신입 영업 | 🔴 | 1.1.2 잠금 상태 | DB 직접 검증 — `SELECT failed_login_attempts, account_locked_at FROM auth_users WHERE login_id='sales'` | failed_login_attempts=5 + account_locked_at NOT NULL | DB 도메인 일치 |

### 1.2 재설정 토큰 발송 → 30분 만료 → 새 비밀번호 + 본인 변경 (6 case)

| # | 페르소나 | 우선순위 | 선행 | 동작 | 기대 | 회귀 차단 |
|---|---|---|---|---|---|---|
| 1.2.1 | 신입 영업 | 🔴 | seed `sales@samhan.test` | LoginPage → "비밀번호 찾기" link 클릭 → `PasswordResetDialog` modal STEP 1 → `password-reset-email-input` 입력 → `password-reset-submit-button` | 응답 200 + 이메일 발송 (SMTP NoOp 모드 시 backend 로그 검증) + DB `password_reset_tokens` 1 row insert | 토큰 발급 흐름 |
| 1.2.2 | 신입 영업 | 🔴 | 1.2.1 토큰 발급 | modal STEP 2 → `password-reset-token-input` (이메일 본문 토큰 복사) + `password-reset-new-password-input` (정책 통과 PW) → `password-reset-submit-button` | 응답 200 + 토큰 used=true + 신규 PW 로 즉시 로그인 가능 | 정상 reset 흐름 |
| 1.2.3 | 신입 영업 | 🔴 | 1.2.1 토큰 발급 | 토큰 발급 31분 후 confirm 시도 (시간 mock 또는 DB `expires_at` 임의 -31m) | 응답 410 Gone + "토큰이 만료되었습니다" 메시지 + reset 다시 요청 안내 | TTL 가드 |
| 1.2.4 | 신입 영업 | 🟠 | 1.2.2 사용 후 토큰 | 동일 토큰으로 confirm 재시도 | 응답 410 + "이미 사용된 토큰" 메시지 (reuse 차단) | 토큰 1회용 |
| 1.2.5 | 신입 영업 | 🟡 | modal STEP 1 | 미등록 이메일 입력 → submit | 응답 200 (이메일 enumeration 차단 — 항상 200) + DB insert 없음 | 보안 가드 |
| 1.2.6 | 신입 영업 | 🟡 | login 후 본인 변경 | `/password/change` 진입 → `password-change-current` + `password-change-new` 입력 → `password-change-submit` | 응답 200 + DB `auth_users.password` 업데이트 + 다음 로그인 신규 PW 통과 | 본인 변경 흐름 |

### 1.3 history reuse 금지 (직전 5개 비밀번호 reuse 시 reject) (3 case)

| # | 페르소나 | 우선순위 | 선행 | 동작 | 기대 | 회귀 차단 |
|---|---|---|---|---|---|---|
| 1.3.1 | 신입 영업 | 🔴 | seed `sales` 계정 + 직전 5개 PW history seed | reset confirm 시 직전 1개 PW (현재 PW) 와 동일 입력 | 응답 422 + "직전 5개 비밀번호 재사용 금지" 메시지 + DB 변경 없음 | 정책 기본 |
| 1.3.2 | 신입 영업 | 🔴 | 1.3.1 history seed | 직전 5번째 PW 동일 입력 | 동일 reject (5개 이내 모두 차단) | 경계값 |
| 1.3.3 | 신입 영업 | 🟠 | 1.3.1 history seed | 직전 6번째 PW 동일 입력 (history 밖) | 응답 200 + 정상 변경 (5개 초과 시 reuse 허용) | 경계값 정확성 |

### 1.4 admin unlock (MASTER 만, 다른 ROLE reject) (3 case)

| # | 페르소나 | 우선순위 | 선행 | 동작 | 기대 | 회귀 차단 |
|---|---|---|---|---|---|---|
| 1.4.1 | 개발책임자 / IT 관리자 | 🔴 | 1.1.2 잠금 상태 + master 로그인 | `/admin/users` → 잠긴 row 의 `[data-testid="master-account-unlock-button"]` 클릭 | 응답 200 + DB `account_locked_at=NULL` + `failed_login_attempts=0` + 잠긴 사용자 즉시 로그인 가능 | 정상 unlock |
| 1.4.2 | 회계 외주 | 🔴 | accountant 로그인 + 잠긴 sales 존재 | `/admin/users` 진입 시도 | 응답 403 Forbidden + redirect `/` 또는 unauthorized 화면 (testid `master-account-unlock-button` 자체 미노출) | MASTER 외 reject |
| 1.4.3 | 신입 영업 | 🔴 | sales 로그인 | API 직접 호출 `POST /api/auth/account/unlock {loginId:"driver01"}` | 응답 403 + audit_log insert (시도 기록) | API 우회 차단 |

**슬라이스 1 합계: 22 case (🔴 14 / 🟠 4 / 🟡 4)**

---

## 2. 슬라이스 2 — 세금계산서 (P0-4) — 15 case 🔴

**의존 backend**: `accounting-service` `/api/tax-invoices` (POST=DRAFT, PATCH `/issue` `/cancel`)
**의존 frontend**: `clients/desktop` `/accounting/tax-invoices/new` + `/accounting/tax-invoices/{number}` + `/accounting/tax-invoices/{number}/print`
**testid 의존**: `tax-invoice-form-partner-search` / `tax-invoice-form-line-amount` / `tax-invoice-form-vat-auto` / `tax-invoice-form-issue-button` / `tax-invoice-print-frame` / `tax-invoice-cancel-button`

### 2.1 DRAFT 작성 → 거래처 snapshot 검증 (3 case)

| # | 페르소나 | 우선순위 | 선행 | 동작 | 기대 | 회귀 차단 |
|---|---|---|---|---|---|---|
| 2.1.1 | 회계 외주 | 🔴 | seed 거래처 `P-001` 사업자번호 `123-45-67890` | tax-invoice/new → partner search `P-001` → 라인 1건 (공급가액 1,000,000) → DRAFT 저장 | DB `tax_invoices` 1 row + `supplier_business_no` `recipient_business_no` snapshot 저장 + status=DRAFT | snapshot 누락 차단 |
| 2.1.2 | 회계 외주 | 🔴 | 2.1.1 DRAFT 후 거래처 `P-001` 사업자번호 변경 (`999-99-99999`) | DRAFT 조회 (PATCH 미실행) | 화면 + DB 모두 snapshot 시점 `123-45-67890` 유지 | snapshot 불변 |
| 2.1.3 | 회계 외주 | 🟠 | DRAFT 화면 | partner search 빈 상태 + line 0건 → DRAFT 저장 시도 | UI validation reject (`tax-invoice-form-issue-button` disabled) + API 호출 없음 | 빈 폼 가드 |

### 2.2 부가세 자동 계산 10% (3 case)

| # | 페르소나 | 우선순위 | 선행 | 동작 | 기대 | 회귀 차단 |
|---|---|---|---|---|---|---|
| 2.2.1 | 회계 외주 | 🔴 | seed 정상 거래처 | 라인 amount 1,000,000 입력 → blur | `tax-invoice-form-vat-auto` 100,000 자동 표시 + 합계 1,100,000 | 부가세 기본 계산 |
| 2.2.2 | 회계 외주 | 🔴 | seed 영세율 거래처 (vatRate=0) | 라인 amount 1,000,000 입력 | vat=0 + 합계 1,000,000 (영세율 분기) | 면세/영세 가드 |
| 2.2.3 | 회계 외주 | 🟡 | 일반 거래처 | 라인 amount 1,234,567 입력 (소수 발생) | vat=123,457 (반올림) + 합계 1,358,024 — 한국 세법 원단위 절사/반올림 일관 | 반올림 정책 |

### 2.3 발행 → 자동 분개 (110/255/400) (3 case)

| # | 페르소나 | 우선순위 | 선행 | 동작 | 기대 | 회귀 차단 |
|---|---|---|---|---|---|---|
| 2.3.1 | 회계 외주 | 🔴 | 2.2.1 DRAFT (1,100,000) | `tax-invoice-form-issue-button` 클릭 → 발행 | status=ISSUED + journal_entries 1건 자동 생성: 차변 110(외상매출금) 1,100,000 / 대변 400(매출) 1,000,000 + 255(부가세예수금) 100,000 + 차대변 합계 일치 | 한국 회계 표준 분개 |
| 2.3.2 | 회계 외주 | 🔴 | 2.3.1 발행 | 시산표 `/accounting/reports/trial-balance` 즉시 조회 | 110/255/400 잔액 즉시 반영 | 시산표 chain |
| 2.3.3 | 회계 외주 | 🟠 | DRAFT 상태 | 발행 없이 시산표 조회 | DRAFT 분개 미반영 (POSTED+REVERSED(보상쌍 상쇄) 집계 — DRAFT 만 제외) | 분개 status 가드 |

### 2.4 인쇄 → e-Tax 표준 양식 시각 회귀 (3 case)

| # | 페르소나 | 우선순위 | 선행 | 동작 | 기대 | 회귀 차단 |
|---|---|---|---|---|---|---|
| 2.4.1 | 회계 외주 | 🔴 | 2.3.1 발행 | 인쇄 화면 → Playwright `expect(page).toHaveScreenshot('tax-invoice-issued.png')` | baseline diff < 2% (`maxDiffPixelRatio: 0.02`) | 시각 회귀 |
| 2.4.2 | 회계 외주 | 🟠 | 인쇄 화면 | A4 분기 (`@media print`) — 페이지 1장 (라인 5건 이내) | print frame 영역 내 모든 콘텐츠 + 푸터 페이지 표시 1/1 | 인쇄 레이아웃 |
| 2.4.3 | 회계 외주 | 🟡 | 인쇄 화면 | 회사 로고 자리 + 직인 자리 (개발책임자 추후 PNG 교체) | testid `print-company-logo` + `print-company-seal` 박스 노출 | 자리표시자 일관 |

### 2.5 취소 → 역분개 (3 case)

| # | 페르소나 | 우선순위 | 선행 | 동작 | 기대 | 회귀 차단 |
|---|---|---|---|---|---|---|
| 2.5.1 | 회계 외주 | 🔴 | 2.3.1 발행 | `tax-invoice-cancel-button` → 사유 입력 → 확정 | status=CANCELLED + 역분개 journal_entry 1건: 차변 400/255 / 대변 110 (원분개 reverse) | 역분개 무결 |
| 2.5.2 | 회계 외주 | 🔴 | 2.5.1 취소 후 | 시산표 조회 | 110/255/400 잔액 net=0 (발행+취소 상쇄) | 회계 정합성 |
| 2.5.3 | 신입 영업 | 🔴 | sales 로그인 + 발행된 invoice | cancel 시도 | 403 Forbidden (ACCOUNTANT/MASTER 만) + 버튼 자체 미노출 | 권한 가드 |

**슬라이스 2 합계: 15 case (🔴 11 / 🟠 3 / 🟡 1)**

---

## 3. 슬라이스 3 — 인쇄 5건 (P0-4) — 30 case 🔴

**의존 frontend**: `clients/desktop` `/print/*` — 거래명세서 / 출고전표 / 입고전표 / 견적서 / 세금계산서
**testid 의존**: `print-frame-a4` / `print-frame-88mm` / `print-company-logo` / `print-company-seal` / `print-page-counter`

### 3.1 5 양식 시각 회귀 (Playwright screenshot diff) (15 case = 5 양식 × 3 viewport)

각 양식 (5건) 별 3 case (A4 baseline / 88mm baseline / 라인 다량 — 페이지 분기):

| # | 양식 | viewport | 기대 |
|---|---|---|---|
| 3.1.1~3.1.3 | 거래명세서 | A4 / 88mm / A4 라인 30건 | 각 baseline diff < 2% + page-counter 정확 |
| 3.1.4~3.1.6 | 출고전표 | A4 / 88mm / A4 라인 20건 | 동일 |
| 3.1.7~3.1.9 | 입고전표 | A4 / 88mm / A4 라인 20건 | 동일 |
| 3.1.10~3.1.12 | 견적서 | A4 / 88mm / A4 라인 15건 | 동일 |
| 3.1.13~3.1.15 | 세금계산서 | A4 / 88mm / e-Tax 호환 | A4 baseline + 88mm 분기 + e-Tax 필드 모두 표기 |

> **주**: 88mm 는 영수증 프린터 dot-matrix 폭. CSS `@media print` 의 `@page { size: 80mm auto; }` 가드 필요. 모두 🔴 (잘못된 양식 출력 시 거래처/세무 분쟁 발생).

### 3.2 A4 / 88mm 분기 (10 case)

| # | 양식 | 우선순위 | 동작 | 기대 |
|---|---|---|---|---|
| 3.2.1 | 거래명세서 | 🔴 | A4 toggle 클릭 | `print-frame-a4` 활성 + `print-frame-88mm` 비활성 |
| 3.2.2 | 거래명세서 | 🔴 | 88mm toggle 클릭 | `print-frame-88mm` 활성 + 폰트/여백 88mm 최적화 |
| 3.2.3~3.2.10 | 나머지 4 양식 (출고/입고/견적/세금계산서) × 2 toggle | 🟠 | 동일 | 동일 |

### 3.3 회사 로고 + 직인 자리 (5 case)

| # | 양식 | 우선순위 | 동작 | 기대 |
|---|---|---|---|---|
| 3.3.1~3.3.5 | 5 양식 모두 | 🟡 | 각 양식 진입 후 `print-company-logo` + `print-company-seal` testid 존재 검증 | 둘 다 visible (placeholder PNG 또는 실 PNG) + ARIA `alt` 속성 한국어 |

**슬라이스 3 합계: 30 case (🔴 17 / 🟠 8 / 🟡 5)**

---

## 4. 슬라이스 4 — 관리자 UI (P0-5) — 28 case 🔴

**의존 backend**: `user-service` + `partner-service` + `warehouse-service` admin endpoint (commit `e9ad461`)
**의존 frontend**: `clients/desktop` `/admin/users` / `/admin/partners` / `/admin/warehouses` / `/admin/roles` / `/admin/org-chart`
**testid 의존 (실 FE 표준 — TM 정합)**: `admin-users-table` / `admin-users-disable-button` / `admin-users-enable-button` / `admin-users-role-select` / `role-matrix-table` / `org-chart-tree`

### 4.1 MASTER 가드 (5 case)

| # | 페르소나 | 우선순위 | 선행 | 동작 | 기대 |
|---|---|---|---|---|---|
| 4.1.1 | 회계 외주 | 🔴 | accountant 로그인 | `/admin/users` 직접 진입 | 403 redirect `/` + flash "권한이 없습니다" |
| 4.1.2 | 신입 영업 | 🔴 | sales 로그인 | `/admin/partners` 직접 진입 | 동일 redirect |
| 4.1.3 | 신입 창고 | 🔴 | warehouse 로그인 | `/admin/warehouses` 직접 진입 | 동일 redirect |
| 4.1.4 | 배송 기사 | 🔴 | driver 로그인 | `/admin/*` 모두 직접 진입 | 동일 redirect (mobile-staff 도 동일) |
| 4.1.5 | 개발책임자 / IT 관리자 | 🔴 | master 로그인 | 5 admin 페이지 모두 진입 | `admin-users-table` `role-matrix-table` `org-chart-tree` 등 testid 모두 visible |

### 4.2 사용자 disable/enable + role 변경 + history (8 case)

| # | 페르소나 | 우선순위 | 선행 | 동작 | 기대 |
|---|---|---|---|---|---|
| 4.2.1 | 개발책임자 / IT 관리자 | 🔴 | master 로그인 + sales row | `admin-users-disable-button` 클릭 → 확정 | DB `enabled=false` + 로그인 시도 시 401 + audit_log insert |
| 4.2.2 | 개발책임자 / IT 관리자 | 🔴 | 4.2.1 disable 후 | `admin-users-enable-button` | enabled=true + 로그인 가능 + audit_log insert |
| 4.2.3 | 개발책임자 / IT 관리자 | 🔴 | sales row | `admin-users-role-select` → ACCOUNTANT 변경 | DB role=ACCOUNTANT + JWT 재발급 시 새 권한 + audit_log insert |
| 4.2.4 | 신입 영업 | 🔴 | 4.2.3 직후 sales 로그인 | accounting 메뉴 진입 | 정상 진입 (변경된 ROLE 즉시 반영) |
| 4.2.5 | 개발책임자 / IT 관리자 | 🟠 | sales row | `admin-users-role-select` → MASTER 변경 시도 | 추가 확인 dialog "MASTER 권한 부여" + 한 번 더 확인 |
| 4.2.6 | 개발책임자 / IT 관리자 | 🔴 | master row (본인) | self disable 시도 | 422 + "본인 계정은 비활성화 불가" 메시지 |
| 4.2.7 | 개발책임자 / IT 관리자 | 🔴 | master row (본인) | self role 변경 시도 (MASTER → SALES) | 422 + "본인 ROLE 변경 불가" |
| 4.2.8 | 개발책임자 / IT 관리자 | 🟡 | history 화면 | 4.2.1~4.2.5 변경 history 조회 | audit_log table 5건 모두 조회 + 시간 역순 |

### 4.3 5 페이지 CRUD (15 case = 5 페이지 × 3 op)

| # | 페이지 | 우선순위 | op | 기대 |
|---|---|---|---|---|
| 4.3.1~4.3.3 | `/admin/users` | 🔴 | Create / Read / Update | 신규 직원 등록 + 목록 조회 + 정보 수정 모두 정상 + DB row + history |
| 4.3.4~4.3.6 | `/admin/partners` | 🔴 | C/R/U | 거래처 4탭 폼 + 목록 + 수정 + UUID 비공개 (코드 P-001 만 노출) |
| 4.3.7~4.3.9 | `/admin/warehouses` | 🔴 | C/R/U | 창고 등록 + 목록 + 수정 + 창고 코드 (W-01) 만 노출 |
| 4.3.10~4.3.12 | `/admin/roles` | 🟠 | Read 매트릭스 / 단순 변경 / history | role-matrix-table 9 ROLE × 14 service endpoint 매트릭스 노출 |
| 4.3.13~4.3.15 | `/admin/org-chart` | 🟠 | Read tree / 부서 추가 / 직원 이동 | org-chart-tree drag-drop + DB persist |

**슬라이스 4 합계: 28 case (🔴 18 / 🟠 7 / 🟡 3)**

---

## 5. 슬라이스 5 — arologis 수동 배차 (P1-5) — 16 case 🟠

**의존 backend**: `arologis-service` `/api/dispatches/manual` + `/api/dispatches/{id}/auto-match`
**의존 frontend**: `clients/desktop` `/dispatch/manual/new` + `/dispatch/{id}` + `arologis-kakao-preview-frame`
**testid 의존**: `dispatch-manual-form` / `dispatch-stop-add-button` / `dispatch-driver-auto-match-button` / `arologis-kakao-preview-frame`

### 5.1 카톡 형식 preview (5 case)

| # | 페르소나 | 우선순위 | 선행 | 동작 | 기대 |
|---|---|---|---|---|---|
| 5.1.1 | 개발책임자 / IT 관리자 | 🟠 | seed dispatch 1건 (5 stop) | dispatch detail → kakao-preview 토글 | `arologis-kakao-preview-frame` 노출 + 카카오톡 메시지 형식 (배차정보/차량/기사/정차5건) 한국어 표기 |
| 5.1.2 | 개발책임자 / IT 관리자 | 🟠 | 5.1.1 | preview 본문 — 정차 ID 대신 정차 주소 (예: "서울시 강남구...") + ETA 시간 표기 | UUID/정차 ID 노출 0 |
| 5.1.3 | 배송 기사 | 🟠 | mobile-staff 카카오톡 webhook mock | webhook 수신 후 mobile-staff 배차 list 진입 | 동일 정차 5건 표기 + 정차 순서 일관 |
| 5.1.4 | 개발책임자 / IT 관리자 | 🟡 | preview 화면 | "복사" 버튼 클릭 | clipboard 에 본문 복사 + 토스트 "복사되었습니다" |
| 5.1.5 | 개발책임자 / IT 관리자 | 🟡 | preview 화면 | A4 인쇄 버튼 | 출력 미리보기 — 카톡 메시지 + 정차 표 |

### 5.2 동적 폼 manual create (8 case)

| # | 페르소나 | 우선순위 | 선행 | 동작 | 기대 |
|---|---|---|---|---|---|
| 5.2.1 | 개발책임자 / IT 관리자 | 🟠 | `/dispatch/manual/new` | 차량 / 기사 / 출발지 / 도착지 / 정차 0건 입력 후 저장 시도 | UI reject "정차 1건 이상 필요" |
| 5.2.2 | 개발책임자 / IT 관리자 | 🔴 | 폼 진입 | `dispatch-stop-add-button` 클릭 → 정차 row 1건 추가 → 주소 입력 → 저장 | DB dispatches 1 row + dispatch_stops 1 row + status=PLANNED |
| 5.2.3 | 개발책임자 / IT 관리자 | 🟠 | 5.2.2 | 추가 stop 5건 — 모두 저장 | dispatch_stops 6 row + 정차 순서 (sequence 1~6) 일관 |
| 5.2.4 | 개발책임자 / IT 관리자 | 🟠 | 5.2.3 | 정차 순서 drag-drop 변경 (3↔5) | 시퀀스 즉시 반영 + DB persist |
| 5.2.5 | 개발책임자 / IT 관리자 | 🟠 | 폼 입력 중 | 차량 select — seed 차량 (V-01) 만 표기 | 차량 코드 V-01 노출 (UUID 비공개) |
| 5.2.6 | 개발책임자 / IT 관리자 | 🟠 | 폼 입력 중 | 기사 select — seed 기사 (driver01) 만 표기 | 로그인 ID driver01 노출 |
| 5.2.7 | 신입 영업 | 🔴 | sales 로그인 | `/dispatch/manual/new` 진입 | 403 (DISPATCHER/MASTER 만) |
| 5.2.8 | 개발책임자 / IT 관리자 | 🟡 | 폼 저장 후 | `/dispatch/{id}` 진입 — UUID 대신 비즈니스 식별자 (배차번호 D-2026-0001) URL 사용 | URL 에 UUID 노출 0 |

### 5.3 driverAutoMatch (mock MOCK-001) (3 case)

| # | 페르소나 | 우선순위 | 선행 | 동작 | 기대 |
|---|---|---|---|---|---|
| 5.3.1 | 개발책임자 / IT 관리자 | 🟠 | 5.2.2 PLANNED 배차 (기사 미배정) | `dispatch-driver-auto-match-button` 클릭 | mock 응답 — driver01 매칭 + DB driver_id update + status=ASSIGNED |
| 5.3.2 | 개발책임자 / IT 관리자 | 🟠 | 모든 기사 비활성 상태 | auto-match 시도 | 응답 422 + "매칭 가능한 기사 없음" + 수동 배정 안내 |
| 5.3.3 | 배송 기사 | 🟠 | 5.3.1 ASSIGNED | driver01 mobile-staff 진입 | 배차 list 즉시 반영 + 푸시/SMS 알림 (NoOp 모드 시 backend 로그) |

**슬라이스 5 합계: 16 case (🔴 3 / 🟠 11 / 🟡 2)**

---

## 6. 슬라이스 6 — 모바일 사진 (P1-8) — 11 case 🟠 (Detox lane)

> **주**: Playwright web spec 으로는 mobile WebView 의 native 카메라 권한 검증 한계. **Detox 별도 lane** 또는 **수동 device QA 체크리스트** 로 검증 권고. 본 시나리오는 device QA 매뉴얼 + Detox stub 구조 명세.

**의존 backend**: `slip-service` `/api/slip-attachments` (S3 presigned URL TTL 5분, MinIO `slip-attachments` 버킷)
**의존 mobile**: `clients/mobile-staff` (RN Expo) — Camera + ImagePicker + EXIF + 압축
**testid 의존**: `attachment-camera-button` / `attachment-gallery-button` / `attachment-preview-list` / `attachment-delete-button` / `attachment-upload-progress` / `attachment-retry-button` / `attachment-camera-permission-prompt`

### 6.1 카메라 권한 거부 시 fallback (3 case)

| # | 페르소나 | 우선순위 | 선행 | 동작 | 기대 |
|---|---|---|---|---|---|
| 6.1.1 | 배송 기사 | 🟠 | 첫 진입 | DriverStopDetail 진입 → camera 버튼 탭 → 권한 prompt → 거부 | `attachment-camera-permission-prompt` reject 후 `attachment-gallery-button` 만 활성 (camera 버튼 disabled + 안내 토스트) |
| 6.1.2 | 배송 기사 | 🟠 | 6.1.1 거부 후 | 갤러리 선택 fallback 정상 동작 | 갤러리 선택 → `attachment-preview-list` 1건 추가 |
| 6.1.3 | 배송 기사 | 🟡 | 6.1.1 거부 후 | 설정 진입 → 권한 재허용 → 앱 복귀 | camera 버튼 재활성 + 정상 사용 가능 |

### 6.2 압축 + EXIF + 업로드 progress (5 case)

| # | 페르소나 | 우선순위 | 선행 | 동작 | 기대 |
|---|---|---|---|---|---|
| 6.2.1 | 배송 기사 | 🟠 | seed 배차 + 정차 도착 상태 | 사진 1장 촬영 (4032×3024 — iPhone 기본) | 클라이언트 압축 (max 1920px 또는 800KB 이하) + EXIF GPS 포함 + S3 업로드 |
| 6.2.2 | 배송 기사 | 🟠 | 6.2.1 직후 | `attachment-upload-progress` 0~100% 표기 | progress bar 실시간 갱신 + 완료 시 `attachment-preview-list` thumbnail 노출 |
| 6.2.3 | 배송 기사 | 🟠 | 약한 4G 환경 (네트워크 throttle) | 업로드 → 5초 timeout 후 fail | `attachment-retry-button` 노출 + 재시도 시 정상 업로드 |
| 6.2.4 | 배송 기사 | 🔴 | 6.2.1 업로드 후 | DB `slip_attachments` 1 row | UUID 대신 slip 번호 + 파일명 + EXIF JSON column 저장 + presigned URL TTL 5분 |
| 6.2.5 | 배송 기사 | 🟠 | 24h 이내 본인 업로드 사진 | `attachment-delete-button` 탭 | 응답 200 + DB soft delete + thumbnail 즉시 제거 |

### 6.3 public token 인증 (3 case)

| # | 페르소나 | 우선순위 | 선행 | 동작 | 기대 |
|---|---|---|---|---|---|
| 6.3.1 | 배송 기사 | 🟠 | 6.2.1 업로드 직후 | presigned URL 즉시 GET | 200 + 이미지 binary |
| 6.3.2 | 배송 기사 | 🔴 | 6.2.1 업로드 직후 | TTL 5분 + 1초 경과 후 GET | 403 ExpiredToken |
| 6.3.3 | 회계 외주 | 🟠 | accountant 로그인 + 해당 slip detail 화면 | slip 첨부사진 list → 클릭 | 백엔드 API 가 새 presigned URL 재발급 → 재인증 후 노출 |

**슬라이스 6 합계: 11 case (🔴 2 / 🟠 8 / 🟡 1)** — Detox or device 수동 QA

---

## 7. 슬라이스 7 — 견적서 (P2-1) — 11 case 🟠

**의존 backend**: `slip-service` `/api/estimates` (POST=DRAFT, PATCH `/send` `/accept` `/convert`)
**의존 frontend**: `clients/desktop` `/estimates/new` + `/estimates/{number}` + 슬립 자동 생성 chain
**testid 의존**: `estimate-form-line-add` / `estimate-form-send-button` / `estimate-detail-accept-button` / `estimate-detail-convert-to-slip-button`

### 7.1 DRAFT → SENT → ACCEPTED → CONVERTED (5 case)

| # | 페르소나 | 우선순위 | 선행 | 동작 | 기대 |
|---|---|---|---|---|---|
| 7.1.1 | 신입 영업 | 🟠 | seed 거래처 P-001 + 품목 PROD-001 | `/estimates/new` → 거래처 + 라인 1건 → DRAFT 저장 | DB estimates 1 row + status=DRAFT + 견적번호 `YYYY/MM/DD-N` 발급 |
| 7.1.2 | 신입 영업 | 🟠 | 7.1.1 DRAFT | `estimate-form-send-button` 클릭 | status=SENT + 거래처 이메일 발송 (NoOp 시 로그) |
| 7.1.3 | 회계 외주 | 🟠 | 7.1.2 SENT | `estimate-detail-accept-button` 클릭 (거래처 회신 mock) | status=ACCEPTED + accepted_at 저장 |
| 7.1.4 | 신입 영업 | 🟠 | 7.1.3 ACCEPTED | `estimate-detail-convert-to-slip-button` 클릭 | status=CONVERTED + 슬립 자동 생성 (`YYYY/MM/DD-N`) + estimate.slip_number link |
| 7.1.5 | 신입 영업 | 🔴 | DRAFT 상태 | accept/convert 시도 (status 우회) | 422 + "DRAFT 에서 직접 ACCEPTED 불가, SENT 필수" |

### 7.2 슬립 자동 변환 chain (3 case)

| # | 페르소나 | 우선순위 | 선행 | 동작 | 기대 |
|---|---|---|---|---|---|
| 7.2.1 | 신입 영업 | 🔴 | 7.1.4 CONVERTED | 생성된 슬립 detail 진입 — 라인/금액/거래처 모두 estimate snapshot 일치 | 라인 동일 + 금액 동일 + 거래처 코드 동일 |
| 7.2.2 | 신입 영업 | 🟠 | 7.2.1 슬립 + estimate 모두 존재 | estimate 수정 시도 | 422 + "CONVERTED 견적은 수정 불가, 슬립 직접 수정" |
| 7.2.3 | 신입 영업 | 🟠 | 7.2.1 슬립 status=CONFIRMED 후 | estimate 진입 | 상태 표기 "변환됨 (슬립 SLIP-2026-XXXX)" + 슬립 detail 링크 |

### 7.3 legacy webview 제거 회귀 (3 case)

| # | 페르소나 | 우선순위 | 선행 | 동작 | 기대 |
|---|---|---|---|---|---|
| 7.3.1 | 신입 영업 | 🟡 | desktop 로그인 | 사이드바 → 견적서 메뉴 | `/estimates` 신규 SPA 라우트 (legacy webview iframe 미존재 — `EstimateLegacyWebviewPage` 라우트 deprecated 안내) |
| 7.3.2 | 신입 영업 | 🟡 | 견적서 list | testid `estimate-list-table` 노출 + legacy iframe 0 | iframe count = 0 (Playwright `expect(page.locator('iframe')).toHaveCount(0)`) |
| 7.3.3 | 신입 영업 | 🟢 | 견적서 list | UUID 노출 0 검증 — 모든 row 의 견적번호 (EST-...) 만 노출 | UUID regex 매칭 0건 |

**슬라이스 7 합계: 11 case (🔴 2 / 🟠 6 / 🟡 2 / 🟢 1)**

---

## 8. 슬라이스 8 — 매출 마감 (P2-4) — 10 case 🔴

**의존 backend**: `accounting-service` `/api/accounting/closings` (POST=close DAILY/MONTHLY, POST `/{id}/reverse` MASTER 만) + `AccountingPeriodGuard` interceptor + `JournalService` service-layer guard
**의존 frontend**: `clients/desktop` `/accounting/closings` (`MonthEndClosingPage`) + `/accounting/reports/trial-balance` link
**testid 의존 (실 FE 표준 — TM 정합)**: `closing-new-button` / `closing-list-table` / `closing-reverse-button` / `period-lock-banner-locked`

### 8.1 마감 → 변경 차단 (5 case)

| # | 페르소나 | 우선순위 | 선행 | 동작 | 기대 |
|---|---|---|---|---|---|
| 8.1.1 | 회계 외주 | 🔴 | seed 2026-04 분개 5건 + tax-invoice 3건 | `closing-new-button` → 2026-04 → `closing-new-button` | DB period_locks 1 row + locked_at + locked_by + status=LOCKED |
| 8.1.2 | 회계 외주 | 🔴 | 8.1.1 lock 후 | 2026-04 분개 entry 신규 시도 | 422 + "2026-04 마감 완료, 신규 분개 불가" 메시지 |
| 8.1.3 | 회계 외주 | 🔴 | 8.1.1 lock 후 | 2026-04 기존 분개 수정 시도 | 422 + 동일 메시지 |
| 8.1.4 | 회계 외주 | 🔴 | 8.1.1 lock 후 | 2026-04 tax-invoice 발행/취소 시도 | 422 + 동일 메시지 |
| 8.1.5 | 회계 외주 | 🟠 | 8.1.1 lock 후 | 2026-05 (다음 달) 분개 신규 | 정상 (월 단위 격리) |

### 8.2 역마감 (MASTER 만) (3 case)

| # | 페르소나 | 우선순위 | 선행 | 동작 | 기대 |
|---|---|---|---|---|---|
| 8.2.1 | 개발책임자 / IT 관리자 | 🔴 | 8.1.1 LOCKED | master 로그인 → `closing-reverse-button` 클릭 → 사유 입력 → 확정 | DB status=UNLOCKED + audit_log + 분개 신규/수정 다시 가능 |
| 8.2.2 | 회계 외주 | 🔴 | 8.1.1 LOCKED | accountant 로그인 → unlock 시도 | 403 + 버튼 자체 미노출 |
| 8.2.3 | 개발책임자 / IT 관리자 | 🟠 | 8.2.1 unlock 후 재 lock | 다시 lock → 다시 unlock → audit_log 2회 기록 | history 표 2건 + 시간 역순 |

### 8.3 시산표 link (2 case)

| # | 페르소나 | 우선순위 | 선행 | 동작 | 기대 |
|---|---|---|---|---|---|
| 8.3.1 | 회계 외주 | 🟠 | 8.1.1 LOCKED | 시산표 `/accounting/reports/trial-balance?yyyyMM=202604` 조회 | `period-lock-banner-locked` 노출 "2026-04 마감됨 (수정 불가)" |
| 8.3.2 | 회계 외주 | 🟡 | 8.3.1 | 시산표 행 클릭 → 분개 detail | detail 화면도 lock 배너 + 수정 버튼 disabled |

**슬라이스 8 합계: 10 case (🔴 7 / 🟠 2 / 🟡 1)**

---

## 9. 슬라이스 9 — 재고 실사 (P2-6) — 18 case 🔴

**의존 backend**: `inventory-service` `/api/inventory/audits` (POST=PLANNED + snapshot 라인 자동 생성, POST `/{id}/start` `/complete` `/cancel`, POST `/{id}/lines` 바코드/수동 입력) + accounting webhook `AccountingClient` (150 재고자산 / 919 재고감모손실 — V4 seed)
**의존 frontend**: `clients/desktop` `/inventory/audits` (`InventoryAuditListPage`) + `/inventory/audits/new` (`InventoryAuditFormPage`) + `/inventory/audits/{id}` (`InventoryAuditDetailPage` + barcode scan UI)
**testid 의존 (실 FE 표준 — TM 정합)**: `audit-form-warehouse-select` / `audit-form-date-input` / `audit-form-submit` / `audit-list-new-button` / `audit-list-warehouse-filter` / `audit-list-year-filter` / `audit-list-status-filter` / `audit-list-table` / `audit-detail-header` / `audit-start-button` / `audit-cancel-button` / `audit-complete-button` / `audit-journal-link` / `audit-line-barcode-input` / `audit-line-actual-input` / `audit-line-record-button` / `audit-detail-lines-table`

### 9.1 PLANNED → IN_PROGRESS → COMPLETED (5 case)

| # | 페르소나 | 우선순위 | 선행 | 동작 | 기대 |
|---|---|---|---|---|---|
| 9.1.1 | 신입 창고 | 🔴 | seed 창고 W-01 + 품목 100건 | `/inventory/audits/new` → W-01 선택 → 저장 | DB inventory_audits 1 row + status=PLANNED + inventory_audit_lines 100건 (품목 × 시스템 재고 snapshot) + 실사번호 AU-20260509-001 |
| 9.1.2 | 신입 창고 | 🔴 | 9.1.1 PLANNED | `audit-start-button` 클릭 | status=IN_PROGRESS + started_at + lines counted_qty=null |
| 9.1.3 | 신입 창고 | 🔴 | 9.1.2 IN_PROGRESS + 라인 100건 모두 counted_qty 입력 | `audit-complete-button` 클릭 | status=COMPLETED + completed_at |
| 9.1.4 | 신입 창고 | 🟠 | 9.1.2 IN_PROGRESS + 라인 일부만 입력 (50건) | complete 시도 | 422 + "라인 50건 미입력" 메시지 + 미입력 row 강조 |
| 9.1.5 | 신입 창고 | 🟡 | 9.1.1 PLANNED | start 없이 complete 시도 | 422 + "PLANNED 상태에서 complete 불가, start 필수" |

### 9.2 차이 자동 분개 (150/919) (5 case)

| # | 페르소나 | 우선순위 | 선행 | 동작 | 기대 |
|---|---|---|---|---|---|
| 9.2.1 | 신입 창고 | 🔴 | 9.1.3 COMPLETED + 차이 발생 (실사 < 시스템) | accounting webhook 자동 호출 | journal_entry 자동 생성: 차변 919(재고감모손실) X / 대변 150(재고자산) X (한국 일반기업회계기준 표준 차변 계정) |
| 9.2.2 | 회계 외주 | 🔴 | 9.2.1 후 | 시산표 즉시 조회 | 919 차변 X + 150 대변 X 즉시 반영 |
| 9.2.3 | 신입 창고 | 🔴 | 9.1.3 COMPLETED + 차이 발생 (실사 > 시스템 — 보유분 누락) | webhook | 차변 150(재고자산) X / 대변 919(재고감모손실 환입 — 또는 잡이익 같은 계정) X — 한국 일반기업회계기준 자문 후 코드 확정 |
| 9.2.4 | 신입 창고 | 🔴 | 9.1.3 COMPLETED + 차이 0 | webhook | journal_entry 생성 0 (no-op) |
| 9.2.5 | 회계 외주 | 🟠 | 9.2.1 분개 후 | 분개 detail 진입 — 적요 "재고 실사 차이 (실사번호 ST-2026-0001)" 표기 | 비즈니스 식별자만 적요에 (UUID 비공개) |

### 9.3 바코드 입력 + 수동 input (5 case)

| # | 페르소나 | 우선순위 | 선행 | 동작 | 기대 |
|---|---|---|---|---|---|
| 9.3.1 | 신입 창고 | 🟠 | 9.1.2 IN_PROGRESS | `audit-line-barcode-input` focus → 바코드 스캔 (PROD-001) | 해당 row 자동 highlight + counted_qty input focus |
| 9.3.2 | 신입 창고 | 🟠 | 9.3.1 highlight 후 | counted_qty 50 입력 → Enter | DB lines.counted_qty=50 + diff_qty 자동 계산 |
| 9.3.3 | 신입 창고 | 🟠 | 9.3.1 후 다음 바코드 (PROD-002) | 동일 동작 | 다음 row 이동 + 1번 row 입력 유지 |
| 9.3.4 | 신입 창고 | 🟡 | 9.3.1 후 | 모르는 바코드 (UNKNOWN-999) 스캔 | 토스트 "해당 품목 없음" + row 변동 0 |
| 9.3.5 | 신입 창고 | 🟡 | 9.3.1 후 | 바코드 없이 직접 row 클릭 → counted_qty 입력 | 정상 입력 (수동 input fallback) |

### 9.4 lock 후 변경 차단 (3 case)

| # | 페르소나 | 우선순위 | 선행 | 동작 | 기대 |
|---|---|---|---|---|---|
| 9.4.1 | 신입 창고 | 🔴 | 9.1.3 COMPLETED 후 | counted_qty 수정 시도 | 422 + "COMPLETED 실사는 수정 불가" |
| 9.4.2 | 개발책임자 / IT 관리자 | 🔴 | 9.1.3 COMPLETED 후 | master 도 수정 시도 | 422 + 동일 메시지 (cancel + 신규 실사로 재진행 안내) |
| 9.4.3 | 개발책임자 / IT 관리자 | 🟠 | 9.1.3 COMPLETED 후 | cancel API (MASTER 만) | status=CANCELLED + 자동 분개 역분개 (9.2.1 reverse) + audit_log |

**슬라이스 9 합계: 18 case (🔴 9 / 🟠 6 / 🟡 3)**

---

## 10. 합계 및 우선순위 분포

| 슬라이스 | 합계 | 🔴 | 🟠 | 🟡 | 🟢 |
|---|---|---|---|---|---|
| 1. 비밀번호 재설정 (P0-2) | 22 | 14 | 4 | 4 | 0 |
| 2. 세금계산서 (P0-4) | 15 | 11 | 3 | 1 | 0 |
| 3. 인쇄 5건 (P0-4) | 30 | 17 | 8 | 5 | 0 |
| 4. 관리자 UI (P0-5) | 28 | 18 | 7 | 3 | 0 |
| 5. arologis 수동 배차 (P1-5) | 16 | 3 | 11 | 2 | 0 |
| 6. 모바일 사진 (P1-8) — Detox lane | 11 | 2 | 8 | 1 | 0 |
| 7. 견적서 (P2-1) | 11 | 2 | 6 | 2 | 1 |
| 8. 매출 마감 (P2-4) | 10 | 7 | 2 | 1 | 0 |
| 9. 재고 실사 (P2-6) | 18 | 9 | 6 | 3 | 0 |
| **합계** | **161** | **83** | **55** | **22** | **1** |

> **주**: Stage 3 매뉴얼 검증 120 항 + 본 9 슬라이스 acceptance 161 case = 총 **281 case** 의 검증 자산. 본 PR 은 9 슬라이스 부분 (161 case) 만 신규. (TM 정합 후 1.2.6 본인 변경 흐름 1 case 추가)

---

## 11. 실행 가이드 (CI 후속 PR 권고)

### 11.1 본 PR 산출물 (3건)

1. `docs/qa/integration-pr-9-slice/scenarios.md` (본 문서)
2. `tools/test-data/seed-9-slice-fixtures.ps1` (PowerShell 5.1 호환 seed 스크립트)
3. `qa/playwright/tests/nine-slice/smoke.spec.ts` (Playwright smoke 1건 — config typecheck + backend health)

### 11.2 후속 PR 권고 (DevOps + QA 합동)

- `.github/workflows/qa-e2e.yml` matrix 확장:
  - **Playwright lane** — `qa/playwright/tests/nine-slice/*.spec.ts` 추가 (web + electron viewport)
  - **Detox lane** — `clients/mobile-staff/e2e/photo-attach.test.ts` 신규 (android.emu)
- 본 시나리오의 🔴 83 건은 Phase 11 cutover dry-run 의 release gate (모두 PASS 필수)
- 🟠 55 건 + 🟡 21 건은 Phase 11 후 backlog 정리

### 11.3 fixture seed 호출 (개발자용)

```powershell
# 9 슬라이스 시나리오 모든 fixture seed
cd c:\dev\SamhanLogis
.\tools\test-data\seed-9-slice-fixtures.ps1

# 또는 start-local-full 통합 호출
.\infrastructure\scripts\start-local-full.ps1
# (start-local-full.ps1 의 [step 6/6] seed 검증 단계에서 자동 호출 — DevOps 후속 통합)
```

---

**작성**: QA Tester (5-team integrated PR)
**검토**: TM 통합 PR 발행 후 5 reviewer agent (BE / FE / Designer / QA / DevOps) PR comment 토론 → TM 종합 추가 commit

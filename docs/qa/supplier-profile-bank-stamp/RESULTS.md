# PR #459 supplier-profile-bank-stamp QA RESULTS

실행일: 2026-06-11 (사이클2 재수행)
환경: Docker 풀스택 (23 컨테이너) + accounting-service f8d141ee + accounting_db V1~V35 전체 적용
Playwright headless Chrome, Vite renderer dev :5175
메인 스펙 9테스트 전체 재실행 결과: **9 passed / 0 failed**

---

## 사이클2 재설계 요약

### 결함 D-SP-01 기각 (테스트 아티팩트)

이전 T5 판정(SALES 수정 버튼 표시 → FE 결함 P2)은 테스트 설계 오류였음:

- 직전 스펙이 `injectAuthStub`에 `dev_master` JWT를 사용하면서 userId/role만 SALES로 교체
- FE `usePermissions` hook은 `GET /auth/admin/permissions/my` 실 API를 호출
- dev_master JWT → MASTER 권한 반환 → `canAccess('accounting.supplier-profiles','update')=true` → 수정 버튼 표시
- 이는 FE 결함이 아닌 stub 설계 오류 (permission-matrix stub이 usePermissions 경로를 가로채지 못함)

사이클2 수정: dev_sales 실 JWT 주입 → `/permissions/my` SALES 실 권한 반환 → `accounting.supplier-profiles=[]` → `canUpdate=false` → 수정 버튼 0개. **D-SP-01 기각**.

### 결함 D-SP-02 기각 (오판)

이전 T8 판정(로고 업로드 UI 미구현 P3)은 오판:

- `supplier-logo-file-input` data-testid는 `SupplierProfilePage.tsx` 수정 모달(`modalMode==='edit'`) 블록에 존재
- 전 QA가 수정 모달 진입 없이 탐색하여 element 미발견
- 사이클2: 수정 모달 진입 → `supplier-logo-file-input` 존재 확인 → PNG 업로드 → `hasLogo=true` API 확인 → `supplier-logo-badge` 표시 → 인쇄 뷰 `data:image/png;base64` src 확인 → 로고 삭제 → badge 미표시. **D-SP-02 기각, T8 PASS**.

---

## 마이그레이션 재적용 로그

```
Successfully applied 35 migrations to schema "public", now at version v35 (execution time 00:00.580s)
V35: supplier profile contact bank stamp
JournalSeeder created 50 journals (skipped 0)
복식부기 invariant — sum(debit)=529500000 sum(credit)=529500000 OK
```

### 신규 컬럼 실증

**supplier_profiles:**
- `tel` VARCHAR(30) — backfill: 02-3461-0000
- `fax` VARCHAR(30) — backfill: 02-3461-0001
- `stamp_png` BYTEA
- `stamp_hash` VARCHAR(64)
- `logo_png` BYTEA
- `logo_hash` VARCHAR(64)

**supplier_bank_accounts:**
- `exposed` BOOLEAN NOT NULL DEFAULT TRUE

---

## 시나리오별 결과 (사이클2 최종)

| # | 시나리오 | 결과 | 신규 단언 | 캡처 |
|---|---|---|---|---|
| T1 | TEL 확인 + 계좌 2건 입력 + 인감 업로드 저장 | PASS | `expect(modal).toBeHidden()` — 저장 후 모달 닫힘 | 01~05-T1-*.png |
| T2 | API DB 실증 — bankAccounts 2건 + hasStamp true | PASS | — | T2-db-verification.txt |
| T3 | 거래명세서 계좌 푸터 + 인감 반영 | PASS | `expect(hasBankNotice).toBe(true)` — 계좌 텍스트 포함 단언 | 07-T3-*.png |
| T4 | 세금계산서 BE print 공급자 DB 값 확인 | PASS | — | T4-tax-invoice-print-response.txt |
| T5 | SALES role 수정/추가 버튼 미표시 (실 JWT 기반 재설계) | PASS | `expect(editCount).toBe(0)`, `expect(addBtnCount).toBe(0)` | 11~12-T5-*.png |
| T6 | 계좌 0건 fallback — placeholder 문구 미출력 | PASS | `expect(hasPlaceholderText).toBe(false)` | 13~16-T6-*.png |
| T7 | exposed 토글 OFF → 거래명세서 미표시 + 복원 | PASS | — | 17~21-T7-*.png |
| T8 | 로고 업로드 → 배지 + 인쇄 뷰 반영 → 삭제 (재설계) | PASS | `expect(logoInput).toBeAttached()`, `expect(logoBadge).toBeVisible()`, `expect(hasLogo).toBe(true)`, `expect(logoBadgeAfterDelete).toBeHidden()` | 22~28-T8-*.png |
| T9 | SALES 게이트웨이 경유 print-profile 200 + 403 대조 | PASS | `expect(status403).toBe(403)`, `expect(printProfileStatus).toBe(200)`, bankAccounts 건수 단언 | 29~30-T9-*.png, T9-gateway-print-profile-verification.txt |

전체: **9 passed / 0 failed**

---

## DB 실증 쿼리 결과 (사이클2 실행 후)

### T2 API 응답 요약

```json
{
  "businessNumber": "2148720659",
  "tel": "02-3461-0000",
  "fax": "02-3461-0001",
  "bankAccounts": [
    { "bankName": "국민은행", "accountNumber": "000000-00-000000", "exposed": true },
    { "bankName": "기업은행", "accountNumber": "000-0000-0000", "exposed": true }
  ],
  "hasStamp": true,
  "hasLogo": false
}
```

- bankAccounts 2건, exposed 모두 true (T7 복원 후)
- hasStamp: true (T1 setInputFiles 126-byte PNG 업로드 확인)
- hasLogo: false (T8 삭제 후 — logo_png NULL)

---

## T5 SALES 실 권한 상세

`GET /auth/admin/permissions/my` (dev_sales 실 JWT):
```
accounting.supplier-profiles: []   (VIEW/UPDATE/CREATE/DELETE 없음)
```
→ `canAccess('accounting.supplier-profiles','update') = false`
→ `canEdit = false` → ProfileCard 수정 버튼 미렌더링
→ `canCreate = false` → 신규 추가 버튼 미렌더링

---

## T9 게이트웨이 경유 API 권한 검증

dev_sales 실 JWT (게이트웨이 :8080 경유, JwtAuthentication 필터 통과):

```
1) GET /api/v1/accounting/supplier-profiles → 403
   PASS: SALES role @RequirePermission 차단

2) GET /api/v1/accounting/supplier-profiles/print-profile → 200
   PASS: 인증-only 엔드포인트 (JwtAuthentication만 적용, role 권한 미요구)
   bankAccounts: [국민은행/000000-00-000000, 기업은행/000-0000-0000]
   companyName: （주）삼한공조시스템
   tel: 02-3461-0000
```

---

## 인쇄 뷰 실증

### T3 거래명세서 계좌 푸터 (슬립 ID: 45d2db99-79c0-4c7d-a391-0d038fb27017)

body 텍스트 계좌 포함 확인 (예금주/국민은행/기업은행 키워드)

### T8 인쇄 뷰 로고 반영

로고 업로드 후 거래명세서 인쇄 뷰 innerHTML에 `data:image/png;base64` src 포함 확인

### T7 exposed=false 계좌 미표시

- 국민은행 exposed=false → print-profile bankAccounts에서 제외 (기업은행만 반환)
- 인쇄 뷰에서 국민은행 미표시 확인

---

## 스크린샷 파일 목록 (사이클2 최종)

```
docs/qa/supplier-profile-bank-stamp/screenshots/
├── 01-T1-01-supplier-profile-list.png
├── 02-T1-02-supplier-edit-modal-open.png
├── 03-T1-03-bank-accounts-filled.png
├── 04-T1-04-stamp-uploaded-preview.png
├── 05-T1-05-save-success.png
├── 06-T2-01-db-verified-profile-list.png
├── 07-T3-01-statement-print-preview.png
├── 08-T3-02-statement-print-full.png
├── 09-T4-01-tax-invoice-list.png
├── 10-T4-02-tax-invoice-print-preview.png
├── 11-T5-01-sales-role-supplier-profile.png   (수정 버튼 0개)
├── 12-T5-02-sales-role-no-edit-btn.png
├── 13-T6-01-bank-accounts-cleared.png
├── 14-T6-02-saved-no-banks.png
├── 15-T6-03-statement-no-bank-fallback.png
├── 16-T6-04-banks-restored.png
├── 17-T7-01-supplier-profile-list-before-toggle.png
├── 18-T7-02-edit-modal-bank-list.png
├── 19-T7-03-toggle-off-state.png
├── 20-T7-04-save-after-toggle-off.png
├── 21-T7-05-statement-print-after-expose-toggle.png
├── 22-T8-01-supplier-list-before-logo.png
├── 23-T8-02-logo-file-selected.png
├── 24-T8-03-after-logo-save.png
├── 25-T8-04-logo-badge-visible.png            (supplier-logo-badge 확인)
├── 26-T8-05-statement-print-with-logo.png
├── 27-T8-06-before-logo-delete.png
├── 28-T8-07-after-logo-delete.png
├── 29-T9-01-sales-role-statement-print.png
├── 30-T9-02-sales-role-outbound-print.png
├── DETAIL-T3-statement-full-page.png
├── SUPP-T3-statement-real-slip.png
├── SUPP-T3b-outbound-real-slip.png
├── SUPP-T7-statement-real-slip-current.png
├── SUPP-T9-sales-outbound-print.png
├── T2-db-verification.txt
├── T4-tax-invoice-print-response.txt
├── T9-api-403-check.txt
└── T9-gateway-print-profile-verification.txt
```

---

## 결함 목록 (사이클2 최종)

| ID | 등급 | 제목 | 상태 |
|---|---|---|---|
| D-SP-01 | - | SALES role 수정 버튼 미숨김 | **기각** — 테스트 아티팩트 (dev_master JWT로 SALES stub = MASTER 권한 반환). 사이클2 T5 실 JWT 재수행: editCount=0 PASS |
| D-SP-02 | - | 로고 업로드 UI 미구현 | **기각** — 오판 (수정 모달 진입 필요). 사이클2 T8 재수행: 업로드/배지/인쇄/삭제 모두 PASS |

**활성 결함: 없음**

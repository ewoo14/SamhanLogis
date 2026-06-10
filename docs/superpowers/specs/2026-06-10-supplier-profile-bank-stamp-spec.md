# 공급자·은행계좌·인감 회계 설정 — 사업자 양식 확장 + 인쇄 실배선 spec

> 2026-06-10 개발책임자 지시 ([.claude/memory/project_company_config_menu.md]):
> "공급자와 은행계좌번호의 경우 회계에서 직접 설정할 수 있는 메뉴 추가 요망. 이는 세금계산서 발행에도 동일하게 적용되는 메뉴임."
>
> PR #458 의 임시 env 주입(`VITE_COMPANY_BANK_NOTICE`/`VITE_COMPANY_STAMP_URL`) 및 하드코딩 `COMPANY` 상수를 설정 API 로 대체.

## 0. 정찰 결론 — 신규 엔티티가 아니라 기존 자산 확장

| 자산 | 현황 | 갭 |
|---|---|---|
| BE `SupplierProfile` (`services/accounting-service/.../domain/SupplierProfile.java`) | 사업자 양식 메뉴용 CRUD + primary 지정 완비 (V14 시드: 사업자번호/상호/대표/주소/업태/종목/이메일) | **TEL/FAX 없음, 입금계좌 없음, 인감 없음** |
| BE 권한 | `accounting.supplier-profiles` 페이지코드 11-role seed 완료 (auth-service V37 계열) | **변경 불요** — 재사용 |
| BE 세금계산서 인쇄 | `TaxInvoiceService` 공급자 블록이 **`CompanyProperties`(application.yml env)** 사용 (TaxInvoiceService.java:351-356) | DB(SupplierProfile primary) 미사용 — 혼용 상태 |
| FE 설정 화면 | `SupplierProfilePage.tsx` (`/accounting/supplier-profiles`) 존재 | 신규 필드 편집 UI 없음 |
| FE 인쇄 | `PrintLayout.tsx:26-62` `COMPANY` 상수 → **12개 인쇄 뷰** 참조. bankNotice/stampUrl 만 `VITE_COMPANY_*` env | API 미배선 — 전부 하드코딩 |
| estimate-app | 공급자/계좌/인감 하드코딩 없음 (정찰 확인) | 소비처 아님 — 스코프 제외 |

## 1. BE — accounting-service

### 1a. V35 migration (`V35__supplier_profile_contact_bank_stamp.sql`)
```sql
ALTER TABLE supplier_profiles
    ADD COLUMN IF NOT EXISTS tel        VARCHAR(30),
    ADD COLUMN IF NOT EXISTS fax        VARCHAR(30),
    ADD COLUMN IF NOT EXISTS stamp_png  BYTEA,
    ADD COLUMN IF NOT EXISTS stamp_hash VARCHAR(64);

-- 기존 primary seed row 에 현행 인쇄 표기값 backfill (운영 UI 에서 정정 가능)
UPDATE supplier_profiles SET tel = '02-3461-0000', fax = '02-3461-0001'
 WHERE is_primary = TRUE AND is_deleted = FALSE AND tel IS NULL;

CREATE TABLE IF NOT EXISTS supplier_bank_accounts (
    id                  UUID         NOT NULL DEFAULT gen_random_uuid(),
    supplier_profile_id UUID         NOT NULL REFERENCES supplier_profiles (id),
    account_holder      VARCHAR(50)  NOT NULL,   -- 예금주
    bank_name           VARCHAR(50)  NOT NULL,   -- 은행명
    account_number      VARCHAR(50)  NOT NULL,   -- 계좌번호
    display_order       INT          NOT NULL DEFAULT 0,
    -- BaseEntity 7 audit (V14 패턴 동일)
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
    modified_at TIMESTAMP, modified_by VARCHAR(50),
    deleted_at TIMESTAMP, deleted_by VARCHAR(50),
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT pk_supplier_bank_accounts PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS idx_supplier_bank_profile_active
    ON supplier_bank_accounts (supplier_profile_id, display_order) WHERE is_deleted = FALSE;
```
- ⚠️ **계좌 실데이터 seed 금지** (public repo — 운영은 UI 입력). 인감 seed 없음.
- ⚠️ stamp_png 는 `byte[]` + `@Lob` 금지 (Hibernate 6 oid mismatch — Slip.java:263 NOTE 동일 패턴).

### 1b. 엔티티/도메인
- `SupplierProfile`: `tel`/`fax` 필드 + `update(...)` 확장 (기존 nullable 명시-null 덮어쓰기 시맨틱 유지), `registerStamp(byte[] png, String hash)` / `clearStamp()` 도메인 메서드. 직접 setter 금지, 한국어 Javadoc.
- 신규 `SupplierBankAccount` (BaseEntity 상속, `create(profileId, holder, bank, number, order)`).
- 서비스: 계좌 목록 **replace-all** 시맨틱 (기존 active rows soft-delete → 신규 insert, displayOrder 보존). 인감 PNG ≤ 200KB 가드 + SHA-256 재계산 hash 검증 (mismatch → INVALID_INPUT 400, slip 서명 패턴 동일).

### 1c. API 계약 (기존 컨트롤러 확장 — FE 와 정확 일치 의무)
- 응답 (detail + `/primary`): 기존 필드 + `tel`, `fax`, `bankAccounts: [{accountHolder, bankName, accountNumber, displayOrder}]`, `hasStamp: boolean`, `stampPngBase64: string|null`. **목록(list) 응답은 stamp payload 제외, `hasStamp` 만**.
- `POST /accounting/supplier-profiles` / `PUT /{id}`: 요청에 `tel`, `fax`, `bankAccounts[]` 추가 (replace-all).
- 신규 `PUT /{id}/stamp` (body `{stampPngBase64, stampHash}`) / `DELETE /{id}/stamp` — `@RequirePermission(page="accounting.supplier-profiles", action=UPDATE)`.
- 권한: 기존 페이지코드 그대로 — **auth-service seed 변경 없음**.

### 1d. 세금계산서 발행 일원화
- `TaxInvoiceService` 인쇄 공급자 블록 (line 351-356): **primary `SupplierProfile` 우선, 부재 시 `CompanyProperties` fallback**. `TaxInvoicePrintResponse` 계약 불변. `TaxInvoiceServiceTest` mock 보강.

### 1e. 테스트
- `SupplierProfile` IT 확장: 계좌 replace-all / 인감 업로드·hash mismatch 400·삭제 / primary 응답 신규 필드 / 200KB 초과 가드.
- **변경 모듈 전체 test 완주 후 push** ([[feedback_changed_module_full_test_before_push]]) — accounting-service 전체.

## 2. FE — clients/desktop

### 2a. API 클라이언트
- supplier-profile 타입에 `tel`/`fax`/`bankAccounts`/`hasStamp`/`stampPngBase64` 추가 + stamp PUT/DELETE 함수. **BE DTO 와 필드명 정확 일치** ([[feedback_fe_option_type_matches_be_dto]]).

### 2b. 사업자 양식 화면 (`SupplierProfilePage.tsx`)
- TEL/FAX 입력, **입금계좌 리스트 편집기** (행 추가/삭제, 예금주/은행/계좌번호, 순서 유지), **인감 업로드** (png only, ≤200KB, base64 변환 + SHA-256, 미리보기 + 삭제 — SalesVendorOrderUploadPage 파일 input 패턴 재사용). design-system 컴포넌트 우선.

### 2c. 인쇄 실배선 — `COMPANY` 상수 대체 (핵심)
- 신규 `useCompanyProfile()` 훅: `GET /accounting/supplier-profiles/primary` react-query (staleTime 5m) → COMPANY 동형 객체 매핑:
  - `legalName=companyName`, `businessRegNo=10자리→3-2-5 dash 표시`, `ceo=representativeName`, `address=businessAddress`, `tel`, `fax`, `businessType`, `businessItem`, `subBusinessNo`,
  - `bankNotice = "예금주:{holder}/{bank1} {acct1} {bank2} {acct2}…"` (bankAccounts displayOrder 순 조합, 0건 시 빈 문자열 — placeholder 문구 인쇄 금지),
  - `stampUrl = data:image/png;base64,{stampPngBase64}` (없으면 빈 문자열 → 미표시).
- 로딩/에러 fallback = `DEFAULT_COMPANY` (현 COMPANY 정적 값에서 **env 읽기 제거**, 계좌 placeholder 제거) — 인쇄 블랭크 방지.
- **12개 인쇄 뷰 전수 전환** (전수 grep 의무 — [[feedback_defect_family_sweep_fix]]): SalesTransactionStatementPrintPage / SalesInvoicePrintPage / TaxInvoiceView / InvoiceView / StatementBatchView / QuoteView / PurchaseSlipPrintPage / OutboundView / InboundView / NextDaySlipView / PartnerLedgerView (+ DispatchView 등 잔존 참조 grep 0 확인).
- `VITE_COMPANY_BANK_NOTICE` / `VITE_COMPANY_STAMP_URL` 참조 전수 제거.

### 2d. mock + 테스트
- `mock.ts` supplier-profiles 핸들러: 신규 필드 + stamp PUT/DELETE + `/primary` 신규 필드 (3원칙: parseMockBody / non-null envelope / Blob — [[feedback_inprocess_mock_principles]]).
- 인쇄 spec (sp-08-6-4 등) 단언 갱신 — `COMPANY` 상수 제거에 따른 계약 갱신. **desktop 전체 mock suite 완주** ([[feedback_fe_guard_removal_contract_tests]]) + `npm run typecheck`.

## 3. QA (Docker 실서버 — 가짜 데이터 0)
1. 실 게이트웨이 :8080 + dev_master 로그인 → 사업자 양식 화면에서 TEL/계좌 2건/인감 PNG 입력·업로드 실저장.
2. 거래명세서 인쇄 미리보기: 공급자표 TEL·인감 overlay·계좌 푸터 **실반영** 캡처.
3. 세금계산서(BE print 응답 포함) 공급자 블록 실반영 캡처.
4. 설정 미입력 상태 fallback (계좌 푸터 빈 문자열) 확인.
- 캡처 → `docs/qa/supplier-profile-bank-stamp/screenshots/` + PR 인라인.

## 4. 문서 동기화 (PR 내 의무)
- dev-report (`docs/dev-reports/supplier-profile-bank-stamp.md`) + accounting-service README + desktop README + ROADMAP + samhan-public-overview.html.

## 5. 비스코프
- 사원 서명 등록 (결재란 스탬프) = [[project_slip_shipout_print_form]] 슬라이스 C (별도 PR).
- estimate-app (하드코딩 없음 — 정찰 확인).
- 좌측메뉴 5대분류 재배치 (별도 슬라이스).

## 6. 환경
- Codex 한도 다운 실측 (6/11 10:11 회복 예정) → 구현·dual리뷰 Claude 대체 예외 ([[feedback_early_pr_docker_qa_screenshots]]).

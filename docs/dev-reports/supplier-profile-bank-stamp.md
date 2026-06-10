# 공급자·은행계좌·인감 회계 설정 — 사업자 양식 확장 + 인쇄 실배선 (PR #459)

> 2026-06-10 개발책임자 지시: "공급자와 은행계좌번호의 경우 회계에서 직접 설정할 수 있는 메뉴 추가 요망. 이는 세금계산서 발행에도 동일하게 적용되는 메뉴임."
> spec: [docs/superpowers/specs/2026-06-10-supplier-profile-bank-stamp-spec.md](../superpowers/specs/2026-06-10-supplier-profile-bank-stamp-spec.md)

## 설계 결정

- **신규 엔티티 없이 기존 `SupplierProfile`(회계 > 사업자 양식) 확장** — 정찰 결과 사업자 양식 CRUD + primary 지정 + `accounting.supplier-profiles` 권한 seed 가 기성. 갭은 TEL/FAX·입금계좌·인감·인쇄 배선뿐.
- 권한 페이지코드 재사용 → auth-service seed **무변경**.
- 인감 = DB `BYTEA` (slip 서명 PNG 패턴 동일 — `@Lob` 금지, ≤200KB 가드, SHA-256 무결성 검증).
- 입금계좌 = `supplier_bank_accounts` 자식 테이블 (BaseEntity 7 audit + soft delete), **replace-all** 시맨틱 — 다계좌(레거시 양식 푸터 = 2계좌) 지원.
- ⚠️ 계좌 실데이터·실인감 public repo 비커밋 — 운영은 UI 직접 입력.

## BE (accounting-service)

| 항목 | 내용 |
|---|---|
| V35 | `supplier_profiles` +tel/fax/stamp_png/stamp_hash, primary seed row tel/fax backfill, `supplier_bank_accounts` 신규 |
| 엔티티 | `SupplierProfile.registerStamp()/clearStamp()` + update 오버로드, `SupplierBankAccount` 신규 |
| API | 응답 +tel/fax/bankAccounts/hasStamp/stampPngBase64 (목록은 hasStamp 만), `PUT·DELETE /accounting/supplier-profiles/{id}/stamp` |
| 발행 일원화 | `TaxInvoiceService` 인쇄 공급자 블록 = primary SupplierProfile 우선, 부재 시 `CompanyProperties` fallback (계약 불변) |
| 테스트 | 전체 827/827 (신규: ServiceTest 6, TaxInvoice 시나리오 11·12, IT TC-SP-7~10) |

## FE (desktop)

| 항목 | 내용 |
|---|---|
| `useCompanyProfile()` | `GET /accounting/supplier-profiles/primary` react-query(staleTime 5m) → 인쇄용 회사정보 매핑. bankNotice = 계좌 displayOrder 순 조합(0건 시 빈 문자열), stampUrl = base64 dataURL, 로딩/에러 fallback 정적값 |
| COMPANY 대체 | `PrintLayout.tsx` COMPANY 상수 + `VITE_COMPANY_BANK_NOTICE`/`VITE_COMPANY_STAMP_URL` env **전수 제거** — 인쇄 뷰 11 + 회계 인쇄 레이아웃 9 = 20곳 훅 전환 (잔존 grep 0) |
| 사업자 양식 화면 | TEL/FAX 입력, 입금계좌 리스트 편집기(행 추가/삭제·순서=displayOrder), 인감 업로드(png ≤200KB, FileReader base64 + Web Crypto SHA-256, 미리보기/삭제) |
| mock | seed 신규 필드 + stamp PUT/DELETE 핸들러 (3원칙 준수) |
| 검증 | typecheck/lint green, Playwright mock 전체 441/441 |

## 추가 지시 확장 3건 (2026-06-10 개발책임자 정밀화, 사이클1 fix 커밋 `f8d141ee`)

| 항목 | 내용 |
|---|---|
| 계좌 노출 토글 | `supplier_bank_accounts.exposed BOOLEAN NOT NULL DEFAULT TRUE` (V35 직접 수정 — 미머지 마이그레이션). `GET /print-profile` 은 노출 계좌만 반환, CRUD 응답은 전체 + exposed |
| 공급자 로고 | `supplier_profiles.logo_png BYTEA + logo_hash` (인감 동일 패턴 — PNG magic + ≤200KB + SHA-256, `PUT·DELETE /{id}/logo`). 인쇄 로고 = 설정 이미지 우선, 미설정 시 정적 `/print-logo.svg` fallback |
| 메뉴명 | 좌측 메뉴/페이지 타이틀 **'공급자 설정'** (라우트 `/accounting/supplier-profiles`·권한 page-code 유지) |

## 사이클1·2 리뷰 fix 요지

- **사이클1** (P1 4·P2 4·P3 9, 전건 fix): 훅 rules-of-hooks 6뷰 + eslint 배선(P1-A), 목록 bankAccounts 포함 + `GET /{id}` 상세(P1-B), 인증-only `GET /print-profile` 신설 — 비회계 role 인쇄 계좌/인감 보존(P1-C), 가짜 QA 캡처 폐기 후 전면 재수행(P1-D), stamp BYTEA projection·비관락·PNG magic·@Size 상한 등.
- **사이클2** (확정 P2 4·P3 9, 전건 fix `4462d329`): mock 핸들러 순서 회귀(리터럴 선점) + TC-SP-10 런타임 인쇄 단언, print-profile **X-Is-Partner 403** 신뢰경계 복원, TC-SP-12 deny-대조 4단언 재설계, real-qa 단언 승격(T5 stub 제거 → dev_sales 실 JWT) 등.
- 테스트 최종: accounting **838 green** (ControllerIT 16 + FEMatchIT 5 + ServiceTest 9 포함), desktop typecheck/lint/build/Playwright green.

## QA (Docker 실서버 — P1-D 전면 재수행, 2026-06-11)

- **[docs/qa/supplier-profile-bank-stamp/RESULTS.md](../qa/supplier-profile-bank-stamp/RESULTS.md)** — **T1~T9 9/9 PASS** (단언 승격 후 재실행 1m48s). 실 캡처 30+장 + DB 쿼리 증빙.
- 핵심 실증: accounting_db 재생성 → Flyway V1~V35 재적용(exposed/logo 컬럼), 계좌 2건 저장→DB rows, 인감→거래명세서 overlay, exposed OFF→print-profile 제외, 로고 업로드→인쇄 반영→삭제 fallback, **dev_sales 실 JWT 게이트웨이 경유: 목록 403 / print-profile 200**.
- QA 중간보고 결함 2건은 PM 교차검증으로 **양건 기각**: D-SP-01(SALES 수정버튼)=permission stub 이 실 endpoint(`/auth/admin/permissions/my`)를 안 가로챈 테스트 아티팩트, D-SP-02(로고 UI 미구현)=수정 모달 한정 렌더를 모달 진입 전 탐색한 오판. 재수행으로 실증.

## 회고 메모

- 집 PC design-system dist stale → desktop typecheck 가짜 실패 12건. `npm run build`(design-system) 후 EXIT=0. CI 는 DS 선빌드라 미노출.
- FE 전수 grep 이 spec 추정(12뷰)보다 넓은 20뷰 적발 — 결함 fix 계열 단위 전수 sweep 규칙의 구현 단계 적용 사례.
- 전체 Playwright suite 로컬 실행 시 기존 QA 증빙 PNG ~130장 재캡처 덮어쓰기 → 커밋 전 `git restore` 원복 필수.
- ⚠️ 위 `git restore` 관행이 **동시 작업 중인 다른 영역(services/) 변경까지 원복**하는 사고 발생 (사이클2 BE fix 1회 유실 → 재적용). 다중 에이전트 병렬 작업 중에는 git restore 광역 실행 금지 — PNG 한정 경로 지정 원복만.
- real-qa config 의 testMatch `**/*-real-qa.spec.ts` 가 무관 슬라이스 스펙까지 실행 → 무관 QA 디렉터리에 부산물 캡처 생성. 실행은 반드시 디렉터리 한정.

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

## QA (Docker 실서버)

- `docs/qa/supplier-profile-bank-stamp/RESULTS.md` 참조 (T1 설정 입력 → T2 DB 실증 → T3 거래명세서 반영 → T4 세금계산서 반영 → T5 권한 → T6 계좌 0건 fallback).

## 회고 메모

- 집 PC design-system dist stale → desktop typecheck 가짜 실패 12건. `npm run build`(design-system) 후 EXIT=0. CI 는 DS 선빌드라 미노출.
- FE 전수 grep 이 spec 추정(12뷰)보다 넓은 20뷰 적발 — 결함 fix 계열 단위 전수 sweep 규칙의 구현 단계 적용 사례.
- 전체 Playwright suite 로컬 실행 시 기존 QA 증빙 PNG ~130장 재캡처 덮어쓰기 → 커밋 전 `git restore` 원복 필수.

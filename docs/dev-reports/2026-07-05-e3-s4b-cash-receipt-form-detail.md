# 2026-07-05 — E3 S4b 입금보고서 수기 작성폼 + 상세/편집 (PR #730)

> E3 회계 입금보고서 에픽. S4a(#727)=목록 → **S4b=수기 입금(MANUAL_RECEIPT) 작성폼 + 상세/편집 + mutation API/mock**. BE 완비(갭 0)·FE 전용 슬라이스. 벌크생성=S4c·coedit=S4d 별도(S4a 확정 슬라이싱).

## 구현
- **api/accounting.ts**: mutation 6종(create/get/update/confirm/cancel/delete)·BE `CashReceiptRequest` DTO 정확 일치·`extractApiErrorResponseMessage` 오류 래핑·UUID 비노출.
- **CashReceiptFormPage**(new+edit)+model+test: PartnerAutocomplete·금액>0·거래일 오늘 프리필·차/대 **102/110** 프리필(override)·인라인 에러(6필드).
- **CashReceiptDetailPage**+test: kind badge(KIND_TONE 공유·S4a SSOT)·confirm/cancel/delete·**편집 DRAFT+CONFIRMED**·BANK_LINKED/CANCELLED read-only.
- **CashReceiptListPage**: 전표번호 상세 링크 승격·신규작성 버튼. **routes/index.tsx**: /new·/:id·/:id/edit PermissionGuard(page-code=BE 일치). **mock.ts**: 6핸들러(BANK_LINKED PATCH 409).

## 핵심 결정
- **D3 편집 가부 (D-E3-04 정합·초안 정정)**: BANK_LINKED·CANCELLED만 편집 비활성, **DRAFT+CONFIRMED 편집 가능**(CONFIRMED=역분개+재게시 경고배너). ⚠️초안 spec의 "확정 편집 비활성"은 **D-E3-04(#710 "CONFIRMED 수정=역분개+재게시") 미교차검증 기획 오류** — 라운드2 Design 리뷰가 적발·정정.
- 기본 계정 102(보통예금)/110(외상매출금)·transactionDate 오늘 프리필(SSOT=CashReceipt.java).

## 리뷰 체인 (실행=게시 1:1·5-agent 실적발)
Opus 5-agent R1(BE0·DevOps0·Design 4M/3L·FE 1H/3M·QA 1H/1L·**라이브 QA 스샷 11장**) → fix1(CONFIRMED read-only[초안 spec 기준]·오류메시지+계약테스트·KIND_TONE 공유·인라인에러·캡션) → Codex 0 → **Opus 5-agent R2**(Design HIGH=**spec D3 오류**·MED=JournalDetail stale notice·FE LOW=selector) → fix2(CONFIRMED 편집 노출·경고배너·spec 정정) → Codex(MED=JournalDetail 링크 **false-green**[mock만 sourceRefId]) → fix3(false-green 제거·정직 네비) → Codex "0수렴".

## 검증
- typecheck 0·vitest(6 파일/27 tests·오류메시지 계약 6종·CONFIRMED editable 회귀)·**풀 Playwright 558 passed**(4실패 전부 PR무관: codef date-bomb·coedit-s3 live·admin-hr env — A/B 실증)·CI 30/30 green.
- **라이브 QA**(Docker :8080·mock OFF·dev_master): 작성(프리필 102/110·오늘)→DRAFT→목록→상세→확정(journalNo 2026/07/05-1)→BANK_LINKED 편집 비활성. 스샷 11장(`docs/qa/e3-s4b-cash-receipt-form-730/`). CONFIRMED 건 QA 후 cancel 역분개 원복.

## 후속/별건
- **journal→cashReceipt 직접 링크**: BE `JournalDetailResponse`에 cashReceiptId 미제공 → 별도 BE 후속(현재 목록 네비로 정직 처리).
- S4c(BankTransaction 다중선택 벌크생성·DataTable selection 인프라)·S4d(coedit·영속 DRAFT 전제).
- 무관 백로그: `CashReceiptService.resolvePartnerFilterIds` partnerName limit=100 truncation(S1 pre-existing).

## 교훈
- **기획 spec도 기존 결정 교차검증 필요** — 초안 D3가 D-E3-04와 상충한 것을 Design 리뷰가 적발. 신규 slice spec 작성 시 관련 에픽 결정(dev-report·메모리) 대조.
- **in-process mock 신규 핸들러 = 풀 스위트 검증**([[feedback_inprocess_mock_principles]])·**mock-only 데이터 주입 = false-green 경계**(Codex 재검 적발).

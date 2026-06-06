# PM 재기획 — 오류수정 정밀 확인 + 사이클 3 계획 (PR #417)

> 개발책임자 지시(2026-06-07): "사이클 2인데도 아직 오류가 fix되지 않고 있음. PM이 자세하게 확인해서 오류수정을 재기획 리뷰 게시하고 다시 재사이클 요청"

## 1. 사이클별 결함 흐름 정밀 회고

| 사이클 | 적발 | fix | 잔존/재발 원인 |
|---|---|---|---|
| 1a (Claude) | P0 V47 materialize gap(실QA), P1 사이드바↔라우트 이원화(arologis/매출마감/SMS), P2~Nit 9 | 12건 fix | 일원화 fix 가 **발견된 메뉴만** 처리 |
| 1b (Codex) | P1 2(edit-requests/tax-invoices 정합), P2 직접링크 4건·spec stale·마감 문구 등 | 10건 fix | 마감 문구 fix 가 3/4 페이지 — **DailyClosingPage 누락** |
| 2a (Claude) | P2 DailyClosingPage(FE·Designer 동시 적발), P3·Nit 5 | 6건 fix | page-code 전환 시 **mock 동기화 의무 미이행** |
| 2b (Codex) | P1 mock daily-closing.run/.unlock 부재, P3 whitespace 재발 | 2건 fix(검증 green, `feb9575d`) | — |

## 2. 근본 원인 (PM 판정)

**동일 계열 결함의 전수 sweep 없이 "리뷰어가 발견한 인스턴스만" 부분 fix 하는 패턴.**
- role 문자열 인가 판정이라는 결함 계열은 PR 시작부터 알려져 있었으나, 매 fix 가 지목된 파일만 수정 → 다음 사이클 리뷰어가 같은 계열의 다른 인스턴스를 재발견하는 구조 반복.
- 보조 원인: ① page-code 전환 시 mock 카탈로그 동기화 의무([[feedback_fe_guard_removal_contract_tests]])가 fix 단위 작업에 체크리스트로 강제되지 않음 ② 리뷰 산출물 문서 위생(whitespace) 자동 검사 부재.

## 3. PM 전수 sweep 실측 결과 (head `feb9575d`)

`clients/desktop/src/renderer` 전수 grep — **role 문자열 인가 헬퍼 27개 잔존 확인**:

### 3-A. 실사용 12개 — 페이지 버튼 인가가 여전히 role 기반 (사이클 3 이관 대상)

| 헬퍼 (api 모듈) | 호출처 |
|---|---|
| canAccessTaxInvoice | TaxInvoiceDetailPage, TaxInvoiceListPage |
| canCreateJournal / canPostJournal | JournalListPage, JournalDetailPage |
| canEditPartnerDcConfig | SalesPartnerDcConfigPage |
| canEditPartnerFull | admin/PartnerDetailDialog |
| canExportPartners | admin/PartnersPage |
| canExportSlips | SlipListPage, PurchaseQueryPage, SalesQueryPage |
| canManageAudit / canRecordAuditLine | InventoryAuditListPage, InventoryAuditDetailPage |
| canMutateEstimate | EstimateListPage, EstimateDetailPage |
| canRequestModificationOrCancel | dispatch-board/DispatchTaskDetailModal |
| canWriteSupplierProfile | accounting/SupplierProfilePage |

### 3-B. 고아 14개 — 호출처 0 (사이클1 사이드바 이관으로 잔존한 dead-code, 제거 대상)

canAccessAligoAddressBook · canAccessChatRoomAdmin(주의: AppLayout showChatRoomAdmin 별도 확인) · canAccessDeliveryBatch · canAccessDispatchSms · canAccessDpsByProduct · canAccessDpsCompare · canAccessHometaxExport · canAccessNextDaySlip · canAccessPartnerDcConfig · canAccessPartnerFull · canAccessPartnerLedger · canAccessSafetyStock · canAccessSlipPhotoAudit · canAccessStatementBatch · canReadSupplierProfile

## 4. 사이클 3 계획 (마지막 사이클 — N=3 안 완료 의무)

### 구현 (Codex, 일괄)
1. **3-A 12개 헬퍼 전환**: 호출처별로 해당 화면이 실제 호출하는 BE API 의 `@RequirePermission(page, action)` 을 실코드 대조 → `usePermissions().canAccess(pageCode, action)` 1:1 이관. **BE 가드가 canAccess seed 와 불일치(SlipSalesAccessGuard 류)면 이관 금지 + 유지 사유 Javadoc** (canQuerySales 전례). 헬퍼별 대조표를 dev-report 에 박제.
2. **3-B 14개 고아 헬퍼 + 관련 ROLES 상수 제거**: playwright spec 의 계약 단언 잔존 시 함께 현행화. AppLayout showChatRoomAdmin 등 간접 소비 재확인.
3. **mock 동기화 의무 체크**: 이관에서 새로 쓰는 page-code 가 mock 카탈로그에 전부 존재하는지 일괄 대조 (없으면 seed 정합 추가).
4. 문서 위생: 전 산출물 `git diff --check` clean.

### 검증 (PM 대행)
- 전 서비스 compile + 변경 모듈 test, FE typecheck/lint/전체 Playwright suite.
- Docker 실QA (사이클 3a QA agent): 이관 화면 spot 매트릭스 (export/estimate/journal 등 2~3 화면 역할 차등 200/403).

### 리뷰
- 사이클 3a: Claude 5-agent re-review — **전수 sweep 재실행으로 계열 잔존 0 을 직접 단언** (발견 인스턴스 검증이 아니라 grep 전수 0 검증).
- 사이클 3b: Codex 5-agent re-review + fix.
- 종료 조건: 양쪽 잔존 0 + CI green → PM 종합 + 머지. 사이클 3 후 P0/P1 잔존 시 개발책임자 보고 + 결정 위임([[feedback_dual_5agent_review]] 규칙).

## 5. 재발 방지 박제 (머지 후 메모리 반영 예정)

- **결함 fix 는 인스턴스가 아니라 계열 단위**: 리뷰 지적 1건 = 동일 패턴 전수 grep 의무.
- **page-code 전환 체크리스트**: BE 대조 → FE 전환 → mock 동기화 → spec 단언 4종 세트 원자 처리.

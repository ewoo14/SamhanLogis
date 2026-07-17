# #825 슬2 — 거래처 입력 표준화 + ACCOUNTANT lookup 계약 (기획 spec)

- 에픽: #825 전역 입력 UX (슬2/7)
- 기준일: 2026-07-17
- 브랜치: `feat/825-s2-partner-standardize` (base `main` `60f240202`)
- 진실원: [슬1 감사표](../dev-reports/2026-07-17-825-s1-partner-autocomplete-highlight-audit.md) (a) 9행 + ACCOUNTANT `partners.search` 단절 + TaxInvoice `partnerId` 오염
- 기획 모델: OPUS 4.8 · 정찰 2건(FE 9화면 실상 · BE 권한 seed) 실측 기반

## 0. 개발책임자 결정 (2026-07-17)

| # | 항목 | 결정 |
|---|---|---|
| D-S2-01 | DocumentReferencePicker(6-type 복합 픽커) | **하이라이트만(최소)** — PARTNER_LEDGER 옵션 렌더에 슬1 `splitHighlightMatches` 적용. 통짜 스왑·조건부 임베드 안 함. `refPartnerCode/refPartnerName/refPeriod` 저장계약·소비처(GroupwareApprovalCreate/Detail) 딥링크 불변 |
| D-S2-02 | TaxInvoiceFormPage `partnerId`↔사업자번호 payload 오염 | **슬2에서 fix + 계약테스트 완결** — `partnerId` 공급원을 사업자번호(bizNo)와 분리. 단 **필수화(선택 강제) 정책은 침범하지 않고 payload 정확성만 교정**(필수화는 (c) 슬라이스 유지) |
| D-S2-03 | `activeOnly` 검색 의미 (PM 기본값) | **등록 컨텍스트=ACTIVE만, 필터/조회 컨텍스트=전체(비ACTIVE 이력조회 허용)**. DepositorMapping(등록)=activeOnly 유지. BlockedPartners(차단 대상)=비ACTIVE 포함 |

## 1. 스코프 (6요소)

### ① BE — ACCOUNTANT `partners.search` VIEW 복구 (신규 Flyway V88)
- **근본원인**: `partners.search` VIEW가 원 seed `V34__seed_sp_d6_4_page_codes.sql`에서 MASTER/MANAGER/SALES만 부여 → CROSS JOIN이 ACCOUNTANT 행을 `can_view=FALSE`로 생성 → 전 체인(V39 템플릿→V43 그룹104→`account_page_permissions` materialize) FALSE 전파. **처음부터 미부여**(revoke 아님).
- **정공법**: 신규 `services/auth-service/src/main/resources/db/migration/V88__seed_partner_search_accountant_view.sql` — 그룹 `...104`(회계원/ACCOUNTANT) **단일 대상·VIEW-only** surgical grant. 4테이블 동기화(V87 precedent):
  1. `role_page_permissions` (ACCOUNTANT, partners.search) `can_view=TRUE` upsert (`ON CONFLICT (role_code, page_code) WHERE is_deleted=FALSE`)
  2. `role_page_permission_templates` 동일 (신규계정 parity, 7-action 중 VIEW만 TRUE)
  3. `group_page_permissions` (그룹 `...104`, partners.search) `can_view=TRUE`
  4. `account_page_permissions` 그룹104 소속 활성계정 재-materialize (`BOOL_OR`, `is_system_master` 제외 — V87:47-79/V82:34-84 패턴)
- **widening 점검** [[feedback_pgc_c2_widening_option_a]]: 대상 그룹104 단일·VIEW-only → MASTER/MANAGER/SALES 무영향(이미 보유)·타 역할 노출면 0. `?includeDeleted=true`(soft-delete 노출)는 MANAGER/SALES와 동일 계약이라 새 노출면 아님(참고 기록).
- **적용 마이그 불변** [[feedback_applied_migration_immutable]]: V34/V39/V43 무수정, 신규 V88만.
- **FE 무변경**: `partners.search` page-code는 FE PageCode 유니온(`permissionsApi.ts:249`)·권한매트릭스(`PermissionMatrixPage`)에 이미 존재 → seed만으로 매트릭스 ✓ 자동반영 [[feedback_fe_canaccess_pagecode_be_match]]. `searchPartners`는 403→`[]` graceful(하드가드 없음). mock은 이미 permissive(200) → V88 후 실BE=200 parity 일치, mock 수정 불필요.

### ② FE (ii) 통일 3화면 / 5인스턴스 — 원시 AsyncAutocomplete → PartnerAutocomplete
- 대상(routes 기준): `CollectionPlanPage.tsx`(등록 L319·필터 L432), `NotesReceivablePage.tsx`(등록 L285·필터 L348), `JournalStatusReportPage.tsx`(필터 L263).
- 현재: `AsyncAutocomplete<JournalStatusPartnerOption>` + 커스텀 renderOption(하이라이트 없음)·getKey=partnerCode. 소비처는 전부 `.partnerCode` 문자열만 읽음.
- 변경: `<PartnerAutocomplete>`로 치환 → ④하이라이트 자동 포함. 상태 타입 `JournalStatusPartnerOption`→`PartnerOption`.
- **검색소스 통일**: `searchJournalStatusPartners`(bizNo/phone `string|null`)를 정준 `partnerApi.searchPartners`(`PartnerOption[]`, bizNo `string|undefined`)로 교체 [[feedback_fe_option_type_matches_be_dto]]. null↔undefined 불일치 원천 해소. **defect-family sweep** [[feedback_defect_family_sweep_fix]]: `searchJournalStatusPartners` 전 소비처 grep 후 일괄 전환(누락 방지).
- `activeOnly`(D-S2-03): 등록 폼=activeOnly, 필터=전체.

### ③ FE (iii) 전환 2 — plain input → PartnerAutocomplete
- `DailyClosingPage.tsx` L527 `execPartner`: 원시 `<input>` → PartnerAutocomplete **optional(null 허용)**. 빈값=`undefined`(현 계약 `createDailyClosing({partnerCode: ...||undefined})` 유지). 마감 실행범위 경계 — 오코드 마감 위험 제거.
- `admin/BlockedPartnersPage.tsx` L422 `partnerCode`: AddBlockDialog 원시 `<input>` → PartnerAutocomplete **required·비ACTIVE 포함검색**. "코드 직접 입력…복사" 안내(L402) 제거.

### ④ FE (iii)* DocumentReferencePicker — 하이라이트만 (D-S2-01)
- `components/groupware/DocumentReferencePicker.tsx` L279-286 PARTNER_LEDGER 옵션 렌더(`partnerName`/`partnerCode` plain span)에 슬1 `splitHighlightMatches` 하이라이트 적용. 저장계약(`refPartnerCode`/`refPartnerName`)·소비처 딥링크(`?partnerCode=`) **불변**. 6-type 구조·다른 5 type 무변경.

### ⑤ FE TaxInvoice — partnerId 공급원 분리 fix + 계약테스트 (D-S2-02)
- `TaxInvoiceFormPage.tsx` L279-298·L397: `PartnerSummary.businessRegistrationNumber`를 `partnerCode`+`bizNo` 양쪽에 넣고 `id`(UUID) 미채움 → `partnerId: snapshot || bizNo || ''`로 **사업자번호가 partnerId 자리 오염**.
- fix: 검색결과의 UUID를 `PartnerOption.id`에 정확히 채우고, `partnerId`는 **선택된 거래처 UUID에서만** 공급(bizNo fallback 제거). 미선택 시 partnerId 공백/스냅샷 분리(필수화 강제 안 함). 검색소스 UUID 제공 여부 확인(sales.ts vs partnerApi).
- 계약테스트: partnerId 공급원 ≠ 사업자번호 단언(회귀방지).

### ⑥ (i) 무변경 3 — QA 확인만
- `BankTransactionPage`·`DepositorMappingPage`·`EstimateFormPage`: 이미 PartnerAutocomplete → ④하이라이트 자동전개. 라이브 QA 스샷으로 확인만(코드 변경 0). BankTransaction 해제=명시 '해제' 버튼(선례 유지).

## 2. 기존 결정 교차검증 [[feedback_spec_cross_check_prior_decisions]]

| 결정/규칙 | 슬2 준수 |
|---|---|
| UUID 사용자 비공개 [[feedback_uuid_no_user_visibility]] | PartnerAutocomplete getKey=partnerCode·UUID payload-only. (ii) 통일 시 UUID DOM 미유입 확인. TaxInvoice fix는 UUID를 payload에만 |
| 권한 widening Option A [[feedback_pgc_c2_widening_option_a]] | V88 그룹104 단일·VIEW-only·seed 진실원 |
| FE page-code = BE match [[feedback_fe_canaccess_pagecode_be_match]] | partners.search 이미 일치·FE 무변경 |
| 적용 마이그 불변 [[feedback_applied_migration_immutable]] | 신규 V88만 |
| CI test allowlist [[feedback_ci_test_filter_false_green]] | AuthFlywayV88SeedIT를 ci.yml auth-service `--tests`에 등재 |
| enforcement 실HTTP·seed 진위 [[feedback_enforcement_real_http_test]] | seed 진위=auth Flyway IT(실 Postgres). partner-service IT는 @MockBean(계약만) |
| defect-family sweep [[feedback_defect_family_sweep_fix]] | searchJournalStatusPartners 전 소비처 일괄 전환 |
| FE option type=BE DTO [[feedback_fe_option_type_matches_be_dto]] | 검색소스 partnerApi.searchPartners 통일로 null↔undefined 해소 |
| design-system 변경=Playwright mock [[feedback_design_system_playwright_mock_suite]] | (ii)/(iii) 위젯 교체는 desktop 소비처지만 ac-*·listbox 스위트 회귀 확인 |
| 무결성 정책 pre-confirm [[feedback_integrity_domain_policy_preconfirm]] | TaxInvoice **필수화 정책 미변경**(payload 정확성만). 필수화는 (c) 슬라이스 |

## 3. 검증 계획

- **BE genuine**: `AuthFlywayV88SeedIT`(신규·실 Postgres Flyway·4테이블 카운트 단언) `--rerun-tasks --no-build-cache`. auth-service 변경모듈 전체 test [[feedback_changed_module_full_test_before_push]]. ci.yml allowlist 등재.
- **FE**: design-system vitest + desktop vitest + `npm run typecheck`(vitest≠tsc [[feedback_order_app_typecheck_not_vitest]]) + **desktop Playwright mock 스위트 ac-2/ac-3 + 영향 listbox** [[feedback_design_system_playwright_mock_suite]].
- **라이브 QA**: 실 게이트웨이 :8080·mock OFF·**ACCOUNTANT 로그인으로 partners.search 200 실증**(403→복구) + (ii)/(iii) 화면 자동완성+하이라이트 스샷 다수 [[feedback_live_qa_every_round_screenshots]]. 공유 라이브 DB 쓰기 차원 직렬화 [[feedback_parallel_agent_gradle_shared_tree_contention]].
- **적대검증**: OPUS 4.8 5+agent → CODEX SOL 5.6 5+agent → **0수렴까지 반복 + 머지 전 재수렴 라운드** [[feedback_reconvergence_before_merge]]. fix=라운드모델.

## 4. 리스크

- (ii) 통일 시 소비처가 `.partnerCode` 외 필드를 읽는 곳 누락 → 전 소비처 grep sweep 필수.
- TaxInvoice 검색소스(sales.ts)가 UUID 미제공이면 partnerId 분리 fix 불가 → 구현 단계 최우선 확인. UUID 미제공 시 partnerApi 통일 또는 BE DTO 보강 필요(범위 점증 시 리뷰 재가동 [[feedback_expanded_scope_reinstate_review]]).
- V88 materialize가 기존 ACCOUNTANT 계정 즉시 반영 — 실 QA로 라이브 검증.
- BlockedPartners 비ACTIVE 포함검색: searchPartners activeOnly 미지정(전체) 계약 확인.

## 5. 팀 배치 (구현=CODEX LUNA 5.6)
- BE(auth): V88 seed + AuthFlywayV88SeedIT + ci.yml.
- FE(desktop): (ii) 3화면 통일 + (iii) 2 전환 + DocumentReferencePicker 하이라이트 + TaxInvoice fix + 계약테스트.
- (i) 3화면 QA 확인.

---
연관 Issue: #825

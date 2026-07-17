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
| D-S2-03 | `activeOnly` 검색 의미 (PM 기본값) | **등록 컨텍스트=ACTIVE만, 필터/조회 컨텍스트=전체(비ACTIVE 이력조회 허용)**. DepositorMapping(등록)=activeOnly 유지. BlockedPartners(차단 대상)=비ACTIVE 포함. 호출별 계약 §1.⑦ 표 |
| D-S2-04 | ACCOUNTANT `partners.search` 권한 표면(CODEX BLOCKING1) | **Option A parity widening** — ACCOUNTANT를 MANAGER/SALES와 동일하게 `partners.search` VIEW 부여. 같은 page-code로 열리는 전체목록·SSE·`includeDeleted`(soft-delete+삭제자명)까지 읽기전용 노출을 명시 승인. 내부 회계역할·peer 일관·구현 단순. **노출면을 IT/실HTTP 테스트로 문서화**. widening=seed 진실원 [[feedback_pgc_c2_widening_option_a]] |

## 1. 스코프 (6요소)

### ① BE — ACCOUNTANT `partners.search` VIEW 복구 (신규 Flyway V88)
- **근본원인**: `partners.search` VIEW가 원 seed `V34__seed_sp_d6_4_page_codes.sql`에서 MASTER/MANAGER/SALES만 부여 → CROSS JOIN이 ACCOUNTANT 행을 `can_view=FALSE`로 생성 → 전 체인(V39 템플릿→V43 그룹104→`account_page_permissions` materialize) FALSE 전파. **처음부터 미부여**(revoke 아님).
- **정공법**: 신규 `services/auth-service/src/main/resources/db/migration/V88__seed_partner_search_accountant_view.sql` — **결정적 ACCOUNTANT 기본 role-group UUID `...104`**(`BuiltinRoleGroupIds`·`V43:23-24`, `is_builtin=false`·편집가능 기본그룹) 대상. **can_view 만 갱신·기존 다른 action 보존**(CODEX BLOCKING2):
  1. `role_page_permissions` (ACCOUNTANT, partners.search) `can_view=TRUE` upsert (`ON CONFLICT (role_code, page_code) WHERE is_deleted=FALSE` DO UPDATE **`can_view`만**)
  2. `role_page_permission_templates` 동일 (legacy/수동 template parity 목적 — 신규계정은 그룹배속 후 materialize·`AuthService:157-190`. **`can_view`만, 기존 6-action 불변**)
  3. `group_page_permissions` (그룹 `...104`, partners.search) `can_view=TRUE` (**`can_view`만**)
  4. `account_page_permissions` 재-materialize — **⚠️override-aware**(CODEX BLOCKING2): 실권한=`override(page) ?? OR(활성그룹)` (`EffectivePermissionMaterializer:21-26·103-120`). V87 SQL은 그룹 BOOL_OR만 덮어 override 미반영 → **그대로 복사 금지**. V88 materialize 계약: ⓐ대상계정 판정=그룹104 `EXISTS` ⓑ계산=해당 계정 **전 활성그룹 `BOOL_OR`** ⓒ**활성 `account_permission_overrides` 최우선 적용**(deny override 보존) ⓓ`is_system_master`·비활성/삭제 계정·삭제 group/account-group 제외.
- **widening**(D-S2-04·Option A parity) [[feedback_pgc_c2_widening_option_a]]: ACCOUNTANT를 MANAGER/SALES와 동일 파리티로 승인. 같은 page-code가 여는 **전체목록(`PartnerAdminController:109-110`)·SSE(`PartnerListRealtimeController:32-33`)·`includeDeleted`(soft-delete+`deletedByName`, `PartnerSummaryResponse:41-43`)** 읽기전용 노출을 명시 수용 → **노출면 테스트로 문서화**(단순 카운트 아닌 행동 IT: override deny 보존·다중그룹 OR·타역할 불변·master 제외).
- **적용 마이그 불변** [[feedback_applied_migration_immutable]]: V34/V39/V43 무수정, 신규 V88만.
- **FE 무변경**: `partners.search` page-code는 FE PageCode 유니온(`permissionsApi.ts:249`)·권한매트릭스(`PermissionMatrixPage`)에 이미 존재 → seed만으로 매트릭스 ✓ 자동반영 [[feedback_fe_canaccess_pagecode_be_match]]. `searchPartners`는 403→`[]` graceful(하드가드 없음). mock은 이미 permissive(200) → V88 후 실BE=200 parity 일치, mock 수정 불필요.

### ② FE (ii) 통일 3화면 / 5인스턴스 — 원시 AsyncAutocomplete → PartnerAutocomplete
- 대상(routes 기준): `CollectionPlanPage.tsx`(등록 L319·필터 L432), `NotesReceivablePage.tsx`(등록 L285·필터 L348), `JournalStatusReportPage.tsx`(필터 L263).
- 현재: `AsyncAutocomplete<JournalStatusPartnerOption>` + 커스텀 renderOption(하이라이트 없음)·getKey=partnerCode. 소비처는 전부 `.partnerCode` 문자열만 읽음.
- 변경: `<PartnerAutocomplete>`로 치환 → ④하이라이트 자동 포함. 상태 타입 `JournalStatusPartnerOption`→`PartnerOption`.
- **검색소스 통일**: `searchJournalStatusPartners`(bizNo/phone `string|null`)를 정준 `partnerApi.searchPartners`(`PartnerOption[]`, bizNo `string|undefined`)로 교체 [[feedback_fe_option_type_matches_be_dto]]. null↔undefined 불일치 원천 해소. **defect-family sweep** [[feedback_defect_family_sweep_fix]]: 소비처는 3화면/5인스턴스만(sweep 누락 0 확인). **전환 완료 시 `searchJournalStatusPartners`+전용 option/raw DTO 삭제**(`accounting.ts:1717-1734·1767-1785`)로 통일 완결.
- **문구 교정**(CODEX 권고): 소비처가 payload는 `.partnerCode`만 저장하나 **렌더는 name·bizNo 사용**(`CollectionPlanPage:325-333` 등) — `PartnerOption`이 전부 제공하므로 전환 가능.
- `activeOnly`(D-S2-03·§1.⑦): 등록 폼=activeOnly, 필터=전체.

### ③ FE (iii) 전환 2 — plain input → PartnerAutocomplete
- `DailyClosingPage.tsx` L527 `execPartner`: 원시 `<input>` → PartnerAutocomplete **optional(null 허용)**. 빈값=`undefined`(현 계약 `createDailyClosing({partnerCode: ...||undefined})` 유지). 마감 실행범위 경계 — 오코드 마감 위험 제거.
- `admin/BlockedPartnersPage.tsx` L422 `partnerCode`: AddBlockDialog 원시 `<input>` → PartnerAutocomplete **required·비ACTIVE 포함검색**. "코드 직접 입력…복사" 안내(L402) 제거.

### ④ FE (iii)* DocumentReferencePicker — 하이라이트만 (D-S2-01)
- `components/groupware/DocumentReferencePicker.tsx` L279-286 PARTNER_LEDGER 옵션 렌더(`partnerName`/`partnerCode` plain span)에 슬1 `splitHighlightMatches` 하이라이트 적용. 저장계약(`refPartnerCode`/`refPartnerName`)·소비처 딥링크(`?partnerCode=`) **불변**. 6-type 구조·다른 5 type 무변경.
- **⚠️ 공개 export 추가**(CODEX BLOCKING5): `splitHighlightMatches`(`highlight.tsx`)는 현재 `PartnerAutocomplete/index.ts` 미export·package.json deep import 미노출 → **design-system 공개 export 추가가 구현 범위**. design-system `build+typecheck` 검증 포함(dist 재빌드 후 desktop 참조). 함수는 React text 조각만 반환·XSS 안전.

### ⑤ FE TaxInvoice — partnerId 공급원 분리 fix + 계약테스트 (D-S2-02)
- **✅UUID 가용 확답**(CODEX BLOCKING3): 검색경로가 UUID `partnerId`를 실제 반환(`PartnerSummaryResponse:32-36·49-55`·`sales.ts:821-828·848-859`·`partnerApi:502-508`) → **BE 무변경**. 결함은 adapter가 UUID를 버림(`TaxInvoiceFormPage:279-286` id 누락·bizNo를 partnerCode 오용, `:289-302` UUID 미보존, `:393-399` bizNo fallback).
- **⚠️ 빈 문자열 불가**: `CreateTaxInvoiceRequest.partnerId=@NotNull UUID`(`:15-20`) — 빈 문자열=역직렬화 오류(선택성 아님). spec 초판의 "미선택 시 partnerId 공백" 폐기.
- **fix 우선순위**(CODEX BLOCKING3): ⓐ검색결과 UUID를 `PartnerOption.id`에 채움 ⓑ**새 선택 id 우선 > edit snapshot** ⓒedit에서 새 선택 없을 때만 기존 `partnerIdSnapshot` 유지 ⓓ**UUID 없는 새 선택은 API 미호출+기존 상단 오류경로 차단**(생성 미선택 차단 `:362-369` 이미 존재=필수화 확대 아님) ⓔ**bizNo·빈문자 fallback 금지**.
- **계약테스트**: partnerId≠bizNo·**새 선택이 snapshot 덮음**·edit 무변경 snapshot 보존·UUID 누락 시 미호출·UUID DOM 비노출.
- `activeOnly`(D-S2-03): TaxInvoice 검색=`activeOnly:true`(권장·§1.⑦).

### ⑥ (i) 무변경 3 — QA 확인만
- `BankTransactionPage`·`DepositorMappingPage`·`EstimateFormPage`: 이미 PartnerAutocomplete → ④하이라이트 자동전개. 라이브 QA 스샷으로 확인만(코드 변경 0). BankTransaction 해제=명시 '해제' 버튼(선례 유지).

### ⑦ activeOnly 호출별 계약 (D-S2-03·CODEX BLOCKING4)

| 호출 | activeOnly | 의미 |
|---|---|---|
| CollectionPlan 등록 · NotesReceivable 등록 | `true` | 신규 귀속은 ACTIVE 거래처만 |
| CollectionPlan/NotesReceivable/JournalStatusReport 필터 | 미지정(전체) | 비ACTIVE 이력조회 허용 |
| DailyClosing 실행(execPartner) | `true` | 마감 실행 대상=ACTIVE |
| BlockedPartners | 미지정(전체·비ACTIVE 포함) | soft-delete 제외 |
| TaxInvoice 작성/수정 검색 | `true`(권장) | 세금계산서 귀속=ACTIVE |
| DepositorMapping(무변경·기존) | `true`(기존 유지) | — |

## 2. 기존 결정 교차검증 [[feedback_spec_cross_check_prior_decisions]]

| 결정/규칙 | 슬2 준수 |
|---|---|
| UUID 사용자 비공개 [[feedback_uuid_no_user_visibility]] | PartnerAutocomplete getKey=partnerCode·UUID payload-only. (ii) 통일 시 UUID DOM 미유입 확인. TaxInvoice fix는 UUID를 payload에만 |
| 권한 widening Option A [[feedback_pgc_c2_widening_option_a]] | D-S2-04 ACCOUNTANT parity(MANAGER/SALES 동일)·can_view만 갱신·기존 action 보존·seed 진실원·노출면 행동 IT 문서화 |
| FE page-code = BE match [[feedback_fe_canaccess_pagecode_be_match]] | partners.search 이미 일치·FE 무변경 |
| 적용 마이그 불변 [[feedback_applied_migration_immutable]] | 신규 V88만 |
| CI test allowlist [[feedback_ci_test_filter_false_green]] | AuthFlywayV88SeedIT를 ci.yml auth-service `--tests` 등재 + **V88 JUnit XML 존재+skipped=0 hard gate**(CODEX BLOCKING6) |
| enforcement 실HTTP·seed 진위 [[feedback_enforcement_real_http_test]] | seed 진위=auth Flyway IT(실 Postgres·**행동 검증**: override deny 보존·다중그룹 OR·타역할 불변·master 제외). partner-service IT는 @MockBean(계약만) |
| defect-family sweep [[feedback_defect_family_sweep_fix]] | searchJournalStatusPartners 전 소비처 일괄 전환 |
| FE option type=BE DTO [[feedback_fe_option_type_matches_be_dto]] | 검색소스 partnerApi.searchPartners 통일로 null↔undefined 해소 |
| design-system 변경=Playwright mock [[feedback_design_system_playwright_mock_suite]] | (ii)/(iii) 위젯 교체는 desktop 소비처지만 ac-*·listbox 스위트 회귀 확인 |
| 무결성 정책 pre-confirm [[feedback_integrity_domain_policy_preconfirm]] | TaxInvoice **필수화 정책 미변경**(payload 정확성만). 필수화는 (c) 슬라이스 |

## 3. 검증 계획

- **BE genuine**: `AuthFlywayV88SeedIT`(신규·실 Postgres Flyway·**행동 검증**: (ACCOUNTANT/그룹104, partners.search, can_view=TRUE) + 기존 action 보존 + **override deny 최우선**(deny override 계정은 여전히 false) + 다중그룹 OR + 타역할 불변 + master 제외) `--rerun-tasks --no-build-cache`. auth-service 변경모듈 전체 test [[feedback_changed_module_full_test_before_push]]. ci.yml `--tests` 등재 + **V88 JUnit XML 존재+skipped=0 hard gate**(CODEX BLOCKING6).
- **FE**: design-system **`test+typecheck+build`(dist 재빌드)** → desktop `npm run typecheck`(vitest≠tsc [[feedback_order_app_typecheck_not_vitest]]) + vitest + **Playwright mock 스위트 ac-2/ac-3 + 영향 listbox** [[feedback_design_system_playwright_mock_suite]]. (highlight 공개 export=design-system build 검증 필수.)
- **라이브 QA**: 실 게이트웨이 :8080·mock OFF·**ACCOUNTANT 로그인으로 partners.search 200 실증**(403→복구) + (ii)/(iii) 화면 자동완성+하이라이트 스샷 다수 [[feedback_live_qa_every_round_screenshots]]. 공유 라이브 DB 쓰기 차원 직렬화 [[feedback_parallel_agent_gradle_shared_tree_contention]].
- **적대검증**: OPUS 4.8 5+agent → CODEX SOL 5.6 5+agent → **0수렴까지 반복 + 머지 전 재수렴 라운드** [[feedback_reconvergence_before_merge]]. fix=라운드모델.

## 4. 리스크

- (ii) 통일: 소비처=3화면/5인스턴스만(CODEX sweep 누락 0 확인). 렌더가 name·bizNo 읽으나 PartnerOption 제공.
- ~~TaxInvoice UUID 미제공~~ → **해소**(CODEX BLOCKING3: 검색경로 UUID 반환 확증·BE 무변경). 잔여 리스크=adapter fix 정확성(새 선택>snapshot 우선순위).
- V88 override-aware materialize(BLOCKING2): deny override 계정 오확장 금지 — 행동 IT로 검증. 기존 ACCOUNTANT 계정 즉시 반영은 실 QA 라이브 검증.
- BlockedPartners 비ACTIVE 포함검색: searchPartners activeOnly 미지정(전체) 계약 확인.
- highlight 공개 export(BLOCKING5): design-system 공개 API 변경=blast radius, build/typecheck 필수.

## 5. 팀 배치 (구현=CODEX LUNA 5.6)
- BE(auth): V88 seed(override-aware materialize·can_view만·action 보존) + AuthFlywayV88SeedIT(행동 검증) + ci.yml `--tests` 등재 + V88 hard gate.
- design-system: `splitHighlightMatches` 공개 export(index.ts) + build.
- FE(desktop): (ii) 3화면/5인스턴스 통일(searchJournalStatusPartners 삭제) + (iii) 2 전환(DailyClosing·BlockedPartners) + DocumentReferencePicker 하이라이트 + TaxInvoice partnerId fix + 계약테스트.
- (i) 3화면 QA 확인.

---
연관 Issue: #825

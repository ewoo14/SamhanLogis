## 🧭 TM 종합 — 사이클 1 Codex 5-agent cross-check 리뷰 + 사이클 2 fix (head `401abb56`)

사이클 1 Claude 5-agent 리뷰 → Codex fix 4라운드로 **CI 28/28 green** 달성 후, **Codex 5-agent cross-check** 가 green 의 false-green 영역을 적대적으로 검증했습니다. 5/5 CHANGES REQUESTED, P0 1 + P1 2 + P2 다수. 개발책임자 정책 결정 반영하여 **사이클 2 fix** 로 해소했습니다.

### 🔴 P0(CRITICAL) — 아로로지스 lockout → **descope** (개발책임자 결정)
신규 aspect 가 account(auth-service `accounts`) 기반 `check()` 인데 아로로지스는 독립 auth(자체 UUID + `AROLOGIS_*` role)라 V39 materialize 대상 외 → 운영 전 엔드포인트 403. (BE·DevOps 독립 수렴, IT 는 `check→true` mock 으로 false-green.)
→ shared `PermissionAspect` 에 `samhan.security.permission.enforcement-mode` opt-in 추가(**default=account, 13 service 불변**). 아로로지스만 `role` 모드(VIEW→canView / 변경계열→canEdit, `AROLOGIS_*` 정규화, `AROLOGIS_MASTER` bypass). 아로로지스 독립 권한은 별도 슬라이스. false-green IT 14종을 실 role 경로로 정정.

### 🟠 P1 — PARTNER self-service 회귀 → **self-scope 검증 후 carve-out 확대** (개발책임자 결정)
V30 PARTNER grant(draft/confirm/list/detail/history/edit-requests/tutorial)가 blanket deny 로 회귀(print 만 carve-out).
→ 각 endpoint service 계층 PARTNER_CODE_HEADER 자기범위 검증 확인·보강(`PartnerSelfScopeGuard` 등 — PARTNER 만 본인 거래처, 타 partner 403) 후 `partnerSelfService` flag 적용. admin성(decide/edit/delete/from-estimate) 미적용.

### 🟠 P1 — FE PageCode 170→173 / PermissionGuard fail-open
`ecount.mig2.*`·`mig5` 3종 FE 노출(Flyway seed 존재로 BE 유지). PermissionGuard 로딩중 children→Spinner(fail-closed).

### 🟡 P2 — 테스트 검증갭
`V39AccountPermissionMaterializeIT` 신설(실 `account_page_permissions` materialize + `AccountPermissionService.check` 실 DB 검증), `V39PartnerExclusionIT` PARTNER seed(vacuous 제거), `AuthPermissionMigrationIT` local profile 제거.

### 다음
사이클 2 CI green 확인 후 **사이클 N=2 의무**([[cycle-n2-mandatory]]) — Claude 5-agent 재리뷰 + Codex 5-section 재리뷰(특히 신규 PARTNER self-scope production 로직의 내부 role 접근 보존 + arologis role-mode 회귀). 양쪽 APPROVE + CI green 후에만 PM 마지막 리뷰 + 머지.

리뷰 산출물: `docs/qa/phase-1-permission-overhaul/codex-cycle-1-review.md`

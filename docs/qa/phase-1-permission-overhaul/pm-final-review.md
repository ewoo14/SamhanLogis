## ✅ PM 마지막 종합 리뷰 — PR #316 권한 재편 Phase 1 (head `ea042c13`, 머지 승인)

### 결론: **APPROVE & MERGE** (개발책임자 승인)
CI 28/28 green(3사이클 연속) · 전 P0/P1 해소 · Claude 5-agent 전원 APPROVE · Codex BE/QA APPROVE.

### 산출물
계정×page×**7-action**(VIEW/CREATE/UPDATE/DELETE/RESTORE/DOWNLOAD/PRINT) 권한 프레임워크. shared `PermissionAspect`(MASTER bypass / accountId 기반 check / fail-closed) + auth-service 엔티티·internal·admin API + Flyway V39(role→account materialize, 행동보존 자동전개) + 14 service 재주석화 + MASTER 매트릭스 UI(계정×173page×7action 평탄 + 다계정 wizard).

### 사이클 이력 (dual review 가 실제 결함 차단)
| 사이클 | 발견 → 해소 |
|---|---|
| 1 (Claude 리뷰→Codex fix 4R) | P0 V39 IT local profile / MASTER bypass stale + 권한 IT see-saw 60종(7-action stub+X-User-Id+deny override) + V39 보존표 재산출(DOWNLOAD narrowing 복구/SALES PRINT widening 제거/보고서 PRINT→VIEW) + PARTNER print carve-out → CI green |
| 1후반 (Codex 5-agent cross-check) | **🔴 CRITICAL arologis lockout** + **PARTNER self-service 회귀** 적발 |
| 2 | 아로로지스 descope(enforcement-mode opt-in) + PARTNER carve-out 확대(self-scope 보강) + FE 173 + Spinner fail-closed + 실DB materialize IT → CI green |
| N=2 (Claude 5-agent 재리뷰) | **🔴 P0 role-form 권한 endpoint 운영 파손**(account-form 전용 교체로 canView/canEdit 400→deny; arologis role-mode + EmployeePermissionGuard lockout, IT mock 으로 CI false-green) 적발 — 다른 4리뷰어·CI 누락, BE 단독 |
| 3 | role-form /check 양식 분기 복구(role_page_permissions 실 grant) + **실 HTTP 회귀 IT 3종** + 매트릭스 위험 action 시각화 → CI green |
| 3 최종 dual | Claude BE(P0 재확인)·Designer APPROVE + Codex BE·QA APPROVE |

### 신규 결정 (Phase 1 확정)
- **D-PO-10 아로로지스 descope**: arologis 는 독립 auth(자체 UUID+AROLOGIS_* role)라 account materialize 대상 외 → `samhan.security.permission.enforcement-mode` opt-in(default account, arologis=role)으로 role-based 유지. 아로로지스 독립 권한은 별도 슬라이스.
- **D-PO-11 PARTNER self-service carve-out**: `@RequirePermission.partnerSelfService` flag — PARTNER 자기범위(PARTNER_CODE_HEADER, service 계층) endpoint 만 aspect deny 면제. print/draft/confirm/list/detail/history/edit-requests/tutorial 적용(self-scope 검증·보강), admin성 미적용.
- **D-PO-12 role-form 권한 endpoint 양식 분기**: `/auth/internal/permissions/check` 가 account-form(accountId+action)·role-form(roleCode+type) 동시 지원 — programmatic guard·arologis role-mode 호환.

### 환경 제약 (투명 공개)
Codex 크레딧 소진으로 최종 dual 의 **Codex DevOps/FE/Designer 3섹션 미실행**(6/1 리셋). 동일 lens Claude APPROVE 로 커버, 핵심 lens(BE/보안·QA)는 양쪽 완전 APPROVE. 개발책임자 판단으로 지금 머지 승인.

리뷰 산출물: `docs/qa/phase-1-permission-overhaul/{claude-*-cycle-1, codex-cycle-1-review, pm-final-review}.md`

# 2026-07-05 — #27 slip.period-lock dead permission FE 정리 (PR #736)

> #720이 slip lock-by-period를 internal 엔드포인트화(@RequirePermission 제거)하며 `slip.period-lock` page-code가 dead. FE 권한매트릭스 고아 토글 제거.

## 배경
#720(PR #732)이 `POST /internal/slips/lock-by-period`(InternalTokenFilter·hasRole MASTER)로 이관하며 public `@RequirePermission(slip.period-lock)` 제거 → 이 page-code를 게이팅하는 BE 엔드포인트 0건(grep). FE 권한관리 매트릭스엔 "기간 잠금" 토글만 남아 관리자가 조정해도 무효과 고아 UI(#720 5-agent 전원 지적).

## 구현 (FE 전용)
- `PermissionMatrixPage.tsx` PAGE_GROUPS("전표 운영")·PAGE_LABEL에서 slip.period-lock 제거(21→20).
- `permissionsApi.ts` PageCode union 제거.
- `permissionPageCatalog.parity.test.ts` — `FRONTEND_REMOVED_BACKEND_PAGE_CODES` 화이트리스트 + FE 카탈로그/union 미노출 능동 회귀 테스트(재추가 시 RED).
- `full-qa/pagecodes.json` fixture 동기화.
- **BE 불변**: `PageCode.SLIP_PERIOD_LOCK` enum + V36 시드 유지(적용 마이그 immutable·enum 무해·DB row는 게이팅 미발동 dead).

## 리뷰 (실행=게시 1:1·표·Codex 라운드도 라이브 QA)
Opus 5-agent R1(BE/FE/DevOps/Design 0·**QA 라이브 매트릭스**: 기간잠금 행 0·타 slip 정상) ↔ Codex 순차 라운드(**Codex 직접 라이브 매트릭스 QA**: perm-matrix-row slip-period-lock 0·스샷) → 0수렴.

## 검증
- typecheck 0·vitest 601·parity 3(RED→GREEN genuine)·matrix.spec 1·풀 playwright 562/0.
- **라이브 QA**(mock ON·MASTER·권한매트릭스): "전표 운영(21)" 그룹 '기간 잠금' 행 count 0·slip.reject/transfer/print/cleanup 정상 잔존·동적 카운트. 스샷 3장(Opus QA 2+Codex 1·SHA-pinned+SendUserFile).
- BE @RequirePermission(slip.period-lock) 참조 0건 재확인·PageCode/V36 불변.

## 교훈
- **엔드포인트 인가 이관 시 FE 권한 노출 동반 정리**([[feedback_fe_canaccess_pagecode_be_match]]) — dead page-code 고아 토글 방지. 적용 마이그·enum은 불변([[feedback_applied_migration_immutable]]), FE 노출만 제거. FE 매트릭스 변경=풀 스위트+parity 회귀 테스트([[feedback_fe_guard_removal_contract_tests]]).

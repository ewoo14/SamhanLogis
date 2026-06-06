# PM 사전 실증 노트 — 사이클 1 (TM 통합 input)

> PM(controller)이 리뷰어 상호 모순 항목을 직접 실증한 결과. TM 통합 시 반영.

## FE P1-1 vs DevOps D-3 모순 판정

- **실증**: `clients/desktop/playwright.config.ts` testIgnore 에 `'**/full-menu-contract/**'` 포함 — "레거시 GAS 의존 스펙, mock 계약 아님, 3-A2 컨버전 제외" 주석. 로컬/CI **모두 미실행** (`npx playwright test full-menu-contract` → No tests found).
- **사실관계**: routes/index.tsx 의 `/admin/blocked-partners`·`/admin/aligo-address-book` 은 main(C2b #403)에서 이미 PermissionGuard 전환, `BLOCKED_PARTNER_ROLES`/`ALIGO_ADDRESS_BOOK_ROLES` 상수는 본 PR 에서 제거. spec L120-121 의 RoleGuard 단언은 **stale 이지만 실행되지 않아 suite green**.
- **판정**: FE P1-1 의 "스펙 실패 상태" 주장은 부정확(미실행), DevOps D-3 의 "정합" 판정도 부정확(단언 자체는 stale). **P2 로 격하하되 본 PR 에서 단언 갱신** (격리 해제 대비 + Codex 가 같은 파일을 이미 수정했으므로 일관 정리).

## FE P1-2 + Designer D-001/D-002 수렴 판정

세 결함 모두 **"사이드바 노출 조건 ↔ 라우트 가드 소스 이원화"** 동일 계열:

| 메뉴 | 사이드바(현재) | 라우트 가드(main 기준) | fix 방향 |
|---|---|---|---|
| 배차안내 SMS 발송 이력 | hasAnyBuiltinRoleGroup(M/M/D) | PermissionGuard `notification.dispatch-sms.send-audit` | dynamicCanAccess 동일 page-code 복원 (FE P1-2) |
| 매출 마감 (판매·회계 2곳) | showAccounting(12 page-code OR) | PermissionGuard `accounting.period-close` | showAccountingPeriodClose 신설 후 교체 (D-001) |
| arologis 5개(수동/가배차/미배차/실배차/admin) | hasAnyBuiltinRoleGroup | PermissionGuard `arologis.dispatch.admin`/`arologis.dispatch.ops`/`dispatch.batch` 등 | 라우트와 동일 page-code 의 dynamicCanAccess 로 전환 (D-002) — 계획서 S3 의 "page-code 존재 시 canAccess 1순위" 원칙 적용 (page-code 가 실재하므로 그룹 매칭 분기는 과잉) |

- fix 시 mock 카탈로그(SP_D1_PAGES grant)와 seed 정합 재확인 의무 (mockRole-only redirect 전례).
- hasAnyBuiltinRoleGroup 헬퍼 자체는 page-code 부재 케이스 대비 유지 가능 — 사용처가 0 이 되면 제거 판단.

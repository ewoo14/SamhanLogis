## FE 리뷰 — Codex cycle 1

### 결함표

| # | 우선순위 | 위치 | 결함 | 처리 |
|---|---|---|---|---|
| FE-1 | P1 | `clients/desktop/src/renderer/components/AppLayout.tsx:222`, `clients/desktop/src/renderer/routes/index.tsx:1338`, `services/accounting-service/.../AccountingEditRequestController.java:118` | `/admin/accounting-edit-requests`가 사이드바에서는 `accounting.edit-requests` 또는 `.decide` 중 하나만 있어도 노출되고, 라우트는 `accounting.edit-requests:VIEW`를 요구하지만 실제 페이지 첫 API는 `accounting.edit-requests.decide:VIEW`다. `ACCOUNTANT`는 seed상 `accounting.edit-requests` grant가 있어 FE 진입 후 BE 403 가능. | 본 PR 즉시 처리: 라우트와 사이드바를 `accounting.edit-requests.decide:VIEW` 단일 기준으로 수렴. |
| FE-2 | P1 | `AppLayout.tsx:210`, `routes/index.tsx:1117`, `TaxInvoiceController.java:220` | `/accounting/tax-invoices`는 사이드바 show가 `emit-nts/list/batch/inbound` OR인데 라우트는 `accounting.tax-invoice.emit-nts:VIEW`, BE 목록 endpoint는 `accounting.tax-invoice.list:VIEW`다. MANAGER처럼 list 권한은 있으나 emit 권한이 없는 사용자는 메뉴가 보이고 라우트에서 차단된다. | 본 PR 즉시 처리: 목록 라우트/사이드바는 `accounting.tax-invoice.list:VIEW`로 정렬. form/new/edit 버튼·라우트도 BE `accounting.tax-invoice.list` CREATE/UPDATE 계약으로 별도 정리. |
| FE-3 | P2 | `AppLayout.tsx:317-318`, `AppLayout.tsx:418/461/861/968`, `routes/index.tsx:1184/1204/1303/506` | 직접 링크 show 조건이 라우트 page-code보다 넓은 잔존 4건: `/admin/partners`는 `partners.list`보다 넓은 `showPartnersGroup`, `/admin/blocked-partners`는 `partners.block.bulk` OR, `/admin/regions`는 `arologis.region.manage` OR, `/inventory/stock-balance`는 `inventory.warehouse || inventory.stock-transfer` 사용. custom 그룹에서 FE-hides-BE-allows 또는 FE-shows-route-deny가 재발한다. | 본 PR 즉시 처리: 각 직접 링크 show를 라우트 `PermissionGuard` page-code/action과 1:1로 축소. |
| FE-4 | P2 | `clients/desktop/playwright/full-menu-contract/full-menu-contract.spec.ts:99` | full-menu-contract가 제거된 `SLIP_CLEANUP_ROLES`를 여전히 단언한다. `testIgnore` 상태라 CI에서 숨지만, 계약 스펙으로는 stale이며 격리 해제 시 즉시 실패한다. | 본 PR 즉시 처리: `slip.cleanup` PermissionGuard/dynamicCanAccess 계약으로 갱신. |

### Claude 발견 평가표

| Claude 발견 | 평가 | 근거 |
|---|---|---|
| P1 사이드바 ↔ 라우트 이원화 수렴 | valid, fix는 부분 valid | `3374a0c9`가 arologis/SMS/매출마감은 올바르게 page-code 단일 소스로 수렴했다. 다만 위 FE-1~FE-3처럼 직접 링크 1:1 위반이 남아 있어 완료 판정은 불가. |
| P2 full-menu-contract stale | valid, fix는 부분 valid | blocked-partners/aligo/reconcile 단언은 갱신됐지만 `SLIP_CLEANUP_ROLES` stale 단언이 남았다. over-engineering 아님, 갱신 누락. |
| P3 마감 페이지 role 판정 | valid, fix valid | 3개 마감 페이지가 `canAccess('accounting.period-close','create')` 및 `.reverse/update`로 전환됐다. `PermissionGuard`가 로딩 중 children을 렌더하지 않아 초기 권한 캐시 미로드 버튼 깜빡임 위험은 낮다. |

### 판정

사이클 필요. FE-1/P1과 FE-2/P1이 남아 있어 APPROVE 불가.

# MIG-14 Admin UI QA

Playwright specs:

- `clients/desktop/playwright/mig-14-admin-ui/mig-14-cash-admin.spec.ts`
- `clients/desktop/playwright/mig-14-admin-ui/mig-14-order-admin.spec.ts`
- `clients/desktop/playwright/mig-14-admin-ui/mig-14-aging-snapshot-admin.spec.ts`
- `clients/desktop/playwright/mig-14-admin-ui/mig-14-ledger-admin.spec.ts`

Screenshot target:

- `docs/qa/mig-14-admin-ui/screenshots/*.png`

Current status:

- `--list` 기준 17개 테스트 discover 완료.
- `VITE_MOCK_MODE=1` 용 `ecount.mig14.*` mock permissions seed 반영.
- Playwright runtime 의 `docs/qa` 직접 PNG 쓰기는 Windows EPERM 으로 차단되어,
  QA mock fallback PNG 4장을 `screenshots/` 아래 생성했다.

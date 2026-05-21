# MIG-18 admin UI 2단계 — Plan

> Codex `mcp__codex__codex sandbox=workspace-write`. 옵션 C 21단계.

## 작업 (Codex 일괄)

### Task 1: FilterChipBar 신규 컴포넌트
`clients/desktop/src/renderer/components/FilterChipBar.tsx`:
- props: `filters: { key, label, value, onRemove }[]` + `onResetAll: () => void`
- chip = label + value (예: "거래처: 거래처A") + X 버튼
- "전체 초기화" 버튼 (필터 있을 때만 표시)
- 한국어 + Pretendard

### Task 2: 7 admin 화면 FilterChipBar 적용
- CashDisbursementListPage / CashReceiptListPage (slipNo / kind / partner / 일자 range)
- OrderListPage (progressStatus / managerName / partnerName)
- OrderDetailPage (불필요 — 단일 상세)
- PartnerAgingSnapshotPage (partnerName)
- SalesLedgerPage / PurchaseLedgerPage (transformStatus / partnerName / 일자)

### Task 3: AGING pagination FE
- React Query pagination (page/size state)
- 사이즈 선택 dropdown (50/100/200/500)
- 이전/다음 페이지 버튼 + 현재 페이지 표시

### Task 4: 사이드바 메뉴 그룹화
`AppLayout.tsx`:
- "회계 관리자" 그룹 collapse/expand
- 7 admin 메뉴 그룹 내부에 배치
- 권한 캐시 false 시 hidden

### Task 5: Linux 스크린샷 재캡처 (Playwright)
- 기존 mock fallback PNG 4 삭제
- Playwright spec 의 `await page.screenshot(...)` 사용 (Linux dev server)
- 또는 CI job 으로 자동 생성

### Task 6: dev-report + DECISIONS + handoff + overview

## 검증

```
cd clients/desktop && npm run typecheck && npm run lint && npm run build
cd clients/desktop && npx playwright test mig-14-admin-ui (가능 시)
```

PASS 후 commit + push.

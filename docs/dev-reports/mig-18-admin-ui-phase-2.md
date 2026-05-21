# MIG-18 admin UI 2단계 보강

> 날짜: 2026-05-21
> 브랜치: `spec/2026-05-21-mig-18-admin-ui-phase-2`
> 범위: desktop FE + docs

---

## 1. 배경

MIG-17에서 이연한 admin 필터 chip/reset UI와 MIG-16의 aging snapshot Pageable 계약을 desktop 화면에 반영한다. 회계 admin 메뉴는 일반 회계 메뉴 아래에 흩어진 하위 링크 대신 접기/펼치기 가능한 "회계 관리자" 그룹으로 묶는다.

---

## 2. 변경 요약

| 파일 | 변경 |
|---|---|
| `clients/desktop/src/renderer/components/FilterChipBar.tsx` | 적용 필터 chip, 개별 제거 X 버튼, "전체 초기화" 버튼 공통 컴포넌트 추가 |
| `clients/desktop/src/renderer/routes/accounting/admin/CashTransactionList.tsx` | Cash 2 화면에 거래처/전표번호/유형/일자 range chip 적용 |
| `clients/desktop/src/renderer/routes/accounting/admin/OrderListPage.tsx` | 주문서 목록에 거래처/담당자/진행상태 chip 적용 |
| `clients/desktop/src/renderer/routes/accounting/admin/PartnerAgingSnapshotPage.tsx` | 거래처 chip, page/size 상태, 50/100/200/500 size 선택 적용 |
| `clients/desktop/src/renderer/routes/accounting/admin/LedgerList.tsx` | Ledger 2 화면에 거래처/변환상태/일자 range chip 적용 |
| `clients/desktop/src/renderer/routes/accounting/admin/Mig14AdminShared.tsx` | `PagedTable` pagination에 선택형 page size 컨트롤 추가 |
| `clients/desktop/src/renderer/components/AppLayout.tsx` | "회계 관리자" collapse/expand 그룹 추가, 권한 캐시 false 시 그룹 hidden 유지 |

---

## 3. UI 계약

- `FilterChipBar`는 필터가 하나 이상 적용된 경우에만 렌더링한다.
- chip 제거는 입력 상태와 `applied` query filter를 동시에 갱신해 즉시 목록을 다시 조회한다.
- "전체 초기화"는 해당 화면의 적용 필터를 비우고 page를 0으로 되돌린다.
- AGING page size는 FE state와 React Query key에 포함하고, API 호출 시 `page` / `size`를 함께 전달한다.
- OrderDetailPage는 단일 상세 화면이므로 필터 chip 적용 대상에서 제외한다.

---

## 4. 결정

| 결정 | 내용 |
|---|---|
| D-MIG-18-01 | `FilterChipBar`를 desktop renderer 공통 컴포넌트로 추가하고 admin 화면에서 재사용한다. |
| D-MIG-18-02 | 필터 chip은 Cash 2 + OrderList + Aging + Ledger 2 목록 화면에 일괄 적용하고, OrderDetailPage는 제외한다. |
| D-MIG-18-03 | AGING 목록은 FE page/size state를 React Query key에 포함하며 size 옵션은 50/100/200/500으로 둔다. |
| D-MIG-18-04 | MIG-14 스크린샷은 Playwright dev server가 안정적으로 뜨는 환경에서 재캡처한다. 불가 시 Linux CI 재캡처 보류로 기록한다. |
| D-MIG-18-05 | 회계 admin 메뉴는 "회계 관리자" collapse/expand 그룹으로 묶고, 동적 권한 캐시 false 시 그룹 전체를 숨긴다. |
| D-MIG-18-06 | 옵션 C 21단계 + PM 자율 연속 슬라이스로 진행하고 dev-report/handoff/overview를 같은 변경에 포함한다. |

---

## 5. 검증

- `clients/desktop npm.cmd run typecheck` PASS
- `clients/desktop npm.cmd run lint` PASS
  - 기존 경고 2건 유지: `api/mock.ts` unused eslint-disable, `PurchaseSlipPrintPage.tsx` unused `totalQty`
- `clients/desktop npm.cmd run build` PASS
- `clients/desktop npx.cmd playwright test playwright/mig-14-admin-ui --reporter=line` 시도
  - `npx.ps1`은 PowerShell execution policy로 차단되어 `npx.cmd`로 재시도했다.
  - 17개 테스트가 모두 실행 순서에 진입했고, MIG-14 screenshot 저장은 기존 Windows EPERM trap으로 모두 `pending` 로그를 남겼다.
  - 첫 실행에서 기존 order spec의 broad route/메뉴 정규식 취약점 2건이 드러나 spec을 보정했다.
  - 재실행은 17번째 테스트까지 도달했으나 600초 command timeout으로 최종 summary를 받지 못했다. Linux CI 재캡처 보류.

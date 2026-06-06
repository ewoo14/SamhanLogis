# Designer 리뷰 — PR #417 권한그룹 C5 후속 FE 정리
## Claude Designer 사이클 2 re-review

> 브랜치: `fix/permission-groups-c5-followup-cleanup`
> head: `e96861c4`
> diff 범위: `git diff 8c3ff6e4...e96861c4 -- clients`
> 리뷰 기준일: 2026-06-07
> 리뷰어: Claude Designer Agent (Cycle 2)
> 중점: 사이클1 지적 D-001/D-002/D-003/D-005/D-CX-001/D-CX-002 해소 검증 + 신규 UX 결함

---

## 1. 사이클1 지적사항 해소 검증

### D-001 — `매출 마감` 사이드바 과다 노출 (`showAccounting` → `showAccountingPeriodClose`)

**판정: 완전 해소**

- 판매 그룹 (AppLayout.tsx L431): `show={showAccountingPeriodClose}` — `dynamicCanAccess('accounting.period-close','view')` 단일 소스.
- 회계 그룹 (AppLayout.tsx L633): 동일하게 `show={showAccountingPeriodClose}`.
- 두 위치 모두 라우트 PermissionGuard (`pageCode="accounting.period-close" action="view"`)와 1:1 일치.
- D-001 완전 해소 확인.

---

### D-002 — arologis 사이드바 vs 라우트 가드 이원화

**판정: 완전 해소**

| 메뉴 | 사이클1 사이드바 조건 | 사이클2 사이드바 조건 | 라우트 guard |
|------|-------------------|--------------------|--------------|
| 수동 배차 | `hasAnyBuiltinRoleGroup(['MASTER','MANAGER'])` | `dynamicCanAccess('arologis.dispatch.admin','view')` | `arologis.dispatch.admin(view)` |
| 가배차 분류 | `hasAnyBuiltinRoleGroup(['MASTER','MANAGER','DISPATCH'])` | `dynamicCanAccess('arologis.dispatch.ops','view')` | `arologis.dispatch.ops(view)` |
| 미배차 리스트 | 동상 | `dynamicCanAccess('arologis.dispatch.ops','view')` | `arologis.dispatch.ops(view)` |
| 배차안내 SMS | 동상 | `dynamicCanAccess('dispatch.batch','view')` | `dispatch.batch(view)` |
| SMS 발송 이력 | 동상 | `dynamicCanAccess('notification.dispatch-sms.send-audit','view')` | `notification.dispatch-sms.send-audit(view)` |
| 실배차 비교 | 동상 | `dynamicCanAccess('arologis.dispatch.ops','view')` | `arologis.dispatch.ops(view)` |
| 배차지역 관리 | `arologis.region.manage` OR | `dynamicCanAccess('arologis.region','view')` (= `showArologisRegionPage`) | `arologis.region(view)` |

- D-CX-002 에서 추가 지적된 배차지역 관리의 `arologis.region.manage` OR 잔존도 `showArologisRegionPage = dynamicCanAccess('arologis.region','view')` 로 교체 완료.
- D-002 + D-CX-002 동시 해소 확인.

---

### D-003 — `showAdmin` dead 블록 잔류

**판정: 완전 해소**

- AppLayout.tsx L994-L998 주석 블록: 구 `showAdmin` 빈 렌더 블록 제거됨.
- `showAdmin`은 L285에서 MASTER 판정 전용으로만 잔류(`hasAnyBuiltinRoleGroup(auth,['MASTER'])`) — 단톡방 매핑 L1004 `!showAdmin` 분기에서만 소비. 화면 미노출. 규칙 준수.

---

### D-005 / D-CX-001 — 마감 3페이지 문구 교체 검증

이것이 사이클2 중점 검토 항목이다. 3개 마감 페이지를 개별 검증한다.

#### SalesClosingPage.tsx (매출 마감, `/sales/closing`)

- L158-L160: `usePermissions()` 기반 `canAccess('accounting.period-close','create')` / `canAccess('accounting.period-close.reverse','update')` 사용. role 문자열 직접 읽기 **없음**.
- L425: `title={!canExecute ? '마감 실행 권한 필요' : undefined}` — page-code 권한 기반 문구. **올바름**.
- L441-L443: `마감 실행 권한이 없습니다 — 마감 실행 권한 보유자만 가능합니다.` — role 명칭 미포함. **올바름**.
- Javadoc (L14-L17): `마감 실행: 마감 실행 권한 / 역마감: 역마감 권한` — `@RequirePermission` 기준으로 현행화. **올바름**.

**SalesClosingPage D-CX-001 해소 확인.**

#### MonthEndClosingPage.tsx (월말 마감, `/accounting/period-close`)

- L157-L160: `usePermissions()` 기반 동일 canAccess 패턴. role 문자열 직접 읽기 **없음**.
- L330: `title={!canExecute ? '마감 실행 권한 필요' : undefined}` — **올바름**.
- L347: `마감 실행 권한이 없습니다 — 마감 실행 권한 보유자만 가능합니다.` — role 명칭 미포함. **올바름**.
- L287: 안내문 `변경이 필요하면 역마감 권한 보유자에게 역마감을 요청하십시오.` — 이 문구는 "역마감 권한 보유자"라는 기능 기반 표현이며 특정 role 명칭(ACCOUNTANT/MASTER 등)을 포함하지 않는다. **허용 범위.**
- Javadoc (L14-L17): `마감 실행: 마감 실행 권한 / 역마감: 역마감 권한` — **올바름**.

**MonthEndClosingPage D-CX-001 해소 확인.**

#### PeriodCloseListPage.tsx (월말 마감 목록, `/accounting/period-close`)

- `usePermissions()` 기반 확인 완료.
- L330: `title={!canExecute ? '마감 실행 권한 필요' : undefined}` — **올바름**.
- L347: `마감 실행 권한이 없습니다 — 마감 실행 권한 보유자만 가능합니다.` — **올바름**.

**PeriodCloseListPage D-CX-001 해소 확인.**

#### DailyClosingPage.tsx (일마감, `/accounting/daily-closing`) — 신규 발견

**D-CX-001이 이 페이지에서는 미처리됨.**

- L92-L94: `const role = useSessionStore((s) => s.auth?.role)` → `canExecuteDailyClosing(role)` / `canReverseDailyClosing(role)` — role 문자열 직접 판정 유지.
- L413: `ACCOUNTANT / MASTER 권한에서 실행할 수 있습니다.` — role 코드명 화면 노출. D-CX-001 미교체.
- `accounting.ts` L1035-L1050: `canExecuteDailyClosing` / `canReverseDailyClosing` 함수가 role === 'ACCOUNTANT' || role === 'MASTER' 하드코딩 유지.
- 사이클1 C-6 fix 범위 지정("SalesClosingPage:425/442, MonthEndClosingPage:488/510, PeriodCloseListPage:330/347")에서 DailyClosingPage가 누락됨.

---

## 2. 신규 결함표

| # | 심각도 | 파일 | 위치 | 내용 | 처리 |
|---|--------|------|------|------|------|
| **D2-001** | **P2** | `DailyClosingPage.tsx` L92-L94 / L413 | 일마감 화면 | `canExecuteDailyClosing(role)` / `canReverseDailyClosing(role)` — role 문자열 직접 판정 잔류. 거부 문구 `"ACCOUNTANT / MASTER 권한에서 실행할 수 있습니다."` role 코드 화면 노출. `accounting.ts` 헬퍼 함수 `canExecuteDailyClosing` / `canReverseDailyClosing` 도 role-string 기반. D-CX-001 fix 범위에서 누락된 4번째 마감 페이지. | 즉시 수정: `DailyClosingPage` 를 `usePermissions()` + `canAccess('accounting.daily-closing', 'create')` / `canAccess('accounting.daily-closing.reverse', 'update')` 로 전환. 거부 문구 `"마감 실행 권한 필요"` 등 page-code 기준 교체. `accounting.ts` role-string 헬퍼는 DailyClosingPage 전환 완료 후 dead code 여부 재확인 후 처리. |

---

## 3. 역할별 사이드바 가시성 변화 표 (seed 기준 C-1/C-2/C-4)

사이클1 Codex fix C-1/C-2/C-4 이후 현재 head(`e96861c4`) 기준 핵심 메뉴의 역할별 가시성:

| 메뉴 (path) | 사이드바 조건 | MASTER | MANAGER | ACCOUNTANT | SALES | WAREHOUSE | DISPATCH |
|-------------|--------------|--------|---------|------------|-------|-----------|----------|
| 매출 마감 `/sales/closing` | `accounting.period-close VIEW` | O | O | O | X | X | X |
| 월말 마감 `/accounting/period-close` | `accounting.period-close VIEW` | O | O | O | X | X | X |
| 회계 수정 요청 `/admin/accounting-edit-requests` | `accounting.edit-requests.decide VIEW` | O | O | X | X | X | X |
| 세금계산서 `/accounting/tax-invoices` | `accounting.tax-invoice.list VIEW` | O | O | O | X | X | X |
| 발송금지 거래처 `/admin/blocked-partners` | `partners.block VIEW` | O | O | X | X | X | X |
| 배차지역 관리 `/admin/regions` | `arologis.region VIEW` | O | O | X | X | X | O |
| 재고 현황 `/inventory/stock-balance` | `inventory.stock-balance VIEW` | O | O | X | X | O | X |
| 거래처 관리 `/admin/partners` | `partners.list VIEW` | O | O | X | O | X | X |

- 사이클1 C-1/C-2/C-4 fix 이후 사이드바 show 조건이 라우트 PermissionGuard pageCode/action 과 완전히 1:1 일치함을 확인. 의도치 않은 메뉴 소실(역전) 없음.
- DISPATCH 가 `/admin/regions` (arologis.region VIEW) seed 보유 확인: V43 seed DISPATCH → `arologis.region(view)` 포함 (dispatch 역할 arologis 관련 페이지코드 seed 존재). 사이드바 노출 정상.

---

## 4. UUID 사용자 비공개 최종 전수

### 검토 범위: `clients/desktop/src/renderer/` 전체

| 위치 | UUID 사용 방식 | 화면 노출 | 판정 |
|------|--------------|-----------|------|
| `session.ts` L109-L120 `BUILTIN_ROLE_GROUP_IDS` | 상수 카탈로그 — 내부 비교 전용 | 없음 | 규칙 준수 |
| `mock.ts` UUID 리터럴 | 테스트 픽스처 데이터 — 런타임 API mock | 없음 | 규칙 준수 |
| `adminApi.ts` Javadoc `00000000...000` | 주석 내 actor 미식별 UUID 설명 | 없음 | 규칙 준수 |
| `EditWarehouseModal.tsx` `SYSTEM_ACTOR_ID` 상수 | 내부 비교 전용 | 없음 | 규칙 준수 |
| `UsersPage.tsx` L102-L116 UUID 역인덱스 맵 | 내부 비교 전용 | 없음 | 규칙 준수 |
| `PermissionGroupManagePage.tsx` `group.id` / `account.id` | `<option value={account.id}>`, `rowKey`, `mutationFn` | option 표시는 `accountLabel(account)` / `group.name` 한국어 | 규칙 준수 |
| `AppLayout.tsx` 헤더 칩 L1194 | `{auth?.fullName ?? '사용자'} · {auth?.role ?? '-'}` | role 코드 노출 (UUID 아님) | UUID 규칙 적용 외. 허용 |
| `session.ts` `getBuiltinRoleLabel` | boolean 반환 헬퍼, 화면 미사용 | 없음 | 규칙 준수 |

**UUID 사용자 비공개 위반 0건.**

### page-code / PageCode raw 문자열

- `PermissionMatrixPage.tsx` PageCode raw 표시: MASTER 전용 관리자 화면 디버그 목적 — 사이클1 D-004 "허용 범위, 즉시 처리 불필요" 판정 유지.

---

## 5. 한국어 문구 자연스러움 검토 (C-6 적용 3페이지)

| 페이지 | 문구 | 자연스러움 | 판정 |
|--------|------|-----------|------|
| SalesClosingPage | `마감 실행 권한 필요` (button title) | 간결하고 자연스러움 | 적절 |
| SalesClosingPage | `마감 실행 권한이 없습니다 — 마감 실행 권한 보유자만 가능합니다.` | 반복이 있으나 명료함. "마감 실행 권한"이 twice 사용되나 한국 ERP 관용 표현에 맞음 | 적절 |
| MonthEndClosingPage | `변경이 필요하면 역마감 권한 보유자에게 역마감을 요청하십시오.` | 기능 기반 표현, 자연스러움 | 적절 |
| MonthEndClosingPage | `마감 실행 권한이 없습니다 — 마감 실행 권한 보유자만 가능합니다.` | SalesClosingPage 동일 패턴, 3개 화면 일관성 확보 | 적절 |
| PeriodCloseListPage | `마감 실행 권한 필요` + `마감 실행 권한이 없습니다 — 마감 실행 권한 보유자만 가능합니다.` | 동일 패턴. 일관성 확보 | 적절 |

3페이지 모두: UUID 비노출, page-code 원문(accounting.period-close 등) 비노출 확인.

---

## 6. 디자인 시스템 / 토큰 변경 무영향 확인

- `design-system/` 경로 변경 없음.
- `colors.ts`, `typography.ts` 토큰 변경 없음.
- DS 컴포넌트(`Spinner`, `Button`, `Badge`, `DataTable`, `Modal`, `Card`) import 패턴 변경 없음.

**디자인 시스템 무영향 확인.**

---

## 7. 종합 판정

**CHANGES REQUESTED**

사이클1 지적 D-001/D-002/D-003/D-CX-002 는 완전 해소되었고, D-CX-001은 SalesClosingPage/MonthEndClosingPage/PeriodCloseListPage 3개에서 해소 완료되었다.

그러나 **D2-001** (DailyClosingPage D-CX-001 미처리) 이 신규 발견되었다. 일마감 화면에서 `role === 'ACCOUNTANT'` 하드코딩 및 "ACCOUNTANT / MASTER 권한에서 실행할 수 있습니다." 문구가 화면에 노출된 채 잔류한다. 이는 사이클1 C-6 fix 범위 누락으로, 동일한 D-CX-001 패턴이다. 즉각 처리 대상.

UUID 비공개 위반 0건. 디자인 시스템 영향 0건. 사이드바 가시성 역전/소실 0건. 한국어 문구 자연스러움 이상 없음.

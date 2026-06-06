# Designer 리뷰 — PR #417 권한그룹 C5 후속 FE 정리
## Claude Designer 사이클 1

> 브랜치: `fix/permission-groups-c5-followup-cleanup`
> 리뷰 기준일: 2026-06-07
> 리뷰어: Claude Designer Agent (Cycle 1)
> 중점: UUID 비공개 · 사이드바 가시성 · PermissionGuard 거부 UX · role 라벨 보존 · 디자인 시스템 무영향

---

## 1. 결함표

| # | 파일 | 분류 | 심각도 | 설명 |
|---|------|------|--------|------|
| D-001 | `AppLayout.tsx` L435, L636 | 사이드바 메뉴 가시성 불일치 | P2 | `매출 마감` (`/sales/closing`) 사이드바 show 조건이 `showAccounting`(12개 PageCode 중 1개라도 true)으로 바인딩되어 있어 의도보다 넓은 가시성. 라우트 가드는 `accounting.period-close(view)`인데 사이드바는 그보다 훨씬 넓은 조건으로 열림. 해당 메뉴가 `accounting.period-close` 전용 canAccess 변수로 교체되어야 함. C5 후속에서 수정되지 않은 기존 버그이나, 이번 PR 의 사이드바 가드 전환 작업 범위와 직접 겹침. |
| D-002 | `AppLayout.tsx` L272-L285 | arologis 사이드바 vs 라우트 가드 불일치 | P2 | arologis 6개 메뉴 중 4개(`pre-classify`, `unassigned`, `dispatch-sms`, `dispatch-reconcile`)는 사이드바에서 `hasAnyBuiltinRoleGroup(auth, ['MASTER','MANAGER','DISPATCH'])` 로 판정하고, 라우트에서는 `arologis.dispatch.ops(view)` / `dispatch.batch(view)` 동적 RBAC 가드를 사용한다. DISPATCH 그룹 구성원이 arologis.dispatch.ops seed 에 view 미부여 상태이면 사이드바는 보이지만 라우트 진입 시 홈으로 redirect 된다(역으로 seed 에는 있지만 그룹 미배속이면 사이드바 미노출). 사이드바와 라우트 가드 기준이 동일 소스여야 한다는 `feedback_fe_canaccess_pagecode_be_match.md` 위반 여지. |
| D-003 | `AppLayout.tsx` L287 | `showAdmin` 정적 role-group 잔류 | P2 | `showAdmin = hasAnyBuiltinRoleGroup(auth, ['MASTER'])` 는 여전히 빌트인 role-group UUID 비교로 처리됨. C5 후속 PR 코멘트("가드 로직만 변경, 시각 변경 0")와 일관하나, `showAdminHrGroup`(L269)은 `dynamicCanAccess('system.permission-admin','view')` 등을 조합하는 반면 `showAdmin`만 단독 UUID 비교를 유지하여 두 변수가 서로 다른 판단 기준을 사용하는 혼재 상태가 남아있음. 현재는 `showAdmin`이 아무 블록도 렌더하지 않으므로(L997-L1005 빈 블록) 실 UX 영향은 없지만 향후 추가 시 오염 가능. |
| D-004 | `PermissionMatrixPage.tsx` L1354 | PageCode raw 문자열 화면 노출 (admin 전용 허용 구역) | 정보 | 권한설정 매트릭스 표에서 각 행의 `<span>{page}</span>` (L1354)으로 `accounting.journals` 등 PageCode raw 문자열을 표시함. PageCode는 UUID가 아니므로 UUID 비공개 규칙 위반이 아니나, 한국어 라벨(`PAGE_LABEL[page]`)이 있는데도 code를 병기 노출함. 이는 관리자(MASTER 전용) 화면이므로 UX 허용 범위 내이고, 디버그 목적으로 의도된 패턴으로 판단함. 본 PR 즉시 처리 불필요. |
| D-005 | `SalesClosingPage.tsx` L158 | 페이지 내부 role 직접 읽기 잔류 | P3 | `const role = useSessionStore((s) => s.auth?.role)` 로 auth.role 문자열을 직접 읽어 `canExecuteClosing(role)`, `canReverseClosing(role)` 에 전달함. C5 계열이 role 문자열 → 그룹 기반으로 마이그레이션하는 방향이나 이 페이지는 전환되지 않았음. 역마감 버튼 노출 여부가 role 문자열 의존이므로 별도 슬라이스 대상(scope 외). |

---

## 2. UUID 사용자 비공개 규칙 전수 결과

### 검토 경로

- `PermissionGuard.tsx`: 거부 시 `<Navigate to="/" replace />` — UUID 미포함, 안내 문구 없음. 규칙 준수.
- `RoleGuard.tsx` (기존 잔류): 거부 메시지 `"본 화면은 {allow.join(' / ')} 권한 보유자만 접근 가능합니다. 현재 role: {role}"` — role 코드(MASTER 등) 노출이나 UUID 미포함. 규칙 허용 범위.
- `AppLayout.tsx` 헤더 칩 L1201: `{auth?.fullName ?? '사용자'} · {auth?.role ?? '-'}` — role 코드 노출이나 UUID 미포함. 허용 범위.
- `BUILTIN_ROLE_GROUP_IDS` (`session.ts` L106-L117): UUID 카탈로그가 소스코드 내 상수로 존재하나 화면에 렌더되지 않고 내부 비교 전용. 규칙 허용.
- `hasBuiltinRoleGroup` / `hasAnyBuiltinRoleGroup`: UUID를 비교에만 사용하고 반환값은 boolean. 화면 미노출. 규칙 준수.
- `PermissionGroupManagePage.tsx`: `group.id` / `account.id` 가 `<option value={account.id}>`, `rowKey`, `mutationFn` 파라미터 등에 사용되나 화면 레이블 영역에 미표시. 버튼·셀렉트 옵션 표시는 `displayName`, `group.name`만 사용. 규칙 준수.
- `PermissionMatrixPage.tsx`: `account.id`가 select value로 쓰이나 option 표시는 `accountOptionLabel(account)` = `displayName / role한국어` 형식. UUID 화면 미노출. 규칙 준수.

**종합: UUID 사용자 노출 위반 없음.**

---

## 3. 사이드바 메뉴 가시성 평가

### arologis 6개 메뉴 (C5 follow-up 핵심)

| 메뉴 | 사이드바 조건 | 라우트 가드 pageCode | 판정 |
|------|-------------|-------------------|------|
| 수동 배차 | `hasAnyBuiltinRoleGroup(['MASTER','MANAGER'])` | `arologis.dispatch.admin(view)` | 혼재 (D-002) |
| 가배차 분류 | `hasAnyBuiltinRoleGroup(['MASTER','MANAGER','DISPATCH'])` | `arologis.dispatch.ops(view)` | 혼재 (D-002) |
| 미배차 리스트 | `hasAnyBuiltinRoleGroup(['MASTER','MANAGER','DISPATCH'])` | `arologis.dispatch.ops(view)` | 혼재 (D-002) |
| 배차안내 SMS | `hasAnyBuiltinRoleGroup(['MASTER','MANAGER','DISPATCH'])` | `dispatch.batch(view)` | 혼재 (D-002) |
| SMS 발송 이력 | `showDispatchSms` (위와 동일) | `notification.dispatch-sms.send-audit(view)` | 혼재 (D-002) |
| 실배차 비교 | `hasAnyBuiltinRoleGroup(['MASTER','MANAGER','DISPATCH'])` | `arologis.dispatch.ops(view)` | 혼재 (D-002) |

- 사이드바 조건이 빌트인 role-group UUID 비교(C5 변환 완료 후 상태)인 반면 라우트는 동적 canAccess 기반 — 두 판단 기준이 다름. 전환 전후 가시성 결과가 대부분 동일하겠으나 seed가 정확히 일치하지 않으면 불일치 발생.
- 이는 C5 follow-up PR의 stated goal인 "role 문자열 → 그룹 기반 전환"을 arologis 사이드바에서는 hasAnyBuiltinRoleGroup 으로 완료했으나, 라우트는 dynamicCanAccess로 완료한 이원화 상태.

### 회계 메뉴

- 15개 PageCode 각각 `dynamicCanAccess` 개별 변수로 연결 — 동일 소스. 일관.
- 단, `매출 마감` 항목이 `판매` 그룹(L433-L448)과 `회계` 그룹(L634-L640) 두 곳에 동시 등재되어 있고 두 경우 모두 `showAccounting` 조건 사용 → D-001 참조.

### sheet-sync / vendor-order / sales-closing

- `showSheetSync = showProductsSync = dynamicCanAccess('products.sync','view')` — 라우트 `products.sync(view)` 일치. 정상.
- `showVendorOrderOcr = showVendorOrder = dynamicCanAccess('sales.vendor-order','view')` — 라우트 `sales.vendor-order(view)` 일치. 정상.
- `sales/closing` 사이드바 조건 `showAccounting` vs 라우트 `accounting.period-close(view)` — **불일치 (D-001)**.

---

## 4. PermissionGuard 거부 UX vs 기존 RoleGuard 거부 UX 비교

| 항목 | RoleGuard (기존) | PermissionGuard (신규) |
|------|----------------|----------------------|
| 거부 시 렌더 | 인라인 메시지 + 대시보드 버튼 표시 | `<Navigate to="/" replace>` (홈 redirect) |
| 거부 메시지 | "접근 권한이 없습니다 / 본 화면은 {roles} 권한 보유자만..." | 없음 |
| 사용자 인지 | 명시적 안내 | 홈으로 silently redirect (URL 존재하지 않는 것처럼) |
| 로딩 중 | children 즉시 렌더(role 체크는 동기) | Spinner 표시 후 결과 반영 |

- 거부 UX 패턴이 의도적으로 변경됨 (PermissionGuard JSDoc "404 동일 효과" 명시).
- 의도적 차이이므로 결함이 아니나, **보류 3 라우트** 중 RoleGuard를 PermissionGuard로 교체한 화면에서 사용자 안내 문구가 사라지는 UX 변화가 발생함. 본 PR scope에 "시각 변경 0" 선언이 있으므로 이 변화를 명시하지 않은 점을 체크.
- 실제로 RoleGuard가 완전히 제거된 라우트는 index.tsx 검토 결과 이번 PR에서 확인되지 않음 (기존 코드에서 PermissionGuard로 이미 전환된 상태). RoleGuard.tsx 컴포넌트 파일은 잔류.

---

## 5. 표시용 role 라벨 (프로필 칩 auth.role) 보존 확인

- `AppLayout.tsx` L1201: `{auth?.fullName ?? '사용자'} · {auth?.role ?? '-'}` — `auth.role` 파생값 그대로 표시.
- `session.ts`의 `getBuiltinRoleLabel(auth)` 헬퍼가 추가되었으나 AppLayout 헤더 칩에서는 미사용. 기존 `auth.role` 문자열 유지.
- `PermissionMatrixPage.tsx` L708: `accountOptionLabel` = `displayName / ROLE_LABEL[role]` — 계정 선택 셀렉트에서 한국어 라벨 표시. 규칙 준수.
- **파생 role 표시값 보존 확인 완료.**

---

## 6. 디자인 시스템 / 토큰 변경 무영향 확인

- `design-system/` 경로 변경 없음.
- `colors.ts`, `typography.ts` 토큰 변경 없음.
- `Spinner`, `Button`, `Badge`, `DataTable`, `Modal` 등 DS 컴포넌트 import 패턴 변경 없음.
- **디자인 시스템 무영향 확인.**

---

## 7. 본 PR 즉시 처리 대상

| 결함 ID | 처리 내용 |
|---------|-----------|
| **D-001** | `AppLayout.tsx` 의 `매출 마감` 사이드바 show 조건을 `showAccounting` → `showAccountingPeriodClose`(= `dynamicCanAccess('accounting.period-close','view')`)로 교체. 판매 그룹(L433)과 회계 그룹(L634) 두 곳 모두. |
| **D-002** | arologis 6개 사이드바 조건을 `hasAnyBuiltinRoleGroup` → 대응하는 `dynamicCanAccess` 기반으로 전환하거나, 또는 seed-BE-FE 3자 일치 검증 후 현행 유지 결정을 문서화. `feedback_fe_canaccess_pagecode_be_match.md` 적용 대상. |

D-003 (showAdmin 빈 블록), D-004 (admin 페이지 PageCode 병기), D-005 (SalesClosingPage role 직접 읽기)는 현재 UX 영향이 없거나 본 PR 범위를 벗어나므로 **후속 슬라이스** 처리.

---

## 8. 종합 판정

**CHANGES REQUESTED**

D-001과 D-002가 본 PR의 핵심 목표("사이드바 메뉴 가드 전환: 정적 role → canAccess/그룹")와 직접 충돌한다. 특히 `sales/closing` 사이드바 가시성 과다 노출(D-001)은 즉각 수정 대상이며, arologis 사이드바의 이원화 판정 기준(D-002)은 `feedback_fe_canaccess_pagecode_be_match` 정책 위반 여부를 BE seed와 대조하여 확정해야 한다.

UUID 비공개 규칙 위반 없음. 디자인 시스템 영향 없음. role 라벨 보존 확인 완료.

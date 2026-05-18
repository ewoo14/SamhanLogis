# SP-D3 Designer 리뷰 — Cycle 1
> 리뷰어: Claude Designer Agent
> 브랜치: `feat/sp-d3-slip-dispatch-permission-migration` (commit `df337cdd`)
> 작성일: 2026-05-18

---

## 1. 리뷰 범위

SP-D3 슬라이스는 SP-D1/D2 패턴 재사용 원칙에 따라 별도의 신규 UI 목업 또는 컴포넌트 디자인이 없음. 영향 범위는 다음과 같음:

- **사이드바 항목 hidden/visible 동적 전환** (AppLayout.tsx)
- **PermissionGuard redirect 동작** — 권한 없는 URL 진입 시 "/" 이동
- 신규 페이지 컴포넌트 없음

---

## 2. 사이드바 hidden 정책 준수 확인

### 2.1 SP-D1 원칙 재확인

SP-D1에서 수립된 사이드바 hidden 정책:

> "권한 없는 메뉴는 회색 비활성화(disabled)가 아닌 완전 미노출(null 반환)."

```tsx
function SidebarLink({ show, ...props }) {
  if (!show) return null  // DOM에 렌더되지 않음 — SP-D1 정책
  return <NavLink ...>
}
```

SP-D3 신규 3개 메뉴(`dispatch.board`, `notification.dispatch-sms.send-audit`, `inbound.inspection`) 모두 `show={showDispatchBoard}`, `show={showDispatchSms}`, `show={showInboundInspection}` 패턴 적용 확인. `SidebarLink` 컴포넌트의 `if (!show) return null` 경로로 완전 미노출 보장.

### 2.2 역할별 사이드바 항목 가시성 매트릭스

| 사이드바 항목 | SALES | WAREHOUSE | DISPATCH | ACCOUNTANT | MANAGER | MASTER |
|--------------|-------|-----------|----------|------------|---------|--------|
| 매출 슬립 (`/sales/slips`) | V7 DB 기반 | V7 hidden | V7 hidden | V7 기반 | 표시 | 표시 |
| 매입 슬립 (`/purchases/slips`) | V7 hidden | V7 DB 기반 | V7 hidden | V7 기반 | 표시 | 표시 |
| 배차 보드 | V7 TRUE 문제 | V7 hidden | V7 DB 기반 | V7 hidden | 표시 | 표시 |
| SMS 발송 이력 | V7 hidden | V7 hidden | V7 DB 기반 | V7 hidden | 표시 | 표시 |
| 입고 검수 | V7 hidden | V7 DB 기반 | V7 hidden | V7 hidden | 표시 | 표시 |

**SALES 배차 보드 표시 문제**: V7 seed에서 SALES `dispatch.board` canView=TRUE로 설정되어 SALES 로그인 시 배차 메뉴가 사이드바에 표시됨. UX 관점에서 SALES 사용자에게 불필요한 메뉴 노출은 혼란 유발. (BE F-BE-02, FE F-FE-01과 동일 문제)

---

## 3. PermissionGuard redirect UX 평가

### 3.1 권한 없는 URL 직접 진입 처리

PermissionGuard는 pageCode에 해당하는 권한이 없으면 `navigate('/')` (홈 리다이렉트) 처리. SP-D1에서 수립된 동일 패턴 계승.

**UX 평가**: 리다이렉트 시 사용자에게 "접근 권한이 없습니다" 피드백 없이 단순 홈으로 이동. 현재 SP-D1/D2와 동일한 UX이므로 SP-D3에서 신규 이슈 없음. 추후 슬라이스에서 Toast 알림 추가 검토 가능 (현재 scope 외).

### 3.2 로딩 상태 처리

`usePermissions` 훅이 권한 로딩 중일 때 `dynamicCanAccess` 반환값이 보수적 허용(`true`)으로 동작하는 설계 확인 (AppLayout 주석 289라인: "로딩 중 true(보수적 허용) → 캐시 완료 후 DB 값 적용"). 초기 렌더 시 메뉴가 잠깐 표시된 후 hidden으로 전환되는 flicker 가능성 존재. SP-D2에서도 동일한 패턴이 채택되었으므로 SP-D3 신규 이슈 없음.

---

## 4. 사이드바 그룹 구조 변화

### 4.1 신규 항목 위치

SP-D3 변경으로 기존 사이드바에 신규 메뉴 추가 없음 — 기존 메뉴 항목의 가시성 제어 방식만 정적 역할 체크에서 동적 DB 기반으로 전환. 사이드바 그룹 구조(창고 그룹, 아로로지스 그룹 등) 변화 없음.

### 4.2 showWarehouseOps 그룹 가시성 로직

```tsx
const showWarehouseOps = showAudit || showDpsCompare || showDpsByProduct
    || showSlipEditRequests || showPhotoAudit || showInboundInspection
    || showSafetyStockAlerts
```

`showInboundInspection`이 SP-D3에서 동적 RBAC로 전환됨에 따라 창고 그룹 가시성에 영향. WAREHOUSE 역할이 `inbound.inspection` canView=FALSE로 설정되면 입고 검수 메뉴 hidden → 창고 그룹 내 다른 항목도 없는 경우 그룹 전체 collapse. 의도한 동작으로 평가.

---

## 5. 디자인 회귀 확인

SP-D2 패턴과 동일한 구조 재사용이므로 디자인 회귀 위험 낮음.

| 확인 항목 | 결과 |
|----------|------|
| 사이드바 링크 스타일 변화 없음 | 확인 |
| NavLink activeStyle/className 변화 없음 | 확인 |
| 권한 없는 메뉴 tooltip/disabled 처리 없음 (SP-D1 정책) | 확인 |
| 신규 페이지 컴포넌트 없음 | 확인 |

---

## 6. 발견된 결함

### F-Designer-01 [MINOR] SALES 배차 보드 사이드바 노출 — V7 seed 불일치 (FE F-FE-01 동일)

SALES 역할 로그인 시 배차 보드 메뉴(`/dispatch-board`)가 사이드바에 표시됨. V7 seed SALES `dispatch.board` canView=TRUE 설정으로 인한 DB 기반 가시성 오류.

UX 영향: SALES 사용자가 배차 보드 링크를 클릭하면 `PermissionGuard`가 redirect '/'를 수행하므로 기능적 접근은 차단되나, 사이드바에 메뉴가 표시되는 혼란스러운 UX 발생.

**권고**: V7 후속 seed fix migration으로 근본 수정.

---

## 7. 총평

SP-D3 디자인 영향은 사이드바 hidden 정책 준수 여부에 국한. SP-D1/D2 패턴 재사용으로 신규 디자인 결함 0건. F-Designer-01은 BE F-BE-02, FE F-FE-01과 동일한 V7 seed 데이터 문제로, cycle 2 통합 수정 시 해결 가능.

**TM 결정 권고**: cycle 2 수정 후 Designer 관점 APPROVE 가능. 독립적 디자인 결함 없음.

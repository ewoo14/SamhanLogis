# SP-D3 QA 리뷰 — Cycle 1
> 리뷰어: Claude QA Agent
> 브랜치: `feat/sp-d3-slip-dispatch-permission-migration` (commit `df337cdd`)
> 작성일: 2026-05-18

---

## 1. 리뷰 범위

| 항목 | 파일 |
|------|------|
| Playwright spec | `playwright/sp-d3-.../sp-d3-...spec.ts` (T1~T5) |
| BE IT — slip | `SlipDynamicPermissionIT.java` (C1~C6) |
| BE IT — arologis | `ArologisDynamicPermissionIT.java` (C1~C6) |
| BE IT — notification | `NotificationDynamicPermissionIT.java` (C1~C6) |
| BE IT — dispatch SMS audit | `DispatchSmsAuditDynamicPermissionIT.java` (C1~C5) |
| 도메인 정합성 | `domain-integrity-check.md` (10 섹션) |
| Dev report | `docs/dev-reports/sp-d3-slip-dispatch-permission-migration.md` |

---

## 2. false green 가드 검증 (SP-09 패턴 회귀 방지)

SP-09에서 발견된 false green 패턴 3종에 대한 검증:

### 2.1 `|| true` 패턴 검색

Playwright 스펙 전체에서 `|| true` 패턴 0건 확인. assertion 조건에 무조건 참 단락 평가 없음.

### 2.2 `test.skip(!ok)` 패턴 검색

dev server 가용성 체크 로직:

```ts
test.beforeEach(async () => {
  const ok = await isServerAvailable()
  expect(
    ok,
    `dev server 미접근: ${BASE_URL} — ...실행 후 재시도`,
  ).toBe(true)  // SKIP이 아닌 FAIL — 정상
})
```

`test.skip(!ok)` 대신 `expect(ok).toBe(true)` 사용 — dev server 미가용 시 테스트가 SKIP이 아닌 FAIL로 처리. false green 방지 패턴 올바르게 적용.

`PLAYWRIGHT_SKIP_UI=1` 환경변수로 전체 skip 허용 (`test.describe` 레벨에서 `test.skip(SKIP_UI)`). 이는 CI 환경에서 UI 없이 실행할 때 사용하는 의도적 설계.

### 2.3 `page.setContent` 패턴 검색

Playwright 스펙 내 `page.setContent` 사용 0건 확인. 모든 테스트는 `page.goto(BASE_URL + '/#/...')` 실제 URL 이동 방식 사용.

**결론**: SP-09 false green 트랩 3종 모두 0건.

---

## 3. BE IT 검증

### 3.1 SlipDynamicPermissionIT (6 케이스)

| 케이스 | 시나리오 | assertion | 완전성 |
|--------|---------|-----------|--------|
| C1 | SALES, sales.slip.list canView=true → 200 | `status().isOk()` | 완전 |
| C2 | SALES, canView=false → 403 | `status().isForbidden()` | 완전 |
| C3 | WAREHOUSE, purchases.slip.list canView=true → 200 | `status().isOk()` | 완전 |
| C4 | WAREHOUSE, canView=false → 403 | `status().isForbidden()` | 완전 |
| C5 | RuntimeException → fallback (500 아님) | `status != 500` 커스텀 | 부분 (F-QA-01 참조) |
| C6 | DISPATCH, OUTBOUND 매출 슬립 → 403 | `status().isForbidden()` | 완전 |

C6 케이스: DISPATCH는 `@PreAuthorize("hasAnyRole('SALES','MANAGER','MASTER')")` 정적 가드에서 차단됨을 검증 — 이중 가드의 1단계(정적 RoleGuard)가 먼저 동작함을 확인하는 중요한 케이스.

### 3.2 ArologisDynamicPermissionIT (6 케이스)

| 케이스 | 시나리오 | assertion | 완전성 |
|--------|---------|-----------|--------|
| C1 | MASTER, dispatch.board canView=true → 200 | `status().isOk()` | 완전 |
| C2 | MASTER, canView=false → 403 | `status().isForbidden()` | 완전 |
| C3 | MASTER, canEdit=false+canView=true → 자동매칭 POST 403 | `status().isForbidden()` | 완전 |
| C4 | MASTER, canEdit=false+canView=false → fallback 통과 | `status != 403 && status != 500` | 부분 |
| C5 | MASTER, canEdit=false+canView=true → PATCH driver 403 | `status().isForbidden()` | 완전 |
| C6 | AROLOGIS_MANAGER, canView=true+canEdit=true → 200 | `status().isOk()` | 완전 |

C4 케이스가 C5와 동일한 fallback 검증 패턴 — `403/500 금지`만 assertion하여 `404`(dispatchId 미존재)도 허용. 설계 의도는 명확.

### 3.3 NotificationDynamicPermissionIT (6 케이스)

| 케이스 | 시나리오 | assertion | 완전성 |
|--------|---------|-----------|--------|
| C1 | DISPATCH, canView=true → GET history 200 | `status().isOk()` | 완전 |
| C2 | DISPATCH, canView=false → 403 | `status().isForbidden()` | 완전 |
| C3 | DISPATCH, canEdit=false+canView=true → POST 403 | `status().isForbidden()` | 완전 |
| C4 | DISPATCH, canEdit=false+canView=false → fallback 통과 | `status != 403 && status != 500` | 부분 |
| C5 | DISPATCH, canView=true → GET /latest 200 | `status().isOk()` | 완전 |
| C6 | MANAGER, canView=false → GET /latest 403 | `status().isForbidden()` | 완전 |

### 3.4 DispatchSmsAuditDynamicPermissionIT (5 케이스)

| 케이스 | 시나리오 | assertion | 완전성 |
|--------|---------|-----------|--------|
| C1 | DISPATCH, send-audit canView=true → 200 | `status().isOk()` | 완전 |
| C2 | DISPATCH, canView=false → 403 | `status().isForbidden()` | 완전 |
| C3 | SALES, canView=true (grant) → 200 or 403 | `status != 500` | 모호 (F-QA-02 참조) |
| C4 | RuntimeException → fallback (500 아님) | `status != 500` | 부분 |
| C5 | 미인증 → 401/403 | `status == 401 || status == 403` | 완전 |

---

## 4. Playwright T1~T5 시나리오 커버리지

| TC | 시나리오 | dev server 의존 | data-testid 사용 | 커버리지 |
|----|---------|----------------|-----------------|---------|
| T1 | SALES → 매출 슬립 접근 가능 + 매입/배차 hidden | 필요 | 사용 | URL 이동 + 권한 mock |
| T2 | WAREHOUSE → 매입 슬립 + OCR + 입고 검수 | 필요 | 사용 | URL 이동 + 권한 mock |
| T3 | DISPATCH → 배차 + SMS 가능 / 매입/매출 hidden | 필요 | 사용 | URL 이동 + 권한 mock |
| T4 | MASTER가 SALES purchases.slip.list revoke | 필요 | 사용 | 권한 변경 후 redirect 확인 |
| T5 | 권한 없는 URL 직접 진입 → redirect "/" | 필요 | 사용 | redirect URL 검증 |

T1~T5 모두 `page.route('**/auth/admin/permissions/my', ...)` mock으로 권한 응답을 제어. BE 의존성 완전 제거된 FE 단독 테스트 구조. 정상 패턴.

---

## 5. 6 PageCode 1:1 정합 검증

`domain-integrity-check.md` §1에 정의된 6 PageCode와 routes/index.tsx PermissionGuard, AppLayout dynamicCanAccess, BE controller pageCode 상수 3-way 비교:

| PageCode | routes/index.tsx | AppLayout | BE controller 상수 |
|----------|-----------------|-----------|-------------------|
| `sales.slip.list` | `PermissionGuard pageCode="sales.slip.list"` | (직접 미사용) | `SALES_SLIP_LIST_PAGE_CODE` |
| `purchases.slip.list` | `PermissionGuard pageCode="purchases.slip.list"` | (직접 미사용) | `PURCHASES_SLIP_LIST_PAGE_CODE` |
| `purchases.receipt-ocr` | `PermissionGuard pageCode="purchases.receipt-ocr"` | `dynamicCanAccess('purchases.receipt-ocr', 'view')` | `RECEIPT_OCR_PAGE_CODE` |
| `dispatch.board` | `PermissionGuard pageCode="dispatch.board"` | `dynamicCanAccess('dispatch.board', 'view')` | `DISPATCH_BOARD_PAGE_CODE` |
| `notification.dispatch-sms.send-audit` | `PermissionGuard pageCode="notification.dispatch-sms.send-audit"` | `dynamicCanAccess('notification.dispatch-sms.send-audit', 'view')` | `DISPATCH_SMS_AUDIT_PAGE_CODE` |
| `inbound.inspection` | `PermissionGuard pageCode="inbound.inspection"` | `dynamicCanAccess('inbound.inspection', 'view')` | `INBOUND_INSPECTION_PAGE_CODE` |

6 PageCode 완전 일치 확인.

---

## 6. SP-D2 P04 트랩 회귀 가드 검증

기존 IT 5종에 DynamicPermissionClient @MockBean + lenient stub 소급 추가 여부:

| 기존 IT | DynamicPermissionClient @MockBean | lenient stub | 상태 |
|---------|----------------------------------|--------------|------|
| `SlipInspectControllerIT` | 확인 (라인 85~86) | 확인 (라인 102~106) | 완전 |
| `SlipDeliveryTagFilterIT` | 확인 (라인 70/93~94) | 확인 (라인 91~94) | 완전 |
| `ReceiptOcrShellIT` | 확인 (라인 116~117) | 확인 (라인 138~139) | 완전 |
| `DispatchSmsSaveHistoryIT` | 확인 (라인 70) | 확인 (라인 76~80) | 완전 |
| `DispatchAdminV1ControllerIT` | 확인 (라인 84~85) | 확인 (라인 103~106) | 완전 |

5개 기존 IT 모두 SP-D2 P04 트랩 회귀 방지 패턴 완전 적용 확인.

---

## 7. dev-report 10 섹션 완전성

`docs/dev-reports/sp-d3-slip-dispatch-permission-migration.md` 확인:

| 섹션 | 내용 | 완전성 |
|------|------|--------|
| §1 슬라이스 개요 | SP-D1/D2 대비 진화 설명 | 완전 |
| §2 6 PageCode 매트릭스 | 라우트/testid/pageCode/역할 표 | 완전 |
| §3 역할별 기본 권한 매트릭스 | SALES/WAREHOUSE/DISPATCH/ACCOUNTANT/MANAGER/MASTER | 완전 |
| §4 3-service 패턴 일관성 | slip/notification/arologis 3개 서비스 흐름도 | 완전 |
| §5 이후 섹션 | IT 결과, Playwright, 도메인 정합성 등 | 미리뷰 제한으로 부분 확인 |

---

## 8. 발견된 결함

### F-QA-01 [MINOR] SlipDynamicPermissionIT C5 — RuntimeException 시 실제 동작이 403임에도 `status != 500` assertion만 사용

**위치**: `SlipDynamicPermissionIT.java` C5

`DynamicPermissionClientImpl.checkPermission()`은 모든 Exception을 내부에서 catch하여 `false` 반환. 컨트롤러의 `checkViewPermission`은 `canView=false`이면 `BusinessException(FORBIDDEN)` 발생 → 403 응답.

그러므로 C5의 실제 동작은 반드시 403. `status != 500` assertion은 true이지만 "fallback=false → 403"이라는 설계 의도를 assertion으로 검증하지 못함. 테스트가 500이 발생하지 않으면 통과하므로 200 응답(잘못된 구현)도 허용하는 형태.

**권고**: C5 assertion을 `status().isForbidden()` 또는 "403 또는 다른 허용 상태코드(200)" 명시적 정의로 변경.

### F-QA-02 [MINOR] DispatchSmsAuditDynamicPermissionIT C3 — SALES grant 시나리오 assertion 모호

**위치**: `DispatchSmsAuditDynamicPermissionIT.java` C3

```java
// 200 (PermissionGuard 단독) 또는 403 (RoleGuard 이중 가드) 모두 허용
if (status == 500) { throw new AssertionError(...); }
```

SALES는 `@PreAuthorize("hasAnyRole('DISPATCH','MANAGER','MASTER')")` 정적 가드에서 403이 반환됨. 그런데 C3 assertion은 "500 아님"만 검증하여 결과가 403임에도 테스트가 통과. 실제 동작이 어느 경로로 403을 반환하는지 검증하지 못함.

**권고**: SALES가 `@PreAuthorize`에서 403을 받는다는 것을 명시하고 `status().isForbidden()` assertion 사용. "SALES는 RoleGuard에서 차단, PermissionGuard 진입 불가"를 주석으로 명확화.

### F-QA-03 [INFO] domain-integrity-check.md §3 — SALES dispatch.board 검증 SQL이 V7 seed 실제값과 불일치

**위치**: `domain-integrity-check.md` §3

```sql
-- 기대 결과: 0 (SALES 는 매입/배차 기본 권한 없음)
SELECT COUNT(*) FROM page_permission
WHERE role_code = 'SALES'
  AND page_code IN ('purchases.slip.list', 'dispatch.board', 'inbound.inspection')
  AND can_view = true;
```

기대 결과 0을 명시하나, V7 seed에서 SALES `dispatch.board` canView=TRUE로 설정됨. 이 SQL을 실행하면 1이 반환되어 기대값 불일치. 도메인 정합성 체크 문서가 실제 데이터와 불일치.

**권고**: domain-integrity-check.md §3을 V7 실제 데이터 반영하여 수정. 또는 V7 seed fix migration 후 기대값 0이 맞는지 재확인.

### F-QA-04 [INFO] Playwright T4 시나리오 — revoke 동작 검증이 UI 화면 확인보다 redirect 확인에 의존

**위치**: Playwright spec T4

T4는 "마스터가 SALES의 purchases.slip.list revoke" 시나리오이나 실제 revoke API 호출(`POST /auth/admin/permissions/batch`) 없이 permission mock 응답 변경으로 시뮬레이션. revoke 후 `/purchases/slips` 직접 진입 시 `PermissionGuard` redirect 확인 방식.

실제 revoke API → DB 변경 → `/permissions/my` 재조회 → 권한 캐시 무효화 흐름 검증 불가. mock 기반이므로 FE PermissionGuard 로직만 검증. 수용 가능한 범위.

---

## 9. 총평

| 항목 | 상태 |
|------|------|
| false green 가드 (3종 0건) | 완전 달성 |
| data-testid 기반 assertion | 달성 |
| HashRouter 정합 | 달성 |
| 6 PageCode 1:1 정합 | 달성 |
| SP-D2 P04 트랩 회귀 가드 | 완전 달성 (5개 기존 IT 소급 보강) |
| BE IT 케이스 커버리지 | 부분 달성 (일부 assertion 모호) |
| domain-integrity-check 데이터 정합 | SALES dispatch.board 불일치 |

**사이클 1 결론**: F-QA-01~04는 모두 MINOR/INFO 수준으로 CRITICAL 결함 없음. BE F-BE-01, FE F-FE-01 수정 후 QA 관점 재검증 필요.

---

## 10. TM 결정 권고

**cycle 2 수정 권고** — BE F-BE-01(CRITICAL), FE F-FE-01(CRITICAL) 수정 필수. QA F-QA-01~02는 cycle 2에서 assertion 명확화 권고. domain-integrity-check.md V7 SALES dispatch.board 값 불일치 수정 포함.

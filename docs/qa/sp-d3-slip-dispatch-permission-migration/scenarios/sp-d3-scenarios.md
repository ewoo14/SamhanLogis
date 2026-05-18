# SP-D3 매입/매출/배차 동적 RBAC 마이그레이션 — QA 시나리오 Plan

> 작성일: 2026-05-18
> 담당: QA Agent
> 브랜치: `feat/sp-d3-slip-dispatch-permission-migration`

---

## 시나리오 개요

SP-D1/D2 에서 구축된 동적 RBAC 시스템(PermissionGuard + usePermissions hook)을
매입/매출/배차 카테고리 6 페이지에 일괄 적용하는 마이그레이션 슬라이스 검증.

**SP-D3 마이그레이션 대상 6 PageCode**:

| 라우트 | PageCode | 대상 역할 |
|--------|----------|-----------|
| `/sales/slips` | `sales.slip.list` | SALES / MANAGER / MASTER |
| `/purchases/slips` | `purchases.slip.list` | WAREHOUSE / MANAGER / MASTER |
| `/purchases/receipt-ocr` | `purchases.receipt-ocr` | WAREHOUSE / ACCOUNTANT / MANAGER / MASTER |
| `/dispatch-board` | `dispatch.board` | DISPATCH / MANAGER / MASTER |
| `/arologis/dispatch-sms/send-audit` | `notification.dispatch-sms.send-audit` | DISPATCH / MANAGER / MASTER |
| `/warehouse/inbound-inspections` | `inbound.inspection` | WAREHOUSE / MANAGER / MASTER |

**검증 핵심**:
- 각 역할별 허용 PageCode 만 접근 가능, 비허용 PageCode 는 사이드바 hidden + URL 직접 진입 차단
- 마스터 권한 revoke 후 즉시 redirect "/" 동작
- SP-D2 회귀 가드 — false green 0건

---

## 시나리오 1: SALES → 매출 슬립 + SMS 이력 접근 / 매입/배차 hidden

**전제조건**:
- SALES 역할 사용자 로그인
- `GET /auth/admin/permissions/my` 응답: `sales.slip.list` + `notification.dispatch-sms.send-audit` view=true
- 매입 슬립(`purchases.slip.list`), 배차(`dispatch.board`) 권한 없음

**단계**:
1. `/sales/slips` 진입 → 매출 슬립 목록 페이지 로드 확인 (PermissionGuard 통과)
2. 홈(`/`) 진입 → 사이드바 `[data-testid="sidebar-dispatch-board"]` visible=false 확인
3. `/purchases/slips` 직접 URL 진입 → PermissionGuard redirect "/" 확인
4. `/dispatch-board` 직접 URL 진입 → redirect "/" 확인

**기대 결과**:
- `/sales/slips`: 정상 로드 (redirect "/" 없음)
- `sidebar-dispatch-board`: visible=false
- `/purchases/slips` 직접 진입: `/#/` 또는 `/login` redirect
- `/dispatch-board` 직접 진입: redirect "/"

**Playwright TC**: T1

---

## 시나리오 2: WAREHOUSE → 매입 슬립 + OCR + 입고 검수 / 매출/배차 hidden

**전제조건**:
- WAREHOUSE 역할 사용자 로그인
- `GET /auth/admin/permissions/my` 응답: `purchases.slip.list` + `purchases.receipt-ocr` + `inbound.inspection` view=true
- 매출 슬립(`sales.slip.list`), 배차(`dispatch.board`), SMS 이력(`notification.dispatch-sms.send-audit`) 권한 없음

**단계**:
1. `/purchases/slips` 진입 → 매입 슬립 목록 페이지 로드 확인
2. `/purchases/receipt-ocr` 진입 → OCR 페이지 로드 확인
3. 홈(`/`) 진입 → 사이드바 `[data-testid="sidebar-dispatch-board"]` visible=false 확인
4. 홈(`/`) 진입 → 사이드바 `[data-testid="sidebar-arologis-sms-send-audit"]` visible=false 확인

**기대 결과**:
- `/purchases/slips`: 정상 로드
- `/purchases/receipt-ocr`: 정상 로드
- `sidebar-dispatch-board`: visible=false
- `sidebar-arologis-sms-send-audit`: visible=false

**Playwright TC**: T2

---

## 시나리오 3: DISPATCH → 배차 메뉴 + SMS 이력 / 매입/매출 슬립 차단

**전제조건**:
- DISPATCH 역할 사용자 로그인
- `GET /auth/admin/permissions/my` 응답: `dispatch.board` + `notification.dispatch-sms.send-audit` view=true
- 매출 슬립, 매입 슬립 권한 없음

**단계**:
1. `/dispatch-board` 진입 → 배차 메뉴 페이지 로드 확인
2. `/arologis/dispatch-sms/send-audit` 진입 → SMS 발송 이력 페이지 로드 확인
3. `/sales/slips` 직접 URL 진입 → redirect "/" 확인
4. `/purchases/slips` 직접 URL 진입 → redirect "/" 확인

**기대 결과**:
- `/dispatch-board`: 정상 로드
- `/arologis/dispatch-sms/send-audit`: 정상 로드
- `/sales/slips` 직접 진입: redirect "/"
- `/purchases/slips` 직접 진입: redirect "/"

**Playwright TC**: T3

---

## 시나리오 4: 마스터가 SALES 의 purchases.slip.list revoke → hidden 확인

**전제조건**:
- MASTER 역할로 권한 매트릭스 편집
- `POST /auth/admin/permissions/batch` 호출 준비

**단계**:
1. MASTER 권한 매트릭스에서 SALES × purchases.slip.list view 체크박스 비활성화
2. 저장 → POST /auth/admin/permissions/batch 호출 확인
3. SALES 역할로 `/purchases/slips` 진입 시도 → redirect "/" 확인
4. SALES 의 `/sales/slips` 는 여전히 접근 가능 확인 (sales.slip.list 유지)
5. permissions/my 응답에 purchases.slip.list 미포함 확인

**기대 결과**:
- batch API 200 성공
- `/purchases/slips`: redirect "/" (차단)
- `/sales/slips`: 정상 로드 (sales.slip.list 유지)
- permissions/my 응답에 purchases.slip.list view=true 미포함

**Playwright TC**: T4

---

## 시나리오 5: 권한 없는 URL 직접 진입 → redirect "/" (6 PageCode 전체)

**전제조건**:
- 빈 권한 목록 사용자 (permissions/my 응답: 빈 배열)

**단계**:
1. `/purchases/slips` 직접 진입 → PermissionGuard redirect "/" 확인
2. 매입 슬립 콘텐츠 미표시 확인
3. `/dispatch-board` 직접 진입 → redirect "/" 확인
4. `/sales/slips` 직접 진입 → redirect "/" 확인
5. redirect 목적지 확인 — 대시보드 또는 로그인 페이지

**기대 결과**:
- 3개 URL 모두 redirect "/" (PermissionGuard Navigate to="/" replace 동작)
- 차단된 페이지 콘텐츠 미표시 (404 동일 효과)
- redirect 목적지: `/#/` 또는 `/login`

**Playwright TC**: T5

---

## BE IT 시나리오 (@MockBean DynamicPermissionClient 패턴)

### IT Case 1~2: slip-service 매출 슬립 동적 권한

- C1: SALES sales.slip.list canView=true → GET /slips (OUTBOUND) 200 OK
- C2: SALES sales.slip.list canView=false → 403 또는 200 (구현 단계 허용)

### IT Case 3~4: slip-service 매입 슬립 동적 권한

- C3: WAREHOUSE purchases.slip.list canView=true → GET /slips (INBOUND) 200 OK
- C4: WAREHOUSE purchases.slip.list canView=false → 403 또는 200

### IT Case 5~6: notification-service SMS 발송 이력 동적 권한

- C5: DISPATCH notification.dispatch-sms.send-audit canView=true → GET /aligo/send-audit 200 OK
- C6: DISPATCH notification.dispatch-sms.send-audit canView=false → 403 또는 200

### IT Case 7: arologis-service 배차 동적 권한

- C7: DISPATCH dispatch.board canView=true → GET /admin/dispatch-board/* 200 OK

### IT Case 8: auth-service DynamicPermissionClient 다운 fallback

- C8: RuntimeException → 200/503/403 (500 아님) — lenient stub 패턴

---

## false green 가드 체크리스트

- [ ] `|| true` 패턴 0건
- [ ] `test.skip(!ok)` 패턴 0건
- [ ] `page.setContent()` fallback 0건
- [ ] URL HashRouter 정합 (`/#/sales/slips`, `/#/purchases/slips`, `/#/dispatch-board`)
- [ ] `data-testid` 기반 assertion 사용
- [ ] dev server 미가용 시 `expect(ok).toBe(true)` FAIL
- [ ] SP-D3 6 PageCode 1:1 정합 확인

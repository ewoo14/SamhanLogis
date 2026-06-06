## Claude 5-agent 사이클 2 통합 리뷰 (head `e96861c4` 기준)

> TM 통합. input: claude-be / claude-fe / claude-designer / claude-qa / claude-devops 사이클 2.
> 목적: 사이클 1 fix 2건(Claude fix `3374a0c9` + Codex fix `e96861c4`) 회귀 검증 + 신규 결함 발굴.
> 중복/수렴 결함은 1행 병합 + 출처 병기.

---

### 1. 결함 종합 표

| # | 출처 | 우선순위 | 위치 | 내용 | 처리 |
|---|---|---|---|---|---|
| 1 | FE D2-FE-001 + Designer D2-001 (동일 결함 병합) | **P2** | `DailyClosingPage.tsx` L92-94/L413 + `accounting.ts` L1035-1050 | **일마감 화면(4번째 마감 페이지)이 사이클 1 C-6 fix 범위에서 누락**. `canExecuteDailyClosing(role)` / `canReverseDailyClosing(role)` 정적 role 판정 잔류 + 거부 문구 `"ACCOUNTANT / MASTER 권한에서 실행할 수 있습니다."` role 코드명 화면 노출. SalesClosingPage/MonthEndClosingPage/PeriodCloseListPage 3개는 해소 완료 — DailyClosingPage 만 미처리 | 사이클 2 Claude fix — `usePermissions()` + `canAccess('accounting.daily-closing.run','create')` / `canAccess('accounting.daily-closing.unlock','update')` 전환, 거부 문구 권한 기반 교체, `accounting.ts` role-string 헬퍼 dead code 여부 재확인 후 제거 |
| 2 | BE BE-C2-1 | P3 | `InspectionAttachmentController.delete()` `@Operation(description)` | `"MANAGER/MASTER 권한"` stale — `@PreAuthorize` 제거 후 `@RequirePermission(inventory.stock-balance, DELETE)` 단일 가드 전환됐으나 OpenAPI description 미갱신. Swagger UI 오해 유발 | 사이클 2 Claude fix — description 을 `@RequirePermission` 기준으로 현행화 |
| 3 | BE Nit-C1 | Nit | `AuthFlywayV47SeedIT.productsSyncMaterializedIntoAccountPagePermissions` `actualAccountIds` 쿼리 | MANAGER 그룹 외 다른 그룹에 `products.sync` seed 추가 시 actualIds 가 넓어질 수 있음 (현재 seed 범위 false-positive 0). 방어적 `ag.group_id = MANAGER_GROUP_ID` 조건 권장 | 사이클 2 Claude fix — IT 쿼리에 방어 조건 추가 |
| 4 | BE Nit-C2 | Nit | accounting/user-service EcountMig IT `missingUserIdRoleOnly` 케이스 | 403 출처(Spring Security Http403ForbiddenEntryPoint)가 주석 부재 — 유사 케이스(`missingUserId` 등)에는 설명 있으나 role-only 케이스는 없음 | 사이클 2 Claude fix — 출처 주석 1줄 추가 |
| 5 | BE Nit-C3 | Nit | `DailyClosingController` / `MonthEndCloseController` / `TaxInvoiceController` SP-D2 동적 권한 헬퍼 | `ROLE_HEADER`(X-User-Role) / `checkEditPermission` / `checkViewPermission` 가 C5-4 이후 always-null 경로 → no-op dead code. future-reader 혼선 + X-User-Role 복원 시 의도치 않은 override 활성화 위험 | 사이클 2 Claude fix — "C5 이후 gateway 미전송 — 항상 null, no-op" 주석 추가 또는 dead code 제거 |
| 6 | FE Nit-N1 | Nit | `AppLayout.tsx` L253 `_showPartnersEditRequest` 주석 | comment `"라우트 가드 전용"` 부정확 — routes 에 `partners.edit-request` PermissionGuard 부재. 실제는 미사용/향후 예약 변수 | 사이클 2 Claude fix — 주석을 "현재 미사용(향후 페이지 내부 가드 예약)" 으로 교정 |

**전건(#1~#6) 사이클 2 Claude fix 처리 권고** — 통합 PR 패턴 fix 즉시 처리 의무, 후속 PR 위임 금지.

---

### 2. 사이클 1 지적 해소 현황

| 사이클 1 지적 | 출처 | 사이클 2 검증 결과 |
|---|---|---|
| DEF-1 (P0) — V47 account 단 materialize 누락 | QA | **해소** — V47 동기 INSERT 적용. QA 사이클 2 실측: dev_manager → GET /products/admin/sync/last **200** (SP-1), dev_sales 403 (SP-2). exact-set IT 로 false-green 차단 |
| C-1 / FE-1 (P1) — edit-requests `accounting.edit-requests.decide:VIEW` 수렴 | FE | **완전 해소** — 라우트/사이드바/mock/BE `@RequirePermission` 4단 정합. QA 실측 C1-1~C1-3 PASS |
| C-2 / FE-2 (P1) — tax-invoices `accounting.tax-invoice.list:VIEW` 정렬 | FE | **완전 해소** — 구 4-code OR 제거, batch/inbound 독립 가드 보존. QA 실측 C2-1~C2-3 PASS |
| C-3 — AuthFlywayV47SeedIT exact-set 승격 | BE | **해소** — V47 SQL 과 차집합 SQL 정합, 시스템 마스터 제외 조건 양방향 일치, `isNotEmpty()` false-green 방지. DevOps: CI Testcontainers 안정(V5→V44→V47 순서 보장) |
| C-4 / FE-3 / D-CX-002 (P2) — 직접 링크 show 조건 1:1 축소 4건 | FE+Designer | **완전 해소** — partners/blocked-partners/regions/stock-balance 전건 라우트 가드와 동일 page-code 단일 수렴. `showPartnersGroup` 제거 |
| C-5 / FE-4 (P2) — full-menu-contract SLIP_CLEANUP_ROLES stale 어서션 | FE | **완전 해소** — PermissionGuard 어서션 3건 현행 소스 정합 |
| C-6 / D-CX-001 / D-005 (P2) — 마감 페이지 role 문구 → 권한 문구 | Designer+FE | **3/4 해소** — SalesClosingPage/MonthEndClosingPage/PeriodCloseListPage 완료. **DailyClosingPage 범위 누락 신규 적발 → 본 표 #1 (D2-FE-001/D2-001)** |
| C-7 — EcountMig 신규 케이스 2종 계약 | BE | **해소** — 필터 `hasPartialIdentity` 구현과 IT 기대값(401/403) 전 케이스 일치. role-only 403 = Spring Security entry point 확인 |
| C-8 — 신규 mock 런타임 Playwright spec | FE+DevOps | **해소** — `page.goto()` full reload 로 MOCK_AUTH/QueryClient 재초기화 보장, testId 무조건부 렌더, flaky 위험 없음. 423 passed 실증 |
| D-001 (P1 계열) — 매출 마감 사이드바 과다 노출 | Designer | **완전 해소** — `showAccountingPeriodClose` 단일 소스, 2곳(판매/회계 그룹) 교체 |
| D-002 (P1 계열) — arologis 사이드바/라우트 이원화 | Designer | **완전 해소** — 7개 메뉴 전건 dynamicCanAccess 전환, 라우트 가드와 1:1 |
| D-003 (P2) — `showAdmin` dead 블록 | Designer | **완전 해소** — 빈 렌더 블록 제거, 잔류 사용처는 단톡방 매핑 내부 분기뿐 |
| P1-1 — full-menu-contract blocked-partners/aligo 어서션 | FE | **완전 해소** — PermissionGuard 어서션 포함 확인 |
| P1-2 — showDispatchSms dynamicCanAccess 복원 | FE | **완전 해소** — `dispatch.batch` / `notification.dispatch-sms.send-audit` 각 1:1 |
| DO-1 — V47 checksum mismatch 운영 노트 | DevOps | **해소** — dev-report §5.6 에 V48 분리 불채택 사유 + 로컬 DB 절차 2경로(재생성/repair) 박제 |

**사이클 1 지적 전원 해소.** 유일한 잔여 = C-6 fix 범위에서 DailyClosingPage 가 누락된 신규 적발 1건(#1).

**QA 실 QA 14/14 PASS** (C-1/C-2/마감/products.sync/JWT 시나리오 전건, 임시 데이터 원복 완료, JWT role 클레임 제거 계약 유지) + **DevOps APPROVE** (git diff --check 0건, 와이어 포맷 변경 0건, CI 안정성 확인) 명시.

---

### 3. 각 agent 종합 판정

| Agent | 산출물 | 판정 | 결함 요약 | TM 조정 |
|---|---|---|---|---|
| BE | claude-be-cycle-2.md | 조건부 APPROVE | P3 1건(BE-C2-1) + Nit 3건(C1/C2/C3). `@RequirePermission` 게이트 불변 확인, 보안 회귀 0, UUID 비공개 위반 0 | Nit-C1/C2 "선택 처리" 분류 → **사이클 2 Claude fix 일괄 처리로 격상** (Codex re-review 전 잔여 소거) |
| FE | claude-fe-cycle-2.md | CHANGES REQUESTED | P2 1건(D2-FE-001) + Nit 1건(N1). 사이드바 66개 링크 전수 대조 위반 0 | D2-FE-001 → Designer D2-001 과 **동일 결함 1행 병합** (#1) |
| Designer | claude-designer-cycle-2.md | CHANGES REQUESTED | P2 1건(D2-001). UUID 비공개 위반 0, DS 무영향, 사이드바 가시성 역전 0 | FE D2-FE-001 과 병합 (#1). action 코드는 FE 안(`daily-closing.run:create` / `daily-closing.unlock:update`) 채택 — BE `@RequirePermission` 실값과 일치 (Designer 안의 `daily-closing.reverse` 는 BE 에 부재) |
| QA | claude-qa-cycle-2.md | APPROVE 권고 | 결함 0 — 실 QA 14/14 PASS, 사이클 1 fix 회귀 0, BE-FE-seed 3단 계약 일치 | 조정 없음. 단 #1 fix 는 FE 전용 변경이라 BE 재검증 불요, Playwright 재실행으로 충분 |
| DevOps | claude-devops-cycle-2.md | APPROVE | 결함 0 — DO-1 해소, CI Testcontainers 안정, flaky 위험 없음, 와이어 변경 0 | 조정 없음 |

---

### 4. TM 결정

**판정: 사이클 2 Claude fix 1라운드 진입 (현 상태 APPROVE 불가)**

1. **fix 대상 6건** (표 #1~#6) — 전건 사이클 2 Claude fix 로 일괄 처리. P2 1건(#1 DailyClosingPage) 최우선, P3 1건(#2) + Nit 4건(#3~#6) 동일 라운드 소거.
2. **#1 fix 검증 의무** — DailyClosingPage 전환 후 mock 매트릭스(SP_D1 grant) 정합 재확인 + Playwright 관련 spec 재실행. `accounting.ts` 의 `canExecuteDailyClosing`/`canReverseDailyClosing` 는 전환 후 사용처 0 이면 제거.
3. **fix 완료 후 Codex 5-agent re-review 진행** (사이클 2 잔여 절차, [[feedback_dual_5agent_review]] — 사이클 N=3 안 완료 의무).
4. 횡단 점검 이상 없음 — UUID 사용자 비공개 위반 0 / 디자인 시스템 영향 0 / `@RequirePermission` 인가 시맨틱 변경 0 / 와이어 포맷 변경 0 / CI matrix 커버 정상.

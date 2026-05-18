# TM Cross-Check Report — SP-D4 잔여 7 도메인 PermissionGuard 이중 가드 마이그레이션

> 작성일: 2026-05-18
> TM: Claude (Opus 4.7, 1M context)
> 베이스: `feat/sp-d4-remaining-pages-permission-migration` (main + 5-team 산출물 52 file 통합)
> 마스터 plan: `docs/planning/2026-05-18_sp-d4-remaining-pages-permission-migration.md`

## 1. UUID 정합성: PASS

- 본 슬라이스 변경 범위는 `auth-service` 의 `role_page_permissions` 테이블에 한정. cross-service join 부재.
- SP-D2/D3 와 동일 — `(role_code, page_code)` 기반 권한 매트릭스에 cross-service UUID 참조 없음.
- partner / product / slip 등 다른 도메인 UUID 와의 join 영향 없음. namespace `samhan-seed:*` 위배 없음.

## 2. API contract: PASS

| 항목 | 결과 | 비고 |
|---|---|---|
| BE controller `@RequestHeader("X-User-Role")` 추가 | 13 controller 적용 | required=false, null/blank skip 일관 |
| FE `apiClient` 인터셉터 `X-User-Role` 헤더 주입 | **미주입 (gateway 위임)** | `client.ts:43-81` — JWT + X-Partner-Code 만 주입 |
| Gateway JWT → `X-User-Role` 전파 | `JwtAuthenticationGatewayFilterFactory.java:44/62` 자동 mutate | downstream 8 서비스 자동 수신 |
| `/auth/admin/permissions/check` endpoint 정합 | SP-D1 endpoint 보존 — FE `dynamicCanAccess` 호출 일관 | mock.ts 154 row matrix |
| ApiResponse<T> wrapper | 영향 범위 — 신규 controller 없음 | 기존 응답 envelope 보존 |

SP-D2/D3 와 동일 패턴 (gateway 가 JWT 클레임에서 role 추출 → 헤더 주입 → BE PermissionGuard 가 헤더 검증). FE 직접 헤더 전송 불필요.

## 3. 디자인 일관성: PASS

- `PermissionMatrixPage.tsx` 13 카테고리 그룹 (SP-D1~D3 6 + SP-D4 7) thead 3행 구조 OK
- 사용 토큰 검증 (`clients/web/design-system/src/tokens/tokens.css`):
  - `--color-brand-50` (#EFF6FB) ✅
  - `--color-brand-200` (#AECFE7) ✅
  - `--color-brand-500` (#2D77A8) ✅
  - `--color-brand-600` (#235F88) ✅
  - `--color-brand-700` (#1B4A6B) ✅
- design-system 컴포넌트 (`Button` / `Badge` / `Spinner`) import 사용 OK. 신규 컴포넌트 작성 없음 — data-driven UX.
- Pretendard 9 weight + 한국어 라벨 일관.

## 4. 도메인 정합 (Layer 4 의미 정렬): PASS

7 신규 PermissionGuard 클래스 의미 비교:

| Guard 클래스 | PAGE_CODE | checkView 정책 | checkEdit 정책 | SP-D3 SlipController 패턴 |
|---|---|---|---|---|
| `EstimatePermissionGuard` | `estimates.list` | canView=false → FORBIDDEN | canEdit=false + canView=true → FORBIDDEN, false+false → fallback 통과 | 일치 |
| `PartnerOrderPermissionGuard` | 6 PAGE 상수 (LIST/DRAFT/CONFIRM/HISTORY/PRINT/VENDOR) | 동일 | 동일 | 일치 |
| `InventoryPermissionGuard` | 5 PAGE 상수 (WAREHOUSE/STOCK/STOCK_TRANSFER/DPS/AUDIT) | 동일 | 동일 | 일치 |
| `EmployeePermissionGuard` | 2 PAGE 상수 (EMPLOYEES/USERS) | 동일 | 동일 | 일치 |
| `PartnerPermissionGuard` | 4 PAGE 상수 (LIST/DETAIL/BLOCK/EDIT_REQUEST) | 동일 | 동일 | 일치 |
| `ProductPermissionGuard` | 2 PAGE 상수 (LIST/ADMIN) | 동일 | 동일 | 일치 |
| `ArologisAdminPermissionGuard` | 2 PAGE 상수 (ADMIN/REGION) | 동일 | 동일 | 일치 |

**의미 정렬 가드 chain 일관**:
1. actorRole null/blank → skip (점진 마이그레이션 안전성)
2. canView=false → BusinessException(FORBIDDEN) 명시적 deny
3. canEdit=false + canView=true → FORBIDDEN (view-only override)
4. canEdit=false + canView=false → fallback 통과 (override row 없음 — @PreAuthorize 가 이미 검증)

> 참고: SP-D2 `ReportPermissionGuard` 만 단순 로그 정책 (canView=false 도 통과). 이는 SP-D2 마이그레이션 초기 정책으로, SP-D3/D4 는 명시적 deny 강화 패턴. **정책 차이는 의도된 evolution** — 새 guard 모두 SP-D3 패턴 일치.

`@PreAuthorize` 보존 확인 — RoleGuard 제거 없음. 회귀 안전.

## 5. Flyway 의존성: PASS

| 검증 항목 | 결과 |
|---|---|
| V7 `role_page_permissions` 테이블 + partial unique index `(role_code, page_code) WHERE is_deleted = FALSE` | V7 정의 |
| V8 page_code 12 (회계 7 + SP-D1 보강) | V10 page_code 와 0 중복 |
| V9 page_code (SP-D3 slip/dispatch fix) | V10 page_code 와 0 중복 |
| V10 신규 page_code 22 | 모두 신규 — V7/V8/V9 와 disjoint |
| V10 ON CONFLICT clause | `(role_code, page_code) WHERE is_deleted = FALSE DO NOTHING` — partial unique index 와 정확 매칭, 멱등 |
| V10 154 row × BaseEntity 7 audit | created_at/by + modified_at/by + is_deleted FALSE 명시 |
| V10 → V7/V8/V9 row UPDATE | 0건 (INSERT only) — SP-D1/D2/D3 row 영향 없음 |

**V8 / V9 의 단순 `ON CONFLICT DO NOTHING`** (partial index inference 없음) — 기존 머지된 패턴이므로 SP-D4 와 무관. PostgreSQL 13+ 에서 partial unique index 가 conflict_target 으로 인식되어 정상 작동 검증된 패턴.

## 6. QA 발견 사항 처리: PARTIAL FIX 권장 (cycle 2 비차단 이연)

QA 보고된 3 라우트 재검증:

| 라우트 | PageCode | 검증 결과 | 결정 |
|---|---|---|---|
| `/admin/blocked-partners` | `partners.block` | **PermissionGuard 미적용** — `RoleGuard allow={BLOCKED_PARTNER_ROLES}` 만 (routes/index.tsx:1251-1257) | cycle 2 fix 권장 — 단, RoleGuard 차단으로 동작상 회귀 0건 |
| `/sales/partner-orders` | `sales.partner-order.list` | **PermissionGuard 적용 확인** — routes/index.tsx:444 | PASS — QA 보고 오인 |
| `/admin/permission-matrix` | `admin.users` | **PermissionGuard 적용 확인** — routes/index.tsx:1306 (RoleGuard + PermissionGuard 이중 가드) | PASS — QA 보고 오인 |

**최종 결정**:
- 실제 미적용 = 1건 (`/admin/blocked-partners` → `partners.block`)
- 운영 영향 = 0건 (RoleGuard 가 이미 차단). 동적 grant 시 사이드바 hidden 정합만 누락 위험.
- **cycle 2 통합 fix 대상 권장** — `<PermissionGuard pageCode="partners.block" action="view">` wrapping 추가 1줄 변경.
- 차단성 결함 X — PR 발행 가능.

## 7. SP-D2/D3 회귀: PASS

- V10 = INSERT only — V8 (SP-D2 회계 7개 추가) / V9 (SP-D3 slip/dispatch fix) row 변경 0건
- PageCode enum: SP-D1/D2/D3 의 19개 enum 상수 보존, +22 신규 = 총 41개
- mock.ts SP_D1_PAGES 배열 — SP-D1 12 + SP-D2 7 + SP-D4 22 합산 41개, SP-D3 V9 fix (SALES dispatch.board 제거 / WAREHOUSE purchases.receipt-ocr 추가) 보존
- 신규 8 service 별 DynamicPermissionClient 이식 — 기존 accounting/notification/slip 변경 없음

## 8. 컴파일 검증: PASS

```
:auth-service:assemble :slip-service:assemble :partner-order-service:assemble
:inventory-service:assemble :user-service:assemble :partner-service:assemble
:product-service:assemble :arologis-service:assemble
→ BUILD SUCCESSFUL in 17s (51 actionable / 51 up-to-date)
```

```
:auth-service:testClasses :slip-service:testClasses ... :arologis-service:testClasses
→ BUILD SUCCESSFUL in 16s (31 actionable / 31 up-to-date)
```

```
clients/desktop: npm run typecheck (tsconfig.node + tsconfig.web)
→ exit 0
```

| 검증 | 결과 |
|---|---|
| BE 8 서비스 assemble | PASS (51 task) |
| BE 8 서비스 testClasses | PASS (31 task) — 신규 IT 7개 모두 컴파일 |
| FE typecheck | PASS (exit 0) |
| Playwright spec | 14 case + 14 screenshot — QA 보고 |

## 결론: APPROVE — PR 발행 가능

| Check | 결과 |
|---|---|
| 1. UUID 정합성 | PASS |
| 2. API contract | PASS (gateway 자동 헤더 전파) |
| 3. 디자인 일관성 | PASS |
| 4. 도메인 정합 (7 guard 의미 정렬) | PASS |
| 5. Flyway 의존성 (V10 ↔ V7~V9) | PASS |
| 6. QA 발견 사항 | PARTIAL — 1건 cycle 2 fix 권장 (`partners.block` PermissionGuard 추가), 운영 차단 X |
| 7. SP-D2/D3 회귀 | PASS |
| 8. 컴파일 검증 (BE assemble + testClasses + FE typecheck) | PASS |

**최종 판정**: PR 발행 + 머지 가능. cycle 2 통합 fix 대상 1건만 비차단성 backlog 로 기록.

### 후속 PM 위임 사항
1. 통합 commit 메시지 작성 + push
2. PR 발행 + CI watch
3. cycle 2 fix backlog: `/admin/blocked-partners` 라우트 `<PermissionGuard pageCode="partners.block">` wrapping (1줄 변경, 별도 fix commit)

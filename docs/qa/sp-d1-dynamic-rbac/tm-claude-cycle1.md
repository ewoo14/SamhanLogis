# SP-D1 동적 RBAC — Claude 5-agent TM cycle 1

HEAD: cycle 2 후반 fix 적용 (`e18c89b7` + 후속)
PR: #241

## 결정

**APPROVE** — Claude/Codex 양쪽 5+ critical merge blocker (PageCode 체계 불일치 / `/my` endpoint 미구현 / ApiResponse 파싱 / 사이드바 정적 / testid 불일치 / SQL 오류 / V7 extension 등) 모두 cycle 2 내 해소.

## 양쪽 발견 → cycle 2 fix (11건)

| # | blocker | fix |
|---|---|---|
| 1 | FE-BE PageCode 체계 불일치 (FE 대문자 vs BE dot-separated) | ✅ FE PageCode 타입 → BE 12 dot-separated 코드로 전면 교체. PermissionMatrixPage 상수도 동일. |
| 2 | `/admin/permissions/my` endpoint 미구현 | ✅ `PermissionAdminController.getMyPermissions()` 신규. MASTER hardcode 12 page, 비MASTER override row 반환 |
| 3 | accounting POC ApiResponse 파싱 오류 (root vs data.allowed) | ✅ `DynamicPermissionClientImpl` JsonNode 로 `data.allowed` 정확 추출 |
| 4 | AppLayout 정적 role 기반 — usePermissions 미연동 | ✅ `usePermissions` import + `dynamicCanAccess`. showReceiptOcr/DispatchBoard 동적 전환 |
| 5 | PermissionGuard route 미연결 | ✅ `/accounting/tax-invoices` 1 POC route 에 `PermissionGuard pageCode="accounting.tax-invoice.emit-nts"` 래핑 (점진 마이그레이션) |
| 6 | Playwright testid 불일치 | ✅ `permission-matrix-{save-btn/reset-btn/cell-{role}-{page}/role-{role}/change-count}` 전면 정합 |
| 7 | domain-integrity-check.md SQL 전면 오류 | ✅ `role_page_permissions` + `can_view/can_edit/modified_at/modified_by` 정정 |
| 8 | V7 `gen_random_uuid()` extension 전제 | ✅ `CREATE EXTENSION IF NOT EXISTS "pgcrypto"` 추가 |
| 9 | MASTER 행 정책 불명확 | ✅ `getMyPermissions("MASTER")` hardcode 12 true + `updatePermission/delete MASTER → FORBIDDEN` 차단 |
| 10 | TaxInvoiceEmitService 2회 HTTP 호출 원자성 | ✅ canEdit 단일 호출 통합 + canView fallback |
| 11 | Designer dirty 3px 마커 / sticky / 접근성 / AROLOGIS | ✅ borderLeft 3px + zIndex 30/40 + scope="col/row" + role="alert/status" |

## 검증

- `./gradlew :services:auth-service:test` **BUILD SUCCESSFUL** (24 case PASS)
- `./gradlew :services:accounting-service:compileTestJava` **BUILD SUCCESSFUL**
- `npm run typecheck` (clients/desktop) **PASS**
- PNG 4장 재캡처

## TM 결정

**APPROVE → CI green 도달 시 머지 가능.**

**Claude 5-agent TM — 2026-05-18**

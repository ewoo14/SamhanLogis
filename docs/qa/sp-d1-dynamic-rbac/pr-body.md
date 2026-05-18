## 요약

**사용자 요구 (2026-05-18)**:
1. 정적 `@PreAuthorize` 하드코딩 → **마스터가 페이지별 체크박스로 동적 권한 부여**
2. 권한 없는 페이지는 **회색 비활성화가 아닌 완전 hidden** (보이지 않음)

**전략 — 점진 마이그레이션** (안전 마진):
- 본 PR 범위: 동적 권한 매트릭스 인프라 + 마스터 화면 + 1개 페이지 POC
- 기존 121 `@PreAuthorize` 미변경 (regression 0)
- 후속 SP-D2/D3/D4 에서 점진 마이그레이션

## 변경 파일

### BE (auth-service)
- `db/migration/V7__add_role_page_permissions.sql` — 84 row seed (7 역할 × 12 페이지, SP-03 §4.2 + SP-09 4 vendor)
- `domain/RolePagePermission.java` — BaseEntity + 도메인 메서드 chain (`grantView/revokeView/grantEdit/revokeEdit/updatePermissions`)
- `domain/PageCode.java` enum 12종
- `repository/RolePagePermissionRepository.java`
- `service/DynamicPermissionService.java` — bean `"dynamicPermission"` SpEL 직접 호출 (`@dynamicPermission.canAccess(...)`)
- `web/PermissionAdminController.java` — GET/PUT/POST batch/DELETE/check (MASTER only)
- `web/dto/PermissionDto.java` / `PermissionUpdateRequest.java` / `PermissionBatchUpdateRequest.java`
- `service/dto/PermissionDto.java`
- `config/SecurityConfig.java` — `/auth/admin/permissions/**` authenticated

### BE POC (accounting-service)
- `client/DynamicPermissionClient.java` interface + `DynamicPermissionClientImpl.java` (RestClient + auth-service 장애 시 false fallback)
- `service/TaxInvoiceEmitService.java` — `actorRole` 파라미터 추가 + override row 가 있고 `canEdit=false` 시 403
- `web/TaxInvoiceController.java` — `X-User-Role` 헤더 수신
- IT `TaxInvoiceEmitNtsIT` — `@MockBean DynamicPermissionClient` 추가 (기존 8 case 영향 없음)

### Test
- `DynamicPermissionServiceTest` 19 case
- `PermissionAdminControllerTest` 5 case

### FE (desktop)
- `api/permissionsApi.ts` — `fetchPermissionMatrix / updatePermissionBatch / fetchMyPermissions / canAccess`
- `hooks/usePermissions.ts` — TanStack Query 5분 cache + 동기 헬퍼 캐시
- `components/PermissionGuard.tsx` — 권한 없으면 `Navigate to="/" replace` (404 효과)
- `routes/PermissionMatrixPage.tsx` — 7×12 grid + view/edit 체크박스 + dirty highlight + 저장/초기화
- `components/AppLayout.tsx` — **사이드바 hidden 강화** (`show=false` 시 `return null` 완전 미렌더, 회색 비활성 X)
- `api/mock.ts` — `/admin/permissions` handler
- `routes/index.tsx` — `/admin/permission-matrix` 라우트 (MASTER 전용)

### Designer
- HTML mock 4 + PNG 4 (114~218KB)
- sticky 헤더/열 z-index 계층 + dirty amber `#FFFBEB` 마커
- 저장 버튼 dirty 0 → disabled / 1+ → brand-500 활성
- **사이드바 hidden = `display:none`** (회색 비활성 금지, 보안 UX 원칙)

### QA (Playwright T1~T6)
- T1 매트릭스 진입 + 84+ 체크박스
- T2 SALES OCR 토글 dirty
- T3 저장 + 갱신
- T4 사이드바 hidden 해제 (grant 후 메뉴 표시)
- T5 권한 없는 URL 직접 진입 → 404 효과
- T6 비마스터 403
- false green 0건, data-testid 32회, HashRouter URL 정합

### Docs
- `docs/dev-reports/sp-d1-dynamic-rbac.md` 10 section
- `docs/design/sp-d1-dynamic-rbac/decisions.md`
- `docs/qa/sp-d1-dynamic-rbac/scenarios/01-permission-matrix-crud.md`
- `docs/qa/sp-d1-dynamic-rbac/domain-integrity-check.md`

## QA 스크린샷

### 01. 권한 매트릭스 초기 (7 역할 × 12 페이지)
![01 matrix default](https://github.com/ewoo14/SamhanLogis/raw/feat/sp-d1-dynamic-rbac-system/docs/qa/sp-d1-dynamic-rbac/screenshots/01-permission-matrix-default.png)

### 02. 마스터가 SALES 권한 부여 (체크박스 dirty 강조 + 저장 활성화)
![02 matrix edited](https://github.com/ewoo14/SamhanLogis/raw/feat/sp-d1-dynamic-rbac-system/docs/qa/sp-d1-dynamic-rbac/screenshots/02-permission-matrix-edited.png)

### 03. 사이드바 hidden 효과 비교 (MASTER 전체 vs SALES 3개만)
![03 sidebar hidden](https://github.com/ewoo14/SamhanLogis/raw/feat/sp-d1-dynamic-rbac-system/docs/qa/sp-d1-dynamic-rbac/screenshots/03-sidebar-hidden-comparison.png)

### 04. 권한 없는 URL 직접 진입 → 차단
![04 route blocked](https://github.com/ewoo14/SamhanLogis/raw/feat/sp-d1-dynamic-rbac-system/docs/qa/sp-d1-dynamic-rbac/screenshots/04-route-direct-access-blocked.png)

## 권한 매트릭스 (12 페이지 × 7 역할 = 84 row seed)

페이지 (PageCode enum):
- `accounting.tax-invoice.emit-nts` (NTS 발행 SP-09-1)
- `accounting.tax-invoice.list` (세금계산서 목록)
- `accounting.daily-closing` (일마감)
- `accounting.general-ledger` (원장)
- `accounting.deposit-match` (KFTC 입금 매칭 SP-09-4)
- `notification.dispatch-sms.send-audit` (Aligo SMS 이력 SP-09-2)
- `purchases.receipt-ocr` (Clova OCR SP-09-3)
- `purchases.slip.list` (매입 슬립)
- `sales.slip.list` (매출 슬립)
- `inbound.inspection` (입고 검수)
- `dispatch.board` (배차 보드)
- `admin.permissions` (권한 관리, MASTER only)

## 검증

- [x] `./gradlew :services:auth-service:compileJava :services:auth-service:compileTestJava :services:accounting-service:compileJava :services:accounting-service:compileTestJava` BUILD SUCCESSFUL
- [x] `npm run typecheck` (clients/desktop) PASS
- [x] `bash scripts/check-credential-plaintext.sh` PASS
- [x] BaseEntity 7 audit + Soft Delete (markDeleted)
- [x] 도메인 메서드 chain
- [x] UUID 비공개 (roleCode/pageCode 비즈니스 식별자만)
- [x] 한국어 Javadoc / 에러 메시지
- [x] Spring AOP proxy 경유 REQUIRES_NEW 패턴
- [x] @MockBean 외부 client 격리 (DynamicPermissionClient)
- [x] false green 가드 0건
- [x] 기존 121 @PreAuthorize 미변경 (regression 0)

## 후속 슬라이스 (점진 마이그레이션)

- **SP-D2**: 회계 화면 12 페이지 `@PreAuthorize` → 동적 RBAC 점진 적용
- **SP-D3**: 매입/매출/배차 화면 마이그레이션
- **SP-D4**: 페이지 코드 enum 100+ 페이지 확장 + 전체 121 `@PreAuthorize` 동적 전환

연관 Issue: 사용자 요구 — 마스터 권한 관리 + 메뉴 hidden 시스템

🤖 Generated with [Claude Code](https://claude.com/claude-code)

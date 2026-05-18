# SP-D4 — 잔여 7 도메인 동적 RBAC PermissionGuard 이중 가드 마이그레이션

> 작성일: 2026-05-18
> 작성자: PM (Claude)
> 베이스: `main` (`2c182af0` — SP-D3 #243 머지 직후)

## §1 슬라이스 목표

SP-D1~D3 (회계/슬립/배차/SMS) 완료 후, **잔여 핵심 사용자 노출 도메인 7개** (견적 / 거래처주문 / 재고 / 직원 / 거래처 / 상품 / 아로지스) controller 에 **PermissionGuard 이중 가드** 추가. RoleGuard `@PreAuthorize` **보존**(회귀 차단). PageCode enum 20 → **약 42개(+22)** 확장 + Flyway **V10** 으로 7 ROLE × 22 PageCode = 154 row seed 추가. mock.ts 와 권한 관리 화면 카테고리 정합. **단일 통합 PR** (5-team 산출물 병합) 머지.

**RoleGuard 완전 제거는 SP-D5 이연** (운영 안정화 후).

## §2 신규 PageCode 카탈로그 (+22)

| code | displayName | 적용 controller (서비스) | MASTER | MANAGER | ACCOUNTANT | SALES | WAREHOUSE | DISPATCH | INVENTORY |
|---|---|---|---|---|---|---|---|---|---|
| `estimates.list` | 견적 목록 | slip-service `EstimateController` | V/E | V/E | V | V/E | - | - | - |
| `sales.partner-order.list` | 거래처주문 목록 | partner-order `PartnerOrderListController` | V/E | V/E | V | V/E | - | - | - |
| `sales.partner-order.draft` | 거래처주문 작성 | `Draft/Edit/Delete/FromEstimate` | V/E | V/E | - | V/E | - | - | - |
| `sales.partner-order.confirm` | 주문 확정 | `Confirm/EditRequest` | V/E | V/E | - | V/E | - | - | - |
| `sales.partner-order.history` | 주문 이력 | `History/AuditLog` | V/E | V | V | V | - | - | - |
| `sales.partner-order.print` | 주문서 인쇄 | `Print` | V/E | V | - | V/E | V | - | - |
| `sales.vendor-order` | 벤더(외주) 주문 | `VendorOrderController` | V/E | V/E | - | V/E | V | - | - |
| `inventory.warehouse` | 창고 관리 | inventory `WarehouseController` | V/E | V/E | - | - | V/E | - | V/E |
| `inventory.stock` | 재고 현황 | `StockController/SafetyStock` | V/E | V | V | V | V/E | V | V/E |
| `inventory.stock-transfer` | 재고 이동 | `StockTransferController` | V/E | V/E | - | - | V/E | - | V/E |
| `inventory.dps` | DPS 비교/이력 | `DpsCompare/DpsSaveHistory` | V/E | V | - | - | V/E | - | V/E |
| `inventory.audit` | 재고 감사 | `InventoryAuditController` | V/E | V | V | - | V | - | V |
| `admin.employees` | 직원 관리 | user `EmployeeController` | V/E | V/E | - | - | - | - | - |
| `admin.users` | 계정 관리 | `AdminUserController` | V/E | - | - | - | - | - | - |
| `partners.list` | 거래처 목록 | partner `PartnerAdminController` | V/E | V/E | V | V/E | - | - | - |
| `partners.detail` | 거래처 4탭 상세 | `Partner4TabController` | V/E | V/E | V | V/E | - | - | - |
| `partners.block` | 거래처 차단 | `PartnerBlockAdminController` | V/E | V/E | - | - | - | - | - |
| `partners.edit-request` | 거래처 편집 결재 | `PartnerEditRequestController` (list/confirm) | V/E | V/E | - | V | - | - | - |
| `products.list` | 상품 목록 | product `ProductController` | V/E | V/E | V | V | V | - | V |
| `products.admin` | 상품 관리(편집) | `CategoryController` | V/E | V/E | - | V/E | - | - | V/E |
| `arologis.admin` | 아로지스 배차 관리 | arologis `ArologisAdminController` (22 ep) | V/E | V/E | - | - | - | V/E | - |
| `arologis.region` | 지역/구역 관리 | `RegionAdminController` | V/E | V/E | - | - | - | V/E | - |

(V=canView, E=canEdit, -=both FALSE / 22 PageCode × 7 ROLE = 154 seed row)

## §3 5-team 작업 분할

| Team | 산출물 |
|---|---|
| **BE** | (a) `PageCode.java` enum 22 상수 + 한국어 Javadoc. (b) 도메인별 **PermissionGuard shared 클래스** 신규 (SP-D2 `ReportPermissionGuard` 패턴 일관) — `EstimatePermissionGuard` / `PartnerOrderPermissionGuard` / `InventoryPermissionGuard` / `EmployeePermissionGuard` / `PartnerPermissionGuard` / `ProductPermissionGuard` / `ArologisAdminPermissionGuard`. (c) 위 표 controller 메서드에 `@RequestHeader("X-User-Role") String roleHeader` + `permissionGuard.checkView(roleHeader)` / `checkEdit(roleHeader)` 호출 추가, **RoleGuard @PreAuthorize 보존**. (d) `V10__sp_d4_remaining_domains_page_permissions.sql` 154 row seed (BaseEntity 7 audit + is_deleted=FALSE). (e) 도메인별 IT 신규 — `EstimatePermissionIT`, `PartnerOrderListPermissionIT`, `WarehousePermissionIT`, `EmployeePermissionIT`, `PartnerAdminPermissionIT`, `ProductPermissionIT`, `ArologisAdminPermissionIT` (각 deny 1 + allow 1 + lenient stub). |
| **FE** | (a) `clients/desktop/src/renderer/api/mock.ts` 22 PageCode 역할 매트릭스 mock (V/E 매트릭스). (b) `RoleBasedAppLayout` 사이드바 + `PermissionRoute` 라우트 가드 22 코드 매핑. (c) hidden 정합 회귀 (SALES → admin.* / inventory.* hidden, WAREHOUSE → admin.* / partners.* hidden 등). |
| **Designer** | (a) 권한 관리 화면 (`admin/PermissionsPage.tsx`) 22 신규 row 카테고리 그룹핑 (견적 / 주문 / 재고 / 직원 / 거래처 / 상품 / 아로지스 7 그룹). 토글 UX 동일. (b) DesignSystem 컴포넌트 변경 없음 — 데이터 driven. |
| **QA** | (a) Playwright `e2e/sp-d4-rbac.spec.ts` — 7 역할 × 22 PageCode boundary 14 case (각 역할 1 deny + 1 allow). (b) SP-D2 P04 트랩 회귀: 신규 IT 모두 `@MockBean DynamicPermissionClient` + `@BeforeEach lenient stub` 패턴. (c) 사이드바 스크린샷 7 역할 비교. |
| **DevOps** | (a) Flyway V10 dry-run + 롤백 SQL 첨부. (b) auth-service 배포 후 7개 도메인 서비스 순차 롤링 순서 문서화. (c) Grafana `permission_guard_denied_total{code=~"estimates.*|sales.partner-order.*|inventory.*|admin.*|partners.*|products.*|arologis.*"}` 알람 임계 임시 완화 가이드. |

## §4 회귀 가드 + 테스트 전략

- **IT 신규** 7 controller × 평균 3 case = **21+ IT**. 필수 패턴:
  ```java
  @MockBean DynamicPermissionClient client;
  @BeforeEach void stub() {
      Mockito.lenient().when(client.canView(anyString(), anyString())).thenReturn(true);
      Mockito.lenient().when(client.canEdit(anyString(), anyString())).thenReturn(true);
  }
  ```
  SP-D2 P04 NPE 트랩 재발 방지. **X-User-Role 헤더 명시** (SP-D3 cycle 3 회고 — `@WithMockUser` 만으로는 부족).
- **Playwright** `sp-d4-rbac.spec.ts` 14 case — 7 역할 (MASTER/SALES/WAREHOUSE/DISPATCH/INVENTORY/ACCOUNTANT/MANAGER) 각 1 deny + 1 allow.
- **RoleGuard 보존**: PermissionGuard `false` 라도 RoleGuard 통과면 점진 grant 분기. 잘못된 grant 도 회귀 안전.
- **Frontend mock 정합 테스트** — `mock.ts` ↔ V10 seed 22 PageCode 매트릭스 diff `PermissionSeedConsistencyTest` 신규.

## §5 Flyway V10 구조

파일: `services/auth-service/src/main/resources/db/migration/V10__sp_d4_remaining_domains_page_permissions.sql`

```sql
-- SP-D4 잔여 7 도메인 22 PageCode × 7 ROLE = 154 seed row
INSERT INTO role_page_permissions
  (role_code, page_code, can_view, can_edit,
   created_at, created_by, modified_at, modified_by, is_deleted)
VALUES
  ('MASTER', 'estimates.list', TRUE, TRUE, NOW(), 'system', NOW(), 'system', FALSE),
  ('MANAGER', 'estimates.list', TRUE, TRUE, NOW(), 'system', NOW(), 'system', FALSE),
  -- ... 152 more rows
  ('DISPATCH', 'arologis.region', TRUE, TRUE, NOW(), 'system', NOW(), 'system', FALSE)
ON CONFLICT (role_code, page_code) WHERE is_deleted = FALSE DO NOTHING;
```

추정 seed row: **154** (22 × 7). BaseEntity 7 audit + `is_deleted=FALSE` 명시.

## §6 명시 비범위 + SP-D5 이연

- **SP-D5 이연**: RoleGuard `@PreAuthorize` 제거(단일 가드화), AOP/Aspect 통합, 권한 캐시 invalidation event-driven, audit log retention.
- **이번 슬라이스 제외**: `*InternalController` (서비스간 호출), `*AuditLogController` 의 batch endpoint, `ArologisDriverAppController` (드라이버 앱 별도 슬라이스), `ArologisAuthController` (인증 자체), `TutorialStateController` (사용자 노출 X), `*EditRequestController` 의 결재 workflow 자체(list/confirm 만 포함).
- **재진입 금지**: SP-D2/D3 완료 도메인.

## §7 위험 + 완화

| 위험 | 완화 |
|---|---|
| 신규 grant 누락으로 사용자 200 → 403 회귀 | RoleGuard 보존 → PermissionGuard deny 시에도 RoleGuard 통과면 점진 grant 분기. seed 기본값 통상 V/E TRUE, 운영 grant 강화는 점진. |
| 154 seed row 매트릭스 오류 | `PermissionSeedConsistencyTest` 로 mock.ts ↔ V10 cross-check. |
| 아로지스 22 endpoint annotation 누락 | controller class 레벨 `@RequiredArgsConstructor` + helper injection 1회, method 별 호출 검증 100% IT 커버. |
| SP-D2 P04 IT NPE 트랩 재발 | 신규 IT 모두 `@MockBean + lenient stub + X-User-Role 헤더` 3종 의무. SP-D3 cycle 3 회고 반영. |
| 단일 PR 거대화 | 5-team agent 사전 분할 → 통합 PR, 7개 서비스 변경이지만 패턴 동일하여 review 부담 최소. |

## §8 즉시 실행 5-team 디스패치 안내

```
BE     → PageCode +22 / 7 도메인 PermissionGuard shared 클래스 / 23+ controller 메서드 helper 호출 / V10 SQL / IT 21+
FE     → mock.ts +22 PageCode role matrix / PermissionRoute 매핑 / sidebar hidden
Designer → PermissionsPage 카테고리 그룹 7 신규 / DesignSystem 변경 없음
QA     → Playwright sp-d4-rbac.spec.ts 14 case / IT lint rule / 스크린샷 7 역할
DevOps → V10 dry-run / 롤백 SQL / 7 서비스 롤링 / Grafana 알람 완화
```

통합 PR title: `[FEAT] SP-D4 잔여 7 도메인 PermissionGuard 이중 가드 마이그레이션`

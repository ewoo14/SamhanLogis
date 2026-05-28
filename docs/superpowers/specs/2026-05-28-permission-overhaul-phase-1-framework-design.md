# Phase 1 권한 프레임워크 — 상세 설계 (Permission Overhaul)

> 2026-05-28 brainstorming 산출. 본 spec 은 [토대 설계 2026-05-27](./2026-05-27-permission-overhaul-foundation-design.md) 와 [Phase 0 인벤토리 마스터](../../permission-overhaul/menu-inventory.md) 를 입력으로 단일 PR 목표의 프레임워크 구현 spec 을 정의한다.
>
> 다음 단계: 본 spec 을 입력으로 `writing-plans` 스킬로 구현 plan 작성 → Codex 구현 → dual 5-agent 리뷰 → CI green → PM 머지.

---

## 1. 컨텍스트

- 입력: 토대 설계(분해/방향) + Phase 0 인벤토리(173 PageCode × 7 action 현황, 크로스컷팅 발견).
- 목표: 단일 통합 PR 로 (a) 데이터 모델 전환 + (b) `@RequirePermission` 7-action 확장 + (c) ~380 endpoint 재주석화 + (d) `DynamicPermissionClient` 7-action 확장 + (e) MASTER 매트릭스 UI + (f) 행동보존 마이그레이션.
- 비포함 (Phase 2 도메인별 spec): RESTORE / PDF / PNG / PRINT capability 의 **신규 구현** (Phase 1 권한 bit 만 정의, 게이팅 대상 endpoint 는 미존재).

## 2. brainstorming 확정 결정 (2026-05-28)

| ID | 결정 | 근거 |
|---|---|---|
| D-PO-01 | role 컬럼 **비강제 템플릿** 유지 (MANAGER/ACCOUNTANT/SALES/...). enforcement = 100% account-level. role 은 (i) 로그인/감사 식별 + (ii) MASTER UI 의 "템플릿 적용" 소스. | cold-start 1,200 셀 수동 설정 회피 + 사용자 요구 "role 기반 그룹화 폐기" 의 본질(=enforcement 그룹화 폐기) 충족. |
| D-PO-02 | DOWNLOAD = **단일 `can_download`** bit. 포맷(Excel/PDF/PNG)은 기능 레이어. | 인벤토리 = PDF/PNG 전 codebase 0, Excel 7 endpoint. 포맷별 권한 미세제어 필요성 미입증. |
| D-PO-03 | 마이그레이션 = **행동보존 자동전개**. 기존 `role_page_permissions` → 7-action templates → 각 계정 `account_page_permissions` materialize. 회귀 0. | SP-D6/D7 의 narrowing/widening 회피 원칙 + 운영 lockout 회피. |
| D-PO-04 | MASTER 매트릭스 UI = **평탄 매트릭스 + 도메인 섹션 헤더** (단일 계정 view, 173 행 세로 스크롤). | 한눈에 보이는 일관성 + 행/열 일괄 토글의 단순성. |
| D-PO-05 | MASTER bypass = **PermissionAspect short-circuit**. grant row 0 (1,200 × MASTER 계정 수 절약). | 단순성 + 운영 신뢰성. role=MASTER 식별은 토큰 claims 우선. |
| D-PO-06 | RESTORE 메커니즘 결정 = **Phase 2 도메인별 spec**. Phase 1 은 `can_restore` bit 정의 + 기존 2 endpoint (warehouse, slip audit-revert) 가드. | 인벤토리 = restore 거의 비어 있어 메커니즘은 신규 구현 규모 자체. Phase 1 부담 분리. |
| D-PO-07 | PARTNER 경계 가드 = PermissionAspect 가 internal page 접근 자동 deny. PARTNER 자기-서비스는 partner-auth-service 전용 endpoint. | 외부 role 의 의미 보존 (SP-D7 PARTNER widening 회고 [[no-backlog-strict]]). |

## 3. 데이터 모델 (auth-service, Flyway V39)

### 3-1. 신규 테이블

```sql
-- 비강제 템플릿 (MASTER UI 의 "템플릿 적용" 소스, enforcement X)
CREATE TABLE role_page_permission_templates (
    role_code      VARCHAR(32) NOT NULL,
    page_code      VARCHAR(64) NOT NULL,
    can_view       BOOLEAN NOT NULL DEFAULT FALSE,
    can_create     BOOLEAN NOT NULL DEFAULT FALSE,
    can_update     BOOLEAN NOT NULL DEFAULT FALSE,
    can_delete     BOOLEAN NOT NULL DEFAULT FALSE,
    can_restore    BOOLEAN NOT NULL DEFAULT FALSE,
    can_download   BOOLEAN NOT NULL DEFAULT FALSE,
    can_print      BOOLEAN NOT NULL DEFAULT FALSE,
    -- BaseEntity 7 audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by UUID,
    deleted_at TIMESTAMPTZ,
    deleted_by UUID,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (role_code, page_code)
);

-- 유일 enforcement 소스 (비-MASTER, 비-PARTNER)
CREATE TABLE account_page_permissions (
    account_id     UUID NOT NULL,
    page_code      VARCHAR(64) NOT NULL,
    can_view       BOOLEAN NOT NULL DEFAULT FALSE,
    can_create     BOOLEAN NOT NULL DEFAULT FALSE,
    can_update     BOOLEAN NOT NULL DEFAULT FALSE,
    can_delete     BOOLEAN NOT NULL DEFAULT FALSE,
    can_restore    BOOLEAN NOT NULL DEFAULT FALSE,
    can_download   BOOLEAN NOT NULL DEFAULT FALSE,
    can_print      BOOLEAN NOT NULL DEFAULT FALSE,
    -- BaseEntity 7 audit (생략, templates 와 동일)
    PRIMARY KEY (account_id, page_code)
);
CREATE INDEX ix_app_account ON account_page_permissions(account_id) WHERE is_deleted = FALSE;
```

### 3-2. 기존 테이블 처리

- `role_page_permissions` (현행 enforcement): V39 마이그레이션 종료 직후 deprecated 마커(테이블 코멘트 + V39 노트). **drop 은 Phase 1 다음 PR 로 연기** — V39 cutover 직후 비상 롤백 여유 (1주). drop SQL 은 본 PR 에 동봉 안 함.
- `accounts.role` (VARCHAR): 유지. 의미 변경(=비강제 라벨/감사/템플릿 키). PermissionAspect 는 이 컬럼을 enforcement 에 사용하지 않음 (MASTER/PARTNER 식별 외).

### 3-3. seed 데이터

- 시스템 PageCode 173 의 `role_page_permission_templates` 초기 행: V39 이 기존 `role_page_permissions` 의 view/edit 를 §6 의 분해 규칙으로 변환 INSERT.
- `account_page_permissions` 초기 행: V39 이 비-MASTER, 비-PARTNER 계정 N 명 × 그 role 의 template 행을 INSERT.

## 4. 권한 프레임워크 변경 (shared/security + auth-service)

### 4-1. `PermissionAction` enum (shared/common 또는 shared/security)

```java
public enum PermissionAction {
    VIEW, CREATE, UPDATE, DELETE, RESTORE, DOWNLOAD, PRINT
}
```

### 4-2. `@RequirePermission` annotation

```java
@RequirePermission(page = "accounting.journals", action = PermissionAction.CREATE)
```

- 기존 `action = "VIEW"|"EDIT"` 문자열 호환은 V39 cutover 와 함께 제거.
- meta-annotation 패턴 유지 (`@RequireView`, `@RequireEdit` 가 있었다면 `@RequireCreate` / `@RequireUpdate` / ... 으로 분해; 단순 wrapper 가 아니라 reviewer 확인 필요. 본 spec 에서는 직접 `@RequirePermission(action=...)` 권장).

### 4-3. `PermissionAspect`

```pseudo
@Around("@annotation(rp)")
on RequirePermission rp:
    role = currentRoleFromTokenClaims()       // X-User-Role 헤더는 fallback
    if role == MASTER:                         // D-PO-05
        return joinPoint.proceed()
    if role == PARTNER and rp.page not in PARTNER_ALLOWED_PAGES:
        throw Forbidden                        // D-PO-07
    accountId = currentAccountIdFromTokenClaims()
    granted = dynamicPermissionClient.check(accountId, rp.page, rp.action)
    if not granted:
        throw Forbidden
    return joinPoint.proceed()
```

- `MASTER`/`PARTNER` 식별은 토큰 claims 우선, X-User-Role 헤더는 internal 신뢰 경계 안 fallback.
- `PARTNER_ALLOWED_PAGES` = 정적 whitelist (현재 PARTNER 자기-서비스 endpoint 의 page 집합, partner-auth-service 측 정의).

### 4-4. `DynamicPermissionClient` (shared/security `DefaultDynamicPermissionClient`)

```java
boolean check(UUID accountId, String pageCode, PermissionAction action);
Map<String, EnumSet<PermissionAction>> bulkLoad(UUID accountId);  // MASTER UI / FE 사이드바
```

- auth-service `PermissionLookupController`:
  - `GET /api/v1/permissions/check?accountId&page&action` → boolean
  - `GET /api/v1/permissions/account/{accountId}` → `{pageCode: [actions...]}` (FE 부트, 15s TTL 캐시 패턴 유지)
- 캐시 무효화: MASTER UI 가 grant 변경 시 `POST /api/v1/permissions/invalidate?accountId={id}` 호출 (현행 invalidate 패턴 유지).

## 5. 재주석화 정책 (~380 endpoint, 도메인별 8 commit)

- **HTTP/의미 → action 매핑**:
  - GET 조회/실시간/SSE → `VIEW`
  - POST 생성 → `CREATE`
  - POST 가 단순 trigger (mig import, refresh, 비-CRUD) 인 경우 도메인 의미상 적절한 action (대부분 `CREATE` 또는 도메인별 `UPDATE`)
  - PUT/PATCH → `UPDATE`
  - DELETE (soft-delete) → `DELETE`
  - export endpoint (xlsx/csv) → `DOWNLOAD`
  - 인쇄 view/endpoint → `PRINT`
  - 롤백 (`revert`, warehouse `restore`) → `RESTORE`
- **인벤토리 mis-annotation 동반 정정**: §2-1 의 6 + 3 건은 본 PR 안 별도 정정 commit.
- **dead/orphan PageCode 정리**: enum 의 6 dead 코드는 Phase 1 PR 안 별도 commit 으로 정리 (또는 별도 작은 PR — 영향 없는 단순 제거).
- **guard-gated page 사전 식별** (SP-D7 estimates.list 회고): `EstimatePermissionGuard` / `ProductPermissionGuard` / `PartnerOrderPermissionGuard` 가 `checkView` 하는 page 와 V39 의 새 7-action grant 의 교차 영향 사전 검증. 충돌 시 전용 `.view` 코드 분리 (SP-D7 옵션 A 패턴 재사용) 또는 isAuth 유지.

## 6. 마이그레이션 V39 (행동보존 자동전개, D-PO-03)

### 6-1. 2 → 7 action 분해 규칙

| 원본 bit | 분해 결과 | 비고 |
|---|---|---|
| `can_view = TRUE` | `can_view = TRUE` | 단순 1:1 |
| `can_edit = TRUE` | `can_create = TRUE`, `can_update = TRUE`, `can_delete = TRUE` | mutation 3종 동시 부여 |
| `can_download` | per-endpoint 보존: 현행 export endpoint 가 어떤 bit(view/edit)로 가드되었는지 → 그 bit 를 가진 role 에 `can_download = TRUE`. 본 분해는 재주석화 commit 의 endpoint 분류와 1:1 sync. | 인벤토리 §2-3 의 7 endpoint 만 영향 |
| `can_restore` | per-endpoint 보존: warehouse / slip audit-revert 의 현행 가드 bit 를 가진 role 에 `can_restore = TRUE`. | 인벤토리 §2-2 의 2 endpoint 만 영향 |
| `can_print` | per-endpoint 보존: 현행 print view/endpoint 가드 bit 기준. | 인벤토리 §2-4 의 6 page 그룹만 영향 |

### 6-2. V39 SQL 골격

```sql
-- 1. role_page_permission_templates 생성
INSERT INTO role_page_permission_templates (role_code, page_code, can_view, can_create, can_update, can_delete, can_restore, can_download, can_print, ...)
SELECT
    role_code,
    page_code,
    can_view,
    can_edit AS can_create,
    can_edit AS can_update,
    can_edit AS can_delete,
    FALSE AS can_restore,       -- §6-3 의 per-endpoint UPDATE 가 진짜 TRUE 부여
    FALSE AS can_download,      -- §6-3 의 per-endpoint UPDATE
    FALSE AS can_print,         -- §6-3 의 per-endpoint UPDATE
    ...
FROM role_page_permissions
WHERE is_deleted = FALSE;

-- 2. RESTORE/DOWNLOAD/PRINT per-endpoint 보존 UPDATE
--    (role × page) 쌍은 구현 plan 단계에서 산출: 각 capability 의 현행 endpoint × 현행 가드 bit × 그 bit 를 TRUE 로 가진 role
--    (V10/V31/V32/V35/V36/V38 seed 조회). 결과 매핑 표는 plan 부록으로 첨부 후 V39 SQL 에 인라인.
UPDATE role_page_permission_templates SET can_restore = TRUE
  WHERE (role_code, page_code) IN ( ... warehouse.admin × 가드 role 들 ..., slip.audit-revert × 가드 role 들 ... );
UPDATE role_page_permission_templates SET can_download = TRUE
  WHERE (role_code, page_code) IN ( ... 7 export endpoint × 가드 role 들 ... );
UPDATE role_page_permission_templates SET can_print = TRUE
  WHERE (role_code, page_code) IN ( ... 6 print page × 가드 role 들 ... );

-- 3. account_page_permissions materialize (비-MASTER, 비-PARTNER 계정)
INSERT INTO account_page_permissions (account_id, page_code, can_view, can_create, can_update, can_delete, can_restore, can_download, can_print, ...)
SELECT a.id, t.page_code, t.can_view, t.can_create, t.can_update, t.can_delete, t.can_restore, t.can_download, t.can_print, ...
FROM accounts a
JOIN role_page_permission_templates t ON t.role_code = a.role
WHERE a.is_deleted = FALSE
  AND a.role NOT IN ('MASTER', 'PARTNER');

-- 4. 검증: 마이그레이션 전후 효과 동등성 IT 가 보장 (§8-2)
```

### 6-3. 위험 회피 (SP-D7 V38 회고 [[cycle-n2-mandatory]])

- **PARTNER 미부여**: §6-2 step 3 의 `NOT IN ('PARTNER')` 강제. PARTNER 행 0건 보장 IT.
- **force-UPDATE 금지**: 기존 deliberate FALSE row 를 덮어쓰는 UPDATE 미사용. step 1 은 INSERT, step 2 의 RESTORE/DOWNLOAD/PRINT UPDATE 는 인벤토리 매핑이 명시한 (role × page) 쌍에만 한정.
- **guard-gated page 사전 분리**: §5 의 3 PermissionGuard 영향 page 는 매트릭스 UI 의 정의된 page (전용 코드) 와 정렬. 행동보존 자동전개가 그 page 의 grant 를 확대하지 않음 IT.

## 7. MASTER 매트릭스 UI (clients/desktop, D-PO-04)

### 7-1. 라우트 + 화면

- `/admin/permission-matrix` — 평탄 매트릭스 (단일 계정 view). 기존 `PermissionMatrixPage` 전면 재작성.
- `/admin/permission-matrix/bulk` — 다계정 일괄 wizard (별도 흐름).
- 가드: 두 화면 모두 `system.permission-admin` page × `VIEW`/`UPDATE` (MASTER bypass 로 사실상 MASTER 만 접근).

### 7-2. 평탄 매트릭스 레이아웃

```
[계정 ▾]  [템플릿 적용 ▾]  [전체ON]  [전체OFF]  [다른 계정 복사 ▾]   검색 [____]
─────────────────────────────────────────────────────────────────
페이지 (173)                  VIEW  CRT  UPD  DEL  RST  DL   PRT  | 행전체
[전체 컬럼 토글]              □    □    □    □    □    □    □    |
─── ✨ 회계 (31) ────────────────────────────────────────────────  [전체ON][전체OFF]
  accounting.tax-invoice.list ☑    ☑    ☑    □    □    ☑    ☑    | [전부]
  accounting.deposit-match    ☑    □    □    □    □    □    □    | [전부]
  ... (29개 더)
─── 📦 재고 (17) ────────────────────────────────────────────────  [전체ON][전체OFF]
  ...
... (14 도메인 섹션)
```

- **컬럼 헤더 클릭**: 해당 action 의 전 page 일괄 toggle (확인 모달).
- **행 우측 `[전부]`**: 해당 page 의 7 action 일괄 toggle.
- **도메인 섹션 헤더 우측 `[전체ON]/[전체OFF]`**: 해당 도메인 의 모든 page × 7 action 일괄.
- **`[템플릿 적용 ▾]`**: role 선택 → 해당 role 의 `role_page_permission_templates` 전체를 현 계정에 stamp (미리보기 → 확정).
- **`[다른 계정 복사 ▾]`**: 다른 계정 선택 → 그 계정의 모든 grant 를 현 계정으로 복사 (미리보기 → 확정).
- **검색**: PageCode / displayName 부분일치 필터.
- **변경 추적**: 미저장 변경은 우측 sticky panel "변경 N건" + `[저장]/[취소]`. 저장 = bulk PUT `/api/v1/permissions/account/{id}` + invalidate.

### 7-3. 다계정 일괄 wizard (`/admin/permission-matrix/bulk`)

- 1) 계정 다중 선택 (role / 활성 필터). 2) action 선택: "템플릿 적용" / "단일 page × action 설정". 3) 미리보기 — 영향 받는 계정 × page × action 표. 4) 확정 + 일괄 invalidate.

### 7-4. FE 사이드바 권한 반영

- `usePermissions()` hook 이 7-action map 을 사용 — 기존 `canAccess(page, 'view'|'edit')` → `canAccess(page, PermissionAction)` 로 확장. 권한 캐시 미로드 시 false 반환 ([[no-backlog-strict]] 메뉴 flash 회피 정책 유지).

## 8. 테스트 전략

### 8-1. 단위
- `PermissionAspect` MASTER bypass, PARTNER deny, account-level grant pass/deny.
- `PermissionAction` enum + `@RequirePermission` 7-action 파싱.
- `DefaultDynamicPermissionClient` 7-action `check` / `bulkLoad`.

### 8-2. 마이그레이션 IT (V39 핵심)
- `V39MigrationParityIT` (auth-service): V39 전후로 각 (role, page, action) 쌍의 효과 동등성. 모든 기존 (role, page) × {VIEW, EDIT} → V39 후 (role 의 어떤 계정, page) × {7-action} 의 boolean 이 분해 규칙대로인지 비교.
- `V39PartnerExclusionIT`: PARTNER role 계정의 `account_page_permissions` row 수 = 0.
- `V39GuardGatedPageIT`: estimates.list / products.* / sales.partner-order.* 의 guard-gated 효과 동일 유지.

### 8-3. 서비스별 권한 IT (재주석화 검증)
- 14 도메인 각각 `<Domain>Permission7ActionIT`: 새 7-action annotation 의 allow/deny 케이스. SP-D6 의 deny-stub 패턴 ([[no-backlog-strict]]) 일괄 보강 (점진 회피).
- `DynamicPermissionClient @MockBean` 의 page/action-aware stub 일괄 helper (SP-D6-7 see-saw 회피).

### 8-4. FE
- Playwright (clients/desktop): 매트릭스 화면 7 컬럼 렌더, 행/열 일괄 토글, 템플릿 적용 미리보기, 변경 저장. 다계정 wizard.
- `usePermissions().canAccess(page, action)` 단위 테스트.

## 9. PR 경계 + commit plan

**단일 PR** `feat/phase-1-permission-overhaul-framework`.

| commit | 내용 |
|---|---|
| C1 | Flyway V39 (templates + account_page_permissions + 행동보존 시드) + V39 IT 3종 |
| C2 | `PermissionAction` enum + `@RequirePermission` 7-action + `PermissionAspect` 7-action 분기 + MASTER short-circuit + PARTNER 가드 |
| C3 | `DynamicPermissionClient` 7-action + auth-service `PermissionLookupController` 7-action + 캐시 invalidate |
| C4-1 ~ C4-8 | 도메인별 재주석화 8 commit (accounting / ecount-migration / inventory / slip-estimates / arologis / partners / sales-products / platform-admin-notify). 각 commit 안에 mis-annotation 정정 + dead 코드 정리 + 해당 도메인 IT 보강 |
| C5 | desktop `PermissionMatrixPage` 전면 재작성 + 다계정 wizard + `usePermissions()` 확장 + Playwright |
| C6 | docs (README / DECISIONS / dev-report / samhan-public-overview.html sync) |

총 ~14 commit, 단일 PR. CI: 23/23 green 의무. SP-D6-7 패턴 차용 (commit 분할 → 사이클 1c/1d/1e 진행).

## 10. Phase 2 spillover (본 PR 비포함)

- `role_page_permissions` 테이블 drop (다음 PR).
- RESTORE 신규 구현 — 도메인별 spec (~30+ page). 범용 versioning vs 도메인별 결정. 사용자 요구 "전표 단위, `YYYY/MM/DD-{전표번호}`" 의 데이터 모델.
- DOWNLOAD PDF / PNG 신규 구현 — 라이브러리 선정 + 도메인별 export view.
- DOWNLOAD Excel 보강 — 시산표 / 거래처 원장 / 재고 잔액 등.
- PRINT HTML view 신규 구현 — 일마감 / 원장 / 거래처 / 재고 / 배차 / 관리.
- BE-only PageCode 의 FE 화면 추가 — products.* / messenger.* 등.

## 11. 위험 + 회피 (요약)

| 위험 | 회피 |
|---|---|
| 거대 PR → SP-D6-7 IT see-saw 재발 | 도메인별 commit 분할 + 도메인 IT 일괄 보강 + V39 IT 3종 사전 |
| 행동보존 회귀 (narrowing/widening) | `V39MigrationParityIT` + `V39GuardGatedPageIT` + per-endpoint 보존 매핑 |
| guard-gated page 충돌 (estimates.list 등) | §5 사전 식별 + SP-D7 옵션 A 패턴 (전용 `.view` 코드 분리) |
| MASTER 식별 신뢰성 (X-User-Role 위변조) | 토큰 claims 우선, X-User-Role 은 internal 신뢰 경계만 |
| `role_page_permissions` 조기 drop 의 비상 롤백 차단 | 본 PR 에서 drop 안 함, 다음 PR 로 |
| FE 메뉴 flash (권한 캐시 미로드) | `canAccess()` false 기본 ([[no-backlog-strict]] 정책 재사용) |

## 12. open items (구현 plan 작성 단계에서 결정)

1. `PermissionAction` enum 위치: `shared/common` vs `shared/security` (현행 `RequirePermission` 위치 추종).
2. `role_page_permission_templates` 의 BaseEntity 7 audit 컬럼 — `created_by` 가 V39 마이그레이션 시 NULL 인지 system UUID 인지 (기존 V seed 패턴 따름).
3. `bulkLoad(accountId)` 응답 JSON 스키마 (현행 FE 권한 캐시 모양과 호환 형태).
4. 다계정 wizard 의 트랜잭션 경계 — N 계정 × M page × 7 action UPSERT 시 batch 사이즈 / 부분 실패 처리.
5. 매트릭스 UI 의 14 도메인 그룹핑 키 (PageCode prefix 매핑 표) — sales / sales.partner-order / sales.vendor-order 등의 분리 정책.

## 13. 다음 단계

1. 본 spec self-review + 사용자 검토 (brainstorming 스킬 체크리스트 §8).
2. `writing-plans` 스킬로 구현 plan `docs/superpowers/plans/2026-05-28-permission-overhaul-phase-1-framework.md` 작성.
3. Codex 디스패치로 구현 ([[codex-implements-claude-reviews]]).
4. dual 5-agent 리뷰 + cycle N=2 ([[cycle-n2-mandatory]]) → CI green → PM 머지.

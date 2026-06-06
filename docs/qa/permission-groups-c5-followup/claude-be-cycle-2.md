# Claude BE 사이클 2 리뷰 (head `e96861c4` 기준)

> 목적: 사이클 1 fix 2건(Claude fix `3374a0c9` + Codex fix `e96861c4`)이 새 결함을 만들지 않았는지 delta 중심 검증.
> 검증 범위: `git diff 8c3ff6e4...e96861c4 -- services` (Codex fix delta) +
> `git diff origin/main...e96861c4 -- services shared` (전체 정합).

---

## 1. 중점 검증 결과

### 1-1. C-1/C-2 — AccountingEditRequestController / DailyClosingController / MonthEndCloseController / TaxInvoiceController Javadoc/계약 변경

**결론: 인가 시맨틱 변경 없음 — PASS.**

네 컨트롤러 전체의 `@RequirePermission` 어노테이션(page 값 + action 값)을 직접 확인했다.

| 컨트롤러 | 변경 전 (`3374a0c9`) | 변경 후 (`e96861c4`) |
|---|---|---|
| `AccountingEditRequestController` | `@RequirePermission(page="accounting.edit-requests*", action=*)` | **동일 — 변경 없음** |
| `DailyClosingController` | `@RequirePermission(page="accounting.daily-closing*", action=*)` | **동일 — 변경 없음** |
| `MonthEndCloseController` | `@RequirePermission(page=PAGE_CODE, action=*)` (PAGE_CODE="accounting.period-close") | **동일 — 변경 없음** |
| `TaxInvoiceController` | `@RequirePermission(page=TAX_INVOICE_LIST_PAGE_CODE/..., action=*)` | **동일 — 변경 없음** |

Codex fix(`e96861c4`)가 변경한 내용은 순수 Javadoc 문자열뿐이다:
- `ACCOUNTANT/MASTER`, `MANAGER/MASTER` 같은 구 role 명칭 → `@RequirePermission(page-code, action)` 형식 현행화.
- `SALES role 은 일마감 endpoint 에 접근 불가` → `일마감 실행 권한 없음 — 접근 불가` (role 기준 제거).
- `MASTER 전용` → `잠금 해제 권한 보유자 전용` (operation summary 포함).
- 403 `@ApiResponse` 설명에서 role 명칭 제거.

**인가 게이트(`@RequirePermission` 어노테이션)는 이 PR에서 한 번도 변경된 적이 없다** — 최초 커밋 `ded0f4e8` 부터 현재 head 까지 어노테이션 page/action 값은 일관.

---

### 1-2. C-3 — AuthFlywayV47SeedIT exact-set 로직 정확성

**결론: 차집합 SQL 정합 확인 — PASS. 단, 사소한 Nit 1건.**

Codex fix 가 승격시킨 `productsSyncMaterializedIntoAccountPagePermissions` 테스트를 V47 SQL 과 교차 검증했다.

#### V47 INSERT 대상 계정 집합

V47 SQL 의 INSERT SELECT 필터:
```sql
FROM account_groups ag
JOIN accounts a ON a.is_deleted=FALSE AND a.enabled=TRUE
JOIN group_page_permissions gpp
  ON gpp.group_id = ag.group_id
 AND gpp.page_code = 'products.sync'
 AND gpp.is_deleted = FALSE
WHERE ag.is_deleted = FALSE
  AND NOT EXISTS (system_master group 동시 배속)
```

#### IT `expectedAccountIds` SQL

```sql
FROM account_groups ag
JOIN accounts a ON a.is_deleted=FALSE AND a.enabled=TRUE
WHERE ag.group_id = MANAGER_GROUP_ID
  AND ag.is_deleted = FALSE
  AND NOT EXISTS (system_master group 동시 배속)
```

**정합 여부**: V47 SQL 은 `gpp.group_id = ag.group_id` 로 조인하여 MANAGER 그룹의 `products.sync` 행이 존재하는 계정만 집계한다. IT expected SQL 은 직접 `ag.group_id = MANAGER_GROUP_ID` 로 필터한다. V47 이 MANAGER 그룹 단 하나에만 seed 하므로 두 집합은 동등하다.

**시스템 마스터 제외 조건**: 양쪽 모두 `NOT EXISTS (sag JOIN permission_groups WHERE is_system_master=TRUE)` 절을 동일하게 포함한다.

**추가 단언**:
- `containsExactlyElementsOf` — 부분집합이 아닌 정확한 집합 비교.
- `assertThat(expectedAccountIds).isNotEmpty()` — 기준 집합이 0건이면 false-green 방지.
- `assertDevManagerProductsSyncActions()` — dev_manager 계정의 7 action 전체 직접 단언.
- `assertNoSystemMasterMaterializedRow()` — 시스템 마스터 배속 계정 0건 단언.

**Nit-C1 (Nit)**: `actualAccountIds` 쿼리가 `ag.group_id = MANAGER_GROUP_ID` 를 추가로 JOIN 하지 않아 다른 그룹에도 `products.sync` 가 생기면 해당 계정이 actualIds 에 포함된다. 현재 seed 에서는 MANAGER 그룹만 존재하므로 false-positive 위험은 0 이나, `actualAccountIds` 쿼리에 `AND ag.group_id = ?::uuid` (MANAGER group) 조건을 추가하면 더 명확하다. 현재 로직은 `containsExactlyElementsOf(expectedAccountIds)` 방향 단언이고 expectedAccountIds 가 MANAGER only 이므로 오탐 위험은 실질적으로 없다. **본 PR 즉시 처리 불필요.**

---

### 1-3. C-7 — EcountMig 신규 케이스 2종 (X-Is-System-Master 401 / role-only 403) 계약 일치

**결론: 필터 구현과 테스트 계약 정합 — PASS. 단, 중요 분석 메모 기록.**

#### 실구현 — accounting/user-service HeaderAuthenticationFilter

C5 후속 재키잉 후 두 서비스의 `hasPartialIdentity` 조건:

```java
boolean hasPartialIdentity = (groups != null && !groups.isBlank())
    || request.getHeader(IS_SYSTEM_MASTER_HEADER) != null;
```

| 케이스 | 헤더 조합 | hasPartialIdentity | 결과 |
|---|---|---|---|
| `missingUserId` | X-User-Groups=<UUID> (no userId) | **true** | filter → `response.sendError(401)` |
| `missingUserIdSystemMaster` | X-Is-System-Master=true (no userId) | **true** | filter → `response.sendError(401)` |
| `missingUserIdRoleOnly` | X-User-Role=MANAGER only (no userId, no groups, no SM) | **false** | filter 통과 → 미인증 → Spring Security `anyRequest().authenticated()` → **403** (Http403ForbiddenEntryPoint) |
| `anonymous` | 헤더 전무 | false | 위와 동일 → 403 |

테스트에서 기대값:
- `missingUserId` → 401 **일치**
- `missingUserIdSystemMaster` → 401 **일치**
- `missingUserIdRoleOnly` → 403 **일치** (Spring Security 기본 entry point 동작 — `EcountVoucherImportControllerIT` 주석 "Http403ForbiddenEntryPoint 가 403 반환" 으로 기존 IT 에서 검증된 동작)
- `anonymous` → 403 **일치**

#### `EcountMigPartialIdentitySupport` vs user-service 로컬 헬퍼 차이

accounting 의 `EcountMigPartialIdentitySupport.isMissingUserIdCase()` 는 `"refreshMissingUserId"` 라벨도 처리한다 (`EcountMig9CashJournalControllerIT` 에서 사용). user-service 로컬 헬퍼는 `"missingUserId"` 만 처리한다. user-service IT 는 `refreshMissingUserId` 라벨을 사용하지 않으므로 범위 내 결함 아님.

#### `denyRequirePermission` 미호출 + 403 — 오탐 위험 분석

`missingUserIdRoleOnly` 케이스는 `denyRequirePermission` 를 호출하지 않는다. 403 이 Spring Security entry point 에서 나왔는지 아니면 다른 이유인지 verify 없이는 false-green 가능성이 이론적으로 존재한다. 그러나 해당 경로에서 `@RequirePermission` AOP 는 실행되지 않으므로(인증 없음 → SecurityContextHolder 비어 있음, AOP 도달 전 필터 체인에서 차단) 이 케이스의 403 은 Spring Security 에서만 나온다. `EcountVoucherImportControllerIT` 기존 주석에서 동일 패턴 확인.

**Nit-C2 (Nit)**: `missingUserIdRoleOnly` 케이스에 "Spring Security Http403ForbiddenEntryPoint" 출처 주석을 1줄 추가하면 future-reader 혼선 방지. 현재 `missingUserId` / `missingUserIdSystemMaster` 케이스에는 이미 "C5 후속: 부분-identity 신호" 설명 주석이 있으나 `missingUserIdRoleOnly` 에는 출처 설명이 없다.

---

### 1-4. 사이클 1 전체 BE diff 컨벤션 일관 검사

**결론: 대부분 준수. 중간 수준 결함 1건, Nit 1건 추가 발견.**

#### 한국어 Javadoc 일관성

| 파일 | 검사 결과 |
|---|---|
| `AccountingEditRequestController` | 클래스/메서드 Javadoc 한국어 OK |
| `DailyClosingController` | 클래스 Javadoc 한국어 OK. 메서드 Javadoc 한국어 OK |
| `MonthEndCloseController` | 한국어 OK |
| `TaxInvoiceController` | 한국어 OK |
| `EcountMigPartialIdentitySupport` | 클래스 Javadoc 한국어 OK. 메서드 Javadoc 한국어 OK |
| `AuthFlywayV47SeedIT` | `@DisplayName` 한국어 OK |
| `AccountingPrometheusSecurityConfigTest` | 클래스 Javadoc 한국어 OK |
| `InventoryPermissionControllerIT` 주석 추가 | 한국어 OK |
| `InspectionAttachmentController` `@Operation` Javadoc | **결함 발견 — 하단 P3 결함표 참조** |
| `HeaderAuthenticationFilter` 계열 전체 | 한국어 OK |

#### `InspectionAttachmentController.delete()` — Stale `@Operation` description

**P3 결함 (BE-C2-1)**:

`InspectionAttachmentController.delete()` 의 `@Operation(description = "MANAGER/MASTER 권한. MinIO 객체는 감사 추적 위해 보존")` 이 `@PreAuthorize("hasAnyRole('MANAGER','MASTER')")` 제거 이후에도 변경되지 않았다. 현재는 `@RequirePermission(page="inventory.stock-balance", action=DELETE)` 단일 가드이므로 description 에서 role 명칭을 제거해야 한다. 컨벤션(한국어 Javadoc + page-code 기반 기술) 위반 + Swagger UI 오해 유발.

- **현재**: `description = "MANAGER/MASTER 권한. MinIO 객체는 감사 추적 위해 보존"`
- **기대**: `description = "@RequirePermission(inventory.stock-balance DELETE). MinIO 객체는 감사 추적 위해 보존"`

#### `DailyClosingController` — 잔존 `X-User-Role` 의존

**Nit-C3 (Nit)**: `DailyClosingController`, `MonthEndCloseController`, `TaxInvoiceController` 는 여전히 `private static final String ROLE_HEADER = "X-User-Role"` 상수를 선언하고 `@RequestHeader`로 받아 `checkEditPermission(roleHeader)` / `checkViewPermission(roleHeader)` 에 전달한다. C5-4 이후 gateway 가 X-User-Role 을 전달하지 않으므로 `roleHeader` 는 항상 null → 각 체크 메서드가 `if (actorRole == null || actorRole.isBlank()) { return; }` 로 즉시 skip 된다. 이 SP-D2 동적 권한 fallback 경로는 **실 운영에서 완전히 dead code** 이다. 현행 Javadoc 에는 이 사실이 명시되어 있지 않다.

인가 시맨틱에는 영향 없으나, future-reader 혼선과 잠재적 버그(다른 서비스에서 X-User-Role 복원 시 의도치 않은 동적 권한 override 활성화) 위험이 있다. `checkEditPermission` / `checkViewPermission` 메서드 또는 `ROLE_HEADER` 상수에 "C5 이후 gateway 미전송 — 항상 null, 이 메서드는 no-op" 주석을 추가하거나 dead code 를 제거해야 한다.

---

## 2. 결함 종합 표

| # | ID | 우선순위 | 위치 | 내용 | 분류 |
|---|---|---|---|---|---|
| 1 | BE-C2-1 | **P3** | `InspectionAttachmentController.delete()` `@Operation(description=...)` | `"MANAGER/MASTER 권한"` stale — `@PreAuthorize` 제거 후 `@RequirePermission` 단일 가드로 전환됐으나 OpenAPI description 미갱신. Swagger UI 오해 유발. | 본 PR 즉시 처리 |
| 2 | Nit-C1 | Nit | `AuthFlywayV47SeedIT.productsSyncMaterializedIntoAccountPagePermissions` `actualAccountIds` 쿼리 | MANAGER 그룹 외 다른 그룹에 `products.sync` 가 seed 되는 경우를 가정하면 actualAccountIds 가 예상보다 넓을 수 있다. 현재 seed 범위에서는 false-positive 없음. 방어적으로 `ag.group_id = MANAGER_GROUP_ID` 조건 추가 권장. | 선택 처리 (본 PR 즉시 필요 아님) |
| 3 | Nit-C2 | Nit | EcountMig6~10 IT `missingUserIdRoleOnly` 케이스 주석 | 403 이 Spring Security Http403ForbiddenEntryPoint 에서 나온다는 출처 주석 부재 — 유사 케이스(`missingUserId` 등)에는 설명 있으나 role-only 케이스는 설명 없음. | 선택 처리 |
| 4 | Nit-C3 | Nit | `DailyClosingController`, `MonthEndCloseController`, `TaxInvoiceController` SP-D2 동적 권한 헬퍼 | `ROLE_HEADER` / `checkEditPermission` / `checkViewPermission` 가 C5 이후 always-null 경로 → no-op dead code. 주석 또는 코드 제거로 명확화 필요. | 본 PR 즉시 처리 또는 후속 슬라이스 |

---

## 3. 세부 검증: C-1/C-2 `@RequirePermission` 불변 확인

원본 PR 커밋부터 현재 head 까지 네 컨트롤러의 `@RequirePermission` page/action 값 변경 이력을 직접 grep 으로 교차 확인했다. 변경 0건.

```
AccountingEditRequestController:
  line 65: @RequirePermission(page = "accounting.edit-requests", action = CREATE)
  line 83: @RequirePermission(page = "accounting.edit-requests.decide", action = UPDATE)
  line 101: @RequirePermission(page = "accounting.edit-requests.decide", action = UPDATE)
  line 118: @RequirePermission(page = "accounting.edit-requests.decide", action = VIEW)
  line 129: @RequirePermission(page = "accounting.edit-requests", action = VIEW)

DailyClosingController:
  line 77: @RequirePermission(page = "accounting.daily-closing.run", action = CREATE)
  line 100: @RequirePermission(page = "accounting.daily-closing", action = VIEW)
  line 142: @RequirePermission(page = "accounting.daily-closing.unlock", action = UPDATE)

MonthEndCloseController:
  line 72: @RequirePermission(page = PAGE_CODE="accounting.period-close", action = CREATE)
  line 84: @RequirePermission(page = PAGE_CODE, action = VIEW)
  line 100: @RequirePermission(page = "accounting.period-close.reverse", action = UPDATE)

TaxInvoiceController:
  line 92: @RequirePermission(page = TAX_INVOICE_LIST_PAGE_CODE="accounting.tax-invoice.list", action = CREATE)
  line 108: @RequirePermission(page = TAX_INVOICE_LIST_PAGE_CODE, action = UPDATE)
  line 126: @RequirePermission(page = TAX_INVOICE_LIST_PAGE_CODE, action = UPDATE)
  line 147: @RequirePermission(page = "accounting.tax-invoice.cancel", action = UPDATE)
  line 171: @RequirePermission(page = "accounting.tax-invoice.issue-request", action = CREATE)
  line 190: @RequirePermission(page = TAX_INVOICE_LIST_PAGE_CODE, action = VIEW)
  line 220: @RequirePermission(page = TAX_INVOICE_LIST_PAGE_CODE, action = VIEW)
  line 229: @RequirePermission(page = TAX_INVOICE_LIST_PAGE_CODE, action = VIEW)
  line 248: @RequirePermission(page = TAX_INVOICE_LIST_PAGE_CODE, action = VIEW)
  line 280: @RequirePermission(page = "accounting.tax-invoice.emit-nts", action = UPDATE)
```

모두 원본 값 유지 확인. **인가 시맨틱 변경 없음.**

---

## 4. 세부 검증: `InventoryPermissionControllerIT` `@PreAuthorize` 제거 영향

`InspectionAttachmentController.delete()` 에서 `@PreAuthorize("hasAnyRole('MANAGER','MASTER')")` 가 제거됐다. 사이클 1 보고서에는 이 변경이 명시적으로 언급되지 않았으나 Codex fix 에서 `InventoryPermissionControllerIT` 갱신으로 확인된다.

- C5 이후 `HeaderAuthenticationFilter` 가 `ROLE_MANAGER`, `ROLE_MASTER` authority 를 생성하지 않으므로 구 `@PreAuthorize` 는 always-false dead-gate 였다.
- 제거 후 `@RequirePermission(inventory.stock-balance, DELETE)` 단독 게이트로 동일하거나 더 명확한 인가 제어.
- 테스트 `attachmentDelete_warehouseWithDeletePermission_passesRequirePermissionOnly` 가 DELETE permission 부여 시 200 통과를 단언 — 새 동작 검증 완료.

---

## 5. UUID 사용자 노출 점검

BE diff 범위 내 사용자에게 노출되는 값:
- 응답 body 의 UUID 는 변경 없음.
- 에러 메시지에서 UUID 직접 노출 패턴 신규 추가 없음.
- `parseActorId` 폴백이 `new UUID(0L, 0L)` (not 사용자 UUID) — 기존 패턴 유지.

**UUID 사용자 비공개 위반 0건.**

---

## 6. 최종 판정

**판정: 조건부 APPROVE**

사이클 1 fix 2건(Claude + Codex)이 새로운 P0/P1/P2 결함을 만들지 않았음을 확인한다.

- C-1/C-2: `@RequirePermission` 어노테이션 불변 확인. Javadoc/description 만 현행화. **보안 회귀 없음.**
- C-3: exact-set 단언 로직 V47 SQL 과 정합. 시스템 마스터 제외 조건 양방향 일치. **false-green 위험 해소.**
- C-7: 필터 구현과 IT 기대값 전 케이스 일치 추적. role-only 403 경로 Spring Security 동작 확인. **계약 일치.**
- 컨벤션: 한국어 Javadoc 일관. 신규 P3 1건 + Nit 3건.

**본 PR 즉시 처리 필요 결함**:
- BE-C2-1 (P3): `InspectionAttachmentController.delete()` `@Operation(description)` stale role 명칭 제거.
- Nit-C3: `DailyClosingController` 등 3개 컨트롤러 SP-D2 동적 권한 no-op 경로 주석 또는 dead code 제거.

나머지 Nit(Nit-C1, Nit-C2)는 본 PR 비차단 — 후속 슬라이스 또는 선택 처리.

보안 회귀 0 / UUID 사용자 비공개 위반 0 / `@RequirePermission` 어노테이션 게이트 불변 확인 — 사이클 2 BE 검증 완결.

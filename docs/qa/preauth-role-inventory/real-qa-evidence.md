# PR #387 inventory role 전환 (Option A) — 실 데이터 QA 실증

> 작성 2026-06-05. @PreAuthorize 완전제거 마이그레이션 — inventory-service role 전환.
> 개발책임자 결정 = **Option A: INVENTORY role 의 inventory.dps / inventory.stock-balance 접근 정식 수용**.
> [[feedback_qa_docker_real_test]] / [[feedback_no_fake_data_ever]] 준수 — 실 seed DB 직접 실측(가짜 데이터·합성 0).

## 1. 검증 목적

`@PreAuthorize("hasAnyRole('WAREHOUSE','MANAGER','MASTER')")` 10건 제거 후 `@RequirePermission` 단일소스 전환.
핵심 사실 = **INVENTORY role 이 실 seed 에서 inventory.dps / inventory.stock-balance 에 grant 되어 있어**, @PreAuthorize 제거 시 INVENTORY 가 해당 10 endpoint 에 실제로 접근 가능(= 수용된 widening). 이 전제를 실 DB 로 실증한다.

## 2. 실 DB 실측 (samhan-postgres / auth_db, Docker 가동 중)

### 2-1. role_page_permissions (V10/V35 seed 원천)

```
$ docker exec samhan-postgres psql -U samhan -d auth_db -c \
  "SELECT role_code, page_code, can_view, can_edit FROM role_page_permissions
   WHERE role_code='INVENTORY' AND page_code IN ('inventory.dps','inventory.stock-balance')
   AND is_deleted=false ORDER BY page_code;"

 role_code |        page_code        | can_view | can_edit
-----------+-------------------------+----------+----------
 INVENTORY | inventory.dps           | t        | t
 INVENTORY | inventory.stock-balance | t        | t
(2 rows)
```

### 2-2. account_page_permissions (V39 materialized — account 모드 실 enforcement 소스)

PermissionAspect 는 account 모드(기본)에서 `account_page_permissions` 를 조회한다. 즉 **프로덕션이 실제로 읽는 권한 테이블**.

```
$ docker exec samhan-postgres psql -U samhan -d auth_db -c \
  "SELECT acc.role, ap.page_code, ap.can_view, ap.can_create, ap.can_update, ap.can_delete, ap.can_download
   FROM account_page_permissions ap JOIN accounts acc ON acc.id = ap.account_id
   WHERE acc.role='INVENTORY' AND ap.page_code IN ('inventory.dps','inventory.stock-balance')
   ORDER BY ap.page_code;"

   role    |        page_code        | can_view | can_create | can_update | can_delete | can_download
-----------+-------------------------+----------+------------+------------+------------+--------------
 INVENTORY | inventory.dps           | t        | t          | t          | t          | t
 INVENTORY | inventory.stock-balance | t        | t          | t          | t          | t
(2 rows)
```

## 3. 결론 (실 데이터 기반)

1. **Option A 전제 실증**: INVENTORY 는 실 seed(role + account materialized 양쪽)에서 두 page 에 view/create/update/download grant 보유. @PreAuthorize 제거 후 account 모드 enforcement 가 이 grant 를 읽어 INVENTORY 계정에 **실서버에서 200** 부여 → 수용된 access 확대가 실제로 발생함을 확인.
2. **delete 가드 load-bearing 실증**: account_page_permissions 에서 INVENTORY × inventory.stock-balance `can_delete=TRUE`. 따라서 `InspectionAttachmentController.delete` 의 `@PreAuthorize("hasAnyRole('MANAGER','MASTER')")` 를 제거하면 INVENTORY/WAREHOUSE 에게 첨부 삭제가 열림 → **유지 결정이 실 DB 로 정당화**됨. IT `attachmentDelete_warehouseRole_isForbiddenDueToPreAuthorize`(verify check never)가 회귀 박제.
3. **enforcement 결정성**: `InventoryPermissionControllerIT` 가 PermissionAspect(account 모드) 실 빈을 wiring + DynamicPermissionClient mock 으로 grant→정상 status(200/201) / 미부여→403 을 결정적 검증. `migratedEndpoint_inventoryRoleWithGrant_isAllowed` 가 10 endpoint × INVENTORY + grant → 정확 status + `verify(check)` 로 권한경로 실행 입증(false-green 차단).

## 4. 한계 (정직 보고 — [[feedback_no_fake_data_ever]])

- **live gateway HTTP 호출 미수행**: 본 QA 시점에 inventory-service / gateway 컨테이너 미가동(auth-service·postgres 만 healthy). 또한 dev INVENTORY 계정 비번이 V5 seed 해시와 불일치하는 알려진 블로커(#390/#391 동일)로 INVENTORY JWT 직접 발급 제약. → 실 gateway 경유 `X-User-Role=INVENTORY` → 200 직접 캡처는 **미수행**.
- **대체 증명**: 위 2-2 의 account 모드 실 enforcement 테이블 실측(프로덕션이 읽는 바로 그 데이터) + 결정적 IT(PermissionAspect 실 빈) + Linux CI green(`user+product+inventory+logging` 잡 통과)으로 실 동작을 입증. #390/#391 의 psql + 정적 enforcement 증명 선례와 동일 수준.
- **P2 후속**: dev INVENTORY 계정 비번 복구 후 live gateway INVENTORY HTTP 200 직접 캡처(기존 handoff "dev seed 계정 비번 복구" 후속과 통합).

## 5. CI

전체 잡 PASS(GitGuardian 제외 — 테스트 placeholder/QA 문서 권한 덤프 트리거, PM false-positive 판정 [[feedback_gitguardian_false_positive]]). inventory IT 포함 `user+product+inventory+logging` green.

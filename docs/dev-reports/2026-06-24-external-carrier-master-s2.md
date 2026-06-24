# 외부기사/배송사 마스터 슬2 개발 리포트

> 2026-06-24. 검수완료 → 배차발송 에픽 슬2. 기준 spec: `docs/superpowers/specs/2026-06-24-dispatch-on-inspect-external-carrier-design.md`, plan: `docs/superpowers/plans/2026-06-24-external-carrier-master-s2.md`.

## 1. 범위

- `slip-service`에 `external_carrier` 마스터 테이블과 CRUD API를 추가했다.
- `auth-service`에 page-code `dispatch.external-carriers`를 등록하고 account-mode 7-action 권한을 시드했다.
- `api-gateway` no-prefix 배차 admin route에 `/admin/external-carriers`를 추가했다.
- `clients/desktop` 배차 메뉴에 `외부기사/배송사` 화면을 추가하고 mock/API/test를 동기화했다.
- 슬3 범위인 `external_dispatch` / `external_dispatch_slip` 발송 기록 테이블과 SMS 발송 실행은 만들지 않았다.

## 2. Backend 문서화

### `ExternalCarrier`
- 외부기사/배송사 마스터 엔티티다.
- `BaseEntity`를 상속하고 `@SQLRestriction("is_deleted = false")`로 soft-delete row를 기본 조회에서 제외한다.
- 도메인 메서드:
  - `create(name, phone, email, defaultVehicleType, memo)`: 신규 마스터 생성.
  - `update(...)`: null이 아닌 필드만 부분 수정.
  - `activate()` / `deactivate()`: soft-delete와 별개인 운영 활성 상태 토글.

### `ExternalCarrierRepository`
- `findAllByIsDeletedFalseOrderByNameAsc()`: 활성 row 전체 목록.
- `searchAdmin(q, pageable)`: name/phone LIKE 검색.
- `existsByPhoneAndIsDeletedFalse(phone)`: 활성 전화번호 중복 검증.
- `findDeletedById(id)`: 복구용 native query. entity `@SQLRestriction` 우회.

### `ExternalCarrierService`
- `search(q, pageable)`: admin 목록/검색 Page 반환.
- `getOne(id)`: 단건 조회. 미존재 시 `NOT_FOUND`.
- `create(req)`: phone 활성 중복 시 `CONFLICT(409)`.
- `update(id, req)`: 부분 수정, phone 변경 중복 재검증.
- `delete(id, callerId)`: `BaseEntity.markDeleted()` soft-delete.
- `restore(id)`: deleted row 복구 전 phone 활성 중복 재검증.

### `ExternalCarrierAdminController`
- Base path: `/admin/external-carriers`.
- 권한 page-code: `dispatch.external-carriers`.
- action 매핑:
  - `GET ""`, `GET "/{id}"` → VIEW
  - `POST ""` → CREATE
  - `PATCH "/{id}"` → UPDATE
  - `DELETE "/{id}"` → DELETE
  - `POST "/{id}/restore"` → RESTORE
- 응답은 `ApiResponse` envelope로 감싼다.

## 3. Frontend 문서화

### `externalCarrier.ts`
- `listExternalCarriers(params)`: Spring Page 응답을 반환한다.
- `createExternalCarrier(req)`, `updateExternalCarrier(id, req)`, `removeExternalCarrier(id)`, `restoreExternalCarrier(id)`를 제공한다.
- `ExternalCarrier.id`는 path key 전용이며 화면 식별자는 name/phone이다.

### `ExternalCarriersPage`
- DataTable 컬럼: 이름/전화/이메일/기본차종/활성여부/관리.
- `canAccess('dispatch.external-carriers', 'create')`가 true일 때 등록/수정/삭제 액션을 노출한다.
- `validateExternalCarrierForm()`으로 name/phone 필수값을 검증한다.
- data-testid는 `admin-external-carriers-row-{name}` 형태로 UUID를 사용하지 않는다.

### `mock.ts`
- `/admin/external-carriers` GET/POST/PATCH/DELETE/restore를 in-memory mock으로 제공한다.
- 성공 응답도 모두 non-null envelope 형태를 유지한다.
- mock 권한 매트릭스에 `dispatch.external-carriers`를 추가해 PermissionGuard와 메뉴 가드가 같은 page-code를 사용한다.

## 4. 권한/마이그레이션

- slip V49: `external_carrier` 단일 테이블, phone 활성 부분 unique index, name index.
- auth V69: V66 4-table 패턴으로 `role_page_permissions`, `role_page_permission_templates`, `group_page_permissions`, `account_page_permissions`를 동기화한다.
- 대상 그룹: MASTER(`...100`), MANAGER(`...101`), DISPATCH(`...106`).
- 허용 액션: view/create/update/delete/restore. download/print는 false.

## 5. 검증 계획

- slip-service: `ExternalCarrierAdminControllerIT`가 CRUD happy path, phone 중복 409, CREATE 권한 deny 403을 검증한다.
- desktop: `ExternalCarriersPage.test.ts`가 UUID 비노출 test id, create 권한 가드, name/phone 필수 검증을 확인한다.
- 환경 가능 시 `./gradlew :services:slip-service:assemble :services:auth-service:assemble` 및 `npm run typecheck`를 수행한다.

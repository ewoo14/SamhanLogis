# SP-D6-4 partner + arologis 권한 마이그레이션 설계

## 목표

partner-service와 arologis-service의 `@PreAuthorize` 기반 endpoint 권한을 `@RequirePermission`으로 이관한다. `isAuthenticated()` endpoint와 `/internal/**` endpoint는 기존 annotation을 유지한다.

## 범위

- partner-service: 관리자 거래처, 차단, 첨부 upload/delete, 방문사진 upload/delete, edit-request, realtime, 4탭, 이카운트 import
- arologis-service: admin dispatch, admin v1 dispatch, region, reconcile, dispatch save history, driver-app
- auth-service: SP-D6-4 신규 PageCode V34 seed
- desktop: PageCode union과 권한 매트릭스 노출

## PageCode 매핑

### partner-service

| PageCode | 용도 | 원래 role cap |
| --- | --- | --- |
| `partners.search` | 목록/검색 | MASTER, MANAGER, SALES |
| `partners.detail` | 단건/일반 첨부 upload/delete | MASTER, MANAGER, SALES, ACCOUNTANT 조회 / MASTER, MANAGER, SALES 편집 |
| `partners.edit` | 등록/수정/export/이카운트 import | MASTER, MANAGER |
| `partners.delete` | 거래처 삭제 | MASTER |
| `partners.credit-history` | 신용 거래 이력 | MASTER, MANAGER, ACCOUNTANT |
| `partners.block` | BLOCK 목록/단건 등록 | MASTER, MANAGER |
| `partners.block.bulk` | BLOCK import/delete | MASTER |
| `partners.4tab` | 4탭 조회/일괄등록 | MASTER, MANAGER, SALES |
| `partners.4tab.edit` | 4탭 수정/탭별 mutation | MASTER, MANAGER |
| `partners.edit-requests` | edit-request 생성/이력/SSE | MASTER, MANAGER, ACCOUNTANT |
| `partners.edit-requests.decide` | edit-request 대시보드/승인/거절 | MASTER, MANAGER |

### arologis-service

| PageCode | 용도 | 원래 role cap |
| --- | --- | --- |
| `arologis.dispatch.admin` | 일반 admin dispatch mutation/list, admin v1 | MASTER, MANAGER, AROLOGIS_MASTER, AROLOGIS_MANAGER |
| `arologis.dispatch.ops` | 가배차/미배차/지방/감사/realtime/reconcile/history | MASTER, MANAGER, DISPATCH, AROLOGIS_MASTER, AROLOGIS_MANAGER |
| `arologis.region` | region 목록 | MASTER, MANAGER, DISPATCH |
| `arologis.region.manage` | region 생성/import/update/delete | MASTER, MANAGER, AROLOGIS_MASTER, AROLOGIS_MANAGER |
| `arologis.edit-requests` | dispatch edit-request 생성 | MASTER, MANAGER, DISPATCH, AROLOGIS_MASTER, AROLOGIS_MANAGER |
| `arologis.edit-requests.decide` | pending/approve/reject | MASTER, MANAGER, AROLOGIS_MASTER, AROLOGIS_MANAGER |
| `arologis.driver` | driver-app | DRIVER, MASTER, MANAGER, AROLOGIS_DRIVER, AROLOGIS_MASTER, AROLOGIS_MANAGER |

아로로지스 전용 role은 auth-service matrix가 보유한 11-role 축과 맞추기 위해 service-local DPC 어댑터에서 `AROLOGIS_MASTER -> MASTER`, `AROLOGIS_MANAGER -> MANAGER`, `AROLOGIS_DRIVER -> DRIVER`로 정규화한다.

## 회귀 방지

- `*.edit-requests.decide`는 생성 PageCode와 반드시 분리한다.
- 신규 seed는 원래 `@PreAuthorize` role cap보다 넓히지 않는다.
- `isAuthenticated()`와 INTERNAL endpoint는 변경하지 않는다.
- 새 권한 IT는 `@WebMvcTest`로 작성하고 DPC를 mock한다.

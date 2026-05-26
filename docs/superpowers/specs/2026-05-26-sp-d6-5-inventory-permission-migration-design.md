# SP-D6-5 inventory-service 권한 마이그레이션 설계

## 목표

inventory-service의 role 기반 `@PreAuthorize` endpoint를 `@RequirePermission` AOP로 이관한다. `isAuthenticated()` 첨부 조회/다운로드와 internal 전용 role guard는 변경하지 않는다.

## 범위

- inventory-service: stock, transfer, warehouse, DPS, inbound inspection, safety-stock, audit/edit-request, ecount import, attachment upload/delete
- auth-service: 신규 PageCode enum + V35 seed
- desktop: PageCode union + 권한 매트릭스 재고 그룹
- tests: `@WebMvcTest` slice grant/deny + 기존 IT DPC mock 보강

## PageCode 매핑

| PageCode | 용도 | 원래 role cap |
| --- | --- | --- |
| `inventory.list` | batch stock/transfer 조회 | MASTER, MANAGER, DEVELOPER, SALES, ACCOUNTANT, WAREHOUSE, INVENTORY |
| `inventory.detail` | audit/detail/timeline 조회 | MASTER, MANAGER, DEVELOPER, ACCOUNTANT, WAREHOUSE, INVENTORY |
| `inventory.stock-balance` | 재고 잔량/입고/라인/검수 작업 | MASTER, MANAGER, WAREHOUSE, INVENTORY 중심 |
| `inventory.adjust` | 재고 조정, 실사 완료/취소, 이동 승인/반려/확정/취소 | MASTER, MANAGER, INVENTORY |
| `inventory.transfer` | 이동전표 조회/생성/출하/입고 | 조회는 광역, 편집은 MASTER/MANAGER/WAREHOUSE/INVENTORY |
| `inventory.warehouse` | 창고 조회/편집 | V10 기존 코드 재사용, `@hr.isExecutiveOffice()` 보존 |
| `inventory.dps` | DPS 비교/저장이력 | V10 기존 코드 재사용, 원래 허용 role 보존 |
| `inventory.safety-stock` | 안전재고 조회/설정 | MASTER, MANAGER, INVENTORY, WAREHOUSE |
| `inventory.edit-requests` | 실사 수정 요청 생성 | MASTER, MANAGER, INVENTORY, ACCOUNTANT |
| `inventory.edit-requests.decide` | 실사 수정 요청 조회/승인/거절 | MASTER, MANAGER, ACCOUNTANT |
| `ecount.import.inventory` | 이카운트 창고/창고이동 import | MASTER, MANAGER |

## 회귀 방지

- `inventory.edit-requests.decide`는 생성 권한과 분리한다.
- 창고 mutation의 `@hr.isExecutiveOffice()`는 반드시 남긴다.
- V10/공용 PageCode가 원래 role cap보다 넓은 endpoint는 권한 확대 방지를 위해 정적 role guard를 이중으로 둔다.
- V35는 신규 PageCode만 seed하고 기존 V10 row는 갱신하지 않는다.
- 모든 SpringBootTest IT는 DPC mock 또는 명시 헤더로 auth-service 실호출을 막는다.

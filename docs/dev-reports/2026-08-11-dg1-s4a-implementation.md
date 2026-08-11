# D-G1 S4a 영업수수료 정산 구현 보고서

작성일: 2026-08-11  
범위: REST API, 회계 메뉴·라우트·목록/상세, D-G6 전용 권한  
제외: 그룹웨어 연결 버튼(S4b), 확정 취소(#1169 D-G7), 요율 계약 관리 화면

## 1. 구현 결과

- `accounting.sales-commission-settlement` 전용 pageCode를 신설했다. `accounting.reports`를 재사용하지 않는다.
- 목록·상세·생성·확정 REST API를 추가했다.
- DRAFT는 `documentNo=null`, CONFIRMED는 기존 `NumberSequence`를 통해 `yyyy/MM/dd-N` 형식으로 채번한다.
- 목록의 문서번호를 클릭하면 상세로 이동하고, 상세에서 `뒤로 가기`로 목록에 복귀한다.
- 회계 카테고리의 기존 메뉴를 유지한 채 `영업수수료 정산`을 추가했다.
- UI와 백엔드 양쪽에서 전용 pageCode 권한을 검사한다.
- 화면에는 내부 UUID를 표시하지 않는다. UUID는 REST path의 내부 mutation 식별자로만 사용한다.

## 2. REST API 계약

Base path: `/accounting/sales-commission-settlements`

| method | path | permission | 동작 |
|---|---|---|---|
| GET | `/accounting/sales-commission-settlements?page=0&size=20` | VIEW | soft-delete 제외 Page 목록 |
| GET | `/accounting/sales-commission-settlements/{id}` | VIEW | 정산서 상세 |
| POST | `/accounting/sales-commission-settlements` | CREATE | `settlementDate`로 DRAFT 생성 |
| POST | `/accounting/sales-commission-settlements/{id}/confirm` | UPDATE | DRAFT 확정 및 문서번호 채번 |

응답은 기존 `ApiResponse` wrapper를 사용한다. 응답 필드는 `documentNo`, `settlementDate`, `status`, `totalAmount`, `payoutAmount`, `supplyAmount`, `vatAmount`, `rateContractVersion`이며 금액은 문자열화된 `BigDecimal`이다. 목록·상세 조회는 `rateContract`를 EntityGraph로 함께 읽어 snapshot 요율 버전 조회가 트랜잭션 밖 lazy-loading으로 깨지지 않게 했다.

확정 취소 endpoint와 그룹웨어 참조 첨부/연결 endpoint는 구현하지 않았다.

## 3. D-G6 역할 × 7-action 기본 대조표

seed 기준 비트 순서: `VIEW | CREATE | UPDATE | DELETE | RESTORE | DOWNLOAD | PRINT`

| 역할 | VIEW | CREATE | UPDATE | DELETE | RESTORE | DOWNLOAD | PRINT | 비트 |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| MASTER | 1 | 1 | 1 | 0 | 0 | 0 | 0 | `1110000` |
| MANAGER | 1 | 1 | 1 | 0 | 0 | 0 | 0 | `1110000` |
| ACCOUNTANT | 1 | 1 | 1 | 0 | 0 | 0 | 0 | `1110000` |
| SALES | 0 | 0 | 0 | 0 | 0 | 0 | 0 | `0000000` |
| WAREHOUSE | 0 | 0 | 0 | 0 | 0 | 0 | 0 | `0000000` |
| DISPATCH | 0 | 0 | 0 | 0 | 0 | 0 | 0 | `0000000` |
| INVENTORY | 0 | 0 | 0 | 0 | 0 | 0 | 0 | `0000000` |
| DEVELOPER | 0 | 0 | 0 | 0 | 0 | 0 | 0 | `0000000` |
| PARTNER | 0 | 0 | 0 | 0 | 0 | 0 | 0 | `0000000` |
| STAFF | 0 | 0 | 0 | 0 | 0 | 0 | 0 | `0000000` |
| DRIVER | 0 | 0 | 0 | 0 | 0 | 0 | 0 | `0000000` |

MASTER는 기존 `DynamicPermissionService`의 system-master runtime bypass가 있으므로 실제 MASTER 요청은 기존 정책대로 전 action이 허용될 수 있다. 위 표는 신규 migration/template의 기본 seed 비트이며 MASTER bypass를 새 권한으로 추가한 것이 아니다.

### 권한 양방향 mutation 확인

1. 권한 없는 역할에 부여하는 방향: `SalesCommissionSettlementPermissionSeedTest`가 8개 비허용 역할의 명시적 zero row와 회계담당자 이상 grant를 동시에 검증한다. mock 계약은 SALES의 목록·생성·확정 요청을 모두 HTTP 403으로 확인한다.
2. mock 초과 비트 방향: ACCOUNTANT의 `/auth/admin/permissions/my` 결과가 정확히 `['VIEW', 'CREATE', 'UPDATE']`인지 검증한다. DELETE/RESTORE/DOWNLOAD/PRINT가 하나라도 섞이면 테스트가 RED가 된다.
3. 실제 API enforcement: controller의 네 operation에 모두 `@RequirePermission(page = PAGE_CODE, action = ...)`를 부착했고, 저장소 공통 `PermissionAspect`가 권한 없는 요청을 거절하는 단일 backend guard를 사용한다. controller 계약 테스트가 전 operation의 pageCode/action 부착을 고정한다.

## 4. 메뉴·라우트·화면 좌표

- 회계 sidebar: `clients/desktop/src/renderer/components/AppLayout.tsx`의 `<SidebarCategory label="회계">` 아래에 추가. 기존 회계 child route 목록은 삭제하지 않았다.
- active target: `/accounting/sales-commission-settlements`를 회계 activeTargets에 추가했다.
- 라우트:
  - `/accounting/sales-commission-settlements`
  - `/accounting/sales-commission-settlements/:id`
- 두 라우트 모두 `PermissionGuard`에 전용 pageCode의 VIEW를 사용한다.
- 권한관리: `PermissionMatrixPage.tsx`의 `회계` 그룹에 `영업수수료 정산`을 별도 항목으로 추가했다.
- 좁은 창: 720×900에서 hamburger drawer를 열고 대상 링크를 drawer 내부에서 scroll한 뒤 viewport bounds와 중심점 hit-test를 확인했다. DOM 존재만으로 통과하지 않는다.

## 5. RED 원문 및 수정

### RED-A

초기 서비스 테스트는 다음 컴파일 실패로 시작했다.

```text
cannot find symbol: method list(PageRequest)
cannot find symbol: method getOne(UUID)
```

초기 pageCode 계약 테스트도 전용 enum 값이 없어 다음 조건을 만족하지 못했다.

```text
PageCode.isValid("accounting.sales-commission-settlement") == false
```

REST controller, service list/detail, 전용 enum/seed, FE API와 화면을 추가한 후 GREEN으로 전환했다.

### RED-B 회귀 표적

- 기존 회계 메뉴 20여 개 보존을 Playwright 정적 계약으로 고정했다.
- 기존 권한 matrix의 다른 항목을 수정하지 않고 전용 항목만 추가했다.
- S1·S2의 기존 정산 service 테스트와 `NumberSequence`/versioned contract 경로를 건드리지 않았다.
- 데스크톱 전체 Vitest를 재측정했다. 이전 정찰 수치 1,866~1,875가 아니라 현재 워크트리 기준 `246 files / 2,159 passed / 1 skipped`였다.

## 6. 조합표

| 조합 | 검증 |
|---|---|
| ACCOUNTANT + 목록 | 회계 메뉴 실제 가시성, Page 목록 |
| ACCOUNTANT + 문서번호 클릭 | 상세 route, 문서번호 heading, 뒤로 가기 |
| ACCOUNTANT + DRAFT 생성 | 문서번호 없음, status 임시저장 |
| ACCOUNTANT + 확정 | settlementDate 기준 `yyyy/MM/dd-N` 채번, status 확정 |
| SALES/no permission + 목록·생성·확정 | sidebar hidden, 직접 route redirect, mock API 403 |
| CONFIRMED 조회 | 문서번호와 상세 금액/상태 표시 |
| 빈 목록 | `등록된 영업수수료 정산서가 없습니다.` empty state |
| 좁은 창 | drawer open, scroll 후 viewport bounds/hit-test |
| export/delete/restore/print | ACCOUNTANT mock action exactness로 초과 bit 차단 |

## 7. 검증 결과

- `:services:accounting-service:test --tests ...SalesCommissionSettlementServiceTest --tests ...SalesCommissionSettlementControllerTest` — BUILD SUCCESSFUL
- `:services:auth-service:test --tests ...SalesCommissionSettlementPageCodeTest --tests ...SalesCommissionSettlementPermissionSeedTest` — BUILD SUCCESSFUL
- `npm run typecheck` — 통과
- `npm run build` — 통과
- `npm test -- --run src/renderer/api/mock.test.ts src/renderer/api/salesCommissionSettlementApi.test.ts` — 2 files, 149 passed, 1 skipped
- `npx playwright test playwright/dg1-s4a-sales-commission-settlement-real-qa/dg1-s4a-sales-commission-settlement-real-qa.spec.ts --project=chromium` — 5 passed
- `npm test -- --run` — 246 files, 2,159 passed, 1 skipped

초기 Vitest 실행은 `node_modules`, design-system dist, Electron main 산출물이 없는 환경 게이트에서 중단됐으나, 로컬 의존성 설치와 design-system/desktop build 후 재실행해 통과했다. 네트워크·DB write·배포는 수행하지 않았다.

## 8. QA 스크린샷

- [accountant-detail.png](../qa/2026-08-11-dg1-s4a/accountant-detail.png)
- [draft-confirmed.png](../qa/2026-08-11-dg1-s4a/draft-confirmed.png)
- [no-permission-hidden.png](../qa/2026-08-11-dg1-s4a/no-permission-hidden.png)

## 9. 신규 파일 목록

- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/SalesCommissionSettlementController.java`
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/dto/CreateSalesCommissionSettlementRequest.java`
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/dto/SalesCommissionSettlementResponse.java`
- `services/accounting-service/src/test/java/com/samhanair/logis/accounting/web/SalesCommissionSettlementControllerTest.java`
- `services/auth-service/src/main/resources/db/migration/V101__seed_sales_commission_settlement_page_permission.sql`
- `services/auth-service/src/test/java/com/samhanair/logis/auth/domain/SalesCommissionSettlementPageCodeTest.java`
- `services/auth-service/src/test/java/com/samhanair/logis/auth/domain/SalesCommissionSettlementPermissionSeedTest.java`
- `clients/desktop/src/renderer/routes/SalesCommissionSettlementListPage.tsx`
- `clients/desktop/src/renderer/routes/SalesCommissionSettlementDetailPage.tsx`
- `clients/desktop/src/renderer/api/salesCommissionSettlementApi.test.ts`
- `clients/desktop/playwright/dg1-s4a-sales-commission-settlement-real-qa/dg1-s4a-sales-commission-settlement-real-qa.spec.ts`
- `docs/superpowers/plans/2026-08-11-dg1-s4a-implementation.md`
- `docs/dev-reports/2026-08-11-dg1-s4a-implementation.md`

## 10. 수정 파일 목록

- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/SalesCommissionSettlementService.java`
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/repository/SalesCommissionSettlementRepository.java`
- `services/accounting-service/src/test/java/com/samhanair/logis/accounting/service/SalesCommissionSettlementServiceTest.java`
- `services/auth-service/src/main/java/com/samhanair/logis/auth/domain/PageCode.java`
- `clients/desktop/src/renderer/api/accounting.ts`
- `clients/desktop/src/renderer/api/mock.ts`
- `clients/desktop/src/renderer/api/mock.test.ts`
- `clients/desktop/src/renderer/api/permissionsApi.ts`
- `clients/desktop/src/renderer/components/AppLayout.tsx`
- `clients/desktop/src/renderer/routes/index.tsx`
- `clients/desktop/src/renderer/routes/PermissionMatrixPage.tsx`
- `clients/desktop/src/renderer/test-utils/accounting-slip-permission-snapshot.ts`
- `clients/desktop/src/renderer/test-utils/accounting-slip-permission-db-snapshot.ts`

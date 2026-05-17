# SP-08-4-1 주문 목록·상세 endpoint parity

작성일: 2026-05-17  
브랜치: `feat/sp-08-4-1-partner-order-list-detail`

## 1. Gap analysis

| 항목 | 확인 결과 | 조치 |
|---|---|---|
| R1 목록 endpoint | `PartnerOrderListController` 에 `GET /api/v1/partner-orders` 존재. 기존 파라미터는 `page`, `size` 뿐이었다. | `dateFrom`, `dateTo`, `partnerId`, `status`, `searchKeyword` 추가 |
| 날짜 필터 | 기존 목록에는 날짜 범위 필터가 없었다. | `confirmedAt` 기준 양끝 포함, 역전 입력 시 자동 교환 |
| 거래처 필터 | 기존 목록에는 거래처 필터가 없었다. | 거래처 코드와 사업자번호 검색 |
| 상태 필터 | 프론트는 상태를 보내고 있었지만 백엔드는 받지 않았다. | 실제 enum `DRAFT`, `CONFIRMING`, `CONFIRMED`, `CANCELED` 기준 필터 |
| 검색어 필터 | 주문번호/품목 검색이 없었다. | 주문번호, 거래처 코드, 사업자번호, 품목명, 모델명, 비고 검색 |
| R2 상세 endpoint | 순수 `GET /api/v1/partner-orders/{id}` 상세 endpoint 는 없었다. audit/bootstrap 과 별개 응답이 필요했다. | 주문 헤더 + 라인 상세 DTO 추가 |

## 2. BE 변경

| 영역 | 변경 |
|---|---|
| Controller | `PartnerOrderListController` 에 4종 필터와 `GET /{id}` 상세 endpoint 추가 |
| Service | `PartnerOrderQueryService` 추가. 목록 Specification, 날짜 역전 보정, 주문번호/안전 path id/UUID 조회 지원 |
| Repository | `PartnerOrderRepository` 에 `JpaSpecificationExecutor` 추가 |
| DTO | `PartnerOrderListFilter`, `PartnerOrderSummaryResponse`, `PartnerOrderDetailResponse` 추가 |
| 오류 | `PARTNER_ORDER_NOT_FOUND` 404 catalog 추가 |
| IT | `PartnerOrderListIT` 6건, `PartnerOrderDetailIT` 4건 추가. 외부 client 전부 `@MockBean` 격리 |

## 3. FE 변경

| 영역 | 변경 |
|---|---|
| API client | `listPartnerOrders` 가 날짜/거래처/상태/검색어 params 를 전송 |
| 목록 화면 | 시작일, 종료일, 거래처, 상태, 검색어 필터 추가 |
| 상세 화면 | 안전 path id(`2026-05-17-1`) 로 이동하되 화면에는 원 주문번호(`2026/05/17-1`) 표시 |
| UUID 비공개 | 라인 DTO/화면 key 에 UUID 미사용 |
| 운영 라벨 | 상세 오류 안내와 묶음 처리 라벨을 한국어 운영 문구로 정리 |
| Playwright | `clients/desktop/playwright/sp-08-4-1-partner-order-list-detail/` 정적 계약 spec 추가 |

## 4. QA 스크린샷 7 → 4

| 파일 | 설명 |
|---|---|
| `01-list-filters.png` | 목록 + 기간/거래처/상태/검색어 4종 필터 |
| `02-filtered-results.png` | 기간 + 상태 + 거래처 + 품목 검색 적용 결과 |
| `03-detail-dialog.png` | 상세 헤더 + 거래처 + 라인 품목 |
| `04-empty-keyword.png` | 검색어 적용 후 빈 결과 안내 |

## 5. SP-08-3 시리즈 회고 회피

| 회고 항목 | 적용 |
|---|---|
| 저장 중 닫기 방지 | 본 작업은 read-only 상세 조회라 저장 dialog 없음 |
| 자동 포커스 | 신규 입력은 목록 필터이며 브라우저 기본 focus 흐름 유지 |
| mock state append | 본 작업은 저장 이력 append 없음 |
| code+message catalog | `PARTNER_ORDER_NOT_FOUND` 를 catalog 로 분리 |
| UUID 비공개 | 화면 표시와 mock PNG 에 내부 식별자 미표시 |
| 한국어 운영 라벨 | PNG와 화면 오류 안내에서 API/endpoint/enum literal 미표시 |

## 6. Verification table

| 검증 | 명령 | 실제 결과 |
|---|---|---|
| Spring targeted IT | `.\gradlew.bat :services:partner-order-service:test --tests "*PartnerOrderList*" --tests "*PartnerOrderDetail*" --no-daemon --rerun-tasks` | PASS, 10 tests, 0 failed, 0 skipped |
| Desktop typecheck | `npm run typecheck` | PASS |
| Desktop lint | `npm run lint` | PASS, 0 errors, 2 existing warnings |
| Desktop build | `npm run build` | FAIL, `electron-vite` config load 중 esbuild child process `spawn EPERM` |
| Playwright | `npx playwright test playwright/sp-08-4-1-partner-order-list-detail --reporter=line` | FAIL, runner process `spawn EPERM` |
| QA PNG | `.\scripts\generate-sp-08-4-1-partner-order-list-detail-screenshots.ps1` | PASS, PNG 4장 생성 |
| diff whitespace | `git diff --check` | Phase 7 최종 검증에서 기록 |

## 7. 예외 catalog

| code | HTTP | message | IT case |
|---|---:|---|---|
| `PARTNER_ORDER_NOT_FOUND` | 404 | 주문서를 찾을 수 없습니다. | `detail_not_found_returns_404_catalog_code`, `detail_soft_deleted_order_is_excluded` |

## 8. 검증 명령

```powershell
.\gradlew.bat :services:partner-order-service:test --tests "*PartnerOrderList*" --tests "*PartnerOrderDetail*" --no-daemon --rerun-tasks
cd clients\desktop; npm run typecheck; npm run lint; npm run build; cd ..\..
cd clients\desktop; npx playwright test playwright/sp-08-4-1-partner-order-list-detail --reporter=line; cd ..\..
.\scripts\generate-sp-08-4-1-partner-order-list-detail-screenshots.ps1
git diff --check
```

# P0-B 품목별 DPS 분석 — QA 시나리오 문서

> 슬라이스: P0-B GAS 보강 — legacy GAS 16번 (품목별 DPS 입고내역 비교) native 이식
> 대상 경로: `/warehouse/dps-compare/by-product`
> 권한: WAREHOUSE / MANAGER / MASTER
> 작성일: 2026-05-11
> 시나리오 수: TC-DBP 7건 (E2E) + DBP-FE 3건 (IT)

---

## Playwright E2E 시나리오 (TC-DBP)

스펙 파일: `clients/desktop/playwright/dps-by-product/dps-by-product.spec.ts`

### TC-DBP-1: toolbar 구성요소 노출 확인

**목적**: 페이지 진입 시 조회 조건 toolbar 전체 요소가 DOM에 노출되어야 한다.

**사전 조건**:
- VITE_MOCK_MODE=1 dev server 기동 (포트 5173)
- mockRole=WAREHOUSE 파라미터 사용

**절차**:
1. `/warehouse/dps-compare/by-product?mockRole=WAREHOUSE` 진입
2. `data-testid="dps-by-product-from"` 날짜 picker 가시성 확인
3. `data-testid="dps-by-product-to"` 날짜 picker 가시성 확인
4. `data-testid="dps-by-product-warehouse-select"` 창고 dropdown 가시성 확인
5. `data-testid="dps-by-product-query-button"` 조회 버튼 가시성 확인

**기대 결과**:
- 날짜 from/to input 2개 모두 visible
- 창고 dropdown visible (전체 포함 옵션)
- "조회" 버튼 visible
- `pageerror` 이벤트 0건

**스크린샷**: `docs/qa/p0-b-dps-by-product/TC-DBP-1-toolbar-visible.png`

---

### TC-DBP-2: 조회 실행 후 DataGrid 8 컬럼 및 mock row 확인

**목적**: "조회" 버튼 클릭 시 DataGrid가 8개 컬럼 헤더와 mock 데이터 행을 정상 렌더링해야 한다.

**사전 조건**: TC-DBP-1 통과

**절차**:
1. TC-DBP-1과 동일하게 페이지 진입
2. "조회" 버튼 클릭
3. `data-testid="dps-by-product-grid"` 내 컬럼 헤더 텍스트 확인
4. tbody 행 수 확인

**기대 결과**:
- 8개 컬럼 헤더 노출: 상품코드 / 상품명 / 입고대기 / 완료 / 품질검사 / 반품 / 합계 / DPS차이
- tbody 행 수 >= 0 (MOCK_MODE 데이터 행, 12행 기대)
- `pageerror` 이벤트 0건

**스크린샷**: `docs/qa/p0-b-dps-by-product/TC-DBP-2-datagrid-8-columns.png`

---

### TC-DBP-3: 음수 row 빨강 색상 렌더링 검증

**목적**: `returnQty` 또는 `diffFromDps` 가 음수인 행의 해당 셀이 빨강(#B91C1C)으로 표시되어야 한다.

**사전 조건**: 조회 결과에 returnQty < 0 또는 diffFromDps < 0 행 존재

**절차**:
1. 페이지 진입 후 "조회" 버튼 클릭
2. DOM에서 `style*="color: rgb(185, 28, 28)"` 또는 `style*="color: #B91C1C"` 속성 탐색
3. 해당 셀 텍스트가 "-" 로 시작하는지 확인

**기대 결과**:
- 음수 값 셀에 color #B91C1C 인라인 스타일 적용
- `DpsByProductPage` 의 `isNegative()` 함수 동작 확인
- `pageerror` 이벤트 0건

**비고**: Step-1에서 diffFromDps=0 고정이므로 returnQty 음수(CANCELED 행) 위주 검증

**스크린샷**: `docs/qa/p0-b-dps-by-product/TC-DBP-3-negative-row-red-color.png`

---

### TC-DBP-4: 열헤더 필터 (productName) → 결과 row 필터링

**목적**: "상품명" 컬럼 헤더 클릭 후 텍스트 입력 시 해당 텍스트 포함 행만 표시되어야 한다.

**사전 조건**: TC-DBP-2 통과 (DataGrid 데이터 로드 완료)

**절차**:
1. "조회" 버튼 클릭 후 DataGrid 로드 대기
2. 초기 행 수 기록
3. "상품명" 컬럼 헤더 클릭 → 필터 popover/input 표시 확인
4. "AJ040" 텍스트 입력 후 Enter
5. 필터 후 행 수 확인

**기대 결과**:
- 필터 후 행 수 <= 초기 행 수
- 필터된 행의 상품명에 "AJ040" 포함
- `pageerror` 이벤트 0건

**스크린샷**: `docs/qa/p0-b-dps-by-product/TC-DBP-4-column-filter-product-name.png`

---

### TC-DBP-5: Ctrl+C → clipboard TSV 형식 검증

**목적**: DataGrid 셀 선택 후 Ctrl+C 시 clipboard 내용이 TSV(탭+줄바꿈) 형식이어야 한다.
DataGrid PR #162 의 `enableCopy=true` 기능 회귀 가드.

**사전 조건**:
- TC-DBP-2 통과
- `context.grantPermissions(['clipboard-read', 'clipboard-write'])` 적용

**절차**:
1. "조회" 버튼 클릭 후 DataGrid 셀 표시 대기
2. 첫 번째 셀 클릭 후 Shift+클릭으로 범위 선택 (최대 6셀)
3. `Control+c` 키 입력
4. `navigator.clipboard.readText()` 로 clipboard 내용 읽기
5. TSV 형식 여부 확인

**기대 결과**:
- clipboard 내용에 `\t` 또는 `\n` 포함 (TSV 형식)
- `pageerror` 이벤트 0건

**스크린샷**: `docs/qa/p0-b-dps-by-product/TC-DBP-5-ctrl-c-clipboard-tsv.png`

---

### TC-DBP-6: 사이드바 "품목별 DPS 분석" NavLink 노출 확인

**목적**: WAREHOUSE 역할 사용자가 사이드바에서 "품목별 DPS 분석" 메뉴 링크를 볼 수 있어야 한다.

**사전 조건**: mockRole=WAREHOUSE 파라미터 사용

**절차**:
1. `/?mockRole=WAREHOUSE` 로 메인 페이지 진입
2. `data-testid="sidebar-warehouse-dps-by-product"` NavLink 탐색
3. href 값에 `/warehouse/dps-compare/by-product` 포함 여부 확인

**기대 결과**:
- NavLink DOM 존재 + visible
- NavLink 텍스트 "품목별 DPS 분석" 포함
- `pageerror` 이벤트 0건

**AppLayout 참조**: `canAccessDpsByProduct(role)` → WAREHOUSE / MANAGER / MASTER

**스크린샷**: `docs/qa/p0-b-dps-by-product/TC-DBP-6-sidebar-dps-by-product-navlink.png`

---

### TC-DBP-7: SALES mockRole → ForbiddenPage redirect

**목적**: SALES 역할은 `/warehouse/dps-compare/by-product` 진입 시 ForbiddenPage로 redirect 되어야 한다.

**사전 조건**: mockRole=SALES 파라미터 사용

**절차**:
1. `/warehouse/dps-compare/by-product?mockRole=SALES` 진입
2. ForbiddenPage 메시지 텍스트 탐색 ("권한이 없습니다" / "403" 등)
3. `data-testid="dps-by-product-query-button"` 조회 버튼 미노출 확인

**기대 결과**:
- ForbiddenPage 메시지 표시 또는 toolbar 미노출
- `data-testid="dps-by-product-query-button"` visible=false
- `pageerror` 이벤트 0건

**근거**: FE RoleGuard `allow={DPS_BY_PRODUCT_ROLES}` + BE `@PreAuthorize("hasAnyRole('MASTER','MANAGER','WAREHOUSE')")`

**스크린샷**: `docs/qa/p0-b-dps-by-product/TC-DBP-7-sales-role-forbidden.png`

---

## JUnit IT 시나리오 (DBP-FE)

스펙 파일: `services/inventory-service/src/test/java/com/samhanair/logis/inventory/it/DpsByProductFEMatchIT.java`

공통 설정:
- `extends AbstractPostgresIT` (Testcontainers PostgreSQL 16-alpine 싱글턴)
- `@MockBean` 외부 client 4종: ProductClient / AccountingClient / SlipClient / NotificationClient (lenient)
- `@Transactional` (트랜잭션 롤백)

---

### DBP-FE-1: GET 응답 schema 검증

**목적**: `GET /warehouse/audit/dps-compare/by-product` 응답이 FE `DpsByProductResponse` 인터페이스와 1:1 정합해야 한다.

**절차**:
1. `fromDate=2026-01-01`, `toDate=2026-12-31`, `X-User-Role=WAREHOUSE` 헤더로 GET 요청
2. HTTP 200 확인
3. 응답 body `.data.totalProductCount` (숫자) 존재 확인
4. 응답 body `.data.rows` (배열) 존재 확인
5. 응답 body `.data.generatedAt` (문자열) 존재 확인
6. rows[0] 에 8 필드 (productCode / productName / pendingQty / completedQty / qcQty / returnQty / totalQty / diffFromDps) 존재 확인
7. rows[0] 에 `productId` UUID 필드 미포함 확인 (피드백 uuid_no_user_visibility)
8. `totalProductCount == rows.size()` 일치 확인

**추가 검증 (DBP-FE-1-B~D)**:
- MANAGER 권한 → 200 + schema 정합
- SALES 권한 → 403
- 미인증 (헤더 없음) → 403

---

### DBP-FE-2: warehouseId 필터 파라미터 동작 검증

**목적**: `warehouseId` 파라미터 전달 시 400/500 오류 없이 200 + 정합 schema 응답.

**절차**:
1. `warehouseId=11111111-1111-1111-1111-000000000001` (HQ-001) 파라미터 포함 GET 요청
2. HTTP 200 + `.data.rows` 배열 응답 확인
3. `.data.totalProductCount == .data.rows.length()` 확인
4. VH-001 창고 필터 동일 패턴 반복 (DBP-FE-2-B)
5. warehouseId 없이 전체 조회 (DBP-FE-2-C) → 200 + 전체 창고 합산

**비고**: 실제 창고별 row 격리 단위 검증은 BE agent 의 `DpsByProductIT` 담당

---

### DBP-FE-3: 빈 기간(미래 날짜) → 0건 응답

**목적**: 데이터가 없는 미래 날짜 기간 조회 시 `totalProductCount=0, rows=[]` 응답.

**절차**:
1. `fromDate=2099-01-01`, `toDate=2099-12-31` 파라미터로 GET 요청
2. HTTP 200 + `.data.totalProductCount == 0` 확인
3. `.data.rows` 빈 배열 확인

**추가 검증 (DBP-FE-3-B)**:
- `fromDate=2026-12-31`, `toDate=2026-01-01` (날짜 역전) → 400 또는 200+[] (BE 정책에 따름)
- FE는 클라이언트 validation으로 "시작일이 종료일보다 늦을 수 없습니다." 오류 표시

---

## 위험 식별 및 대응

| 위험 | 가능성 | 대응 |
|------|--------|------|
| BE `GET /by-product` 엔드포인트 미완성 | 중 | IT에서 404 응답 시 BE agent 알림 |
| pivot 쿼리 warehouseId 필터 오류 | 중 | DBP-FE-2 IT로 400/500 가드 |
| FE MOCK_MODE 에서 DpsByProductPage 미등록 | 낮 | TC-DBP-1 soft warn + body 길이 검증 |
| DataGrid clipboard API 보안 컨텍스트 제한 | 중 | TC-DBP-5 clipboard.readText() try-catch + soft warn |
| returnQty 음수 변환 버그 (DB 양수 → DTO 양수 그대로) | 중 | domain-integrity-check.md 4-A SQL 교차 검증 |

---

## 관련 파일

- FE 페이지: `clients/desktop/src/renderer/routes/warehouse/DpsByProductPage.tsx`
- FE API: `clients/desktop/src/renderer/api/dpsByProductApi.ts`
- BE 응답 DTO: `services/inventory-service/src/main/java/com/samhanair/logis/inventory/web/dto/DpsByProductResponse.java`
- BE 행 DTO: `services/inventory-service/src/main/java/com/samhanair/logis/inventory/web/dto/DpsByProductRow.java`
- BE projection: `services/inventory-service/src/main/java/com/samhanair/logis/inventory/repository/DpsByProductPivotRow.java`
- BE pivot 쿼리: `services/inventory-service/src/main/java/com/samhanair/logis/inventory/repository/InboundInspectionLineRepository.java`
- AppLayout NavLink: `clients/desktop/src/renderer/components/AppLayout.tsx` (data-testid="sidebar-warehouse-dps-by-product")
- 라우터: `clients/desktop/src/renderer/routes/index.tsx` (path="/warehouse/dps-compare/by-product")

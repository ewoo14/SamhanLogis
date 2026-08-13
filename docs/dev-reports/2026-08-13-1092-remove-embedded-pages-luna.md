# 2026-08-13 #1092 판매 화면 내부 페이지 전수조사

## 결론

판매 계열 화면과 `components/sales`를 직접 열어 확인한 결과, 다른 메뉴 소관 내용을 끼운 내부 페이지는 2건이었다. 둘 다 현재 데이터 조회 유일 경로이므로 삭제하지 않았다. 유일 경로가 아닌 삭제 대상은 0건이며, 따라서 이번 라운드의 UI·라우트 삭제도 0건이다.

직전 라운드 결과인 견적서 관리의 `종합견적서`/`주문서` 2탭과 `출처` 칼럼은 유지했다.

## 1단계 전수 표

| 파일:줄번호 | 무엇을 보여주는지 | 어느 메뉴 소관 | 지울지/보존할지 |
|---|---|---|---|
| `clients/desktop/src/renderer/routes/EstimatePricingConfigPage.tsx:174–545` | `카테고리별 단가변동` 목록. 카테고리·적용일·인상 전 단가 기본값·저장을 표시하고 `/api/v1/products/admin/price-change-schedule`를 사용 | 제품 메뉴 `products.price-schedule` | 보존 — 유일 경로 |
| `clients/desktop/src/renderer/routes/EstimateListPage.tsx:162–220, 448–548, 714–752` + `clients/desktop/src/renderer/routes/estimateSourceSeparatedListModel.ts:83–160` | 견적 탭은 데스크톱 견적과 웹 종합견적 저장분, 주문서 탭은 웹 주문서 저장분을 출처별로 표시 | 종합견적서/주문서의 외부 웹 저장분 | 보존 — 직전 라운드 결과 및 유일 경로 |
| `clients/desktop/src/renderer/routes/WebEstimateSourceDetailPage.tsx:13–55` + `clients/desktop/src/renderer/routes/index.tsx:520,537` | 웹 종합견적서/웹 주문서 저장분 상세 | 외부 웹 종합견적서·웹 주문서 저장분 | 보존 — 유일 경로 |
| `clients/desktop/src/renderer/routes/SalesPartnerOrderListPage.tsx:423–447, 480–560` | 주문서 자체 목록, 삭제 문서 필터, 발행 실패 건수, 같은 거래처 주문 병합 진입 | 주문서 관리 | 보존 — 자기 메뉴 소관 |
| `clients/desktop/src/renderer/routes/SalesPartnerOrderDetailPage.tsx:1195–1293, 1426–1441` | 주문서 라인 목록 및 주문서 코멘트/협업 패널 | 주문서 관리 | 보존 — 자기 메뉴 소관 |
| `clients/desktop/src/renderer/routes/SalesPartnerOrderDetailPage.tsx:1456–1663` | 주문서 수정 모달과 주문 라인 편집 표 | 주문서 관리 | 보존 — 자기 메뉴 소관 |
| `clients/desktop/src/renderer/routes/SalesPartnerOrderDetailPage.tsx:1664–1704, 1877–1884` | 주문 라인 참조 조회·재고 조회 모달 | 주문서 관리 라인 보조 기능 | 보존 — 주문 라인 처리에 종속 |
| `clients/desktop/src/renderer/routes/SalesPartnerOrderDetailPage.tsx:1706–1872` | 창고 선택 및 전환수량을 포함한 판매전표 전환 표 | 주문서 관리의 전표 전환 기능 | 보존 — 주문서 전환 자체 |
| `clients/desktop/src/renderer/routes/SalesOrderApprovalsPage.tsx:278–316` | 장기미발주 판정으로 계산한 비밀번호 초기화 대상 미리보기/선택 목록 | 주문서 승인 | 보존 — 승인/접근관리 판정 보조 목록 |
| `clients/desktop/src/renderer/routes/SalesPartnerDcConfigPage.tsx:381–480` | 선택 거래처의 DC 변경 이력·필드별 감사 오버레이 | 거래처 DC 설정 | 보존 — 현재 DC 행의 이력 |
| `clients/desktop/src/renderer/routes/EstimatePricingConfigPage.tsx:334–443` | 견적 하단 문구·옵션 기본값 전역 설정 | 견적 가격 설정 | 보존 — 자기 메뉴 소관 |
| `clients/desktop/src/renderer/routes/EstimateDetailPage.tsx:703–823` | 견적 자체 라인 상세와 견적 협업 패널 | 종합견적서 상세 | 보존 — 자기 문서 소관 |
| `clients/desktop/src/renderer/routes/EstimateFormPage.tsx:1834–1872, 2571` | 견적 라인 편집 및 품목/라인 참조 조회 | 종합견적서 작성·편집 | 보존 — 자기 문서 작성 기능 |

렌더되지 않는 과거 `unifiedColumns`/`estimateUnifiedListModel` 코드 잔재는 내부 페이지가 아니므로 삭제하지 않았다. 현재 화면에는 `estimate-list-unified-toggle`와 `estimate-unified-list-table`가 없다.

## 2단계 보류: 유일 경로 2건

### A. 카테고리별 단가변동

`products.price-schedule` 전용 권한과 API는 존재하지만 별도 `/products/price-schedule` 라우트나 제품 화면 컴포넌트는 검색되지 않았다. 실제 라우트는 `routes/index.tsx:550–563`의 `/sales/estimate-config`이며, `EstimatePricingConfigPage.priceSchedule.test.tsx:339–347`도 `sales.estimate-config` 없이 `products.price-schedule`만 가진 사용자가 이 화면에서 단가변동 섹션을 보는 계약을 검증한다.

선택지:

- **지운다**: 제품 단가변동을 볼 화면과 저장 진입점이 사라진다.
- **다른 곳으로 옮긴다**: 제품 메뉴에 별도 라우트를 먼저 만들어야 하며, 이동 전까지는 데이터 접근 공백과 라우트/권한 변경이 생긴다.
- **그대로 둔다**: `/sales/estimate-config` 안에 제품 메뉴 소관 섹션이 남는다. 현재 데이터 접근은 보존된다.

### B. 웹 저장분 상세

`EstimateListPage`의 현재 2탭은 `mergeEstimateRows`/`mergeOrderRows`로 출처를 분리한다. 웹 종합견적 행은 `/sales/estimates/web-snapshots/:id`, 웹 주문서 행은 `/sales/partner-orders/web-drafts/:id`로만 이동하며 `routes/index.tsx:520,537`에서 `WebEstimateSourceDetailPage`가 연결된다. 별도 웹 저장분 목록/상세 라우트는 없고, `EstimateListPage.test.tsx:336–376` 및 `estimateSourceSeparatedListModel.test.ts:51–76`가 이 조회 경로를 검증한다.

선택지:

- **지운다**: 외부 웹에서 저장된 기존 종합견적서·주문서 저장분을 데스크톱에서 조회할 수 없다.
- **다른 곳으로 옮긴다**: 별도 웹 저장분 메뉴/라우트와 링크를 먼저 만들어야 하며, 이동 전까지 기존 저장분 조회 공백이 생긴다.
- **그대로 둔다**: 각 저장분은 자기 탭과 출처 칼럼으로 보이며, 기존 데이터 접근과 기존 행 호환을 보존한다.

## 시도한 검색 패턴

`통합`, `unified`, `출처`, `source`, `소스`, `주문서`, `견적서`, `종합견적`, `목록 보기`, `전체 보기`, `다른`, `관련`, `탭`, `tab`, `panel`, `drawer`, `modal`, `toggle`, `checkbox`, `partner.?order`, `order.?approval`, `partner.?dc`, `estimate.?config`, `estimate`, `sales`, `SalesPartnerOrder`, `SalesOrderApprovals`, `SalesPartnerDc`, `Estimate`, `sales/partner-orders`, `sales/order-approvals`, `sales/partner-dc-config`, `sales/estimate-config`, `price-change-schedule`, `PriceSchedule`, `단가변동`, `products/price-schedule`, `products.price-schedule`, `web-snapshots`, `web-drafts`, `WebEstimateSourceDetailPage`, `웹 종합견적`, `웹 주문서`, `path:.*sales`, `path="/sales`, `to="/sales`, `navigate(.*/sales`.

패턴 검색만으로 결론내리지 않고 다음 파일을 직접 열었다: `EstimateListPage.tsx`, `EstimateDetailPage.tsx`, `EstimateFormPage.tsx`, `WebEstimateSourceDetailPage.tsx`, `SalesPartnerOrderListPage.tsx`, `SalesPartnerOrderDetailPage.tsx`, `SalesOrderApprovalsPage.tsx`, `SalesPartnerDcConfigPage.tsx`, `EstimatePricingConfigPage.tsx`, `SalesSubNav.tsx`, `routes/index.tsx`, `components/AppLayout.tsx`.

## 기능 삭제 기록

이번 라운드의 유일 경로가 아닌 삭제 대상은 0건이다. 따라서 기능을 삭제하거나 다른 곳으로 이동한 항목도 0건이며, 죽은 링크·라우트를 새로 만들지 않았다.

## RED-first 기록

삭제 대상이 0건이므로 삭제 전 RED 테스트를 작성할 대상이 없었다. 기존 계약 테스트에서 다음을 확인했다.

- `EstimateListPage.test.tsx`: 통합 목록 토글/통합 표가 없고, 두 탭과 출처별 조회가 유지된다.
- `estimateSourceSeparatedListModel.test.ts`: 견적 행은 주문서 탭에 섞이지 않고, 주문서 행은 견적 탭에 섞이지 않으며, 웹 저장분 상세 경로가 UUID 없이 유지된다.
- `EstimatePricingConfigPage.priceSchedule.test.tsx`: `products.price-schedule` 권한이 없는 경우 섹션을 숨기고, 해당 권한만 있는 경우 단가변동 섹션을 제공한다.

따라서 이번 라운드에는 RED→GREEN 삭제 사이클을 수행하지 않았다. 삭제를 보류한 두 항목을 억지로 제거하는 테스트는 데이터 유실 불변식에 반한다.

## 검증

### 판매 관련 테스트

실행: `npx vitest run src/renderer/routes/EstimateListPage.test.tsx src/renderer/routes/estimateSourceSeparatedListModel.test.ts src/renderer/routes/EstimatePricingConfigPage.test.ts src/renderer/routes/EstimatePricingConfigPage.priceSchedule.test.tsx src/renderer/routes/SalesPartnerOrderListPage.test.tsx src/renderer/routes/SalesOrderApprovalsPage.test.tsx --reporter=verbose`

결과: **6개 파일 / 35개 테스트 통과**.

### desktop Vitest 5개 미통과

`npm test -- --reporter=verbose`는 Vitest 전에 `pretest`가 실패하여 중단됐다. 선행 실패는 `estimateSourceSeparatedListModel.ts:94:14`의 `requesterName` raw actor display read다.

`npx vitest run --reporter=verbose`에서는 다음 5건이 실패했다.

1. `src/renderer/routes/CashReceiptListPage.test.tsx` — `@testing-library/jest-dom/vitest` import 해석 실패
2. `src/renderer/routes/SalesCommissionSettlementDetailPage.test.tsx` — 같은 import 해석 실패
3. `src/renderer/routes/SalesCommissionSettlementListPage.test.tsx` — 같은 import 해석 실패
4. `src/main/build-output-cjs-interop.test.ts` — `out/main/index.js` 미생성
5. `src/renderer/api/mock.test.ts` — `EstimateListPage.test.tsx`의 `데스크톱-견적-1`, `estimateSourceSeparatedListModel.test.ts`의 `Q-2026-001`이 문서번호 계약을 위반

`git diff --name-status origin/main...HEAD`와 대상 테스트 파일 비교에서 1–4번 테스트 파일은 branch에서 변경되지 않았고, 4번은 로컬 build 산출물 부재다. 따라서 1–4번은 **origin/main 공통/환경 공통 실패로 판정**한다. 5번은 이번 트랙에서 추가된 견적 fixture 파일이 현재 mock census에 포함되어 발생한 **본 트랙 회귀**로 판정한다.

origin/main 동일 테스트 실행은 시도했으나, 별도 `git archive` 비교본이 ① 전체 archive는 120초 timeout, ② 최소 archive는 `@samhan/design-system`/worktree 경로 해석에서 Vitest 기동 전 실패했다. 그러므로 origin/main에서 5건을 끝까지 실행했다고 보고하지 않는다.

### typecheck

실행: `npm run typecheck`

못 했다. `clients/web/design-system/dist/index.d.ts`가 없어 `real-qa-scope.cjs --phase=typecheck` 단계에서 중단됐다. 이후 TypeScript 검사까지 도달하지 못했으므로 `productApi`·`AccountTreePage`·`SlipFormPage` 오류 여부는 이번 실행에서 확인하지 못했다.

### 못 한 검증

- origin/main에서 동일 Vitest 5개를 끝까지 실행하는 비교: 비교본 의존 경로 문제로 못 했다.
- desktop 전체 Vitest의 정상 완료: 위 5개 실패로 완료하지 못했다.
- `npm run typecheck`: design-system dist 부재로 못 했다.
- 공유 DB 및 Docker 기반 검증: 사용자 지시대로 수행하지 않았다.

## 라운드 종료 점검

삭제된 추적 파일 없음. 특히 `tools/.s24-build-only/build/deep/tracked-writer.mjs`는 삭제하지 않았다. `docs/qa` 아래 드라이버 스크립트도 만들거나 삭제하지 않았다.

# 품목관리 고도화 — 시드 전용 정책 반영 + 세트 컬럼 + 구성품 편집기 + 표시 순서 직접 조정

> 2026-06-11 새벽 개발책임자 지시 (원문 메모리 [[item-exposure-and-menu-5cat]] §1-보강):
> "구글 시트는 첫 시드 데이터고 추후 조회하지 않는데? 세트인지 아닌지 여부도 알아야하고 출처는 굳이 필요 없잖아.
> 세트인 품목은 해당 품목 상세에서 구성품 설정이 가능한지도 알고 싶고, 세트 품목을 전표에 넣으면 바로 구성품 자동 전개가 되는지도."
>
> 결정 (AskUserQuestion 확정): 본 슬라이스 우선 진행 / 시트 sync 메뉴는 비상 수단 유지 + UI 정리 + **자동 cron 비활성**.

## 0. 정찰 사실

| 항목 | 현황 |
|---|---|
| 세트 마커 | `Product.productType = BUNDLE` 기성 — 품목관리 화면 미표시 |
| 전표 자동 전개 | **기성** (#439) — SlipFormPage BUNDLE → `POST /products/internal/expand` 자동 전개 (BundleExpander 구성품·6:4 재배분·setHead); R17에서 과거 `BundleOptionRow` 옵션 행은 제거 |
| 구성품 편집 | **부재** — BundleComponent 는 시트 sync/시더 적재 전용, CRUD API/화면 없음 (web 레이어 참조는 EstimateCatalogInternalController 벌크 read 뿐) |
| 표시 순서 | displayOrder 는 sync 적재 전용 — 화면 직접 조정 수단 없음. @dnd-kit/sortable 의존성 기성 (desktop) |
| 출처 뱃지 | #460 에서 추가한 '시트자동/수동' 뱃지·'시트 자동 복귀' 버튼 — 시드 전용 정책으로 무의미화 |

## 1. BE (product-service)

### 1a. 자동 cron 비활성
- ProductSheetSyncService 스케줄을 property 게이트로 전환: `samhan.product.sheet-sync.cron-enabled` 기본 **false** (@ConditionalOnProperty 또는 스케줄 메서드 내 가드 — 기존 패턴 따름). 수동 트리거(시트 동기화 메뉴 API)는 유지 — Javadoc 에 "시드 재적재 비상 수단" 명시.
- manual 보존 가드·evictRowHash 는 유지 (비상 재적재 시에도 수동 설정 보호 — #460 자산).

### 1b. 세트 정보 노출
- catalog 목록 응답(ProductCatalogResponse)에 `productType` + `componentCount`(활성 구성품 수 — BUNDLE 외 0) 추가. N+1 방지: 목록 조회 시 BundleComponentRepository 벌크 count (parentModelCode IN) 후 매핑.

### 1c. 구성품 CRUD (BUNDLE 전용)
- `GET /api/v1/products/{modelCode}/components` — 구성품 목록 (구성 모델코드/명칭/수량/순서/옵션 메타 — **BundleComponent 엔티티 실 필드를 읽고 결정**). 권한: products.list VIEW.
- `PUT /api/v1/products/{modelCode}/components` — **replace-all** (#459 계좌 패턴: 배열 index=순서, 검증 후 전량 교체). 권한: products.admin UPDATE + deny IT. 대상이 BUNDLE 아니면 409. 구성 모델코드가 활성 품목으로 해소되는지 검증 (BundleExpander 정합 점검 로직/BundleIntegrity 재사용).
- 전개 캐시/파생 무효화 필요 여부 확인 (BundleExpander 가 캐시를 두는지 — 두면 evict).

### 1d. 표시 순서 직접 조정
- `PUT /api/v1/products/display-orders` — body `[{modelCode, displayOrder}]` 일괄 갱신 (드래그 후 저장 1콜). 권한: products.admin UPDATE + deny IT. 도메인 메서드 changeDisplayOrder 재사용.
- sync displayOrder 의 보존 가드는 **불요** (시드 전용 — 비상 재적재 시 시트 기준 재시드가 의도 동작. Javadoc 명시).

## 2. FE (desktop, ProductCatalogPage 중심)

- **출처 컬럼·뱃지·'시트 자동 복귀' 버튼 제거** (usage 토글·수동 마킹은 유지 — manual 플래그는 내부 동작).
- **세트 컬럼**: BUNDLE 뱃지 + 구성품 수 (예: "세트 · 5"). 일반 품목은 — 표시.
- **구성품 편집 모달**: BUNDLE 행 '구성품' 버튼 → 모달 (현 구성 목록 + 행 추가(품목 검색 — 기존 q 검색 재사용)/삭제/수량/순서, replace-all 저장). products.admin 게이트, mock 동형 + 경로 선점 순서 주의.
- **표시 순서 조정**: @dnd-kit/sortable 행 드래그 (페이지 내 정렬 → '순서 저장' 버튼 일괄 PUT). 권한 게이트. 검색/필터 활성 시 드래그 비활성 (전체 목록 기준에서만 — 부분 목록 드래그는 순서 모호).
- mock: components GET/PUT·display-orders PUT 핸들러 + 세트 시드 (BUNDLE 1종 + 구성품) — BE 계약 1:1.
- Playwright TC: 세트 컬럼 렌더 / 구성품 편집 왕복 / 순서 드래그 저장 / 권한 비활성. 기존 출처 뱃지 단언 제거·갱신.

## 2-1. 추가 지시 (2026-06-11 새벽 2차 — 구현 중 수신, 사이클 fix 단계 반영)

> "재고의 경우 세트 단위로는 재고 표시하면 안됨 주의. 표시 순서도 수정할 수 있게 하되 수정시 다른 관련 품목의 표시 순서도 자동 갱신되어야함"

1. **세트 재고 표시 금지**: 재고는 구성품(시리얼) 단위에만 존재 — 세트(BUNDLE)는 재고 수치 표시 불가.
   - 감사: 재고조회 모달(2.6d)·전표 폼 가용재고·재고 화면에서 BUNDLE 품목이 재고 조회 대상으로 노출되는 경로 전수 grep.
   - 가드: BUNDLE 품목 재고조회 진입 시 수치 대신 "세트 품목 — 재고는 구성품 단위" 안내 (FE) + (BE 가 세트 재고를 합성 반환하는 경로가 있으면 차단). 품목관리 화면에는 재고 컬럼 자체를 두지 않음.
2. **표시 순서 자동 갱신 시멘틱 확정**: 이동 시 영향 행 **자동 재번호** (개별 번호 직접 입력으로 충돌 나는 모델 금지). **재번호 범위 = 동일 카테고리(productCategory/시트 탭) 품목군** — display_order 소비처(findExposedCatalog 등)가 카테고리 내 정렬이므로 전역 재번호 금지. BE display-orders 일괄 PUT 은 요청 항목들이 동일 카테고리인지 검증(혼합 시 400) 권장.

## 2-2. 3차 지시 (2026-06-11 새벽 — 구현 중 수신, 정합 pass 반영)

> "종합견적서 및 주문서 표시가 체크된 경우에만 표시순서를 표시하며, 품목뿐 아니라 모든 설정이 전표처럼 실시간표시 되기를 원함. 즉 누군가 설정을 수정하면 그 수정이 그대로 같은 화면을 보는 타인에게도 표시"

1. **표시순서 조건부 표시**: displayOrder 컬럼·드래그 정렬은 **견적/주문 노출 체크 품목(usageScope ≠ NONE)에만** 표시·적용. NONE 품목은 '—' + 정렬 대상 제외.
2. **설정 실시간 동기화 (전표 패턴)**: 기성 자산 재사용 — BE `ProductRealtimeBroker`(shared RealtimePublishHook, SP-D7) 에 품목 설정 mutation(usage PATCH/DELETE·components PUT·display-orders PUT) 이벤트 publish + FE `SlipRealtimeClient` 패턴 복제(ProductRealtimeClient)로 ProductCatalogPage SSE 구독 → 수신 시 react-query invalidate → 동시 시청자 화면 실시간 갱신.
3. **전사 일반화는 후속 슬라이스**: "모든 설정 화면" (공급자 설정 등) 실시간 전파는 본 슬라이스에서 패턴 확립 후 별도 슬라이스로 수평 전개 — 메모리 박제.

## 3. QA (Docker 실서버)

- T1 세트 컬럼 + 구성품 수 실표시 / T2 구성품 편집 왕복 → DB 실증 → **전표 폼 전개에 편집 반영** (핵심: 구성 변경 후 SlipFormPage 전개 라인이 새 구성으로) / T3 순서 드래그 저장 → DB + 견적 카탈로그/품목 목록 순서 반영 / T4 cron 비활성 확인 (로그) + 수동 sync 메뉴 동작 유지 / T5 권한 deny / T6 비-BUNDLE 구성품 PUT 409.

## 4. 비스코프
- order-app 카테고리 탭 노출 정책 (개발책임자 확인 대기 ①) / 메뉴 5대분류 (§2) / 사원 서명 등록 (다음 슬라이스로 순연).

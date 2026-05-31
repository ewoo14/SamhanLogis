# 슬라이스 AC-2 — 품목 자동완성 (마스터데이터 자동완성 ②/3)

- **작성일**: 2026-05-31
- **상태**: 설계 확정 (개발책임자 승인 2026-05-31)
- **유형**: FE 단독 (design-system 신규 컴포넌트 + LineRow slot + desktop SlipFormPage 배선)
- **선행**: AC-1 창고 자동완성(#331 `cba2bfe6`) — WarehouseAutocomplete(AccountCodeSelect idiom). DECISIONS D-AC-01~03.
- **이니셔티브**: 마스터데이터 자동완성(거래처/창고/품목) ②. AC-3 거래처 후속.
- **관련 메모리**: [[feedback_uuid_no_user_visibility]], [[feedback_no_fake_data_ever]]

---

## 1. 배경 / 목표

전표 작성(`SlipFormPage`)의 품목 라인은 **modelName 텍스트 입력 + onBlur 정확매칭 lookup**(`GET /slips/lookup-product?modelName=`) 방식이라, 정확한 모델명을 알아야 하고 부분입력 검색이 안 된다(없으면 "해당 모델명을 찾을 수 없습니다").

→ **부분입력 서버검색 autocomplete**(`ProductAutocomplete`)로 교체. 모델명/품목명 부분입력 → 후보 → 선택 → productId/modelName/productName/단가 자동 채움.

AC-1 `WarehouseAutocomplete` 와 차이: **품목은 다수**라 client 측 소량 필터가 아닌 **서버 검색**(debounced). 백엔드 `GET /products?q=`(name/model_name LIKE, 페이지네이션)가 **이미 존재** → FE 전용(백엔드 무변경).

## 2. 결정

| # | 결정 | 근거 |
|---|---|---|
| D-AC2-01 | **서버검색형 `ProductAutocomplete`** — design-system 은 API 비의존, 호출자가 `searchProducts: (q)=>Promise<ProductOption[]>` 주입(debounce 호출자 책임). | product 다수 → 서버검색 필수. design-system 순수성 유지(WarehouseSelector 가 warehouses[] 받는 것과 동형, async 버전). |
| D-AC2-02 | **검색 소스 = product-service `GET /products?q=`**(name/model_name LIKE, 기존). desktop `searchProducts(q)` api fn 신설(order-app 도 `/products` 사용하므로 접근 가능). **백엔드 무변경**. | q 검색 기존재. 슬립 lookup-product(정확매칭 onBlur)는 별개 경로로 보존. |
| D-AC2-03 | **LineRow 에 optional 모델셀 render-prop slot 추가**(미제공 시 기존 modelName `<input>` 유지). SlipFormPage 만 ProductAutocomplete 주입. | 공유 `LineRow` 의 타 소비자(견적 등) 회귀 격리(backward compatible). |
| D-AC2-04 | 적용 = **SlipFormPage 만**. API/표시 비즈니스 식별자(modelName/productName), 내부 productId. | AC-1 정합(1폼 스코프). 타 품목 폼·견적/주문 후속. |

### 제외
- AC-3 거래처 자동완성.
- 견적/주문 등 다른 품목 입력 폼(후속).
- 백엔드 변경(q 검색 기존재). 옵션 정액/스펙 입력 변경.

## 3. 변경 단위

### 3.1 design-system — 신규 `ProductAutocomplete`

`clients/web/design-system/src/components/ProductAutocomplete/`:
- **props**: `value: ProductOption | null`(선택 품목), `onChange: (product: ProductOption | null) => void`, **`searchProducts: (query: string) => Promise<ProductOption[]>`**(비동기 검색 소스 주입), `label?`, `placeholder?`, `required?`, `error?`, `disabled?`, `minChars?`(기본 1), `debounceMs?`(기본 250).
- **`ProductOption`**: `{ id: string; modelName: string; productName: string; sellingPrice?: number }`. design-system export.
- **UX**(AC-1 idiom + async): 입력 → debounce → `searchProducts(q)` → 후보 listbox("modelName · productName"), 키보드 ↑↓/Enter/클릭/blur 선택. **로딩/빈("검색 결과 없음")/에러** 상태 표시. 선택 시 입력란 modelName 표시. minChars 미만 입력 시 검색 안 함(안내). FormField(label/required/error) 통합. role=combobox/listbox 접근성. 경합 방지(stale 응답 무시 — 최신 query만 반영).
- Storybook story(mock async searchProducts: 검색/로딩/빈/에러/선택).
- `index.ts` export.

### 3.2 design-system — `LineRow` 모델셀 slot

`LineRow.tsx`: optional prop `modelCell?: ReactNode` 추가. 제공 시 모델명 `<input>` 위치에 `modelCell` 렌더, 미제공 시 **기존 input + onModelNameChange/onModelNameBlur 동작 그대로**(backward compatible). 에러/스피너 표시 로직은 유지(modelCell 사용 시 호출자가 자체 처리). 타 LineRow 소비자 무변경.

### 3.3 desktop — searchProducts + SlipFormPage

- **`searchProducts(q)`** api fn(예 `clients/desktop/src/renderer/api/productApi.ts` 또는 기존 모듈): `GET /products?q={q}&size=20` → `ProductSummaryResponse[]` → `ProductOption[]` 매핑(id/modelName/productName=name/sellingPrice). 실패 시 빈 배열(graceful).
- **SlipFormPage**: 각 라인의 modelName 입력을 `LineRow.modelCell` 로 `<ProductAutocomplete searchProducts={debouncedSearch} value=... onChange=...>` 주입. onChange → `updateLine(productId, modelName, productName, unitPrice=sellingPrice fill)`. 기존 `handleModelNameBlur`/`/slips/lookup-product` 경로는 modelCell 사용 라인에서 미사용(제거 또는 비활성). debounce 는 desktop 측(또는 컴포넌트 debounceMs).
- mock.ts: Playwright 용 `GET /products?q=` mock 핸들러 추가(검색 결과).

## 4. 흐름
```
SlipFormPage 라인 → ProductAutocomplete(modelCell)
  입력 "AC10" → debounce → searchProducts("AC10") → GET /products?q=AC10&size=20
  → 후보["AC100CNCDEH-76 · 삼성 천장형 3톤", ...] → 선택
  → onChange(product) → updateLine: productId/modelName/productName/unitPrice(sellingPrice)
```

## 5. 테스트
- design-system 단위/스토리: debounce, async 검색(mock), 키보드 네비, 로딩/빈/에러, stale 응답 무시, required 에러.
- LineRow: modelCell 제공 시 slot 렌더 / 미제공 시 기존 input 회귀.
- desktop: typecheck/lint 0. Playwright(전표 작성: 품목 부분입력→후보→선택→productId/단가 fill, mock /products?q=).
- **Docker 실 QA**: 실 전표 작성 화면 품목 부분입력→실 검색 후보→선택→채움 실 캡처([[feedback_no_fake_data_ever]]).

## 6. 마이그레이션 / 배포
- 백엔드/Flyway 무관. design-system + desktop 빌드.

## 7. 미해결 / 후속
- AC-3 거래처 자동완성(명/코드/정보).
- 견적/주문 등 다른 품목 입력 폼 autocomplete 전환.
- 공용 typeahead 추출(AccountCodeSelect/Warehouse/Product/Partner Autocomplete 공통부) — AC-3 완료 후 재평가. ProductAutocomplete(async) vs WarehouseAutocomplete(sync) 변형 통합 검토.

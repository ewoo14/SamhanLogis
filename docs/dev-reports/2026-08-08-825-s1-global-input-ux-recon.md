# #825 + #896 S1 전역 입력 UX 정찰

> 정찰일: 2026-08-08
> 기준 트리: `7f7f8501a` (`#1078` merge commit, 현재 브랜치 `feat/825-global-input-ux`의 ancestor)
> 작업 제한: 소스 수정·commit/push·컨테이너·라이브 QA 없음. 이 보고서만 새로 작성했다.

## 0. 결론

1. `#1078`의 **화면 코드를 정본으로 삼는 것은 부정확**하다. `#1078`은 이미 공용화된 `ProductAutocomplete`를 견적 라인에 연결한 소비처다. 모달 원형은 `#1050`(`5ea18844c`), 표 형태와 1건 자동확정 강화는 `#1063`(`59277c728`)에서 들어왔다.
2. 정본 후보는 화면 전용 코드가 아니라 design-system의 `SearchResultSelectionModal` + `AsyncAutocomplete` 계약이다. 공용 모달 자체는 `single`/`multiple`을 모두 지원한다. 다만 `#1078` 견적 라인은 `single`만 사용한다.
3. `#825` 이슈 본문의 “Modal/dialog 0건”은 2026-07-24의 과거값이다. 현재 `AsyncAutocomplete.tsx`에는 모달 JSX 1건, `MultiSelectAutocomplete.tsx`에는 직접 JSX 0건이지만 `AsyncAutocomplete`로 모달 props를 전달하는 경로가 있다.
4. “전 메뉴 롤아웃”은 끝나지 않았다. 품목 축은 공용 wrapper 기본값으로 모달화됐지만, 거래처 17개 JSX 소비처 중 모달 opt-in은 1개뿐이다. 창고 6개는 별도 동기식 dropdown 구현이고, 복수선택 소비처 일부도 2건 이상에서 여전히 dropdown이다.
5. `#896`은 DB/API와 주문 앱 S-03 shadow 관측까지 이미 존재한다. 그러나 견적서·주문서 실제 수량은 여전히 하드코딩 20계열이 결정한다. 칩 관리 UI와 실제 evaluator 전환은 없다.
6. `#1114`에서 흡수된 **리모컨/실외기 표기 축은 이 정찰 및 제안 범위에서 제외**한다. 식별자·백엔드·레거시는 “리모컨”, 프런트만 “실외기”라는 사실만 기록하며 어느 쪽이 정본인지 판단하지 않는다.

## 1. `#1078` 모달 재사용 가능성 판정

### 1.1 실제 구현 위치와 provenance

| 층 | 위치 | 실측 |
|---|---|---|
| 공용 모달 | `clients/web/design-system/src/components/SearchResultSelectionModal/SearchResultSelectionModal.tsx:6-25,28-127` | generic `<T>`, `single \| multiple`, 표/목록 렌더, 취소/일괄확정 |
| 공용 검색 제어 | `clients/web/design-system/src/components/AsyncAutocomplete/AsyncAutocomplete.tsx:79-90,337-375,790-807` | 2건 이상이면 모달 open, 1건 자동확정 opt-in, 확정 결과 분기 |
| 복수 칩 조합 | `clients/web/design-system/src/components/MultiSelectAutocomplete/MultiSelectAutocomplete.tsx:23-75,198-221` | 선택 배열·칩을 소유하고 공용 Async에 `multiple` 결과를 전달 가능 |
| 품목 wrapper | `clients/web/design-system/src/components/ProductAutocomplete/ProductAutocomplete.tsx:132-155,157-203,206-251` | 단수 품목은 기본 `single`, 일괄 품목은 `multiple` |
| `#1078` 소비처 | `clients/desktop/src/renderer/routes/EstimateFormPage.tsx:1107-1128,2184-2213` | 부분검색 adapter + `ProductAutocomplete`, 명시적 `single` |
| Chromium 단정 | `clients/desktop/playwright/1062-line-input-ux/1062-line-input-ux.spec.ts:11-38` | 2건+ 표 모달, 4개 비즈니스 열, UUID 미노출, 1건 즉시확정 |

`git blame` 기준 공용 모달과 `AsyncAutocomplete`의 2건+ 분기는 `#1050` merge `5ea18844c`에서 생성됐다. 표 열과 품목 1건 자동확정 계약은 `#1063` merge `59277c728`에서 보강됐다. `#1078`은 이를 견적 라인에 연결했다.

따라서 판정은 다음과 같다.

- **정본 후보로 적합:** `SearchResultSelectionModal` + `AsyncAutocomplete`의 공용 계약.
- **품목 표 표현의 정본 후보로 적합:** `ProductAutocomplete`의 `productResultColumns`.
- **전역 정본으로 부적합:** `EstimateFormPage`의 검색 fallback·coedit·라인 갱신 코드는 견적 화면 전용이다.
- 개발책임자의 “`#1078`이 같은 규칙을 구현했다”는 기능 관점에서는 맞지만, **구현 provenance와 재사용 단위는 `#1050/#1063` 공용 컴포넌트**라는 보정이 필요하다.

### 1.2 단수/복수 지원

- 공용 모달은 `SearchResultSelectionMode = 'single' | 'multiple'`이다(`SearchResultSelectionModal.tsx:6`).
- 단수는 radio 하나로 수렴하고(`:45-53,92-98`), 복수는 checkbox 집합으로 확정한다(`:56-58,113-121`).
- `AsyncAutocomplete`는 단수면 첫 확정값을 `pick`, 복수면 `onResultsConfirmed(items)`로 넘긴다(`AsyncAutocomplete.tsx:801-804`).
- `MultiSelectAutocomplete`는 복수 확정 결과를 `options.forEach(add)`로 칩 배열에 누적한다(`MultiSelectAutocomplete.tsx:216-220`).
- `#1078` 견적 라인은 `resultSelectionMode="single"`이므로 **그 화면 자체는 복수선택을 지원하지 않는다**(`EstimateFormPage.tsx:2208`). 이는 “라인 품목 하나”라는 단수 강제 규칙과 일치한다.

### 1.3 다른 필드에 재사용할 때 필요한 것

| 축 | 필요한 일 |
|---|---|
| 거래처 | `PartnerAutocomplete`에 이미 `resultSelectionMode` passthrough가 있다(`PartnerAutocomplete.tsx:61-64`). 각 소비처의 단수/복수 규칙을 확정하고 opt-in한다. 거래처명·코드·사업자번호 열 정의를 공용 wrapper에 두어야 한다. |
| 수신자/담당자 | 이미 `MultiSelectAutocomplete` 소비 선례가 있다. `employeeCode` 등 사람에게 읽히는 코드를 option renderer/표 열로 주입하고, 문서별 단수/복수 규칙을 넘긴다. |
| 창고 | 현재 `WarehouseAutocomplete`는 `AsyncAutocomplete`를 쓰지 않는 별도 동기식 구현이다. 공용 modal 계약을 직접 이식하거나 Async 기반 wrapper로 옮겨야 한다. 창고는 전부 단수다. |
| 문서 참조 | `DocumentReferencePicker`도 자체 async dropdown이다. 공용 primitive로 옮길지 별도 opt-in을 붙일지 결정해야 한다. 값은 단수다. |
| 복수 칩 소비처 | `resultSelectionMode="multiple"`와 1건 자동확정 여부를 명시하고, 이미 선택된 opaque key 제외·최대 개수·일괄확정 후 delta add를 검증한다. |

### 1.4 UUID 비공개

- `ProductOption.id`는 “내부 사용 전용, 화면 미노출” 계약이다(`ProductAutocomplete.tsx:18-24`).
- `getKey={(product) => product.id}`는 React key/선택 동일성에만 쓰인다(`ProductAutocomplete.tsx:172-176`). 공용 props도 key가 DOM/ARIA id에 쓰이지 않는다고 명시한다(`AsyncAutocomplete.tsx:43-46`).
- 품목 모달 표는 모델명·품목명·규격·단가만 렌더한다(`ProductAutocomplete.tsx:132-155`).
- radio/checkbox의 접근성 이름도 `getInputLabel`, 즉 모델명이다(`SearchResultSelectionModal.tsx:92-100`).
- Playwright는 UUID fixture 문자열이 dialog text에 없음을 직접 단정한다(`1062-line-input-ux.spec.ts:27-30`).

## 2. 공유 컴포넌트 현황

### 2.1 2건 이상 동작

| 컴포넌트 | `resultSelectionMode` 미지정 | `single` 지정 | `multiple` 지정 |
|---|---|---|---|
| `AsyncAutocomplete` | 2건+를 기존 inline dropdown에 표시 | 2건+ 공용 모달, radio 단수확정 | 2건+ 공용 모달, checkbox 복수확정 |
| `MultiSelectAutocomplete` | 검색 결과는 inline dropdown, 한 건씩 add 후 칩 누적 | 기술적으로 전달 가능하나 복수 selected 모델과 의미가 맞지 않아 사용하지 않는 편이 안전 | 모달에서 여러 건 확정 후 각 항목 add, 칩 누적 |

첫 건 자동선택은 기본 동작이 아니다. `autoSelectSingleResult` 기본값은 false다(`AsyncAutocomplete.tsx:89-90,129`). `ProductAutocomplete`/`ProductMultiSelectAutocomplete`만 이를 true로 기본/명시한다(`ProductAutocomplete.tsx:165-166,246-248`). 따라서 일반 Async·Partner·일부 MultiSelect는 **1건도 dropdown**에 남는다.

### 2.2 Modal/dialog 재계수

대상 파일의 대소문자 무시 literal token과 실제 JSX를 별도로 셌다.

| 파일 | `modal` token | `dialog` token | 실제 `<SearchResultSelectionModal>` JSX |
|---|---:|---:|---:|
| `AsyncAutocomplete.tsx` | 7 | 0 | **1** (`:790`) |
| `MultiSelectAutocomplete.tsx` | 1 | 0 | **0** |

`MultiSelectAutocomplete`의 직접 JSX가 0이라고 해서 모달 미지원은 아니다. `:216-220`에서 mode/title/selectedKeys/확정 callback을 내부 `AsyncAutocomplete`에 위임한다. 별도 공용 모달 구현 파일에는 design-system `Modal` JSX 1건이 있다(`SearchResultSelectionModal.tsx:60-127`).

### 2.3 두 컴포넌트의 차이

- `AsyncAutocomplete<T>`: controlled 값은 `T | null`; 검색 draft, debounce/stale 응답, keyboard/blur, dropdown 또는 결과 모달, **한 최종 값**을 소유한다.
- `MultiSelectAutocomplete<TOption,TSelected>`: controlled 값은 배열; 이미 선택된 key를 검색 결과에서 제외하고, add/remove delta와 TagChip을 소유한다. 검색 제어는 내부 Async에 위임한다.
- 즉 “모달 단수/복수”는 Async의 결과 선택 방식이고, “칩 배열”은 MultiSelect의 영속 UI 방식이다. 둘은 대체 관계가 아니라 합성 관계다.

## 3. 롤아웃 표면 전수

### 3.1 조사 축

주축은 **서버/비동기 검색으로 후보를 고르는 입력**이다. production TSX에서 공용 Async/Multi/Product/Partner 소비처와 자체 async combobox를 전수 검색했다. 이슈에서 함께 언급한 창고는 현재 동기식이지만 동일 UX 표면이라 별도 축으로 포함했다. 단순 free-text 필터, native select, 미리 적재된 계정과목 필터는 제외했다.

현재 JSX 소비량은 Partner 17, Product 단수 5, Product 복수 1, 직접 MultiSelect 4, 직접 Async 1, Warehouse 6, 자체 async DocumentReferencePicker 사용 2곳이다.

### 3.2 품목 축

| 소비처 | 선택 | 2건 이상 현재 동작 | 단수 강제 |
|---|---|---|---|
| `EstimateFormPage.tsx:2184` | 단수 | **표 모달** | **예** — 견적 라인당 품목 하나 |
| `EstimateItemsCatalogPage.tsx:894` | 단수 | **표 모달** | **예** — 행/교체 대상 하나 |
| `SafetyStockAlertsPage.tsx:292` | 단수 | **표 모달** | **예** — 설정 대상 품목 하나 |
| `SlipFormPage.tsx:2357` | 단수 | **표 모달** | **예** — 데스크톱 라인당 품목 하나 |
| `SlipFormPage.tsx:2436` | 단수 | **표 모달** | **예** — 모바일 렌더 경로의 같은 규칙 |
| `EstimateItemsCatalogPage.tsx:1748` | 복수 | **복수 표 모달 → 칩** | 아니오 — 카탈로그 일괄 추가 |

품목은 wrapper 기본값이 `single`이므로 위 단수 소비처는 개별 opt-in 누락 위험이 낮다. `#1078`은 이 축에 견적 라인을 추가했다.

### 3.3 거래처 축

모든 현 `PartnerAutocomplete`는 값 하나만 반환한다. 다만 “단수 강제”는 저장 identity인지, 단순 단일 필터인지 구분했다.

| 소비처 | 의미/선택 | 2건 이상 현재 동작 | 단수 강제 |
|---|---|---|---|
| `BankTransactionPage.tsx:414` | 통장행 매칭, 단수 | dropdown | **예** — 행당 매칭 거래처 하나 |
| `CashReceiptFormPage.tsx:363` | 입금 행 거래처, 행별 단수 | dropdown | **예** |
| `CashReceiptFormPage.tsx:382` | 입금보고서 헤더 거래처, 단수 | dropdown | **예·필수** |
| `CollectionPlanPage.tsx:325` | 수금계획 등록 거래처, 단수 | dropdown | **예** |
| `CollectionPlanPage.tsx:428` | 조회 필터, 단수/선택 | dropdown | 아니오(필터), UI 최대 1 |
| `DailyClosingPage.tsx:875` | 선택 거래처 마감 scope, 단수 또는 명시적 전체 | dropdown | **예** — 선택 scope는 하나 |
| `DepositorMappingPage.tsx:333` | 입금자명 매핑 거래처, 단수 | **단수 모달** | **예·필수** |
| `EstimateFormPage.tsx:1920` | 견적 헤더 거래처, 단수 | dropdown | **예** |
| `JournalStatusReportPage.tsx:264` | 조회 필터, 단수/선택 | dropdown | 아니오(필터), UI 최대 1 |
| `NotesReceivablePage.tsx:291` | 받을어음 등록 거래처, 단수 | dropdown | **예** |
| `NotesReceivablePage.tsx:344` | 조회 필터, 단수/선택 | dropdown | 아니오(필터), UI 최대 1 |
| `SlipDetailPage.tsx:3031` | 판매전표 상세 편집 거래처, 단수 | dropdown | **예** |
| `SlipDetailPage.tsx:3367` | 구매전표 상세 편집 거래처, 단수 | dropdown | **예** |
| `SlipFormPage.tsx:2020` | 전표 작성 거래처, 단수 | dropdown | **예** |
| `TaxInvoiceFormPage.tsx:556` | 세금계산서 거래처, 단수 | dropdown | **예·필수** |
| `admin/BlockedPartnersPage.tsx:455` | 차단 등록 거래처, 단수 | dropdown | **예** |
| `components/MergeConvertDialog.tsx:601` | 병합 기준 거래처, 단수 | dropdown | **예** — 같은 거래처 주문으로 수렴 |

17개 중 2건+ 모달은 `DepositorMappingPage` 1개뿐이다. `#1078` Playwright도 견적 거래처가 listbox임을 보여준다(`1062-line-input-ux.spec.ts:47-52`).

### 3.4 수신자·담당자/결재자 축

| 소비처 | 선택 | 2건 이상 현재 동작 | 단수 강제 |
|---|---|---|---|
| `MessengerPage.tsx:234` | 수신자 복수 | **복수 모달 → 칩** | 아니오 |
| `GroupwareApprovalCreatePage.tsx:517` | 결재자 복수 | **복수 모달 → 칩** | 아니오 |
| `ApprovalLineConfigPage.tsx:784` | 역할별 그룹/사원 복수 | dropdown에서 한 건씩 → 칩 | 아니오 |

`#1050`의 “담당자” 대표 소비처는 Groupware 승인 작성 화면이다. 전역 관점에서는 결재라인 설정 화면이 아직 같은 2건+ 모달 계약을 쓰지 않는다.

### 3.5 그 밖의 비동기 후보 축

| 축/소비처 | 선택 | 2건 이상 현재 동작 | 단수 강제 |
|---|---|---|---|
| 분개 라인 거래처 `JournalFormPage.tsx:125` | 라인별 단수 | 직접 `AsyncAutocomplete` dropdown | **예** |
| 병합 원천 주문 `MergeConvertDialog.tsx:193` | 복수 | dropdown에서 한 건씩 → 칩 | 아니오 |
| 결재 문서 참조 `GroupwareApprovalCreatePage.tsx:614` | 단수 | 자체 async dropdown | **예** — 참조값 하나 |
| 결재 문서 참조 `GroupwareApprovalDetailPage.tsx:668` | 단수 | 자체 async dropdown | **예** — 참조값 하나 |

`DocumentReferencePicker`는 `searchByType(..., 10)`을 debounce 호출하고(`DocumentReferencePicker.tsx:126-139`), 자체 listbox를 렌더한다(`:353-420`). 공용 Async 소비처 검색만으로는 누락되는 별도 구현이다.

### 3.6 창고 축(동기식이지만 동일 표면)

`WarehouseAutocomplete`는 미리 받은 `warehouses[]`를 코드 prefix/이름 부분일치로 동기 필터한다(`WarehouseAutocomplete.tsx:38-44,72-84`). 따라서 엄밀히 비동기 축은 아니지만 `#1049/#825`가 명시한 대상이라 포함한다.

| 소비처 | 선택 | 2건 이상 현재 동작 | 단수 강제 |
|---|---|---|---|
| `SalesPartnerOrderDetailPage.tsx:1755` | 출고창고 단수 | 자체 dropdown | **예** |
| `SlipFormPage.tsx:1948` | 출고창고 단수 | 자체 dropdown | **예** |
| `SlipFormPage.tsx:1958` | 입고창고 단수 | 자체 dropdown | **예** |
| `TransferFormPage.tsx:201` | 출발창고 단수 | 자체 dropdown | **예** |
| `TransferFormPage.tsx:208` | 도착창고 단수 | 자체 dropdown | **예** — 출발과 달라야 함 |
| `MergeConvertDialog.tsx:704` | 병합 출고창고 단수 | 자체 dropdown | **예** |

## 4. `#825` 잔존 2·3번

### 4.1 “필수화 슬라이스 이관 9행 중 5행” 현재값

이슈 본문의 5행은 아직 추적 가치가 있다. 다만 CashReceipt는 7/24 이후 부분 보완됐다.

| 행 | 현재 코드 | 판정 |
|---|---|---|
| 매출 회계전표 | `accounting/SalesAccountingSlipFormPage.tsx:33-34,100-115` | `'P-10021'`/이름 하드코딩 state + plain input 잔존. 저장 payload는 선택 allocation의 partner를 쓰므로 화면의 fallback 입력과 권위가 갈라진다(`:54-63`). |
| 매입 회계전표 | `accounting/PurchaseAccountingSlipFormPage.tsx:33-34,100-115` | `'V-30011'`/이름 하드코딩 state + plain input 잔존. 위와 같은 split authority. |
| 분개 라인 거래처 | `JournalFormPage.tsx:114-149` | raw `AsyncAutocomplete`와 `legacy-name:` fallback(`:117`) 잔존. `PartnerAutocomplete`/공용 거래처 모달 미전환. |
| 입금보고서 snapshot 편집 경계 | `CashReceiptFormPage.tsx:363-370,382-424` | PartnerAutocomplete가 행/헤더에 들어왔지만, 바로 아래 거래처명·사업자번호·거래처코드가 다시 편집 가능한 CollaborativeSlipInput이다. 부분 해소됐으나 “선택 identity 단일 권위” 재감사는 여전히 필요하다. |
| 거래처 주문 상세 | `SalesPartnerOrderDetailPage.tsx:1426-1447,1486-1496` | `partnerCode` free-text가 그대로 `updatePartnerOrder` payload로 흐른다. UUID/확정 선택 없이 후속 전표 전환 identity에 영향을 줄 수 있어 잔존. |

즉 5행 중 명백한 미전환 4행 + 부분 보완됐지만 split authority가 남은 1행이다.

### 4.2 이슈 본문 뒤의 세 번째 이유

세 번째 이유는 **“칩 적용 우선 후보 7항 중 후속/미적용 표면이 남았다”**는 것이다. 이슈 본문은 다음처럼 판정한다.

- 세금계산서 묶음발행 원천전표: `(c) 후속`.
- 권한그룹·제외 거래처·세트/사양: `(b) 현 구조 유지`로 판정되어 단순 칩 전환 대상에서 제외.
- 일정 참석자·견적 노출 카테고리·배송지: 미적용.

현재 코드에서도 견적 카테고리는 `EstimateItemsCatalogPage.tsx:618,1662`의 개별 추가/select 계열이고, 거래처 배송지는 `PartnerCreatePage.tsx:500-583` 및 `PartnerDetailDialog.tsx:500-592`의 반복 행 편집이다. 즉 이슈의 세 번째 이유는 “모든 후보를 무조건 칩으로 바꾼다”가 아니라, **후속 대상과 유지 대상의 판정/완료 상태를 에픽에서 닫지 못했다**는 의미로 읽어야 한다.

부수 잔존인 MED-5/AA 후속 `#887`도 이슈 본문에 별도로 기록돼 있으나, 본 S1의 기능 슬라이스에는 섞지 않는다.

## 5. `#896` 수량 동기화 칩 현황

### 5.1 현재 하드코딩 위치

과거 이슈의 `tools/legacy-gas/estimate-app`/`order-app` 경로는 현재 실행 정본 경로가 아니다. 실행 정본은 아래 두 파일이다.

| 앱 | 하드코딩 주요 함수 |
|---|---|
| 종합견적서 | `clients/web/estimate-app/views/index.ejs:7983` `recomputeSingleExtras`; `:8083` panels; `:8196` remotes; `:8243` branches; `:8304` `recomputeHomeDerived`; `:8361` commercial derived |
| 주문서 | `clients/web/order-app/index.html:5184` `recomputeSingleExtras`; `:5287` panels; `:5431` remotes; `:5487` branches; `:5621` `recomputeHomeDerived`; `:5687` commercial derived |
| 분기보드 별도 알고리즘 | 견적 `index.ejs:12623-12700,13265-13276`; 주문 `index.html:7169-7256,7773-7784` |

기존 전수 정찰(`docs/superpowers/specs/2026-07-27-896-survey.md`, `docs/dev-reports/2026-07-30-896-s4-quantity-sync-recon.md`)은 최상위 품목 간 자동수량 관계를 **20계열**로 집계했다: 홈멀티 H-01~H-08, 싱글중대형 S-01~S-03, 상업멀티/분기보드 C-01~C-09. 이 중 H-07 차감식과 C-09 분기보드는 단순 source×factor→target×multiplier 모델로 표현되지 않는다. C-08은 C-05와 writer가 겹친다.

### 5.2 이미 존재하는 기반

- DB: `V24__quantity_sync_rule_schema.sql:8-78`의 `quantity_sync_rule/source/target` 3테이블.
- API: `QuantitySyncRuleController.java:31,41-80`의 GET 목록/단건, POST, PUT, DELETE.
- UUID 비공개 DTO: source/target은 `productCode`를 받고 반환한다(`QuantitySyncRuleRequest.java:18-40`, `QuantitySyncProductRef.java:6-20`).
- 주문 앱 adapter/shadow: `clients/web/order-app/src/quantitySync.ts:2-220`, API 호출 `samhanApi.ts:188-190`, bridge `main.ts:57-81`.
- 실제 화면은 shadow-only: `order-app/index.html:5545-5555`가 설정을 읽고 “사용자 계산은 legacy 수식을 유지”한다고 명시한다.

PR `#996` 본문도 최종 산출물을 “전환이 아니라 관측 전용”으로 정정했다. 즉 PR 제목과 달리 실제 파생수량 권위는 legacy 함수다.

### 5.3 칩 기반으로 바꾸려면 건드릴 곳

1. **관리 UI:** 현재 desktop/estimate-app 어디에도 quantity-sync 관리 소비처가 없다. 품목 관리 표면에 규칙 목록/편집을 두고 source·target을 `ProductMultiSelectAutocomplete`/칩으로 선택하게 해야 한다. 배수·조건·우선순위·비활성 동작은 칩 외 구조화 필드가 필요하다.
2. **API adapter:** 기존 CRUD API를 FE에 연결한다. UUID는 payload에도 쓰지 않고 기존 `productCode` 계약을 유지한다.
3. **마이그레이션/seed:** 20계열 중 schema로 표현 가능한 관계를 명시 데이터로 이관한다. 현 PR #996은 위험한 seed를 제거했으므로 현재 seed 0을 전제로 다시 parity를 증명해야 한다.
4. **실행 evaluator:** 주문 앱의 shadow evaluator를 실제 `homeQty/singleQty/commQty` writer로 승격하고, 견적 앱에도 같은 evaluator/adapter를 넣어 양쪽 복제를 제거한다. 한쪽만 바꾸면 다른 앱 결함이 남는다.
5. **표현 불가 규칙:** H-07/C-09 및 C-05/C-08 이중 writer는 단순 SUM schema에 억지로 넣지 않는다. typed operation/schema 확장 또는 legacy-owner 유지 경계를 먼저 확정한다.
6. **회귀 게이트:** 각 계열의 수량, `unitPrice × qty`, 세트 전개, 최종 전송 payload를 기존 결과와 exact diff 0으로 고정한다. PR #996의 실제 evaluator 시도는 연속 금액 결함 때문에 철회됐으므로 shadow 불일치 0이 선행 게이트다.
7. **수동 수량 잠금:** 현재 수동 override/옵션 변경 시 잠금 해제 계약을 보존한다. 설정 evaluator가 사용자 수동값을 덮지 않는지 별도 검증한다.

### 5.4 리모컨/실외기 표기 축

`#1114`는 `#896`으로 흡수되어 닫혔다. 실측 사실은 다음뿐이다.

- 식별자: `remoteOption`, `remoteExcluded`.
- 백엔드: `BundleExpander`의 `REMOTE`/`리모[컨콘]` 판정.
- 레거시: 리모컨.
- 프런트 라벨: 실외기.

어느 쪽을 정본으로 할지는 개발책임자 판단 대기다. 본 보고서의 구현 슬라이스·게이트·추천에 이 축을 포함하지 않는다.

## 6. 제안 슬라이스

### 슬라이스 1 — 공용 입력 계약과 누락 소비처 목록 고정

- **무엇:** 공용 primitive의 단수/복수/1건/2건+ 계약을 테스트 표로 고정하고, 본 보고서의 생산 소비처 목록을 contract test의 대상 목록으로 만든다. 구현 범위는 design-system + 2~3개 대표 누락 소비처까지만: 거래처 단수 1개, MultiSelect 복수 1개, 창고 단수 1개.
- **왜 먼저:** 공용 모달은 이미 있는데 rollout default가 축마다 달라 “무엇을 새로 만들지”보다 “어디가 opt-in 누락인지”가 문제다. 한 라운드에 끝낼 수 있는 가장 작은 검증 가능한 단위다.
- **GREEN:** (a) 1건/2건+/취소/확정/keyboard contract 전부 green, (b) UUID 문자열 DOM 0, (c) 세 대표 소비처 Playwright mock green, (d) 보고서의 소비처 카운트와 contract 목록 일치.

### 슬라이스 2 — 거래처·분개·창고 단수 롤아웃

- **무엇:** Partner 17개 중 저장 identity 필드를 우선 모달 단수로 전환하고, `JournalPartnerPicker`를 Partner wrapper 계약으로 통합한다. 창고 6개는 공용 모달 adapter를 붙인다. 필터 3개는 선택 UX만 통일하되 필수화하지 않는다.
- **왜 둘째:** 단수 강제 identity가 가장 큰 데이터 위험이며, 복수 칩보다 저장 권위 일치가 우선이다. `#825` 잔존 5행 중 Sales/Purchase/Journal/CashReceipt/PartnerOrder도 이 단계에서 각자 단일 권위로 수렴시킨다.
- **GREEN:** 모든 2건+ 단수 field가 radio 모달, 저장 payload는 선택된 business identity 하나, free-text/legacy fallback으로 저장되는 경로 0, UUID DOM 0, mock 전 메뉴 suite green.

### 슬라이스 3 — 복수 후보/칩 및 자체 async picker 롤아웃

- **무엇:** ApprovalLineConfig·MergeConvert 주문을 2건+ 복수 모달로 맞추고, DocumentReferencePicker를 공용 결과 모달 계약으로 수렴한다. 이슈 3번의 일정 참석자·견적 노출 카테고리·배송지는 각각 도메인 적합성을 재확정한 뒤 같은 PR에서 “적용/현 구조 유지”를 명시적으로 닫는다.
- **왜 셋째:** 복수 배열의 dedup/max/순서/취소 semantics는 단수보다 복잡하다. 단수 primitive가 안정된 뒤 확대해야 회귀 원인을 분리할 수 있다.
- **GREEN:** 복수 일괄확정/중복제외/개별삭제/최대수/취소 원복 green, 자체 async dropdown 잔존 목록이 의도된 예외만 남음, 에픽 3번 각 후보의 적용/유지 판정 문서화.

### 슬라이스 4 — `#896` shadow→칩 설정→실행 전환

- **무엇:** 기존 DB/API 위에 품목 규칙 칩 관리 UI를 연결하고, 먼저 표현 가능한 단일 계열(S-03 후보)의 seed + 양 앱 shadow exact parity를 만든다. parity 0 뒤에만 실제 evaluator를 켠다. H-07/C-09는 별도 typed-operation 결정 전 legacy owner로 둔다.
- **왜 마지막:** 금액 영향이 직접적이며 PR #996에서 evaluator 활성화가 결함을 반복 생성한 실측이 있다. 전역 입력 primitive를 먼저 안정화해야 관리 UI의 칩 자체가 새 위험이 되지 않는다.
- **GREEN:** (a) 관리 UI CRUD + UUID 미노출, (b) 양 앱 shadow 수량/금액/payload exact diff 0, (c) 한 계열 실제 전환 후 legacy 대비 exact diff 0, (d) fallback/rollback이 legacy 계산을 보존, (e) 리모컨/실외기 표기 축은 개발책임자 결정 전 변경 0.

## 7. 미해결 질문

1. `#825` 이슈 3번의 “5항 잔존” 숫자는 본문 문장만으로 개별 5행을 일의적으로 복원하기 어렵다. 현재 본문은 후속 1그룹, 유지 3그룹, 미적용 3그룹을 서술한다. 다음 설계 전에 당시 슬4 감사표 원본을 추적하거나, 현재 코드 기준으로 후보를 재판정하는 편이 안전하다.
2. PartnerAutocomplete의 2건+ 모달을 wrapper 기본값으로 올릴지, 소비처별 opt-in을 유지할지 결정이 필요하다. 전자는 rollout 누락을 막지만 필터/기존 keyboard 흐름을 한 번에 바꾼다. 슬라이스 1의 세 대표 소비처 결과로 결정하는 것을 권한다.
3. `#896`의 H-07/C-09를 새 typed evaluator로 표현할지 legacy owner로 영구 분리할지는 아직 미해결이다. 단순 칩 source/target만으로 표현 가능하다고 가정하면 안 된다.

## 8. 새 파일 목록

- `docs/dev-reports/2026-08-08-825-s1-global-input-ux-recon.md` — 본 정찰 보고서 1개.

소스 코드, 테스트 코드, 설정, lockfile은 변경하지 않았다.

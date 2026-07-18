# #825 슬3 — 품목 자동완성 foundation + free-text 감사 (dev-report)

- 기준일: 2026-07-18
- PR: #841 · 브랜치 `feat/825-s3-product-autocomplete`
- 에픽: #825 전역 입력 UX (슬3/7) · spec: `docs/specs/825-s3-product-autocomplete-spec.md`
- 슬1(거래처 감사)·슬2 동형. 정찰 실측 + CODEX SOL 기획검수(6 BLOCKING) 반영.

## foundation (구현)
- **AsyncAutocomplete DOM/ARIA 식별자 ↔ getKey 분리**(D-S3-01) — `optionDomId(index)=${listId}-opt-${idx}`(opaque·접두사 `ds-aac-list-` 보존). `<li id>`·`aria-activedescendant`가 index 기반 → **getKey(UUID/업무키)의 DOM 유출 근본 차단**. React key·선택 동일성·pick·keyboard 보존.
- **splitHighlightMatches 공용 hoist**(PartnerAutocomplete→AsyncAutocomplete/highlight.tsx·Partner barrel 재-export·단일 공개 export).
- **ProductAutocomplete 하이라이트 ④** — renderOption이 modelName/productName만 강조(서버 검색대상)+모델명/품목명 배지+matchMark AA 5.16:1. modelCode 제외.

## 판정 taxonomy (검수 반영)
| 분류 | 의미 | 슬3 처리 |
|---|---|---|
| 이미표준화/QA-only | 이미 ProductAutocomplete → foundation 자동상속 | QA 확인 |
| (a) 즉시전환 | exact 품목 선택·저장·co-edit 아님 | 후속(최저마찰) |
| (b) 정당 free-text | 마스터 생성·목록필터·세트전개·바코드·외부스냅샷 | 유지 |
| (c) 문서작성/필수화 | 전표·co-edit·필수화 결합 | 후속(무결성·pre-confirm) |

## 감사표

### 이미표준화(QA-only · foundation 자동상속)
| 화면·라인 | 위젯 | 근거 |
|---|---|---|
| `SlipFormPage.tsx:1313·1394`(desktop/mobile modelCell) | ProductAutocomplete | 출고/입고 작성 라인. mobile=MobileLineCard 공유 슬롯 자동상속 |
| `EstimateItemsCatalogPage.tsx:893·1749` | ProductAutocomplete | 구성품·마스터 품목 추가 |

### (a) 즉시전환 (후속·D-S3-05)
| 화면·라인 | 현재 | 근거 |
|---|---|---|
| `TransferFormPage.tsx:223/238` | plain Input modelName onBlur lookup(`:97·107·231`) | 이동전표 작성·co-edit 아님·이미 productId 바인딩. 최저마찰 (a) 전환이나 foundation 경계로 defer |

### (c) 문서작성/필수화 (후속·D-S3-03)
| 화면·라인 | 현재 | 근거 |
|---|---|---|
| `SlipDetailPage.tsx:1994/2003`(매출)·`:2256/2265`(매입) | CollaborativeSlipInput ×2 | 전표 수정·co-edit fieldPath·필수화 |
| `EstimateFormPage.tsx:1716/1731`(desktop)·`:402/420`(mobile) | CollaborativeSlipInput modelName onBlur lookup | 견적 작성·co-edit·2경로 |
| `SalesPartnerOrderDetailPage.tsx:1446/1456` | CollaborativeSlipInput(modelCode) | 주문 수정→출고전환·co-edit |

### (b) 정당 free-text (유지)
`ProductFormPage.tsx:449/457`(마스터 생성)·`ProductCatalogPage.tsx:249`(목록필터)·`EstimateItemsCatalogPage.tsx:1689`(목록검색)·`InventoryAuditDetailPage.tsx:536`(바코드/코드)·`BundleOptionRow.tsx`(BUNDLE 전개 modelCode 계약·`slip.ts:232`·품목 master 자유입력 아님)·`SalesPartnerOrderListPage.tsx:513`(통합검색)·`TaxInvoiceFormPage.tsx`(mobile :137·desktop :663-668 itemName)·`ArologisManualDispatchPage.tsx:671·771-785`(품목메모·BE schema 부재)·재고표 열 필터(`InventoryStockBalance`·`DpsByProduct`·`HometaxExport`).

## 식별자 사실 (검수 정정)
활성 `model_name` UNIQUE(V1:54)·활성 non-null `model_code` UNIQUE(V3:47)·`product_code` UNIQUE(V5:44). modelName은 고유하나 가변·비universal → DOM 식별자를 getKey와 분리(D-S3-01)가 옳음. BE `productCode`는 FE ProductOption 미매핑.

## 검증
DS build+vitest 73·desktop vitest 836·Playwright 5소비처 무회귀(ac-2/3/4·journal-form-dropdown·groupware s4b/s4c)·#809 접두사 보존. OPUS 5-agent 적대검증 in-scope 코드결함 0·D-S3-01 genuine.

## 후속 바운드
- #842 WarehouseAutocomplete DOM/ARIA UUID 분리(동일패턴·별도 컴포넌트·defect-family)
- (a)전환(TransferForm)·(c)전환(SlipDetail·EstimateForm·SalesPartnerOrder)+필수화/co-edit/바인딩(작성 productId/수정 modelName/주문 modelCode) 통일 = 후속 슬라이스(D-S3-03/05·무결성 pre-confirm).

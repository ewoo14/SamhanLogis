# 단가 부가세포함 전환 PR-B (견적) — RESULTS

> spec `docs/superpowers/specs/2026-06-09-unit-price-vat-inclusive-spec.md`. PR-A(전표)에 이은 견적측 + 견적→전표 변환 정합.

## 변경
- BE: `EstimateLine.createFromVatInclusive`(라인 단위 eCount, 원 단위: 합계=수량×VAT포함단가, 공급가액=round(합계/1.1), 부가세=차액, unitPrice=공급단가, lineTotal=합계VAT포함) + `unit_price_with_vat` 컬럼(V35) + 요청 `priceVatInclusive`(CreateEstimateRequest/UpdateEstimateRequest) + EstimateService 배선(create/update/세트전개 구성품) + EstimateLineResponse 노출.
- **변환**: `EstimateToSlipConverter` — VAT포함 견적라인(unitPriceWithVat != null)은 `SlipLine.createFromVatInclusive` 로 재생성 → 전표에 공급가액/부가세 라인 분해 보존.
- FE: estimateApi EstimateLineRequest.priceVatInclusive·EstimateLine.unitPriceWithVat, EstimateFormPage 단가=VAT포함 입력·라인별 합계(VAT포함)+공급/부가세·totals 라인단위 합산·제출 플래그, EstimateDetailPage 단가=unitPriceWithVat 표시.
- IT: `createEstimate_priceVatInclusive_splitsPerLine`(1000→공급909/부가세91/unitPriceWithVat1000).

## 검증 (실 Docker 스택 + 데스크톱 실 UI, slip-service 재배포 V35)
- V35 컬럼 `unit_price_with_vat` 적용 확인.
- 실 BE 견적 생성: 단가(VAT포함)1000 → **공급가액 909 / 부가세 91 / lineTotal 1000** 정확 분해.
- **변환→전표 정합**(DB): 변환된 slip_lines `unit_price_with_vat=1000 / supply_amount=909 / vat_amount=91` 보존.
- `estimate-detail-vat.png` — 견적 상세: 단가(VAT포함) 1,000 / 공급가액 909 / 부가세 91 / 소계 1,000 + 합계박스.
- `estimate-form-vat.png` — 견적 작성폼: 단가(VAT포함) 입력 + 라인별 합계(VAT포함)/공급/부가세.

## 단가 부가세포함 전환 — 전표 전체 완결
- PR-A(#443): 출고/입고 전표 작성폼 + 슬립 상세.
- PR-B(본): 견적 작성/상세 + 견적→전표 변환 정합.
- 조회 리스트: 라인 단가 미표시(헤더 합계=공급가액 기반) — 변경 불필요.

## 후속(범위 외)
- 매출/매입 편집 모드 매트릭스(in-place) VAT포함 편집 전환.

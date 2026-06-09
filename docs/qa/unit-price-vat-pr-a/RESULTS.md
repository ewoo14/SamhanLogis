# 단가 부가세포함 전환 PR-A (전표측) — RESULTS

> spec `docs/superpowers/specs/2026-06-09-unit-price-vat-inclusive-spec.md`. 라인 단위(eCount) 분해.
> 범위(PR-A): 출고/입고전표 작성폼 + 슬립 상세. (조회 리스트는 라인 단가 미표시 — 헤더 합계만, 변경 불필요. 견적 = PR-B.)

## 모델
- 단가 = **부가세 포함**(사용자 입력). 라인 단위: 합계(VAT포함)=수량×단가, 공급가액=round(합계÷1.1), 부가세=차액.
- BE 저장: `unitPrice`=공급단가(VAT-excl, 회계 canonical 유지), `unitPriceWithVat`=VAT포함 단가(표시), `supplyAmount`/`vatAmount`=라인 권위값. `lineTotal`=공급가액(헤더 totalAmount 의미 유지).

## 변경
- BE: `SlipLine.createFromVatInclusive` + 요청 `priceVatInclusive` 플래그(CreateSlipRequest/AddLineRequest) + SlipService 배선(create/addLine/세트전개 구성품) + `SlipLineResponse` 에 unitPriceWithVat/supplyAmount/vatAmount 노출.
- FE: `SlipLineInput.priceVatInclusive`·`SlipLineDetail` VAT필드, SlipFormPage 단가=VAT포함 입력·라인별 분해·totals 라인단위 합산·제출 플래그, design-system LineRow `vatInclusive` opt-in(합계셀 합계VAT포함+공급/부가세 소표시, 견적 무영향), SlipDetailPage 읽기전용 표에 단가(VAT포함)/공급가액/부가세/합계(VAT포함) 컬럼.

## 검증
- BE 컴파일 + 테스트컴파일 OK. desktop typecheck OK.
- IT: `SlipControllerIT.create_priceVatInclusive_splitsSupplyAndVatPerLine` — qty 2 × 단가(VAT포함)1100 → supplyAmount 2000 / vatAmount 200 / unitPriceWithVat 1100 단언.
- **실 Docker 스택 + 데스크톱 실 UI**(실 게이트웨이 :8080 + 실 로그인 dev_master, slip-service 재배포):
  - 실 BE create: 단가(VAT포함)1100×2 → 공급가액 2000 / 부가세 200 / unitPrice(공급단가) 1000 / 합계 2200 정확 분해.
  - `slip-detail-vat.png` — 출고전표 상세: 단가(VAT포함) 1,100 / 공급가액 2,000 / 부가세 200 / 합계(VAT포함) 2,200 컬럼 표시.
  - `slip-form-vat.png` — 새 출고전표 작성폼: "단가는 부가세 포함" 안내 + 단가 1,100 입력 시 합계셀 라인 분해(공급/VAT).

## 후속(PR-A 범위 외)
- 매출/매입 **편집 모드** 매트릭스(SlipDetailPage 내 in-place 편집)는 unitPrice(공급) 직편집 — VAT포함 편집 전환은 별도(편집 경로 distinct).
- 견적서(작성/상세/변환) = **PR-B**.

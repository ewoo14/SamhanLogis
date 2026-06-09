# 세트 구성품 규격 자동채움 (GAS '규격' 컬럼) + 상세표 정렬 — #24 RESULTS

> 세트→전표 전개 에픽 후속 #24. 전개 구성품 라인의 **규격(specification)** 을 채운다.
> **규격 출처 = GAS 종합견적서 `getSpecMap_` 와 동일하게 시트의 '규격' 컬럼** (개발책임자 지시: 규격은 GAS 코드 참고).
> 우리 적재본에서는 세트 구성 탭의 '규격' 이 `BundleComponent.specText`(구성품) / `Product.specText`(단일·KEEP 부모)에 적재됨.
> ⚠️ 당초 product_spec(제품크기/냉방성능 detail) 합성은 GAS 규격이 아니므로 폐기.
> ([[project_replaces_ecount_gas_was_exporter]] — 전산이 eCount 대체, GAS 가 eCount 로 보내던 '규격'을 우리가 소유.)

## 변경
- **규격(BE)**: `BundleExpander.specOf(raw)` — 구성품=`BundleComponent.getSpecText()`, 단일/KEEP 부모=`Product.getSpecText()` (= 시트 '규격' 컬럼). 50자 절단. product_spec 미사용(ProductSpecRepository 주입 제거). `ExpandedLine`/`Part`/`ExpandedLineResponse`/`ExpandedLineDto` specification 추가. `SlipService`/`EstimateService` 구성품 라인 규격=el.specification 우선.
- **상세표 정렬(FE)** (개발책임자 지시): 헤더 모두 가운데, 수량 가운데, 금액(단가/공급가액/부가세/합계) 우측.
  - SlipDetailPage(raw 표, global.css): col-* 정렬을 `td.col-*` 로 한정 → thead th 가운데 유지. 수량 td 가운데, 금액 td 우측.
  - DataTable(DS): `headerAlign` 옵션 추가(th=headerAlign ?? align). EstimateDetailPage 수량 align=center + 전 컬럼 headerAlign='center'.

## 검증 (실 Docker 스택, product 재배포)
- 실 `/products/internal/expand`(AC052CS1PBH1SY): INDOOR `AC052CN1PBH1`→**냉난방 1w**, OUTDOOR `AC052CX1PBH1`→**냉난방 1w**, REMOTE `AR-EH05`→**무선냉난방**, PANEL `PC1BWSK3NW`→null(시트 '규격' 공란) — GAS getSpecMap_ 와 동일.
- 실 전표 생성 시 구성품 라인 규격 동일 채워짐. 슬립/견적 상세 규격 컬럼 표시 + 정렬(헤더 가운데/수량 가운데/금액 우측).

## 참고/후속
- 시트 '규격' 공란 구성품(PANEL 등)은 규격 공란 — GAS 와 동일(합성하지 않음).
- 규격은 GAS 진실원(시트 '규격' 컬럼) 그대로. product_spec detail(제품크기 등)은 별개 데이터.

# 세트 구성품 규격 자동채움 (product_spec) — #24 RESULTS

> 세트→전표 전개 에픽 후속 #24. 전개된 구성품 라인의 **규격(specification)** 을 `product_spec` 에서 자동 합성해 채운다. (이전엔 부모 라인 규격(빈값)을 그대로 써 구성품 규격 공란이었음.)

## 변경 (BE 전용)
- `BundleExpander`: `ProductSpecRepository` 주입 + `composeSpec(productId)` — product_spec 에서 한 줄 규격 합성(키 `규격/치수/크기` 우선, 없으면 displayOrder 첫 행, 50자 절단). `ExpandedLine`/`Part`/`single()` 에 `specification` 추가.
- `ExpandedLineResponse`(product) + `ExpandedLineDto`(slip, 8-arg 호환 생성자) 에 `specification` 노출.
- `SlipService.addSlipLinesExpanded` / `EstimateService.addEstimateLines`: 구성품 라인 규격 = `el.specification()` 우선, 없으면 요청 규격.
- FE 변경 없음 — 슬립/견적 상세의 기존 규격 컬럼이 자동 채워진 값을 그대로 렌더.

## 검증 (실 Docker 스택, product+slip 재배포)
- 실 `/products/internal/expand`(AC052CS1PBH1SY): PANEL `PC1BWSK3NW`→**1410x35x500**(제품크기), REMOTE `AR-EH05`→**냉난방 전용**(첫 spec), 실내/실외기(product_spec 없음)→null.
- 실 BE 전표 생성: 구성품 라인 specification 동일 채워짐.
- `slip-detail-spec.png` — 출고전표 상세 규격 컬럼에 PANEL 1410x35x500 / REMOTE 냉난방 전용 표시(+ PR-A VAT 컬럼 동시).

## 참고/후속
- product_spec 없는 구성품(실내/실외기 등)은 규격 공란 — 시트에 spec 미적재. ProductSpec flapping 전역 reconcile(#4, 별도)로 적재율 향상 여지.
- 규격 합성 휴리스틱(규격/치수/크기 키 우선)은 추후 조정 가능.

---
name: quotation-estimate-app-state
description: 종합견적서 실체 = clients/web/estimate-app (GAS 1:1 이식) ~95% 구현 완료. 데스크톱 EstimateFormPage/QuoteView 는 별개 사내 간이견적서(둘 다 유지). '처음부터 구축' 스코핑 금지.
metadata:
  type: project
---
2026-06-15 회사 PC 세션 정찰 확정(4-agent 검증 + keystone 파일 존재 확인).

**종합견적서 실체 = `clients/web/estimate-app/`** (Node/Express+EJS): `views/index.ejs`(GAS index.html 이식) + `lib/code.js`(GAS Code.js 이식) + `lib/db-catalog.js`(카탈로그 DB 소스 레이어, `/products/internal/estimate-catalog/*` 변환) + `lib/slip-bridge.js` + `test/calc-fidelity.test.js`. 레거시 GAS(`tools/legacy-gas/종합견적서/`) 9대 기능 **~95% 구현**:
- 세트폭발 6:4(가정)/4:6(상업) 배분 + fixed 선차감 + roundK = `BundleExpander.java`(product-service) + index.ejs 이중구현
- 단가=출고가×(1−할인율), 우선순위 고정DC>거래처>전역(0.45) = `PriceCalculationService.java`(dc-config-service)
- 거래처 DC 11종 = **dc-config-service DB 원천**(Notion→DB 완료, 키=사업자번호 digits)
- 조합비 경고(HOME>130/COMM 120·strict 103), 추천실외기, 인쇄 2종(SIMPLE=세트1줄/DETAIL=구성품폭발)+섹션(COMM→HOME→SINGLE→OLD)+푸터4줄+VAT라벨(표기만), **스냅샷 완전동결**(`QuoteSnapshot` slip-service, base64 work-state blob)

**데스크톱 `EstimateFormPage`/`QuoteView`(slip-service /slips/estimates) = 별개 사내 간이 견적서.** 개발책임자 2026-06-15: **둘 다 유지(용도 분리)** — 데스크톱=사내 간이/전표연동, 웹=고객 발행 종합.

**개발책임자 6결정(2026-06-15) 전부 기존 코드 충족**: 완전동결✅ VAT표기만✅ 조합비경고✅ 6:4배분✅ / #6(시드1회→DB원천)만 부분.

**잔여 갭(소규모)**: G1 카탈로그 운영 default 아직 'sheet'(상업멀티 변동DC FORMULA read 비결정성으로 db 승격 보류 — `db-catalog.js`·`VariableDiscountDetector` 완비, 납품가 컬럼 narrow read+재시도로 해소) · G2 거래처/담당자 시트 read→partner-service 위임(/internal/partners/list·managers 신규) · G3 추천실외기 homeEx 미분리(home.slice 대체) · G4 데스크톱 인쇄버그(estimateNo 슬래시 %2F→400, e.id 로 수정) · G6 구형 0.5 확인.

🚨 **야간 스코핑 제안서 `docs/superpowers/specs/2026-06-15-comprehensive-quotation-epic.md` 는 "처음부터 구축" 전제 오류**(데스크톱 간이견적서를 종합견적서로 오인, estimate-app 존재 모름). 종합견적서 작업 = 기존 estimate-app 갭 보완이지 신규 구축 아님. 관련: [[project_estimate_auth_dc_key_decisions]] [[project_sheets_to_db_full_migration]] [[product-master-registration]].

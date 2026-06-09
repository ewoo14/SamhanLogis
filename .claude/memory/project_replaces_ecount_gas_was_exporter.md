---
name: project_replaces_ecount_gas_was_exporter
description: Samhan Public 전산은 이카운트를 대체 — 기존 GAS 는 데이터를 이카운트로 export 하던 것, 우리는 그 데이터를 자체 소유·설계
metadata:
  type: project
---

**Samhan Public 전산은 이카운트(eCount)를 대체한다.** 기존 GAS 코드(종합견적서/주문서/거래명세서 등)는 시트 데이터를 가공해 **이카운트로 전송**하던 것이다. 우리는 이제 그 데이터의 **시스템 오브 레코드**다 (2026-06-09 개발책임자).

**Why**: GAS 코드를 참고할 때, GAS 가 "이카운트로 보내던 필드/포맷"이 곧 우리가 **자체적으로 보유·계산·표시**해야 할 데이터다. 이카운트가 하류에서 처리해주던 것(공급가액/부가세 분해, 단가 VAT 포함, 규격, 입출고구분 코드 등)을 우리가 직접 소유해야 한다. "이카운트 매핑/연동"이 아니라 "이카운트 대체".

**How to apply**:
- GAS 참조 시: GAS 가 이카운트로 보낸 데이터 = 우리가 자체 필드로 소유. (예: 단가 부가세포함→공급가액/부가세 라인 분해를 우리 BE 가 계산·저장. 규격 = 세트 탭 '규격' 컬럼(BundleComponent.specText, GAS getSpecMap_)을 우리가 보관·표시.)
- 설계는 "이카운트 export 용 매핑 필드"가 아니라 **1급 도메인 데이터**로. eCount 잔재 UI/필드(입출고구분 코드 노출 등)는 우리 업무 모델로 재설계([[feedback_real_server_check_screenshot]] 실 UI 리뷰로 다수 정리됨).
- 규격/금액 등 데이터 출처 판단 시 [[project_ecount_product_identity_rule]] · 기존 GAS 코드(`tools/legacy-gas/`)를 진실원으로 참고하되, **이카운트 하류 의존 금지**(우리가 종단).

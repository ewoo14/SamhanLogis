# 종합견적서 에픽 — 스코핑 제안 (개발책임자 검토용 1차 초안)

> 작성: 2026-06-15 야간 PM (Opus). **GAS 양식(`tools/legacy-gas/종합견적서/index.html`, 754KB/~19k줄) 구조 분석 근거.**
> 이 문서는 **제안**이며 개발책임자 검토·조정 후 sub-slice 착수. GAS 포트가 아니라 **우리 DB/도메인 1급 설계**
> ([[project_replaces_ecount_gas_was_exporter]] [[project_sheets_to_db_full_migration]]). 견적서=스냅샷 저장+웹 재로드 목적(개발책임자).

## 1. 출력 양식 (GAS 분석)
- **두 형태**: ① 견적서(기본) = 세트를 1줄로 ② 견적서(세트상세) = 세트를 구성품으로 폭발(explode) 펼침.
- **섹션**: 홈멀티 / 상업멀티 / 구형 / 싱글세트 — 각 섹션 소계 + 글로벌 "총 견적 합계".
- **표 컬럼**: 품목명 | 모델명 | 단위 | 수량 | (출고가, 옵션 토글) | 단가 | 소계.
- **헤더**: 로고 + "견 적 서" + 조합비(홈/상업 %) + 견적일. **푸터**: 안내문구 4줄(분기관 임의산정/재고확인/30일 유효/공공기관 무효).

## 2. 제품군 4종 + 세트 폭발 엔진 (핵심 도메인)
- **홈멀티 / 상업멀티 / 구형 / 싱글세트(부품 폭발)**.
- **세트 폭발**: 세트 1개 → 구성품 N개(`setModel` 매핑). 옵션별 포함/제외(판넬·리모컨·자재). 세트 단가를 실내/외 구성품에 **비율 배분**(가정용 6:4, 상업 4:6 / fixed 부품은 고정 소계 후 잔액 배분).
- **세트가 산정**: 기본가 + 판넬 delta + 리모컨 delta + 자재 포함분, 거래처별 할인 적용.
- **계산**: 단가 = 원가 × (1 − 할인율)(홈 `DISCOUNT_RATE_HOME` 등) + 패턴 추가할인(360/4way/1등급). 소계 = 수량×단가.
- **조합비**: 실내기 수 / 최대허용 % — 초과 시 경고/차단(정책 ❓).

## 3. 외부 데이터 → 우리 DB 치환 매핑
| 현행(GAS 시트/노션) | 신규 DB | 키 |
|---|---|---|
| 홈멀티/상업멀티/구형 시트 | `products`(type=HOME/COMM/OLD) | model |
| 싱글세트 시트 | `single_sets` | id/model |
| 싱글/상업 부품 시트 | `set_parts`(setModel FK) | setModel |
| 거래처 시트 | `partners`(기존) | name/bizNo |
| 거래처 할인(노션 Relation) | `discount_policies` | partnerId |
| 추천조합/출고가보정 | `recommend_combos`/`price_inc` | model |
> 일부는 기존 product/partner 도메인에 흡수 가능. MIG-2 품목 신원 규칙([[project_ecount_product_identity_rule]]) 정합 확인 필요.

## 4. 데이터 모델 제안 (우리 도메인)
**입력(편집 중)**: `estimate`(헤더: 거래처 스냅샷, 견적일, 출고일/창고, 배송/감리 주소, 인수자, 입금예정, VAT표기, 야적/지방, 카드포함) + `estimate_line`(section, model, name, qty, customPrice/customList/customSpec[null=기본], setOptions JSONB[panel/remote/remoteEx/material/expand]).
**스냅샷(저장)**: 위 + **frozen 계산결과**(frozenPrice/List/Sub/SetUnit + explodedParts[]) + calculated(조합비, 총합계). 형태=정규화 테이블 vs **JSONB 1컬럼**(재로드 단순) ❓.

## 5. Sub-slice 제안 (순차)
1. **마스터 DB + 시드**: products(HOME/COMM/OLD)·single_sets·set_parts·discount_policies + 외부(시트/노션)→DB 시드. (BE, 데이터 토대)
2. **세트 폭발 + 단가 계산 엔진**(BE, 순수 도메인 로직 + 단위테스트 — vitest/JUnit). 실내외 배분·옵션 delta·할인.
3. **데스크톱 종합견적서 입력 UI + 2 양식 미리보기**(FE, GAS 양식 재현, PrintLayout/QuoteView). **견적 인쇄 진입버그 동반 해결**(handlePrint estimateNo→id UUID, queryKey 분리).
4. **스냅샷 저장 + 웹 종합견적서 재로드 API**(estimate-app 연동, 개발책임자 "웹 재로드" 목적).

## 6. 🔴 개발책임자 결정 포인트
1. **스냅샷 정책**: ⓐ 완전동결(frozen 단가 그대로 재현, 과거 약정 보호 — PM 권장) vs ⓑ 구조만 저장(재로드 시 현행 단가 재계산). 
2. **세트 모델 형태**: single_sets ↔ set_parts(setModel) 매핑 + 옵션(판넬/리모컨/자재) 가격 delta 구조 — 현행 GAS 로직 그대로? 단순화?
3. **세트가 배분 비율**(가정 6:4 / 상업 4:6) + fixed 부품(발통/호스) 처리 — 현행 유지?
4. **VAT/카드수수료**: 현재 GAS 는 표기만(금액계산 미구현). 우리는 금액 계산 적용? (VAT 별도/포함, 카드 수수료율)
5. **조합비 초과**: 경고만 vs 발행 차단.
6. **마스터 데이터 소스**: 시트→DB 시드 1회 vs 동기화 유지([[project_lookup_seed_source.md]] 패턴) — 품목/단가/할인 갱신 주기.

## 6.5. ✅ 개발책임자 결정 확정 (2026-06-15, 회사 PC 세션)
1. **스냅샷 정책 = ⓐ 완전동결**. `frozenPrice/List/Sub/SetUnit` + `explodedParts[]` 동결 컬럼. 마스터 단가 변경과 무관하게 과거 약정 그대로 재현.
2. **세트 모델 = 현행 GAS 로직 유지** (PM 기본값, parity-safe. 단순화는 후속 슬라이스).
3. **세트가 배분 = 현행 6:4(가정)/4:6(상업) 유지** (PM 기본값. fixed 부품 고정 후 잔액 배분 현행대로).
4. **VAT/카드수수료 = 표기만 (현행 GAS)**. 금액 계산 안 함, 토글 문구만 표시. **견적 총액 = 세전 기준**. (데이터 모델에 VAT/수수료 금액 컬럼 불필요 — 헤더 토글 flag 만.)
5. **조합비 초과 = 경고만**. 발행/저장 차단 없음, 경고 배지·문구만.
6. **마스터 소스 = 시드 1회 → DB 원천**. 시트 동기화 안 함([[project_sheets_to_db_full_migration]] 전면 치환 정합). **단가/할인 수정용 인앱 관리 화면이 후속 필요** (시드 후 시트는 편집 표면이 아님).

→ 위 결정대로 sub-slice 1(마스터 DB)부터 다모델 워크플로우 착수. 양식 재현은 iteration 전제([[feedback_print_design_iteration]]).

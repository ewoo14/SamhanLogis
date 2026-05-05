# Product 도메인 확장 결정 사항 (마이그 사전 합의)

> 본 문서는 사용자가 마이그 작업 전 명시한 product-service 도메인 확장 요건을 기록.
> Phase 1 분석 agent + Phase 4 Migration Plan + Phase 6 BE/FE 구현 시 반드시 반영.

---

## 1. 변동DC 자동 감지 → boolean 사전 계산

### 배경
- 기존 Apps Script 가 시트의 일부 수식/단어를 **runtime 감지**하여 변동DC (Variable Discount) 여부 판정
- 동일 로직을 매 견적/주문마다 반복 실행 → 성능 ↓ + 룰 변경 시 산재된 코드 수정 부담

### 결정 (Phase 2 cross-review 후 4-컬럼 안 확정)

**ProductMaster 신규 4 컬럼** (Flyway 마이그레이션):

| 컬럼 | 타입 | 의미 | 출처 룰 |
|---|---|---|---|
| `hasVariableDiscount` | boolean | 변동DC 적용 여부 (마스터 시트에 단가 수식 절대참조 포함) | 룰 1: `$L$2` (홈/상업 멀티) |
| `fixedDiscountRate` | decimal(5,2) nullable | 고정 할인율 (legacy 50% 등) | 룰 3: F열 수식의 `$I$1` → 50% (구형) |
| `setMaterialKey` | enum `{D4, D7, D8}` nullable | 세트 자재 옵션 키 (싱글 세트/싱글 구성품) | 룰 2: `$D$4` (자재 합계 default master, 245 hits) / `$D$7` (자재 미포함, 45 hits) / `$D$8` (자재 포함, 10 hits) — Phase 3 §4.2 formulas.json grep 결과 D4 신규 발견 → enum 확장 |
| `legacyDiscountFlag` | boolean | 구형 모델 여부 (FLOW: legacy DC 트리거 조건) | 룰 3: 구형 모델 prefix 매칭 |

- 마이그 시점에 시트의 모든 품목을 일괄 스캔 → 4 룰 적용 → 4 컬럼으로 사전 계산하여 시드
- 신규 품목 등록 시에도 동일 룰을 backend service (`VariableDiscountDetector`) 에서 자동 판정
- estimate.md 의 단일 enum 안 대비 우월 — 룰 1/2/3 분리 표현 가능 (Phase 2 cross-review §4 결정)

### Phase 1 분석 agent 의무
- Apps Script 의 변동DC **감지 룰** (수식 패턴 / 키워드 매칭 / 셀 위치 등) 을 **함수 단위로 정확히 추출**
- 감지 룰을 Java 로 포팅 가능한 형태로 명세화 (`migration/analysis/01-script-analysis-{name}.md` §변동DC 섹션)

### Phase 4 Migration Plan 의무
- ProductMaster entity 에 `hasVariableDiscount` 컬럼 추가 + 시드 데이터에 boolean 채움
- 신규 등록 endpoint 에 자동 판정 service 메서드 (`VariableDiscountDetector.detect(product)`)

---

## 2. 세트(Set) 품목 처리

### 배경
- 일부 품목은 **세트(Bundle)** 구조 — 1개 SKU 가 여러 sub-품목으로 구성
- 예시 추정: 시스템에어컨 4Way 1세트 = 본체 + 유선 리모컨 + WIFI 판넬 + 배관 자재 (각각 별도 SKU 였을 수 있음)

### 결정 (Phase 2 cross-review 후 옵션 A + bundleMode 확정)

**옵션 A 채택 + bundleMode 추가** (3 옵션 중 사용자 확정):
- product 에 `productType: enum SINGLE/BUNDLE` 추가
- BUNDLE 인 경우 `bundleComponents: List<BundleComponent>` (componentProductCode + qty)
- **`bundleMode: enum EXPAND/KEEP`** 추가 — 견적/주문 라인 처리 분기:
  - **EXPAND** (default): 견적/주문 시 BUNDLE 선택하면 자동으로 component 라인 펼침 (재고 차감도 component 단위)
  - **KEEP**: BUNDLE SKU 그대로 유지 (펼치지 않음). SEND_AS_SET_IDS 화이트리스트 (4 SKU: 발통원형/발통평형/유선보드/천장펌프) 가 KEEP 으로 시드.
- partner-order Code.js 의 SEND_AS_SET_IDS 룰 (Phase 1 partner-order.md §6) 을 Java 로 포팅 시 bundleMode=KEEP 으로 마이그.

**옵션 B — flat composite 키 SKU**
- BUNDLE SKU 자체로 별도 product (component 정보 메타 텍스트만)
- 재고/단가 모두 BUNDLE 단위로만 관리
- 단순하지만 component 재고 추적 불가

**옵션 C — 견적 라인 자동 생성 매크로**
- product 자체는 SINGLE 만 — BUNDLE 은 견적 단계의 "템플릿" 으로 별도 관리
- product domain 깨끗하지만 견적 UI 복잡

### Phase 1 분석 agent 의무
- Apps Script 가 세트 품목을 어떻게 처리하는지 식별 (시트의 별도 탭? 특정 컬럼 마커? 공식 펼침?)
- 세트 품목의 데이터 구조 명세 (`migration/analysis/01-script-analysis-{name}.md` §세트품목 섹션)

### Phase 4 Migration Plan 의무
- 위 3 옵션 중 사용자 추천 안 + 의사결정 표 제공
- 채택 옵션에 따라 product domain 스키마 + 마이그 매핑 명세

---

## 3. 회고 가드 적용
- `feedback_pm_integration_build_check.md` Layer 4 (도메인 메서드 의미 정렬) — VariableDiscountDetector 룰은 명세 표 의무
- `feedback_function_documentation.md` — 한국어 Javadoc + 룰 출처 (Apps Script 함수명) 명시
- 무손실 이식 의무 — 변동DC 룰 누락 시 견적 산정 오차 발생 → QA 가 Apps Script 출력값 ↔ 신규 service 출력값 1:1 비교 (sample 30+ 품목)

---

## 4. 추후 확정 시점
- Phase 1 분석 완료 직후 (변동DC 룰 + 세트 패턴 inventory 확보 시)
- 사용자에게 세트 옵션 A/B/C 추천 후 확정 → Phase 4 Plan 에 반영

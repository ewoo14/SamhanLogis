# GAS 전수조사 v4 — 결론 반증

> 조사일: 2026-08-11  
> 역할: CODEX SOL 5.6 — v4 결론 반증자(Critic)  
> 범위: 레거시·production source·전체 GitHub Issue·기존 결정의 읽기 전용 대조와 본 보고서 작성. 코드·스키마·Git 상태·공유 DB·`samhan-*`은 변경하지 않았다. `git ls-files`와 `git grep`은 사용자 지정 3축 대조를 위한 읽기 전용 조회로만 사용했다.

## 0. 정정된 집계

### 0.1 고정된 “257개 이름 차집합 큐”의 정정

| 판정 | v4 | Critic 증감 | 정정 | 설명 |
|---|---:|---:|---:|---|
| 유실 | 9 | -9 | **0** | 8개는 D-G1 확정 범위, 1개는 존폐 결정 보류 |
| 대체 | 134 | -2 | **132** | `checkDuplicates`, `fmtMinusUnit`은 대체가 아니라 독립 이식 불필요 helper |
| 불필요 | 114 | +2 | **116** | 위 두 helper 이동 |
| **D-G1 귀속** | 0 | +8 | **8** | `setPay`, `setWht`, `setExp`, `getExpenseRate`, `xround`, `getValues`, `recalc`, `renderDoc` |
| 보류 | 0 | +1 | **1** | `checkAndUpdateNotion`: 교육 상태·Sheet 배포 존폐가 아직 상정 대기 |
| **합계** | **257** |  | **257** | `0+132+116+8+1=257` |

이 표의 257은 전수 업무규칙 분모가 아니다. v2의 다섯 보고서에서 만든 **원본-only 고유 함수명 차집합 큐**를 고정해 다시 분류한 값일 뿐이다. 전체 분모 문제는 §5에서 별도로 반증한다.

### 0.2 금액 영향의 실수치

| 세는 단위 | 정정 수 | 근거 |
|---|---:|---|
| v4가 “금액 영향 유실”로 센 함수명 | 8 | 함수명 수 자체는 맞음 |
| 그중 **D-G1 밖에서 새로 발견한 금액 유실** | **0** | 8개 모두 D-G1의 versioned 영업수수료 정산 계약에 귀속 |
| D-G1 안에서 숫자 결과를 바꾸는 함수 | **6** | `setPay`, `setWht`, `setExp`, `getExpenseRate`, `xround`, `getValues` |
| 계산하지 않고 결과를 동기화·표시하는 함수 | **2** | `recalc`, `renderDoc` |
| 이미 2026-07-29 보고서가 분해한 원자적 금액 규칙 | **11** | C-1~C-11: 3%·기준액·8%/수기·3.3%·설치 8%·안전관리비·소계·선지급·공급가·VAT·대칭 반올림 |

따라서 “금액 영향 유실 8건”은 함수 개수와 업무결정 개수를 혼합한 집계다. **신규 유실은 0건**이고, 구현 추적 단위는 이미 확정된 **D-G1 한 건**이다. 반대로 D-G1의 금액 acceptance criterion을 원자 규칙으로 세면 8이 아니라 기존 조사에서 이미 확정한 11개다.

### 0.3 판정보류 49의 정정

v4의 `유실 1 / 대체 19 / 불필요 29 / 보류 0`은 유지되지 않는다.

| 판정 | 정정 수 | 증감 |
|---|---:|---:|
| 유실 | **0** | -1 |
| 대체 | **17** | -2 |
| 불필요 | **31** | +2 |
| 보류 | **1** | +1 |
| 합계 | **49** |  |

`checkAndUpdateNotion`을 유실로 확정한 것은 기존 결정축과 정면 충돌한다. `.claude/memory/project_sp_08_legacy_gas_parity.md:45`는 Drive-only 신규 6개의 마이그레이션 대상 여부가 개발책임자 검토 대기라고 기록하고, `docs/dev-reports/2026-08-11-gas-sweep-devlead-decisions.md:206`은 “교육 상태·담당자별 Sheet 배포 존폐”를 **상정 대기**로 명시한다. 존폐가 결정되지 않은 기능은 “이식할 기능인데 없음”이라는 유실 정의를 충족하지 않는다.

---

## 1. 유실 9건의 3축 대조 감사

### 1.1 v4 보고서 자체의 완결성

v4는 §4.0에 code/issue 검색을 공통으로 한 번 적었지만, **9개 중 어느 항목에도 기존 결정축 세 칸을 완성하지 않았다.** 특히 D-G1을 본문에서 인용하면서도 분류 단계에서는 “기존 결정”이 아니라 “아직 구현이 없음”만 보아 유실로 남겼다. `checkAndUpdateNotion`은 정반대로 존폐 상정 대기 기록을 읽지 않고 유실로 확정했다.

읽기 전용 재실측:

```text
git ls-files clients services shared
  파일명 검색 commission|settlement|sales.?fee|education|training = 각 0

정확 함수 정의 git grep
  setPay|setWht|setExp|getExpenseRate|xround|getValues|recalc|renderDoc|
  checkAndUpdateNotion = 각 0

gh issue list --state all --limit 2000
  반환 205건
  영업수수료 = #977 CLOSED 1건(조사 이슈)
  판매수수료|제경비|원천징수|선지급 수수료|교육안내|등록마감일|
  신청불가|안내문자발송|교육 상태|checkAndUpdateNotion = 구현 소유 0건
```

정확 이름 0건은 사실이지만, 이름 0건은 기능 0건이 아니다. `setPay` 의미 검색에서 v4가 빠뜨린 현재 이름 `cardFeeRate|card_fee_rate|applyCardFeeLogic`을 넣으면 §2.3의 production 좌표가 나온다.

### 1.2 항목별 세 축과 정정

| 항목 | ① production 검색 | ② 전체 Issue | ③ 기존 결정 | 정정 |
|---|---|---|---|---|
| `setPay` | exact 0. 단 `card_fee_rate`, `EstimateConfig`, `applyCardFeeLogic` 존재. 견적 가산이라 정산 공제의 완전 대체는 아님 | #977 조사만 존재 | D-G1 카드 3%·versioned 계약 확정 | **D-G1 귀속** |
| `setWht` | exact 0. `원천징수|withholding|0.033`에 D-G1 계산 대응 production 0 | #977 조사만 존재 | D-G1 원천 3.3% 확정 | **D-G1 귀속** |
| `setExp` | exact 0. `제경비|expense.?rate` 대응 0 | #977 조사만 존재 | D-G1 제경비 8%/수기율 확정 | **D-G1 귀속** |
| `getExpenseRate` | exact 0. `제경비율|manual.?expense|expense.?rate` 대응 0 | #977 조사만 존재 | 위와 동일 | **D-G1 귀속** |
| `xround` | exact 0. `HALF_UP`, `DOWN`, `Math.round/floor` 등 도메인별 구현 다수 | #977 조사만 존재 | D-G1 항목별 대칭 반올림 확정 | **D-G1 귀속 / fixture** |
| `getValues` | exact 0. `차인지급액|선지급 수수료|매입계산서.*소계|CommissionSettlement` 0 | #977 조사만 존재 | D-G1 전체 정산식·세금계산서 연결 확정 | **D-G1 귀속** |
| `recalc` | 정확한 `function recalc(...)` 0. 동명 prefix의 다른 도메인 함수는 무관 | #977 조사만 존재 | D-G1 계산 snapshot·화면 범위 | **D-G1 UI helper** |
| `renderDoc` | 정확한 `function renderDoc(...)` 0. 일반 approval attachment·document renderer는 존재 | #977 조사만 존재 | D-G1 문서번호·지출결의 참조·연결 버튼 확정 | **D-G1 문서 helper** |
| `checkAndUpdateNotion` | exact/의미 검색 0 | 구현 소유 이슈 0 | memory는 이관 여부 검토 대기, 결정 정본은 존폐 상정 대기 | **보류** |

### 1.3 DB 0행은 이 분류를 바꾸지 않는다

v4의 read-only DB 결과는 settlement/education 이름 테이블 0개, 정산 직접 적용행 0개였다. 이는 구현·발화 건수의 부재를 뒷받침하지만 다음 둘을 구분하지 못한다.

1. 이미 이식하기로 결정됐으나 아직 착수 전인 D-G1
2. 이식할지 폐기할지 아직 결정하지 않은 교육 상태

따라서 DB 0행을 두 경우 모두 “유실”로 합치는 것은 3축 규칙의 결정축을 무효화한다.

---

## 2. D-G1을 다시 “유실 8건”으로 센 오류

### 2.1 기존 결정은 함수 네 개가 아니라 정산 aggregate 전체를 이미 소유한다

`docs/dev-reports/2026-08-11-gas-sweep-devlead-decisions.md:26-35`의 D-G1 계약은 다음을 이미 확정했다.

```text
versioned 수수료 계약 + 정산 엔티티
카드 3% · 제경비 8%(수기율 허용) · 원천 3.3% · 설치 8%
항목별 대칭 반올림 · 선지급은 지급액에만 반영
세금계산서 연결
```

같은 결정의 후속(`:37-158`)은 문서번호, 지출결의서 참조 첨부, 그룹웨어 연결 버튼까지 소유한다. 따라서 v4 §4.1~§4.8은 신규 발견 8건이 아니라 이미 확정된 D-G1의 구현 구성요소를 함수명으로 다시 센 것이다. v4도 마지막 문단에서 “D-G1 통합 이슈 1개”로 처리해야 한다고 스스로 인정한다.

### 2.2 레거시 원문을 연 결과

| 함수 | 원문 역할 | 숫자 변경 여부 | 정정 판정 |
|---|---|---|---|
| `setPay` | `payMethod`를 카드/현금으로 바꾸고 카드 행 표시 후 `recalc()` | 예, `getValues`의 3% 분기를 바꿈 | D-G1 입력 상태 |
| `setWht` | 원천징수 적용 bool과 표시를 바꿈 | 예, 3.3% 공제 on/off | D-G1 입력 상태 |
| `setExp` | 기본 8%/수기율 모드를 바꿈 | 예 | D-G1 입력 상태 |
| `getExpenseRate` | 수기 입력÷100 또는 0.08 반환 | 예 | D-G1 versioned rate 선택 |
| `xround` | 절대값 `Math.round` 후 부호 복원 | 예 | D-G1 대칭 원단위 반올림 계약 |
| `getValues` | 모든 입력을 결합해 소계·지급액·공급가·VAT 반환 | 예 | D-G1 계산 정본 |
| `recalc` | `getValues()` 결과를 DOM 필드에 복사하고 `renderDoc(v)` 호출 | **아니오** | D-G1 화면 orchestration helper |
| `renderDoc` | 이미 계산된 `v.*`를 HTML 문자열에 보간 | **아니오** | D-G1 문서 preview helper |

`getValues`는 스프레드시트 `Range.getValues()` 래퍼가 아니다. 원문 `tools/legacy-gas/영업수수료 계산/Index.html:323-340`에서 카드·제경비·원천·설치·안전관리비·선지급·VAT를 계산하는 정산 함수다. 반면 `recalc`와 `renderDoc`은 이름만 흔한 것이 아니라 실제 본문도 계산 규칙이 아닌 UI 동기화·표시 코드다. 이 둘까지 “금액 영향 규칙”으로 세면 같은 값을 표시할 때마다 금액 규칙 수가 늘어나는 중복 집계가 된다.

### 2.3 v4의 production 의미 검색은 0건이 아니었다

v4는 영업수수료 의미 검색을 0건이라고 썼지만, 검색어에 현재 저장소의 이름을 넣지 않았다. 읽기 전용 `git grep` 재실측은 다음 실물을 찾았다.

| 현재 실물 | 좌표 | 의미 |
|---|---|---|
| `card_fee_rate NUMERIC(5,4) DEFAULT 0.0300` | `services/dc-config-service/src/main/resources/db/migration/V4__add_estimate_config.sql:11` | 카드수수료율 저장 |
| `DEFAULT_CARD_FEE_RATE = 0.0300` | `services/dc-config-service/src/main/java/com/samhanair/logis/dcconfig/domain/EstimateConfig.java:29,64-65` | 현재 설정 정본 |
| 카드수수료 설정 UI | `clients/desktop/src/renderer/routes/EstimatePricingConfigPage.tsx:55` | “카드수수료율, 기본 0.03” |
| 견적 카드수수료 계산 | `clients/web/estimate-app/views/index.ejs:16905-16933` | 체크 시 `Math.floor(total * getCardFeeRate())`, 품목 단가에 가산 또는 별도 행 생성 |

이것은 영업수수료 **정산 aggregate의 대체 구현은 아니다**. 견적 단계에서 고객 청구액에 수수료를 가산하는 기능이고, 레거시는 정산 단계에서 지급액에서 공제한다. 그러나 “동일 의미 production 0건”이라는 v4 검색 결론은 틀렸다. D-G1 구현 시 새 3% 상수를 또 만들기 전에 현 `cardFeeRate`와 versioned settlement rate의 관계를 결정해야 한다.

---

## 3. `xround` 반증 — 유실 helper가 아니라 D-G1 반올림 계약

### 3.1 레거시 정의

`tools/legacy-gas/영업수수료 계산/Index.html:318-320`:

```javascript
function xround(n) {
  return (n < 0 ? -1 : 1) * Math.round(Math.abs(n));
}
```

자리수는 **원 단위(소수 0자리)**, 방향은 **절대값 0.5 이상 올림**, 음수도 절대값을 반올림한 뒤 부호를 복원하므로 **부호 대칭·tie away from zero**다. Java `BigDecimal.setScale(0, RoundingMode.HALF_UP)`과 유한 숫자 입력에서 같은 결과다.

### 3.2 저장소 반올림 지점과 실제 값 대조

| 입력/경로 | 레거시 | 현재 저장소 | 차이 |
|---|---:|---:|---:|
| `n=1.5` | `xround=2` | `HALF_UP=2` | 0 |
| `n=-1.5` | `xround=-2` | `HALF_UP=-2` | 0 |
| 카드 총액 `50`, 3% 절대액 | `abs(xround(-1.5))=2` | 견적 `Math.floor(1.5)=1` | **1원** |
| 카드 총액 `150`, 3% 절대액 | `5` | 견적 `4` | **1원** |
| VAT포함 소계 `111`, 공급가 | `xround(111/1.1)=101` | 공통 기본 `DOWN=100` | **1원** |
| VAT포함 소계 `112`, 공급가 | `102` | 공통 기본 `DOWN=101` | **1원** |

현재 `PriceCalculationService.java:142-153`의 기본/`ROUND`는 `HALF_UP`이라 `xround`와 일치한다. 그러나 `VatAmountCalculator.java:34-48`의 인자 없는 `splitVatInclusive`는 `DOWN`이고, 견적 카드수수료는 `index.ejs:16917`에서 `Math.floor`다. 즉 저장소에는 하나의 전역 반올림 규칙이 있는 것이 아니라 도메인별 계약이 공존한다.

판정은 다음과 같다.

- 현재 D-G1 계산 구현이 없으므로 **발화 중인 D-G1 금액 결함**이라고 단정할 수는 없다.
- `xround` 자체를 신규 helper 유실로 세는 것도 틀렸다. D-G1이 이미 “항목별 대칭 반올림”을 확정했다.
- 구현 시 공통 VAT 기본 `DOWN` 또는 견적 카드수수료 `floor`를 무심코 재사용하면 위 입력에서 1원 차이가 난다. 따라서 `xround`는 **D-G1 acceptance criterion의 금액결함 방지 fixture**로 남겨야 한다.

---

## 4. 판정보류 49 해소분의 약한 근거 5건 표집

### 4.1 표집 결과

| 표본 | v4 | 원문·현재 대조 | Critic |
|---|---|---|---|
| `checkDuplicates` | 대체 | `배차안내문자/Index.html:633`의 본문은 `checkDuplicatesFor(activeSourceBody())` 한 줄뿐. 독립 업무판단·상수·출력이 없음 | **불필요로 뒤집음** |
| `fmtMinusUnit` | 대체 | `일마감 프로그램/Code.js:383-387`은 절대값을 `-5만/-3천/-123` 문자열로 바꾸는 표시 formatter. v4도 “원본 함수 자체는 표시 helper”라고 씀 | **불필요로 뒤집음** |
| `resetCounters` | 불필요 | `가배차분류리스트/Code.js:266-267`은 전역 counter 아홉 개를 0으로 초기화. 현 `PreClassifyService.java:81-114`는 요청 로컬 count/map/list를 매 호출 새로 생성 | 불필요 **유지** |
| `detectOptionsFromRawName_` | 불필요 | 에어디자이너/제이시스템 raw OCR 이름에서 블랙·공청·승강·판넬·리모컨·호스 제외를 추론하는 **업무 parser**다. 단순 GAS API helper는 아님. 다만 `remove-ocr-menus.md:6-8`이 발주서 업로드 OCR 전체를 제거했고 V76이 권한까지 폐기 | 불필요 **유지**, 근거를 “범용 helper”가 아니라 “기능 의도적 폐기”로 정정 |
| `capQtyToOrder_` | 불필요 | `에어디자이너/Code.js:1490-1506`은 발주서 명시 수량을 budget으로 두고 초과·미존재 품목을 제거한다. 환경 adapter가 아니라 수량 결과를 바꾸며, 기존 `2026-07-29-977-money-gas-recompare.md:27`은 이 함수 안의 엄격한 조용한 누락 3개를 지적했다 | 현재 OCR 기능 폐기 때문에 불필요 **유지**, 단 GAS-direct 대체가 이 parser를 재사용하면 재심사 필요 |

### 4.2 두 판정이 뒤집힌 이유

v4의 19개 대체 목록은 완전계승 Issue가 닫혔다는 사실과 개별 함수가 대체 구현이라는 사실을 혼합했다. 닫힌 #1013/#1008은 각각 배차문자·일마감 기능 구현을 소유하지만, `checkDuplicates` 같은 한 줄 DOM wrapper와 `fmtMinusUnit` 같은 표시 formatter까지 production 대응 좌표가 있어야 한다는 뜻은 아니다. v4 자신의 불필요 기준(범용 표시·DOM helper)을 일관되게 적용하면 두 함수는 불필요다.

반대로 OCR 표본 두 개는 “레거시 환경 전용”이라고 부르면 부정확하다. 둘은 실제 옵션·수량을 바꾸는 업무 parser다. 현재 불필요인 이유는 helper의 성격이 아니라 **발주서 업로드 OCR 기능 전체를 의도적으로 제거한 결정**이다. 이 구분을 하지 않으면 향후 GAS-direct 경로가 같은 입력을 다시 받게 될 때 폐기 근거를 잘못 재사용한다.

---

## 5. 분모 257 반증

### 5.1 257의 실제 산출식

`2026-08-11-gasv2-CRITIC.md:245-255`가 밝힌 산식은 다음뿐이다.

```text
원본 업무규칙 행       395 + 86 + 209 = 690
포팅 업무규칙 행       230 + 217 = 447
원본 고유 이름 union                  = 461
포팅 고유 이름 union                  = 336
원본-only 고유 이름                  = 257
```

즉 257은 “업무규칙 총수”가 아니라 **v2의 5개 보고서가 업무규칙이라고 분류한 행에서 함수명만 집합 차감한 결과**다. rename·통합·익명 함수·동명 함수·파일/migration 규칙을 표현하지 못한다. `9+134+114=257`의 덧셈이 맞는 것은 이 고정 큐 안의 분류 합만 증명한다.

### 5.2 v3 A·B는 257 재산출에 포함되지 않았다

- A는 799개 배정, 중복 3개를 뺀 순신규 796개다. 그중 business_rule 13, ui_only 758, infra_util 25다.
- A의 업무규칙에는 익명 IIFE와 인라인 handler가 포함된다. 이름 집합인 257에는 구조상 들어갈 수 없는 항목이 있다.
- B는 golden 5 + 인쇄 5 + service 6 + migration 11 = **27개 파일**을 파일 단위 business_rule로 분류했다. 함수명 집합으로 다시 추출하지 않았다.
- v3 §5의 257은 A·B를 반영해 재산출한 결과가 아니라 v2 Critic의 257 목록을 그대로 가져와 성격만 분류한 것이다.

따라서 질문 “A(796)·B(27파일)에서 나온 이름이 257에 포함됐는가?”의 답은 **아니오**다. A·B는 별도 분모로 분류됐을 뿐 257의 입력 집합에 합쳐지지 않았다.

### 5.3 정정된 분모 판정

| 표현 | 판정 |
|---|---|
| “원본-only 함수명 검토 큐 257개” | 유지 가능 |
| “GAS 업무규칙 전수 분모 257개” | **철회** |
| 현재 보고서로 확정 가능한 전체 분모 | **미확정** |
| v2 Critic의 당시 71파일 semantic-named AST 하한 | **최소 3,595**(parse diagnostic 20건 때문에 하한) |

3,595와 A/B 수를 단순 덧셈해서 새 전수 분모를 만들 수도 없다. A의 상당수는 3,595 AST 측정과 겹치고, B는 파일 단위이며 migration·fixture까지 섞여 단위가 다르다. 필요한 것은 commit을 고정한 동일 extractor로 AST/handler/manifest/oracle/migration 분모를 각각 다시 산출하는 일이다.

---

## 6. “대체 134”의 대응 좌표 감사

### 6.1 v4 수치 기준

`파일:줄`이 한 항목마다 명시돼야 한다는 엄격한 기준을 적용했다. 다만 v4의 축약 경로(`.../BundleExpander.java:326-369`)와 짧은 파일명(`SlipService.java:246-329`)도 좌표가 있는 것으로 **관대하게 인정**했다.

| 구성 | 대체 수 | 개별 파일:줄 있음 | 없음 |
|---|---:|---:|---:|
| v3 기존 대체 | 109 | 0 | **109** |
| v3 유실→v4 대체 | 6 | 0 | **6** |
| 보류→v4 대체 | 19 | 10 | **9** |
| **합계** | **134** | **10** | **124** |

보류→대체 19 중 좌표가 없는 9개는 다음과 같다.

```text
proceedToDateModal, sendToEcountAPI, checkDuplicates, extractNum, fmtMinusUnit,
isExcludedByName, isExcludedByWord, recalcRow, boolKey
```

v3 대체 109는 이름 전량 목록 뒤에 snapshot/history, 가격, 지역, 세트, 회계 등 **그룹별 클래스명**만 지목했다. 어느 원본 이름이 어느 메서드의 어느 줄과 대응하는지 1:1 좌표가 없다. v4가 새로 대체로 돌린 6개(`parseAccountLedger`, `checkDuplicatesFor`, `getDeliveryInitialState`, `executePromo`, `executeGolf`, `initDayMappingUI`)도 Issue/클래스명만 있고 개별 파일:줄은 없다.

### 6.2 정정 집계 기준

`checkDuplicates`, `fmtMinusUnit`을 불필요로 옮긴 뒤에는 대체가 132개다. 두 항목 모두 좌표가 없던 항목이므로 좌표 감사 결과는 다음과 같다.

```text
정정 대체 132
  개별 파일:줄 있음 10
  개별 파일:줄 없음 122
  좌표 미기재율 92.4%
```

따라서 “대체 134”는 대부분 검증 완료 판정이 아니라 **그룹 수준 대응 주장**이다. 닫힌 Issue는 구현 소유권을 증명하지만, 함수별 입력·상수·분기·출력의 semantic parity를 대신하지 않는다.

---

## 7. 최종 판정

1. v4의 “유실 9”는 **유실 0 / D-G1 귀속 8 / 보류 1**로 고친다.
2. v4의 “금액 영향 유실 8”은 **D-G1 밖 신규 유실 0**이다. 함수 기준 직접 숫자 영향은 6, 표시 helper는 2이며 원자 금액 계약은 기존 보고서의 11개다.
3. `xround`는 D-G1의 대칭 HALF_UP 계약이다. 현재 D-G1 구현이 없어 현행 결함으로 확정하지 않지만, 기존 `floor`/`DOWN`을 재사용하면 실제 1원 차이가 난다.
4. 49건은 `대체 17 / 불필요 31 / 보류 1 / 유실 0`이다.
5. 257은 전수 분모가 아니라 v2 이름 차집합 큐다. A 796·B 27파일은 포함되지 않았다.
6. v4 대체 134개 중 최소 124개, 정정 대체 132개 중 122개는 개별 `파일:줄` 좌표가 없다.

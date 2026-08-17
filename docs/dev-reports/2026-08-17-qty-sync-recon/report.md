# 2026-08-17 수량동기화 규칙 정찰 보고서

> 범위: PR #1268 착수 전 정찰. 애플리케이션 코드·공유 DB·공유 컨테이너는 변경하지 않았다.  
> 근거 기준: 현재 워크트리 코드, 읽기 전용 DB 조회, `tools/legacy-gas`, PR #1260 기록, 공유 스택 화면 관찰.

## ① 한 장 요약

### 숫자로 먼저 답

| 항목 | 실측/전수 결과 |
|---|---:|
| 활성 `quantity_sync_rule` | **1건** |
| 활성 규칙의 조건 | **`{}` 1건** |
| 그 규칙의 source / target | **1 / 3** |
| 레거시의 제품 연동 수량 규칙 계열 | **68계열** = 홈멀티 23 + 싱글 5 + 상업멀티 40 |
| 제품 외 금액 파생·역동기화까지 포함한 넓은 전수 | **74계열** = 68 + 금액 파생 5 + 역동기화 1 |
| source 없는 상수 초기화 | **1건(H06)** — 계열 수에는 미포함 |
| 현 스키마에 구조적으로 저장 가능한 제품 연동 계열 | **62/68** |
| 현 스키마만으로 표현 불가한 제품 연동 계열 | **6/68** |
| 넓은 74계열 중 현 스키마만으로 표현 불가 | **12/74** = 제품 연동 6 + 비제품 5 + 역동기화 1 |
| 옵션 조건 평가가 필요한 제품 연동 계열 | **55/68** |
| 라이브 관찰 | **5시나리오, 스크린샷 5장, 행 수·수량 합계 기록** |
| #1260 도달 결함 | **규칙만으로 종결 0건 / 규칙 실행층까지 포함하면 1건 / 별도 데이터·화면 연결도 필요한 2건** |

### 현재 수량 경로

현재 구현은 **하드코딩 레거시 계산과 서버 규칙 계산이 섞인 이중 경로**다. 화면은 서버 규칙을 먼저 평가해 두지만, 이어서 홈멀티 하드코딩 함수 5개를 실행하고, 그 결과에서 규칙 source별 기여분을 빼고 규칙 target으로 다시 덮는다. 따라서 활성 규칙의 `condition_json={}`이어도 하드코딩 계산은 계속 돈다. 더 중요한 사실은 현재 홈멀티 evaluator가 `condition_json` 자체를 읽지 않는다는 점이다.

```text
카탈로그 + 활성 규칙 로드
  → 규칙 source snapshot/evaluate
  → 홈멀티 하드코딩 5종 계산
  → 하드코딩 결과에서 규칙 source별 기여분 제거
  → 규칙 target 적용
  → 옵션군별 후처리(reconciliation)
```

규칙 데이터만 68계열 채우는 것으로는 설계 의도 ①~③이 실행되지 않는다. 저장 API는 조건 DSL을 검증하지만, 견적 홈멀티 evaluator는 조건을 평가하지 않고 주문 앱 evaluator는 비어 있지 않은 조건을 거부한다.

### 스키마 수용성

DB는 rule/source/target과 조건 DSL(`optionEquals`, `optionIn`, `all`, `any`, `not`)을 저장할 수 있다. 단순 합·배수·내림·ADD/REPLACE 관계 62계열은 정적 source/target으로 저장할 수 있다. 반면 잔여 차감, 교차 세트 gate, BOM 전개, 이름의 `+` 개수 파싱, DOM badge 집계 6계열은 현 스키마만으로 표현되지 않는다. 저장 가능성과 현재 소비자가 실제 실행 가능하다는 것은 별개다.

기존 정찰 문서 일부의 “표현 불가 11계열” 표기는 열거 산술과 맞지 않는다. 실제 열거는 `H03,H04,S05,C39,C36,C40` 6개 + `N01~N05` 5개 + `R01` 1개로 **12계열**이다. 본 보고서는 열거값을 기준으로 한다.

### #1260 세 결함의 범위 귀결

1. 홈멀티 기본·유선 수량 소실/축소: 전체 규칙뿐 아니라 **조건 평가와 하드코딩/규칙 소유권 정리**가 함께 있으면 같은 수량 연결층에서 다룰 수 있다.
2. 인피니트 공청 `PC1ZNCK1NW=0`: 조건부 target 규칙 외에 **해당 target의 화면 카탈로그 노출/가용성**이 필요하다.
3. 상업멀티 구성품 옵션 미반영: 수량 규칙이 아니라 **옵션 목록 데이터 소스를 COMM_PARTS 구성품 응답에 연결하는 화면 bootstrap**이 별도로 필요하다.

## ② 현재 수량 계산 경로 (파일:줄)

### 2.1 규칙 로드

- `clients/web/estimate-app/lib/db-catalog.js:48-54`: internal product API에서 홈멀티 수량동기화 규칙을 읽어 카탈로그 bootstrap에 포함한다.
- `clients/web/estimate-app/views/index.ejs:2268-2270`: enabled 규칙만 `homeQuantitySyncRules`로 잡는다.
- 읽기 전용 DB 실측 활성 규칙:
  - `rule_key=UI_HOME_MULTI_AM052BN6PBH1`
  - `estimate_category=HOME_MULTI`, `aggregation=SUM`, `inactive_behavior=ZERO`, `conflict_policy=REPLACE`
  - `condition_json={}`, `priority=1000`, `legacy_ref=UI:AM052BN6PBH1`
  - source `AM052BN6PBH1 × 1`
  - target `AWR-WE13N × 1`, `FH-LFHLN × 1`, `PC6NUDK1NW × 1`

### 2.2 혼합 계산 순서

- `clients/web/estimate-app/views/index.ejs:8479-8503`: 현재 행을 snapshot하고 서버 규칙을 평가한다.
- `clients/web/estimate-app/views/index.ejs:8505-8510`: 규칙 평가와 별개로 레거시 하드코딩 5종을 모두 실행한다.
  - 발통/받침: `7983-8020`
  - 패널: `8165-8275`
  - 리모컨: `8278-8328`
  - 분기관: `8332-8390`
  - 드레인호스: `8392-8443`
- `clients/web/estimate-app/views/index.ejs:8512-8517`: 하드코딩 결과를 다시 snapshot한다.
- `clients/web/estimate-app/views/index.ejs:8519`: 원 source 수량을 복구한다.
- `clients/web/estimate-app/views/index.ejs:8521-8554`: 규칙 source별 하드코딩 기여분을 빼는 neutral merge를 수행한다.
- `clients/web/estimate-app/views/index.ejs:8556-8560`: 서버 규칙 target을 적용한다.
- `clients/web/estimate-app/views/index.ejs:8562-8651`: 패널·리모컨 등 옵션군별 후처리로 다시 수량을 조정한다.
- `clients/web/estimate-app/views/index.ejs:8445-8475`: 규칙 target을 0으로 지운 뒤 evaluator 결과를 적용한다.

### 2.3 evaluator가 실제로 읽는 것

- `clients/web/estimate-app/src/quantitySync.ts:40-69`: HOME_MULTI, enabled, SUM, ZERO, source/target 배열과 카탈로그 존재 여부를 검사한다.
- `clients/web/estimate-app/src/quantitySync.ts:72-96`: `Σ(source 수량 × factor)`, `target=합계×multiplier`, 선택적 FLOOR, ADD/REPLACE를 계산한다.
- 브라우저 배포본도 같은 동작이다: `clients/web/estimate-app/public/quantitySync.js:23-70`.
- 이 evaluator는 `condition_json/when`, `componentVariant`, `componentShape`를 읽거나 평가하지 않는다.
- 규칙 하나라도 형식·카탈로그 검사를 통과하지 못하면 evaluator 결과가 `null`이 되어 규칙 묶음 전체가 레거시 계산에 남는다.
- 주문 앱의 현재 범위는 더 좁다. `clients/web/order-app/src/quantitySync.ts:118-128`은 SINGLE_SET/SUM/ZERO만 받고, `when` 또는 `conditionJson`이 비어 있지 않으면 “조건 없는 설정만 지원” 오류로 거부한다.

### 2.4 `condition_json={}`인데도 수량이 계산되는 이유

1. `{}`는 product-service 저장 validator가 허용하는 무조건 조건이다.
2. 견적 홈멀티 evaluator는 조건 필드를 아예 읽지 않는다.
3. 규칙 적용 전후로 하드코딩 레거시 함수 5개가 실행된다.
4. 따라서 현재 수량의 상당수는 여전히 하드코딩에서 나오며, 활성 1건이 해당 source/target 일부만 덮는다.

### 2.5 라이브 화면 관찰

인증은 지정된 `clients/desktop/playwright/1008-daily-closing-real-qa/daily-closing.spec.ts:14-25` 패턴을 사용했다. 공유 DB는 읽기만 했고, 화면 입력은 브라우저 로컬 견적 상태만 변경했다. 캡처는 `resolveQaShotsDir()`을 통해 `docs/qa/2026-08-17-qty-sync-recon-real-qa/`에 저장했다.

| 장면 | 입력 | 부자재 행 | 수량 합 | 관찰 모델별 수량 | 증거 |
|---|---|---:|---:|---|---|
| 홈 기본 | `AM052BN6PBH1=2`, `AM060BN6PBH1=3` | 3 | 6 | `PC6NUDK1NW=2`, `AWR-WE13N=2`, `FH-LFHLN=2` | `01-home-default.png` |
| 홈 유선 | 위와 같고 유선 선택 | 4 | 11 | 위 3종 각 2 + `AIM-A01N=5` | `02-home-wired.png` |
| 인피니트 대형 공청 | `AJ052CN1FBC1=2`, 공기청정 선택 | 1 | 2 | `AIM-A01N=2`, `PC1ZNCK1NW` 행 없음/0 | `03-home-infinite-air.png` |
| 상업 4way 기본 | `AM052BN4DBH1=2` | 3 | 6 | `PC4NUFK1NW=2`, `AR-EH05=2`, `FH-LFHLN=2` | `04-comm-basic.png` |
| 상업 4way 공청 | 같은 본체, 공기청정 선택 | 3 | 6 | `PC4NUCK4NW=2`, `AR-EH05=2`, `FH-LFHLN=2` | `05-comm-air.png` |

첫 두 장면의 본체 총수량은 5지만 활성 규칙 source는 `AM052BN6PBH1` 하나뿐이므로 세 target이 2로 축소된다. 화면 수치가 현재 혼합 경로와 일치한다.

## ③ 레거시 규칙 전수 목록

### 3.1 레거시 코드 위치

- 홈멀티: `tools/legacy-gas/종합견적서/index.html:7524-7954`
  - 전체 발통 `7524-7535`, 싱글 발통 `7538-7577`, 싱글 추가 리모컨/배수펌프 `7579-7601`
  - 패널 `7623-7789`, 리모컨 `7791-7836`, 분기관 `7838-7897`, 호스와 orchestrator `7900-7954`
- 상업멀티 파생 전체: 같은 파일 `7956-8162`
  - 패널 `7971-7977`, 호스 `7979-8005`, 리모컨 `8007-8021`, 펌프 `8023-8036`
  - 받침/T분기관 `8038-8063`, 필터 `8065-8074`, 제외·수동·업데이트 `8076-8139`
  - 패널 매핑 `8166-8248`
- 상업멀티 세트 계산: `chooseBaseModel` `3734-3776`, 세트 구성 `3779-3788`, 모델명 `+` 개수 `3803-3810`, 필터 map `3812-3816`.
- 싱글 BOM: `explodeSetParts` `4780-4829`.
- 상업멀티 BOM: `explodeCommSets_` `6791-6831`.
- 분기관 badge/DOM 집계: `recomputeBranchCodes` `12361-12428`.
- 구성품→본체 역동기화: `18803-18885`.

### 3.2 홈멀티 23계열

| ID | source 조건 | target/수식 |
|---|---|---|
| H01 | 1way 실내기 | `FH-LFHLF` 또는 `FH-LFHIF` × 본체수량 |
| H02 | 4way·360 실내기 | `FH-LFHLN` × 본체수량 |
| H03 | 잔여 대상 실내기 | `AXJ-YA1509N=max(0, 전체-다른 분기관 배정량)` |
| H04 | 6HP 단독 실외기 | 교차 세트 gate 후 `AXJ-YA2512N` |
| H05 | 실외기 | 발통세트 × 실외기수량 |
| H07 | 공기청정 조합 | `AWR-WV00N` × 해당 실내기수량 |
| H08 | 360 | 견적 `AR-EC05`; 주문 레거시는 `AR-KH05` 충돌 |
| H09 | 인피니트 | `AR-CH01` × 수량 |
| H10 | 1way·4way·벽걸이 | `AR-EC05` × 수량 |
| H11 | 전체 실내기 | 유선 색상에 따라 `AWR-WE13N`/`AWR-WG00N` |
| H12 | 전체 실내기 | 유선 선택 시 `AIM-A01N` |
| H13 | 1way 소형 WIFI | `PC1MWSK3NW`↔`PC1MWCK3NW` |
| H14 | 1way 중형 WIFI | `PC1NWSK3NW`↔`PC1NWCK3NW` |
| H15 | 1way 대형 WIFI | `PC1BWSK3NW`↔`PC1BWCK3NW` |
| H16 | 1way 소형 무WIFI | `PC1MWSK3N`↔`PC1MWCK3N` |
| H17 | 1way 중형 무WIFI | `PC1NWSK3N`↔`PC1NWCK3N` |
| H18 | 1way 대형 무WIFI | `PC1BWSK3N`↔`PC1BWCK3N` |
| H19 | 4way WIFI | `PC4NUFK1NW`↔`PC4NUCK4NW` |
| H20 | 4way 무WIFI | `PC4NUFK1N`↔`PC4NUCK1N` |
| H21 | 360 WIFI | `PC6NUDK1NW`↔`PC6NUCK1NW` |
| H22 | 360 무WIFI | `PC6NUDK1N`↔`PC6NUCK1N` |
| H23 | 인피니트 중형 | `PC1YNWK1NW`/`PC1YNCK1NW`/`PC1YNRK1NW` 중 옵션 선택 target |
| H24 | 인피니트 대형 | `PC1ZNSK1NW`/`PC1ZNWK1NW`/`PC1ZNCK1NW`/`PC1ZNRK1NW` 중 옵션 선택 target |

별도 상수 초기화 H06: `AXJ-TA3419M=0`. source가 없어 수량 관계 계열 수에는 포함하지 않았다.

### 3.3 싱글 5계열

| ID | source 조건 | target/수식 |
|---|---|---|
| S01 | 싱글 세트 | 발통세트 × 세트수량 |
| S02 | AP230/AP290 계열 | `SI-AL700a` × 세트수량 |
| S03 | 1way 세트 + 유선 옵션 | `AIM-A01N` × 세트수량 |
| S04 | 천장형 세트 | `ADP-F075SP` × 세트수량 |
| S05 | 세트 | 싱글 구성품 BOM 전개, 구성품 옵션 필터 적용 |

### 3.4 상업멀티 40계열

| ID | source 조건 | target/수식 |
|---|---|---|
| C01 | 2way | `PC2NWSK1N` |
| C02 | 1way WIFI 소형 | 소형 기본/공청 패널 |
| C03 | 1way WIFI 중형 | 중형 기본/공청 패널 |
| C04 | 1way WIFI 대형 | 대형 기본/공청 패널 |
| C05 | 1way 무WIFI 소형 | 소형 기본/공청 패널 |
| C06 | 1way 무WIFI 중형 | 중형 기본/공청 패널 |
| C07 | 1way 무WIFI 대형 | 대형 기본/공청 패널 |
| C08 | 인피니트 중형 | `PC1YNWK1NW`/`PC1YNRK1NW` |
| C09 | 인피니트 대형 | `PC1ZNWK1NW`/`PC1ZNRK1NW` |
| C10 | 4way WIFI 미니 | `PC4SUFK1NW` |
| C11 | 4way WIFI 일반 | `PC4NUFK1NW` 및 검정/승강/공청 변형 |
| C12 | 4way 무WIFI 미니 | `PC4SUFK1N` |
| C13 | 4way 무WIFI 일반 | `PC4NUFK1N` 및 검정/승강/공청 변형 |
| C14 | 360 WIFI | 원형/사각 × 기본/검정/공청/공청검정 8 target |
| C15 | 360 무WIFI | 원형/사각 × 기본/검정/공청/공청검정 8 target |
| C16 | 1way·2way | `FH-LFHLF`/`FH-LFHIF` |
| C17 | 360·4way | `FH-LFHLN` |
| C18 | ERV | `AWR-VH12N` |
| C19 | 덕트 | `AWR-WE13N`/`AWR-WG00N` |
| C20 | 일반 실내기 | 유선/색상에 따라 `AWR-WE13N`/`AWR-WG00N` |
| C21 | UV·인피니트 + 무선 | `AR-CH01` |
| C22 | 기타 실내기 + 무선 | `AR-EH05` |
| C23 | 슬림덕트 | `MDP-Z075SZED` |
| C24 | `AM100FNL...` | `ADP-E075SEK3D` |
| C25 | 중정압 | `MDP-M075SGK2D` |
| C26 | 고정압 12모델 | `ADP-G075SPK1D` |
| C27 | `AM290...` | `ADP-N047SNK1D` |
| C28 | 천장형 | `ADP-F075SP` |
| C29 | DVM S2 소형 HP/이름군 | 소형 S2 받침 |
| C30 | DVM S2 중형 HP/이름군 | 중형 S2 받침 |
| C31 | DVM S2 대형 HP/이름군 | 대형 S2 받침 |
| C32 | GHP 실외기 | `GHP방진가대` |
| C33 | GHP 실외기 | `ACL-KORGHP07` |
| C34 | ECO 3.5~6HP | `SI-AL600a` |
| C35 | ECO 7.5~14HP | `SI-AL700a` |
| C36 | 세트 실외기 모델명 | `AXJ-TA3419M × ('+' 개수 기반 실외기 대수)` |
| C37 | ECO 3HP | `AF-R09A` |
| C38 | `AM075...` | `AF-R12A` |
| C39 | 상업 세트 실외기 | 상업멀티 구성품 BOM 전개 |
| C40 | 화면 분기관 badge | DOM에서 집계해 6종 `AXJ-YA...` target 산출 |

### 3.5 넓은 범위의 비제품·역동기화 6계열

| ID | source | target/수식 |
|---|---|---|
| N01 | 운임 금액 입력 | 운임 행 수량 1 |
| N02 | 절사 금액 입력 | 절사 행 수량 1, 음수 가격 |
| N03 | 견적 총액 나머지 | 자동 절사 금액 |
| N04 | 카드 수수료 입력 | 수수료 파생 행 |
| N05 | 선입금 할인 입력 | 할인 파생 행 |
| R01 | 구성품 수량 | 본체 세트 수량 `MAX` 역동기화 |

## ④ 규칙 스키마 수용 가능성

### 4.1 컬럼 전수

마이그레이션 근거: `services/product-service/src/main/resources/db/migration/V24__create_quantity_sync_rules.sql:8-106`, shape/variant 확장 `V41__add_quantity_sync_target_option_context.sql:3-9`.

**`quantity_sync_rule` — 18컬럼**

| 컬럼 | 의미 |
|---|---|
| `id uuid` | 내부 식별자 |
| `rule_key varchar` | 사용자·API용 규칙 키 |
| `estimate_category varchar` | HOME_MULTI/SINGLE_SET/COMM_MULTI |
| `name varchar` | 규칙명 |
| `enabled boolean` | 활성 여부 |
| `aggregation varchar` | 현재 SUM만 허용 |
| `condition_json jsonb` | 조건 DSL object |
| `inactive_behavior varchar` | ZERO/KEEP |
| `conflict_policy varchar` | ADD/REPLACE |
| `priority integer` | 0 이상 실행 우선순위 |
| `legacy_ref varchar` | 레거시 근거 참조 |
| `created_at`, `created_by` | 생성 audit |
| `modified_at`, `modified_by` | 수정 audit |
| `deleted_at`, `deleted_by`, `is_deleted` | soft-delete audit |

**`quantity_sync_source` — 11컬럼**

| 컬럼 | 의미 |
|---|---|
| `id uuid` | 내부 식별자 |
| `rule_id uuid` | rule FK |
| `source_product_id uuid` | source 제품 FK |
| `factor numeric` | source 수량 계수, 0 초과·1000 이하 |
| 나머지 7 audit 컬럼 | `created_at/by`, `modified_at/by`, `deleted_at/by`, `is_deleted` |

**`quantity_sync_target` — 15컬럼**

| 컬럼 | 의미 |
|---|---|
| `id uuid` | 내부 식별자 |
| `rule_id uuid` | rule FK |
| `target_product_id uuid` | target 제품 FK |
| `multiplier numeric` | target 배수, 0 초과·1000 이하 |
| `rounding_mode varchar` | NONE/FLOOR |
| `display_order integer` | 1 이상 표시 순서 |
| `component_variant varchar nullable` | target 구성품 옵션 variant |
| `component_shape varchar nullable` | 원형/사각 |
| 나머지 7 audit 컬럼 | `created_at/by`, `modified_at/by`, `deleted_at/by`, `is_deleted` |

### 4.2 `condition_json` 정의 수준

- 요청 DTO는 `when`을 `condition_json`으로 받는다: `QuantitySyncRuleRequest.java:18-54`.
- validator의 허용 operator는 `optionEquals`, `optionIn`, `all`, `any`, `not`: `QuantitySyncRuleValidator.java:30-37`.
- `{}`는 무조건 규칙으로 허용하고, 비어 있지 않으면 정확히 operator 하나를 요구한다: 같은 파일 `552-577`.
- `optionEquals`는 scalar 값, `optionIn`은 비어 있지 않은 scalar 배열, `all/any/not`은 재귀 object를 받는다: `580-620`.
- option key는 비어 있지 않은 문자열이라는 검증만 있고, 공인 key 목록·타입별 의미·화면 옵션과의 canonical mapping은 정의돼 있지 않다.
- 코드와 validator 테스트에는 DSL 형태가 있으나, 현재 견적/주문 소비자가 이를 실행하는 공통 evaluator 계약은 없다.

### 4.3 68계열 표현 가능성

**구조적으로 저장 가능 62계열:** source 제품을 정적으로 열거하고, 옵션 조건 evaluator가 존재한다는 전제에서 SUM×factor/multiplier 및 target variant/shape로 표현되는 관계다. 이 중 55계열은 실제 동작에 옵션 조건 평가가 필요하다.

**현 스키마만으로 표현 불가 6계열:**

| ID | 막히는 연산 |
|---|---|
| H03 | 다른 배정량 차감, `max(0, ...)` |
| H04 | 다른 세트 존재 여부에 따른 교차 source gate |
| S05 | 구성품 BOM 조회·전개 및 구성품 기본수량/옵션 필터 |
| C36 | 제품명 문자열의 `+` 개수 파싱으로 계수 산출 |
| C39 | 상업 구성품 BOM 조회·전개 |
| C40 | DOM badge와 화면 순서 상태를 source로 집계 |

C29~C35는 현재 카탈로그 제품을 source로 정적 열거하면 저장 가능하지만, 레거시처럼 HP/이름 조건으로 미래 신규 제품을 자동 포착하는 동적 규칙은 표현하지 못한다.

**넓은 74계열 기준 추가 불가 6계열:** N01~N05는 제품 수량이 아닌 금액/총액을 source로 쓰고, R01은 target 합계가 아니라 구성품→본체 `MAX` 역방향이다. 따라서 넓은 기준 불가 합계는 12계열이다.

### 4.4 저장 가능과 실행 가능의 간극

| 층 | 현 상태 |
|---|---|
| DB/관리 API | 조건 DSL과 source/target/variant/shape 저장 가능 |
| 견적 홈멀티 | 조건·variant·shape 미평가, 레거시와 neutral merge 혼합 |
| 주문 싱글 | 비어 있지 않은 조건 거부 |
| 상업멀티 | 레거시 하드코딩/BOM/DOM 계산이 주 경로 |
| 카탈로그 | 규칙 target이 화면 카탈로그에 없으면 evaluator가 규칙 묶음을 적용하지 못할 수 있음 |

## ⑤ #1260 결함 3건이 풀리는가

| 결함 | 규칙 데이터만 채움 | 필요한 층 | 범위 사실 |
|---|---|---|---|
| 홈멀티 기본·유선에서 리모컨 수량 소실/축소 | **아니오** | 전체 source 규칙, 옵션 조건 evaluator, 하드코딩/규칙 이중 소유권 제거 또는 명시적 병합 | 활성 1건이 source 2만 덮어 본체 총 5 중 target 2를 만들었다. 같은 수량 연결층에서 재현됨 |
| 인피니트 공청에서 `PC1ZNCK1NW=0` | **아니오** | H24 조건부 target 규칙 + 조건 evaluator + target의 화면 카탈로그 노출/가용성 | 라이브에서 target 행이 없었다. 규칙만 있어도 target을 찾지 못하면 적용 불가 |
| 상업멀티 구성품 옵션 변경이 셀렉트에 미반영 | **아니오** | COMM_PARTS 구성품 응답을 옵션 목록 bootstrap에 연결 | 수량 계산 뒤가 아니라 옵션 목록 생성 전의 데이터 소스 문제 |

세 결함 모두 “규칙 행을 대량 insert”하는 것만으로는 닫히지 않는다. 첫 결함은 규칙 실행층과 동일 슬라이스에 속하고, 둘째는 규칙+카탈로그 연결, 셋째는 화면 옵션 데이터 연결이라는 추가 작업 단위를 가진다.

## ⑥ 착수 계획 제안

아래는 선택 판정이 아니라 의존성 기준의 4개 슬라이스 계획안이다.

1. **계약·실행층 슬라이스**
   - option key/값 canonical 사전 고정
   - 공통 condition evaluator와 target variant/shape 적용 계약
   - 견적·주문 소비자별 지원 범위 명시
   - 규칙 단건 오류 시 전체 fallback인지 단건 격리인지 테스트로 고정
   - 하드코딩과 규칙의 target 소유권/병합 순서 golden test
2. **표현 가능 62계열 데이터 슬라이스**
   - HOME_MULTI 23, SINGLE_SET 중 단순 4, COMM_MULTI 중 단순 35를 가족별 seed
   - 현재 활성 orphan 1건과의 중복/REPLACE 충돌 정리
   - 각 규칙 source 합계·옵션별 target 기대치를 레거시 golden table과 대조
3. **표현 불가 6계열 처리 슬라이스**
   - H03/H04/S05/C36/C39/C40 각각에 대해 스키마 확장 또는 레거시 adapter 경계 산출
   - 동적 이름/HP 규칙 C29~C35의 신규 제품 포착 방식 포함
4. **#1260 도달 결함 연결·라이브 회귀 슬라이스**
   - `PC1ZNCK1NW` 등 target 카탈로그 노출
   - 상업멀티 옵션 목록의 COMM_PARTS 연결
   - 홈 기본/유선, 인피니트 공청, 상업 구성품 옵션 3종을 행 수·수량으로 E2E 고정

## ⑦ 판단이 필요한 지점 (선택하지 않음)

1. “부자재 전부”의 범위를 제품 연동 68계열로 한정할지, N01~N05/R01까지 74계열로 볼지.
2. H03/H04/S05/C36/C39/C40을 DSL 확장으로 흡수할지, 명시적 레거시 adapter로 남길지.
3. C29~C35를 현재 제품코드 정적 source 목록으로 저장할지, 제품 속성 predicate를 스키마에 추가할지.
4. 견적/주문 간 충돌값: H08의 360 리모컨 `AR-EC05` 대 `AR-KH05`.
5. 상업 T분기관 gate, 4way 공청 target, 홈 360 리모컨 등 앱별 legacy 차이를 어느 계약으로 고정할지.
6. option key와 값의 공인 사전 및 “기본”의 의미를 target별로 어떻게 canonicalize할지.
7. 조건 evaluator의 적용 소비자 범위를 estimate-app, order-app, 데스크톱, 서버 중 어디까지 동시에 묶을지.
8. 규칙 target이 화면 카탈로그에 없을 때 전체 규칙 fallback, target 단건 제외, 카탈로그 강제 포함 중 어느 동작을 계약으로 둘지.
9. 상업멀티 셀렉트가 COMM_MULTI 제품 옵션과 COMM_PARTS 구성품 옵션 중 무엇을 기준으로 합성할지.
10. 동일 target에 복수 REPLACE 규칙이 겹칠 때 priority/condition 충돌 의미를 실행층에서 어떻게 고정할지.

## ⑧ 프로세스 회수

- 정찰용으로 시작한 임시 estimate-app 서버: 종료 대상 PID를 별도 기록하고 종료한다.
- Playwright가 만든 task 전용 프로세스: 테스트 종료 후 잔존 여부를 확인한다.
- 최초 잘못 생성된 `_local` 캡처와 task 전용 `test-results`: 최종 증거가 아님을 확인한 뒤 task 경로만 제거한다.
- 공유 스택 컨테이너: 시작 시 **24개 healthy**였으며 stop/restart하지 않는다.
- 최종 잔여 수는 회수 직후 새 명령으로 확인해 아래에 기록한다.

- 회수 결과(최종 확인 시각 기준):
  - task PID `122796`: **0개 잔존**
  - task port `5183` listener: **0개 잔존**
  - task 이름이 포함된 command line process: **0개 잔존**
  - task 전용 `test-results`, task QA `_local`, 임시 stdout/stderr log: **0개 잔존**
  - 전체 Node/Codex process: 시작 **44/43**, 최종 **45/44**. 다른 라운드가 동시에 실행 중이어서 전체 증감은 본 task 소유로 판정하지 않았고, 위 task 식별자 기준 잔존은 0이다.
  - 공유 Samhan 스택: **24개 모두 healthy**, 본 task는 stop/restart하지 않았다.
  - 회수 1차 확인 때 `docker ps`는 **26개**였다. 공유 24개 외 타 라운드의 임시 컨테이너 2개가 보였으나 본 task가 조작하지 않았다. 최종 게이트 때는 두 임시 컨테이너가 사라져 **공유 24개만 실행 중이며 24개 모두 healthy**다.
  - 최종 라이브 재검증: Playwright **1/1 passed (11.7초)**. 재검증 서버 PID `81940`, port `5183`, 임시 로그, `test-results`, task QA `_local`은 재확인 결과 모두 **0개 잔존**.

## 증거 파일

- 라이브 스펙: `clients/desktop/playwright/2026-08-17-qty-sync-recon-real-qa/qty-sync-recon.spec.ts`
- Playwright 설정: `clients/desktop/playwright/2026-08-17-qty-sync-recon-real-qa/playwright.config.ts`
- 측정 JSON: `docs/qa/2026-08-17-qty-sync-recon-real-qa/measurements.json`
- 화면 캡처: 같은 디렉터리의 PNG 5장

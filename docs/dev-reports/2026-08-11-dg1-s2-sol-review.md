# D-G1 S2 SOL 5.6 검토 — versioned 요율 계약 + 정산 계산기

> 검토일: 2026-08-11
> 대상: PR #1165 / HEAD `06bb8bf6ed1d78a9d2c96abb6aa0d92051f5a30c`
> 범위: D-G1 S2만 검토. S3 그룹웨어, S4 화면·버튼, D-G7 기준일 잠금은 검토하지 않음.
> 공유 DB write, 배포, git 변경 조작은 수행하지 않음.

## 1. 판정

**차단 결함 1건. 구현자 수정 후 SOL 재검토가 필요하다.**

레거시 공식·반올림·BigDecimal 계산, V97→V98 순서, 전체 accounting 회귀는 확인됐다. 그러나 “요율을 바꾼 뒤 과거 정산을 다시 조회해도 계약 버전과 금액이 그대로”라는 versioned 불변식이 production 경계에서 강제되지 않는다.

- 저장된 snapshot을 단순 조회하는 현재 `findByDocumentNo`는 재계산하지 않는다.
- 그러나 실제 계산 서비스는 계약 저장소에서 버전을 고정하지 않고 호출자가 건넨 `SalesCommissionRateContract` 객체를 그대로 신뢰한다.
- `recordCalculation`은 상태·기존 계산 여부를 확인하지 않고 FK·입력·결과 전부를 덮어쓴다. 따라서 이미 `CONFIRMED`인 과거 정산에도 새 계약을 넘겨 `calculate`를 다시 호출하면 과거 계약과 금액이 바뀐다.
- 보고된 version 테스트는 서로 다른 두 in-memory settlement에 fixture 계약을 직접 심는다. production service, repository, DB round-trip, 재조회 경로를 통과하지 않는다.

즉, versioned용 컬럼과 snapshot은 존재하지만 불변식은 아직 호출자 규율에 의존한다.

## 2. 차단 결함 — production 경계가 계약 버전과 과거 snapshot을 고정하지 않음

### 2.1 불변식

1. 계산 시 사용할 계약 버전은 production service가 저장소의 실제 계약 행으로 해석·고정해야 한다. 외부 호출자가 임의의 transient/detached entity를 주입해서는 안 된다.
2. 정산이 확정된 뒤에는 현재 요율이 바뀌거나 `calculate`가 다시 호출돼도 `rate_contract_id`와 모든 입력·결과 snapshot이 바뀌면 안 된다.
3. 과거 조회는 저장된 snapshot만 반환해야 하며, 현재 계약 조회나 계산기를 거치면 안 된다.
4. 새 요율은 새 계약 행으로만 추가해야 하고 기존 계약 버전의 요율은 수정되지 않아야 한다.

### 2.2 좌표 전수

Production:

- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/SalesCommissionSettlementService.java:18-30`
  - `SalesCommissionRateContractRepository` 의존성이 없다.
- 같은 파일 `:54-61`
  - `calculate(UUID, SalesCommissionRateContract, Input)`가 caller-supplied entity를 그대로 계산·기록한다.
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/repository/SalesCommissionRateContractRepository.java:9-13`
  - 저장소는 만들어졌지만 production 사용 좌표가 0건이다.
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/domain/SalesCommissionSettlement.java:147-157`
  - 확정 상태 전이가 있다.
- 같은 파일 `:161-188`
  - `recordCalculation`이 `DRAFT`/`CONFIRMED`, 기존 snapshot 유무를 검사하지 않고 계약·입력·결과를 전부 덮어쓴다.
- 같은 파일 `:64-125`
  - 계약 FK와 snapshot 필드는 있으나 불변성을 강제하는 경계는 없다.

현재 테스트:

- `services/accounting-service/src/test/java/com/samhanair/logis/accounting/domain/SalesCommissionSettlementCalculationSnapshotTest.java:34-51`
  - v1/v2 계약과 정산 두 개를 모두 fixture로 직접 생성한다. repository 저장·재조회와 production service를 통과하지 않는다.
- `services/accounting-service/src/test/java/com/samhanair/logis/accounting/service/SalesCommissionSettlementCalculationServiceTest.java:27-50`
  - fixture 계약 하나를 service 인자로 직접 전달하고 같은 객체인지 확인한다. 계약 저장소 선택도, 요율 변경 뒤 과거 재조회도 검증하지 않는다.
- `services/accounting-service/src/test/java/com/samhanair/logis/accounting/it/SalesCommissionSettlementNumberSequenceIT.java`
  - S1 생성·채번·재조회 IT이며 S2 계약 FK/snapshot 왕복 조합은 없다.

### 2.3 재현 데이터와 관찰 결과

진단용 임시 RED를 `SalesCommissionSettlementCalculationServiceTest`에 추가해 다음 순서로 실행한 뒤 원복했다.

```text
정산일       2026-08-11
입력         total=10,000, equipment/prepaid/install/safety=0
결제/원천    CASH / false
수기율       null
v1           expenseRate=0.08
v2           expenseRate=0.07

1. 같은 settlement에 service.calculate(id, v1, input)
2. settlement.confirm("2026/08/11-1")
3. 같은 settlement에 service.calculate(id, v2, input)
4. v1 FK와 expense=-800 유지 기대
```

실행:

```text
.\gradlew.bat :services:accounting-service:test \
  --tests '*SalesCommissionSettlementCalculationServiceTest' --no-daemon

2 tests completed, 1 failed
confirmed_settlement_cannot_be_recalculated_with_a_new_rate_contract FAILED
```

첫 assertion에서 실제 `rateContract`가 v2 객체로 교체돼 실패했다. 현재 구현 흐름상 다음 금액 assertion도 `-700`이 된다. 임시 테스트와 production 뮤테이션은 모두 원복했고, 원복 후 관련 파일의 `git diff`는 0건이었다.

### 2.4 RED-A — 확정 snapshot 덮어쓰기 차단

구체적 표적:

- 파일: `SalesCommissionSettlementCalculationServiceTest` 또는 aggregate 단위 테스트
- 테스트명 예: `confirmed_settlement_rejects_recalculation_and_keeps_original_contract_snapshot`
- 순서: 위 재현 데이터로 v1 계산 → 확정 → v2 재계산 시도
- 기대:
  - 재계산 호출이 `CONFLICT` 등 명시적 업무 오류로 거부된다.
  - 거부 뒤 `rateContract.versionNo=1`
  - `appliedExpenseRate=0.08`
  - `expenseAmount=-800`
  - 나머지 입력·결과 snapshot도 byte-for-byte/`compareTo` 기준 동일하다.
- 이 RED는 현재 코드에서 반드시 먼저 실패해야 한다.

`DRAFT`에서의 재계산 허용 여부가 별도 결정이라면 그 정책을 명시해 양방향 테스트를 둔다. 다만 `CONFIRMED` 과거 정산 불변은 이 라운드의 전제다.

### 2.5 RED-B — 실제 계약 선택·DB 왕복·과거 재조회

구체적 표적:

- 새 IT 권장: `SalesCommissionSettlementRateVersionIT`
- 실제 PostgreSQL/Flyway/JPA repository와 production service를 사용한다.
- v1 seed를 repository에서 읽어 정산을 계산·저장·확정한다.
- v2(제경비 7%)를 새 행으로 저장한다.
- 동일 입력으로 신규 정산을 생성해 v2로 계산한다.
- 영속성 context를 clear한 뒤 과거 문서번호와 신규 문서번호를 각각 재조회한다.
- 기대:
  - 과거 정산: FK v1, 적용율 0.08, 제경비 -800
  - 신규 정산: FK v2, 적용율 0.07, 제경비 -700
  - 과거 조회 중 계산기 또는 “현재 요율” 선택 query가 호출되지 않는다.

뮤테이션 표적:

1. `recordCalculation`의 계약 FK 기록을 제거하면 RED-B가 실패해야 한다.
2. 계산 시 지정/고정 버전 대신 최신 계약을 쓰면 RED-B가 실패해야 한다.
3. 과거 조회에서 현재 계약으로 재계산하면 RED-B가 실패해야 한다.
4. service가 transient/detached 계약 객체를 직접 받도록 되돌리면 계약 선택 경계 테스트가 실패해야 한다.

현재 단위 테스트에 임시로 “FK 기록 제거 + 기본 제경비를 현재율 7%로 고정” 뮤테이션을 적용했을 때는 15 tests 중 7 failures가 발생했다. 따라서 단순 변이는 잡지만, 이미 존재하는 “확정 정산에 caller-supplied 새 계약을 재주입해 덮어쓰기” 변이는 기존 테스트가 잡지 못한다.

### 2.6 구현자 지시

1. 위 불변식을 production 경계에서 강제한다. 단순히 기존 in-memory fixture 테스트 assertion을 늘리는 것으로 끝내지 않는다.
2. 계약 entity 자체 대신 version 식별자를 service 경계로 받고 repository에서 실제 행을 읽는 방식, 또는 이에 동등하게 임의 entity 주입을 막는 방식을 사용한다.
3. `CONFIRMED` 정산 재계산을 차단하고 기존 FK·snapshot 보존을 RED-A로 고정한다.
4. 계약 변경 뒤 과거/신규 정산을 실제 DB에 함께 저장·clear·재조회하는 RED-B를 추가한다.
5. 새 조합을 모두 열거해 검증한다.

새 조합:

- v1 계산 → 확정 → v2 생성 → 과거 문서번호 재조회
- v1 계산 → 확정 → v2로 재계산 호출
- v1 과거 정산과 v2 신규 정산 동시 존재
- 수기율 null에서 계약 기본율 v1/v2 분리
- 수기율 지정 시 계약 기본 제경비율만 override되고 다른 계약 요율/FK는 보존
- 존재하지 않는 version
- soft-deleted version
- transient/detached 계약 주입 시도
- DRAFT 재계산 허용/거부 정책의 양방향
- 계약 FK 제거, 최신율 사용, 조회 시 재계산 뮤테이션

**제 전제가 틀렸다면 고치지 말고 중단·보고하십시오.** 특히 `CONFIRMED` 정산도 새 요율로 재산정하는 것이 의도된 정책이라면 versioned/과거 금액 고정 요구와 충돌하므로 구현을 진행하지 말고 PM 결정을 다시 받아야 한다.

## 3. 레거시 원문 독립 대조

원본 `tools/legacy-gas/영업수수료 계산/Index.html`을 직접 열어 줄 번호와 내용을 확인했다.

| 함수/공식 | 원본 좌표 | 판정 |
|---|---:|---|
| `setPay` | `:262-270` | 보고서 인용과 동일 |
| `setWht` | `:274-282` | 보고서 인용과 동일 |
| `setExp` | `:285-295` | 보고서 인용과 동일 |
| `getExpenseRate` | `:297-301` | 수기 입력 `/100`, 그 외 `0.08`; 동일 |
| `xround` | `:318-320` | `sign × Math.round(abs(n))`; 동일 |
| `getValues` | `:323-340` | 보고서 인용과 동일 |

계산 순서도 원문과 구현이 같다.

```text
card     = 카드일 때 xround(-total × cardRate)
sales    = total - equipment + card
expense  = xround(sales × -expenseRate)
wht      = 적용 시 xround(sales × -withholdingRate)
install  = xround(installInput × -installRate)
safety   = -safetyInput
subtotal = sales + expense + wht + install + safety
payout   = subtotal - prepaid
supply   = xround(subtotal / 1.1)
vat      = subtotal - supply
```

따라서 제경비·원천은 카드 공제까지 반영한 `sales`에 각각 곱하고, 설치는 원 설치 입력액 기준, 안전관리비는 전액, 선지급은 payout에서만 차감한다. “순차 곱”이나 “모든 항목 원 매출 기준”이 아니다.

`xround`는 원 단위, 절대값 기준 0.5 이상 올림, 부호 복원이다. Java `setScale(0, HALF_UP)`은 `1.5→2`, `-1.5→-2`로 원문과 같다.

## 4. 금액 경계

- production 계산 타입은 전부 `BigDecimal`이다. 신규 계산 경로에서 `double`, `Double`, `Math.round`, `Math.floor` 사용은 0건이다.
- 항목별 원 단위 `HALF_UP`: 카드, 제경비, 원천, 설치, 공급가.
- 중간 VAT 나눗셈은 scale 20 `HALF_UP` 후 원 단위 `xround`한다.
- sales, safety, subtotal, payout, VAT는 원문처럼 별도 원 단위 반올림을 하지 않는다.
- DB snapshot 금액 scale은 6, 요율 scale은 8이다.
- 음수 지급액은 원문 `subtotal - prepaid`에 근거해 그대로 보존한다. 0으로 clamp하거나 거부하는 규칙은 원문에 없다.
- 금액 0은 기존 테스트에서 통과한다.
- 음수 0.5 경계는 기존 `total=50`, 카드 3%에서 `-1.5→-2`로 통과한다.
- 임시 진단 테스트로 다음 누락 경계를 실행했고 모두 통과한 뒤 원복했다.
  - 수기율 0%: expense=0, subtotal=100
  - 수기율 100%: expense=-100, subtotal=0
  - 양수 0.5: subtotal 1.65 / 1.1 = 1.5, supply=2

수기율 범위 제한은 레거시 원문에 없다. `parseNum(...)/100` 결과를 그대로 사용하므로 이번 검토에서 0~100% 제한을 새로 요구하지 않았다.

## 5. Flyway·회귀·기존 4행

### Flyway

- GitHub 현재 `main` SHA: `92cc5c726eca52063a123710a6393d8de928c7a6`
- 현재 `main`의 accounting migration 최대: **V96**
- PR #1165가 S1 `V97__add_sales_commission_settlement.sql`, S2 `V98__add_sales_commission_rate_contract_snapshot.sql`을 연속 추가한다.
- 따라서 “V98이 origin/main 최대+1”은 문자 그대로는 아니다. origin/main 최대+1은 V97이며 이 PR의 S1이 사용한다. PR 전체 migration 열은 V96→V97→V98로 연속이므로 충돌 결함은 아니다.
- 열린 PR 전체 파일을 GitHub API로 조회한 결과 accounting V98 사용 PR은 #1165 자신뿐이다.

### 강제 회귀

실행:

```text
.\gradlew.bat :services:accounting-service:test --rerun-tasks --no-daemon --console=plain
```

결과:

```text
BUILD SUCCESSFUL in 8m 26s
JUnit XML 222 suites
tests=1,859 / failures=0 / errors=0 / skipped=10
```

PowerShell 기본 문자 디코딩으로 한글 testcase XML이 깨질 수 있어, 최종 수치는 모든 XML을 UTF-8로 읽고 222개 `<testsuite>` 헤더를 전수 합산했다.

뮤테이션과 진단 테스트를 모두 원복한 뒤 S1 19 + S2 18을 다시 실행했다.

```text
9 suites / tests=37 / failures=0 / errors=0 / skipped=0
BUILD SUCCESSFUL in 45s
```

### 기존 조달·카드·영업·판매 수수료 4행

`origin/main...HEAD`에서 `clients`, `services/product-service`, `services/slip-service`의 변경 파일은 0건이다. 기존 4행을 정의·분류·견적·전표 처리하는 경로에 S1/S2 코드 diff가 없으므로 이 PR이 그 경로를 직접 변경하지는 않았다. accounting 전체 회귀도 1,859건 모두 통과했다.

단, 이번 라운드는 estimate-app/product-service/slip-service의 독립 전체 테스트나 실제 견적→전표 E2E를 실행하지 않았다. “변경 없음” 판정은 diff 전수와 accounting 회귀에 근거한다.

## 6. 이 라운드가 보지 않은 표면

- S3 그룹웨어 연결
- S4 화면·버튼과 사용자 입력 validation
- D-G7 기준일 잠금
- 공유 DB 실데이터 migration/write
- estimate-app/product-service/slip-service 독립 전체 테스트 및 실제 견적→전표 E2E

이 표면들은 본 차단 결함 판정에 포함하지 않았다.

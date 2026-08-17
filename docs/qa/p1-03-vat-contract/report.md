# P1-03 공급가·VAT 반올림 계약 통일 보고서

작성일: 2026-08-17  
브랜치: `fix/vat-supply-amount-contract`  
기준: `5460b1609`

## ① 과거 기록 정찰 결과

- `gh issue list --state all --limit 400 --search "공급가 부가세"`, `"VAT 반올림"`을 확인하고 #900·#1032·#1069를 읽었다.
- #900: 전표·견적의 `supply_amount`/`vat_amount` 컬럼 도입 근거. 주문은 당시 컬럼이 없어 제외했다.
- #1032: `line_total`은 공급가액 별칭이며, 활성행에서 `line_total = supply_amount`라는 실측과 목록/상세 표시 불일치를 기록한다.
- #1069: 견적·전표가 같은 서버 세트 전개 엔진을 사용한다는 기록이다.
- `git log --all --grep="공급가" -i`, `git log --all --grep="VAT" -i` 및 #1250 머지 내용을 확인했다. #1250은 `VatInclusiveUnitAmountCalculator`를 추가했으며 기존 저장값을 재기록하지 않는 일마감 편집 계약을 포함한다.
- `services/slip-service/README.md`, `services/accounting-service/README.md`를 정찰했다.
- 지정 증거 파일은 현재 브랜치와 `origin/main` 모두에 없었다. 실행 결과는 다음과 같다.

```text
git -C . show origin/main:docs/dev-reports/2026-08-17-duplication-audit/P1-03-evidence.md
fatal: path ... does not exist in 'origin/main'
```

따라서 66행·48건 전표, 13행·8건 견적의 개별 금액은 이 워크트리에서 확인할 수 없고, 공유 DB를 조회·변경하지 않았다.

## ② 레거시 원문 인용

레거시 종합견적서는 VAT 포함 라인 합계를 `1.1`로 나눈 뒤 `Math.round`하고 VAT를 차액으로 계산한다.

```text
tools/legacy-gas/종합견적서/Code.js:1849
const sup = Math.round(Math.abs(total) / 1.1);
tools/legacy-gas/종합견적서/Code.js:1850
const vat = Math.abs(total) - sup;
tools/legacy-gas/종합견적서/Code.js:1853
const priceEx = priceVat < 0 ? -Math.round(Math.abs(priceVat) / 1.1) : Math.round(priceVat / 1.1);

tools/legacy-gas/종합견적서/index.html:13960
const lineSupply = Math.round(lineTotal / 1.1);
tools/legacy-gas/종합견적서/index.html:13961
const lineVat = lineTotal - lineSupply;
```

## ③ RED 원문

생산 코드 수정 전에 `110005` 경계 테스트를 추가했다.

```text
VAT 포함 합계 기본 분리는 레거시 원 단위 HALF_UP을 사용한다 FAILED
VatAmountCalculatorTest.java:26
기존 코드 결과: 100004
기대 결과:     100005
```

TypeScript 초기 실행은 `vitest/config` 의존성이 없어 기동하지 못했다. `clients/desktop`에서 lockfile 변경 없이 `npm ci --ignore-scripts --no-audit --no-fund`로 로컬 의존성을 복원한 뒤, 기존 절사 기대값이 실제 RED로 확인됐다.

```text
vatRounding.test.ts: 총액 1 ... expected supply 0, received 1
vatRounding.test.ts: 34783.04 ... expected supply 31620, received 31621
lineVat.test.ts: 7900 ... expected 7181, received 7182
vatPrice.test.ts: 7900 ... expected 7181, received 7182
```

## ④ 구현

- `shared/common/.../VatAmountCalculator.java`
  - 기본 `splitVatInclusive`를 `RoundingMode.DOWN`에서 `HALF_UP`으로 변경했다.
  - 공급가액을 계산한 뒤 VAT는 `total - supply`로 산출해 항등식을 유지한다.
- `clients/desktop/src/renderer/utils/vatRounding.ts`
  - 정수/소수 금액의 VAT 포함 분리를 BigInt HALF_UP으로 변경했다.
- `clients/desktop/src/renderer/utils/vatPrice.ts`
  - 가격기억 VAT 포함→공급단가 변환을 HALF_UP으로 변경했다.
- `lineVat`와 관련 테스트의 소비자 계약을 공용 HALF_UP 결과로 맞췄다.
- partner-order의 새 계산 테스트 기대값을 HALF_UP으로 갱신했다.
- `VatInclusiveUnitAmountCalculator`는 새로 만들지 않았고, 기존 단가·수량 계산기를 유지했다.
- migration/backfill/엔티티 저장 로직은 만들거나 변경하지 않았다.

## ⑤ GREEN

```text
:shared:common:test                                      BUILD SUCCESSFUL
slip focused tests (SlipLine/Estimate/SlipService/etc.)  BUILD SUCCESSFUL
accounting focused tests (Vat/AccountingSlip)            BUILD SUCCESSFUL
partner-order focused tests                              BUILD SUCCESSFUL
desktop Vitest 대상 3개                                  3 files, 58 tests passed
desktop typecheck                                        exit 0
desktop lint                                              0 errors, 196 pre-existing warnings
desktop build                                             exit 0
slip-service:bootJar                                      BUILD SUCCESSFUL
```

전체 `:services:slip-service:test`는 1,932건 중 751건이 `GatewayAttestationMockMvcConfig`의 필수 환경변수 부재로 컨텍스트 초기화에 실패했다. 실패 지점은 `GatewayAttestationMockMvcConfig.java:24`이며 VAT assertion 실패가 아니다.

## ⑥ 기존 저장 값 불변 검증

- 계산기는 저장 엔티티를 받지 않고 `BigDecimal`/문자열 값을 받아 새 결과를 반환한다.
- `VatAmountCalculatorTest.calculationDoesNotMutateStoredAmount`에서 `110005.00` 입력값의 scale·값이 유지되고, 반환 `lineTotal`이 입력 객체와 동일함을 검증했다.
- migration/backfill이 없고 공유 DB write를 수행하지 않았다.
- 그러므로 기존 전표·견적 저장 공급가/VAT를 재계산하거나 변경하지 않았다. 이번 변경은 신규 계산·표시 계약에만 적용된다.

## ⑦ 갈리는 데이터 전수 표(판단용)

원본 전수 행 데이터가 이 브랜치와 `origin/main`에 존재하지 않고, 공유 DB 변경 금지 조건 때문에 아래 범위의 개별 전수표를 생성할 수 없었다.

| 대상 | 기존 실측 건수 | 기존 방식 | 통일 방식 | 현재/통일 금액 전수 차이 |
|---|---:|---|---|---|
| 전표 | 66행 · 48건 | DOWN/혼재 | HALF_UP | 원본 행 부재로 산출 보류 |
| 견적 | 13행 · 8건 | 혼재 | HALF_UP | 원본 행 부재로 산출 보류 |

샘플 경계만 코드 테스트에 고정했다.

| VAT 포함 금액 | 기존 절사 | 통일 HALF_UP | 차이 |
|---:|---:|---:|---:|
| 110,005 | 공급 100,004 / VAT 10,001 | 공급 100,005 / VAT 10,000 | 공급 +1 / VAT -1 |
| 7,900 | 공급 7,181 | 공급 7,182 | +1 |
| 800,000 | 공급 727,272 / VAT 72,728 | 공급 727,273 / VAT 72,727 | 공급 +1 / VAT -1 |

66행·48건 및 13행·8건의 재계산/표시/보존 여부는 개발책임자 판단 전까지 선택하지 않는다.

## ⑧ `line_total`/`supply_amount` 정본 근거

- #900은 전표·견적에 `supply_amount`/`vat_amount`를 도입한 이슈다.
- #1032는 `SlipLine.java:96`의 설명을 인용해 `line_total`이 공급가액 별칭이며 의미상 별도 컬럼을 보존한다고 기록한다.
- 따라서 두 컬럼이 같은 공급가액을 담는 것은 설계 의도다. 현재 둘 중 어느 컬럼을 정본으로 선택하지 않았다.
- 이번 구현은 컬럼을 추가하거나 저장값을 재기록하지 않고, 기존 양쪽 값이 어긋나지 않도록 계산 항등식과 회귀 테스트만 보강했다.

## ⑨ 라이브 캡처와 행 수

미실행.

- 변경 서비스 `slip-service:bootJar`는 성공했다.
- 인증 포함 격리 스택은 시작하지 않았다. auth-service를 함께 기동하면 `accounts` 스키마 부재 500 위험이 있고, 공유 스택은 변경 금지이므로 안전한 격리 구성 확인 없이 기동하지 않았다.
- 따라서 전표·견적 화면의 공급가/VAT 캡처와 행 수는 산출하지 않았다. 공유 DB에는 접근하지 않았다.

## ⑩ 프로세스 회수

- 이 작업에서 시작한 Docker 컨테이너: 0개
- 최종 `docker ps` 잔여 컨테이너: 25개. 모두 작업 전부터 존재한 공유 스택이며 내리거나 변경하지 않았다.
- 이 작업에서 시작한 장기 실행 서버/Playwright: 0개
- Gradle 테스트/빌드 프로세스: 종료 확인
- 생성된 JAR 및 frontend build 산출물: 검증 후 삭제
- `git status` 기준 다른 워크트리 변경 없음

## 변경 파일

- `shared/common/src/main/java/com/samhanair/logis/common/financial/VatAmountCalculator.java`
- `shared/common/src/test/java/com/samhanair/logis/common/financial/VatAmountCalculatorTest.java`
- `clients/desktop/src/renderer/utils/vatRounding.ts`
- `clients/desktop/src/renderer/utils/vatRounding.test.ts`
- `clients/desktop/src/renderer/utils/vatPrice.ts`
- `clients/desktop/src/renderer/utils/vatPrice.test.ts`
- `clients/desktop/src/renderer/utils/lineVat.ts`
- `clients/desktop/src/renderer/utils/lineVat.test.ts`
- `services/partner-order-service/src/test/java/com/samhanair/logis/partnerorder/domain/PartnerOrderLineSupplyVatTest.java`

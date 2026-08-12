# #1090 금액 parity 재수렴 적대검증 — CODEX SOL

> 검증일: 2026-08-13 KST  
> 대상: `feat/1090-1140-discount-axis`  
> 공유 DB: UTF-8 복제용 dump 읽기만 수행  
> 쓰기: 격리 컨테이너 `codex1090-reconvergence-sol-pg`에서만 수행

## 0. 질문 하나에 대한 답

**있다. 실 사용자 경로에서 재현되는 결함은 2건이며, 머지 불가다.**

1. 미분류 품목에 분류를 저장하면 `classificationAssigned=false → true`가 되지만 `discountOption`은 계속 null이다. fallback이 즉시 해제되어 옵션 DC만큼 단가가 상승한다. 격리 서비스의 실제 PATCH/lookup 경로와 Desktop 실제 계산 함수로 `AC023BN1DBC1`이 **266,800원 → 316,800원(+50,000원)**이 되는 것을 재현했다.
2. 내부 전환 상태 `classificationAssigned`가 실제 `/products/lookup` JSON 응답에 노출된다. 화면 문자열로 렌더링되는 곳은 없지만 API 비노출 요구는 실패다.

V42 직후에는 331건 전수 금액이 보존된다. 결함은 그 다음 사용자 행동인 **분류 저장 순간**에 열린다.

## 1. 격리 복제와 한글 원문

현재 브랜치에는 `scripts/qa/clone-db-utf8.sh`가 없어 브랜치를 변경하지 않고 `origin/main:scripts/qa/clone-db-utf8.sh` 원문을 Git Bash로 실행했다. `product_db`, `partner_db`, `dc_config_db`, `partner_order_db`, `slip_db` 모두 하네스의 원본/복제본 스냅샷 비교를 통과했다.

```text
[clone] PASS product_db
[clone] PASS partner_db
[clone] PASS dc_config_db
[clone] PASS partner_order_db
[clone] PASS slip_db
[clone] PASS all databases
```

복제 직후 `partner_db` 한글 원문:

```text
(B.E.S.T)에어컨
(BY)공조시스템(조영삼)
(DS)공조-허권대표님
```

하네스는 정상 종료 시 컨테이너를 제거하므로, 동일 custom-format 바이너리 dump/restore 절차로 지속 검증용 `codex1090-reconvergence-sol-pg`를 별도 생성했다. 이후 모든 UPDATE·V42 적용·API 저장은 이 컨테이너에서만 했다.

## 2. V42 직후 전수 금액 불변

V42 적용 전 격리 DB에서 정확한 레거시 6종 판별 결과와 가격 필드를 `qa_sol.price_before`에 고정한 뒤 실제 `V42__classification_discount_option_canon.sql`을 적용했다.

| 모집단 | 건수 | V42 전후 옵션 불일치 | V42 전후 금액 불일치 |
|---|---:|---:|---:|
| 분류 있음 | 218 | 0 | 0 |
| 분류 없음 | 113 | 0 | 0 |
| 합계 | 331 | 0 | 0 |

세부 결과:

```text
classified_migration_mismatch = 0
unclassified_arbitrary_fill   = 0
option_mismatch               = 0
```

실제 옵션 DC 보유 거래처는 합집합 46곳이었다.

```text
360=45, 4way=46, 1way=45, stand=45, deluxe=15, firstGrade=10
```

레거시 판별 331건과 이 설정을 교차한 단순 옵션 조합은 11,767개였고 fix 적용 후 금액 불일치는 0개였다. 다만 실제 사용자 경로는 product-service의 `categoryKey`를 사용하므로 아래 §3처럼 범위가 줄어든다.

## 3. 증거 무결성 — 직전 금액표와 3,376은 그대로 재현되지 않음

### 3.1 113건 금액표는 실제 112행

`2026-08-13-1090-fix-price-parity-luna.md`의 표를 격리 DB 113건과 모델코드·옵션·판매가·전후가·차액까지 행별 비교했다.

```text
report_rows=112
db_rows=113
row_mismatches=1
report_extra=0
```

누락 행:

| 품목 | 옵션 | 판매가 | 전환 전 | fallback 없는 전환 후 | 상승액 |
|---|---|---:|---:|---:|---:|
| `AP290RXPDHH1` | STAND | 5,177,700 | 5,107,700 | 5,177,700 | 70,000 |

테스트 fixture에는 이 행이 있고 113행 길이 단언도 통과하지만, 보고서의 “113건 전후 금액표” 본문에는 없다. 따라서 표 자체는 전수표로 재현되지 않는다.

### 3.2 실제 사용자 경로의 도달 조합은 2,781개

직전 3,376은 113건 모두를 `category='OTHER'`로 계산한 값이다. 실제 Desktop은 product-service 응답의 `categoryKey`가 `commercialMulti`이면 옵션 정액 DC를 적용하지 않는다. 미분류 113건 중 물리 분류가 `OUTDOOR`인 14건이 이 경로이며, 이들의 조합 595개는 3,376에서 제외돼야 한다.

```text
직전 주장                         3,376
OUTDOOR 14품목 과대계상             595
실 사용자 가격변화 도달 조합       2,781
판매가 0원 조합                       46
실 사용자 옵션 조합(0원 포함)      2,827
fix 적용 후 실제 경로 불일치            0
```

실 사용자 경로에서 가격변화 가능한 품목은 112개가 아니라 **98개**다. 이 정정은 현재 fix의 V42 직후 parity 0건 판정을 바꾸지 않는다.

## 4. 새 상태 표면 — 분류 저장 순간 금액 상승

격리 product-service를 실제 branch 코드로 기동하고 시스템 MASTER 헤더로 사용자 경로를 실행했다.

1. `PATCH /api/v1/products/AC023BN1DBC1/usage`로 `ESTIMATE / SINGLE_SET` 노출 저장
2. 저장 전 `/products/lookup`: `classificationAssigned=false`, `discountOption=null`
3. `PATCH /api/v1/products/AC023BN1DBC1/classification`으로 L 분류 저장
4. 저장 후 `/products/lookup`: `classificationAssigned=true`, `discountOption=null`
5. Desktop의 실제 `calculateSlipDiscount`를 Node 24 TypeScript strip-types로 직접 호출

```text
저장 전  source=OPTION, unitPrice=266800
저장 후  source=NONE,   unitPrice=316800
차액                         +50000
```

원인은 저장 계약과 구현에 `discountOption`이 없기 때문이다.

- `UpdateProductClassificationRequest`는 `catLId/catMId/catSId`만 받는다.
- `ProductService.updateClassificationAndFixedDiscount`는 `markClassificationManual`만 호출한다.
- `Product.changeDiscountOption`의 호출자는 V42 이후 런타임 코드에 0곳이다.
- 따라서 기존 미분류 품목에 사용자가 분류를 저장하면 정본 옵션을 채울 방법 없이 fallback만 해제된다.

도달 범위는 현재 실제 경로 기준 판매가가 양수인 OTHER 품목 98개, 옵션 DC 거래처 조합 2,781개다.

## 5. 플래그 비노출·정합성·정본 단일성

### API/화면 노출

- `/products/lookup` 실제 JSON에 `classificationAssigned` key 존재: **FAIL**.
- Desktop `ProductSummaryResponse` 및 `ProductOption` 매핑에도 이 필드가 전달된다.
- JSX/화면 문자열로 렌더링하는 사용처는 검색 결과 0곳: 화면 직접 노출은 없음.

### 값 정합성

`classificationAssigned`는 저장 컬럼이 아니라 `cat_l_id/cat_m_id/cat_s_id` 중 하나라도 존재하는지를 DTO가 즉시 계산한다. V42 직후 활성 2,982건 전수에서 분류 있음인데 false, 분류 없음인데 true인 행은 각각 0건이었다. 실제 PATCH 전후에도 false→true가 DB 분류 저장과 일치했다.

### 정본 단일성

Desktop과 partner-order 모두 레거시 판별은 `classificationAssigned=false` 분기 안에서만 호출한다. true이면 `discountOption`만 사용하므로 분류 저장 후 분류와 레거시를 동시에 판별하는 경로는 재현되지 않았다. 이 항목은 PASS다. 문제는 단일 정본 값이 null인 채 fallback이 걷힌다는 점이다.

## 6. 이관·집합·Flyway

V42 적용 전 원본 스냅샷 기준:

```text
활성 품목                         2,982
레거시 규칙                         331
  분류 있음                          218
  분류 없음                          113
discount_flags 비영                    8
legacy_discount_flag=true              29
세 집합 쌍별/삼중 교집합                0
```

- 분류 있음 218건 `discount_option` 이관 불일치: 0
- 분류 없음 113건 임의 채움: 0
- product-service source migration의 `V42__*.sql`: 1개, 번호 충돌 0
- `CategoryRepositoryIT` 2/2 PASS: fresh Testcontainers PostgreSQL에서 Flyway V1→V42 경로 통과
- `ProductCatalogControllerIT` 40/40 PASS

격리 분류 저장 시나리오 2건을 실행한 뒤 현재 컨테이너 수치는 220/111로 바뀌었으므로, 위 확정 수치는 시나리오 전 `qa_sol.price_before` 스냅샷에서 집계했다.

## 7. 실행 테스트와 `main` 대조

### Desktop

```text
slipDiscount.classification-canon.test.ts  6/6
slipDiscount.test.ts                      25/25
slipDiscount.bundle-parent.test.ts         3/3
합계                                      34/34 PASS
```

### partner-order

현재 브랜치 전체:

```text
534 tests completed, 1 failed
PartnerOrderConfirmServiceIT.confirm_applies_dc_final_price_from_price_calc
expected sent.is360() = true, actual = false
```

`origin/main` 전체 추적 파일을 임시 아카이브로 풀고 동일 테스트만 같은 Gradle 명령으로 실행한 결과:

```text
BUILD SUCCESSFUL
동일 IT 1/1 PASS
```

따라서 직전 보고서의 “기존 IT 1건 실패” 설명은 틀렸다. **그 1건은 이 브랜치가 만든 회귀**다. 6-arg 테스트 fixture는 `modelCode=null`, `modelName=AM360...`인데 새 `classificationAssigned=false` 호환 생성자/판별 경계에서 기대하던 360 판별이 사라졌다. 이 fixture 형태가 현재 production product-service 응답과 같다고 확인되지는 않아 별도의 실 사용자 결함 수에는 포함하지 않았지만, 전체 테스트가 red이므로 그 자체로 머지 차단이다.

### product

```text
CategoryRepositoryIT       2/2 PASS
ProductCatalogControllerIT 40/40 PASS
합계                       42/42 PASS
```

## 8. 도달 가능한 결함과 머지 판정

도달 가능한 실 사용자 결함: **2건**.

1. 분류 저장 시 fallback 해제와 함께 옵션 DC 소실 — 실측 +50,000원, 실제 범위 98품목 × 옵션 DC 거래처 중 2,781조합.
2. `classificationAssigned` 내부 상태가 사용자 품목 lookup API 응답에 노출.

추가 차단:

- partner-order 전체 534건 중 1건은 `main`에서 PASS하고 이 브랜치에서만 FAIL.
- LUNA 113건 표는 112행이며 실제 사용자 3,376조합 주장은 2,781조합으로만 재현됨.

**머지 불가.** V42 직후 금액 parity만 0건일 뿐, 분류 저장이라는 정상 사용자 행동에서 금액이 상승하고 전체 Java 테스트도 red다.

## 9. 못 한 것

- product-service의 전체 Java test 전부는 실행하지 않았다. 요구 범위의 fresh Flyway IT와 실제 분류 PATCH 경로를 포함한 두 IT 클래스 42건을 실행했다.
- 2,781조합 각각을 Desktop 화면에서 클릭하지는 않았다. 복제된 실제 품목·DC 설정을 전수 SQL 교차하고, 대표 1건은 실제 격리 API PATCH/lookup과 실제 Desktop 계산 함수를 끝까지 실행했다.
- 기존 저장 견적·주문 라인의 byte 대조는 수행하지 않았다. 이번 질문의 결함은 새 선택/재가격 및 분류 저장 경로에서 재현했다.

## 10. 라운드 종료 점검

삭제된 추적 파일 없음. `tools/.s24-build-only/build/deep/tracked-writer.mjs`는 추적 상태이며 `Test-Path=True`다. `codex1090-reconvergence-sol-pg`와 UTF-8 하네스 컨테이너는 제거됐고, `codex1090-main-*` 임시 아카이브·Desktop mutation 임시 경로·`w1090`을 command line에 포함한 `java/node/npm/npx/electron` 프로세스는 모두 0개다. 최종 `git status --short`는 이 보고서 1개만 untracked다.

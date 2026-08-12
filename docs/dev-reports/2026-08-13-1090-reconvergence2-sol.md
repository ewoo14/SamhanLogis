# #1090 금액 정본 재수렴 2차 적대검증 — CODEX SOL

> 검증일: 2026-08-13 KST  
> 대상: `feat/1090-1140-discount-axis`  
> 공유 DB: `pg_dump` 읽기만 수행  
> 쓰기: 격리 PostgreSQL `codex1090-reconvergence2-sol-pg`에서만 수행

## 0. 질문 하나에 대한 답

**실 사용자 경로에서 재현되는 결함은 0건이다. 머지 가능으로 판정한다.**

분류 저장 시 기존 모델 표식의 정액 DC 근거가 `discountOption`으로 승격됐고, 저장 후와 분류 되돌림 후에도 금액 상승이나 이중 적용을 재현하지 못했다. 대표 품목 `AC023BN1DBC1`은 **266,800원 → 266,800원**이었다.

## 1. 격리 복제와 증거 행 수

`main`의 `scripts/qa/clone-db-utf8.sh`를 실행했다. 공유 원본은 dump 읽기만 했고, 하네스가 만든 격리 복제본에서 원본/복제본 스키마·데이터를 두 차례 비교했다.

```text
[clone] PASS product_db
[clone] PASS partner_db
[clone] PASS dc_config_db
[clone] PASS partner_order_db
[clone] PASS slip_db
[clone] PASS all databases
```

별도 지속 검증용 격리 복제본에서 행 수를 직접 다시 셌다.

```text
레거시 모델 규칙 전체                 331
  분류 있음                           218
  분류 없음                           113
AP290RXPDHH1                           1
discount_flags 비영                     8
legacy_discount_flag=true              29
세 집합 쌍별/삼중 교집합                0
```

직전 112행 누락 전례와 달리 이번 검증의 미분류 모집단은 실제 DB **113행**이며 `AP290RXPDHH1`을 포함한다.

## 2. 시점 1 — V42 적용 직후 전수 금액 대조

V42 전 격리 DB의 모델 표식·분류·판매가를 `qa_sol.price_before`에 고정하고 저장소 원문 `V42__classification_discount_option_canon.sql`을 적용했다.

| 모집단 | 직접 센 행 수 | 옵션 불일치 | 금액 불일치 |
|---|---:|---:|---:|
| 분류 있음 | 218 | 0 | 0 |
| 분류 없음 | 113 | 0 | 0 |
| 합계 | 331 | 0 | 0 |

미분류 113행의 `discount_option` 임의 채움은 **0행**이었다. 분류가 있던 218행은 V42가 모델 표식과 같은 옵션을 채웠고 불일치는 **0행**이었다.

거래처 DC 설정과 교차한 비-null 옵션 조합은 11,767개였고, V42 전후 금액 불일치는 **0개**였다.

## 3. 시점 2 — 분류 저장 뒤 전수 금액 대조

실 사용자 저장 경로의 핵심 상태 전이와 동일하게 미분류 113행에 L 분류를 저장하고, branch 구현의 `LegacyModelFlags` 우선순서로 `carryForwardLegacyDiscountOption()` 결과를 적용했다. 실제 HTTP PATCH 경로는 전체 `ProductCatalogControllerIT`에서 실행됐고, 승격 경계는 `ProductServiceTest` 및 격리 DB 전수 상태 전이로 대조했다.

```text
분류 저장 대상                         113
승격 값 원래 모델 표식과 불일치           0
저장 전후 금액 불일치                    0
기존 분류 218행 추가 변이                 0
```

직전 실측의 실제 사용자 가격변화 모집단도 다시 직접 셌다. 판매가 양수 112행에서 품명상 실외기 14행을 제외하면 **98품목**이다. 제외된 14행은 DC 조합 595개이고, 나머지는 정확히 **2,781 품목×거래처 조합**이다.

```text
실 사용자 품목                          98
실 사용자 옵션 DC 조합                2,781
분류 저장 전후 금액 불일치                0
```

대표 숫자:

```text
AC023BN1DBC1
승격 discountOption = ONE_WAY
저장 전               266,800
저장 후               266,800
차액                         0
```

## 4. 분류 저장 후 되돌림

113행의 L/M/S와 `classification_manual`을 저장 전 값으로 되돌렸다. 승격된 `discountOption`은 의도대로 남았다.

```text
되돌림 대상                           113
분류가 남은 행                           0
승격 option이 남은 행                  113
원래 모델 표식과 option 불일치            0
```

`AC023BN1DBC1`은 되돌림 후에도 `ONE_WAY` 하나만 근거로 사용되어 **266,800원**이었다. fallback은 `discountOption == null`일 때만 열리므로 남은 정본과 레거시 값을 동시에 합산하는 경로와 이중 적용은 재현되지 않았다.

## 5. 승격 값·판별 단일성·응답 비노출

- 승격 값 정합성: 미분류 113행 모두 원래 `LegacyModelFlags` 결과와 일치, 임의 값 **0행**.
- 판별 단일성: 저장 이후 Desktop은 `discountOption` 존재로 내부 상태를 파생하고, partner-order도 `discountOption == null`일 때만 레거시 fallback을 사용한다. 동시 판별·동시 합산 경로 **0곳**.
- `classificationAssigned` 응답: `ProductSummaryResponse` record component에 `@JsonIgnore`가 있고, 직렬화 테스트가 JSON key 부재를 실행 확인했다. 사용자 응답 DTO의 공개 key로 남은 곳 **0곳**.
- 기존 분류 218행: 저장 승격 시나리오에서 변이 **0행**.

내부 호환 필드명은 Desktop 계산 입력과 partner-order 내부 record에 남아 있으나 사용자 JSON 응답에는 직렬화되지 않는다.

## 6. Flyway와 실행 테스트

fresh Testcontainers PostgreSQL에서 `CategoryRepositoryIT`를 `--rerun-tasks`로 실행해 Flyway V1→V42를 통과했다. product-service의 V42 migration 파일은 1개이며 번호 충돌은 **0개**다.

전체 테스트도 캐시 판정이 아닌 `--rerun-tasks`로 다시 실행했다.

```text
shared:common:test                 83 tests, failure/error 0
product-service:test             783 tests, failure/error 0
partner-order-service:test       534 tests, failure/error 0
PartnerOrderConfirmServiceIT       focused rerun PASS
Desktop 할인 테스트               35/35 PASS
CategoryRepositoryIT              focused rerun PASS (fresh V1→V42)
```

Gradle 최종 결과는 `BUILD SUCCESSFUL`이었다. 종료 hook에서 mock CloudWatch NPE 경고와 이미 제거된 Testcontainers를 다시 kill하려는 404가 출력됐지만 task 실패는 없었다.

## 7. 도달 가능한 결함과 머지 판정

도달 가능한 실 사용자 결함: **0건**.

- V42 직후 218+113행 전수 금액 불변.
- 분류 저장 후 98품목·2,781조합 금액 불변.
- 분류 되돌림 후 승격 정본 유지, 이중 적용 없음.
- `classificationAssigned` 사용자 응답 노출 없음.
- 기존 분류 218행 추가 승격 없음.
- 기존 branch 회귀였던 `PartnerOrderConfirmServiceIT` 포함 전체 테스트 green.

**머지 가능.**

## 8. 못 한 것

- 2,781조합 각각을 Desktop 화면에서 클릭하지는 않았다. 복제된 실제 98품목과 실제 거래처 DC 설정을 전수 교차했고, Desktop 실제 할인 함수 35개 테스트 및 API controller IT를 함께 실행했다.
- 과거 저장 견적·주문 라인의 byte 대조는 하지 않았다. 이번 검증 대상은 V42 직후 및 새 분류 저장/되돌림에 따른 재가격 경로다.

## 9. 라운드 종료 점검

삭제된 추적 파일 **0개**. `tools/.s24-build-only/build/deep/tracked-writer.mjs`는 추적 상태이고 실제 파일도 존재한다. `codex1090-reconvergence2-sol-pg`와 UTF-8 하네스 컨테이너, `codex1090-reconvergence2-*` 임시 디렉터리, 작업 경로를 포함한 Java/Node/npm/npx/Electron 잔류 프로세스는 모두 **0개**다.

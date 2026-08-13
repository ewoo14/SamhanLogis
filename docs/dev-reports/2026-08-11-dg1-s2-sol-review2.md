# D-G1 S2 SOL 5.6 재검토 — versioned 요율 fix

> 검토일: 2026-08-11
> 대상: PR #1165 / HEAD `246f8b17b4a6ce83fc26257b61e548ed3b6b6959`
> 비교 fix: `06bb8bf6e` → `246f8b17b`
> 범위: D-G1 S2 재검토. S3 그룹웨어, S4 화면·버튼, D-G7 기준일 잠금은 제외.
> 공유 DB write, 배포, commit·push·checkout 등 git 변경 조작은 수행하지 않았다.

## 1. 판정

**차단 결함 0건 — PASS. PM에 통합 가능 상태로 보고한다.**

R1에서 차단한 두 불변식이 production 경계와 PostgreSQL 왕복에서 모두 고정됐다.

1. 계산 경계는 계약 entity 주입을 받지 않고 명시적 `versionNo`를 받아 활성 계약 저장소에서 실제 행을 조회한다.
2. `CONFIRMED` 재계산은 계약 조회 전에 `CONFLICT`로 거부되고, aggregate도 `DRAFT`가 아니면 snapshot 기록을 거부한다.
3. 과거 정산 조회는 저장된 계약 FK와 금액 snapshot을 반환한다. 계약을 soft-delete한 뒤에도 과거 `0.08 / -800`은 실제 DB 재조회에서 유지됐다.
4. DRAFT 정상 재계산, S1 채번·조회·확정, 레거시 계산 순서·반올림·기본 8%는 모두 회귀하지 않았다.

## 2. 첫 각도 — 차단이 정상 경로를 막았는가

### DRAFT 재계산

- production 좌표: `SalesCommissionSettlementService.java:60-75`
- 회귀: `SalesCommissionSettlementCalculationServiceTest.java:62-86`
- 같은 DRAFT에 v1(제경비 8%) 계산 후 v2(7%)로 재계산했다.
- 결과: 상태는 계속 `DRAFT`, 계약 FK/version은 v2, 적용율 `0.07`, 제경비 `-700`으로 갱신됐다.
- 저장소 조회도 v1·v2 각각 1회 검증한다. 차단이 DRAFT 정상 재계산까지 확대되지 않았다.

### CONFIRMED 재계산과 조회

- 재계산 차단: `SalesCommissionSettlementService.java:63-73`
  - settlement를 먼저 읽고 상태를 검사한다.
  - `CONFIRMED`이면 계약 version의 존재 여부와 무관하게 `CONFLICT`다.
  - `confirmed_recalculation_is_rejected_before_any_rate_contract_lookup`에서 계약 저장소 interaction 0을 확인한다.
- aggregate 방어: `SalesCommissionSettlement.java:161-168`
  - service 외 다른 호출 경계가 생겨도 `recordCalculation`은 `DRAFT` 외 상태를 거부한다.
- 정상 조회: `SalesCommissionSettlementService.java:78-87`
  - `@Transactional(readOnly = true)`의 별도 경로이며 상태 차단을 거치지 않는다.
  - `SalesCommissionSettlementRepository.java:13-15`의 entity graph가 저장된 계약 FK를 함께 적재한다.
  - PostgreSQL/Flyway IT에서 확정 문서번호 조회가 과거 v1과 신규 v2 모두 성공했다.

목록·집계·보고서 및 확정 취소/수정 경로는 현재 S2 production에 존재하지 않는다. 따라서 이번 `calculate` 차단이 막을 해당 호출 자체가 없으며, 이 라운드에서 통과했다고 확대 판정하지 않았다. 확정 취소는 설계 문서상 명시적인 범위 밖이다.

### S1 정상 경로

SalesCommission 44건 중 S1 네 suite를 별도 합산했다.

```text
SalesCommissionSettlementTest                    2
SalesCommissionSettlementNumberServiceTest       1
SalesCommissionSettlementServiceTest             7
SalesCommissionSettlementNumberSequenceIT        9
합계                                              19
failures 0 / errors 0 / skipped 0
```

계산하지 않은 S1 DRAFT를 확정한 뒤 문서번호로 조회하는 기존 PostgreSQL 왕복도 entity graph 추가 후 그대로 통과했다.

## 3. 두 번째 각도 — versioned가 실제로 작동하는가

### R1 재현의 동일 순서 재실행

R1 데이터와 순서를 그대로 가진
`confirmed_settlement_rejects_recalculation_and_keeps_original_contract_snapshot`을 강제 재실행했다.

```text
정산일       2026-08-11
입력         total=10,000, equipment/prepaid/install/safety=0
결제/원천    CASH / false
수기율       null
v1           expenseRate=0.08
v2           expenseRate=0.07

v1 계산 → 원 snapshot 보관 → CONFIRMED → 같은 settlement에 v2 재계산 시도
```

결과는 `CONFLICT`이며, 호출 전후의 계약 FK와 입력·결과 snapshot 20개 필드가 동일하다. 계약은 v1, 적용율은 `0.08`, 제경비는 `-800`, 상태는 `CONFIRMED`로 유지됐다.

### 여러 계약 중 선택 기준

선택 기준은 기준일·생성일·최대 version의 암묵적 추정이 아니다.

- API 형태: `calculate(UUID settlementId, int rateContractVersion, Input)`
- 저장소 query: `findByVersionNoAndIsDeletedFalse(rateContractVersion)`
- 기준: **호출자가 명시한 정확한 versionNo의 활성 행**
- 존재하지 않거나 soft-delete된 version: `NOT_FOUND`

따라서 현재 동작은 우연한 정렬/최신 행 선택이 아니라 메서드 계약과 query에 명시돼 있다. 다만 S4에서 사용자가 어떤 version을 선택·전달하는지는 아직 구현되지 않은 별도 표면이다.

### PostgreSQL/Flyway 왕복

`SalesCommissionSettlementRateVersionIT` 2건을 독립 강제 재실행했다.

1. v1 저장 → 과거 정산 계산·확정 → v2 저장 → 신규 정산 계산·확정 → persistence context clear → 두 문서번호 재조회
   - 과거: v1 / `0.08` / `-800`
   - 신규: v2 / `0.07` / `-700`
2. v1 정산 계산·확정 → v1 계약 soft-delete → 새 DRAFT에서 v1 계산 시도 → 과거 문서번호 재조회
   - 신규 계산: `NOT_FOUND`
   - 과거 조회: v1 / `0.08` / `-800`

두 테스트 모두 실제 `postgres:16-alpine` Testcontainers와 Flyway/JPA를 사용했고 skip 0이었다. 공유 `samhan-postgres`에는 연결하지 않았다.

### 저장소 조회 제거 뮤테이션 — 독립 RED

TERRA의 실행 보고를 신뢰하지 않고 직접 다시 수행했다. production의 활성 계약 repository 조회 블록만 임시로 제거하고, 같은 version 번호를 가진 transient 고정 8% 계약을 생성하도록 치환했다.

```text
.\gradlew.bat :services:accounting-service:test \
  --tests '*SalesCommissionSettlementRateVersionIT' \
  --rerun-tasks --no-daemon --console=plain

2 tests completed, 2 failed
persisted_versions_keep_their_own_confirmed_settlement_snapshots_after_reload FAILED
soft_deleted_contract_cannot_calculate_new_draft_but_remains_visible_on_old_snapshot FAILED
원인: TransientPropertyValueException
```

즉 DB 왕복 테스트는 저장소에서 선택한 영속 계약과 FK를 실제로 요구한다. 뮤테이션은 즉시 정확히 원복했고, 해당 production 파일의 `git diff --exit-code HEAD -- <file>`가 0인 것을 확인했다. 원복 후 같은 IT를 다시 강제 실행해 2/2 GREEN을 확인했다.

## 4. RED-B 보존 확인

### 레거시 공식·HALF_UP·기본율

fix commit은 계산기와 계산 입력·결과 타입을 변경하지 않았다. 강제 실행한 44건에는 다음 가드가 포함된다.

- 레거시 대표 fixture의 카드 → sales → 제경비·원천 → 설치·안전 → 소계 → 지급액 → 공급가/VAT 순서
- 카드/현금 × 원천 적용/미적용 조합
- 양·음 `0.5`의 원 단위 `HALF_UP`
- 수기율이 없을 때 계약 기본 제경비율 8%
- 수기율이 있을 때 제경비율만 override
- 선지급은 소계가 아니라 지급액에서만 차감

결과: SalesCommission 10 suites / 44 tests / failures 0 / errors 0 / skipped 0.

### 기존 수수료 품목 4행

`origin/main...HEAD`와 fix 범위 `06bb8bf6e..246f8b17b`를 각각 확인했다. `clients`, `product-service`, `slip-service`, `estimate-service` 변경 파일은 모두 0건이다. 조달수수료·카드수수료·영업수수료·판매수수료 4행의 기존 견적·전표 경로는 이 PR에서 수정되지 않았다.

이 판정은 diff 전수와 accounting 전체 회귀에 근거한다. product/slip/estimate 독립 전체 suite와 실제 견적→전표 E2E는 이번 라운드에서 실행하지 않았다.

## 5. 수치 — 강제 재실행

실행:

```text
.\gradlew.bat :services:accounting-service:test \
  --rerun-tasks --no-daemon --console=plain
```

결과:

```text
BUILD SUCCESSFUL in 7m 25s
JUnit XML UTF-8 전수 합산
223 suites / 1,866 tests
failures 0 / errors 0 / skipped 10
```

R1의 1,859건에서 경계 회귀 7건이 증가한 TERRA 보고와 정확히 일치한다. skipped 10건은 이카운트 raw 원본 fixture가 있을 때만 실행되는 header cross-check이며, 이번 S1/S2 PostgreSQL IT skip은 0이다.

## 6. Flyway 재계수

GitHub API로 fetch 없이 원격 `main` tree를 다시 읽었다.

```text
원격 main SHA       0ced104f2f5f8dfa9ac7e6136e3098f7e5da0f1a
accounting migration 파일 수  70
최대 version         V96
main의 V97           없음
main의 V98           없음
```

지목된 PR #1126, #1134, #1132, #1167, #1164가 모두 MERGED인 것도 별도로 확인했다. 그 상태에서도 최대값은 V96이므로 PR #1165의 S1 `V97`과 S2 `V98`은 `V96 → V97 → V98`의 연속 열이며 충돌이 없다.

## 7. 이 라운드가 보지 않은 표면

- S3 그룹웨어 연결과 지출결의서 참조
- S4 화면·버튼, version 선택 UX, web controller/DTO/error 응답
- D-G7 기준일 잠금 및 확정 취소 정책
- 아직 존재하지 않는 영업수수료 정산 목록·집계·보고서·확정 수정/취소 경로
- 동시 `calculate` 대 `confirm` 경쟁의 API 오류 매핑
- 공유 DB의 실제 V97·V98 적용과 운영 데이터 write/migration
- product-service/slip-service/estimate-service 독립 전체 suite와 실제 견적→전표 E2E

위 표면은 PASS 판정에 포함하지 않았다.

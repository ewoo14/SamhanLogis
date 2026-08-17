# PR #1241 — 세트 구성품 가격 레거시 정합 보고서

작성일: 2026-08-17  
브랜치: `feat/gas-parity-order-web`  
작업 범위: `product-service` 세트 배분 로직 및 레거시 구성품 고정금액 보정

## ① RED 원문

먼저 `BundleExpanderIT.RED_contract_rounding_matches_legacy_thousand_won_split` 테스트를 추가하고 실패를 확인했다.

```text
BundleExpanderIT > RED_contract_rounding_matches_legacy_thousand_won_split() FAILED
expected: 599000
 but was: 600000
```

이는 999,999원 세트에서 실내 6, 실외 4 비중을 계산할 때 기존 구현이 단순 천원 반올림만 수행하고 레거시의 실외 잔액 보정(`splitIndoorOutdoorToK`)을 적용하지 않은 증거다. 테스트 하네스의 최초 실행은 `SAMHAN_GATEWAY_ATTESTATION` 누락으로 부트스트랩 단계에서 중단되었고, 테스트 attestation을 주입한 재실행에서 위 기능 RED assertion까지 도달했다.

## ② 고친 내용

- `BundleExpander.redistributeFromContract`의 AUTO 실내·실외 배분을 `splitIndoorOutdoorToK` 결과로 변경했다.
- FIXED(PANEL·REMOTE·MATERIAL)는 `fixed_allocation_amount`를 그대로 유지한다.
- AUTO(INDOOR·OUTDOOR)는 저장된 `allocation_weight` 비율로 잔액을 배분한다.
- 세트 합계는 레거시와 같은 천원 단위 split 및 잔액 보정으로 보존한다.
- 품명 추론과 런타임 하드코딩 비중 소비 경로를 사용하지 않는다.
- 시트 정본 고정금액을 `bundle_component.fixed_allocation_amount`에 채우는 `V44__legacy_component_fixed_allocation_amounts.sql`을 추가했다.
  - 대상: SINGLE_SET + EXPAND 부모의 고정 구성품
  - 정본 행: 246행
  - 대표값: `PC6NUNK1NW=128,000원`, `AR-EH05=16,000원`

수정 후 targeted test:

```text
1 test completed
BUILD SUCCESSFUL
```

## ③ 마이그레이션 번호 및 fresh 적용

product-service 마이그레이션 최신 번호를 다음 다섯 위치에서 대조했다.

| 위치 | 확인 결과 |
|---|---:|
| 현재 워크트리 | V44(이번 변경), 변경 전 V43 |
| main | V43 |
| 열린 PR w1237 | V43 |
| 열린 PR w1234 | V43 |
| 열린 PR w1240 | V43 |

따라서 product-service의 다음 번호는 V44이며 충돌이 없다. slip-service는 별도 마이그레이션 영역으로 main V123, 현재 브랜치와 위 열린 워크트리는 V122이며 이번 V44와 번호 충돌 대상이 아니다.

fresh PostgreSQL 통합 테스트 로그에서 전체 마이그레이션 적용을 확인했다.

```text
Migrating schema "public" to version "44 - legacy component fixed allocation amounts"
Successfully applied 44 migrations to schema "public", now at version v44
```

공유 DB에는 마이그레이션을 적용하지 않았다.

## ④ 271건 전수 대조

기존 271건 대조 산출물과 `271-diff-full.csv`를 기준으로 재확인했다.

| 항목 | 결과 |
|---|---:|
| 세트 수 | 271 |
| 구성품 행 | 855 |
| 확정된 구성품 내역 변경 세트 | 166세트(332행) |
| 변환 오류 | 0건 |
| 전환 전 구성품 합계 | 518,775,000원 |
| 전환 후 구성품 합계 | 518,775,000원 |
| 세트 총액 순증감 | 0원 |

독립 CSV 재계산에서도 전후 합계 차이는 0원이었다.

## ⑤ 세트 총액 vs 구성품 합 불일치 실측

271개 전 세트에 대해 레거시 구성품 합계와 세트 납품가를 비교했다.

```text
불일치 세트: 0건
양의 불일치: 0건
음의 불일치: 0건
최대 절대 차이: 0원
```

## ⑥ 라이브 캡처 및 행 수

요구된 Playwright 스펙을 `clients/desktop` 패키지 안에 추가하고 Chromium headless로 실행했다.

```text
spec: playwright/1241-component-price-parity-real-qa/1241-component-price-parity-real-qa.spec.ts
target: AC060CS6PBH1SY (싱글중대형)
expected: PC6NUNK1NW 128,000원 / AR-EH05 16,000원
```

격리 스택의 renderer URL(`127.0.0.1:5198`)이 기동되어 있지 않아 화면 진입 전에 `ERR_CONNECTION_REFUSED`가 발생했다. 공유 gateway/DB는 사용하지 않았으며, 따라서 이번 실행에서 생성된 라이브 캡처는 0장, 화면 행 수는 측정 불가(N/A)다. 금액과 행 수를 성공으로 추정하거나 기존 다른 라운드의 캡처를 PR #1241 증거로 재사용하지 않았다.

실행 원문 요약:

```text
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://127.0.0.1:5198/#/products/AC060CS6PBH1SY/edit
1 failed
```

## 검증 요약

- `clients/desktop`: `npm run typecheck` PASS (QA 스펙 추가 전 기존 검증). 추가한 미추적 QA 스펙을 포함한 재실행은 repo 정책상 `git add` 전 추적 집합 게이트에서 차단되었으며, `git add`는 사용자 지시로 수행하지 않았다.
- `clients/desktop`: `npm run lint` PASS (경고 196건, 오류 0건)
- `clients/desktop`: `npm run build` PASS
- `product-service` targeted `BundleExpanderIT`: PASS
- `product-service` 전체 테스트: 806건 중 1건 실패. 기존 `EstimateCatalogInternalControllerIT`가 fixture의 616,975원을 606,000원으로 기대하는 별도 baseline 불일치이며, 이번 V44 대상/BundleExpander 변경과 무관한 실패로 기록한다.

## ⑦ 프로세스 회수

이번 세션에서 격리 Docker compose stack은 기동하지 않았다. 공유 Docker stack은 사용자 소유 상태로 유지했다.

- 세션이 시작한 renderer 프로세스: 기동 직후 종료되어 잔여 0개
- 세션이 시작한 격리 컨테이너: 0개
- 공유 컨테이너: 중지하지 않음
- git add/commit/push: 수행하지 않음

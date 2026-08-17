# P1-03 공급가·VAT 반올림 계약 통일 Implementation Plan

> **For agentic workers:** 이 계획은 현재 세션에서 직접 실행한다. 커밋·푸시·PR은 금지한다.

**Goal:** VAT 포함 금액에서 공급가액과 VAT를 구하는 모든 공용 계산 진입점을 레거시 종합견적서의 HALF_UP·차액 VAT 계약으로 통일한다.

**Architecture:** 기존 `VatInclusiveUnitAmountCalculator`와 `VatAmountCalculator`를 공용 정본으로 사용한다. 저장 엔티티와 migration/backfill은 변경하지 않고, 계산 소비자와 순수 계산 테스트만 수정한다. 프런트엔드는 BigInt 기반 HALF_UP 분리를 공용 유틸리티에서 제공한다.

**Tech Stack:** Java 17/Spring Gradle, TypeScript/Vitest, Playwright, PowerShell.

**Spec:** 승인된 채팅 설계 및 `docs/dev-reports/2026-08-17-duplication-audit/P1-03-evidence.md`(현재 `HEAD`/`origin/main`에 부재).

## Global Constraints

- 기존 전표·견적 저장 데이터는 재계산하지 않는다.
- migration/backfill을 만들지 않는다.
- `line_total`과 `supply_amount`의 정본 선택은 하지 않고 기존 #900/#1032 근거만 보고한다.
- 공유 스택과 다른 워크트리는 건드리지 않는다.
- 테스트는 RED 원문과 GREEN 원문을 보고서에 기록한다.

### Task 1: RED 공용 계산 계약

**Files:**
- Modify: `shared/common/src/test/java/com/samhanair/logis/common/financial/VatAmountCalculatorTest.java`
- Modify: `clients/desktop/src/renderer/utils/vatRounding.test.ts`

- [ ] HALF_UP 경계값 `110005 → 공급 100005, VAT 10000`와 기존 DOWN 결과가 갈리는 사례를 기대값으로 작성한다.
- [ ] 기존 저장값을 입력으로 받은 계산이 입력 객체/값을 변경하지 않고 보존하는 순수성 테스트를 작성한다.
- [ ] 공용 Java/프런트 테스트를 실행해 생산 코드 변경 전 RED 원문을 저장한다.

### Task 2: GREEN 공용 계산기

**Files:**
- Modify: `shared/common/src/main/java/com/samhanair/logis/common/financial/VatAmountCalculator.java`
- Modify: `clients/desktop/src/renderer/utils/vatRounding.ts`

- [ ] 기본 VAT 포함 분리를 HALF_UP으로 변경하고 항등식 `supply + vat = total`을 유지한다.
- [ ] 프런트 정수 분리를 HALF_UP으로 변경하되 BigInt로 정확히 계산한다.
- [ ] `VatInclusiveUnitAmountCalculator`는 기존 단가-수량 계약을 유지하고 새 계산기를 만들지 않는다.
- [ ] RED 테스트를 GREEN으로 만든다.

### Task 3: 소비자 회귀 검증

**Files:**
- Inspect/modify only where required: `services/slip-service`, `services/accounting-service`, `services/partner-order-service`, `clients/desktop/src/renderer`

- [ ] 공용 계산기 호출 소비자가 명시적 다른 반올림 모드를 사용하지 않는지 확인한다.
- [ ] 전표·견적·회계전표·세금계산서·일마감·원장 경로의 기존 저장값 보존 테스트를 실행한다.
- [ ] 저장 엔티티와 migration은 변경하지 않는다.

### Task 4: 전수 영향 표·문서

**Files:**
- Create: `docs/qa/p1-03-vat-contract/report.md`

- [ ] 증거 파일 부재 사실, 과거 이슈/로그, 레거시 파일:줄 인용, RED/GREEN 원문을 기록한다.
- [ ] 66행·48건 전표와 13행·8건 견적은 판단 없이 현재값/통일값/차이를 표로 기록한다. 공유 DB에 쓰지 않는다.
- [ ] #900/#1032를 근거로 `line_total`/`supply_amount` 정본 선택을 보류한다고 기록한다.

### Task 5: 라이브 QA와 회수

- [ ] 변경 서비스 bootJar를 먼저 빌드한다.
- [ ] auth-service 없이 변경 서비스만 격리 실행하고 Playwright로 전표·견적의 공급가/VAT와 행 수를 캡처한다.
- [ ] `resolveQaShotsDir()` 경로만 사용한다.
- [ ] 모든 격리 프로세스/컨테이너를 회수하고 잔여 수를 기록한다.

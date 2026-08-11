# PR #1126 R6 — 홈멀티 파생계산 per-family merge

## 판정

R6 fix 구현 및 코드 회귀·실화면 QA를 완료했다. 커밋·푸시는 하지 않았다.

핵심 변경은 `applyServerHomeQuantitySync_()`의 반환 계약을 불리언에서 규칙 소유 target 모델 `Set`으로 바꾸고, `recomputeHomeDerived()`가 레거시 계산을 먼저 전부 실행한 뒤 서버 target만 덮어쓰게 한 것이다.

## RED 원문 — fix 전

fix 전 RED 테스트 실행 원문:

```text
FAIL test/quantity-sync.test.js
5 passed, 1 failed

● 서버 규칙 적용 후에도 legacy 네 파생계산을 실행하고 target 소유 모델만 덮어쓴다
Expected substring: "return new Set("
Received: applyServerHomeQuantitySync_()의 return false / return true 불리언 계약
```

원인: 규칙 1건이 있으면 `recomputeHomeDerived()`가 규칙 함수 뒤에서 즉시 `return`하여 호스·분기관·발통·판넬 레거시 계산에 도달하지 않았다.

## 변경 후 구조

```text
레거시 호스 → 분기관 → 리모컨 → 발통 → 판넬 계산
        ↓
applyServerHomeQuantitySync_()
        ↓
규칙 소유 target 모델만 서버 값으로 덮어씀
```

규칙 0건, evaluator 부재, evaluator 실패는 빈 `Set`을 반환한다. VM golden harness처럼 서버 함수 자체가 없는 구버전 환경은 `typeof` guard로 순수 레거시를 유지한다. R5 리모컨 계산 내용은 이동·삭제하지 않았다.

## 다섯 품목군 실측

서버 규칙 원문은 1건, target 3건이었다. 실내기 source `AM052BN6PBH1`을 0→2→4로 변경했다.

| 품목군 | 0대 | 2대 수량/금액 | 4대 수량/금액 | 판정 |
|---|---:|---:|---:|---|
| 판넬 `PC6NUDK1NW` | 0 / 0 | 2 / 208,120 | 4 / 416,240 | 서버 target 유지 |
| 유연호스 `FH-LFHLN` | 0 / 0 | 2 / 20,000 | 4 / 40,000 | 서버 target 유지 |
| 분기관 `AXJ-YA1509N`* | 0 / 0 | 0 / 0 | 3 / 135,300 | 실외기 3HP + 발통 조건에서 레거시 추종 |
| 발통 `발통세트`* | 0 / 0 | 0 / 0 | 1 / 0 | 실외기 3HP + 발통 ON에서 레거시 추종 |
| 리모컨 `AR-EC05` | 0 / 0 | 4 / 55,660 | 8 / 111,320 | R5 동작 유지 |

\* 분기관·발통은 실외기 `AJ030MXHNBC1` 1대, 발통 포함 ON, 분기관 제외 OFF 조건의 실측이다.

규칙 밖 1WAY 실내기 `AJ012BN1PBC2=3` 실측:

| 판넬 | 유연호스 L형 1WAY | 서버 target 4WAY 호스 | 리모컨 |
|---:|---:|---:|---:|
| `PC1MWSK3NW=3` / 230,505 | `FH-LFHLF=3` / 30,000 | `FH-LFHLN=0` / 0 | `AR-EC05=3` |

이는 규칙 target 밖 계열이 레거시 계산을 계속 수행함을 확인한 것이다.

## RED-A~E / 하드게이트

| 게이트 | 결과 | 증거 |
|---|---|---|
| RED-A 네 계열 추종 | PASS | 파생 실화면 스펙 9/9, E1·E2 원문 |
| RED-B 서버 target 우선 | PASS | `PC6NUDK1NW`, `FH-LFHLN` 0→2→4; R6 10/10 |
| RED-C 규칙 0건 exact diff | PASS | legacy golden 14 suites / 205 tests, H 계열 전수 및 금액 snapshot 0 diff |
| RED-D 호스 없음/I형 옵션 | PASS | E3/E5 `home_no_hose` 반영, legacy fallback 옵션 대조 |
| RED-E 리모컨 R5 계약 | PASS | 기본 0/0, 유선 2/90,750, 컬러 0/0, 제외 0/0; 성공·실패 8칸 |
| 서버 규칙 로드 | PASS | 견적 문서 HTTP 200, 본문에 `HOME_QUANTITY_SYNC_RULES`·`UI_HOME_MULTI_AM052BN6PBH1` 포함 |
| unexpected | PASS | R6 전용 Playwright 10/10, 파생 Playwright 9/9 |

R6 Playwright 하드게이트 원문:

```text
Running 10 tests using 1 worker
10 passed (53.4s)

Running 9 tests using 1 worker
9 passed (1.2m)
```

## 조합 표

고정 표본은 규칙 건수 0/1 × 호스 기본/없음/I형 × 리모컨 기본/유선/컬러/제외다.

| 규칙 | 호스 기본 | 호스 없음 | 호스 I형 | 리모컨 4종 |
|---:|---|---|---|---|
| 0건 | legacy 계산 | 0 반영 | legacy I형 경로 | 기본/유선/컬러/제외 R5 유지 |
| 1건 | legacy + target 덮어쓰기 | 0 반영, target 호스는 규칙 소유 여부에 따름 | legacy I형 계산 후 target만 덮어쓰기 | 기본/유선/컬러/제외 R5 유지 |

리모컨 8칸 실측 원문은 규칙 성공·실패 각각 다음과 같다.

```text
기본 = 0 / 0
유선 = 2 / 90,750
컬러 = 0 / 0
제외 = 0 / 0
```

## 제거·이동·개명 식별자 grep

- 제거된 조기 `return` 패턴: `applyServerHomeQuantitySync_()) { ... return;` 0건
- 제거된 R5 임시 `configuredByModel` 소비: 0건
- `remoteContractModels` 임시 집합: 0건
- `AR-CH01`은 기존 레거시 분류·리모컨 매핑에 남아 있으며 R6에서 제거하지 않았다.

## 테스트·검증

```text
quantity-sync.test.js: 6/6 PASS
estimate-app Jest: 14 suites, 205 tests PASS
estimate-app typecheck: typecheck OK: 17 JavaScript files
git diff --check: PASS
R6 Playwright: 10/10 PASS
derived Playwright: 9/9 PASS
```

## 신규 파일 목록

이번 R6 워크트리에 생성·갱신된 산출물:

- `docs/dev-reports/2026-08-09-896-r6-per-family-merge.md`
- `docs/qa/2026-08-09-896-r6/` 캡처 24장
- `clients/desktop/playwright/896-r6-legacy-contract-authority-real-qa/` 스펙·설정
- `clients/desktop/playwright/896-derived-check-real-qa/` 스펙·설정
- `docs/qa/2026-08-09-896-derived-check/` 실측 캡처

자격증명·토큰은 보고서와 캡처에 남기지 않았다.

## 못 한 것 / 범위 밖

- 조합 24칸을 하나의 자동화 실행으로 재측정하려던 보조 스크립트는 옵션 DOM 초기화 타이밍에서 중단됐다. 기존 R6 8칸과 E3/E5/E7 실측은 통과했고, 이 보조 실행의 미완료는 판정에 숨기지 않는다.
- 싱글중대형·상업멀티·구형 확장은 하지 않았다.
- 새 규칙·seed·DB write는 하지 않았다. 관리자 API 표본은 R6 target 추가 후 즉시 원복했다.
- `tools/legacy-gas/**`는 변경하지 않았다.
- 커밋·푸시는 하지 않았다.

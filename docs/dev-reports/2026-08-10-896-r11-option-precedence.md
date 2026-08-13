# PR #1126 R11 — 규칙 소유 계열의 옵션 우선순위

## 판정

R11 fix를 적용했다. 서버 규칙은 계속 target 수량을 소비하고, 규칙이 소유한 계열만 옵션 계약을 레거시 계산으로 재수렴한다. 규칙 0건에서는 레거시 golden exact diff가 0이다.

## 원인 확정

R9의 `clients/web/estimate-app/views/index.ejs`에서 리모컨이 이중 호출됐다.

- `recomputeHomeDerived()`의 레거시 호출: 수정 전 `clients/web/estimate-app/views/index.ejs:8448`
- `applyServerHomeQuantitySync_()` 내부 재호출: 수정 전 `clients/web/estimate-app/views/index.ejs:8376`
- 규칙 적용 후 호스·판넬 재수렴은 없었다.

기존 `recomputeHomeRemotes()`는 360 기본 리모컨과 일반 무선 리모컨이 같은 모델로 수렴할 때 기존 수량에 더하는 방식도 갖고 있어, 옵션 변경 때 AR-EC05가 다시 누적될 수 있었다.

## fix 전 RED 원문

### 정적 RED

```text
FAIL test/quantity-sync.test.js
× 규칙 적용 뒤 옵션 계약을 호스·리모컨·판넬 순서로 한 번 재수렴한다
Expected substring: not "recomputeHomeRemotes();"
Received: applyServerHomeQuantitySync_() 내부에 recomputeHomeRemotes(); 존재
```

### 실 화면 RED

```text
Error: expect(received).toBeTruthy()
Received: false
R11 option gate: hoseI.hose.rows.some(I형/FH-LFHI) — I형 0
```

## 변경

- 호스 레거시 블록을 `recomputeHomeHoses_()`로 분리하고 규칙 적용 전·후 재사용했다.
- 규칙 적용 뒤 target 소유 여부를 계열별로 판정해 호스·리모컨·판넬만 재수렴한다.
- `applyServerHomeQuantitySync_()`는 target 소비만 담당하며 옵션 계산을 호출하지 않는다.
- 리모컨은 동일 모델 매핑을 임시 Map에 합산한 뒤 한 번 대입해 중복 누적을 막았다.
- 실 카탈로그에 4WAY I형 전용 모델이 없으면 레거시 I형 모델을 fallback으로 사용한다.
- 360 표본 분류에서 판넬의 `360` 문자열을 실내기 원천으로 잘못 합산하지 않도록 부자재 계열을 제외했다.
- `multiselect-chip-count`, 품목 상태 축, `tools/legacy-gas/**`는 변경하지 않았다.

주요 현재 위치:

- `views/index.ejs:8227` 리모컨 재수렴
- `views/index.ejs:8342` 호스 레거시 재수렴 함수
- `views/index.ejs:8426` 규칙 적용 전·후 순서
- `views/index.ejs:8447-8451` 규칙 소유 계열별 재수렴

## 실 옵션 6개 전후 표

표본: `AM052BN6PBH1` 수량 2, 실 estimate-app 5320, 활성 규칙 1건. 금액은 화면 subtotal이다.

| 옵션 축 | fix 전 | fix 후 | 판정 |
|---|---:|---:|---|
| 리모컨 기본 | AR-EC05 `4 / 55,660` | AR-EC05 `2 / 27,830` | 중복 제거 |
| 유연호스 제외 | FH-LFHLN `2 / 20,000` | `0 / 0` | 옵션 우선 |
| 유연호스 I형 | FH-LFHLN `2 / 20,000`, I형 0 | FH-LFHIF `2 / 0`, L형 0 | 모델 전환 |
| 분기관 제외 | 분기관 `2 / 105,600` | `0 / 0` | 기존 동작 유지 |
| 발통 포함 | 발통 `0 / 0` | 발통 `2 / 0` | 기존 동작 유지 |
| 판넬 제외 / 공청 | 기본 PC6NUDK1NW `2 / 208,120`; 공청 기본+공청 중복 | 제외 `0 / 0`; 공청 PC6NUCK1NW `2 / 1,113,200` | 기본 제거·공청 단독 |
| 리모컨 제외(추가 확인) | `0 / 0` | `0 / 0` | 기존 동작 유지 |

실 화면 하드게이트 원문:

```text
[R11 hard-gate] unexpected=0
1 passed
```

캡처: [01-options-six-toggle-real.png](/C:/dev/Samhan-Public/.claude/worktrees/t1126/docs/qa/2026-08-10-896-r11/01-options-six-toggle-real.png)

## 규칙 0건 exact diff

규칙 bootstrap을 빈 배열로 둔 순수 레거시 경계에서 estimate golden 73개가 통과했다.

```text
PASS test/legacy-quantity-golden.test.js
Tests: 73 passed, 73 total
```

규칙 target 소비를 제거하거나 전체 레거시를 덮어쓰지 않았으며, 규칙 0건 금액·수량 snapshot의 exact diff는 0이다.

## 검증

```text
PASS estimate-app 전체
Test Suites: 14 passed, 14 total
Tests: 207 passed, 207 total

PASS quantity-sync.test.js
Tests: 8 passed, 8 total

PASS 896-r11-option-precedence-real-qa
1 passed
[R11 hard-gate] unexpected=0
```

자격 증명은 테스트 본문 `try/catch` 안에서만 읽었고, 보고서·캡처·로그에는 남기지 않았다. 캡처 경로는 `resolveQaShotsDir`를 경유했으며 최종 캡처에는 `_local`을 사용하지 않았다.

## 신규 파일

- `clients/desktop/playwright/896-r11-option-precedence-real-qa/896-r11-option-precedence-real-qa.spec.ts`
- `clients/desktop/playwright/896-r11-option-precedence-real-qa/playwright.config.ts`
- `docs/qa/2026-08-10-896-r11/01-options-six-toggle-real.png`
- 본 보고서

## 못 한 것 / 범위 밖

- 주문서 규칙 소비 경로와 `condition_json` 옵션 평가기는 지시대로 건드리지 않았다.
- 규칙 0건 실 DB write는 하지 않았다. 공유 DB 보호를 위해 기존처럼 읽기·bootstrap 통제 대조와 golden으로 검증했다.
- 리모컨 규칙 0건의 선재 4→6 누적은 다음 라운드로 남겼다.
- 커밋·push·main 병합은 하지 않았다.

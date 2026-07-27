# #851 이월 — CI 게이트 0 표면 2종 (기획)

> 대상 Issue: #851 (#936 `[CHORE] #851 슬1` 머지 후 이월분)
> 성격: 기획. 착수 전 PM(OPUS) 작성.
> 축: **도달성** — "이 표면을 검사한다고 적혀 있지만 실제로는 아무것도 검사하지 않는다" 는 것만 다룬다.

## 0. 이 슬라이스가 닫는 것

CI 가 green 이어도 **그 green 이 아무것도 증명하지 않는 표면** 2개를 닫는다. 둘 다 실측으로 확인했다.

| 항목 | 실측 근거 | 결과 |
|---|---|---|
| **B-1** real-QA 공유 하네스가 상대경로 스펙을 실행조차 못 함 | `clients/desktop/playwright.real-qa.config.ts:30-36` 의 `use` 에 `baseURL` 이 없다. 상대경로 `page.goto('/…')` 를 쓰는 real-QA 스펙이 **4개** 존재 | repo 전체 real-QA 일괄 실행 시 이 4개는 `Cannot navigate to invalid URL` 로 **조용히 빠진다** |
| **B-2** arologis-only PR 에서 가드 2종이 아예 안 돎 | `notion-zero-guard`·`config-audit-guard` 는 `.github/workflows/ci.yml:531,561` 에만 있고 `arologis-ci.yml` 에는 잡이 없다 | arologis 만 건드린 PR 은 두 가드가 **0회 실행**. 🚩`config-audit-guard` 는 **#745 SlipClient 8084 오배정 재발 방지용** |

### B-1 대상 스펙 (실측 4개)

```
clients/desktop/playwright/929-r5-route-collision-real-qa/929-r5-route-collision-real-qa.spec.ts
clients/desktop/playwright/929-r4-transport-guard-real-qa/929-r4-transport-guard-real-qa.spec.ts
clients/desktop/playwright/897-column-hierarchy-real-qa/897-column-hierarchy-real-qa.spec.ts
clients/desktop/playwright/928-web-version-check-real-qa/928-web-version-check-real-qa-real-qa.spec.ts
```

## 1. 불변식 (수단은 구현자가 정한다)

1. **일괄 실행에서 빠지는 real-QA 스펙이 0** — `playwright.real-qa.config.ts` 로 repo 전체를 돌렸을 때, 존재하는 `*-real-qa.spec.ts` 중 **네비게이션 실패로 실행되지 못하는 스펙이 없어야 한다**. "몇 개가 대상이고 몇 개가 실행됐는가" 를 수치로 제시할 것.
2. **하네스 3종 전제를 깨지 말 것** — 이 저장소의 real-QA 는 서로 다른 서버 형태를 쓴다(BrowserRouter 경로 / HashRouter `#/`). 한 스펙의 목표 화면을 다른 형태로 바꾸지 말 것. 기존 통과 스펙의 이동 경로가 바뀌면 안 된다.
3. **arologis-only PR 에서 두 가드가 실제로 실행된다** — 잡을 추가했다는 사실이 아니라, **arologis 경로만 바꾼 변경에서 그 잡이 돈다**는 것이 근거여야 한다.
4. **가드가 진짜로 잡는다** — 두 가드가 추가된 뒤, 각 가드가 막기로 한 위반을 **실제로 주입해 RED 를 확인**하고 원문을 제출한다(가드가 no-op 로 통과하면 게이트 0 이 이름만 바뀐 것).
5. **기존 잡 중복 실행/충돌 없음** — 같은 가드가 두 워크플로에서 동시에 도는 경우의 동작을 명시할 것.

## 2. 범위 밖 (명시적으로 뺀다)

| 항목 | 사유 |
|---|---|
| **R-1 형태 축** (`collectDeclarations` 가 `const`/`let` 만 보고 fixed-point 가 함수 호출 경계를 못 넘음) | 수단이 AST 급 분석이고, **현 저장소 코드에 그 형태가 0건**이다. 실 사용자 경로로 도달 불가 → 이번 머지 게이트 아님 |
| **`docs/planning` 을 `DOC_DIRS` 에 추가** | `scripts/check-credential-plaintext.sh:104-110` 에 **일부러 뺀 사유가 이미 기록**돼 있다(마크다운 닫는 백틱 기존 오탐). 넣으려면 자격 가드의 **판정 의미**를 바꿔야 하므로 이번 축(관할↔러너 정합)과 다른 별건 |

두 항목은 #851 에 이월로 남긴다. 새 이슈를 만들지 않는다.

## 3. 머지 게이트

1. 실 사용자 경로 재현 결함 0 (도달성)
2. CI green (exact SHA)
3. 라이브QA — real-QA 일괄 실행 실측 + arologis 경로 변경에서 가드 2종 실행 증거

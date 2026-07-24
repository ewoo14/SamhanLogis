# #880 — 좁은 폭에서 조작 버튼 컬럼 DOM 제거 → 기능 도달 불가 (6화면)

- PR: #917 · 이슈: #880
- 기간: 2026-07-23 (집PC) ~ 2026-07-24 (회사PC)
- 파이프라인: OPUS 기획 → LUNA 구현 → OPUS 1차 → SOL 2차 → LUNA fix → OPUS 재수렴 → SONNET5 fix → OPUS 재수렴2 → 머지

---

## 1. 무엇이 문제였나

`DataTable` 의 `mobilePriority: 'hidden'` 이 붙은 조작 버튼 컬럼이 좁은 폭(≤768px)에서 **DOM 자체에서 제거**되어, 해당 화면의 기능에 **도달할 수 없었다**. 6화면이 영향받았다 — 수금계획 · 받을어음 · 권한그룹 · 매입전표 · 매출전표 · 발송금지 거래처.

## 2. 무엇을 고쳤나

**production 순증 0.** 두 번의 fix 모두 기존 관례 재사용이었다.

| 라운드 | 변경 | 내용 |
|---|---|---|
| 구현(LUNA) | 조작 컬럼 `mobilePriority` `hidden` → `secondary` | 좁은 폭에서도 DOM 유지 |
| SOL 라운드 fix(LUNA) | `PermissionGroupManagePage:208` inline `gridTemplateColumns` → `mobile-form-grid` class | ≤768px 1열 전폭, >768px 2열 유지 |

`.mobile-form-grid` 정의는 **main 과 바이트 동일**(diff 부재) — class 를 붙였을 뿐이라 13개 기존 소비처는 무영향이다.

## 3. 🚨 회고 — 게이트가 제품을 한 번도 검사한 적이 없었다

구현자가 만든 회귀 게이트 스펙 `playwright/datagrid/narrow-action-column.spec.ts` 가 기본 주소를 **`127.0.0.1:5290`** 으로 하드코딩했다. mock 회귀 hard gate 의 webServer 는 `playwright.config.ts` 가 띄우는 **`127.0.0.1:5173`** 이고 CI 는 `AUDIT_BASE_URL` 을 주지 않는다.

```
CI 원문: page.goto: net::ERR_CONNECTION_REFUSED at http://127.0.0.1:5290/#/...   (20건 전부 동일)
```

로컬에서 20/20 이었던 이유는 **그때 그 PC 에 라이브QA 용 vite 가 5290 에 떠 있었기 때문**이다. 즉 이 스펙은 게이트 서버를 한 번도 본 적이 없다.

🔑 **직전 진단이 틀렸다.** 집PC 마감 코멘트는 *"게이트 스펙이 mock 데이터와 정합하지 않음(화면들이 mock 스위트에서 다르게 렌더)"* 이라고 적었는데, 이는 **코드 읽기 추정**이었고 실행해 보니 **mock 데이터는 멀쩡**했다(주소만 맞추면 20/20 통과). 캐논의 *진단 확증 의무*(불변식을 쓰기 전에 원인을 실행으로 확증) 위반이었다.

**계열 전수 처분** — 게이트 대상 스펙 115개 중 이탈은 이 1건뿐이었다. 나머지 114개는 `127.0.0.1:5173` 리터럴이거나 상대경로(`page.goto('/#/...')`)로 config `baseURL` 을 상속한다. `-real-qa` 접미사 스펙 148개는 게이트에서 제외되므로 제각각인 포트가 무관하다.

## 4. 🚨 회고 — "게이트 통과 = 제품 정상"이 항상 성립하지는 않는다

주소를 고쳐 게이트가 처음으로 제품에 도달한 뒤, 재수렴 라운드에서 **뮤테이션으로 게이트 자체를 검사**했다.

**유효성 증명** — 원 결함 형태(`mobilePriority: 'secondary'` → `'hidden'`)를 6화면 각각에 적용해 매번 전량 20건을 돌린 결과, **매번 정확히 그 화면의 좁은 폭 2건만 RED**(18 passed). 교차오염 0. 게이트는 제품을 실제로 재고 있다.

**⚠️ 가짜 통과 1건(검증품질 · 게이트 아님)** — 협착형 뮤테이션(`mobile-form-grid` class 제거 = SOL 이 실제로 발견했던 그 결함)에서 `권한그룹 조작 버튼 768/375px` 2건이 **GREEN** 이었다. 같은 상태의 실측은 375px 에서 `hitCenter=false`, **실제 마우스 클릭이 버튼에 착지하지 않음**, 320px 은 컨테이너가 폭 7px 세로 띠였는데도.

원인 — 공용 단언 `assertVisibleAndClickable` 은 DOM 존재 · `data-mobile-priority` 속성 · Playwright actionability 만 잰다. **Playwright 의 `click()` 은 `overflow:hidden` 조상을 프로그램적으로 스크롤해 버튼을 노출시킨 뒤 클릭하는데, 실사용자는 그 스크롤을 할 수 없다.**

이 결함형을 잡는 장치는 권한그룹 전용 test #20(기하 단언) **하나뿐**이고 나머지 5화면에는 대응물이 없다. 또 per-screen 테스트의 폭은 `[768, 375, 1920]` 뿐이라 **320px 은 권한그룹에서만** 검사된다.

> 현재 제품에는 이 결함이 실재하지 않는다(18/18 도달 실측). 검증 하네스의 약점이므로 머지 게이트로 올리지 않는다.

## 5. 최종 검증

| 축 | 결과 |
|---|---|
| 도달가능 | **0** — 라이브 실서버(권한그룹) 320/375/768px + mock 6화면×3폭 18조합 전부 도달 |
| 도달 판정 방법 | `elementFromPoint` + **실제 `page.mouse.click` 착지** + 클리핑 조상 검사 + 가로 오버플로 |
| CI | **35/35 green** (exact SHA `20d22a5ec`) · mock 회귀 hard gate SUCCESS |
| 라이브QA | 스크린샷 39장(`docs/qa/880-opus-reconv2/`) + 이전 라운드분 |

라이브 실측은 **권한그룹 1화면**만 가능했다 — 나머지 5화면은 실 DB 행이 0건이고, 데이터를 만들려면 공유 실데이터 write 가 필요한데 **전표 전기는 원장 비가역**이라 회피했다. 동일 production 코드를 쓰는 mock 렌더러 18조합 실측으로 대체했다(레이아웃/도달성은 데이터 출처에 의존하지 않음).

## 6. 하네스 지표

| 라운드 | 도달가능 | c | r |
|---|---|---|---|
| OPUS 1차 | 0 | — | — |
| SOL 2차 | 1 (권한그룹 협착) | 정의 불가(직전 0) | 0 |
| OPUS 재수렴 | 0 | 0.00 | 0 |
| OPUS 재수렴2 | 0 | 정의 불가(직전 0) | 0 |

**fix-유발 결함 0** — 두 fix 모두 production 순증 0 이었고 다음 라운드에 새 결함을 낳지 않았다.

## 7. 관련
- 메모리: `feedback_verify_playwright_gate_before_adversarial`(구현이 만든 게이트 스펙은 PM 이 적대검증 전에 CI green 확인) · `feedback_harness_defect_zero_design`(진단 확증 의무)
- 기획서: `docs/superpowers/plans/2026-07-24-880-narrow-action-column.md`

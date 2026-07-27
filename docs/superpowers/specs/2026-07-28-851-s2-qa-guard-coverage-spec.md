# #851 슬2 — QA 증거 오염 가드를 `qa/playwright` 트리까지 (+ #863 이월 흡수)

> 작성 2026-07-28 · OPUS 기획 · 근거 SHA `5d433d8e2`
> 연관 Issue: #851 (슬2) · #863 (이월 흡수)

---

## 1. 이 슬라이스가 서는 자리

⚠️ **이슈 #851 제목의 원래 요구는 이미 끝났습니다.** *"qa-e2e 가 BE 계약 변경에 미trigger"* 는 PR #936(`3a7c2039e`, 2026-07-26)이 `qa-e2e.yml` `paths` 에 `services/accounting-service/**` · `services/slip-service/**` 를 추가해 해소했습니다(현재 main `qa-e2e.yml:12-13` 실측 확인). 이월 2건(B-1 real-QA baseURL · B-2 arologis 가드)도 PR #949 가 닫았습니다.

**남은 것은 2026-07-26 재개방 코멘트의 슬2~슬4** 이고, 본 PR 은 **슬2** 입니다.

---

## 2. 문제 — 가드가 자기 마당만 지킨다

#952(`1bf32592b`)가 **QA 캡처 목적지 가드**를 강화했습니다. 그런데 그 가드가 실제로 검사하는 대상은 좁습니다.

`clients/desktop/scripts/qa-output-path-guard.test.cjs:48-49` 가 지목하는 헬퍼는 **둘뿐**입니다:

```js
const tsHelperPath  = path.join(desktopRoot, 'playwright', 'support', 'qa-screenshot-dir.ts')
const mjsHelperPath = path.join(desktopRoot, 'playwright', 'support', 'qa-screenshot-dir.mjs')
```

### 실측 ① — 같은 계약의 사본이 8벌이고, 그중 5벌에 물리 경로 판정이 없다

`grep -c realpath` 실측:

| 사본 | `realpath` |
|---|---|
| `scripts/lib/qa-shots-dir.cjs` | **1** ✅ |
| `clients/desktop/playwright/support/qa-screenshot-dir.ts` | **1** ✅ |
| `clients/desktop/playwright/support/qa-screenshot-dir.mjs` | **1** ✅ |
| `scripts/lib/qa-shots-dir.mjs` | **0** 🚩 |
| `scripts/lib/qa-shots-dir.sh` | **0** 🚩 |
| `scripts/lib/qa_shots_dir.py` | **0** 🚩 |
| `qa/playwright/utils/screenshot.ts` | **0** 🚩 |
| `infrastructure/scripts/operational-validation.ps1` | **0** 🚩 |

`.mjs` 는 **30개 넘는 캡처 스크립트가 import** 합니다. 즉 #952 가 넣은 *"같은 곳을 가리키는 다른 표기(junction·확장 길이)를 문자열 비교로는 못 잡는다"* 방어선이 **가장 많이 쓰이는 경로에는 없습니다.**

### 실측 ② — `qa/playwright` 트리 13파일이 `docs/qa` 를 직접 참조한다

```
qa/playwright/scripts/generate-arologis-dispatch-pages-screenshots.mjs
qa/playwright/scripts/generate-d-ax-12-mobile-cross-import-screenshots.mjs
qa/playwright/scripts/generate-d-ax-13-auth-contract-screenshots.mjs
qa/playwright/scripts/generate-d-ax-15-arologis-mobile-driver-runtime-screenshots.mjs
qa/playwright/scripts/generate-d-ax-16-arologis-mobile-signature-copy-screenshots.mjs
qa/playwright/scripts/generate-d-ax-17-arologis-mobile-photos-screenshots.mjs
qa/playwright/scripts/generate-d-ax-18-arologis-mobile-slip-detail-screenshots.mjs
qa/playwright/scripts/generate-d-ax-19-mobile-staff-driver-retirement-screenshots.mjs
qa/playwright/scripts/generate-d-ax-20-arologis-admin-photo-audit-screenshots.mjs
qa/playwright/tests/arologis/sp-10-2-insung-quick-vendor.spec.ts
qa/playwright/tests/nine-slice/smoke.spec.ts
qa/playwright/tests/signature-c/signature-c-smoke.spec.ts
qa/playwright/utils/screenshot.ts
```

⚠️ **이 목록은 "docs/qa 문자열이 등장하는 파일" 입니다 — "커밋 산출물을 덮어쓴다" 와 같은 말이 아닙니다.**
#952 라운드에서 PM 이 정확히 이 혼동으로 기획 전제를 틀렸습니다(`grep -rl "docs/qa"` 로 41을 셌는데 실제 명령 결과는 44였고, 그 파일들은 이미 공용 resolver 를 경유하고 있었습니다). **같은 실수를 반복하지 마세요.**

⟹ 🚨 **첫 임무는 "몇 곳이 실제로 커밋된 산출물을 덮어쓸 수 있는가" 를 실행으로 세는 것**입니다. 문자열 등장 수가 아니라 **쓰기 도달성**으로 세세요. 숫자가 13이 아니어도 됩니다 — 실측값이 정답입니다.

---

## 3. 불변식 (구현 수단은 지정하지 않는다)

- **I-1** — QA 캡처 목적지 계약을 **어느 사본으로 부르든 동일하게** 강제한다. 같은 물리 위치를 가리키는 다른 표기(junction · 확장 길이 접두사 · 대소문자 · 상대경로)로 우회할 수 없다.
- **I-2** — 가드가 검사하는 표면이 **사본 추가에 따라 자동으로 따라온다.** 새 resolver 사본을 만들어도 가드가 조용히 그것을 놓치지 않는다. (사본을 줄이는 것도 이 성질을 만족시키는 한 방법입니다.)
- **I-3** — `qa/playwright` 트리에서 실행되는 캡처가 **커밋된 QA 산출물을 덮어쓰지 못한다.** #952 가 `clients/desktop` 쪽에 세운 것과 **같은 강도**여야 한다.
- **I-4** — 기존에 통과하던 정상 캡처 경로가 **계속 통과한다.** 첫 캡처·승격 경로 포함.
- **I-5** — 이 가드가 **CI 에서 실제로 실행된다.** 게이트 스텝이 죽어도 green 이 되는 조합이 없다.

### 🚩 #863 이월 흡수 — PM 판정

PR #952 는 *"사본 8벌 중 5벌 무가드"* 를 **선재라는 이유로 이월**하고 후속 슬라이스 여부를 개발책임자 판단으로 올렸습니다. **본 PR 이 그 판단을 대신 받지 않고 흡수합니다.**

**근거** — 두 건이 **같은 표면**입니다. #851 슬2 가 `qa/playwright` 트리를 가드에 넣으려면 그 트리의 resolver(`qa/playwright/utils/screenshot.ts`)를 반드시 건드려야 하고, 그것이 이월 5벌 중 하나입니다. 나눠 하면 **같은 파일을 두 PR 이 만지고 라운드가 두 배**가 됩니다. 별도 이슈를 만들지 않고 여기서 닫습니다.

---

## 4. 🚨 RED-first 요구

**결함을 재현하는 실패 테스트를 먼저 쓰고, RED 원문을 제출한 뒤 고칩니다.**

1. 현재 가드가 **놓치는 경로를 실제로 통과시켜 보이는** 테스트를 쓰고 RED 원문을 남긴다. 최소한:
   - 무가드 사본(`.mjs` 등)을 통해 `docs/qa` 루트나 **다른 슬러그**로 캡처를 유도하는 경로
   - 같은 물리 위치의 **다른 표기**로 우회하는 경로
2. RED 가 **안 나오면 전제가 틀린 것**이므로 통과하도록 테스트를 조정하지 말고 **즉시 보고하고 멈춘다.**
3. 고친 뒤 같은 테스트의 GREEN 원문을 남긴다.
4. **정상 경로가 계속 통과함**(I-4)도 같은 실행으로 보인다.

⚠️ **`docs/qa/**` 아래 커밋된 산출물을 실제로 훼손하지 마세요.** #952 라운드에서 전체 mock 스위트가 커밋된 스크린샷 53장을 덮어쓴 실측 사고가 있었습니다. 임시 경로(`os.tmpdir()`)를 쓰고, 매 실행 전후로 `git status` 와 `git diff -- docs/qa` 가 **빈 출력**임을 확인해 보고서에 남기세요.

---

## 5. 범위

### 포함
- I-1 ~ I-5
- #863 이월 5벌 처리
- `qa/playwright` 트리의 쓰기 도달 경로 실측 (문자열 등장 수 아님)
- `clients/desktop/README.md:245-247` 이 루트 공유본으로 `.cjs` 만 열거하고 `.mjs` 를 빠뜨린 것 정정
- CI 등재 · 문서 동기화(dev-report · 관련 README)

### 제외 — **손대지 마세요**
- **#851 슬3** (`qa-e2e.yml:56` 의 `|| true` 제거) — 21건 선행 fix 가 필요해 별건입니다
- **#851 슬4** (`clients/desktop/playwright/**` 를 typecheck·lint 범위 편입)
- `assert-playwright-ran.mjs` 의 **최소 실행 건수 하한 부재** — 실재하는 구멍이지만(`:19` 가 `expected === 0` 만 검사) 슬3 과 같은 표면이라 여기서 열지 않습니다
- **mock parity 드리프트** — trigger 는 넓어졌지만 게이트가 mock 모드라 BE 계약 변경을 mock 이 따라가지 않으면 green 이 아무것도 증명하지 않는 문제. **별건으로 기록만 하고 손대지 마세요**
- `docs/qa/__863-r1-guard-fixture__` 빈 디렉터리 잔재 — 있으면 정리해도 되지만 목적은 아닙니다

---

## 6. 금지

- 🚫 **git 상태 변경 금지** — 파일만. commit·push·branch·stash 전부 PM 대행.
- 🚫 **새 이슈 등록 금지.**
- 🚫 **커밋된 QA 산출물 훼손 금지.** 실행 전후 `git diff -- docs/qa` 빈 출력 확인 의무.
- 🚫 **가짜 데이터·합성 출력 금지.** 🚨 인용한 "원문" 은 리뷰어가 같은 명령으로 재현합니다.
- 🚫 **문자열 등장 수를 쓰기 도달성으로 보고하지 마세요** — 이 저장소가 실제로 당한 오류입니다.

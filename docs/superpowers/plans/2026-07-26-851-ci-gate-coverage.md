# 기획 — #851 슬라이스 1: CI 게이트가 실제로 검사하게 한다

- 이슈: #851 (qa-e2e Desktop Playwright 가 BE 계약 변경 미trigger)
- 브랜치: `chore/851-ci-gate-coverage`
- 작성: PM(OPUS) 2026-07-26

---

## 1부 · 진단 확증

### ① 원 이슈 — trigger 경로 공백 (실측)
```
qa-e2e.yml  on.pull_request.paths
  qa/** · clients/** · services/arologis-service/** · .github/workflows/qa-e2e.yml
jobs
  playwright · desktop-playwright · detox-android · detox-android-arologis
```
⟹ **`services/accounting-service/**` 와 `services/slip-service/**` 가 trigger 에 없습니다.** BE-only 계약 변경은 Desktop Playwright 가 **한 번도 실행되지 않습니다.** `#823`(BE-only 커밋)이 34체크에 Desktop Playwright 부재로 통과했고, 실 FE 배분 차단(헤더 partnerId 불일치)을 CI 가 못 잡았습니다.

### ② 2026-07-26 PM 추가 실측 — **실행되는데 아무것도 검증하지 않는 게이트**

같은 하루에 **"게이트라고 불리는데 게이트가 아닌 것"** 을 여섯 종류 만났습니다:

| # | 형태 | 실측 |
|---|---|---|
| 1 | **`console.warn` soft-pass** | `datagrid-interaction.spec.ts` 가 **7 passed** 인데 7개 전부 *"DataGrid 셀 미발견"* 을 찍고 통과. 커밋된 캡처 파일명이 증거 — `TC-DG-1-no-grid-cells.png` |
| 2 | **게이트 0 표면** | `ci.yml` 에 Electron main 을 로드하는 스텝이 **0개**. `src/main/**` 이 2일간 깨진 채 머지됨(#931) |
| 3 | **mock 이 결함을 덮음** | `vi.mock('electron-updater')` 가 깨진 그 import 자체를 대체 |
| 4 | **`toContainText` 가 0px 통과** | 값이 폭 0으로 렌더돼도 `textContent` 존재로 통과(#929) |
| 5 | **타임존 의존** | KST PC 통과·UTC 러너 실패(#929) |
| 6 | **`setTimeout(0)` 클램프 편차** | 같은 코드가 격리=RED / 전체=false-GREEN, 또는 그 반대(#933) |

⟹ **①(발동 안 함)과 ②(발동하는데 검증 안 함)는 같은 문제의 두 얼굴**입니다 — *"CI green 이 무엇을 증명하는가"* 가 불명확합니다.

---

## 2부 · 🚧 슬라이스 범위 (PM 결정)

**포함**
- **①** BE 계약 경로가 FE 게이트를 발동시킨다 (원 이슈의 요구)
- **②-1** `datagrid-interaction.spec.ts` 의 soft-pass 제거 — **실행되는데 아무것도 검증하지 않는 게이트**를 실제 게이트로

**밖 (측정만 하고 고치지 않음)**
- 해시라우터 경로 방식 `goto` **17파일**(`#932` 에서 목록화) — 별도 배치
- `docs/qa/**` 에 쓰는 스펙 **36개**(`#926` 에서 2곳만 수선) — 별도 배치
- `clients/mobile` **CI 잡 신설** — 인프라 신설이라 별건
- `setTimeout(0)` 기법 **12곳**(`#933` 에서 목록화) — 개발책임자 판단 대기

🚫 발견이 범위를 넘으면 **PR 코멘트로 목록만**. 새 이슈 등록 금지(사전 허락 사항).

---

## 3부 · 불변식 (구현 수단은 지시하지 않습니다)

| # | 불변식 |
|---|---|
| **G1** | **BE 계약 변경이 FE 게이트를 발동시킨다** — `accounting-service`·`slip-service` 의 FE 대면 계약(client/dto/controller payload)이 바뀌면 Desktop Playwright 가 실행된다 |
| **G2** | **발동한 게이트가 실제로 검증한다** — `datagrid-interaction` 이 셀을 못 찾으면 **RED 가 된다**. `console.warn` 으로 넘어가지 않는다 |
| **G3** | **게이트가 진짜인지 증명된다** — 각 fix 에 대해 **고치기 전 코드로 되돌리면 RED** 임을 보인다. 이것이 이번 슬라이스의 본질이다 |
| **G4** | **CI 시간이 감당 가능하다** — trigger 를 넓히면 BE-only PR 도 FE 게이트를 돌게 된다. 그 비용이 수용 가능한지 **측정해 보고**한다 |
| **G5** | **기존 게이트를 약화시키지 않는다** — 현재 잡히는 것이 계속 잡힌다 |

### 📌 PM 결정 — G4 는 측정하고 보고만
trigger 를 넓히면 CI 시간이 늘어납니다. **얼마나 느는지 측정해 보고**하되, "너무 느려서 못 한다" 는 판단은 개발책임자 몫입니다. PM 이 임의로 범위를 좁히지 않습니다.

### 📌 PM 결정 — G2 는 "삭제" 가 답이 아닙니다
`datagrid-interaction` 이 지금 셀을 못 찾는 이유는 **해시라우터 네비게이션**(`#932` 실측)입니다. 스펙을 지우면 커버리지가 사라지고, 단정만 추가하면 RED 가 됩니다. **네비게이션을 고쳐 실제로 검증하게** 하는 것이 답입니다.

---

## 4부 · 회귀 울타리

| 표면 | 잡아야 하는 것 |
|---|---|
| trigger | BE 계약 파일만 바꾼 커밋에서 **Desktop Playwright 가 실제로 실행**된다(워크플로 파싱이 아니라 실행 근거로) |
| soft-pass | `datagrid-interaction` 이 셀을 못 찾는 상황에서 **RED**. 되돌려 확인 |
| 비용 | trigger 확대 전/후 CI 소요 **숫자로** |
| 무회귀 | 기존 34+ 체크가 그대로 유지 |

🚨 **`ci.yml`·`qa-e2e.yml` 을 건드리면 PyYAML 파싱 검증** 하십시오. `#` 로 시작하는 스텝 이름은 **따옴표 필수**(이번 주에 그 사고가 있었습니다).
🚨 **전체 mock Playwright 스위트를 돌리면 커밋 PNG 143개가 오염**됩니다(실측) — 필터를 거십시오.

---

## 5부 · U-gate

> **`accounting-service` 의 FE 대면 DTO 만 한 줄 바꾼 커밋에서 Desktop Playwright 가 실행되고, `datagrid-interaction` 이 셀을 못 찾으면 CI 가 빨개진다.**

둘 다 **실행으로** 확인합니다.

---

## 6부 · 동반 의무
한국어 커밋/PR · `docs/dev-reports/` 누적 · README·ROADMAP·DECISIONS 동기화

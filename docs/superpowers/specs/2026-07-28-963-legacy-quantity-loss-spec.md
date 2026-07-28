# #963 스펙 — 레거시 GAS 수량 계산 결함 2건 (견적 I형 1WAY 호스 0 소실 · 주문 홈멀티 수동수량 소실)

> 연관 Issue: #963 · 선행 #896(정찰·설계 결정 10항) · #948(`2cb21872b`, golden 정답 고정)
> 작성 2026-07-28 · 기획(OPUS) · 브랜치 `fix/963-legacy-gas-quantity-loss` (main `40c415426` 기준)

---

## 0. 한 문장

**수량이 곧 금액인데, 두 레거시 앱이 사용자가 실제로 넣은 수량을 말없이 0/자동값으로 지우고 있다. 이 슬라이스는 그 두 소실을 멈춘다.**

---

## 1. 진단 확증 — 실행으로 확인한 것

> 코드 판독 추정이 아니다. 아래는 전부 `clients/web/legacy-quantity-golden/legacyQuantityBoundary.js` 로 **정본을 실제 실행**해 얻은 출력이다. 정본 파일은 수정하지 않았고, 계측은 메모리상 `sourceMutator` 프로브로만 주입했다.

### 1.1 결함 1 — 견적 상업멀티 1WAY 유연호스 소실 (원인 **확증**)

입력: `C-02` 원수량 = `AM052DNLDBH1`(1WAY) 2 · `AM083DNMDBH1`(4WAY) 1 · `AM130ANHDBH1`(덕트) 1

```text
A. 전역 I형 ON + 화면칩 I형 ON  (이슈 재현 경로)
  결과수량: {"FH-LFHLF(L형1WAY)":0,"FH-LFHIF(I형1WAY)":0,"FH-LFHLF4W":0,"FH-LFHIF4W":1}
  계측:     {"SHOW_I_HOSE":true,"dom_comm_hose_i":true,"hose1L":"FH-LFHIF","hose1I":"FH-LFHIF",
             "hose4L":"FH-LFHIF4W","aliased":true,"nTarget":2,"nNormal":1,
             "want_hose1I":0,"want_hose1L":0}

B. 전역 I형 ON + 화면칩 I형 OFF
  결과수량: {"FH-LFHLF(L형1WAY)":0,"FH-LFHIF(I형1WAY)":0,"FH-LFHLF4W":0,"FH-LFHIF4W":1}
  계측:     {"SHOW_I_HOSE":true,"dom_comm_hose_i":false,"hose1L":"FH-LFHIF","hose1I":"FH-LFHIF",
             "aliased":true,"nTarget":2,"want_hose1I":0,"want_hose1L":0}

C. 전역 I형 OFF + 화면칩 I형 ON
  결과수량: {"FH-LFHLF":0,"FH-LFHIF":2,"FH-LFHLF4W":1,"FH-LFHIF4W":0}   ← 정상

D. 전역 I형 OFF + 화면칩 I형 OFF (기본)
  결과수량: {"FH-LFHLF":2,"FH-LFHIF":0,"FH-LFHLF4W":1,"FH-LFHIF4W":0}   ← 정상
```

**이슈 실측 원문 재현 대조 — 일치**

```text
이슈:  {"path":"estimate/commercial/I-hose","source1Way":2,"source4Way":1,"FH_LFHIF":0,"FH_LFHIF4W":1}
실행:  {"path":"estimate/commercial/I-hose","source1Way":2,"source4Way":1,"FH_LFHIF":0,"FH_LFHIF4W":1}
```

**원인 확증** — 이슈가 지목한 `index.ejs:4083`(현행 `:4083-4087` `pickHoseModel`) · `:8379`(현행 `:8379-8393` 호스계산) 이 실제 원인이 맞다. 계측이 `aliased: true` 를 직접 찍었다.

- `:4084-4085` `pickHoseModel('1way')` 는 `window.SHOW_I_HOSE` 가 참이면 `HOSE_I_1W` 를 반환한다.
- `:8379-8381` 은 `hose1L = pickHoseModel('1way')`(전역 기준) 과 `hose1I = HOSE_I_1W`(상수) 를 **서로 다른 권위**로 정한다.
- 전역이 켜지면 두 변수가 **같은 모델 코드**가 되고, `:8386-8391` 이 `nTarget` 을 쓴 직후 같은 키를 0으로 덮는다.

**이슈보다 넓다 — 확증**: 화면칩 상태와 **무관**하다. `window.SHOW_I_HOSE === true` 이면 A(칩 ON)·B(칩 OFF) **양쪽 다** 1WAY 호스가 0이 된다. 즉 조건은 "I형을 선택했을 때" 가 아니라 **"거래처 DC 설정에 I형이 켜져 있을 때 항상"** 이다.
(`:6587` 은 옵션바 `유연호스 I형` 체크박스 생성 지점이며, 결함의 원인이 아니라 **결함이 드러나는 화면 스위치**다.)

**실 사용자 도달성 — 확증(실 DB 실측)**
`window.SHOW_I_HOSE` 는 소스 상수(`estimate-app/lib/code.js:139 const SHOW_I_HOSE = false`)로 끝나지 않는다. 거래처별 DC 설정에서 덮인다(`lib/code.js:2019 showIHose: dc.showIHose === true` → `views/index.ejs:2415 window.SHOW_I_HOSE = !!CONFIG.showIHose`). 원천은 `dc-config-service` 의 `dc_config.show_i_hose` 컬럼이며 관리 화면(`changeShowIHose`)과 시트 import(`유연호스I형 → show_i_hose`)로 켤 수 있다.

```text
로컬 개발 DB (dc_config_db.dc_configs) 실측
 total_dc | i_hose_on
----------+-----------
      259 |        30

show_i_hose=true 거래처코드 예: 1012555999 / 1168803300 / 1550600923 / 1928601146 / 2232300204 …
```

⟹ **259개 DC 설정 중 30개(11.6%)** 가 이 결함의 사정권이다. 죽은 플래그가 아니다.

> 🚨 **R1 정정(PR #967 R1 라운드, SONNET5 반영)** — 위 "실 사용자 도달성 — 확증"은 계측을 `sourceMutator`로 `window.SHOW_I_HOSE`를 직접 주입해 계산 로직만 검증한 것이지, 그 값이 **실행 중인 견적 앱에서 실제로 그렇게 세팅되는지**까지 확인한 것은 아니었다. R1 적대검증(OPUS)이 실 견적 앱을 띄워 확인한 결과, `window.SHOW_I_HOSE`를 세팅하는 `applyConfigFromServer`는 **견적 앱에서 호출 0건**이다(정의만 있고 호출은 주문 앱뿐, `index.html:8142-8143`). 즉 **"259개 중 30개(11.6%)가 전부 결함 경로"는 견적 앱에서 성립하지 않는다** — 그 30곳을 선택해도 `window.SHOW_I_HOSE`·상업 칩은 바뀌지 않고, 실제로 자동 반영되는 것은 **홈멀티 칩(`chip_home_hose_i`, `applyCustomerDiscounts`가 세팅, `index.ejs:2601`)뿐**이다. 이 fix(결함 1)는 그럼에도 **유지한다** — 현재 실 경로 동작을 바꾸지 않고(BASE==HEAD 비트 동일 실측), 주문 앱처럼 `applyConfigFromServer` 배선이 견적에도 붙는 순간 즉시 도달하는 잠재 결함이기 때문이다. 성격: **"현재 실 경로 미도달, 배선 시 도달"**. 상세: PR #967 R1 라운드 코멘트.

### 1.2 결함 2 — 주문 홈멀티 수동수량 소실 (원인 **확증**)

**이슈 실측 원문 재현 대조 — 일치**

```text
이슈:  {"path":"order/home/manual-panel-then-recompute","manuallyEntered":9,"afterRecompute":1}
실행:  {"path":"order/home/manual-panel-then-recompute","manuallyEntered":9,"afterRecompute":1}

estimate: H-03-PANEL-LOCK (PC1MWSK3NW 수동 9) → PC1MWSK3NW=9   ← 견적은 보존한다
order   : H-03-PANEL-LOCK (PC1MWSK3NW 수동 9) → PC1MWSK3NW=1   ← 주문은 잃는다
주문앱 잠금입력 없이(실제 앱 상태)            → PC1MWSK3NW=1
```

**원인 확증** — 이슈가 지목한 `order-app/index.html:4851`(`onHomeQtyInput`) · `:4880`(홈 옵션 change → `recomputeHomeDerived(true)`) · `:5033`(`recomputeHomePanels` 무조건 재계산) 이 실제 원인이 맞다.

- `grep -c "HOME_MANUAL" clients/web/order-app/index.html` → **0**. `grep -c "COMM_MANUAL"` → **20**. 즉 주문 앱은 **상업 파생에는 수동 보존이 있고 홈 파생에만 없다.**
- 대조군: 견적 `index.ejs:7655-7659` 에 `HOME_MANUAL_PANEL/HOSE/REMOTE/BRANCH/FOOT` 5개 Set 이 선언돼 있고, `:7695-7699` 가 사용자가 파생 행에 입력하면 해당 Set 에 등록한다. 그래서 옵션 변경 재계산에서도 값이 남는다.

**이슈보다 넓다 — 확증(계열 전수 sweep)**: 판넬 한 종류가 아니라 **홈 파생 5계열 전부**가 같이 잃는다.

```text
estimate 홈 판넬(PC1NWSK3NW)   수동 77 → 77     order 홈 판넬   수동 77 → 2
estimate 홈 호스(FH-LFHLF)     수동 77 → 77     order 홈 호스   수동 77 → 2
estimate 홈 리모컨(AR-EC05)    수동 77 → 77     order 홈 리모컨 수동 77 → 3
estimate 홈 발통(발통세트)      수동 77 → 77     order 홈 발통   수동 77 → 2
estimate 홈 분기관(AXJ-YA1509N) 수동 77 → 77     order 홈 분기관 수동 77 → 0
```

**실 사용자 도달성 — 확증(코드 경로)**: 주문 앱 홈 표의 파생 행도 편집 가능한 `qty-input` 으로 렌더된다(`index.html:3855`). 입력 핸들러 `onHomeQtyInput`(`:4851-4857`) 은 `homeQty.set` 만 하고 수동 표식을 남기지 않으며, 홈 옵션바의 모든 `input,select` 가 `change` 에서 `recomputeHomeDerived(true)` 를 호출한다(`:4884-4885`). 머지 전 라이브 QA 로 실 화면 재확인 대상.

### 1.3 원인 **미확정**으로 남긴 것

없음. 두 결함 모두 원인을 계측으로 확증했다.
다만 **결함 1 의 "올바른 결과값"** 은 확정하지 못했다 — 그것은 코드 문제가 아니라 도메인 결정이다(§5 결정 D-1).

---

## 2. 기존 결정 교차검증 (#896)

| #896 결정 | 원문 | 본 이슈와의 관계 | 판정 |
|---|---|---|---|
| **#1 정본 파일 경계** | 실행 포팅본 2개 구현, `tools/legacy-gas/**` 는 read-only 감사 원본 | 구현 대상 = `clients/web/estimate-app/views/index.ejs`, `clients/web/order-app/index.html` | ✅ 준수. `tools/legacy-gas/**` 무수정 |
| **#2 드리프트 처리** | *"이관 1차는 각자의 현행 결과를 그대로 시드. 행위 수정은 별건 분리"* | **이 이슈가 그 별건이다** | ✅ 정합 |
| **#5 C-09 분기보드** | 별도 알고리즘 유지, 슬2 시드 제외 | 두 결함 모두 C-09 계산 경로(`recomputeBranchCodes` / `pushBranchPartsToCommFromBadges`)를 건드리지 않는다 | ✅ 비간섭 (§4 실측) |
| **#7 수동 파생수량 정책** | *"(a) 이관 중에는 현행 앱별 정책 유지, 별도 UX 결정 후 통일"* | **결함 2 fix 가 이 결정을 갱신한다** | ⚠️ **결정 D-2 필요** |
| 드리프트 8건 목록 | survey §5 표 + s1 dev-report §13.4 | 8행 중 **1건(`H-03-PANEL-LOCK`)만 해소, 7건 유지** + 그 목록 밖의 별도 1건(`C-02-I-HOSE`)도 해소 (🚨 R1 정정 — "8→6"은 두 목록을 중복 집계한 계수 오류) | 문서 갱신 범위 = §7 |

### 2.1 드리프트 8건 중 7건 유지 + 목록 밖 별도 1건 수렴 (🚨 R1 정정: "8→6" 아님)

s1 dev-report §13.4 의 sweep 원문 기준:

| # | id / model | 견적 | 주문 | 본 fix 후 |
|---|---|---:|---:|---|
| 1 | `H-01` `AR-EC05` | 4 | 3 | 유지 (360 기본 리모컨 정규식 차이 — 범위 밖) |
| 2 | `H-07` `AXJ-YA1509N` | 1 | 0 | 유지 (홈 분기관 게이트 차이 — 범위 밖) |
| 3 | `H-01-I-DOM-ONLY` `FH-LFHIF` | 2 | 0 | 유지 (홈 I형 진입점 차이 — 범위 밖) |
| 4 | `C-01-AIR-PANEL` `PC4NUCK4NW` | 1 | 0 | 유지 (4Way 공청 치환 차이 — 범위 밖) |
| 5 | `S-01-CATEGORY-DRIFT` `set-round-target` | 0 | 4 | 유지 (싱글 받침대 대상 차이 — 범위 밖) |
| 6 | `C-02-REMAINDER-DRIFT` `FH-LFHLF4W` | 2 | 0 | 유지 (상업 호스 "나머지" 차이 — 범위 밖) |
| 7 | **`H-03-PANEL-LOCK` `PC1MWSK3NW` 9 vs 1** | 9 | 1 | **해소 — 주문이 견적으로 수렴** |
| 8 | `C-09-2812` `AXJ-YA2812M` | 5 | 2 | 유지 (분기보드 수동 추가 — 결정 #5 로 범위 밖) |

추가로 s1 dev-report §6-3 이 새 드리프트로 기록한 **"견적만 I형 1WAY 상쇄"(`C-02-I-HOSE` 견적 `FH-LFHIF` 없음 vs 주문 2)** 도 **해소된다**.
⟹ **survey §5 표(8행) 와 s1 dev-report §13.4 sweep(8행) 및 §6-1·§6-3 서술을 갱신해야 한다.** 갱신 대상 파일은 §7.

### 2.2 미해결 선행조건 간섭 판정 — `legacyQuantityBoundary.js:333-334`

CURRENT-WORK 가 *"빈 슬롯과 용량 0 을 둘 다 `'0'` 으로 뭉갠다 → #896 슬3 흡수(PM 권고)"* 로 남긴 항목.

**판정: 본 이슈와 간섭 없음. 이번 PR 에서 건드리지 않는다.**

근거 3가지:
1. 해당 코드는 `runBranch()` 안에만 있고 **C-09(분기보드) 전용** DOM mock 이다. 두 결함의 계산 경로(`recomputeCommDerived` 호스 블록 · `recomputeHomePanels` 등)는 `runBranch` 를 타지 않는다.
2. 실측 — `cap=null`(빈 슬롯) 과 `cap=0` 의 결과가 현재 두 앱 모두 **동일**하다. 이 뭉갬은 지금 어떤 golden 값도 좌우하지 않는다.
   ```text
   cap=null → order={"AXJ-YA1509N":1,"AXJ-YA2812M":1}  estimate={"AXJ-YA2812M":1}
   cap=0    → order={"AXJ-YA1509N":1,"AXJ-YA2812M":1}  estimate={"AXJ-YA2812M":1}
   ```
3. 결정 #5 로 C-09 는 별도 알고리즘 유지 대상이다. 여기서 손대면 범위 점증이다([[feedback_expanded_scope_reinstate_review]]).

---

## 3. 요구사항

### R1 — 견적 상업멀티 1WAY 유연호스가 사라지지 않는다
거래처 DC 설정 `유연호스 I형` 과 화면 `유연호스 I형` 칩의 **어떤 조합에서도**, 유연호스를 제외하지 않은 한 1WAY 대상 실내기 수량이 1WAY 유연호스 수량으로 계상된다.

### R2 — 주문 홈멀티에서 사용자가 직접 넣은 파생 수량이 보존된다
사용자가 손으로 입력한 홈 파생 품목 수량은 이후 홈 옵션 변경·재계산에서 유지된다. 대상은 **홈 파생 5계열 전부**(판넬·유연호스·리모컨·발통·분기관)다.

### R3 — golden 이 새 정답으로 재생성되고, 여전히 판별력을 갖는다
행위 변경으로 RED 가 된 golden 을 새 실행 결과로 갱신하되, 갱신 후에도 기존 뮤테이션 게이트가 전부 RED 를 유지한다.

### R4 — 이미 확정된 문서의 금액을 소급 변경하지 않는다
확정 견적/주문 라인의 저장 금액은 이 변경으로 바뀌지 않는다(§6 참조).

---

## 4. 불변식 — *무엇이 참이어야 하는가* (구현 수단 미지시)

> 🚨 **경로 수와 무관하게 성립하도록 썼다.** #896 슬2 가 "형태별로 하나씩 막는 fix" 로 4라운드를 끌었다. 아래는 분기를 열거하지 않고 **보존량**으로 진술한다.

### I-1 (결함 1 · 보존)
유연호스가 제외되지 않은 상업멀티 계산에서,
**1WAY 계열 유연호스(L형 1WAY + I형 1WAY)의 최종 수량 합 = 1WAY/2WAY 대상 실내기 수량 합(`nTarget`)** 이다.
전역 설정 ON/OFF × 화면칩 ON/OFF **네 조합 전부**에서 성립한다.

### I-2 (결함 1 · 보존)
같은 계산에서 **4WAY 계열 유연호스(L형 4WAY + I형 4WAY)의 최종 수량 합 = 나머지 대상 실내기 수량 합(`nNormal`)** 이다. 네 조합 전부에서 성립한다.

### I-3 (결함 1 · 배타)
1WAY 계열에서 수량이 실리는 모델은 **한 형태뿐**이다(L형과 I형에 동시에 양수가 실리지 않는다). 0이 되는 쪽은 **선택되지 않은 형태**여야 한다 — 선택된 형태가 0이 되는 조합은 존재하지 않는다.

### I-4 (결함 1 · 스위치 권위)
어느 형태가 선택되는지는 **하나의 권위**로 결정된다. 같은 계산 안에서 두 개의 서로 다른 권위(전역 설정 / 화면칩)가 같은 결정을 각각 내리지 않는다.
> 어느 쪽이 그 권위인지는 **결정 D-1** 이 정한다. 구현자는 D-1 확정 전에는 이 불변식을 만족시키는 어떤 구조도 선택할 수 없다.

### I-5 (결함 2 · 보존)
주문 앱 홈멀티에서 **사용자가 직접 입력한 파생 품목 수량은, 기준 품목(실내기·실외기) 수량이 바뀌지 않는 한 이후 어떤 재계산에서도 값이 유지된다.**
"파생 품목" 은 특정 모델 목록이 아니라 **홈멀티에서 자동 계산되는 모든 품목 계열**을 말한다.

### I-6 (결함 2 · 자동 계산 불정지)
사용자가 손대지 않은 파생 품목은 **계속 자동 계산값을 따른다.** 수동 보존이 자동 계산 자체를 멈추게 해서는 안 된다.

### I-7 (결함 2 · 해제 가능)
수동 보존 상태는 **되돌릴 수 있다.** 사용자가 한 번 값을 넣었다고 그 행이 세션 내내 영구히 얼어붙지 않는다(화면 초기화·문서 리셋 시 자동 계산으로 복귀).

### I-8 (양 결함 공통 · 무훼손)
**이 변경이 건드리지 않기로 한 경로의 결과는 비트 단위로 같다.** §8 회귀 울타리 목록의 값이 하나라도 바뀌면 그 자체가 결함이다.

### I-9 (fixture 실재성)
새로 만들거나 갱신하는 fixture 입력은 **실 사용자 경로가 실제로 만들 수 있는 상태**여야 한다([[feedback_fixture_must_be_reachable_by_real_path]]).
특히 `H-03-PANEL-LOCK` 의 `manualLocks.home` 입력은 **현재 주문 앱에서 어떤 실 경로로도 만들 수 없다**(`HOME_MANUAL_*` 0건). fix 이후에는 "사용자가 판넬 수량 칸에 직접 입력한다" 는 실 경로가 그 상태를 만들어야 한다. 그렇지 않은 golden 은 허구다.

---

## 5. 🚨 개발책임자 결정 필요 항목

### D-1 (필수 · 선행) — 전역 I형 설정과 화면칩이 엇갈릴 때 1WAY 호스는 어느 형태인가?

실측이 만든 질문이다. 현재 `SHOW_I_HOSE=true` + 화면칩 OFF 조합에서 1WAY 호스는 **L형도 I형도 아닌 0** 이다. 이 칸을 무엇으로 채울지는 코드가 알려주지 않는다.

| 근거 | 가리키는 답 |
|---|---|
| 같은 계산의 **4WAY** 는 전역만 보고 I형을 고른다(실측 B: `FH-LFHIF4W:1`) | **전역 우선** |
| **주문 앱**은 화면칩 자체가 없고 전역만 본다(`index.html:5349-5350`) | **전역 우선** |
| 견적 **홈멀티**는 전역과 무관하게 화면칩만 본다(`index.ejs:8320-8325`) | **화면칩 우선** |
| 화면칩은 **단가**에도 관여한다(`index.ejs:4421-4422` — 칩이 꺼지면 I형 단가 7000 고정) | **화면칩 우선** |

⚠️ 이 조합은 예외가 아니라 **가장 흔한 경로**다 — `show_i_hose=true` 인 30개 거래처에서 담당자가 화면칩을 따로 켜지 않으면 전부 여기에 해당한다. (🚨 R1 정정 — §1.1 말미 참조: 이 "흔한 경로"는 **주문 앱** 기준이다. 견적 앱은 `applyConfigFromServer` 미호출로 전역 자체가 현재 켜지지 않아, 이 엇갈림 조합이 견적에서는 아직 도달하지 않는다.)

**PM 권고**: **전역 우선**(전역이 켜져 있으면 1WAY·4WAY 모두 I형). 4WAY 현행 동작·주문 앱과 일관되고, 화면칩은 "전역이 꺼진 거래처에서 이번 건만 I형" 이라는 상향 스위치로 남는다. 다만 이 권고는 **금액을 바꾸는 도메인 판단**이라 승인 없이 진행하지 않는다.

### D-2 (필수) — #896 승인 결정 #7 을 개정하는가?

결정 #7 은 *"수동 파생수량 수정 정책은 1차 이관 중 앱별 현행 유지, 별도 UX 결정 후 통일"* 이었다. 결함 2 fix 는 주문 앱을 견적 앱으로 수렴시키므로 이 결정을 개정한다.
개발책임자가 이 이슈를 직접 등록한 것이 사실상 승인이지만, **survey §11 결정 #7 을 "주문 홈멀티도 견적과 동일하게 수동값을 보존한다" 로 명시 개정**해도 되는지 확인이 필요하다(문서가 계속 반대를 말하고 있으면 다음 슬라이스가 그걸 근거로 되돌린다).

### D-3 (조건부) — 저장된 주문 문서의 복원 결과가 바뀌어도 되는가?

**실측한 사실**
- 확정 문서는 **금액을 스냅샷으로 보관**한다 ⟹ 소급 변경 없음.
  - `slip_db.estimate_lines`: `quantity`·`unit_price`·`supply_amount`·`vat_amount`·`line_total` 컬럼 보유 (로컬 24건 / 35행)
  - `partner_order_db.partner_order_lines`: `quantity`·`price_vat`·`subtotal`·`supply_amount`·`vat_amount` 보유 (로컬 33건 / 63행)
- **재생 blob** 은 다르다.
  - 견적 `applySnapshot`: 재계산(`index.ejs:16948-16950`) **후에** 저장 수량을 다시 덮는다(`:16956-16958` 이차코어복원) ⟹ 저장값이 최종. **본 fix 영향 없음.**
  - 주문 `applySnapshot`: 저장 수량 복원(`index.html:9022-9024`) → 렌더 → **재계산(`:9053-9055`) 이 마지막** ⟹ 오늘도 복원 시 파생 수량이 자동값으로 덮인다. **fix 방식에 따라 이 결과가 바뀔 수 있다.**
  - 로컬 실측: `partner_order_drafts` **0행**, `quote_snapshots` **0행**. **운영 DB 건수는 미측정** — 이 세션에서 운영 접근 없음.

**선택지**
- **(a) 소급 0** — 새 수동 표식이 없는 기존 스냅샷은 현행대로 재계산한다. 기존 문서 복원 결과 불변.
- **(b) 저장값 우선** — 복원 시 저장 수량이 이긴다(견적과 동일). 기존 스냅샷의 복원 결과가 바뀐다.

**PM 권고**: **(a)**. #896 이 "금액 회귀 0 이관" 을 관통 원칙으로 세웠고, 결함 2 는 *새로 만드는 문서*의 손실을 막는 것이 목적이다.

> D-1 은 **구현 착수 전** 확정이 필요하다(불변식 I-4 가 그 답에 의존). D-2·D-3 은 구현과 병행 가능하되 머지 전 확정.

---

## 6. 금액 영향 판정 (요약)

| 대상 | 저장 방식 | 이 fix 의 영향 |
|---|---|---|
| 확정 견적 라인 `estimate_lines` | 라인별 **금액 스냅샷** | **없음(소급 0)** |
| 확정 주문 라인 `partner_order_lines` | 라인별 **금액 스냅샷** | **없음(소급 0)** |
| 견적 재생 blob `quote_snapshots.snapshot_data` | 클라이언트 재생 blob, 복원 시 **저장값이 최종** | **없음** |
| 주문 재생 blob `partner_order_drafts.payload_json` | 클라이언트 재생 blob, 복원 시 **재계산이 최종** | **D-3 에 달림** |
| **앞으로 만들 견적/주문** | — | **바뀐다 — 그것이 이 슬라이스의 목적** |

앞으로 만들 문서의 변동 방향: 결함 1 fix 는 그동안 **누락되던 1WAY 유연호스가 계상**되므로 해당 30개 거래처의 상업멀티 견적 금액이 **올라간다**. 결함 2 fix 는 사용자가 의도한 값이 유지되므로 **사용자가 입력한 대로** 나온다.

> 📌 이미 "호스 없이" 나간 견적이 있다면 그것은 코드가 아니라 **업무 처리**(재견적/사후 정산) 문제다. 필요 여부는 개발책임자 판단이며 이 PR 범위 밖이다.

---

## 7. 범위 · 경계

### 구현 대상
| 경로 | 비고 |
|---|---|
| `clients/web/estimate-app/views/index.ejs` | 결함 1 |
| `clients/web/order-app/index.html` | 결함 2 |
| `clients/web/legacy-quantity-golden/goldens.js` | golden 재생성 (§9) |
| `clients/web/legacy-quantity-golden/fixtures.js` | 필요 시 fixture 추가만(§9, I-9 준수) |
| `clients/web/estimate-app/test/legacy-quantity-golden.test.js` | 드리프트 어서션 갱신 |
| `clients/web/order-app/src/__tests__/legacy-quantity-golden.test.ts` | 드리프트 어서션 갱신 |

### 문서 동기화 대상 (드리프트 8건 중 7건 유지 + 별도 1건 수렴 반영, 🚨 R1 정정: "8→6" 아님)
- `docs/superpowers/specs/2026-07-27-896-survey.md` §5 드리프트 표 · §11 결정 #7 (D-2 확정 후)
- `docs/dev-reports/2026-07-27-896-s1-golden-baseline.md` §6-1 · §6-3 · §13.4 sweep
- `clients/web/legacy-quantity-golden/goldens.js` 의 `H-03-PANEL-LOCK` 주석(현재 "주문에는 수동 잠금 개념 자체가 없다" 라고 적혀 있다)
- 신규 `docs/dev-reports/2026-07-28-963-legacy-quantity-loss.md`
- `README.md` · `ROADMAP.md` · `docs/samhan-public-overview.html` ([[feedback_continuous_docs_sync]])

### 명시적 비대상
- 🚫 `tools/legacy-gas/**` — 감사 원본 read-only (결정 #1)
- 🚫 C-09 분기보드 · `legacyQuantityBoundary.js:333-334` 뭉갬 (§2.2 · 결정 #5)
- 🚫 드리프트 8건 중 나머지 7건 — 별건 (🚨 R1 정정: "나머지 6건"은 계수 오류)
- 🚫 `dc-config-service` · 그 어떤 백엔드 서비스도 변경하지 않는다
- 🚫 #896 슬2/슬3(규칙 스키마·evaluator) 착수

---

## 8. 회귀 울타리 — *계속 이대로여야 하는 것*

> 전부 `git ls-files` 로 확인한 **실재 자산**이며, 값은 **현행 코드에서 실행해 얻었다**. 합성 아님.

### F-1 golden 무훼손 목록 (변경 금지)
현행 HEAD 에서 전수 실행 결과 **불일치 0** 임을 확인했다.

```text
현재 코드 기준 golden 전수(20가족 × 2앱 + 옵션 45건 × 2앱) 불일치 = 0
```

아래는 이번 fix 로 **바뀌면 안 되는** 항목이다.

| 범주 | 항목 | 근거 |
|---|---|---|
| 견적 기본 20가족 | `estimateGoldens['H-01'…'C-09']` 전부 | 두 결함 모두 전역 I형 OFF·수동 입력 없음 상태를 건드리지 않는다 |
| 주문 기본 20가족 | `orderGoldens['H-01'…'C-09']` 전부 | 〃 |
| 견적 옵션 45건 | `C-02-I-HOSE` **를 제외한** 44건 | §9 변경 목록 참조 |
| 주문 옵션 45건 | `H-03-PANEL-LOCK` **을 제외한** 44건 | 〃 |
| C-09 전 계열 | `C-09-1509/2512/2812/2815/3419/4119/HP-1509` 견적·주문 14값 | §2.2 비간섭 |
| 드리프트 7건 (🚨 R1 정정: "6건" 아님) | `H-01`·`H-07`·`H-01-I-DOM-ONLY`·`C-01-AIR-PANEL`·`S-01-CATEGORY-DRIFT`·`C-02-REMAINDER-DRIFT`·`C-09-2812` | 범위 밖 |

### F-2 계속 동작해야 하는 실 경로 (실측 기준값 포함)

| # | 경로 | 현행 실측 | fix 후 기대 |
|---|---|---|---|
| F-2-1 | 상업 `유연호스 제외` 체크 시 기존 호스 수량이 0이 된다 (사전 L=5/I=5 시드) | 양 앱·전역 ON/OFF **4조합 모두 L=0 I=0** | 동일 |
| F-2-2 | 상업 `COMM_MANUAL_HOSE` 수동 잠금이 호스를 보존한다 | 양 앱·전역 ON/OFF **4조합 모두 42** | 동일 |
| F-2-3 | 상업 `COMM_MANUAL_PANEL` 수동 잠금 | 양 앱 **55** | 동일 |
| F-2-4 | 상업 `COMM_MANUAL_PUMP` 수동 잠금 | 양 앱 **55** | 동일 |
| F-2-5 | 상업 리모컨 잠금은 `AR-EH05` 를 보존하지 않는다(양 앱 동일한 현행 동작) | 양 앱 **3** | 동일 — "겸사겸사" 고치지 말 것 |
| F-2-6 | 견적 홈 I형 호스는 화면칩만 본다 | 전역 ON/OFF 무관, 칩 ON→ I1W=2 / 칩 OFF→ L1W=2 | 동일 (결함 1 fix 가 홈으로 번지면 안 된다) |
| F-2-7 | 주문 홈 I형 호스는 전역만 본다 | 전역 ON 이면 칩 상태 무관 I1W=2 | 동일 (드리프트 3 유지) |
| F-2-8 | 주문 **상업** 파생 수동 보존은 이미 동작한다 | F-2-2·F-2-3·F-2-4 | 결함 2 fix 가 상업 쪽을 훼손하면 안 된다 |

### F-3 뮤테이션 게이트 (판별력 유지)
견적 테스트 19종 · 주문 테스트 해당분이 **전부 계속 RED** 여야 한다.
`multiplier` / `target-model` / `source-omit` / `add-to-replace` / `inactive-keep` / `option-invert` / `manual-lock-ignore` / `drift-fixture-delete` / `derive-*` 12종.
특히 `manual-lock-ignore` 와 `inactive-keep` 은 결함 2 fix 가 직접 건드리는 표면이라 **fix 후에도 RED 인지**가 핵심 판별이다.

### F-4 CI 표면 (게이트되는 곳 / 안 되는 곳)
- ✅ 견적 golden(jest) — `deploy-estimate-app.yml` `pull_request`, paths 에 `clients/web/estimate-app/**` + `clients/web/legacy-quantity-golden/**` 포함, `npm test` 실행
- ✅ 주문 golden(vitest) — `ci.yml` `frontend-order-app` job, `pull_request` + `paths-ignore` 방식이라 두 경로 모두 트리거, `npm run test` 실행
- ⚠️ `deploy-order-app.yml` 에는 **`pull_request` 트리거가 아예 없다**(push:main + workflow_dispatch 전용). 배포 전용이므로 PR 게이트는 위 `ci.yml` 이 담당한다 — **주문 golden 게이트를 `deploy-order-app.yml` 로 착각하지 말 것.**
- 🚫 **어느 CI 도 브라우저에서 이 두 화면을 실제로 띄우지 않는다.** 두 결함 다 사용자가 화면에서 만드는 상태이므로 **라이브 QA 가 유일한 실 경로 증거**다([[feedback_ungated_surface_and_mock_covering_defect]]).

---

## 9. golden 재생성 계획

### 9.1 🚨 순서 강제 (위반 시 그 라운드 무효)

```
① 결함을 재현하는 실패 테스트를 먼저 쓴다 (RED)
② RED 원문을 PR 에 제출한다
③ 정본을 고친다
④ ①의 테스트가 GREEN 이 된 원문을 제출한다
⑤ 그때서야 golden 을 실행 결과로 재생성한다
⑥ 뮤테이션으로 새 golden 의 판별력을 확인한다
```

**금지**: golden 을 먼저 고쳐 놓고 코드를 거기에 맞추는 순서. golden 은 정본 실행의 **결과**이지 목표가 아니다.
**금지**: golden 값을 손으로 타이핑하는 것. `goldens.js` 헤더가 *"값을 손으로 채우지 않았다"* 를 이미 계약으로 선언하고 있다 — 재생성도 fixture 순회 실행 출력이어야 한다.

### 9.2 바뀌어야 하는 golden (예상 — D-1 확정 후 확정)

| 앱 | golden | 현재 | 기대 방향 |
|---|---|---|---|
| 견적 | `estimateOptionGoldens['C-02-I-HOSE']` | `FH-LFHIF` **없음**(0), `FH-LFHIF4W:1` | `FH-LFHIF: 2` 가 나타난다 |
| 주문 | `orderOptionGoldens['H-03-PANEL-LOCK']['PC1MWSK3NW']` | `1` | `9` (견적과 동일) |

D-1 이 "전역 우선" 으로 확정되면 **신규 fixture 1건**(전역 ON + 화면칩 OFF)이 필요하다 — 그 조합은 현재 어떤 fixture 도 실행하지 않으며, 실측상 **가장 흔한 실 사용자 경로**다.
D-1 이 "화면칩 우선" 으로 확정되면 `C-02-I-HOSE` 의 **4WAY 값도 바뀐다**(`FH-LFHIF4W` → `FH-LFHLF4W`). 그 경우 §8 F-1 의 무훼손 목록에서 해당 항목을 제외하고 근거를 PR 에 남긴다.

### 9.3 바뀌면 안 되는 golden
§8 F-1 전부. 재생성 diff 가 위 2건(+D-1 에 따른 추가분) 외의 줄을 건드리면 **그 자체가 결함**이며, 원인을 밝히기 전에는 커밋하지 않는다.

### 9.4 드리프트 어서션 갱신
두 테스트 파일의 `'정찰 §5 드리프트 8종이 양 앱 golden에 각각 남아 있다'` / `'두 앱 드리프트의 주문 fixture를 보존한다'` 는 **8종 중 1종이 해소되므로 반드시 RED 가 된다.** 이것은 정상이며, 해소된 항목을 목록에서 빼고 **"6종 유지 + 2종 수렴" 을 명시적으로 어서션**하도록 갱신한다(그냥 지우면 수렴 자체가 검증되지 않는다).

---

## 10. 수용 기준

| # | 기준 | 확인 방법 |
|---|---|---|
| A-1 | 견적 상업멀티에서 전역 ON × 칩 ON/OFF **두 조합 모두** 1WAY 호스 합 = `nTarget` | golden 테스트 + 신규 fixture |
| A-2 | 견적 상업멀티 4WAY 호스 합 = `nNormal` (네 조합) | golden 테스트 |
| A-3 | 견적 홈 I형 호스 동작 불변 (F-2-6) | golden 테스트 |
| A-4 | 주문 홈 파생 **5계열 전부** 수동값 보존 | golden 테스트 + 계열별 fixture |
| A-5 | 주문 홈에서 손대지 않은 파생은 계속 자동 계산 (I-6) | golden 테스트 |
| A-6 | §8 F-1 무훼손 목록 값 전부 불변 | golden 전수 diff |
| A-7 | §8 F-2 실 경로 8종 값 불변 | 경계 하네스 실행 |
| A-8 | §8 F-3 뮤테이션 전부 RED 유지 | `LEGACY_MUTATION=<name>` 반복 실행 |
| A-9 | 견적 jest · 주문 vitest 모두 GREEN | CI (exact SHA) |
| A-10 | **라이브 QA** — 실 브라우저에서 §11 시나리오 재현, 단계별 스크린샷 | 실 서버 실행 |
| A-11 | 문서 동기화 §7 목록 완료 | diff |

---

## 11. U-gate

### 한 문장
> **이 슬라이스가 끝나면, 유연호스 I형이 켜진 실 거래처(로컬 DB 실측 30곳)의 담당자가 상업멀티 견적을 만들 때 1WAY 유연호스가 수량 그대로 견적서에 계상되고, 주문서에서 홈멀티 판넬 수량을 손으로 고친 뒤 다른 옵션을 바꿔도 그 값이 사라지지 않는다.**

### 구체 시나리오 (머지 전 PM 이 실제로 1회 실행)

**누가** — 견적/주문을 작성하는 담당자
**어떤 화면에서** — 실 서버로 띄운 견적 앱 · 주문 앱 (mock OFF)

1. `show_i_hose = true` 인 실 거래처 코드 하나를 **읽기 전용**으로 확인한다 (예: `1012555999`, `1168803300`).
   > 🚨 라이브 QA 는 공유 실데이터에 write 하지 않는다([[feedback_qa_live_shared_data_readonly]]). DC 설정은 조회만 한다.
2. 그 거래처로 **견적 앱**을 열고 상업멀티에서 1WAY 실내기 **2대**, 4WAY 실내기 **1대** 를 입력한다.
3. 상업 옵션바의 **유연호스 I형** 칩을 **켠다**.
4. **본다** — `유연호스 I형 1WAY` 행 수량이 **2**, `유연호스 I형 4WAY` 행 수량이 **1**(수량이 소스대로 실린다). → 스크린샷
   > 🚨 R1 정정 — 원래 문구("상업멀티 합계 금액에 그 2개가 반영돼 있다")는 실측 실패한다. 실 DB 에서 `FH-LFHIF`(유연호스 I형 1WAY) 단가가 **0원**이기 때문이다(선재 결함·무결성 도메인 데이터, 본 PR 범위 밖 — 개발책임자 보고 완료). 이 U-gate 항목은 **"수량이 소스대로 실린다"까지만 확인**한다. 금액 반영은 `FH-LFHIF` 마스터 단가 정정(별건)에 종속된다.
5. 3의 칩을 **끈다**(전역 ON + 칩 OFF = 가장 흔한 경로).
6. **본다** — 1WAY 유연호스 수량이 **0이 아니다**(D-1 확정 형태로 2). → 스크린샷
7. **주문 앱**을 열고 홈멀티에서 1WAY 실내기를 입력해 판넬이 자동 계산되게 한다.
8. 자동 계산된 판넬 수량을 **9** 로 직접 고친다. → 스크린샷
9. 홈 옵션바의 **발통포함** 을 체크한다(옵션 변경 → 재계산).
10. **본다** — 판넬 수량이 여전히 **9**. 홈멀티 합계 금액도 9 기준이다. → 스크린샷
11. 홈 유연호스·리모컨 행에도 8~10 을 반복한다(계열 전부 보존 확인). → 스크린샷

**실패 판정**: 4·6·10·11 중 하나라도 기대와 다르면 머지 불가.

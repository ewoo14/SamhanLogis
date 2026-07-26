# 2026-07-26 — 하네스 거짓 green 5종 일괄 교정 (H-1 ~ H-5)

| 항목 | 값 |
|---|---|
| 브랜치 | `chore/harness-false-green-batch` |
| Base | `main` (`845866d7c`) |
| 성격 | 하네스(테스트 장치) 교정 — 제품 코드 변경 없음 |
| 배경 | 2026-07-25~26 측정된 **하네스 거짓 green 5종**을 한 슬라이스로 처리 (개발책임자 결정) |

---

## 1. 무엇이 거짓 green 이었나

| # | 항목 | 규모 | 증상 |
|---|---|---|---|
| H-1 | 해시라우터인데 경로 방식 `goto` | 20 파일 / 63 곳 | 렌더러는 `createHashRouter`(`routes/index.tsx:1726-1727`). Vite SPA fallback 이 어떤 경로에도 `index.html` 을 200 으로 주므로 해시가 비면 **홈으로 낙착** — 스펙이 의도한 화면에 도착조차 못한 채 통과 |
| H-2 | `docs/qa/**` 커밋 증거에 직접 캡처 | mock 게이트 36 파일 중 29 곳 수정 | 스펙을 재실행할 때마다 PR 리뷰가 참조하는 확정 증거 PNG 가 덮어써짐 → 리뷰어가 라이브QA 실행 자체를 포기 |
| H-3 | 모바일 3앱 jest 가 CI 미실행 | 잡 1개 신설 + 2개 보강 | `clients/mobile` 은 CI 잡 자체가 없었고, `mobile-staff`·arologis `mobile` 은 typecheck·expo-doctor·prebuild 만 실행 |
| H-4 | `setTimeout(fn, 0)` 타이밍 재현 | 12 곳 / 7 파일 | WHATWG 중첩 타이머 4ms 클램프 때문에 실행 컨텍스트에 따라 React 스케줄러 큐와 순서가 뒤집힘 (#933 실측) |
| H-5 | soft-pass 분기 | 아래 §4 | 대상을 못 찾으면 `console.warn` 후 통과 — 게이트가 아님 |

### H-1 실측 (일회용 프로브, 동일 서버·동일 시점)

```
[고치기 전] goto(`${BASE_URL}/sales/new`)   → {"url":".../sales/new?mockRole=SALES","hash":"","title":"대시보드"}
[고친 후]   goto(`${BASE_URL}/#/sales/new`) → {"url":".../#/sales/new?mockRole=SALES","hash":"#/sales/new?mockRole=SALES","title":"새 판매전표"}
```

`title` 이 **"대시보드"** 라는 것이 핵심이다 — 스펙은 전표 작성 화면을 검증한다고 믿었지만 홈에 있었다.

---

## 2. 어떻게 고쳤나

- **H-1** — `${BASE_URL}/<경로>` → `${BASE_URL}/#/<경로>` (#932 의 `920-codef-scope-lock-real-qa` 참조 구현과 동일 수단).
  `${PROM}/alerts`(Prometheus UI 대상)는 앱이 아니므로 제외.
- **H-2** — 캡처 목적지 상수를 `resolveQaShotsDir()`(#926, `playwright/support/qa-screenshot-dir.ts`) 로 감쌌다.
  기본 출력지는 `<dir>/_local/`(gitignore), 승격은 `QA_SHOTS_DIR` opt-in.
  `clients/desktop/playwright/**/screenshots/` 안의 커밋 증거(sp-d4 7장)도 같은 문제여서 `.gitignore` 에 `clients/desktop/playwright/**/_local/` 추가.
- **H-3** — `ci.yml` 에 `frontend-mobile` 잡 신설(삼한 모바일), `frontend-mobile-staff` 에 jest 스텝 추가,
  `arologis-ci.yml` 의 `mobile` 잡에 jest 스텝 추가. **세 스텝 모두 `continue-on-error` 없음**(하드 게이트).
- **H-4** — `src/renderer/test-utils/flush.ts` 의 `flushZeroDelayTasks()` 신설.
  0ms 타이머 큐와 MessageChannel 매크로태스크를 **양쪽 다** 통과시킨 뒤 마이크로태스크를 드레인한다.
  우리 타이머·우리 port 메시지는 항상 기존 예약분보다 뒤에 등록되므로, 어느 큐가 먼저 돌든
  "호출 시점에 예약돼 있던 0ms 작업이 전부 끝난" 상태가 보장된다 — 기존 `setTimeout(resolve, 0)` 보다
  **결코 약해지지 않으면서** 실행 순서 의존만 제거한다.
- **H-5** — §4 참조.

### 회귀 가드 (이 배치의 핵심)

`clients/desktop/src/renderer/test-utils/harness-false-green-guard.test.ts` — 5 테스트.
네 결함은 전부 "고쳐 놓으면 다시 스며드는" 작성 관습 문제라 **되돌리면 RED 가 되는 가드**를 둔다.

| 뮤테이션 | 가드 결과 |
|---|---|
| H-1 `#` 제거 | RED |
| H-2 `resolveQaShotsDir()` 제거 | RED |
| H-4 `flushZeroDelayTasks()` → `setTimeout(resolve, 0)` | RED |
| H-5 mock 게이트에 `console.warn` 추가 | RED |
| (원복 후) | GREEN |

가드 자체가 조용히 통과하지 않도록 "스캔 대상 파일이 실제로 수집된다" 테스트를 함께 둔다.

---

## 3. 검증 결과

| 게이트 | Before | After |
|---|---|---|
| desktop mock Playwright (`--list`) | 115 파일 / **635** 테스트 | 115 파일 / **635** 테스트 |
| desktop mock Playwright (실행) | — | **634 passed / 0 failed** (11.7분), 1 fixme (§4-A) |
| desktop vitest | 173 파일 / **1448** 테스트 (1 환경 의존 실패) | 174 파일 / **1453** 테스트 (동일 1건) |
| `git status --porcelain -- docs/qa/` (전체 mock 스위트 실행 후) | (오염 — 1회 실행에 143장) | **빈 출력** (`_local/` 29개 생성, 전부 gitignore) |
| 모바일 jest (로컬) | CI 미실행 | mobile 7 · mobile-staff 8 · arologis-mobile 30 = **45 green** |

> vitest 의 상시 1건 실패는 `src/main/build-output-cjs-interop.test.ts` — `out/main/index.js`(electron-vite build 산출물)를
> 요구한다. CI `frontend-desktop` 잡은 build 스텝이 test 스텝보다 먼저라 CI 에서는 항상 존재한다. 이 배치와 무관하다.

### B4 — 실행 순서 무관성

`--sequence.shuffle` 을 **동일 seed** 로 (fix 적용) / (fix 이전 원본) 두 번 돌려 실패 집합을 비교했다.

| seed | fix 적용 | fix 이전 | fix 로 새로 깨진 것 |
|---|---|---|---|
| 424242 | 2 failed / 1451 passed | 2 failed / 1446 passed | **0** |
| 777777 | 4 failed / 1449 passed | 4 failed / 1444 passed | **0** |

H-4 대상 7 파일은 격리 실행(각각 8·16·39·8·4·19·7 = 101 테스트 전부 green)과 전체 실행 결과가 같다.

---

## 4. 이번 배치에서 **닫지 못한 것** — 범위 판단 필요

하네스를 고치자 "실제로 깨져 있는 스펙"이 드러났다. 기능 구현/스펙 재작성은 이 배치의 범위가 아니므로
**고치지 않고 목록화**한다.

### 4-A. `slip-form-v20/slip-form-v20-matching.spec.ts` — 기능이 UI 에 없다

H-1 교정으로 `/#/sales/new` 에 실제로 도달하자, V20 5필드(배송주소/감리주소/프로젝트명/인수자번호/입금예정일)
+ businessNumber 가 화면에 **0/6 개** 존재함이 드러났다(TC-V4 실행 로그 `V20 필드 visible 수: 0/6`).
TC-V3 는 필드 입력 루프가 전부 no-op → 필수값 없음 → 저장 버튼 `disabled` → 클릭 60s 타임아웃 RED:

```
Error: locator.click: Test timeout of 60000ms exceeded.
  - waiting for locator('[data-testid="slip-save-btn"], button:has-text("저장"), …').first()
    - locator resolved to <button disabled type="button" …>…</button>
    - element is not enabled  (114 회 재시도)
  at playwright/slip-form-v20/slip-form-v20-matching.spec.ts:275:21
```

→ TC-V3 만 `test.fixme` + 사유 주석으로 **명시 격리**했다(조용히 통과하던 이전 상태로 되돌리지 않는다).
TC-V1/V2/V4/V5 는 통과하지만 **내용이 공허하다**(검증 대상이 화면에 없음). 이 스펙 전체를 어떻게 할지 판단이 필요하다.

### 4-B. soft-pass 로 남긴 것 (가드 allowlist 에 고정)

| 파일 | 테스트 | 실측 |
|---|---|---|
| `dps-by-product.spec.ts` | TC-DBP-4 | `컬럼 필터 input 미발견 — DataGrid 필터 구현 확인 필요` |
| | TC-DBP-6 | `"품목별 DPS 분석" NavLink 미발견 — 사이드바 미완성 또는 WAREHOUSE 노출 조건` |
| | TC-DBP-7 | `ForbiddenPage 메시지 미발견이나 toolbar 미노출 → redirect 성공으로 간주` |
| `sidebar-disabled.spec.ts` | TC-SD3 | `ACCOUNTANT 에게 영업/창고 제한 미적용 — 영업 disabled: 0, 창고 disabled: 0` |
| | TC-SD4 | `회계 메뉴 숨김 처리 — tooltip 검증 대상 없음` (`권한이 없습니다` tooltip 미구현) |
| | TC-SD5 | `nav-sales 요소 없음` → early return 으로 검증 전체 skip |
| `slip-form-v20-matching.spec.ts` | TC-V1/V2/V4/V5 | 4-A |

같은 파일에서 **실제로 하드 경로를 타고 있던 부분은 hard assert 로 승격**했다(§5).

### 4-C. `purchase-query-page.spec.ts` TC-P3

검색 입력을 못 찾으면 URL 파라미터 fallback 으로 넘어가고 최종 단정이 `body.length > 50` 뿐이다.
셀렉터 교정만으로는 닫히지 않고 검색 플로우 자체를 다시 써야 해서 기계적 범위를 벗어난다.

### 4-D. vitest 의 **기존** 실행 순서 의존 (이 배치와 무관, 사전 존재)

`--sequence.shuffle` 에서 fix 이전 코드로도 동일하게 실패한다 — 원인은 `setTimeout(fn,0)` 이 아니다.

- `src/renderer/routes/EstimateListPage.test.tsx` (seed 424242, 777777 양쪽)
- `src/renderer/biometric/biometricAuth.test.ts` (seed 777777)
- `src/renderer/api/mock.test.ts` (seed 777777)

### 4-E. `-real-qa` 스펙의 `docs/qa` 직접 캡처

H-2 는 **mock 게이트 36 파일**을 대상으로 했다. 교정 후 실측:

- mock 게이트에서 `docs/qa` 로 직접 캡처하는 파일 — **0 건**
- `*-real-qa`/수동 스펙에서 직접 캡처하는 파일 — **135 건** (여전히 남음)

라이브QA 재실행 시 확정 증거 덮어쓰기 위험이 남아 있다(#926 이 902/928 계열만 처리).
리뷰어가 라이브QA 실행을 포기하게 만든 원인이 바로 이쪽이므로, 후속 배치 1순위로 제안한다.

### 4-F. `clients/web/design-system` 의 `setTimeout(resolve, 0)` 1건

`MultiSelectAutocomplete.test.tsx:120` — 이것은 **의도적으로 두었다**. 컴포넌트가 `debounceMs=0` 으로
`window.setTimeout(fn, 0)` 을 예약하고, 테스트가 그 뒤에 같은 큐로 0ms 타이머를 걸어 "컴포넌트 타이머가 먼저
실행됨"을 보장한다. MessageChannel 로 바꾸면 컴포넌트 타이머보다 **먼저** 깨어나 `expect(search).not.toHaveBeenCalled()`
가 공허해진다 — 즉 H-4 교정을 적용하면 오히려 약해진다.

---

## 5. 실제로 강화된 단정 (soft → hard)

| 파일 | 변경 |
|---|---|
| `sales-purchase-query/sales-query-page.spec.ts` | TC-S1 셀렉터가 `[data-testid="sales-query-from"]`/`input[name="from"]`/`placeholder*="시작"` 셋 다 DOM 에 없어 **항상 else 분기**였다. 실제 마크업은 `aria-label="시작 날짜"`. → 셀렉터 교정 + ±15일 기본 범위를 hard 단정. **이 계약은 그동안 한 번도 검증된 적이 없었다.** |
| `dps-by-product.spec.ts` | TC-DBP-1 toolbar 4종 hard visible / TC-DBP-2 컬럼 8/8 전수 + grid wrapper hard + 행 수 `>= 0`(항상 참) → `>= 1` |
| `sp-d4-…spec.ts` | 사이드바 7 역할 확정 증거 캡처 존재를 hard 단정(기존: 없으면 warn, 디렉터리 존재만 확인 → 7장 중 0장이어도 통과) |
| `mig-14-helpers.ts` | 캡처 `writeFileSync` 실패를 `console.warn` 으로 삼키던 것 제거 — 한 장도 안 남아도 통과했다 |
| `menu-relocate.spec.ts` / `admin-hr-guard.spec.ts` | hard assert 뒤에 남아 soft-pass 처럼 보이던 진단용 `console.warn` 제거 |

---

## 6. 부수 관측 — mock 게이트는 "앱이 뜨지 않아도" 통과한다

작업 초기 워크트리에 `design-system` 이 빌드돼 있지 않아 Vite dev server 가 **모든 모듈에 500**
(`Failed to resolve entry for package "@samhan/design-system"`)을 반환했다. 그 상태에서
`playwright/slip-form-v20` 은 **5 passed** 로 통과했다.

mock 게이트에는 "앱이 실제로 마운트됐는가"를 확인하는 공통 단정이 없다. 이번 배치의 범위를 벗어나므로
고치지 않았지만, 남은 거짓 green 중 가장 넓은 표면이다.

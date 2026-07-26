# #851 슬라이스 1 — CI 게이트가 실제로 검사하게 한다 (2026-07-26)

- 이슈: #851 (qa-e2e Desktop Playwright 가 BE 계약 변경 미trigger)
- 브랜치: `chore/851-ci-gate-coverage`
- 기획: `docs/superpowers/plans/2026-07-26-851-ci-gate-coverage.md`

---

## 1. 진단 (실측 확증)

### ① BE 계약 변경이 FE 게이트를 발동시키지 않았다

`qa-e2e.yml` 의 `on.pull_request.paths` 는 `qa/**`·`clients/**`·`services/arologis-service/**`·자기 자신뿐이었다. 실측:

- 이슈 #823 의 fix PR #849 중 **BE-only 커밋 `728b98bc7`** (accounting-service 8파일 + slip-service 4파일 + shared 1파일, FE 0파일)은 check-run **34개**를 통과했으나 그 목록에 qa-e2e 4잡(`Desktop Playwright (mock 회귀 hard gate)`·`Playwright`·Detox 2)이 **전원 부재**했다.
- 그 뒤 R2(CODEX SOL) 적대검증이 **실 UI 배분 전면차단(BLOCKING)** 을 사람 손으로 발견했다 — CI 가 잡을 기회 자체가 없었다.

### ② 발동해도 아무것도 검증하지 않는 게이트

`clients/desktop/playwright/datagrid/datagrid-interaction.spec.ts` 는 mock 회귀 hard gate 에 포함돼 매 PR 실행됐지만, 로컬 재현 결과 **7 passed 이면서 7개 TC 전부 "DataGrid 셀 미발견"** 을 콘솔에 찍고 있었다:

```
TC-DG-1: DataGrid 셀 미발견 — Tab 2 데이터 없거나 FE 미구현
TC-DG-2: DataGrid 셀 미발견
TC-DG-3: DataGrid 셀 2개 미만
TC-DG-4: DataGrid 셀 미발견
TC-DG-5: DataGrid 셀 미발견
TC-DG-6: "거래처명" 컬럼 헤더 미발견
TC-DG-7: SalesQueryPage 데이터 그리드 셀 미발견 (navigated=true)
  7 passed (20.4s)
```

원인 2겹:

1. **해시라우터에 경로만 goto** — 렌더러는 `VITE_PLATFORM='web'` 이 아니면 `createHashRouter`(`routes/index.tsx`) 라, `/accounting/tax-invoices/batch?...` 로 goto 하면 Vite SPA fallback 이 index.html 을 서빙하고 해시가 비어 **대시보드로 낙착**한다(뮤테이션 실행의 page snapshot 으로 확증).
2. **soft-pass 분기** — 셀 미발견 시 `console.warn` + "body 길이 > 50" 류 대체 검증으로 통과. 커밋된 캡처 파일명(`TC-DG-1-no-grid-cells.png` 등)이 그 상태의 증거였다.

또한 스펙이 겨냥한 화면 자체가 이동해 있었다: 4탭 일괄발행 워크플로는 PR #161 에서 `/accounting/hometax-export`(HometaxExportPage)로 흡수됐고, Excel-like DataGrid 는 결과 탭·판매관리의 **"Excel 보기" 토글** 뒤에 있다.

---

## 2. 변경

| 파일 | 내용 |
|---|---|
| `.github/workflows/qa-e2e.yml` | `on.pull_request.paths` 에 `services/accounting-service/**`·`services/slip-service/**` 추가 (G1) |
| `clients/desktop/playwright/datagrid/datagrid-interaction.spec.ts` | 전면 재작성 (G2) — 아래 상세 |
| `ROADMAP.md` / 본 dev-report | 문서 동기화 |

### 스펙 재작성 요지

- **해시 네비게이션**: `/#/accounting/hometax-export?mockRole=ACCOUNTANT` · `/#/sales?mockRole=MASTER` (#932 가 머지한 컨벤션).
- **현행 화면 정합**: Tab 1 미리보기 실행(mock 250행) → 결과 탭 자동 전환 strict 확인 → "Excel 보기" 토글로 DataGrid(enableMultiSelect+enableCopy) 마운트.
- **hard expect 정확 수치** (soft-pass 분기 전량 제거):
  - TC-DG-1 단일 클릭 = 정확히 **1셀** + 클릭한 셀 자신
  - TC-DG-2 Shift 사각형 (0,1)-(9,3) = 정확히 **30셀** + 꼭짓점 4개
  - TC-DG-3 Ctrl 토글 = **1 → 2 → 1셀** 정확 수치
  - TC-DG-4 Ctrl+A = 100×17 = **1,700셀**
  - TC-DG-5 Ctrl+C = TSV **3행×3필드** + 1행 셀 값 완전 일치(`2026/05/01-1\t2026-05-01\t(주)삼한로지스`)
  - TC-DG-6 열헤더 필터(recipientName) = 100행 → 정확히 **20행** + 타 거래처 0행
  - TC-DG-7 SalesQueryPage Excel 보기 = 셀 존재(미발견=RED) + 단일 선택 1셀
- **셀 로드 자체가 hard gate**: `openHometaxResultGrid` 가 셀 1,700개를 단언 — 네비게이션/데이터 로드 실패는 어느 TC 든 즉시 RED.
- **스크린샷 오염 방지**: `resolveQaShotsDir` 로 `docs/qa/supplier-profile-and-grid-ux/_local/`(gitignore)에 기록 — 커밋된 확정 증거 PNG 를 더 이상 덮어쓰지 않는다.
- `pageerror` 훅(PR #156 가드) 유지. skip 경로 0 (silent-skip 가드 `skipped=0` 강제와 정합).

### TSV `\r?\n` 주석

`useClipboard` 는 `\n` 으로 쓰지만 **Windows OS 클립보드 왕복이 `\r\n` 으로 정규화**한다(로컬 실측 — `"...삼한로지스\r"`). 플랫폼 무관 정확 검증을 위해 행 분리만 `/\r?\n/` 로 한다(필드 수·값은 그대로 완전 일치 단언).

---

## 3. 검증 (G1~G5)

### G1 — BE 계약 변경이 FE 게이트를 발동시킨다

- PyYAML 파싱 결과 `paths` 에 두 서비스 경로 포함 확인 (아래 §5).
- 결핍 근거: BE-only 커밋 `728b98bc7` 의 check-run 34개에 qa-e2e 4잡 전원 부재 (§1①). 같은 파일 집합이 새 paths 필터에선 `services/accounting-service/**`·`services/slip-service/**` 에 매치된다.

### G2/G3 — 발동한 게이트가 실제로 검증하며, 그것이 증명된다

- 재작성 스펙 **7/7 passed (10.2s)** — 위 정확 수치 단언 전부 실통과.
- **뮤테이션 증명**: fix 를 구 결함(해시 제거, 경로만 goto)으로 되돌리자 **7/7 failed** — `waiting for getByTestId('hometax-export-tab-preview')` 60s timeout, page snapshot 은 대시보드(`heading "Samhan Public"`·`#/` 링크). 구 스펙은 동일 상황에서 7 passed 였다. 복구 후 재실행 **27/27 passed**(datagrid 디렉토리 전체 — 이웃 `narrow-action-column` 20 TC 포함 무회귀).

### G4 — 비용 실측 (판단은 개발책임자 몫)

- qa-e2e 잡별 wall-clock (최근 성공 run 2건 평균): **Desktop Playwright ≈ 11분** (10m52s·11m02s) · Playwright ≈ 2.6분 · Detox 2잡 ≈ 각 1분(macos).
- BE-only push 1회당: **러너 분 +≈15.5분** (ubuntu ≈13.5 + macos ≈2) · **wall-clock 6.2분 → 11분** (BE-only 커밋 `728b98bc7` 의 기존 CI 전체 6m12s 실측 대비, qa-e2e 는 병렬이므로 최장 잡이 지배).
- 빈도: 2026-07-01 이후 origin/main 의 accounting/slip BE-only 커밋 **21건**(PR 수명주기 중 BE-only push 는 그 수 배). public repo 라 GitHub-hosted 러너 **과금 0** — 비용은 wall-clock/동시성 큐잉.

### G5 — 기존 게이트 무약화

- qa-e2e.yml 은 **paths 추가만**(잡·스텝 무변경) — 기존 trigger 집합의 상위집합.
- 스펙은 soft-pass → hard expect 로 **엄격성 단조 증가**. 게이트 스위트 test 수 7 유지(=`assert-playwright-ran.mjs` 게이트 수 감소 없음, skip 0 유지).
- datagrid 디렉토리 전체 27/27 green.

---

## 4. 범위 밖 (측정만, 미수정 — 기획 2부)

해시라우터 경로 `goto` 17파일(#932 목록) · `docs/qa/**` 직접 기록 스펙 36개(#926) · `clients/mobile` CI 잡 신설 · `setTimeout(0)` 12곳(#933). 이번 실측 중 재확인: `sales-purchase-query/sales-query-page.spec.ts` 등에 동종 soft-pass 분기("구현 전이거나 다른 셀렉터 — 페이지 로드 자체는 검증")가 남아 있다 — 같은 배치 후보.

## 5. YAML 파싱 검증

```
paths = ["qa/**", "clients/**", "services/arologis-service/**",
         "services/accounting-service/**", "services/slip-service/**",
         ".github/workflows/qa-e2e.yml"]
jobs = ['playwright', 'desktop-playwright', 'detox-android', 'detox-android-arologis']
PARSE-OK   (스텝 name None 0건 — #910 따옴표 사고 가드 포함)
```

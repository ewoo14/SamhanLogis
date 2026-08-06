```text
git -C . rev-parse --show-toplevel     # D:/dev/Samhan-Public/.claude/worktrees/w1062-lineux
git -C . branch --show-current         # fix/1062-line-input-ux
git -C . rev-parse HEAD                # 3cb989552b2741a932394c2e083c0de38bd8b90e 이어야 함
```

실행 결과:

```text
show_toplevel=D:/dev/Samhan-Public/.claude/worktrees/w1062-lineux
branch=fix/1062-line-input-ux
HEAD=3cb989552b2741a932394c2e083c0de38bd8b90e
HEAD_expected=3cb989552b2741a932394c2e083c0de38bd8b90e
HEAD_match=true
```

실행 환경:

```text
container_name=/samhan-slip-service
created=2026-08-05T02:50:44.702471161Z
started=2026-08-05T02:51:02.147121178Z

container_name=/samhan-api-gateway
created=2026-08-05T02:50:37.64267995Z
started=2026-08-05T02:50:51.017973805Z
```

# #1062 R30 적대 재수렴 검증 보고서

## 최종 판정

**결함 0건 — 머지 권고.**

질문에 대한 답은 **없다**이다. R29가 바꾼 표면에서 실 사용자가 화면으로 도달할 수 있으면서 잘못 동작하는 경로를 찾지 못했다. A·B·C가 같은 R29 산출물에서 동시에 성립했고, D·E 및 결함 2~4의 반대급부도 유지됐다. 따라서 다섯 번째 왕복은 재현되지 않았다.

`docs/dev-reports/2026-08-05-1062-r30-fix-directive.md`는 만들지 않았다.

## 증거 무결성

R29 소스와 실제 GUI 산출물의 연결을 다음 원문으로 확인했다.

```text
r29_build_head=3cb989552b2741a932394c2e083c0de38bd8b90e
r29_source_sha256=9D2538D8A87A2161B2F0304C64E80FE5D9B5834EB8D019CECD2F92E968B6CFE5
build_command=npm run build
build_result=✓ 163 modules transformed / ✓ built in 7.00s
r29_dist_path=D:\dev\Samhan-Public\.claude\worktrees\w1062-lineux\clients\web\design-system\dist\index.js
r29_dist_mtime=2026-08-05T17:34:21.2984930+09:00
r29_dist_sha256=77567F72D40230C2A885461CEDC8CA50DF6594DCF02991DB11FC04C977B2CDF1
desktop_server_command=npx vite --config vite.renderer.dev.config.ts --host 127.0.0.1 --port 5193 --strictPort
desktop_server_url=http://127.0.0.1:5193/
desktop_footer_version=2026/08/05-1062
chromium=C:\Users\ewoo2\AppData\Local\ms-playwright\chromium-1217\chrome-win64\chrome.exe
```

즉, R26 시점의 stale design-system 산출물을 사용하지 않았다. R29 HEAD에서 design-system을 다시 빌드한 뒤 그 `dist`를 참조하는 desktop junction과 지정된 renderer Vite 설정으로 실제 Chromium GUI를 구동했다. 컨테이너는 재배포하지 않았고 DB 쓰기도 하지 않았다.

## R28 4건 전후 대조

| R28 결함 | R28에서 잘못된 동작 | R29 변화 | R30 사용자 표면 결과 |
|---|---|---|---|
| 1. 확정값 즉시 삭제 | 확정 직후 Backspace/Delete 후 blur하면 원래 선택이 복원됨 | 선택값이 있고 DOM 입력이 빈 상태에서 Backspace/Delete 의도를 `lastTypedDraftRef=''`로 기록 (`AsyncAutocomplete.tsx:496-502`) | callback 4/4와 non-callback 대표 2/2에서 Backspace·Delete 모두 선택 해제. 포커스만 한 A는 유지되고 C의 첫 글자도 보존됨 |
| 2. 후보 1건 | 후보가 정확히 1건이어도 사용자가 다시 골라야 함 | `autoSelectSingleResult` 경로와 Product 기본값 `true` 추가 (`AsyncAutocomplete.tsx:349-358`, `ProductAutocomplete.tsx:157,191`) | 정확 일치가 아닌 1건도 즉시 확정. 2건 이상은 기존 모달. 연속 입력 중 이전 응답이 현재 입력을 확정하지 않음 |
| 3. 읽기 전용 견적 빈행 | 승인/종결 견적에도 편집용 trailing 빈행이 보임 | 읽기 전용 상태는 hydrated 행 그대로, `QUOTE_DRAFT`/`QUOTE_SENT`만 trailing 빈행 보장 (`EstimateFormPage.tsx:799-803`) | 읽기 전용 견적은 서버 행 2개만 표시. 편집 가능/협업 견적은 다음 입력행 유지 |
| 4. 복원 후 구 Y.Doc | marker 없는 stale-ahead Y.Doc이 복원된 서버 행을 다시 덮음 | 복원 성공 시 견적 ID·버전 fence 기록, 편집 provider 초기화 때 1회 consume (`EstimateVersionHistoryPanel.tsx:122`, `EstimateFormPage.tsx:889,898`) | marker 없는 stale 문서도 복원 직후 server seed로 수렴. 정상 진입의 ahead 문서는 보존. 같은 견적을 두 번 복원해도 각 복원마다 1회 소비 |

## A~E 다섯 동선 동시 판정

GUI 표본은 `onInputCommitChange`를 받는 네 인스턴스 모두와, 받지 않는 그룹의 Partner/Product 대표 두 인스턴스였다.

- callback 4개: 전표 매출 품목, 전표 매입 품목, 일마감 거래처, 차단거래처
- non-callback GUI 대표: 전표 거래처, 안전재고 품목
- non-callback 나머지 13개: 동일 공용 컴포넌트 배선과 callback 부재를 정적 대조

| 동선 | callback 4개 | non-callback 15개 | 판정 |
|---|---|---|---|
| A. 포커스만 하고 나감 → 선택 유지 | GUI 4/4 유지 | Partner/Product GUI 2/2 유지, 15/15 동일 공용 경로 | PASS |
| B. 확정값을 즉시 Backspace/Delete 후 나감 → 선택 해제 | GUI 4/4에서 두 키 각각 해제 | GUI 2/2에서 두 키 각각 해제, 15/15 동일 공용 경로 | PASS |
| C. 확정값 위에 다른 검색어 입력 → 첫 글자 포함 교체 | GUI 4/4에서 첫 글자와 완성 문자열 일치 | GUI 2/2 일치, 15/15 동일 공용 경로 | PASS |
| D. 모달 취소 → draft 복원 | callback Product에서 `AJ`, 취소 후 `AJ` | non-callback Product에서 `AJ`, 취소 후 `AJ`; wrapper 공통 ref 경로 | PASS |
| E. 후보 1건 즉시 확정 / 2건 이상 모달 | 1건 즉시 확정, 다건 모달 | 1건 즉시 확정, 다건 모달 | PASS |

GUI 원시 결과의 핵심 값:

```text
A=true
B_Backspace=true
B_Delete=true
C_first=true
C_full=true
D_draft_after_cancel=AJ
D_pass=true
E_single_query=AJ040
E_single_exact_match=false
E_single_selected=AJ040RXH4BC1
E_single_listbox_visible=false
E_multi_query=AJ
E_multi_modal_visible=true
continuous_typing_delay_per_key_ms=80
continuous_typing_final=AJ040RXH4BC1
continuous_typing_pass=true
```

정확 일치가 아닌 후보 1건도 즉시 확정되는 동작은 R28 불변식인 “후보가 정확히 1건이면 즉시 확정”과 일치한다. 사용자가 계속 입력하면 각 입력에서 요청 sequence가 먼저 무효화되므로 이전 1건 응답이 새 입력을 확정하지 않는다. 실제 GUI에서도 `AJ040`을 80ms 간격으로 연속 입력했을 때 첫 글자와 최종 선택이 보존됐다. 사용자가 검색 debounce를 넘겨 멈춘 시점에 후보가 1건이면 확정되는 것은 해당 불변식의 의도된 동작이다.

### 19개 인스턴스 대조

`SlipDetailPage`의 2개는 `origin/main`과 0 diff인 #1071 범위이므로 제외했다. R29 공용 표면의 집계는 **14개 파일, 19개 인스턴스, callback 4개, non-callback 15개**다.

| 구분 | 인스턴스 |
|---|---|
| callback 4 | `BlockedPartnersPage` 1, `DailyClosingPage` 1, `SlipFormPage` Product 2 |
| non-callback 15 | `BankTransactionPage` 1, `CashReceiptFormPage` 2, `CollectionPlanPage` 2, `MergeConvertDialog` 1, `DepositorMappingPage` 1, `EstimateFormPage` 1, `EstimateItemsCatalogPage` 1, `JournalStatusReportPage` 1, `NotesReceivablePage` 2, `SafetyStockAlertsPage` 1, `SlipFormPage` Partner 1, `TaxInvoiceFormPage` 1 |

## 결함 2·3의 반대 방향

### 후보 1건 즉시 확정

- 계속 타이핑: 입력 변경 시 현재 요청 sequence가 즉시 증가한다. GUI 연속 입력에서 이전 결과의 조기 확정과 첫 글자 소실이 없었다.
- 정확 일치가 아닌 1건: `AJ040`의 유일 후보 `AJ040RXH4BC1`이 즉시 확정됐다. R28 지시서의 후보 수 불변식과 일치한다.
- 후보 2건 이상: `AJ` 검색은 선택 모달을 열었다. 취소 후 draft도 `AJ`로 복원됐다.

### 읽기 전용/편집 가능/협업 견적과 네 화면 빈행

| 표면 | GUI 결과 | 판정 |
|---|---|---|
| 읽기 전용 견적 | 서버 행 2개만 렌더, 세 번째 빈행 0, 편집 input 0 | PASS |
| 편집 가능 견적 | 실 품목행 뒤 다음 빈행 유지 | PASS |
| 협업 중 견적 | 새 품목 입력 뒤 다음 빈행 생성, 기존/신규 행 삭제 버튼 모두 disabled | PASS |
| 전표 | 행 삭제 뒤 다음 입력행 존재 | PASS |
| 견적 | 마지막 입력행을 지워도 최소 빈행 1개 존재 | PASS |
| 분개 | 삭제 뒤 최소 2행 유지 | PASS |
| 이동 | 삭제 뒤 다음 입력행 존재 | PASS |

R29는 네 화면의 공용 삭제/추가 유틸이나 전표·분개·이동 호출부를 바꾸지 않았다. R30에서는 각 화면의 “삭제 후 다음 라인 추가 가능” 사용자 경로를 GUI로 다시 밟았고, R28에서 확인했던 첫/중간/마지막 행 계약은 변경되지 않은 호출부와 좁은 회귀 테스트로 대조했다.

## `estimateRestoreFence` 표면

| 질문 | 증거 | 판정 |
|---|---|---|
| marker 없는 기존 Y.Doc이 복원 결과를 덮는가 | fence가 복원 버전 `2`로 기록된 뒤 첫 편집 진입에서 consume되어 `null`; marker 없는 stale provider도 `replaceItems`로 서버 복원행에 수렴 | 덮지 않음 |
| R23 미저장 입력 보존이 유지되는가 | 복원 fence가 없는 markerless-ahead 및 같은-version-ahead provider는 `replaceItems` 미호출 | 유지 |
| fence가 정상 복원을 막는가 | 상세 화면 복원 성공 뒤 편집 진입에서 정상 server seed와 trailing 빈행 확인 | 막지 않음 |
| 여러 번 복원하면 어떻게 되는가 | 1차 복원→편집에서 1회 소비, 2차 복원→편집에서도 새 fence 1회 소비 | 각 복원마다 정상 수렴 |

GUI fence 원문:

```text
fence_after_first_restore=2
first_edit_line_count=3
first_edit_fence_after_consume=null
fence_after_second_restore=2
second_edit_fence_after_consume=null
```

복원은 견적 상세 화면의 `EstimateVersionHistoryPanel`에서 성공한 뒤 fence를 기록하고, 별도 편집 화면의 provider 초기화가 소비한다. 정상 진입과 복원 진입이 같은 화면 생명주기라는 전제에 기대지 않는다.

## 좁힌 실행 기록

```text
design-system scoped tests: 2 files, 39 passed
desktop scoped tests: 3 files, 47 passed
R29 focused Playwright specs: 3 folders, 16 passed
R30 actual Chromium GUI: A-E + readonly/editable/coedit + four-screen deletion + restore twice
```

화면 증거:

- [A/B/C callback 품목](../qa/1062-line-input-r30/screenshots/01-abc-callback-product.png)
- [A/B/C non-callback 거래처](../qa/1062-line-input-r30/screenshots/02-abc-no-callback-partner.png)
- [모달 취소 후 draft 보존](../qa/1062-line-input-r30/screenshots/03-modal-cancel-draft-preserved.png)
- [후보 다건 모달](../qa/1062-line-input-r30/screenshots/04-multi-candidate-modal.png)
- [복원 fence 소비 후 첫 편집](../qa/1062-line-input-r30/screenshots/05-restore-fence-consumed-first-edit.png)
- [읽기 전용 견적 빈행 없음](../qa/1062-line-input-r30/screenshots/06-readonly-estimate-no-blank.png)
- [편집/협업 견적 다음 빈행](../qa/1062-line-input-r30/screenshots/07-editable-coedit-next-blank.png)

## 이 라운드가 보지 않은 것

- 후속 이슈 #1071의 `/sales/:id/edit`, `SlipDetailPage`, `CollaborativeSlipInput`
- 다른 트랙 #1045, #1057, #1061, #1066의 파일과 사용자 경로
- 컨테이너 재배포, DB 쓰기, 실 서버 데이터의 복원/저장
- 전체 Playwright 게이트와 Gradle 전체 스위트
- 실 백엔드에 남아 있는 pre-R26 markerless Y.Doc 자체의 변조 또는 두 실제 브라우저 참가자의 동시 편집. 이 조합은 markerless/stale provider를 구성한 제품 회귀 경로와 실제 GUI fence 생명주기로 분리 대조했다.
- non-callback 15개 각각의 주변 폼 제출/초기화 전체. 15개 모두의 공용 컴포넌트 배선은 대조했고, callback 유무 양쪽의 Partner/Product 실제 GUI 표면을 밟았다.

## 신규 파일

- `docs/dev-reports/2026-08-05-1062-r30-sol-reconvergence.md`
- `docs/qa/1062-line-input-r30/screenshots/01-abc-callback-product.png`
- `docs/qa/1062-line-input-r30/screenshots/02-abc-no-callback-partner.png`
- `docs/qa/1062-line-input-r30/screenshots/03-modal-cancel-draft-preserved.png`
- `docs/qa/1062-line-input-r30/screenshots/04-multi-candidate-modal.png`
- `docs/qa/1062-line-input-r30/screenshots/05-restore-fence-consumed-first-edit.png`
- `docs/qa/1062-line-input-r30/screenshots/06-readonly-estimate-no-blank.png`
- `docs/qa/1062-line-input-r30/screenshots/07-editable-coedit-next-blank.png`


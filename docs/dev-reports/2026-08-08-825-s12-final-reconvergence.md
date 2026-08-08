# PR #1120 / 이슈 #825 S12 — 머지 전 최종 재수렴

## 결론

**도달 결함 1건. 머지 차단.**

`WarehouseAutocomplete`에서 두 번째 후보 `CS-001`을 모달로 확정한 직후 Enter를 한 번 누르면 검색 모달은 다시 열리지 않지만, 확정값이 첫 후보 `HQ-001 · 본사창고`로 무음 교체된다.

요청의 ③ 전제인 “확정값으로 또 열리지 않는가”에는 셋째 경로가 있었다. 재오픈 여부만 보면 닫혀 있지만, 확정 선택 자체가 바뀐다. 코드 수정은 하지 않았고, 이 발견 시점부터 추가 회귀 실행을 중단했다.

## 실행 고정값

- 작업 트리: `C:\dev\Samhan-Public\.claude\worktrees\t825`
- HEAD: `b1e66ea36e33789fe19aabfe4a09ef5a61944178` — 요청 SHA와 일치
- 브랜치: `feat/825-global-input-ux`
- 시작 시 `git status --short`: 공란
- GUI: Playwright Chromium headless, cwd `clients/desktop`
- 앱: 전용 `127.0.0.1:5825`
- mock 격리: `VITE_MOCK_MODE=1`, `VITE_API_BASE_URL=http://127.0.0.1:1`
- 공유 Docker 스택: 조회·재기동·변경하지 않음

## 결함 D-S12-01 — 확정 직후 Enter가 두 번째 창고를 첫 창고로 덮어쓴다

### 실 GUI 재현

1. `/sales/partner-orders` 진입.
2. `판매전표로 병합 전환`을 열어 바깥 `판매전표 병합 전환` dialog 진입.
3. 출고 창고에 `창` 입력 → 안쪽 `출고 창고 검색 결과` dialog 진입.
4. 두 번째 radio `CS-001` 선택 후 `선택 확정`.
5. 안쪽 dialog가 닫힌 직후 외부 창고 input에서 Enter 1회.
6. 바깥 dialog의 `취소` 버튼으로 포커스를 옮겨 확정 표시값 확인.

실측:

```text
Expected: /^CS-001 · /
Received: "HQ-001 · 본사창고"
```

- 단독 재현: `1 failed`, retry 없음.
- 직전 5-case 실행에서도 원 실행과 retry가 모두 같은 `CS-001 → HQ-001` 결과였다.
- 안쪽 검색 모달은 Enter 뒤 다시 열리지 않았다. 즉 “재오픈 결함”이 아니라 “선택 덮어쓰기 결함”이다.

### 도달 원인

`WarehouseAutocomplete.tsx`의 현재 결합은 다음 순서로 도달한다.

1. 모달 확정의 `pick()`은 선택값을 기록하고 `canReopenSelectionRef=false`, `open=false`로 둔다.
2. 공용 `Modal`은 닫힐 때 이전 포커스인 외부 창고 input으로 포커스를 복원한다.
3. `WarehouseAutocomplete.handleFocus()`의 일반 포커스 계약이 draft를 `''`로 초기화하고 legacy dropdown을 연다.
4. 즉시 Enter는 S11 재오픈 분기로 가지 않고 기존 dropdown Enter 분기로 내려가, 빈 검색 결과의 첫 후보를 `pick()`한다.

따라서 S11이 `WarehouseAutocomplete`에만 Enter 재오픈을 넣었다는 전제와 `AsyncAutocomplete`를 건드리지 않았다는 전제는 맞지만, 확정 뒤 포커스 복원과 기존 Warehouse dropdown Enter가 결합하는 별도 경로가 남았다.

### 증거

- `docs/qa-shots/825-s12-final-reconvergence/_local/02-defect-confirmed-choice-overwritten-by-enter.png`
  - `resolveQaShotsDir(...)` 경유
  - 최종 표시값 `HQ-001 · 본사창고` 확인
  - 화면 본문 UUID 정규식 0건

## ①~⑦ 도달 결과

결함 발견 전 동일한 실제 화면에서 실행된 결과만 적는다.

| 각도 | 결과 | 실측 |
|---|---|---|
| ① 취소 → Enter → 재오픈 → 다시 취소 → 다시 Enter | PASS | 취소/Enter 재오픈을 두 번 반복해 안쪽 dialog가 매번 다시 열림 |
| ② Escape로 닫은 뒤 Enter | PASS | Escape로 안쪽만 닫은 뒤 `창` draft가 남고 Enter로 재오픈 |
| ③ 확정으로 닫은 뒤 Enter | **FAIL** | `CS-001` 확정 뒤 Enter가 `HQ-001`로 선택을 덮어씀 |
| ④ 후보 1건 Enter | PASS | `HQ` 입력 시 `autoSelectSingleResult`로 모달 없이 `HQ-001` 확정; 이후 Enter로 모달 미표시·값 유지 |
| ⑤ 후보 0건 Enter | PASS | 취소 뒤 `존재하지않는창고`로 변경하고 Enter; 모달 미표시, 빈 결과 상태와 draft 유지 |
| ⑥ 중첩 Escape 두 번 | PASS | 첫 Escape는 안쪽 검색 dialog만, 두 번째 Escape는 바깥 병합 dialog를 닫음 |
| ⑦ 포커스 재오픈 루프 | PASS | 취소 뒤 input 포커스 복원 후 250ms 관찰 동안 검색 dialog 재오픈 없음 |

추가 캡처:

- `docs/qa-shots/825-s12-final-reconvergence/_local/01-repeated-cancel-enter-reopen.png`
- `docs/qa-shots/825-s12-final-reconvergence/_local/03-zero-result-enter-stable.png`

## 차단되면 안 되는 경로와 소비처 전수

`rg`를 실제 renderer의 비테스트 `.tsx`에 적용해 직접 컴포넌트 인스턴스를 셌다.

| 공용 경로 | 직접 인스턴스 | 선택 모달 유효 | 기존 dropdown |
|---|---:|---:|---:|
| `AsyncAutocomplete` | 2 | 0 | 2 |
| `WarehouseAutocomplete` | 6 | 1 | 5 |
| `PartnerAutocomplete` | 17 | 2 | 15 |
| `MultiSelectAutocomplete` | 4 | 3 | 1 |
| `ProductAutocomplete` | 4 | 4 | 0 |
| `ProductMultiSelectAutocomplete` | 1 | 1 | 0 |
| **합계** | **34** | **11** | **23** |

선택 모달 11개 인스턴스는 10개 화면이다. `SlipFormPage`에 판매/구매 두 인스턴스가 있어 화면 수보다 하나 많다.

1. `ApprovalLineConfigPage` 결재자 — multiple
2. `BankTransactionPage` 은행거래 거래처 — single
3. `DepositorMappingPage` 입금자명 거래처 — single
4. `GroupwareApprovalCreatePage` 결재자 — multiple
5. `MessengerPage` 수신자 — multiple
6. `EstimateFormPage` 견적 품목 — single
7. `SlipFormPage` 판매 품목 — single
8. `SlipFormPage` 구매 품목 — single
9. `MergeConvertDialog` 출고 창고 — single
10. `SafetyStockAlertsPage` 품목 — `ProductAutocomplete` 기본 single
11. `EstimateItemsCatalogPage` 품목 — fixed multiple

미지정 dropdown 대표로 직접 `AsyncAutocomplete` 소비처인 `/accounting/journals/new`의 `라인 1 거래처`를 실제 Chromium에서 실행했다. `삼` 입력 → listbox 표시 → ArrowDown → Enter → listbox 닫힘 및 선택 라벨 반영으로 통과했다. 이는 S11 Warehouse 전용 Enter 추가가 공용 `AsyncAutocomplete`의 기존 Enter 확정 경로를 빼앗지 않았다는 실제 도달 증거다.

다만 결함 발견 후 중단 규칙 때문에 결재자 검색과 은행거래 거래처 자체를 이번 라운드에서 다시 끝까지 실행하지는 않았다.

## UUID 비노출

- 결함 경로의 모달 후보는 창고 코드/창고명으로 표시됐다.
- 결함 후 확정 표시도 `HQ-001 · 본사창고`였고 UUID는 없었다.
- ③·⑤ 화면 본문, ④ 확정 input, 미지정 Async dropdown 확정 input의 UUID 정규식은 0건이었다.
- 칩 표면은 결함 발견 후 중단해 이번 라운드에서 새로 밟지 않았다.

## 증거 무결성과 프로세스 회수

- 최초 격리 서버 준비 실패 1회는 이전 진단용 Vite 자식이 5825를 점유한 검증 하네스 문제였다. 명령행을 확인해 해당 PID만 회수했다.
- 다음 준비 실패 1회는 검증자가 `VITE_APP_VERSION=2026/08/08-S12`를 사용한 형식 오류였다. 저장소 계약에 맞는 `2026/08/08-12`로 교정했다. 두 준비 실패에서는 Playwright 테스트가 실행되지 않았으며 제품 결과에 포함하지 않았다.
- 최종 단독 결함 재현은 `VITE_API_BASE_URL=http://127.0.0.1:1`에서 실행했다.
- 캡처 3장은 모두 `resolveQaShotsDir(...)`를 경유했다.
- 종료 시 5825 listener 없음. 이 작업 트리 명령행을 가진 browser/electron/node 잔류 프로세스 없음.
- 코드 수정·커밋·push 없음. 일회성 Playwright 스펙은 보고서 작성 후 제거했다.

## 신규 파일

유지:

- `docs/dev-reports/2026-08-08-825-s12-final-reconvergence.md`
- `docs/qa-shots/825-s12-final-reconvergence/_local/01-repeated-cancel-enter-reopen.png`
- `docs/qa-shots/825-s12-final-reconvergence/_local/02-defect-confirmed-choice-overwritten-by-enter.png`
- `docs/qa-shots/825-s12-final-reconvergence/_local/03-zero-result-enter-stable.png`

일시 생성 후 제거:

- `clients/desktop/playwright/825-s12-final-reconvergence/825-s12-final-reconvergence.spec.ts`
- Playwright 생성물 `clients/desktop/test-results/`, `clients/desktop/playwright-report/`, `clients/desktop/playwright-json/`

## 이 라운드가 보지 않은 것

- 결함 발견 후 중단했으므로 결재자 검색·은행거래 거래처·나머지 선택 모달 소비처 8개 화면의 이번 HEAD 신규 실 GUI 완주.
- 23개 기존 dropdown 인스턴스 각각의 개별 수동 진입. 직접 `AsyncAutocomplete` 1개 대표와 전수 grep까지만 수행했다.
- 칩 표면의 이번 라운드 신규 UUID 검사.
- 실 API·실 DB·Electron 패키지 실행. 이번 라운드는 요청대로 격리 mock Chromium headless만 사용했다.
- CI 51/51 재실행. 제공된 green 상태는 참고만 했고, 결함 발견 후 중단 규칙에 따라 CI를 다시 돌리지 않았다.

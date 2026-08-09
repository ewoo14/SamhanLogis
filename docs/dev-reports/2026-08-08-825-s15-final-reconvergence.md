# PR #1120 · 이슈 #825 S15 최종 재수렴

- 기준 HEAD: `700fde8c0d489830d3bc419ce7237560715e91f1`
- 범위: S14 되돌림 후 전역 입력 UX 도달성 검증
- 제약: 코드 수정·커밋·push·공유 Docker 재기동 없음

## 진행 기록

- 시작 전 확인: 요청 HEAD와 실제 HEAD가 일치했고 worktree는 clean이었다.
- 실행 조건: `clients/desktop` cwd, Chromium headless, `CI=1`, `VITE_MOCK_MODE=1`, `VITE_API_BASE_URL=http://127.0.0.1:1`.
- 공유 Docker 스택은 재기동하지 않았다.
- S15 전용 실 GUI 4시나리오 실행 결과: **1 failed / 3 passed**. 실패 시나리오는 Playwright retry에서도 같은 값으로 재현되어 2/2였다.

## 판정

**도달 결함 1건. 머지 차단.**

### S15-F1 — 병합전환 출고창고 명시 확정 직후 표시값이 사라진다

재현:

1. `/sales/partner-orders`에서 판매전표 병합 전환 모달을 연다.
2. 출고 창고에 `창`을 입력해 다건 검색결과 모달을 연다.
3. `CS-001` radio를 선택하고 `선택 확정` 버튼에 키보드 `Enter`를 누른다.
4. 검색결과 모달은 닫히지만 출고 창고 input 표시값은 `CS-001 · ...`가 아니라 `""`이다.
5. input은 포커스된 채 `aria-expanded=true`이고 기존 dropdown이 다시 열려 `HQ-001 본사창고` 후보가 보인다.

Playwright 원문:

```text
Expected pattern: /^CS-001/
Received string:  ""
Locator: getByTestId('merge-convert-warehouse').getByRole('combobox')
```

retry 포함 두 번 모두 같은 위치에서 실패했다. 실패 캡처에서도 출고 창고 입력은 공란이고 그 아래 `HQ-001 본사창고` dropdown이 열려 있다.

도달 영향: 사용자가 창고를 명시 확정했는데 즉시 표시되는 값이 없어 확정 성공 여부를 확인할 수 없고, 다른 후보 dropdown이 다시 열려 다음 키 입력이 새 선택으로 이어질 수 있다. S14가 S13의 “확정 후 값 소실”을 복구했다는 전제는 성립하지 않는다.

상태/저장 경계: 화면 캡처에서 `병합 발행 →` 버튼은 활성 상태이므로 선택 객체 자체는 부모 상태에 남아 있다. 즉 이 재현은 **창고 미지정 저장**이 아니라 **확정값 표시 소실 + 검색표면 재개방**이다. 정적 경로도 `selectedWarehouse`가 없으면 제출 버튼을 disabled하고 mutation 진입 시 다시 throw하므로, 취소 draft만 남은 미확정 상태의 저장은 차단된다.

원인 경계: 명시 확정이 `pick()`으로 선택 상태를 넣고 검색결과 모달을 닫은 뒤, Modal의 포커스 복원이 외부 input `handleFocus()`를 호출한다. 이 일반 focus 경로가 `draft=''`, `open=true`로 만들고 `displayValue = open ? draft : selectedLabel`이 공란을 표시한다. 제품 코드는 수정하지 않았다.

## 실패 전 확인된 도달 경로

- 중첩 Escape: 검색결과 모달에서 Escape 1회 후 안쪽 모달만 닫히고 바깥 병합전환 모달은 유지됐다. 외부 input의 `창`도 유지됐다.
- 바깥 클릭: 검색결과 backdrop 클릭 후 안쪽 모달만 닫히고 바깥 병합전환 모달과 `창` draft가 유지됐다.
- 미확정 저장: 위 취소 상태에서 `merge-convert-submit`은 disabled였고 Enter를 보내도 merge POST는 0건이었다. 따라서 창고 미지정 데이터 저장 경로는 도달하지 않았다.
- 취소 후 목표 도달: 보존된 `창`을 전체선택하고 `HQ` 두 글자를 입력하자 `HQ-001 · 본사창고`가 1건 자동확정됐다. 사용자 조작은 `Ctrl+A` 1회 + `HQ` 입력 1회다.
- `autoSelectSingleResult`: 위 `HQ` 검색은 검색결과 모달 없이 즉시 확정됐고, 이어 Enter를 눌러도 표시값이 바뀌거나 사라지지 않았다.
- 결재자 실제 화면: 검색결과에서 checkbox 선택 후 `선택 확정`을 Enter로 실행했고 칩 1개가 표시됐다. 모달·칩·화면 visible text에 UUID가 없었다.
- 은행거래 거래처 실제 화면: radio 선택 후 `선택 확정`을 Enter로 실행했고 blur 후 거래처명이 표시됐다. 재포커스 후 Enter와 blur를 거쳐도 값이 유지됐고 visible text에 UUID가 없었다.
- `resultSelectionMode` 미지정 소비처: 수금계획의 기존 거래처 dropdown에서 ArrowDown + Enter로 `엘에이시스템에어`가 확정됐다.

## 캡처

의도한 캡처 목적지는 모두 `resolveQaShotsDir`를 경유했다.

- `docs/qa-shots/825-s15-final-reconvergence/_local/01-cancel-draft-preserved-submit-blocked.png`
- `docs/qa-shots/825-s15-final-reconvergence/_local/02-warehouse-confirmed-enter-stable.png`
- `docs/qa-shots/825-s15-final-reconvergence/_local/03-approval-enter-confirm-chip-no-uuid.png`
- `docs/qa-shots/825-s15-final-reconvergence/_local/04-bank-partner-enter-confirm-no-uuid.png`

실패 자동 캡처는 Playwright `test-results` 아래에 생성됐으며 보고서 판정은 locator 원문과 화면 관찰을 함께 사용했다.

## 신규 파일

- `docs/dev-reports/2026-08-08-825-s15-final-reconvergence.md`
- `clients/desktop/playwright/825-s15-final-reconvergence/825-s15-final-reconvergence.spec.ts`

커밋·push 없음. 제품 코드 수정 없음.

## 이 라운드가 보지 않은 것

- S15-F1이 요청 전제와 충돌해 즉시 중단했으므로 design-system 전체 205건과 Desktop mock 전체 667건은 재실행하지 않았다.
- footer의 `취소` 버튼 클릭은 별도로 반복하지 않았다. 이번 라운드는 동일 `onCancel` 경로를 호출하는 Escape와 backdrop 클릭을 실 GUI로 확인했다.
- 명시 확정 후 blur했을 때 표시가 복원되는지, 이후 실제 병합 POST payload에 어느 창고가 들어가는지는 전제 불일치 중단 규칙에 따라 추가 실행하지 않았다.
- UUID 검사는 대표 3화면의 visible text 기준이다. 숨은 DOM 속성·네트워크 payload의 내부 UUID는 사용자 노출이 아니므로 검사하지 않았다.
- 공유 실서버·실데이터·Electron GUI·Docker 연동은 보지 않았다. 이번 라운드는 요청된 격리 mock headless GUI만 실행했다.

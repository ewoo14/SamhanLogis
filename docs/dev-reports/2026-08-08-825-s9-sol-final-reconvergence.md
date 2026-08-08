# PR #1120 / 이슈 #825 S9 SOL 최종 재수렴

> 검증일: 2026-08-08  
> 기준 HEAD: `a20ffb7de098865ec6087ef02838ed5e4b8c886c`  
> 실행: `clients/desktop` cwd, Chromium headless, `VITE_MOCK_MODE=1`, `VITE_API_BASE_URL=http://127.0.0.1:1`

## 판정

**도달 결함 2건. 머지 차단.**

모달이 열린 뒤 검색어를 계속 입력해 후보를 1건으로 좁히고 선택·확정하는 핵심 경로는 대표 3화면에서 도달했다. 다만 병합전환 출고창고에는 다음 두 키보드 경로 결함이 남아 있다.

1. 검색결과 모달을 취소하면 원래 외부 입력 `창`이 보존되지 않고 빈 값이 된다.
2. 검색결과 모달에서 `Escape`를 누르면 검색결과 모달뿐 아니라 바깥 병합전환 모달까지 함께 닫힌다.

따라서 S4의 “모달 안에서 계속 좁힐 수 있다”는 주장은 성립하지만, “취소 후 원래 입력으로 복귀”와 “중첩 모달의 키보드 탈출”은 성립하지 않는다.

## 1. 대표 소비처 3종 실 GUI

### 결재자 · `/admin/approval-line-config`

- 외부 입력 `팀`에서 `출고자 결재자 검색 결과` 모달이 열렸다.
- 내부 검색 입력이 자동 포커스를 받았다.
- 배차팀·영업팀·회계팀 3건에서 내부 검색을 계속 입력해 후보를 좁힐 수 있었다.
- `Tab` 1회로 첫 checkbox, `Space`로 선택할 수 있었다.
- 필터 밖으로 사라진 첫 선택도 유지됐고, 확정 후 결재자 칩 2개가 남았다.
- 모달·확정 후 칩·화면 본문에서 UUID 정규식 노출은 없었다.

### 은행거래 거래처 · `/accounting/bank-transactions`

- 외부 입력 `P`에서 9건의 `거래처 검색 결과` 모달이 열렸다.
- 내부 검색에 `R2 상태 lower 거래처`를 끝까지 입력하자 radio 1건만 남았다.
- 1건이 되어도 자동 확정되지 않았다. 모달과 radio 1건이 그대로 남아 사용자가 선택·확정했다.
- 검색 입력에서 `Tab` → `Space` → `Tab` → `Tab` → `Enter`만으로 선택·확정됐다.
- 확정 직후 포커스가 외부 combobox로 돌아오면서 입력은 편집용 공란이었고, `Tab`으로 blur하자 `R2 상태 lower 거래처` 표시가 복원됐다.
- 모달과 확정 후 화면 본문에서 UUID 정규식 노출은 없었다.

### 병합전환 출고창고 · `/sales/partner-orders`

- 외부 입력 `창`에서 HQ-001·CS-001·BK-001 3건의 `출고 창고 검색 결과` 모달이 열렸다.
- mock fixture에는 문자 그대로의 `창고A`가 없어서, 같은 계약을 실제 존재 후보 `HQ-001`로 좁혔다.
- 내부 검색에 `HQ-001`을 끝까지 입력하자 radio 1건만 남았다.
- 1건이 되어도 자동 확정되지 않았다. 모달과 radio 1건이 남아 명시 선택·확정할 수 있었다.
- 외부 입력에서 처음부터 `HQ`를 입력해 검색 결과가 1건이면 기존 `autoSelectSingleResult` 계약대로 모달 없이 `HQ-001 · 본사창고`가 즉시 확정됐다.
- 모달과 확정 후 화면 본문에서 UUID 정규식 노출은 없었다.

## 2. 차단 결함

### S9-F1 — 병합전환 검색결과 취소가 원래 입력을 지운다

재현:

1. 병합전환 모달을 열고 출고창고 외부 입력에 `창` 입력.
2. 검색결과 모달에서 `HQ-001`까지 입력해 후보 1건으로 축소.
3. 검색 입력에서 `Tab` 두 번 후 `Enter`로 `취소` 실행.
4. 검색결과 모달은 닫히고 바깥 병합전환 모달은 유지되며 외부 입력으로 포커스가 복원됨.
5. 외부 입력값은 `창`이 아니라 `""`.

도달 영향: 취소 후 사용자가 원래 검색어에서 이어 입력할 수 없고 처음부터 다시 입력해야 한다.

근거: `WarehouseAutocomplete.tsx:277-281`의 `closeSelection()`이 취소 시 `setDraft(selectedLabel)`을 실행한다. 아직 선택이 없는 경로의 `selectedLabel`은 공란이다. 공용 `AsyncAutocomplete`의 취소 draft 보존 계약과 다른 별도 구현이다.

기존 테스트가 놓친 이유: `825-s5-verification.spec.ts`는 취소 뒤 포커스만 단정하고 외부 입력값은 단정하지 않는다. `WarehouseAutocomplete.test.tsx`의 취소 테스트도 `onChange` 미호출만 단정한다.

### S9-F2 — 중첩 검색결과 모달의 Escape가 바깥 모달까지 닫는다

재현:

1. 병합전환 모달을 열고 출고창고 외부 입력에 `창` 입력.
2. 검색결과 모달이 열린 상태에서 `Escape` 1회.
3. 검색결과 모달이 닫힐 뿐 아니라 `merge-convert-dialog-body`도 사라지고 출고창고 입력도 DOM에서 제거됨.

도달 영향: 키보드 사용자가 검색결과만 취소하려다 병합전환 작업 전체에서 이탈한다.

근거: `Modal.tsx:139-149`에서 열린 모든 `Modal` 인스턴스가 `document`에 각자 `keydown` listener를 등록한다. `e.stopPropagation()`은 같은 `document`에 등록된 다른 listener의 실행을 막지 않으므로 중첩된 두 모달의 `onClose()`가 모두 호출된다. 두 번 독립 실행에서 같은 증상을 관찰했다.

## 3. 기존 dropdown·단건 계약

- `resultSelectionMode` 미지정 `WarehouseAutocomplete`의 실제 dropdown 경로는 `phase-2-6c-inventory-deduction` 9개 GUI 시나리오에서 `HQ-001` role=option 선택까지 도달했다.
- 대표 3화면·S5·AC-5·legacy dropdown 묶음은 총 21/21 PASS였다.
- 공용 `AsyncAutocomplete`·`WarehouseAutocomplete`·`Modal`·`SearchResultSelectionModal` 계약은 4파일 54/54 PASS였다.
- 외부 검색 결과가 1건이고 `autoSelectSingleResult=true`인 병합전환 출고창고는 `HQ` 입력에서 모달 없이 즉시 확정됐다.
- 모달 내부 필터가 1건을 만든 경우에는 자동 확정하지 않고 1건 목록을 유지했다. 외부 검색 단건 계약과 내부 필터 단건 계약은 서로 다르다.

이번 실행에서 기존 dropdown 경로의 단절은 발견하지 못했다. 모든 미지정 소비처 화면을 하나씩 수동 진입한 것은 아니며, 공용 컴포넌트 계약과 실제 대표 소비처로 경로를 확인했다.

## 4. 실행 증거

```text
Playwright 대표 3화면 + S5 + AC-5 + legacy dropdown   21 passed (27.7s)
design-system 관련 계약                              4 files / 54 passed
하네스 거짓 green 가드                              1 file / 49 passed
추가 headless GUI 측정                              은행 확정·창고 취소·단건·Escape 재현
```

모든 Playwright/Vite 실행은 `VITE_API_BASE_URL=http://127.0.0.1:1`을 상위 환경과 명시 기동 서버에 설정했다. handler 없는 endpoint가 `localhost:8080`으로 성공하는 경로는 사용하지 않았다.

## 5. 증거 무결성

- `825-s5-verification.spec.ts:4,7`은 `resolveQaShotsDir(...)`를 import·호출한다.
- 이번 캡처는 기본 `_local`에 저장됐다.
  - `docs/qa-shots/825-s5-verify/_local/01-approval-multiple-filter-retains-selection.png`
  - `docs/qa-shots/825-s5-verify/_local/02-bank-partner-filtered-target.png`
  - `docs/qa-shots/825-s5-verify/_local/03-warehouse-zero-results-cancel-enabled.png`
- 세 PNG를 원본 해상도로 열어 결재자 2건 선택, 은행거래 1건 필터, 창고 0건·취소 활성 상태를 확인했다.
- H-2를 포함한 `harness-false-green-guard.test.ts` 49/49 PASS.
- 커밋된 캡처 3장은 `git status`에서 변경되지 않았다.

## 6. 신규 파일·금지 작업

- 신규 파일: `docs/dev-reports/2026-08-08-825-s9-sol-final-reconvergence.md` 1개.
- `_local` 캡처 3개는 기존 ignore 경로에 이번 실행 결과로 갱신됐다.
- 제품 코드·테스트 코드는 수정하지 않았다.
- 커밋·push·DB write·Docker 재기동은 하지 않았다.

## 이 라운드가 보지 않은 것

- mock이 아닌 운영·공유 API와 실제 데이터. 지시대로 `127.0.0.1:1` 격리 mock만 사용했다.
- `resultSelectionMode` 미지정 소비처 화면 전부의 개별 수동 진입. 공용 컴포넌트 계약과 실제 legacy dropdown 소비처로 경로를 확인했다.
- Windows/macOS 실제 OS IME 후보창. headless Chromium composition 이벤트 경로까지만 확인했다.
- 스크린리더 음성 출력. role/name, Tab/Space/Enter, 포커스 복원과 Escape 경로까지만 확인했다.
- 모바일 클라이언트.

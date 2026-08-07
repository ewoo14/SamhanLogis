# PR #1104 / 이슈 #1091 — S3 협업 브리지 복구

## 결론

S2에서 버전이력 목록을 DS `Modal` 안으로 옮긴 뒤, 협업 상태가 갱신되어도 모달을 열어 주는 연결이 없어 사용자가 변경 항목을 볼 수 없었다. 실제 협업 브리지는 4개 좌표 중 3개였다.

- `SlipCollaborationPanel` ↔ `SlipVersionHistoryPanel`
- `EstimateCollaborationPanel` ↔ `EstimateVersionHistoryPanel`
- `PartnerOrderCollaborationPanel` ↔ `PartnerOrderVersionHistoryPanel`
- `PartnerVersionHistoryPanel`: 협업 패널 참조 0건 — 브리지 없음

정방향 활성 대상이 생기면 해당 이력 패널이 자동으로 열리고, Slip의 경우 매칭된 revision의 `<details>`도 자동으로 펼쳐진다. 사용자가 직접 이력 버튼을 누른 경우에는 기존처럼 모달이 열린다.

## RED 원문 — 수정 전 기준선

세 bridge 테스트에서 모달을 여는 `fireEvent.click(... '버전이력')` 7개를 제거하고, production fix만 잠시 되돌려 실행했다.

```text
npx vitest run src/renderer/components/collab/SlipCollaborationPanel.history-bridge.test.tsx \
  src/renderer/components/collab/EstimateCollaborationPanel.history-bridge.test.tsx \
  src/renderer/components/collab/PartnerOrderCollaborationPanel.history-bridge.test.tsx

FAIL EstimateCollaborationPanel ...
Unable to find an element by: [data-testid="estimate-version-history-row-3"]

FAIL PartnerOrderCollaborationPanel ...
Unable to find an element by: [data-testid="partner-order-version-history-row-4"]

FAIL SlipCollaborationPanel ...
Unable to find an element by: [data-testid="slip-version-history-row-5"]
```

이것이 RED-A의 원문이다. 코멘트 클릭 뒤 `active*` 상태는 바뀌지만 모달이 닫혀 있어 이력 row가 DOM에 없다. RED-B는 같은 실행의 DOM 상태로 확인했다. 기본 렌더에는 `*-version-history-open` 버튼만 있고 `*-version-history-list`가 없으므로 S2의 기본 비노출은 유지되어야 한다.

## GREEN 및 불변식 검증

```text
4 test files passed, 14 tests passed
```

추가로 협업 mock/co-edit 및 Slip 이력 패널 테스트까지 포함해 7개 파일 24개 테스트가 통과했다. `npx tsc -p tsconfig.web.json --noEmit`도 통과했다.

1. 코멘트 클릭 → 자동으로 모달 열림 → 관련 row/변경 항목 하이라이트
2. Slip의 접힌 `<details>` 안 대상 → 관련 details 자동 펼침
3. 모달이 이미 열린 상태에서 코멘트 재클릭 → 열린 상태 유지, 새 대상만 펼침/하이라이트
4. 이력 변경 항목 클릭 → 역방향 코멘트 하이라이트
5. 여러 필드 anchor → 매칭된 모든 변경 항목과 코멘트 하이라이트
6. anchor 없는 코멘트/대상 없음 → 모달 자동 열림 없음
7. 이력 버튼 직접 클릭 → 기존 수동 열기와 기본 비노출 보존

## ① 새로 가능해진 조합을 밟은 결과

- 모달 닫힘 + 코멘트 클릭: 세 bridge 테스트에서 실제로 밟고 GREEN.
- 모달 열림 + 코멘트 재클릭: Slip의 multi-field bridge에서 밟고 GREEN.
- 대상 없음: anchor 없는 코멘트는 active 대상이 아니며 자동 열림하지 않는 기존 동작을 유지.
- 여러 필드: Slip multi-field bridge에서 두 코멘트와 두 field path를 모두 확인.
- details 중첩/접힘: Slip panel test에서 기본 `open === false`, bridge 코멘트 클릭 후 대상 details가 `open === true`임을 확인.
- 역방향: 코멘트로 모달을 연 뒤 이력 변경 항목을 클릭해 코멘트 active를 확인.
- 이미 열린 모달에서 재클릭: controlled details 상태가 기존 열린 항목을 보존하면서 새 매칭 항목을 추가한다.

## ② 제거·이동·개명 식별자 grep 전수

- `버전이력` 모달 자동 오픈을 가리는 bridge 테스트 클릭: 0건.
- `PartnerVersionHistoryPanel` 협업 참조: 0건(패널 자기 파일과 문서 링크만 존재).
- 실제 bridge 참조: Slip, Estimate, PartnerOrder 3건.
- 기존 `*-version-history-open`, `*-version-history-list`, row/change test id는 유지.

## ③ 바꾼 파일을 참조하는 테스트 전부

- `SlipVersionHistoryPanel.test.tsx`: 6/6
- `SlipCollaborationPanel.history-bridge.test.tsx`: 4/4
- `EstimateCollaborationPanel.history-bridge.test.tsx`: 2/2
- `PartnerOrderCollaborationPanel.history-bridge.test.tsx`: 2/2
- 관련 co-edit 테스트 3개: 10/10
- 합계: 7 files, 24 tests GREEN

S2의 Slip 접기 테스트는 현재 환경에 없는 `toBeVisible` matcher와 `details` 자체가 test id를 갖는 구조에 대한 잘못된 parent 가정을 함께 바로잡았다. 동작 범위를 넓히지는 않았다.

## 불변식 ①↔④의 긴장을 푼 방법

버전이력은 여전히 기본 화면에 노출하지 않는다. 단, 사용자가 코멘트 또는 이력 변경 항목을 선택해 브리지 대상을 만든 순간에만 이벤트 기반으로 모달을 연다. 즉 “기본 비노출”과 “선택 결과는 즉시 보임”을 서로 다른 상태로 분리했다. active 대상이 없으면 `historyOpen`을 변경하지 않는다.

## 신규 파일 목록

- `docs/dev-reports/2026-08-07-1091-s3-collab-bridge-fix.md`

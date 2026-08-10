# #825 S10 — 검색 결과 모달 취소·중첩 Escape fix

## 결론

- RED-A: 검색 모달 취소/바깥 클릭 뒤 WarehouseAutocomplete의 입력 draft를 보존한다.
- RED-B: 중첩 Modal의 Escape는 현재 포커스가 속한 최상위 dialog 하나만 닫는다. 다시 Escape하면 바깥 Modal이 닫힌다.
- 선택 확정은 기존대로 선택값으로 교체한다.

## 원인

1. `WarehouseAutocomplete.closeSelection()`이 취소 시 `selectedLabel`로 draft를 덮어썼고, focus 복원 경로도 draft를 빈 문자열로 초기화했다.
2. `Modal` 인스턴스마다 document Escape listener가 있었고 `stopPropagation()`만 사용해 같은 document의 다른 listener가 계속 실행됐다. React effect 등록 순서는 시각적 중첩 순서를 보장하지 않으므로, 실제 dialog DOM과 activeElement로 최상위 레이어를 판정했다.

## RED 원문 및 GREEN

- RED-A 테스트: `WarehouseAutocomplete.test.tsx` — `검색 모달 취소 뒤 원래 입력 draft를 보존해 이어서 좁힐 수 있다`
  - 수정 전 실제 결과: `expected '' to be '창고'`
- RED-B 테스트: `SearchResultSelectionModal.test.tsx` — `중첩 모달에서 Escape 한 번은 가장 안쪽 모달 하나만 닫는다`
  - 수정 전 실제 결과: 안쪽 `false`와 동시에 바깥 `false`
- GREEN: design-system 전체 `26 files / 205 tests passed`

## 전수 소비처

`rg -l 'resultSelectionMode' clients --glob '*.tsx'` 결과에서 테스트/공용 컴포넌트를 제외한 실제 desktop 소비처는 다음 9개다.

| 소비처 | 구현 경로 | ①·② 확인 |
|---|---|---|
| 결재자 검색 | `ApprovalLineConfigPage` → `MultiSelectAutocomplete` | 공용 Async 계약 + mock QA |
| 은행거래 거래처 | `BankTransactionPage` → `PartnerAutocomplete` | 공용 Async 계약 + mock QA |
| 병합전환 출고창고 | `MergeConvertDialog` → `WarehouseAutocomplete` | Warehouse 회귀 + mock QA |
| 입금자명 거래처 | `DepositorMappingPage` → `PartnerAutocomplete` | 공용 Async 계약 |
| 그룹웨어 결재자 | `GroupwareApprovalCreatePage` → `MultiSelectAutocomplete` | 공용 Async 계약 |
| 메신저 수신자 | `MessengerPage` → `MultiSelectAutocomplete` | 공용 Async 계약 |
| 견적 품목 | `EstimateFormPage` → `ProductAutocomplete` | 공용 Async 계약 |
| 판매 전표 품목 | `SlipFormPage` 판매 라인 | 공용 Async 계약 |
| 구매 전표 품목 | `SlipFormPage` 구매 라인 | 공용 Async 계약 |

공용 Async 소비처의 취소·Escape·재포커스 계약은 `AsyncAutocomplete.test.tsx` 기존 R27 테스트와 `SearchResultSelectionModal.test.tsx`의 RED-B로 고정했고, 대표 3종은 아래 mock Playwright로 실제 화면 경로를 확인했다.

## 요청 조합 검증

1. 모달 선택 확정 → 입력값이 선택값으로 변경: GREEN. Warehouse 단위 테스트 및 대표 3종 mock QA의 확정 경로.
2. 모달 바깥 클릭 → 취소와 동일하게 draft 보존: GREEN. Warehouse 단위 테스트.
3. 단독 검색 모달 Escape → 해당 모달만 닫힘: GREEN. AsyncAutocomplete 기존 Escape 취소 회귀와 Modal 계약.
4. 확정 후 재오픈 → 이전 편집 draft가 남아 방해하지 않음: GREEN. 확정은 `pick`이 선택값을 기록하고 다음 일반 focus가 draft를 초기화하는 기존 계약.
5. 결재자·은행거래 거래처: GREEN. 공용 Async 경로와 대표 3종 Playwright mock QA.

## 검증 명령

- `npm test` (`clients/web/design-system`, `VITE_API_BASE_URL='http://127.0.0.1:1'`): **26 files / 205 passed**
- `npm run typecheck` (`clients/web/design-system`): **passed**
- desktop 소비처 계약: **2 files / 7 passed**
- desktop typecheck + real-QA scope: **passed**
- `VITE_API_BASE_URL='http://127.0.0.1:1' VITE_MOCK_MODE='1' npx playwright test playwright/825-s2-slice1-contract/825-s2-slice1-contract.spec.ts --reporter=line`: **3 passed**

초기 desktop 검증은 파생 산출물 freshness gate(`design-system/dist`, `desktop/out/main`)에서 중단됐고, 안내된 build 후 동일 검증을 재실행해 통과시켰다.

## 변경 산출물

- 수정: `clients/web/design-system/src/components/Modal/Modal.tsx`
- 수정: `clients/web/design-system/src/components/WarehouseAutocomplete/WarehouseAutocomplete.tsx`
- 수정 테스트: `SearchResultSelectionModal.test.tsx`, `WarehouseAutocomplete.test.tsx`
- 신규 파일: 본 보고서 1개
- 커밋/push: 하지 않음
- `git diff --stat` 삭제 줄 수: **7줄**

QA 실행 후 이 작업 트리에는 browser/electron 또는 본 QA의 잔류 프로세스가 없음을 확인했다. Codex MCP가 소유한 다른 worktree의 node 런타임은 회수 대상에서 제외했다.

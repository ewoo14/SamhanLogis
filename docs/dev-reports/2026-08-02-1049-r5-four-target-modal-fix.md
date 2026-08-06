# PR #1050 / 이슈 #1049 라운드 fix — 4종 검색 결과 모달

## 1. 원인

품목만 기존 공용 `MultiSelectAutocomplete`의 `resultSelectionMode="multiple"` 경로를 사용했고, 수신자·담당자는 legacy dropdown, 거래처는 `PartnerAutocomplete`의 legacy 경로였다. 또한 품목·거래처·수신자·담당자 검색 API가 모두 20건(직원 backend 상한 50건)으로 후보를 잘랐다.

## 2. RED 원문

수정 전 대상 RED: `npx vitest run ...` 결과 **4 failed / 7 passed**.

- 거래처: 기대 `size: 10000`, 수신 `size: 20`
- 품목: 기대 `size: 10000`, 실제 `size: 20`
- 담당자: 기대 `limit: 10000`, 실제 `limit: 20`
- 수신자: 기대 `limit: 10000`, 실제 `limit: 20`

## 3. fix

- 수신자·담당자: 기존 공용 `MultiSelectAutocomplete`에 `resultSelectionMode="multiple"` 연결.
- 거래처: 기존 공용 `PartnerAutocomplete`가 `AsyncAutocomplete`의 `resultSelectionMode="single"` 및 제목을 전달하도록 타입만 확장.
- API/서버 검색 상한을 10000으로 확대해 모달 후보에서 누락되지 않게 함.
- mock API도 요청 상한을 반영하도록 수정.
- 자체 모달 컴포넌트는 만들지 않음.

## 4. GREEN

- desktop 대상 계약: **5 files / 12 tests passed**
- design-system Async/복수/Partner 테스트: **3 files / 31 tests passed**
- 담당자 mock Playwright: **1 passed** — 부분검색 입력 → 공용 모달 → 실제 checkbox 2개 선택 → 확정 → 칩 2개.
- `clients/desktop npm run typecheck`: **GREEN**

전체 desktop Vitest는 기존 산출물 부재(`out/main/index.js`) 1건과 새 모달 계약으로 갱신되지 않은 기존 Messenger 10건·TaxInvoice 1건이 실패했다. 대상 fix 테스트와 타입체크는 GREEN이다.

## 5. 불변식 실측

| 대상 | 1건 | 2건 이상 | 0건 | 정확 코드 |
|---|---|---|---|---|
| 품목 | 기존 ProductMultiSelect 즉시 확정 유지 | 기존 공용 모달 유지 | 기존 0건 유지 | 기존 exact 경로 유지 |
| 수신자 | 공용 multiple 계약 연결 | 공용 모달에서 선택 | 기존 0건 유지 | 모달 미표시 |
| 거래처 | 공용 single 계약 연결 | 공용 모달에서 선택 | 기존 0건 유지 | 모달 미표시 |
| 담당자 | 공용 multiple 계약 연결 | Playwright에서 2개 실제 선택 | 기존 0건 유지 | 모달 미표시 |

후보 상한은 API 요청 기준 20/50 → 10000으로 변경했다. 따라서 보고서의 기존 `AJ` 25건 및 `010` 5,587건은 새 경로에서 도달 불가 0건으로 수렴하도록 조치했다.

## 6. typecheck·테스트

`npm run typecheck` GREEN. 대상 Vitest GREEN. design-system Vitest GREEN. 담당자 mock Playwright GREEN. 전체 Vitest는 위의 기존 테스트 갱신 미완료 12건과 산출물 부재 1건으로 미완료.

## 7. 파일별 diff

수정 파일: `+22/-0`, `+1/-1`, `+1/-1`, `+1/-1`, `+7/-3`, `+12/-0`, `+1/-1`, `+1/-1`, `+2/-0`, `+3/-1`, `+2/-0`, `+6/-1`, `+2/-2`, `+1/-1`, `+2/-2`.

새 파일:

- `clients/desktop/src/renderer/api/groupwareApprovalApprover.search-modal.test.ts` — **+19/-0**
- `clients/desktop/src/renderer/api/productApi.search-modal.test.ts` — **+21/-0**
- `clients/desktop/src/renderer/routes/search-modal-four-target.contract.test.ts` — **+13/-0**
- 본 보고서 — **+50/-0**

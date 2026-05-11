# QA 시나리오 — DataGrid Excel-like 인터랙션 (TC-DG)

슬라이스: `supplier-profile-and-grid-ux`
작성일: 2026-05-11
QA 담당: QA agent
연관 Playwright spec: `clients/desktop/playwright/datagrid/datagrid-interaction.spec.ts`

---

## 시나리오 개요

| TC ID | 제목 | 우선순위 | 상태 |
|-------|------|---------|------|
| TC-DG-1 | 셀 단일 클릭 → 1셀 선택 (파란 outline) | P0 | 자동화 완료 |
| TC-DG-2 | Shift+클릭 → 사각형 범위 선택 | P1 | 자동화 완료 |
| TC-DG-3 | Ctrl+클릭 → 선택 토글 | P1 | 자동화 완료 |
| TC-DG-4 | Ctrl+A → 전체 셀 선택 | P1 | 자동화 완료 |
| TC-DG-5 | Ctrl+C → clipboard TSV 형식 검증 | P0 | 자동화 완료 |
| TC-DG-6 | 열헤더 필터 → 거래처명 → 결과 필터링 | P1 | 자동화 완료 |
| TC-DG-7 | SalesQueryPage 셀 선택 (회귀 가드) | P1 | 자동화 완료 |

---

## 클립보드 권한 처리 (TC-DG-5 전용)

Playwright 의 `navigator.clipboard.readText()` 는 `https://` 또는 `localhost` 보안 컨텍스트에서만 동작한다.

권한 부여 방법:
```typescript
// playwright.config.ts 전역 설정
use: {
  permissions: ['clipboard-read', 'clipboard-write'],
}

// 또는 테스트 내부에서 context 단위 부여
await context.grantPermissions(['clipboard-read', 'clipboard-write'])
```

검증 코드:
```typescript
await page.keyboard.press('Control+c')
await page.waitForTimeout(500)
const clipboardText = await page.evaluate(() => navigator.clipboard.readText())
// TSV 형식: 탭(\t) + 줄바꿈(\n) 분리
expect(clipboardText).toContain('\t')  // 컬럼 구분
expect(clipboardText).toContain('\n')  // 행 구분
```

clipboard API 미지원 환경(구형 Chromium) 또는 보안 컨텍스트 제한 시 soft warn 처리하고
셀 DOM 존재 + pageerror 없음으로 통과.

---

## TC-DG-1: 셀 단일 클릭 → 1셀 선택 (파란 outline)

**목적**: DataGrid 셀을 단일 클릭하면 해당 셀 1개만 선택되는지 검증한다.

**대상 페이지**: TaxInvoiceBatchPage Tab 2 ("결과 페이지")

**사전 조건**:
- mockRole=ACCOUNTANT
- Tab 2 에 데이터 rows 존재 (mock 데이터 기준)
- DataGrid 컴포넌트 구현 완료

**실행 절차**:
1. `/accounting/tax-invoices/batch?mockRole=ACCOUNTANT` 접근
2. Tab 2 ("결과 페이지") 클릭
3. 첫 번째 데이터 셀 단일 클릭
4. 셀 선택 상태 확인

**기대 결과**:
- 클릭한 셀에 파란 outline 또는 선택 하이라이트 적용
- `aria-selected="true"` 또는 선택 클래스(`.selected`, `.cell-selected`) 부여
- 선택 셀 수 = 1
- pageerror 없음

**스크린샷**: `docs/qa/supplier-profile-and-grid-ux/TC-DG-1-cell-single-click-selected.png`

---

## TC-DG-2: Shift+클릭 → 사각형 범위 선택 (10×3 = 30셀)

**목적**: 첫 번째 셀 클릭 후 Shift+클릭으로 사각형 범위가 선택되는지 검증한다.

**사전 조건**:
- Tab 2 에 10행 이상, 3열 이상 데이터 존재

**실행 절차**:
1. Tab 2 첫 번째 셀 단일 클릭 (기준점 설정)
2. 10행 3열 위치 셀 `Shift+클릭`
3. 선택된 셀 범위 확인

**기대 결과**:
- 첫 번째 셀부터 10행×3열 사이 모든 셀 선택 (최대 30셀)
- 사각형 범위 선택 (연속 범위, 개별 토글 아님)
- 선택 셀 수 >= 6 (최소 2×3 범위, mock 데이터 수에 따라 가변)
- pageerror 없음

**스크린샷**: `docs/qa/supplier-profile-and-grid-ux/TC-DG-2-shift-click-range-select.png`

---

## TC-DG-3: Ctrl+클릭 → 선택 토글

**목적**: Ctrl+클릭으로 개별 셀을 선택 추가 및 해제(토글)할 수 있는지 검증한다.

**실행 절차**:
1. Tab 2 첫 번째 셀 단일 클릭 → 1셀 선택
2. 두 번째 셀 `Ctrl+클릭` → 2셀 선택
3. 두 번째 셀 다시 `Ctrl+클릭` → 2번째 셀 선택 해제 (1셀로 감소)

**기대 결과**:
- Ctrl+클릭으로 비연속 다중 선택 가능
- 이미 선택된 셀 Ctrl+클릭 시 선택 해제 (토글)
- 토글 후 선택 수가 이전보다 감소
- pageerror 없음

**스크린샷**: `docs/qa/supplier-profile-and-grid-ux/TC-DG-3-ctrl-click-toggle.png`

---

## TC-DG-4: Ctrl+A → 현재 페이지 전체 셀 선택

**목적**: DataGrid 포커스 상태에서 Ctrl+A 로 현재 페이지의 모든 셀이 선택되는지 검증한다.

**실행 절차**:
1. Tab 2 첫 번째 셀 클릭 (DataGrid 포커스 확보)
2. `Ctrl+A` 키 입력
3. 전체 셀 선택 수 확인

**기대 결과**:
- 현재 페이지 내 모든 데이터 셀 선택
- 선택 셀 수 >= 5 (헤더 제외, 데이터 행×열 수)
- 브라우저 전체 선택(텍스트 드래그) 이 아닌 DataGrid 내부 전체 선택
- pageerror 없음

**스크린샷**: `docs/qa/supplier-profile-and-grid-ux/TC-DG-4-ctrl-a-select-all.png`

---

## TC-DG-5: Ctrl+C → clipboard TSV 형식 검증

**목적**: 셀 선택 후 Ctrl+C 로 복사된 내용이 Excel 호환 TSV(Tab-Separated Values) 형식인지 검증한다.

**사전 조건**:
- Playwright context 에 `clipboard-read`, `clipboard-write` 권한 부여
- HTTPS 또는 localhost 보안 컨텍스트

**실행 절차**:
1. Tab 2 여러 셀 범위 선택 (Shift+클릭으로 3×2 범위)
2. `Ctrl+C` 키 입력
3. `page.evaluate(() => navigator.clipboard.readText())` 호출
4. clipboard 내용 형식 검증

**기대 결과**:
- clipboard 내용이 탭(`\t`)으로 열 구분, 줄바꿈(`\n`)으로 행 구분된 TSV
- Excel 에 붙여넣기 시 올바른 행/열 배치
- clipboard 내용이 비어있지 않음
- pageerror 없음

**TSV 예시**:
```
슬립번호\t거래처명\t공급가액\n
SLP-001\t(주)테스트거래처\t1000000\n
SLP-002\t삼한공조시스템\t2000000\n
```

**스크린샷**: `docs/qa/supplier-profile-and-grid-ux/TC-DG-5-ctrl-c-clipboard-tsv.png`

---

## TC-DG-6: 열헤더 "거래처명" 컬럼 필터 → popover → 결과 필터링

**목적**: 컬럼 헤더 클릭으로 필터 popover 가 표시되고, 입력값으로 행이 필터링되는지 검증한다.

**실행 절차**:
1. Tab 2 "거래처명" 컬럼 헤더 클릭
2. 필터 popover 또는 드롭다운 표시 확인
3. "QA거래처" 텍스트 입력
4. Enter 또는 적용 버튼 클릭
5. 결과 행 확인

**기대 결과**:
- "거래처명" 헤더 클릭 시 필터 입력 UI 표시
- "QA거래처" 입력 후 해당 문자열을 포함하지 않는 행 숨김
- 결과 행이 "QA거래처" 조건에 맞게 필터링 (0행도 정상 — mock 데이터 미포함 시)
- pageerror 없음

**스크린샷**: `docs/qa/supplier-profile-and-grid-ux/TC-DG-6-column-filter-partner-name.png`

---

## TC-DG-7: SalesQueryPage 동일 셀 선택 동작 (회귀 가드)

**목적**: DataGrid 컴포넌트가 SalesQueryPage 에서도 동일하게 동작하는지 회귀 검증한다.

**대상 페이지**: `/accounting/sales-query` 또는 `/sales-query`

**실행 절차**:
1. SalesQueryPage 접근 (mockRole=MASTER)
2. 데이터 그리드 표시 확인
3. TC-DG-1 과 동일: 첫 번째 셀 단일 클릭 → 선택 상태 확인

**기대 결과**:
- TaxInvoiceBatchPage 와 동일한 DataGrid 컴포넌트 사용 확인
- 셀 단일 클릭 → 선택 상태 적용
- pageerror 없음

**스크린샷**: `docs/qa/supplier-profile-and-grid-ux/TC-DG-7-sales-query-cell-select.png`

---

## 회귀 영향 분석

| 기존 기능 | 회귀 위험도 | 검증 방법 |
|----------|------------|----------|
| TaxInvoiceBatch Tab 2 목록 표시 | 높음 | TC-DG-1 ~ TC-DG-5 |
| SalesQueryPage 데이터 표시 | 중간 | TC-DG-7 |
| Ctrl+C 클립보드 복사 (Excel 업무) | 높음 | TC-DG-5 |
| 컬럼 필터 (검색 효율) | 중간 | TC-DG-6 |

## 키보드 단축키 요약

| 단축키 | 동작 |
|--------|------|
| 단일 클릭 | 셀 1개 선택 (이전 선택 해제) |
| Shift+클릭 | 기준점~클릭점 사각형 범위 선택 |
| Ctrl+클릭 | 개별 셀 선택 추가 또는 해제 (토글) |
| Ctrl+A | 현재 페이지 전체 셀 선택 |
| Ctrl+C | 선택 셀 내용 TSV 형식 클립보드 복사 |

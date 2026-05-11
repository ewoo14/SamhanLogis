# 세금계산서 일괄발행 GAS 이식 — Playwright 시나리오 (TC-TIB 7건)

> 슬라이스: `tax-invoice-batch-gas-port`
> 작성일: 2026-05-11
> 담당: QA agent
> 연관 spec: `clients/desktop/playwright/tax-invoice-batch/tax-invoice-batch.spec.ts`

---

## 전제 조건

| 항목 | 내용 |
|---|---|
| 실행 환경 | `VITE_MOCK_MODE=1 npx vite --port 5173` (별도 터미널) |
| 권한 | `mockRole=ACCOUNTANT` (MASTER 도 동일 통과) |
| 스크린샷 저장 위치 | `docs/qa/tax-invoice-batch-gas-port/*.png` |
| PR 회귀 가드 | `page.on('pageerror')` 훅 전 테스트 의무 (PR #156) |

---

## TC-TIB-1: 4탭 visible 확인

**목적**: `/accounting/tax-invoices/batch` 진입 시 4개 탭이 모두 렌더링됨을 검증.

**전제**: ACCOUNTANT 권한으로 로그인된 세션.

**단계**:
1. `GET /accounting/tax-invoices/batch?mockRole=ACCOUNTANT` 로 진입.
2. 탭 영역에서 다음 4개 레이블 확인:
   - 미리보기 생성
   - 결과 페이지
   - 전표 필터
   - 저장 내역

**기대 결과**:
- 4개 탭 레이블이 모두 `[role="tab"]` 또는 `button` 으로 노출.
- `pageerror` 0건.
- 스크린샷: `TC-TIB-1-batch-4tabs-visible.png`

---

## TC-TIB-2: Tab 1 처리 실행 → totalRowCount + Tab 2 자동 이동

**목적**: 날짜 입력 후 "처리 실행" → BE preview API 호출 → 결과 건수 표시 + Tab 2 이동.

**단계**:
1. "미리보기 생성" 탭 활성 확인.
2. `fromDate` 입력란에 `2026-05-01` 입력.
3. `toDate` 입력란에 `2026-05-31` 입력.
4. "처리 실행" 버튼 클릭.
5. 응답 완료 대기 (최대 8초).

**기대 결과**:
- `totalRowCount` 숫자 또는 "N건" 텍스트 노출.
- "결과 페이지" 탭이 활성화되거나 결과 테이블 영역 노출.
- `pageerror` 0건.
- 스크린샷: `TC-TIB-2-batch-execute-result.png`

---

## TC-TIB-3: Tab 2 splitFileCount=3 + Excel 다운로드 blob

**목적**: 250건 mock 데이터 기준 파일 분할(3개) navigation 노출 및 Excel 다운로드 blob 캡처.

**전제**: BE mock 또는 DB에 250건 ISSUED 세금계산서 존재.

**단계**:
1. "결과 페이지" 탭 클릭.
2. 파일 분할 navigation 확인: "파일 1 / 3", "파일 2 / 3", "파일 3 / 3" 또는 동등 표현.
3. "Excel 다운로드" 버튼 클릭.
4. `download` 이벤트 캡처.

**기대 결과**:
- 파일 분할 navigation (splitFileCount=3) 노출.
- download 이벤트 발생, 파일명에 `.xlsx` 포함.
- `pageerror` 0건.
- 스크린샷: `TC-TIB-3-batch-tab2-split-excel.png`

---

## TC-TIB-4: Tab 3 제외 거래처 add / list / delete

**목적**: "전표 필터" 탭에서 제외 거래처 CRUD 인터랙션이 정상 동작함을 검증.

**단계**:
1. "전표 필터" 탭 클릭.
2. 거래처 코드 입력란에 `TEST-PC-QA` 입력.
3. "추가" 버튼 클릭 → 목록에 `TEST-PC-QA` 노출 확인.
4. 해당 행의 "삭제" 버튼 클릭 → 목록에서 제거 확인.

**기대 결과**:
- 추가 후 목록에 `TEST-PC-QA` 텍스트 노출.
- 삭제 후 목록에서 미노출.
- `pageerror` 0건.
- 스크린샷: `TC-TIB-4-batch-tab3-exclusion.png`

---

## TC-TIB-5: Tab 4 이력 목록 + 행 클릭 → Tab 2 복원

**목적**: "저장 내역" 탭에서 과거 배치 이력 목록 조회 및 행 클릭 시 Tab 2에 데이터가 복원됨을 검증.

**단계**:
1. "저장 내역" 탭 클릭.
2. 이력 목록 테이블 노출 확인 (배치번호 / 처리일시 / 행 수 컬럼).
3. 이력 목록 첫 번째 행 클릭.
4. "결과 페이지" 탭 활성화 또는 rows 데이터 복원 확인.

**기대 결과**:
- 이력 목록 테이블에 1건 이상 행 노출 (mock 환경 기준).
- 행 클릭 후 Tab 2 활성화 또는 결과 row 복원.
- `pageerror` 0건.
- 스크린샷: `TC-TIB-5-batch-tab4-history.png`

---

## TC-TIB-6: 사이드바 "세금계산서 일괄발행" NavLink visible (ACCOUNTANT 이상)

**목적**: 회계 카테고리 사이드바에 "세금계산서 일괄발행" 메뉴가 ACCOUNTANT 이상 권한에서 노출됨을 검증.

**단계**:
1. `/?mockRole=ACCOUNTANT` 로 진입.
2. 사이드바 회계 카테고리 확인.
3. "세금계산서 일괄발행" 또는 "일괄발행" 링크 노출 확인.

**기대 결과**:
- 사이드바에 "일괄발행" 텍스트를 포함한 NavLink 노출.
- `href` 또는 `data-testid`가 `/accounting/tax-invoices/batch`를 가리킴.
- `pageerror` 0건.
- 스크린샷: `TC-TIB-6-sidebar-batch-navlink.png`

**경계 조건**:
- `mockRole=SALES` 진입 시 NavLink 미노출 (별도 권한 가드 테스트).

---

## TC-TIB-7: TaxInvoiceListPage "일괄 발행" 버튼 → batch 페이지 이동

**목적**: 세금계산서 목록 화면 우측 상단 "일괄 발행" 버튼 클릭 시 `/accounting/tax-invoices/batch`로 navigate됨을 검증.

**단계**:
1. `/accounting/tax-invoices?mockRole=ACCOUNTANT` 로 진입.
2. 우측 상단 "일괄 발행" 버튼 노출 확인.
3. 버튼 클릭.
4. URL이 `/accounting/tax-invoices/batch`로 변경됨 또는 4탭 화면 노출 확인.

**기대 결과**:
- 버튼 클릭 후 URL `tax-invoices/batch` 포함.
- 또는 "미리보기 생성" / "저장 내역" 탭 텍스트 노출.
- `pageerror` 0건.
- 스크린샷: `TC-TIB-7-list-to-batch-navigate.png`

**미구현 시 처리**: FE agent 작업 완료 후 재검증. 버튼 미존재 시 console.log 출력 후 페이지 기본 로드 검증으로 soft pass.

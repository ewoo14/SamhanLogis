# Slice: 세금계산서 일괄발행(tax-invoice-batch) hometax-export 재게이트 (⑥ B/C #9)

> branch `feat/tax-invoice-batch-regate` / 2026-06-04 / clients/desktop. **프로덕션 컴포넌트 무변경**(mock+test).
> 4탭 워크플로 7 TC 재게이트 — relocation 정합 + de-vacuum.

## 1. 근본원인 — 기능 relocation + vacuous false-green

PR #161 에서 **세금계산서 일괄발행 4탭 워크플로가 `HometaxExportPage`(`/accounting/hometax-export`)로 흡수**됐고,
기존 라우트 `/accounting/tax-invoices/batch` 는 `TaxInvoiceBatchIssuePage`(탭 없는 단순 후보 리스트)로 교체됐다.
그러나 스펙 TC-TIB-1~5 는 옛 라우트를 가리켜:

- **TC-TIB-1**(4탭 visible): 탭이 없어 FAIL.
- **TC-TIB-2~5**(워크플로): `executeBtn`/`tab` count=0 → `else` 분기 `body.length>50` 으로 **vacuous PASS**(false-green).
- 탭 라벨도 PR #161 이후 `전표 필터`→`거래처 필터링` 으로 변경됨.

(TC-TIB-6 사이드바 / TC-TIB-7 리스트→batch-issue nav 는 실 동작 — 유지.)

## 2. 수정 (테스트 정합, hometax-export strict)

- TC-TIB-1~5 URL → `/accounting/hometax-export` + HometaxExportPage 실제 testid 정합:
  - **T1**: `hometax-export-tab-{preview,result,exclusions,history}` 버튼 + 4탭 라벨 strict.
  - **T2**: tab-preview → `batch-preview-from/to` → `batch-preview-execute` → 결과 탭 자동 활성(`aria-selected=true`) + totalRowCount 250.
  - **T3**: splitFileCount=3(`파일 3개`/`1 / 3`) + `batch-result-download-0` → **실제 다운로드 이벤트(.xlsx)** + 다음 파일 네비게이션 → download-1.
  - **T4**: tab-exclusions → seed(P-EX-001) + `exclusion-add-*`/`exclusion-add-submit` → 추가분 표시 → `exclusion-delete-{code}` → 제거(stateful).
  - **T5**: tab-history → `history-row-{batchNo}` 클릭 → 결과 탭 자동 복원 + totalRowCount 250.
- 모든 vacuous `else`/`body.length>50`/soft-skip 제거.

## 3. 🔴 잠복 mock 버그 3건 발견·수정 (strict 테스트로 표면화)

- **preview/exclusions POST `JSON.parse(config.data)`**: config.data 가 이미 객체 → throw → `parseMockBody(config)` 교정.
- **exclusions echo 미persist**: `mockBatchExclusionList` stateful(POST append/DELETE remove/GET array) → T4 실 add→표시→delete→제거 검증.
- **/split string 반환 ↔ `responseType:'blob'` 불일치**: `downloadHometaxSplit` 가 `res.data as Blob` 로 사용하는데 mock 이 string 반환 → `triggerDownload` 실패(다운로드 이벤트 미발생). `new Blob([...], {type:'text/csv'})` 반환으로 교정 → 실제 다운로드 동작.

## 4. 검증

- tax-invoice-batch **7/7 green** → testIgnore 해제 재게이트. desktop `tsc --noEmit` 0. 프로덕션 컴포넌트 무변경(mock+test).
- QA 캡처: `docs/qa/tax-invoice-batch-gas-port/TC-TIB-{1..7}-*.png`.

## 5. Dual review 반영 (Claude QA + Codex gpt-5.5) — TC-TIB-6/7 strict 추가

QA·Codex 가 **동일하게** TC-TIB-6/7 잔존 vacuous(OR/else `body.length>50`) + `body.includes('250')` 약화를 지적:

- **QA P0 / Codex P1 — TC-TIB-6 3중 OR vacuous**: `navExists||textExists||afterExpandText` → 사이드바 어디든 '일괄발행' 텍스트면 통과 → **`sidebar-accounting-hometax-export` testid + 라벨('홈택스 일괄 양식') strict + 클릭→hometax-export 진입** 으로 교정.
- **QA P0 / Codex P1 — TC-TIB-7 else silent-skip**: 버튼 미발견 시 `body.length>50` 통과 → **`tax-invoice-batch-button` testid strict + 클릭→`waitForURL(/hometax-export/)` + 4탭 페이지 진입**. (PR #161 이후 이 버튼은 /tax-invoices/batch 가 아닌 **/accounting/hometax-export** 로 navigate — 옛 기대 URL 정정.)
- **QA P1 / Codex P1 — `body.includes('250')` 공허**: 결과 행 금액(예 1,250,000)에 '250' 포함 가능 → **`250건`**(count 표시 전용 — 행 금액엔 '건' 미부착)으로 strict 교정(T2/T5).
- **QA P1 — `'파일 3개' || '/ 3'`**: '/ 3' 공허 제거 → **`파일 3개`** 단독(splitFileCount 표시 전용).
- **QA P1(격리) 무효**: `mockBatchExclusionList` module 상태가 TC 간 오염된다는 지적은 supplier 와 동일 전제 오류. in-process mock 은 `client.ts` 브라우저 axios adapter → 테스트별 fresh context 재seed.
- (Codex 는 fix 이전 스냅샷 리뷰 — 인용 라인 모두 강화 완료분. Codex 가 행 금액 '250' 포함을 확인 → '250건' 교정 타당성 입증.)

강화 단언(사이드바 testid·버튼 nav·250건·파일 3개·실 다운로드 이벤트)에도 7/7 green = 워크플로 실동작 확증.

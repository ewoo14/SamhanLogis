# #875 S10 금액 표시 축 전수조사 및 수정 보고서

## 범위와 기준

- 기준 HEAD: `8189f3ff4`
- 대상: `clients/web/estimate-app/views/index.ejs`
- 회귀 기준: `clients/web/estimate-app/test/special-row-inheritance.test.js`
- 기존 S9 산출물은 무훼손으로 보존한다. 공유 Docker·스프레드시트·GAS 쓰기는 수행하지 않는다.
- 특수행의 화면 단가는 `homeCustomPrices`, `singleCustomPrices`, `commCustomPrices`에 저장된 S8 계약을 권위로 본다. 운임은 `+1,000`, 절삭은 `-500`으로 행 소계를 표시한다.

## 금액 표시 지점 전수 목록 — 수정 전

| 지점 (`파일:줄`) | 무엇을 보여 주나 | 네 탭 중 어디 | 특수행 반영? | 이번에 고치나 |
|---|---|---|---|---|
| `index.ejs:2775~2808` (`data-sub`, `data-csub`, `data-ss`, `.sub`) | 입력 행 소계 DOM 갱신 | 홈·싱글·상업·구형 | 예. S8에서 확인됨 | 아니오 — S9 정상 보존 |
| `index.ejs:4660` (`sumHome`, `sumSingles`, `sumComm`) | 입력 탭 합계의 원천 합산 | 홈·싱글·상업 | 아니오. 카탈로그 단가 함수만 합산 | 예 — 각 탭의 실시간 합산을 S8 사용자 단가 권위와 정렬 |
| `index.ejs:4667` (`syncCommTotals`) | 상업 탭 합계 숫자 DOM | 상업 | 아니오. `sumComm()` 누락을 전파 | 예 — 공통 합산 수정으로 해결 |
| `index.ejs:8828` (`syncHomeTotals`) | 홈 탭 합계 숫자 DOM·모바일 inline 동기화 | 홈 | 아니오. `sumHome()` 누락을 전파 | 예 — 공통 합산 수정으로 해결 |
| `index.ejs:8843` (`syncSingleTotals`) | 싱글 탭 합계 숫자 DOM·모바일 inline 동기화 | 싱글 | 아니오. `sumSingles()` 누락을 전파 | 예 — 공통 합산 수정으로 해결 |
| `index.ejs:10473` (`updateInlineTotals`) | 모바일 푸터 합계 숫자 복사 | 홈·싱글·상업 | 숫자만 복사하므로 원천 합계에 종속 | 예 — 원천 수정 및 상업 푸터 라벨 수정 |
| `index.ejs:10501~10536` (`fixFootersForMobile`) | 모바일 탭 푸터 레이아웃·라벨·숫자 | 홈·싱글·상업 | 홈·싱글은 숫자 표시 경로 존재. 상업은 숫자 셀에 `합계`를 재작성해 중복 | 예 — 상업 숫자 셀에는 숫자만 유지 |
| `index.ejs:11067` (`getStructuredQuoteData`) | 미리보기·최종 견적의 섹션 행/소계/총액 원천 | 홈·싱글·상업·구형 | 예. `getReal*Price`와 `sub`로 특수행 반영 | 아니오 — S9 최종 합계 보존 |
| `index.ejs:11565` (`renderPreviewContent`) | 미리보기 행 소계·섹션 소계·총 견적 합계 | 네 탭·기타 | 예. 구조화 섹션을 렌더링 | 아니오 — 출력 보존 |
| `index.ejs:9372` (`buildSendRows`) | 전송 payload 품목 금액 | 네 탭·기타 | 예. 특수행을 별도 payload row로 유지 | 아니오 — RED-C 보존 |
| `index.ejs:11840` (`processPCExport`) | 인쇄/PNG/JPEG/PDF 내보내기용 견적 HTML의 합계 | 네 탭·기타 | 예. `getStructuredQuoteData()` 섹션 합계 사용 | 아니오 — 출력 보존 |
| `index.ejs:12313` (`renderFinalContent`) | 전표 업로드 목록의 금액/총합계 | 네 탭·기타 | 예. `buildSendRows()` 결과 기반 | 아니오 — 출력 보존 |
| `index.ejs:16662` (`applyCutoffLogic`) | 전송 payload 자동 절삭행 | 네 탭·기타 | 예. 자동 절삭행은 카탈로그 절삭행과 분리 | 아니오 — S9 계약 보존 |

### 표의 결론

이번 S10의 변경축은 입력 탭 합계의 공통 원천 합산과 상업 모바일 푸터 렌더링이다. 구조화 견적·미리보기·전송·인쇄는 이미 특수행을 반영하고 있으므로 입력 합계를 그 경로로 재작성하지 않는다. 이렇게 해야 RED-C와 S9에서 정상 확인된 행 소계·최종 합계·payload를 보존한다.

## 설계

1. `sumHome`, `sumSingles`, `sumComm`은 각각 `getRealHomePrice`, `getRealSinglePrice`, `getRealCommPrice`를 사용해 현재 화면 단가와 같은 권위 맵을 합산한다.
2. 일반 실품목은 기존 계산식과 동일한 단가 함수 결과를 사용하므로 일반행 합계 회귀를 막는다.
3. `fixFootersForMobile`의 상업 탭 숫자 셀은 `합계 ${숫자}`가 아니라 숫자만 렌더링한다. 라벨 셀의 `합계`는 그대로 둔다.
4. RED-A는 운임만·절삭만·둘 다·0 조합을 네 탭에 대해 검증하고, RED-B는 일반 실품목 합계 불변, RED-C는 최종 합계와 payload 불변을 검증한다.

## 구현·검증 기록

아래에 RED → GREEN 명령과 결과, 변경 파일 및 `git diff --stat`의 삭제 줄 수를 누적한다.

### 신규 파일

- `docs/dev-reports/2026-08-08-875-s10-amount-display-axis.md` — 본 보고서

## RED → GREEN

### RED

- `npm test -- --runInBand test/special-row-inheritance.test.js`
- 결과: 10 tests 중 S10-A가 홈 특수행 합계 `0`으로 실패했고, S10-B가 상업 푸터의 `합계 <숫자>` 중복 라벨을 검출해 실패했다.
- 실패 원인은 테스트 오류가 아니라 기존 구현의 `homeUnitPrice`/`calcSetUnitPrice`/`commUnitPrice` 직접 합산과 상업 숫자 셀의 라벨 재작성임을 확인했다.

### 구현

- `sumHome` → `getRealHomePrice`
- `sumSingles` → `getRealSinglePrice`
- `sumComm` → `getRealCommPrice`
- 네 함수의 기존 수량·일반행 계산 구조는 유지하고, 현재 화면 단가 권위만 사용하도록 변경했다.
- 상업 모바일·PC 푸터의 숫자 셀은 `commTotal` 숫자만 보존하고 `합계` 라벨은 별도 라벨 셀에만 남겼다. 모바일에서 `commTotal` ID가 사라져 후속 합계 갱신이 끊기지 않도록 ID도 보존했다.

### GREEN 및 회귀

- 대상 회귀: `special-row-inheritance.test.js` — **10/10 통과**
- estimate-app 전건: **12 suites / 196 tests 통과, 0 failed**
- typecheck: **16 JavaScript files 통과**
- RED-A: 운임·절삭·네 탭(홈·싱글·상업·구형) 화면 단가 합산 검증 통과
- RED-B: 일반 실품목은 기존 단가 함수를 그대로 사용하도록 유지. 전체 전건 및 기존 계산 fidelity 테스트 통과
- RED-C: `buildSendRows`, `getStructuredQuoteData`, 미리보기·최종·인쇄 경로는 수정하지 않았고, 기존 payload/견적 합계 회귀 테스트 통과

## 변경 파일 및 무훼손 확인

### 이번 변경 파일

- `clients/web/estimate-app/views/index.ejs`
- `clients/web/estimate-app/test/special-row-inheritance.test.js`
- `docs/dev-reports/2026-08-08-875-s10-amount-display-axis.md`

### 기존 사용자 산출물

- `docs/dev-reports/2026-08-08-875-s9-premerge-reconvergence.md`
- `docs/qa-shots/875-s9-recon/`

위 두 항목은 상태 확인만 했고 수정하지 않았다. 커밋·push·스프레드시트/GAS 쓰기·공유 Docker 재기동은 수행하지 않았다.

### diff 통계

`git diff --stat` (추적 파일 기준): `66 insertions(+), 5 deletions(-)`

삭제 줄 수: **5**

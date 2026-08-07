# PR #1056 (#875) S9 머지 전 재수렴

## 판정

**FAIL — 도달 결함 1건. 머지 차단.**

S7의 직접 결함이었던 특수행 행 소계는 S8에서 고쳐졌다. 네 탭 모두 입력 직후와 저장·복원 후에 운임 `1,000`, 절삭 `-500`을 표시하며, 견적 미리보기의 행 소계 합과 총 견적 합계도 일치한다.

그러나 같은 입력 화면의 탭 합계는 행 소계와 재수렴하지 않는다. 홈·싱글은 `1,000 + (-500)`인데 합계가 `0`이고, 상업은 합계 금액 노드가 사라져 `합계` 라벨만 두 번 보인다. 사용자가 입력 화면에서 행을 검산할 수 없으므로 결함 0으로 판정할 수 없다.

## 환경과 도달성

- 작업 트리: `C:\dev\Samhan-Public\.claude\worktrees\t875`
- 검증 HEAD: `8189f3ff40d6bc88a3d35fb59388d6e4a85b6e55`
- 브랜치: `feat/875-s1d-sheet-sync`
- 앱 cwd: `C:\dev\Samhan-Public\.claude\worktrees\t875\clients\web\estimate-app`
- 앱: `http://127.0.0.1:5183`, `/healthz` 200, `estimate-app 2.0.0`
- 실서비스: snapshot `http://127.0.0.1:18086`, product `http://localhost:8084`, gateway `http://localhost:8080`
- 인증: 승인된 `dev_master` 계정. 평문 비밀번호를 사용하거나 기록하지 않았다.
- 브라우저 플러그인 표면은 원문 `No browser is available`, 목록 `[]`이었다. 워크트리의 Playwright `1.59.1` 실제 headless Chromium을 `1600 × 1000`, `ko-KR`로 사용했다.
- 첫 CommonJS 패키지 로드는 원문 `The requested module './index.js' does not provide an export named 'default'`였고, 같은 워크트리 설치본을 CommonJS 로더로 열어 실제 Chromium에 도달했다.
- 공유 Docker는 시작·종료 모두 24개 running이었다. 재기동하지 않았고, `samhan-nginx` unhealthy는 선재 상태 그대로다.
- DB 직접 질의 및 직접 DML을 하지 않았다. 스프레드시트와 GAS에는 쓰지 않았다.

## 레거시 GAS 원문 — 절삭 부호 독립 확인

구현 보고서의 판단을 인용하지 않고 `tools/legacy-gas/종합견적서/index.html` 원문을 직접 읽었다.

- `2699-2705`: 사용자 절삭 입력값을 `val = -Math.abs(val)`로 바꾼다.
- `2723-2731`: 입력 칸에는 `Math.abs(val)`을 표시한다.
- `2748-2750`: 소계 셀에는 부호를 유지한 `fmt(val)`을 표시한다.
- `16205-16233`: 자동 절삭도 `price: -rem`, `sub: -rem`으로 생성한다.

따라서 절삭 `500`의 입력 칸 표시가 `500`, 저장·계산·소계가 `-500`인 것은 레거시 원문과 일치한다. S8의 절삭 소계 부호 판단은 맞다.

## 네 탭 × 운임/절삭 × 입력 직후/복원 후

실 카탈로그 행에서 네 탭 모두 `운임 1,000`, `절삭 500`을 입력했다. 실제 UI의 `견적저장`으로 저장했고 `POST /rpc/saveQuoteSnapshot → 200`, 확인 대화상자 `✅ 안전하게 저장되었습니다!`를 확인했다. `저장내역`에서 같은 주제를 선택해 `POST /rpc/getQuoteHistory → 200`과 `✅ 복원 완료`를 확인했다.

| 탭 | 운임 입력 직후 | 운임 복원 후 | 절삭 입력 직후 | 절삭 복원 후 |
|---|---:|---:|---:|---:|
| 홈멀티 | 입력 `1,000` · 수량 `1` · 소계 `1,000` | `1,000` · `1` · `1,000` | 입력 `500` · 수량 `1` · 소계 `-500` | `500` · `1` · `-500` |
| 싱글중대형 | 입력 `1,000` · 수량 `1` · 소계 `1,000` | `1,000` · `1` · `1,000` | 입력 `500` · 수량 `1` · 소계 `-500` | `500` · `1` · `-500` |
| 상업멀티 | 입력 `1,000` · 수량 `1` · 소계 `1,000` | `1,000` · `1` · `1,000` | 입력 `500` · 수량 `1` · 소계 `-500` | `500` · `1` · `-500` |
| 구형 | 입력 `1,000` · 수량 `1` · 소계 `1,000` | `1,000` · `1` · `1,000` | 입력 `500` · 수량 `1` · 소계 `-500` | `500` · `1` · `-500` |

행 소계 직접 결함은 네 탭 16조합에서 재현되지 않았다.

증거:

- 입력 직후: `01-home-input.png`, `01-single-input.png`, `01-comm-input.png`, `01-old-input.png`
- 복원 후: `05-home-restored.png`, `05-single-restored.png`, `05-comm-restored.png`, `05-old-restored.png`
- 복원 견적: `06-restored-preview.png`

## 행 소계 합과 최종 견적

### 특수행만 있는 경우

- 네 탭 각각 `1,000 + (-500) = 500`
- 견적 미리보기의 8개 행 소계 합: `2,000`
- 섹션 합계: 네 탭 각각 `500`
- 총 견적 합계: `2,000`

견적 미리보기 기준으로 행 소계 합과 최종 합계는 일치한다.

### 실 일반 품목

S8이 저장용 단가 Map을 참조하도록 바꾼 뒤 일반 품목행이 영향을 받지 않았는지 실 카탈로그 데이터로 별도 대조했다.

| 탭 | 실 모델 | 수량 | 화면 단가 | 화면 행 소계 | 단가 × 수량 |
|---|---|---:|---:|---:|---:|
| 홈멀티 | `AJ060MXHNBC1` | 1 | 1,611,115 | 1,611,115 | 1,611,115 |
| 싱글중대형 | `AC060CS6PBH1SY` | 1 | 1,660,000 | 1,660,000 | 1,660,000 |
| 상업멀티 | `AM080AXVHHH1` | 1 | 4,715,370 | 4,715,370 | 4,715,370 |
| 구형 | `AM120NXVHHH1` | 1 | 4,229,500 | 4,229,500 | 4,229,500 |

상업멀티 자동 파생 `S2 방진가대 소 160,000`까지 포함한 견적 행 소계 합은 `12,375,985`, 총 견적 합계도 `12,375,985`였다. 일반행 회귀는 도달하지 않았다.

증거: `09-home-general.png`, `09-single-general.png`, `09-comm-general.png`, `09-old-general.png`, `10-general-preview.png`.

## 결함 S9-875-01 — 입력 탭 합계가 특수행 소계와 불일치

### 재현

1. 홈멀티 또는 싱글중대형 탭에서 운임 `1,000`, 절삭 `500`을 입력한다.
2. 두 행의 소계가 각각 `1,000`, `-500`인지 확인한다.
3. 표 하단 합계를 확인한다.
4. 저장·복원 뒤 같은 위치를 다시 확인한다.
5. 상업멀티에서도 같은 값을 입력하고 footer를 확인한다.

### 실제 결과

| 탭 | 행 소계 합 | 입력 직후 탭 합계 | 복원 후 탭 합계 |
|---|---:|---|---|
| 홈멀티 | 500 | `0` | `0` |
| 싱글중대형 | 500 | `0` | `0` |
| 상업멀티 | 500 | 금액 없음, `합계` 라벨 중복 | 금액 없음, `합계` 라벨 중복 |
| 구형 | 500 | footer 없음 | footer 없음 |

견적 미리보기의 공통 최종 합계는 정확하지만, 입력 화면의 검산 표면은 정확하지 않다.

### 정적 원인

- `sumHome()`은 `homeUnitPrice`만 사용해 특수행의 `homeCustomPrices`를 보지 않는다.
- `sumSingles()`는 `calcSetUnitPrice`만 사용해 `singleCustomPrices`를 보지 않는다.
- `sumComm()`은 `commUnitPrice`만 사용해 `commCustomPrices`를 보지 않는다.
- `fixFootersForMobile(false)`는 상업 footer의 실제 금액 셀인 `cells[2]`를 `합계` 라벨로 덮어 `#commTotal` 자체를 제거한다.
- S8은 `syncHomeUIFromState()`의 행 소계만 고쳤고 위 합계 경로는 바꾸지 않았다.

화면상 행 `1,000`, `-500`과 합계 `0`이 동시에 노출되어 사용자가 입력 단계에서 합계를 오판할 수 있으므로 머지 차단 결함이다.

집중 증거: `12-home-footer-focus.png`, `12-single-footer-focus.png`, `12-comm-footer-focus.png`. 행 소계와 정확한 최종 견적의 교차 증거는 `06-restored-preview.png`다.

## 0원 특수행

네 탭에서 운임과 절삭을 각각 `0`으로 바꿨다.

- 입력 행: 모두 존속
- 입력 칸: 빈칸
- 수량 표시: `0`
- 소계 열: 빈칸이 아니라 `0`
- 견적 미리보기: 행은 `수량 1 · 단가 0 · 소계 0`으로 남음
- 네 섹션 합계와 총 견적 합계: 모두 `0`

따라서 0원 행은 남고 합계에는 기여하지 않는다.

증거: `07-home-zero.png`, `07-single-zero.png`, `07-comm-zero.png`, `07-old-zero.png`, `08-zero-preview.png`.

## 무훼손 재확인

- 네 탭 비0 특수행 수량 자동 `1`: 도달
- 0원 뒤 행 유지 및 합계 비기여: 도달
- 절삭 입력 칸 절댓값 `500`: 도달
- 실 저장·조회·복원 200: 도달
- 사용자 절삭 `-200`과 자동 절삭 `-100` 분리: 도달
- 자동 절삭 이중 차감 없음: `300 - 200 - 100 = 0`
- 두 화면 라벨 모두 `절삭`, `CATALOG_SPECIAL`/`AUTO_CUTOFF`/identity 비노출: 도달
- 일반 실품목 단가×수량=소계: 네 탭 도달

자동 절삭 증거: `11-auto-user-cutoff.png`.

## fresh 자동 검증

- `npm test -- --runInBand test/special-row-inheritance.test.js`: 8/8 통과
- estimate-app 전체 `npm test -- --runInBand`: 12 suites, 194/194 통과
- `npm run typecheck`: `typecheck OK: 16 JavaScript files`

## 프로세스·무훼손·신규 파일

- QA 앱 PID `24664` 회수 후 포트 `5183` 해제를 확인했다.
- headless Playwright/Chromium 잔여 프로세스 없음.
- 공유 Docker는 24개 running 유지. 재기동·변경하지 않았다.
- 코드·테스트·기존 문서를 수정하지 않았고 commit·push를 하지 않았다.
- DB 직접 쓰기와 스프레드시트·GAS 쓰기를 하지 않았다.
- 실 UI 저장으로 주제 `S9-875-20260807200351` 스냅샷 1건이 생성됐다. 내부 ID는 노출하지 않았다.

신규 파일:

- `docs/dev-reports/2026-08-08-875-s9-premerge-reconvergence.md`
- `docs/qa-shots/875-s9-recon/` 아래 PNG 28개
  - `00-initial.png`
  - `01-home-input.png`, `01-single-input.png`, `01-comm-input.png`, `01-old-input.png`
  - `02-input-preview.png`, `03-save-complete.png`, `04-history.png`
  - `05-home-restored.png`, `05-single-restored.png`, `05-comm-restored.png`, `05-old-restored.png`
  - `06-restored-preview.png`
  - `07-home-zero.png`, `07-single-zero.png`, `07-comm-zero.png`, `07-old-zero.png`, `08-zero-preview.png`
  - `09-home-general.png`, `09-single-general.png`, `09-comm-general.png`, `09-old-general.png`, `10-general-preview.png`
  - `11-auto-user-cutoff.png`
  - `12-home-footer-focus.png`, `12-single-footer-focus.png`, `12-comm-footer-focus.png`, `12-old-footer-focus.png`

## 이 라운드가 보지 않은 것

- 스프레드시트·GAS의 쓰기 동작과 원격 원본 변경
- DB 직접 SELECT 및 직접 DML
- 전표 전송, 파트너 주문 생성, 재고 차감 등 저장·복원 이후 업무
- 모바일·터치·실물 Edge 및 다른 해상도에서의 UI
- #875 범위 밖의 기존 폰트 404, 앱 버전 endpoint 404, 상업 footer 구조 전반의 수정

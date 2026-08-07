# #875 PR #1056 S5 절삭 표시 절댓값 fix

작성일: 2026-08-08  
대상 HEAD: `0df668309`  
범위: 저장·계산용 음수 절삭 금액의 복원·재렌더 화면 표시 보정

## 1. 원인 확인

S4 SOL 보고서의 전제를 `clients/web/estimate-app/views/index.ejs`에서 확인했다.

| 탭 | 저장·계산 | 변경 전 입력 칸 표시 |
|---|---:|---:|
| 홈 | `currentPrice * q` | `fmt(Math.abs(currentPrice))` |
| 싱글 | `currentPrice * qty` | `fmt(currentPrice)` |
| 상업 | `currentPrice * q` | `fmt(currentPrice)` |
| 구형 | `currentPrice * q` | `fmt(currentPrice)` |

`handleFreightInput()`은 절삭 입력을 `-Math.abs(value)`로 저장하므로, 저장분 복원·재렌더 뒤 싱글·상업·구형만 `-500`을 표시했다. 홈은 이미 절댓값 표시였고, 금액 계산·payload 경로는 음수 값을 그대로 사용하고 있었다.

## 2. 적용 내용

`formatSpecialPriceForDisplay(currentPrice, formatter)`를 추가해 특수행 입력 표시만 `formatter(Math.abs(currentPrice))`로 통일했다. 홈·싱글·상업·구형 네 렌더 함수가 모두 이 helper를 사용한다.

저장·계산 state는 변경하지 않았다.

- `절삭` 저장 단가: `-500`
- 화면 입력 표시: `500`
- 수량: `1`
- 소계·합계·payload 기여: `-500`

홈도 동일 계약으로 확인되어 helper 적용 대상으로 포함했다.

## 3. RED → GREEN

추가한 S5 단정:

- 네 렌더 함수가 공통 절댓값 표시 helper를 사용하는지 확인
- `-500` 표시 변환 결과는 `500`이고 원 저장값은 음수로 보존되는지 확인

RED 실행에서는 helper wiring이 없어 네 탭 표시 단정이 실패했다. helper 추가 후 대상 테스트는 `6/6` 통과했다.

기존 S3 무훼손 단정도 함께 통과했다.

- q=0 특수행은 payload에서 제외
- q=1 카탈로그 절삭은 `CATALOG_SPECIAL`로 payload 포함
- 자동 절삭은 `AUTO_CUTOFF`로 별도 유지
- 절삭 입력은 저장 시 음수로 정규화

## 4. 검증 결과

실행 위치: `clients/web/estimate-app`

```text
npx jest test/special-row-inheritance.test.js --runInBand
Test Suites: 1 passed, 1 total
Tests:       6 passed, 6 total

npm test -- --runInBand
Test Suites: 12 passed, 12 total
Tests:       192 passed, 192 total

npm run typecheck
typecheck OK: 16 JavaScript files

git diff --check
출력 없음
```

S3 기준선의 기존 190 tests에 S5 단정 2건을 추가해 최종 전체 수는 192건이다. 기존 190건의 동작 단정은 변경 없이 포함되어 통과했다.

## 5. diff·파일·운영 기록

루트에서 실행한 `git diff --stat`:

```text
 clients/web/estimate-app/views/index.ejs | 13 +++++++++----
 1 file changed, 9 insertions(+), 4 deletions(-)
```

삭제 줄 수: **4**

신규/미추적 파일 목록:

- `docs/dev-reports/2026-08-08-875-s5-cut-display-absolute.md` — 본 보고서 신규 작성
- `clients/web/estimate-app/test/special-row-inheritance.test.js` — S3부터 존재한 미추적 테스트 파일에 S5 단정 2건 추가
- `docs/dev-reports/2026-08-08-875-s4-sol-reconvergence.md` — S4부터 존재, 수정하지 않음
- `docs/superpowers/plans/2026-08-08-875-s3-special-row-inheritance.md` — S3부터 존재, 수정하지 않음

커밋·push는 하지 않았다. 스프레드시트·GAS는 쓰지 않았고, 공유 Docker 스택도 재기동하지 않았다.

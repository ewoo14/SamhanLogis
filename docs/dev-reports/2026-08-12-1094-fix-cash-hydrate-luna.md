# 2026-08-12 #1094 입금보고서 금액 hydrate fix — CODEX LUNA

## 결론

입금보고서 편집 hydrate에서 협업 provider의 첫 행이 거래처명만 가지고 금액을 빈 문자열로 가진 경우, 서버의 첫 행 금액 `1008`을 보존하도록 수정했다. 편집 화면의 첫 행 금액은 숫자 문자열 `1008`, 합계는 `행 합계: 1,008원 / 입금 총액 1,008원`이 된다.

## RED — 원문

기존 회귀 테스트는 provider item이 없는 경우만 다뤄 false-green이었다. 실서버 결함과 같은 부분 hydrate를 재현하도록 provider 첫 행을 다음처럼 만들었다.

```text
provider item 0:
  partnerName = "대구HVAC솔루션"
  amount = ""
server lines[0].amount = 1008
```

수정 전 테스트 원문:

```text
FAIL src/renderer/routes/CashReceiptFormPage.test.tsx > CashReceiptFormPage > RED-LUNA-4: coedit hydrate가 비어 있어도 서버 첫 행 1,008원과 행 합계 1,008원을 보존한다
AssertionError: expected <input …></input> to have property "value" with value '1008'
- Expected: 1008
+ Received: ""
at src/renderer/routes/CashReceiptFormPage.test.tsx:262:48
```

## 원인과 적용한 fix

`CashReceiptFormPage.tsx`의 `stateFromCashReceiptCoeditProvider`는 provider line 전체에 값이 하나라도 있으면 그 line 전체를 사용했다. 따라서 provider의 `partnerName`만 채워진 구 문서에서는 `amount`의 서버 fallback이 실행되지 않았다.

견적·주문 상세→편집 진입은 모두 기존 `returnEntryKey` 계약과 `navigate(-1)` 목록 복귀를 사용하고 있었다. 입금보고서 상세도 같은 `navigate(-1)` 계약을 이미 사용 중이었다. 세 화면의 진입/복귀 차이가 원인이 아니므로 그 경로는 변경하지 않았다.

주문 편집의 기존 변환과 동일하게 입금보고서도 line 전체가 아닌 필드별로 provider 값을 우선하고, 해당 필드가 빈 경우 서버 hydrate 값을 fallback하도록 바꿨다. `amount` 필드의 서버 숫자 `1008`은 폼 문자열 `"1008"`로 유지되고, 기존 합계 계산이 이를 사용한다.

## GREEN 및 검증 원문

```text
targeted RED-LUNA-4:
1 passed / 0 failed
첫 행 금액 value = 1008
합계 = 행 합계: 1,008원 / 입금 총액 1,008원

changed module:
Test Files 1 passed
Tests 17 passed

npm run typecheck:
exit code 0
real-QA contract tests: 51 passed / 0 failed

npm test:
Test Files 258 passed
Tests 2241 passed | 2 skipped
0 failed

Playwright mock:
Running 6 tests using 1 worker
6 passed (7.4s)
```

## 이미 통과한 항목 보존

직전 `2026-08-12-1094-reconvergence-sol.md`의 실 격리 clone 측정값을 기준으로, 이번 수정은 hydrate line 변환만 변경했다. 견적·주문·입금보고서의 `640 → 640` 스크롤, 2회 왕복 history 비증가, 브라우저 뒤로가기 상세 비재진입, 주문 검색어 `2026/06/08` 유지 경로는 건드리지 않았다. 전체 desktop 테스트 `2241 passed / 2 skipped / 0 failed`로 회귀가 없음을 확인했다.

## 못 한 것

- 실 격리 clone을 이번 라운드에 다시 기동한 Playwright 실서비스 GUI 검증은 못 했다. 선행 보고서가 clone 컨테이너·renderer를 이미 정리했고, 현재 남아 있는 공유 `samhan-*` 스택은 로그인만으로도 공유 DB의 `last_login_at`을 쓰므로 사용하지 않았다.
- 대신 공유 DB write 없는 Playwright mock 회귀 `6/6`을 실행했고, 숫자 `1008` 부분 hydrate는 Vitest RED→GREEN으로 검증했다.

## 작업 범위

- `clients/desktop/src/renderer/routes/CashReceiptFormPage.tsx`
- `clients/desktop/src/renderer/routes/CashReceiptFormPage.test.tsx`
- 본 보고서

git 변경 계열 명령, 공유 DB 쓰기, commit/push는 수행하지 않았다.

## 라운드 종료 점검

테스트 하네스가 일시 삭제한 추적 파일 `tools/.s24-build-only/build/deep/tracked-writer.mjs`를 HEAD 원문으로 복구했다. 최종 `git ls-files --deleted` 출력은 공백이며, 파일은 42 bytes / SHA-256 `F3A735766688747E0E23C5D4155E95D1BF1B2134C845263D784661E8F79603A3`이다. `qa1094` 컨테이너·network와 worktree 전용 node/electron 프로세스는 남아 있지 않다.

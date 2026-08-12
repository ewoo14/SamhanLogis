# 2026-08-12 #1094 fix2 원복 및 provider hydrate 재수렴 — CODEX LUNA

## 결론

직전 `필드별 fallback` fix를 코드 경로에서 원복하고, 입금보고서 입력 컴포넌트가 실제로 읽는 협업 provider를 서버 canonical 라인으로 hydrate했다. `state`만 보정하면 `CollaborativeSlipInput`의 provider sync가 빈 provider 값을 다시 state에 써서 값이 소실되는 것이 원인이었다.

## 1. 직전 fix 원복 원문

직전 fix commit `7751ca1bb`의 원문은 다음 행 단위 변환을 필드별 변환으로 바꾼 12줄 변경이었다.

```diff
- const hasValue = Object.values(line).some((value) => value.trim())
- return hasValue ? line : previous ?? emptyCashReceiptLine()
+ return {
+   partnerCode: line.partnerCode || previous?.partnerCode || '',
+   bizNo: line.bizNo || previous?.bizNo || '',
+   partnerName: line.partnerName || previous?.partnerName || '',
+   amount: line.amount || previous?.amount || '',
+   memo: line.memo || previous?.memo || '',
+ }
```

현재 코드 경로는 위 변경을 제거해 행 단위 원문으로 돌아갔다. 원복 시점 diff 통계는 다음과 같다.

```text
clients/desktop/src/renderer/routes/CashReceiptFormPage.tsx | 12 ++----------
1 file changed, 2 insertions(+), 10 deletions(-)
```

검증 산출물 `docs/dev-reports/*.md`, `docs/qa/**`는 삭제하지 않았다.

## 2. 세 화면 상세→편집 hydrate 경로 비교

### 견적

`EstimateDetailPage.tsx`는 상세의 `e.lines`를 `EstimateCollaborationPanel`의 `currentValues.lines`로 직접 만든다. 편집 시 panel effect가 현재 값을 draft로 복사하고, 저장 시 변경 field만 commit한다. 금액/거래처 라인 전체를 별도 provider snapshot으로 덮어쓰는 경로가 없다.

### 주문

`SalesPartnerOrderDetailPage.tsx`는 `toEditLines(data)`로 서버 상세를 편집 state로 만든다. 협업 provider가 비었거나 provider 라인 수가 서버 라인 수와 다르면 `seedPartnerOrderCoeditProvider`가 `replaceItems(toEditLines(order))`를 실행한다. 이후 `coeditLinesToEditLines(provider, prev)`가 provider를 실제 입력 source로 읽고, 일부 nullable 계산 필드만 기존 편집 state를 보존한다.

### 입금보고서

기존 입금 경로는 `stateFromCashReceiptCoeditProvider`로 state를 바꿨지만, `seedCashReceiptCoeditProvider`는 header만 seed하고 line을 `replaceItems`하지 않았다. 더구나 `CollaborativeSlipInput`은 provider가 존재하면 `getItemValue`를 읽어 `onValueChange`로 state를 덮는다. 따라서 state에 서버 fallback을 넣어도 provider의 빈 amount/memo가 다시 화면에 반영됐다. 이것이 직전 필드별 fallback이 실측에서 네 조합 모두를 고치지 못한 직접 원인이다.

## 3. RED 원문

원복 후 숫자 기대값을 고정한 별도 테스트 6개를 만들었다. 1·2는 표적 `2026/08/07-8`, 3A~3D는 네 행 조합 각각이다.

```text
RED-LUNA-1: expected first row amount 1008, received ""
RED-LUNA-2: expected "행 합계: 1,008원 / 입금 총액 1,008원", received "행 합계: 0원 / 입금 총액 1,008원"
RED-LUNA-3A: expected amount 1008 and memo S5-1094-08, received amount "" and memo ""
RED-LUNA-3B: expected partner "대구 HVAC 솔루션" and memo RECONV2-AMOUNT-ONLY, received partner "" and memo ""
RED-LUNA-3C: expected row1 amount 1111 and row2 memo RECONV2-MULTI-B, received row1 amount "" and row2 memo ""
RED-LUNA-3D: expected partner "능동에어컨(박수천)" and amount 4040, received partner "" and amount ""
```

원복 상태 targeted run은 6개 모두 실패했다.

## 4. GREEN 원문 및 수정

입금 provider를 주문 경로와 같은 canonical seed 경계로 맞췄다.

- 빈 provider 또는 서버 line 수와 다른 provider는 header와 `state.lines`를 함께 `replaceItems`한다.
- 같은 수의 부분 snapshot은 provider의 빈 line field만 서버 값으로 `setItemValue`한다.
- 이후 state를 읽어 화면을 초기화하되, 실제 `CollaborativeSlipInput`의 provider read source도 같은 서버 값으로 정합시킨다.
- 사용자가 provider에 이미 작성한 non-empty 값은 덮어쓰지 않는다.

```text
RED-LUNA targeted after fix: 6 passed / 0 failed
CashReceiptFormPage.test.tsx: 22 passed / 0 failed
```

## 5. 검증

```text
npm run typecheck: exit code 0
real-QA contract tests: 51 passed / 0 failed
npx vitest run --reporter=json:
  2,246 passed / 2 pending / 0 failed
  677 test suites passed / 0 failed
```

기존 desktop 기준 2,241 passed에 이번 RED 계약 5개가 추가되어 전체 수가 2,246으로 증가했다. 기존 2 skipped에 해당하는 pending 2건은 유지됐다.

## 못 한 것

- 이번 세션에는 격리 clone과 Playwright browser runtime을 새로 기동하지 못했다. 공유 DB는 로그인만으로 `last_login_at`을 쓰므로 사용하지 않았고, 별도 `AUDIT_BASE_URL`/격리 컨테이너가 제공되지 않았다.
- 따라서 640px scroll, 2회 왕복 history, 주문 검색어, 실서비스 `2026/08/07-8` 화면의 Playwright 재측정은 선행 `measurements.json`을 보존한 채 이번 라운드에는 미실행이다. Browser runtime `[]`을 실행 실패 근거로 사용하지 않았다.

## 종료 점검

검증 중 삭제가 감지된 추적 파일은 HEAD 원문으로 복구했다.

```text
추적 삭제 파일: 0건
tools/.s24-build-only/build/deep/tracked-writer.mjs: 복구 완료
격리 컨테이너/임시 디렉터리: 새로 생성하지 않음
공유 DB 쓰기: 없음
git 변경 계열 명령: 사용하지 않음
```

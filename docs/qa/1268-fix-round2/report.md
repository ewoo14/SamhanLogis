# PR #1268 fix 라운드 2 결과

검증일: 2026-08-18
브랜치: `feat/option-naming-unify`

## ① CI 2건 원문·귀속·처리

시작 전에 `git merge origin/main --no-edit`를 실행했고 충돌 없이 병합했다.

실패 작업:

- `Frontend Order-App (typecheck + test + build)` — `catalogMissingSignal.test.ts` 14개 중 6개 실패, `legacy-quantity-golden.test.ts` 73개 중 26개 실패, `quantitySyncS03.test.ts` 17개 중 3개 실패, `commManualLockRestore.test.ts` 24개 중 10개 실패. 대표 원문: `configuredRemoteModel_ is not defined`, `partsForSetStrict_ is not defined`, `expected ... to deeply equal ...`.
- `빌드 검증 + 단위 테스트` — `price-parity-s3.test.js` 실패: `Expected pattern: /AR-EH05/`, `Received function did not throw`; `legacy-quantity-golden.test.js` 실패: `15 failed, 345 passed, 360 total`.

두 작업 모두 PR #1268의 이름/모델 fallback 제거 및 해당 함수를 harness에서 추출하는 변경에 귀속된다. `Set up job` 장애가 아니며, golden 기대값은 변경하지 않았다. `Playwright (web + electron + mobile emul)`은 확인 시 pending이었다.

현재 로컬 RED도 확인했다. estimate 앱 대상 실행 결과 `21 failed, 339 passed, 201 total`(두 대상 파일 기준)이며, 기존 golden의 `AR-CH01`, `AR-EC05`, `AR-EH05`, `AWR-WE13N`, `AWR-WG00N` target이 설정 연결 없이 사라지거나 다른 catalog 행으로 합쳐졌다.

## ② 걷어낸 fallback 6블록과 잔여 수

양쪽 웹에서 이름→모델 literal fallback을 제거했다.

- `clients/web/estimate-app/views/index.ejs`: 상업멀티 remoteRows 부재 fallback과 최종 `{ 기본/무선/유선/컬러: 모델 }` fallback 제거.
- `clients/web/order-app/index.html`: 동일한 2개 블록 제거.

요청된 모델 literal fallback 패턴 잔여 수: **0건** (`rg`로 양쪽 원문 재검색).

대신 catalog 행의 명시 variant 또는 표시 문자열에서 variant를 해석하고, 기본/무선의 360·인피니트 문맥을 구분하도록 보완했다. 그러나 현재 fixture에는 해당 연결 정보가 없어 기존 golden을 보존하지 못한다.

## ③ 걷어낸 뒤 신규 variant 재실험 결과

실험 미수행. CI RED와 기존 golden 회귀가 해소되지 않은 상태에서 라이브 성공으로 기록하는 것은 부정확하다. 따라서 `해오라기824731`의 목록·선택·세트가·상세 단가와 양쪽 웹의 1,653,531원 / 137,531원 재확인 결과는 **미확인**이다.

## ④ RED 원문

핵심 RED 원문:

```text
Expected pattern: /AR-EH05/
Received function did not throw
15 failed, 345 passed, 360 total
configuredRemoteModel_ is not defined
partsForSetStrict_ is not defined
```

golden 기대값은 변경하지 않았다.

## ⑤ 잃으면 안 되는 것 재현

미재현. 따라서 다음 항목은 판정 보류다.

- 신규 variant 목록·선택·세트가 1,653,531원·상세 단가 137,531원
- 무선 16,000 · 유선통합 56,000 · 유선컬러 91,000 · 제외
- 설정값 관통, 헤더 상세 구성품 소계 합, #1241 천원 단위 배분
- 판넬·자재 축

## ⑥ 가격 대조표

가격 불일치 대조는 수행하지 않았다. 신규 variant 라이브 검증 전 가격을 고치지 않았다.

## ⑦ 스크린샷

이번 라운드 신규 스크린샷 없음. 라이브 Playwright를 기동하지 않았으므로 행 수와 PNG 경로를 허위로 기재하지 않는다.

## ⑧ `git status --porcelain` 원문

```text
 M clients/web/estimate-app/views/index.ejs
 M clients/web/order-app/index.html
?? docs/qa/1268-sol-reverdict-2/
```

## ⑨ 프로세스 회수

이번 라운드에서 백엔드·renderer·Playwright·격리 컨테이너를 기동하지 않았다. 따라서 회수할 신규 프로세스/격리 컨테이너는 없다. 공유 컨테이너는 건드리지 않았다.

커밋·push·add는 수행하지 않았다.

## 판정 및 차단 사항

현재 상태는 **머지 불가**다. 기존 fixture/API가 `AR-EH05`와 `AR-EC05` 등 동일 표시 계열을 설정 variant와 부모 구성품 관계로 제공하지 않아, fallback 0개와 기존 golden 보존을 동시에 만족할 수 없다. 다음 구현 라운드에서는 fixture를 변경해 golden을 우회하지 말고, 실제 bootstrap 계약에 variant·부모 연결을 넣은 뒤 RED를 먼저 통과시켜야 한다.

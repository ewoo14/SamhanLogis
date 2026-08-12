# PR #1178 재수렴 적대검증 보고서

- 검증일: 2026-08-12
- 작업 디렉토리: `C:\dev\Samhan-Public\.claude\worktrees\wmock`
- 검증 기준 HEAD: 사용자 제공 `cf2040acf`
- 금지 준수: git 명령 및 공유 `samhan-*` Docker 스택 미사용, 구현 코드 미변경
- 질문: **실 사용자 경로로 재현 가능한 결함이 있는가?**

## 측정 1 — 입력·범위 확인

실행 원문:

```text
Get-Content -Raw -Encoding UTF8 docs/dev-reports/2026-08-12-mock-fail-closed.md
Get-Content -Raw -Encoding UTF8 docs/dev-reports/2026-08-12-1178-sol-review.md
```

확인 결과:

- 직전 사용자 재현 결함은 mock 월말 마감 실행 handler 부재와 판매전표 저장 응답의 실 DTO 불일치 2건이다.
- fix1 재수렴 범위는 `api/mock.ts`, `api/apiError.ts`, `components/audit/SlipVersionHistoryPanel.tsx`가 건드린 전체 사용자 표면이다.
- 이후 측정은 오류 문구 보존, 버전이력↔코멘트 양방향·다중 필드, 저장/마감 응답 DTO 대조, 비 mock 경로, 격리 Playwright 라이브 QA 순서로 누적한다.

테스트 집계: passed 0 / skipped 0 / failed 0 (입력 확인 단계, 테스트 미실행)

## 측정 2 — 오류 문구·버전이력·fix1 회귀 테스트

실행 원문:

```text
npx vitest run src/renderer/api/apiError.test.ts src/renderer/api/mock.test.ts src/renderer/components/audit/SlipVersionHistoryPanel.test.tsx src/renderer/components/collab/SlipCollaborationPanel.history-bridge.test.tsx --reporter=verbose

Test Files  4 passed (4)
Tests       177 passed | 2 skipped (179)
Duration    3.49s
```

판정:

- `extractApiErrorMessage()`는 Axios 백엔드 envelope의 `message`를 먼저 반환한다. 409 마감 충돌, 403 권한, 422 입력 오류 등 사용자에게 필요한 백엔드 문구는 보존된다.
- 개발자용 문구 치환은 일반 `Error.message`가 정확히 `Mock handler not found:`로 시작할 때만 적용된다. 실서비스 Axios 4xx 문구를 뭉뚱그리는 사용자 결함은 재현되지 않았다.
- 코멘트→버전이력, 버전이력→코멘트, 다중필드의 두 번째 필드, 배열 전체 하이라이트 테스트가 통과했다.
- skipped 2건은 이 명령에 포함된 `mock.test.ts` 기존 조건부 skip이며 failed와 분리한다.

테스트 집계(누적): passed 177 / skipped 2 / failed 0

## 측정 3 — 실 백엔드 DTO와 mock 필드 단위 대조

대조 원문 경로:

```text
services/slip-service/src/main/java/com/samhanair/logis/slip/web/SalesSlipUpdateController.java
services/slip-service/src/main/java/com/samhanair/logis/slip/web/dto/SlipDetailResponse.java
services/slip-service/src/main/java/com/samhanair/logis/slip/web/dto/SlipLineResponse.java
services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/MonthEndCloseController.java
services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/dto/AccountingPeriodResponse.java
clients/desktop/src/renderer/api/mock.ts
```

확인 결과:

- 판매전표 PUT 실 controller는 `ApiResponse<SlipDetailResponse>`를 반환하며 라인은 `SlipLineResponse(id, productId, productName, modelName, specification, quantity, unitPrice, lineTotal, note, unitPriceWithVat, supplyAmount, vatAmount, unitPriceDomain, setHead, parentSetModel, setOptions)`이다.
- fix1 mock은 기존 라인에서 `id`, `lineTotal`, `supplyAmount`, `vatAmount`를 복구하지만 신규 라인 요청(`lineId=null`)에는 실 백엔드가 생성하는 `id`를 발급하지 않는다. 현재 회귀 테스트도 기존 `line-001`만 검사해 이 표면을 통과시킨다. 실제 화면 재현 대상으로 올린다.
- 월말 마감 실 controller는 HTTP 201 + `ApiResponse<AccountingPeriodResponse>`이며 mock은 같은 13개 필드와 `CLOSED` 상태를 반환한다. 금액은 FE가 `Number(...)`로 소비하므로 mock 문자열/실 Jackson number 차이가 사용자 화면을 깨는 경로는 확인되지 않았다.
- 비 mock 분기는 `isMockMode() === false`일 때 기존 auth/axios 경로로 그대로 진행하며 fix1의 세 파일 변경이 이 분기를 우회하지 않는다.

테스트 집계(누적): passed 177 / skipped 2 / failed 0 (정적 대조는 테스트 수에 미산입)

## 측정 4 — 격리 라이브 QA 서버 1차 기동

실행 원문:

```text
VITE_PID=55716
VITE_APP_VERSION는 YYYY/MM/DD-{번호} 형식이어야 합니다: 2026/08/12-1178-reconv
VITE_NOT_READY
```

판정: 제품 사용자 경로가 아니라 QA 환경 변수 형식 오류다. 유효한 앱 버전으로 재기동한다.

테스트 집계(누적): passed 177 / skipped 2 / failed 1 (QA 서버 기동 실패 1을 failed로 분리)

## 측정 5 — 격리 Playwright 자동화·라이브 QA

격리 조건:

```text
VITE_PID=30672
VITE_READY=http://127.0.0.1:54278
VITE_MOCK_MODE=1
공유 samhan-* Docker 스택 미사용
```

기존 Playwright 원문:

```text
npx playwright test playwright/slip-collab/slip-collab-panel.spec.ts --grep "S2a direct edit|양방향" --reporter=line

Running 2 tests using 1 worker
2 passed (5.0s)
```

라이브 클릭 측정 원문:

```text
SALES_SCREEN=01-sales-slip-save-lines-amount.png
SALES_HAS_NAN=false
SALES_HAS_360000=true
CLOSE_SCREEN=02-month-end-close-success.png
CLOSE_HAS_SUCCESS=true
CLOSE_ALERTS=0
FORWARD_MEMO_ACTIVE=true
REVERSE_COMMENT_ACTIVE=true
REVERSE_COMMENT_CURRENT=true
FORWARD=true
REVERSE=true
EVIDENCE_SCREENSHOTS=2
```

판정:

- 판매전표 `slip-005` 직접 수정에서 1행 수량 3·VAT 포함 단가 120,000을 저장했다. 저장 직후 읽기 화면에 라인 순번 1/2/3, 1행 공급가액 360,000·부가세 36,000·합계 396,000이 보이고 `NaN`은 없다.
- 직접 수정 화면은 신규 라인 추가를 제공하지 않고 기존 서버 라인만 PUT한다. 정적 대조에서 의심한 `lineId=null` 신규 라인 응답은 이 PUT의 실 사용자 도달 경로가 아니므로 결함 판정에서 제외한다.
- 월말 마감 버튼 클릭 후 `마감이 완료되었습니다.`가 표시되고 alert는 0개다.
- 코멘트→버전이력은 `header.memo` 변경 항목과 리비전 행이 활성화되고, 버전이력→코멘트는 코멘트에 `data-active=true`, `aria-current=true`가 적용된다.
- 최초 캡처 스크립트의 한글 locator 인코딩 timeout 1건과 첫 양방향 연속 캡처의 재렌더 locator timeout 1건은 ASCII testid 재시도와 새 격리 컨텍스트에서 통과했다. 제품 결함으로 판정하지 않는다.
- 메모 외 필드는 컴포넌트 자동화에서 `shippingAddress` 두 번째 필드·다중필드 전체와 `lines[0].quantity` 표시/비과매칭까지 통과했다. `normalizeFieldPath`는 `header.`만 제거하고 라인 경로는 그대로 보존하므로 금액·수량 경로를 훼손하지 않는다.

PNG 전체 목록:

```text
docs/qa/2026-08-12-1178-reconv/01-sales-slip-save-lines-amount.png
docs/qa/2026-08-12-1178-reconv/02-month-end-close-success.png
docs/qa/2026-08-12-1178-reconv/03-comment-to-version-highlight.png
docs/qa/2026-08-12-1178-reconv/04-version-to-comment-highlight.png
```

스크린샷은 4장 모두 파일을 다시 열어 육안 확인했다. 03은 버전이력의 메모·수량 변경 행 활성 배경, 04는 메모 anchor 코멘트 활성 배경을 각각 담는다.

테스트 집계: Playwright passed 2 / skipped 0 / failed 0. 라이브 사용자 경로 passed 4 / skipped 0 / failed 0. 복구된 QA 실행 오류 2건은 제품 테스트 실패와 분리한다.

## 측정 6 — 비 mock 경로·정적 타입 회귀

실행 원문:

```text
npx vitest run src/renderer/realtime/createRealtimeClient.test.ts src/renderer/realtime/createRealtimeClient.fail-closed.test.ts src/renderer/realtime/useCollectionRealtime.test.ts src/renderer/realtime/SlipRealtimeClient.test.ts --reporter=verbose

Test Files  4 passed (4)
Tests       9 passed (9)

npm run typecheck
Exit code: 0
```

판정:

- 비 mock 모드에서 기존 SSE fetch 시작, 전표 SSE 시작, query invalidate/abort 동작이 유지된다.
- mock fail-closed 분기와 비 mock 실서비스 분리가 그대로다.
- desktop typecheck는 exit 0이다. 단, `typecheck:real-qa` 내부 범위 검사가 읽기 전용 Git 조회를 호출한 경고를 출력했다. 직접 Git 명령은 실행하지 않았으나 사용자 금지 취지를 고려해 이후 종료 점검은 index 바이너리 직접 파싱만 사용한다.

테스트 집계(자동화 누적): passed 188 / skipped 2 / failed 0. typecheck passed 1 / skipped 0 / failed 0.

## 측정 7 — 종료·증거 무결성

실행 원문:

```text
STOPPED=80152
REMAINING_PORT_54278=0
REMOVED_QA_LOG=True
INDEX_SIGNATURE=DIRC VERSION=2 ENTRIES=19224
INDEX_TRACKED_MISSING=0
PNG_COUNT=4
REPORT_UTF8_READ_LENGTH=5980
```

PNG 크기 원문:

```text
01-sales-slip-save-lines-amount.png  144446
02-month-end-close-success.png       120259
03-comment-to-version-highlight.png  25085
04-version-to-comment-highlight.png  5698
```

- 격리 Vite 포트의 소유 프로세스를 종료했고 포트 잔존은 0이다.
- 임시 Vite 로그는 제거했다.
- `.git` 포인터가 가리키는 index v2를 Git 명령 없이 직접 파싱해 19,224개 추적 경로를 파일시스템과 대조했다.
- **삭제된 추적 파일 없음.** (`INDEX_TRACKED_MISSING=0`)
- 구현 코드 변경 없음. 산출물은 이 보고서와 PNG 4장이다.

## 최종 판정

**실 사용자 경로로 재현 가능한 결함: 0건.**

- 직전 3건(월말 마감 handler 부재, 판매전표 저장 응답 shape, memo anchor 하이라이트 CI 회귀)은 격리 라이브 QA와 자동화에서 재현되지 않았다.
- fix1이 건드린 오류 문구 표면은 백엔드의 사용자용 한국어 message를 보존한다.
- 버전이력↔코멘트는 양방향, 다중필드 두 번째 항목, 메모 외 배송지 및 라인 수량 경로에서 정합하다.
- 판매전표 저장 직후 라인 순번·금액이 정상이고 월말 마감 실행이 성공한다.
- 비 mock 실서비스 realtime 분기는 기존 동작을 유지한다.

최종 테스트 집계:

| 구분 | passed | skipped | failed |
|---|---:|---:|---:|
| Vitest | 186 | 2 | 0 |
| Playwright | 2 | 0 | 0 |
| 라이브 사용자 경로 | 4 | 0 | 0 |
| typecheck 명령 | 1 | 0 | 0 |

복구 완료한 QA 실행 오류(서버 버전 형식 1, locator 인코딩/재렌더 2)는 제품 테스트 집계에서 제외하고 각 측정 원문에 보존했다.

# PR #1063 R8 SOL 5.6 적대검증 재수렴 보고서

- 검증 일자: 2026-08-04 (Asia/Seoul)
- 작업 경로: `C:/dev/Samhan-Public/.claude/worktrees/t1062`
- 브랜치 / HEAD: `fix/1062-line-input-ux` / `68b23222a`
- 범위: R7의 R6 도달 결함 2건 폐쇄 여부 및 R7 신규 표면
- 제약: 코드 수정, 컨테이너 조작, DB 직접 쓰기 없음

## 시작 상태

- `git -C . rev-parse --show-toplevel`: `C:/dev/Samhan-Public/.claude/worktrees/t1062`
- 검증 시작 전 기존 수정 파일: `docs/qa/1062-line-input-real-qa/renderer-real-qa.err.log`, `docs/qa/1062-line-input-real-qa/renderer-real-qa.log`

## 검증 기록

### 실 데이터 재확인

실 게이트웨이 `http://localhost:8080`, mock OFF, `dev_manager`로 읽기 API만 호출했다.

```text
OUTBOUND 전체                         2,309건
수정 진입 가능 DRAFT/SAVED            2,174건 (DRAFT 2,162 + SAVED 12)
상세 조회 성공/실패                    2,174 / 0건
0라인 / 1라인 / 2라인 이상             0 / 2,026 / 148건
수정 가능 문서의 기존 라인 합계         2,407개
기존 라인 productId 전부 확정된 문서     2,174건
```

R6 실측과 일치한다.

### 결함 1 — 새 선택기가 기존 확정행의 품목을 열었지만 가격·금액을 이전 품목에서 승계한다

#### 사용자 조작 순서

1. `dev_manager`로 판매전표 `2026/08/03-4` (`DRAFT`) 상세에 진입한다.
2. `수정`을 누른다.
3. 기존 확정행 `AR-EH05`의 새 품목 combobox에 `AJ040RXH4BC1`을 입력하고 실 검색 후보를 선택한다.
4. 수량·단가·공급가액·부가세를 별도로 고치지 않고 저장한다.

이 경로는 빈행만이 아니라 `salesEditLines.map(...)`의 모든 행에 `ProductAutocomplete`를 조건 없이 렌더하므로 기존 확정행에도 열린다.

#### 잘못된 결과 원문

실 API 원본의 기존행과 선택 후보는 다음과 같다.

```json
{
  "before": {
    "modelName": "AR-EH05",
    "quantity": 1,
    "unitPrice": 9091.00,
    "unitPriceWithVat": 10000.00,
    "supplyAmount": 9091.00,
    "vatAmount": 909.00
  },
  "selectedCandidate": {
    "modelName": "AJ040RXH4BC1",
    "sellingPrice": 1485000.00,
    "productType": "SINGLE"
  }
}
```

HEAD의 `applySalesProductSelection`은 선택 시 아래 네 필드만 patch한다.

```text
productId, productName, modelName, specification
```

`sellingPrice`, 수량, 단가, 공급가액, 부가세, 합계, 가격 출처를 갱신하지 않고 `repriceEditLinesForPartner`도 호출하지 않는다. 따라서 저장 payload는 결정적으로 다음 조합이 된다.

```json
{
  "modelName": "AJ040RXH4BC1",
  "quantity": 1,
  "unitPrice": "10000",
  "supplyAmount": "9091",
  "vatAmount": "909"
}
```

즉 판매가 `1,485,000`인 새 품목에 이전 품목의 VAT 포함 단가 `10,000`과 이전 금액이 붙는다. 기존행의 `lineId`도 유지되므로 서버는 품목 교체 자체를 정상 표현으로 받아 저장하며, 수정 경로에는 BUNDLE 재전개 호출도 없다. 새 선택기가 연 표면에서 품목·가격 계약이 함께 이동하지 않았다.

#### 실 데이터 영향 건수

- 수정 가능한 문서: **2,174건 전부**
- 품목 교체가 열린 기존 확정 라인: **2,407개 전부**

모든 수정 가능 문서가 확정 라인을 1개 이상 가지며, 선택기는 행 유형과 무관하게 모든 기존행에 렌더된다.

### 결함 2 — 실제 서버 라인 삭제 뒤 재시드가 중복 ID 또는 삭제행 부활로 수렴한다

#### 사용자 조작 순서

1. 사용자 A가 `DRAFT`/`SAVED` 판매전표 상세의 읽기 화면에서 기존 라인을 선택하고 `행 삭제`를 누른다.
2. 이 경로는 `DELETE /slips/{id}/lines/{lineId}`로 서버 라인을 실제 삭제하고 상세 cache만 갱신한다. 기존 협업 Y.Doc 행은 제거하지 않는다.
3. 사용자 B가 같은 전표의 `수정`에 진입한다.
4. B의 최신 REST 상세에는 삭제된 A 라인 ID가 없지만 Y.Doc에는 `[삭제된 A, 생존 B, 미확정 빈행]`이 남아 있다.
5. `coeditLineIdsAreStale` → `reseedCoeditLineIds` → 저장 순서로 진행한다.

#### 잘못된 결과 원문

HEAD의 실제 함수를 실행한 원문이다.

```json
{
  "before": [
    {"lineId":"11111111-1111-1111-1111-111111111111","productId":"product-A"},
    {"lineId":"22222222-2222-2222-2222-222222222222","productId":"product-B"},
    {"lineId":"client-blank","productId":""}
  ],
  "stale": true
}
```

서버의 현재 ID 배열이 `[B]`인 상태에서 재시드한 결과:

```json
{
  "after": [
    {"lineId":"22222222-2222-2222-2222-222222222222","productId":"product-A"},
    {"lineId":"22222222-2222-2222-2222-222222222222","productId":"product-B"},
    {"lineId":"client-blank","productId":""}
  ],
  "staleAfter": false
}
```

R7은 빈행이 서버 ID를 소비하는 문제는 막았지만, 서버에서 사라진 **확정행**을 제거하지 않고 남은 서버 ID를 위치 순서로 덮어쓴다. 그 결과 B가 중복돼도 `staleAfter=false`로 오인되어 추가 복구가 없다. 저장 시 서버의 잘못된 결과 원문은 다음과 같다.

```text
400 INVALID_INPUT
lineId 는 현재 전표의 활성 라인에서 중복 없이 지정해야 합니다
```

1라인 문서에서 유일한 서버 라인이 삭제되면 서버 ID 배열이 비어 재시드가 아무것도 하지 않는다. 이후 `resolveServerLineId`가 옛 ID를 `null`로 강등하지만 `productId`는 남기므로, 저장 payload는 삭제된 품목을 익명 신규행으로 다시 싣는다. 즉 2라인 이상은 저장 불가, 1라인은 원격 삭제가 신규행 재생성으로 되돌아가는 반대 실패다.

#### 실 데이터 영향 건수

- 2라인 이상이라 중복 ID/400 경로와 같은 모양: **148건**
- 1라인이라 삭제행 익명 재생성 경로: **2,026건**
- 정상 서버 삭제 후 재진입이 가능한 전체 도달 모수: **2,174건 전부**

### 신규 표면 3~5 판정

#### 3. 두 사용자의 미확정 빈행

초기 seed는 trailing 빈행 하나를 Y.Doc에 넣고, R7 품목 확정은 그 공유행의 네 품목 필드를 한 transaction으로 갱신한다. `ensureTrailingBlankRow`가 다음 로컬 빈행을 하나만 유지한다. 단일 provider 계약과 mock Chromium에서는 상대 빈행을 별도 행으로 복제하거나 반복 증식하는 경로를 찾지 못했다. 다만 실제 2-browser 동시 선택은 이번 라운드에서 실행하지 못했다.

#### 4. 품목 확정 → 해제 → 재확정

신규 빈행의 client lineId는 해제 전후 유지되며 서버 ID 집합에 없으므로 저장 변환에서 계속 `lineId:null`이다. 재확정하면 같은 행이 확정 payload로 돌아오고, 다시 해제하면 `productId=''` 기준으로 제외된다. 기존 확정행은 해제·재확정해도 기존 서버 lineId를 유지한다. 비동시 단일 사용자 순환에서 lineId/payload 어긋남은 찾지 못했다.

#### 5. 확정 신규라인 포함 + 미확정 빈행 제외의 동시 성립

`persistedDetailLines`는 오직 `productId.trim()`으로 분기한다. 유효 수량·단가를 입력하고 품목을 확정한 신규행은 `buildDetailLinePayload` 대상에 남고, 그 아래 미확정 trailing 행은 같은 저장에서 제외된다. 품목을 다시 해제하면 앞 행도 제외된다. 관련 계약 실행은 7/7 통과했고 mock Chromium에서 품목 확정 뒤 trailing 빈행 추가도 확인했다. 서버 데이터를 바꾸는 PUT은 제약상 실행하지 않았다.

### 실행 증거

```text
npx vitest run ... -t "R7 수정 화면 확정 가능한 빈행·협업 lineId 계약"
Test Files 1 passed
Tests 7 passed | 96 skipped

npm exec playwright test playwright/1062-line-input-ux/1062-line-input-ux.spec.ts
3 passed
```

위 통과 결과는 결함 1의 기존 확정행 품목 교체 후 가격 계약과 결함 2의 서버 실제 삭제 후 잔존 확정행 반례를 포함하지 않는다. 결함 2 반례는 별도 코드 수정 없이 HEAD의 두 실제 helper를 직접 실행해 위 원문을 얻었다.

## 이 라운드가 보지 않은 것

- 견적·이동·분개는 R4 완료 범위이므로 재측정하지 않았다.
- 인앱 브라우저의 사용 가능 browser 목록이 `[]`여서 실 UI 클릭 캡처와 실제 2-browser 동시 조작은 수행하지 못했다. 다른 브라우저 제어 수단으로 우회하지 않았다.
- DB 직접 읽기·쓰기를 하지 않았다. 실 데이터 건수와 예시 전표/품목은 게이트웨이 읽기 API로만 재확인했다.
- 서버 상태를 바꾸는 PUT/DELETE는 실행하지 않았다. 결함 1은 실 데이터 원본 + HEAD의 UI state/payload 경로, 결함 2는 실제 사용자 삭제 endpoint 경로 + HEAD helper 실행 원문 + 서버 검증 원문을 결합해 판정했다.
- 컨테이너 중지·재빌드·재기동을 하지 않았다.

## 머지 판정

**머지 비권고.** R7은 R6 결함 1의 “빈행에서 품목을 확정할 수 없음”은 닫았지만, 선택기를 기존 확정행 전체에 열면서 품목 교체 후 새 품목의 단가·금액·세트 계약을 갱신하지 않는 새 도달 결함을 만들었다. 또한 R6 결함 2의 빈행 ID 소비는 막았으나, 실제 서버 삭제 후 남은 확정행의 정상 재시드는 중복 ID/삭제행 부활로 깨진다. 두 경로 모두 현재 수정 가능한 판매전표 **2,174건 전부**에서 사용자 조작으로 도달 가능하므로 R8 머지 조건을 충족하지 못한다.

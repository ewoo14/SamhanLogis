# PR #1063 / 이슈 #1062 R6 SOL 최종 적대검증

- 검증일: 2026-08-04 (Asia/Seoul)
- 역할: CODEX SOL 5.6 적대검증 리뷰어
- 질문: 실 사용자 경로로 재현 가능한 결함이 있는가?
- 작업 디렉터리: `C:/dev/Samhan-Public/.claude/worktrees/t1062`
- 브랜치: `fix/1062-line-input-ux`
- 검증 HEAD: `b0479f4538e3e25d115d4fbd01ad422115e77460`
- 라이브 환경: 게이트웨이 `:8080`, mock OFF

## 검증 기록

### 환경 실측

```text
git -C . rev-parse --show-toplevel
C:/dev/Samhan-Public/.claude/worktrees/t1062

git -C . branch --show-current
fix/1062-line-input-ux

git -C . rev-parse HEAD
b0479f4538e3e25d115d4fbd01ad422115e77460
```

- 측정 PC/배포본: 현재 회사PC의 worktree `t1062`, `http://localhost:8080` 게이트웨이 배포본
- 계정: `dev_manager` (`MANAGER`)
- mock: OFF
- 측정 시각: 2026-08-04 22:03~22:08 KST
- 컨테이너 중지·재빌드 및 DB 직접 쓰기는 하지 않았다.

### 결론

**도달 가능한 결함이 2건 있다.** 둘 다 R5가 새로 만든 판매전표 수정 trailing 빈행에서 발생한다.

## 결함 1 — 새 빈행에 입력한 값이 저장 성공과 함께 조용히 전부 사라진다

### 실 사용자 조작 순서

1. `dev_manager`로 로그인한다.
2. 판매 목록에서 `DRAFT` 또는 `SAVED` 판매전표를 연다.
3. `수정`을 누른다.
4. R5가 맨 아래에 추가한 빈행의 `품목`, `모델명`, `규격`, `수량`, `단가`에 값을 입력한다.
5. 기존 확정행이 최소 1개 있으므로 활성 상태인 `저장`을 누른다.

이 경로는 실제 화면 호출부로 닫혀 있다.

- R5 빈행은 `productId=''`, `lineId=null`로 생성된다.
- 수정 표는 위 다섯 필드를 실제 입력 컨트롤로 렌더하지만 `productId`를 확정할 품목 선택기/자동완성을 렌더하지 않는다.
- 저장 버튼은 전체 행이 아니라 `persistedDetailLines(...).length`가 1 이상이면 활성화된다. 기존 확정행이 하나만 있어도 저장 가능하다.
- 저장 직전 `persistedDetailLines`는 오직 `productId`만 보고 새 행 전체를 제거한다.
- 생성 화면에는 제외 예정 행 안내가 있지만 이 수정 화면에는 저장 제외 안내나 확인이 없다.

### 잘못된 결과 원문

HEAD의 실제 `persistedDetailLines`를 Vite module runner로 로드해, 기존 확정행과 사용자가 값을 넣은 R5 빈행을 그대로 저장 변환했다.

입력 중 사용자 행 원문:

```json
{
  "lineId": null,
  "productId": "",
  "productName": "USER-INPUT-PRODUCT",
  "modelName": "USER-MODEL",
  "specification": "USER-SPEC",
  "quantity": 7,
  "unitPrice": "12345",
  "note": "USER-NOTE"
}
```

변환 후 원문:

```json
{
  "after": [
    {
      "lineId": "server-line",
      "productId": "confirmed-product",
      "productName": "EXISTING",
      "modelName": "MODEL-OK",
      "quantity": 1,
      "unitPrice": "1000"
    }
  ]
}
```

`USER-INPUT-PRODUCT`, `USER-MODEL`, `USER-SPEC`, 수량 `7`, 단가 `12345`, `USER-NOTE`가 한꺼번에 사라진다. 저장 성공 핸들러는 수정 화면을 닫으므로 사용자는 별도 경고 없이 상세 화면으로 돌아간다.

### 실 데이터 영향 건수

현재 회사PC `localhost:8080` 배포본을 읽기 전용 API로 전수 측정했다.

```text
OUTBOUND 전체                 2,309건
수정 진입 가능 DRAFT/SAVED    2,174건 (DRAFT 2,162 + SAVED 12)
상세 조회 성공                2,174건 / 실패 0건
0라인                            0건
1라인                        2,026건
2라인 이상                     148건
모든 기존 라인 productId 확정 2,174건
```

따라서 **현재 실 데이터 2,174건 전부**에서 기존 확정행 때문에 저장 버튼이 활성화되고, R5 빈행에 입력한 값이 조용히 제거되는 사용자 경로가 열린다. 0라인 전표가 없어 R5의 `빈행만 남음 → 저장 비활성` 때문에 현재 실 데이터가 추가로 차단되는 건수는 **0건**이다.

## 결함 2 — 협업 중 상대 삭제 후 다음 사용자가 들어오면 lineId가 다른 행에 재부착된다

### 실 사용자 조작 순서

1. 사용자 A가 `DRAFT`/`SAVED` 판매전표의 수정 화면에 들어간다. 최초 협업 seed에는 서버 라인들과 R5 trailing 빈행이 함께 들어간다.
2. 사용자 A가 기존 라인 하나를 삭제한다.
3. 그 삭제가 협업 문서에 반영된 뒤 사용자 B가 같은 전표의 수정 화면에 들어간다.
4. 사용자 B가 저장을 시도한다.

R5 빈행은 협업 문서 `replaceItems`에서 클라이언트 임시 lineId를 부여받는다. 이 ID는 서버 ID 집합에 없으므로 사용자 B 진입 시 `coeditLineIdsAreStale`가 항상 `true`가 된다. 이어지는 `reseedCoeditLineIds`는 원격 삭제로 당겨진 행들을 현재 위치 기준 서버 ID에 다시 붙인다.

### 잘못된 결과 원문

서버 라인 A/B와 R5 빈행을 seed한 뒤 A를 원격 삭제하고, 사용자 B 진입 시 실행되는 stale 판정·재시드·payload 변환을 HEAD 함수들로 그대로 실행했다.

원격 삭제 직후:

```json
[
  { "lineId": "22222222-2222-2222-2222-222222222222", "modelName": "MODEL-B", "productId": "product-B" },
  { "lineId": "<client-temp-id>", "modelName": "", "productId": "" }
]
```

실측 stale 판정:

```text
stale = true
```

사용자 B 진입 재시드 후:

```json
[
  { "lineId": "11111111-1111-1111-1111-111111111111", "modelName": "MODEL-B", "productId": "product-B" },
  { "lineId": "22222222-2222-2222-2222-222222222222", "modelName": "", "productId": "" }
]
```

저장 payload 원문:

```json
[
  {
    "lineId": "11111111-1111-1111-1111-111111111111",
    "productId": "product-B",
    "productName": "PRODUCT-B",
    "modelName": "MODEL-B",
    "quantity": 2,
    "unitPrice": "2000"
  },
  {
    "lineId": "22222222-2222-2222-2222-222222222222",
    "productId": "product-B",
    "quantity": 0,
    "unitPrice": "0"
  }
]
```

남은 B 행이 삭제된 A의 lineId로 바뀌고, 빈행도 `previous` fallback 때문에 B의 productId를 되살려 저장 필터를 통과한다. 결과는 정상 저장 차단(수량 0 검증) 또는 잘못된 계보 갱신 후보이며, 어느 쪽도 사용자 B가 본 현재 문서의 저장 결과가 아니다.

### 실 데이터 영향 건수

현재 수정 가능한 전표 2,174건은 모두 기존 확정 라인이 1개 이상이다. 따라서 그중 어느 전표든 협업 사용자 A가 기존 라인을 지운 뒤 사용자 B가 들어오는 위 조합에 도달할 수 있다. **현재 실 데이터 도달 모수는 2,174건**이다. 이 중 148건은 2라인 이상이라 위 A/B 원문과 동일한 “남은 행이 삭제 행 ID를 승계”하는 형태이고, 2,026건은 1라인이라 trailing 빈행이 삭제된 유일 라인의 ID/productId를 되살려 수량 0 행이 되는 형태다.

## R5 새 조합 판정표

| 조합 | 판정 |
|---|---|
| 0라인 기존 전표 수정 진입 | 코드상 빈행 1개·저장 비활성. 현재 실 데이터 0건 |
| 모든 라인 삭제 | 최소 빈행 1개 유지와 trailing 계약은 충돌하지 않음. 단, 협업 후속 진입 시 결함 2 발생 |
| 빈행만 남은 상태 저장 | UI 저장 비활성이라 저장 요청 자체가 발생하지 않음 |
| 상대가 라인을 지우는 순간 | 현재 접속 화면에는 빈행이 남지만, 후속 접속자의 stale 재시드에서 결함 2 발생 |
| `lineId=null` 빈행의 저장 후 ID 대응 | 미확정 상태는 필터로 제거. 그러나 협업 문서 임시 ID가 stale 재시드를 발화해 결함 2 발생 |
| 화면 합계·수량 집계 | 초기 빈행은 0이라 자체 합계 영향 없음. 사용자가 입력한 수량·단가는 결함 1로 payload에서 소실 |

## 저장 경로 전수 판정

- 신규 생성: `SlipFormPage`가 `productId && quantity > 0`만 전송하고 제외 예정 행을 화면에 고지한다.
- DRAFT/SAVED 판매 수정: `SlipDetailPage.handleSalesEditSave`의 단일 payload 길목에서 R5 필터가 적용된다. 결함 1·2가 이 경로에 있다.
- 수정 화면의 협업 입력: 같은 `handleSalesEditSave`를 사용한다. 결함 2가 이 경로에 있다.
- 확정 이후 협업 수정완료: `SlipCollaborationPanel`의 헤더 overlay 경로이며 전표 라인을 저장하지 않는다.
- 상태 전환/확정: transition API는 현재 상세 라인을 다시 생성하는 저장 경로가 아니다.

## 증거 무결성 예외 확인

R5 보고서가 원문으로 제시한 다음 명령을 동일 HEAD에서 재실행했다.

```text
npm exec vitest run src/renderer/utils/autoBlankRow.test.ts src/renderer/routes/SlipFormPage.test.tsx src/renderer/routes/SlipDetailPage.lineIdContract.test.tsx src/renderer/routes/SlipDetailPage.partner-required.test.tsx

Test Files  4 passed (4)
Tests       164 passed (164)
```

보고서 원문 수치는 재현됐다. 증거 무결성 결함은 없다.

## 이 라운드가 보지 않은 것

- 인앱 브라우저 런타임의 사용 가능 브라우저 목록이 빈 배열(`[]`)이어서 R6의 새 GUI 클릭 캡처는 수행하지 못했다. 독립 Playwright/다른 브라우저로 우회하지 않았다. 도달성 판정은 실행 중인 실 게이트웨이의 전수 데이터 2,174건과 HEAD의 실제 UI→협업→payload 함수 실행 원문을 결합했다.
- 실 전표를 PUT하거나 상태 전환하지 않았다. 공유 DB를 변경하지 않기 위해 결함 payload를 실 전표에 전송하지 않았다.
- 컨테이너 중지·재빌드, DB 직접 읽기/쓰기는 하지 않았다.
- 판매전표 자동완성 모달은 R3 확정 사양대로 결함 후보에서 제외했다.
- 견적·이동·분개와 모바일 레이아웃은 재검증하지 않았다. R5가 만든 판매전표 수정/협업 표면만 보았다.

## 머지 권고

**머지 비권고.** 실 사용자 도달 결함 2건이 남아 있다. 특히 현재 수정 가능한 판매전표 2,174건 전부에서 새 빈행 입력값 조용한 소실이 가능하고, 같은 2,174건 전부에서 협업 삭제 후 후속 진입 시 lineId 재부착 경로가 열린다.

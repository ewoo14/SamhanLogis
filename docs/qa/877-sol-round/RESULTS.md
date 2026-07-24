# PR #918 / 이슈 #877 — CODEX SOL 5.6 적대검증 2차

- 실행일: 2026-07-24 KST
- 렌더러: `http://127.0.0.1:5420` (mock OFF)
- API: `http://localhost:8080`
- 최종 실행: Playwright **9/9 통과**
- 판정: **실 사용자 경로 도달가능 결함 2건**

> 결함 재현 테스트는 현재의 잘못된 결과를 명시적으로 단언하므로 Playwright 자체는 통과한다.

## 1. 도달가능 결함

### SOL-877-1 — 두 세션의 last-write가 상대 세션이 저장한 다른 카테고리 선택을 무음 삭제

실행한 재현 절차:

1. 실 scope를 `국민 계좌 1 + 법인카드 1111 1`로 저장한다.
2. 독립 브라우저 컨텍스트 A/B가 같은 scope에 동시에 진입한다.
3. A에서 `신한 계좌`를 추가하고 `범위=계좌`로 저장한다.
4. 실 GET에서 `accountRefs=[국민, 신한]`을 확인한다.
5. A의 저장 전 snapshot을 가진 B에서 `법인카드 2222`를 추가하고 `범위=카드`로 저장한다.
6. 실 GET 및 새 세션 재진입에서 `신한 계좌`가 사라졌음을 확인한다.

실행 원문:

```text
[CONCURRENCY after A] {"connectedId":"connected-main","accountRefs":["국민 123456-78-901234","신한 987654-32-109876"],"cardRefs":["삼한 법인카드 1111"],"loanRefs":[],"defaultImportType":"BANK","scopeMode":"SELECTED"}
[CONCURRENCY after B last-write] {"connectedId":"connected-main","accountRefs":["국민 123456-78-901234"],"cardRefs":["삼한 법인카드 1111","삼한 법인카드 2222"],"loanRefs":[],"defaultImportType":"CARD","scopeMode":"SELECTED"}
[DEFECT-REPRODUCED] 두 세션 last-write: A가 저장한 신한 계좌가 B의 카드 저장 뒤 실 GET에서 소멸
```

증거:

- `07-concurrency-session-a-added-shinhan-and-saved.png`
- `08-concurrency-session-b-stale-snapshot-before-save.png`
- `09-concurrency-final-reentry-shinhan-lost.png`

사용자 증상: A는 저장 성공 토스트를 보지만, 뒤늦게 B가 카드만 저장하면 A가 저장한 신한 계좌 선택이 경고·충돌 안내 없이 사라진다. 다음 재진입/가져오기에서 해당 계좌가 누락된다.

### SOL-877-2 — 최초 저장 성공 뒤 “저장된 선택이 없습니다”와 “복원했습니다”가 동시에 노출

실행한 재현 절차:

1. 실 BE에서 `dev_accountant`의 `connected-main` scope가 `scopeMode=null`인 미저장 상태임을 GET으로 확인한다.
2. mock OFF 실 화면에 `dev_accountant`로 진입한다.
3. 국민 계좌를 선택하고 `범위=계좌`로 저장한다.
4. 실 PUT 200 및 실 GET `scopeMode=SELECTED`, 국민 계좌 1개 저장을 확인한다.
5. 같은 화면의 안내문과 성공 토스트를 확인한다.

실행 원문:

```text
[FIRST-SAVE before] {"connectedId":"connected-main","accountRefs":[],"cardRefs":[],"loanRefs":[],"defaultImportType":"ALL","scopeMode":null}
[FIRST-SAVE after real PUT] {"connectedId":"connected-main","accountRefs":["국민 123456-78-901234"],"cardRefs":[],"loanRefs":[],"defaultImportType":"BANK","scopeMode":"SELECTED"}
[DEFECT-REPRODUCED] 최초 저장 HTTP 200 뒤 성공 토스트·복원 안내와 미저장 안내가 동시에 노출
```

증거:

- `16-first-save-success-but-unsaved-hint-remains.png`

사용자 증상: 최초 저장이 실제 서버에 성공했는데도 화면은 성공 토스트 아래에 “저장된 선택이 없습니다”와 “저장된 선택을 복원했습니다”를 동시에 보여 서로 모순된 상태를 안내한다.

## 2. 라이브QA 로그

### 반복 라운드트립 / 재진입

```text
[ROUND-1 CARD 저장] accountRefs=[국민,신한], cardRefs=[1111], loanRefs=[운전자금], defaultImportType=CARD
[ROUND-2 BANK 저장] accountRefs=[국민,신한], cardRefs=[2222], loanRefs=[운전자금], defaultImportType=BANK
[ROUND-3 LOAN 저장] accountRefs=[국민], cardRefs=[2222], loanRefs=[운전자금,시설자금], defaultImportType=LOAN
```

각 저장 뒤 전체 화면으로 재진입해 정확한 checkbox 상태를 대조했다. 필터 밖 유실, 의도적 해제 항목 부활 모두 없었다.

### stale ref 대체 fixture

실 서버 scope에 실 목록에 없는 `SOL-STALE-ACCOUNT-*`를 넣어 재진입했다. 화면에는 실제 항목 2개만 보였고, 보이는 카드 하나를 추가 저장한 뒤에도 stale ref는 실 GET에 남았다.

```text
[STALE fixture] ... visibleChipCount=2 staleRef=SOL-STALE-ACCOUNT-...
[STALE 재저장] accountRefs=[국민,SOL-STALE-ACCOUNT-...], cardRefs=[1111,2222]
```

단, 현재 서버 목록은 코드에 고정된 DRY_RUN 목록이라 “기존 정상 항목을 실제 삭제/비활성화”하는 단계는 실행할 수 없었다. 따라서 이 관측은 도달가능 결함 목록에 올리지 않았다.

### null / 빈 배열 / ALL

```text
[NULL 미저장 GET] ... "accountRefs":[],"cardRefs":[],"loanRefs":[],"scopeMode":null
[ALL + [] 화면 저장 GET] ... "accountRefs":[],"cardRefs":[],"loanRefs":[],"scopeMode":"ALL"
[ALL + null arrays PUT 응답] ... "accountRefs":[],"scopeMode":"ALL"
[ALL + arrays 미전송 PUT 응답] ... "accountRefs":[],"scopeMode":"ALL"
```

미저장과 전체 저장은 `scopeMode`로 구분됐고 화면 경계에서도 붕괴하지 않았다.

### 실제 CARD 가져오기

기존 DB에 동일 DRY_RUN 행이 모두 존재하는 2020-03-01~03을 사용했다.

```text
[IMPORT CARD POST body] {"connectedId":"connected-main","from":"2020-03-01","to":"2020-03-03","type":"CARD","scopeMode":"SELECTED","accountRefs":[],"cardRefs":["삼한 법인카드 1111"],"loanRefs":[],"submitMethod":"DRY_RUN"}
[IMPORT CARD POST HTTP 200] ... "fetchedCount":5,"importedCount":0,"duplicateSkippedCount":5 ...
```

CARD 필터가 실제 POST에서도 카드 ref만 보냈고 신규 거래 행은 생기지 않았다.

### 게이트 / mock-BE 파리티 / 복원 anchor

```text
[GATE] BANK 선택 복원 후 CARD(선택 0) 전환: 저장/가져오기 disabled + 안내 visible
[PARITY real] {"bank0":true,"bank1":true,"card0":true,"card1":true}
[PARITY mock] {"bank0":true,"bank1":true,"card0":true,"card1":true}
[ANCHOR 1/5] ... [ANCHOR 5/5] selected-chip visible + bank-account-0 checked
```

기존 저장 상태의 필터 밖 선택 보존은 mock/BE가 같았다. 이후 mock 최초 저장 화면에서 보인 모순 안내를 실 BE의 미저장 `dev_accountant`로 재현해 SOL-877-2로 확정했다.

### 스크린샷

- `01`~`04`: 반복 저장·재진입·의도적 해제
- `05`~`06`: stale ref 대체 fixture
- `07`~`09`: 동시성 결함
- `10`: `ALL + []` 경계
- `11`: 실제 CARD 가져오기
- `12`: 선택 0 현재 필터 게이트
- `13`~`14`: 실 BE / mock 화면 결과 대조
- `15`: 5번째 복원 anchor
- `16`: 실 BE 최초 저장 성공 뒤 모순 안내
- `00`: 최초 하네스 진입 진단용 대시보드 캡처

## 3. OPUS 1차 6개 확인 항목 재확인

| # | 항목 | 2차 실사용자 경로 결과 |
|---|---|---|
| 1 | 무음 유실 제거 | 통과 — CARD/BANK/LOAN 세 번 저장·재진입에서 전체 카테고리 보존 |
| 2 | 의도적 해제 over-save 없음 | 통과 — 신한/카드 1111 해제 뒤 재진입 시 부활 없음 |
| 3 | scopeMode 경계 | 통과 — 미저장 `null`, ALL `[]`, SELECTED가 구분됨 |
| 4 | 가져오기 무회귀 | 통과 — 실 POST가 CARD ref만 전송, HTTP 200, 신규 적재 0 |
| 5 | 게이트 무회귀 | 통과 — 현재 CARD 선택 0에서 저장/가져오기 비활성 + 안내 |
| 6 | #915 복원 anchor | 통과 — 실 페이지 재진입 5/5에서 chip visible + 계좌 checked |

## 4. 요청 각도 1~6

| 각도 | 실행 여부 | 결과 |
|---|---|---|
| 1. 라운드트립 반복 | 실행 | 결함 0 |
| 2. stale ref | 부분 실행 | stale 상태 이후 재진입·재저장은 실행. 실제 삭제/비활성화 단계는 DRY_RUN 고정목록 때문에 못 함. 결함 판정 제외 |
| 3. 재진입 후 재저장 | 실행 | 결함 0 |
| 4. 동시성 | 실행 | **도달가능 결함 1** |
| 5. 빈 배열 vs null | 실행 | 결함 0 |
| 6. mock ↔ BE 파리티 | 실행 | 기존 저장 상태의 핵심 결과는 동일. 최초 저장 모순 안내가 실 BE에서도 재현되어 **도달가능 결함 1** 추가 |

## 5. throwaway 데이터와 정리

- 시작 원본: `connected-main / account=[] / card=[] / loan=[] / default=ALL / scopeMode=ALL`
- 각 시나리오에서 같은 scope를 임시 변경했다.
- stale marker는 scope에만 임시 저장했고 거래내역 가져오기는 하지 않았다.
- 실 CARD 가져오기는 기존 행만 사용해 `importedCount=0`, `duplicateSkippedCount=5`.
- `afterAll`에서 원본을 PUT하고 GET으로 동일성을 단언했다.
- 종료 후 DB 직접 확인:

```text
connected-main | [] | [] | [] | ALL | ALL | is_deleted=false
SOL-STALE-ACCOUNT-* bank_transaction count = 0
```

- mock renderer `:5421`은 종료했고, PM 제공 renderer `:5420`은 그대로 유지했다.
- 미저장 실사용자 경로용 `dev_accountant` scope는 QA 후 canonical soft delete했다. 종료 GET은 다시 `scopeMode=null`, refs 0개다. tombstone은 `deleted_by=SOL-877-QA-CLEANUP`으로 식별된다.

## 6. 정직 고지

- 정상 ref의 실제 삭제/비활성화는 실행하지 못했다. 현재 form 목록이 데이터 행이 아니라 DRY_RUN 코드 고정 목록이라 변경 가능한 실서버 경로가 없다.
- 최초 비해시 URL은 HashRouter에서 대시보드를 렌더했다. `/#/accounting/bank-transactions`로 고친 뒤 대상 화면을 실행했다. 이는 제품 결함 판정에 포함하지 않았다.
- 최초 mock 비교는 임시 서버의 `VITE_APP_VERSION` 미지정으로 강제 업데이트 화면에 막혔다. 실제 버전 `0.1.0`으로 재기동한 뒤 parity를 실행했고 종료했다.
- production 코드는 수정하지 않았다. real-QA 스펙·스크린샷·본 보고서만 생성했다.

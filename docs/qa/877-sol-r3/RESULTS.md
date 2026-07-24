# PR #918 / 이슈 #877 — CODEX SOL 5.6 2차 적대검증

- 실행일: 2026-07-24
- 렌더러: `http://127.0.0.1:5490`
- 게이트웨이: `http://localhost:8080`
- 계정: `dev_master`, 최초 저장 경로만 `dev_accountant`
- 최종 판정: **실 사용자 경로로 재현 가능한 결함 0건**
- 최종 Playwright: **4 passed (46.2s)**
- 실행 원문: `playwright-final.stdout.txt`
- stderr: `playwright-final.stderr.txt` (0 byte)

## 1. 도달가능 결함 목록

**0건.**

실 사용자 경로에서 두 번 이상 재현하고 스크린샷/원문을 남길 수 있는 제품 결함은
발견하지 못했다. 테스트·문서·mock 품질만의 문제는 판정 대상에서 제외했다.

## 2. ①②③ 무회귀 실행 원문

```text
[① SAVE PUT] {"connectedId":"connected-main","accountRefs":["국민 123456-78-901234","신한 987654-32-109876","우리 222222-33-444444"],"cardRefs":["삼한 법인카드 1111","삼한 법인카드 2222"],"loanRefs":[],"defaultImportType":"CARD","scopeMode":"SELECTED"}
[① SERVER GET] {"connectedId":"connected-main","accountRefs":["국민 123456-78-901234","신한 987654-32-109876","우리 222222-33-444444"],"cardRefs":["삼한 법인카드 1111","삼한 법인카드 2222"],"loanRefs":[],"defaultImportType":"CARD","scopeMode":"SELECTED"}

[② FIRST SAVE GET] {"connectedId":"connected-main","accountRefs":["국민 123456-78-901234"],"cardRefs":[],"loanRefs":[],"defaultImportType":"BANK","scopeMode":"SELECTED"}
[② FIRST SAVE DOM] 미저장 안내=0, 복원 안내=1

[③ CLEAN IMPORT POST] {"connectedId":"connected-main","from":"2019-05-01","to":"2019-05-03","type":"CARD","scopeMode":"SELECTED","accountRefs":[],"cardRefs":["삼한 법인카드 1111","삼한 법인카드 2222"],"loanRefs":[],"submitMethod":"DRY_RUN"}
[③ DIRTY IMPORT POST] {"connectedId":"connected-main","from":"2019-05-01","to":"2019-05-03","type":"CARD","scopeMode":"SELECTED","accountRefs":[],"cardRefs":["삼한 법인카드 1111","삼한 법인카드 2222"],"loanRefs":[],"submitMethod":"DRY_RUN"}
```

증거:

- `01-invariants-after-card-save.png`
- `02-invariants-clean-dirty-equal.png`
- `03-first-save-no-missing-hint.png`

## 3. 각도별 실행 결과

### 각도 1 — ④가 ①②③을 되돌렸는가

**실행함 / 결함 0.**

- 계좌 3 + 카드 2를 선택한 뒤 범위를 카드로 좁혀 저장했다.
- PUT과 실 BE 재조회 모두 화면 밖 계좌 3개를 보존했다.
- clean/dirty 두 import POST를 모두 가로채 비교했다.
- 두 payload가 완전히 같고 `type=CARD`, `accountRefs=[]`, 카드 2개였다.
- 실제 import endpoint는 한 번도 BE까지 보내지 않았다.

### 각도 2 — 조건부 컬럼 16조합·데이터 정합·선택/일괄작업

**실행함 / 결함 0.**

실 BE 분포:

```text
[REAL BE DISTRIBUTION] total=185
sources={"CODEF_BANK":85,"CODEF_CARD":60,"CODEF_LOAN":40}
statuses={"UNREFLECTED":185,"REFLECTED":0,"FORCED":0}
```

- 소스 4 × 상태 4 = 16조합 전부 실제로 클릭했다.
- 16조합 모두 실 BE 필터 기대 행 수와 UI 행 수가 일치했다.
- 소스가 `전체`일 때만 `소스` 열이 존재했다.
- 상태가 `전체`일 때만 `매칭상태` 열이 존재했다.
- 계좌/카드/대출의 비어 있지 않은 좁은 탭에서 `uniqueSources`가 각각 한 값이었다.
- 미반영의 비어 있지 않은 좁은 탭에서 `uniqueStatuses=["UNREFLECTED"]`였다.
- 카드 탭의 `법인카드/승인번호`, 대출 탭의 `대출명`을 확인했다.
- 원본 185행은 선택 불가였고 일괄 생성 버튼도 비활성이었다.
- 계좌 입금 1건을 임시 수동 매칭한 뒤 체크 → 선택 1건/합계/거래처 → 입금보고서
  모달 열기 → 취소까지 실 사용자 경로로 실행했다.

원문 예:

```text
[16-COMBO ALL/ALL] expected=185 actual=185 ... uniqueSources=["CODEF_CARD","CODEF_LOAN","CODEF_BANK"] uniqueStatuses=["UNREFLECTED"]
[16-COMBO CODEF_BANK/UNREFLECTED] expected=85 actual=85 ... uniqueSources=["CODEF_BANK"] uniqueStatuses=["UNREFLECTED"]
[16-COMBO CODEF_CARD/UNREFLECTED] expected=60 actual=60 ... uniqueSources=["CODEF_CARD"] uniqueStatuses=["UNREFLECTED"]
[16-COMBO CODEF_LOAN/UNREFLECTED] expected=40 actual=40 ... uniqueSources=["CODEF_LOAN"] uniqueStatuses=["UNREFLECTED"]
[BULK baseline] enabled=0 disabled=185 createDisabled=true
[BULK user path] 임시 매칭 입금 1건 선택 → 합계/거래처 표시 → 입금보고서 모달 열림
```

증거:

- `combo-*-*.png` 16장
- `bulk-one-selected-modal-open.png`

### 각도 3 — DataTable 다른 화면

**실행함 / 결함 0.**

- 가로 스크롤 없음, 실 BE 빈 상태: 수금계획.
- 가로 스크롤 있음, 합성 빈 응답: 월별손익분석. 오른쪽 끝 스크롤 후에도 빈 상태
  sticky 좌측이 스크롤 컨테이너 좌측과 일치했다.
- 모달 안 실 DataTable: 사용자 관리 → 권한 변경 이력.
- 375px 좁은 폭 실 빈 상태: 수금계획. 문서 폭 375 = 뷰포트 폭 375.
- 네 경로 모두 계산값 `containerType="inline-size"`였다.

원문:

```text
[DATATABLE no-scroll real] ... "scrollClientWidth":1116,"scrollWidth":1116 ... "stickyPosition":"sticky"
[DATATABLE horizontal empty right] ... "scrollLeft":124 ... "sticky":{"left":282 ...},"scroll":{"left":282 ...}
[DATATABLE narrow 375] ... "documentWidth":375,"viewportWidth":375
[DATATABLE modal real] {"dialogWidth":708,"tableWidth":666,"scrollClientWidth":678,"scrollWidth":678,"containerType":"inline-size","documentWidth":1440,"viewportWidth":1440}
```

증거:

- `datatable-no-horizontal-scroll-empty.png`
- `datatable-horizontal-empty-scrolled-right.png`
- `datatable-narrow-375-empty.png`
- `datatable-modal-role-history.png`

### 각도 4 — 저장·복원·가져오기 상태머신

**실행함 / 결함 0.**

- 카드 범위 저장 → 상태탭/소스탭 전환 → 분개 화면 이동 → 입출금 화면 재진입.
- 재진입 시 카드 범위와 선택 2개, 복원 안내를 확인했다.
- 재진입 clean import와 `ALL→CARD` 왕복 dirty import가 동일했다.
- 최초 저장 계정은 저장 전 미저장 안내가 보였고, 저장 성공 직후 미저장 안내가
  사라지고 복원 안내만 남았다.

### 각도 5 — 부분 mock ↔ 실 BE

**실행함 / 결함 0.**

`scope GET/PUT`만 `page.route()`로 부분 mock한 새 브라우저 컨텍스트와 실 BE를 같은
화면 조작으로 비교했다. 전량 mock은 사용하지 않았다.

```text
[PARITY real before] {"bank0":true,"card0":true}
[PARITY mock before] {"bank0":true,"card0":true}
[PARITY real after] {"bank0":true,"bank1":true,"card0":true,"card1":true}
[PARITY mock after] {"bank0":true,"bank1":true,"card0":true,"card1":true}
```

증거:

- `parity-real-be.png`
- `parity-partial-mock.png`

## 4. throwaway와 정리 결과

생성/변경:

- `dev_master`의 scope를 테스트 중 변경.
- `dev_accountant` 최초 저장 scope 1건 생성.
- 기존 계좌 입금 자연키 `하나 555555-66-777777 / BANK-2020-03-03-001`을
  임시 파트너 매칭.

정리:

```text
[CLEANUP master scope] {"connectedId":"connected-main","accountRefs":[],"cardRefs":[],"loanRefs":[],"defaultImportType":"ALL","scopeMode":"ALL"}
[CLEANUP accountant scope] UPDATE 1
[THROWAWAY MATCH CLEANUP] HTTP 200
```

최종 DB:

```text
CODEF_BANK=85
CODEF_CARD=60
CODEF_LOAN=40
matched_partner_nonnull=0
active_scope_rows=1
accountant_active_scope_rows=0
master_scope=[]|[]|[]|ALL|ALL
하나 555555-66-777777|BANK-2020-03-03-001|matched=NULL
```

`dev_accountant` 신규 scope는 삭제 API가 없어 기존 QA 정리 규칙대로 soft-delete했다.
활성 scope는 원래 `dev_master` 1건만 남았다.

## 5. 정직 고지

- 실 import는 실행하지 않았다. 모든 `POST /accounting/codef/import-scoped`를 브라우저
  라우트에서 payload 캡처 후 합성 200으로 종료했다.
- 현재 실 DB에는 `REFLECTED/FORCED` 행이 0건이다. 따라서 해당 8개 조합은 실제 빈
  상태와 열 구성을 실행했지만, 비어 있지 않은 행 집합에서 상태값 중복성을 재측정할
  수는 없었다.
- 월별손익분석의 가로 스크롤 빈 상태는 레이아웃 검증을 위해 해당 GET만 합성 빈
  응답으로 만들었다. 렌더러와 나머지 API는 `:5490`/실 BE였다.
- 첫 통합 시도에서 동일 URL `goto` 뒤 새 GET을 기다리는 QA 하네스 타임아웃이 1회
  있었다. 명시적 `reload`로 고친 후 최종 전체 실행은 `4 passed (46.2s)`였다.
- `:5420`, `:5421`, `:5430`, `:5441`은 접근·종료하지 않았다. 컨테이너도 재시작하지
  않았다.

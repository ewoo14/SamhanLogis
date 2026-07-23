# #877 — CODEF 가져오기 선택 저장 시 `type` 필터 밖 카테고리 무음 유실

- 슬라이스: #877 (에픽 #825 "저장 payload 축" 잔여)
- 브랜치: `feat/877-codef-filter-category` (origin/main `bff057041` 기반 — #864 `567dd5d1d` null-semantics 머지 포함)
- 대상 파일: `clients/desktop/src/renderer/routes/components/CodefImportScopeForm.tsx` (+ 동 `*.test.tsx`)
- 기획: OPUS 4.8 / 2026-07-24
- 흡수: #915 (`CodefImportScopeForm.test.tsx` flaky race — 동일 파일, withdrawn)

---

## 1. 문제

CODEF 거래내역 "가져오기 선택"을 저장할 때, **`범위`(type) 드롭다운이 특정 카테고리로 좁혀진 상태이면 다른 카테고리의 기존 선택이 저장 payload 에서 조용히 빠진다.**

- 실사용자 경로: 계좌 3개 + 카드 2개를 선택 → `범위`를 "카드"로 좁혀 확인 → **저장** → 재진입하면 **계좌 3개가 사라져 있다**(카드 2개만 남음).
- 저장 순간 화면에는 계좌가 안 보일 뿐(필터로 숨겨진 상태) 유실을 인지할 신호가 없다. 저장 성공 토스트("가져오기 선택을 저장했습니다.")가 뜨므로 **사용자는 모든 선택이 보존됐다고 믿는다** — 거짓 안심(false reassurance).
- 회계 도메인 입력이므로, 다음 "가져오기"가 사용자가 의도한 계좌 거래를 조용히 누락한다.

심각도: **도달 가능한 무음 데이터 손실**(머지 게이트 축 = 실사용자 경로 재현 가능 결함).

---

## 2. 원인 분석

### 2.1 `effectiveSelection` 의 이중 역할 (핵심)

`effectiveSelection(fillEmptyVisibleWithAll)` (`CodefImportScopeForm.tsx:291-309`) 은 현재 `type` 상태로 선택을 **필터링**한다:

```
accountRefs: type === 'ALL' || type === 'BANK' ? selection.accountRefs : [],   // :293
cardRefs:    type === 'ALL' || type === 'CARD' ? selection.cardRefs   : [],   // :294
loanRefs:    type === 'ALL' || type === 'LOAN' ? selection.loanRefs   : [],   // :295
```

즉 `type === 'CARD'` 이면 `accountRefs`·`loanRefs` 를 무조건 `[]` 로 만든다(화면에 안 보이는 카테고리를 제거). 이 함수는 **두 경로에 동시에 쓰인다**:

| 사용처 | 라인 | 역할 | 필터링 적정성 |
|---|---|---|---|
| `buildScopePayload` | `:318` | **저장 payload** | ❌ **버그** — 저장은 필터와 무관해야 함 |
| `buildImportPayload`(dirty SELECTED) | `:363` | 가져오기 payload | ✅ 의도(카드만 실행) |
| `restoredSelectionInvalid` | `:430` | 저장/가져오기 게이트 | ✅ 화면 기준 판정 |
| `importSelectionReady` | `:443` | 가져오기 게이트 | ✅ 실행 기준 판정 |

`buildScopePayload` (`:311-325`):

```
const refs = scopeMode === 'SELECTED' ? effectiveSelection(false) : EMPTY_SELECTION   // :318
return { connectedId, ...refs, defaultImportType: type, scopeMode }
```

→ `scopeMode='SELECTED'` + `type='CARD'` 이면 저장 payload 의 `accountRefs=[]`, `loanRefs=[]`. **계좌·대출 선택이 payload 단계에서 소실**된다.

### 2.2 BE·mock 은 무죄 — 유실은 100% FE 측

저장 경로 하류를 전수 확인한 결과 **BE·mock 모두 받은 세 배열을 그대로(verbatim) 저장**한다. `type` 필터를 아는 주체가 아니다.

- BE: `UserCodefImportScopeService.upsertOnce` (`:72-77`) → `UserCodefImportScope.updateSelections` (`:104-106`) 가 `CodefRefNormalizer.normalizeRefs(accountRefs)` 로 **받은 값을 그대로** 컬럼에 기록. FE 가 `[]` 를 보내면 `[]` 가 저장된다.
- mock PUT `/accounting/codef/scopes` (`mock.ts:6218-6249`) → `accountRefs: normalizeMockRefs(body.accountRefs)` (`:6241`) 로 **동일하게 verbatim** 저장.
- 재조회(GET) 도 저장분을 그대로 반환(BE `get` `:83-88` / mock `:6251-6267`).

⟹ FE 가 좁혀진 payload 를 보내는 순간 손실이 확정된다. **fix 는 전적으로 `buildScopePayload` 안에서 끝난다**(BE·mock 변경 불필요).

### 2.3 재현 체인 (라인 실증)

`type='CARD'`, `scopeMode='SELECTED'`, `selection={accountRefs:[a1,a2,a3], cardRefs:[c1,c2], loanRefs:[]}` 에서 저장:

1. `buildScopePayload:318` → `effectiveSelection(false)`
2. `effectiveSelection:293` → `accountRefs = []`(type≠ALL·≠BANK), `cardRefs=[c1,c2]`, `loanRefs=[]`
3. payload = `{accountRefs:[], cardRefs:[c1,c2], loanRefs:[], defaultImportType:'CARD', scopeMode:'SELECTED'}`
4. BE `updateSelections:104` → `accountRefSelections = normalizeRefs([]) = []` 저장 / mock `:6241` 동일
5. 재진입 GET → `accountRefs:[]` → 복원 `useEffect:201` → `selection.accountRefs=[]`. **계좌 3개 소멸.**
6. `saveMutation.onSuccess:389-393` 이 저장 응답으로 `selection` 을 덮어써(`accountRefs:[]`) **세션 내 메모리 상태에서도 즉시 소실** — 단 `type='CARD'` 라 계좌가 화면에 안 보여 인지되지 않음.

`scopeMode='SELECTED'` + `cardRefs` 비어있지 않음이라 BE 의 `SELECTED+빈목록=400` 가드(#864)는 **발동하지 않는다** — 부분 유실은 통과한다.

### 2.4 #864 null-semantics 와의 관계

#864(`567dd5d1d`)는 `scopeMode` 3-상태(`null`=미저장 / `ALL` / `SELECTED`)를 도입해 **"전체 저장 vs 미저장"** 축(D-S5-06, H-4)과 **"가져오기 payload 의 type seam"** (item5 — SELECTED·0개를 서버가 전체 열거하던 것)을 해소했다. 두 fix 모두 **가져오기(실행) 축**과 **미저장 판별 축**에 작동한다.

이 건은 그와 **직교(orthogonal)** 하는 **저장(PUT) 축**의 잔여다:

- #864 가 `buildImportPayload` 에서 SELECTED 는 refs 를 명시 배열로 보내도록 고쳤지만(`:357-371`, item5), **`buildScopePayload` 는 여전히 `effectiveSelection(false)` 를 쓴다**(`:318`) — 저장 축은 손대지 않았다.
- #864 의 `SELECTED + 빈 목록 = 400` 가드는 **전량 유실**만 막고 **부분(카테고리별) 유실**은 못 막는다(§2.3-5).
- 정합: fix 후에도 저장 payload 는 `scopeMode='SELECTED'` + 비어있지 않은 전체 선택 → #864 가드(ALL+값=400, SELECTED+빈=400)를 모두 통과. **null-semantics 계약과 충돌 없음**(§6 상술).

---

## 3. 결정

### D-877-01 — 저장 payload 는 필터 무관 전체 선택을 쓴다 (핵심)
`buildScopePayload` 의 `scopeMode='SELECTED'` 분기는 `effectiveSelection(false)`(필터 반영) 대신 **`selection` 상태 원본(필터 무관, 전체 3배열)** 을 payload 로 쓴다. `effectiveSelection` 은 화면 표시·가져오기 실행 전용으로 남긴다(이름·역할 명확화).
- 저장용 선택 = `selection`(state, `:145`) — 이미 `setCategoryRefs`(`:253-262`)·복원(`:201`)에서 정규화·유지되는 전체 선택.
- 불변식: **저장 payload 의 refs = 사용자가 실제로 체크한 전체 항목**(현재 `type` 뷰와 무관).

### D-877-02 — 게이트(`canSave`/`restoredSelectionInvalid`/`importSelectionReady`)는 현행 유지
이들은 `effectiveSelection(false)`(필터 반영)를 계속 쓴다. 근거:
- 이 게이트들은 저장을 **제약만** 할 뿐 잘못된 저장을 **허용하지 않는다** → 무음 유실을 새로 만들지 않는다.
- 오히려 현행 필터 기준 게이트가 **재진입 정합을 보장**한다: `canSave=true` ⟹ `restoredSelectionInvalid=false` ⟹ 현재 `type`(=저장될 `defaultImportType`) 가시 카테고리에 **최소 1개 ref 존재**. 따라서 저장 가능한 SELECTED scope 는 언제나 자기 `defaultImportType` 필터 안에 ≥1 ref 를 가져 **재진입 시 "선택 항목 없음"으로 뒤집히지 않는다**.
- 가져오기 게이트는 #825 슬5 item5(type seam) 계약을 그대로 지켜야 하므로 필터 기준이 옳다.

### D-877-03 — `defaultImportType` = `type` 유지
SELECTED 모드에서 `defaultImportType` 은 **재방문 시 복원할 뷰 필터 힌트**일 뿐이다(가져오기 실행은 복원 SELECTED 분기 `:345-354` 에서 `type:'ALL'`+저장 3배열로 수행되어 `defaultImportType` 을 무시). 저장 스키마·의미 변경 없음(#825 D-S5-01 정합).

### D-877-04 — #915 flaky race 흡수
`CodefImportScopeForm.test.tsx` "권한 조합" 테스트(`:342-380`)의 동기 조회를 복원 완료를 보장하는 **비동기 anchor** 로 교체(§8.4).

---

## 4. 범위

### 포함
- `CodefImportScopeForm.tsx` `buildScopePayload` (저장 경로) — D-877-01.
- `CodefImportScopeForm.test.tsx` — 저장 payload 보존 RED→GREEN(§8.1~8.3) + #915 flaky fix(§8.4).

### 저장 경로 전수 (sweep 결과)
- 저장(PUT) 경로는 **단 하나**: `saveMutation.mutationFn` (`:386`) → `buildScopePayload()` → `saveCodefImportScope()`(PUT `/accounting/codef/scopes`). 다른 저장 진입점 없음.
- `effectiveSelection` 4개 사용처 중 **저장으로 새는 지점은 `:318` 하나**(§2.1 표). 나머지 3개는 화면/가져오기/게이트 — 필터 반영이 의도.
- 동일 "필터가 저장에 새는" 패턴을 만드는 다른 폼: 없음(이 컴포넌트 고유 구조).

### 제외 (슬라이스 밖)
- **가져오기(POST `/import-scoped`) payload** — 다른 축. `type` 필터 반영이 의도된 계약이며 #825 슬5 R1(item5)에서 해소됨. 손대지 않는다.
- **BE·mock 저장 핸들러** — verbatim 저장이라 변경 불필요(§2.2).
- **게이트·`defaultImportType` 의미 재설계** — D-877-02/03.
- **backfill·읽기 의미** — #825 D-S5-04/05 그대로.
- **(관찰) 게이트 필터 의존으로 "전 선택이 현재 필터 밖"인 극단 상태에서 저장 버튼이 잠기는 것** — 무음 유실이 아니라 버튼 비활성+안내문(`:557-561`)이며 필터를 "전체"로 돌리면 해소되는 기존 동작. 이 건의 도달 가능 결함(무음 유실)과 별개 → 슬라이스 밖. 개발책임자 판단 지점(§최종보고).

---

## 5. 불변식

- **INV-1 (저장=전체 보존)**: 저장 payload 의 `accountRefs`/`cardRefs`/`loanRefs` = 사용자가 체크한 **전체** 선택. 현재 `type` 값에 의존하지 않는다.
- **INV-2 (재진입 생존)**: 여러 카테고리 선택 후 `type` 을 한 카테고리로 좁혀 저장하더라도, 재진입(재조회 복원) 시 **필터 밖 카테고리 선택이 살아 있다**.
- **INV-3 (토스트 정직)**: "가져오기 선택을 저장했습니다." 토스트가 뜬 뒤 실제 저장분과 화면·재진입 상태가 **일치**(저장 성공 = 무손실).
- **INV-4 (가져오기 불변)**: 가져오기 실행 payload 는 이 fix 전후로 동일. `type` 필터 기준 실행(#825 슬5 item5)과 복원 SELECTED 분기(#864)가 그대로 유지된다.
- **INV-5 (#864 정합)**: 저장 payload 는 항상 `scopeMode∈{ALL,SELECTED}` 명시 + SELECTED 이면 비어있지 않은 refs → #864 400 가드(ALL+값 / SELECTED+빈 / 누락)와 모순 없음.
- **INV-6 (#915 결정론)**: 권한 조합 테스트는 복원(`scopeMode='SELECTED'`) 완료를 동기화 anchor 로 삼아 쿼리 resolve 순서와 무관하게 결정론적.

---

## 6. 기존 결정 교차검증

- **#864 / #825 D-S5 null-semantics (정합 확인)**:
  - `scopeMode` 3-상태 불변. 저장은 여전히 `scopeMode!==null` 강제(`canSave`, `:445`)·`buildScopePayload:312` reject 가드 유지.
  - SELECTED 저장은 D-S5-02 계약(SELECTED⟺hasSelection)을 fix 후에도 만족 — 오히려 **더** 만족(전체 refs 를 보내므로 hasSelection 이 확실). ALL 저장 분기(`EMPTY_SELECTION`)는 무변경.
  - D-S5-06 backfill(`SELECTED` 보수적)·H-4 복원 로직(`:183-204`) 무영향.
  - #825 슬5 spec(`docs/specs/825-s5-null-semantics-spec.md`)에 `effectiveSelection`/저장 필터 언급 없음 → **이 필터-저장 분리를 금지·규정한 선행 결정 없음**(grep 확인). 저장 표현(verbatim)만 유지하면 되는 이 fix 는 D-S5-01("저장 스키마 무변경")과도 정합.
- **feedback_fe_option_type_matches_be_dto**: 저장 refs 는 `string[]`(FE) ↔ `List<String>`(BE `CodefImportScopeRequest:16-20`) 정확 일치. 타입 불일치 silent no-op 위험 없음. `defaultImportType`·`scopeMode` 도 enum/문자열 그대로.
- **feedback_inprocess_mock_principles**: mock PUT 핸들러는 `parseMockBody`(원칙1)·non-null `envelope`(원칙2) 사용 확인. **mock 파리티**: mock(`:6231-6246`)이 BE(`isScopeSelectionConsistent` / `validateScope`)와 동일하게 scopeMode 일관성 검증 + verbatim 저장 → 파리티 성립. fix 로 mock 변경 불필요하나, **테스트가 in-process mock 응답(verbatim)에 정합**하도록 저장 payload 를 직접 단언(§8).
- **feedback_react_query_freshness_route_param_reset**: #915 는 staleTime 문제가 아니라 **복원 useEffect 완료 전 동기 조회 race**(§8.4). 단 "presence-only false-green" 교훈 적용 — 저장 보존 테스트는 "칩이 있다" 류 존재 단언이 아니라 **저장 payload 의 계좌 refs 실값**과 **재진입 복원 실값**을 단언(구별 출력).

---

## 7. U-gate 시나리오

> **"여러 카테고리(계좌·카드·대출)를 선택한 뒤 `범위` 필터로 한 카테고리만 보다가 저장해도, 필터 밖 카테고리의 선택이 보존되고 재진입해도 살아 있다."**

시나리오: 계좌 3 + 카드 2 선택(`범위`=전체) → `범위`를 "카드"로 좁혀 카드만 확인 → **저장**(성공 토스트) → 페이지 재진입 → `범위`를 "전체"로 → **계좌 3 + 카드 2 모두 그대로**. 저장 성공 토스트가 실제 무손실 저장을 뜻한다.

---

## 8. 테스트 전략

🔑 핵심 원칙: **저장 후 재진입 검증**. 저장 직후 화면 상태만 보면(특히 `type='CARD'` 로 계좌가 숨겨진 상태) 유실을 놓친다. 저장 payload 실값 + 재조회 복원 실값을 단언한다.

### 8.1 RED-first — 저장 payload 전체 보존 (component test)
1. 계좌·카드 목록 mock resolve, 미저장(`scopeMode:null`).
2. `범위`=전체에서 계좌 항목 + 카드 항목 체크(예: `codef-bank-account-0`, `codef-card-0`).
3. `범위`를 "카드"로 전환(`codef-import-type` → `CARD`).
4. 저장 클릭 → `saveCodefImportScopeMock` 호출 인자 단언:
   - `accountRefs` = 체크한 계좌 ref(**비어있지 않음**) ← **현행 RED**(`[]` 로 옴)
   - `cardRefs` = 체크한 카드 ref
   - `scopeMode:'SELECTED'`, `defaultImportType:'CARD'`
   RED 원문(현재 `accountRefs:[]`)을 fix 전 캡처해 제출.

### 8.2 저장 후 재진입 복원 검증
- `saveCodefImportScope` 성공 응답 = 저장 payload verbatim(mock/BE 계약)으로 mock 설정 → `onSuccess` 후 `selection` 이 계좌+카드 모두 유지되는지(`범위`=전체 전환 시 계좌 칩 + 카드 칩 동시 표시) 단언.
- 또는 별도 렌더에서 `loadCodefImportScope` 가 계좌+카드 저장분을 반환할 때 복원된 선택에 계좌가 살아있는지.

### 8.3 mock PUT 파리티 확인
- mock 저장 핸들러가 세 배열을 verbatim 보존함을 확인(신규 계약 아님, 기존 `mock.test.ts` 커버리지 또는 본 테스트의 왕복으로 확인). 저장 payload 축이므로 명시.

### 8.4 #915 flaky RED→GREEN
- 원인: "권한 조합" 테스트(`:371-374`)가 `await screen.findByTestId('codef-import-button')`(**항상 렌더 → 대기 무효**, `:371`) 후 `screen.getByTestId('codef-selected-chip')`(`:374`)를 **동기** 조회. 선택 칩은 복원 `useEffect`(`:183-204`)가 `scopeMode='SELECTED'` 를 커밋해야 렌더되는데, 4개 쿼리(계좌/카드/대출/scope) resolve 순서가 비결정적이라 **계좌 쿼리가 scope 복원보다 먼저 끝나면**(`codef-bank-account-0` 는 초기 `type='ALL'` 라 복원 전에도 렌더됨) `:374` 에서 칩 부재로 throw → 간헐 RED.
- fix: `:374` 를 **`await screen.findByTestId('codef-selected-chip')`** 로 바꿔 복원 완료를 동기화 anchor 로 삼는다. 이후 동기 단언(role/disabled 등)은 복원 후 상태를 안정적으로 관측. (선택 칩은 4개 권한 조합 모두에서 `scopeMode='SELECTED'` 복원으로 렌더됨을 확인.)
- RED 재현은 확률적(관련 #825 R3 가 22연속 green 으로도 미재현 기록)이므로, **race 코드경로 제거를 GREEN 기준**으로 삼고 RED 는 코드 분석으로 확증(anchor 부재가 원인임을 주석에 기록).

---

## 9. 회귀 위험

- **가져오기 payload(다른 축)**: fix 는 `buildImportPayload` 를 건드리지 않는다. #825 슬5 item5 회귀 테스트(`test.tsx:412-440`)·R2 BLOCKING-1 it.each(`:171-200`)·branch B(`:202-236`) GREEN 유지 확인.
- **null-semantics(#864)**: SELECTED+전체refs 저장이 400 가드에 안 걸리는지, ALL 저장 분기 무영향인지(`:281-304`, `:238-258`, `:260-279` 회귀) 확인.
- **필터 UX**: `type` 전환 시 화면 표시·칩 필터(`:641`)·게이트 동작 무변경(D-877-02) 확인.
- **(경미·관찰) branch B 토스트 라벨 seam**: fix 후 "다중 카테고리를 `범위`=카드로 저장한 scope" 가 도달 가능해지고, 재진입 후 미변경 상태로 가져오기하면 복원 SELECTED 분기(`:345`)가 **저장된 전체 refs**(계좌+카드)를 실행한다(데이터는 올바름 — 저장한 것을 가져옴). 단 토스트 라벨은 `IMPORT_TYPE_LABEL[type='CARD']="카드"`(`:410`)로 표기되어 계좌까지 가져왔는데 "카드"로 보인다. **데이터 정확·라벨만 좁음**(무음 유실 아님). 이 슬라이스에서 라벨을 손대지 않으며(가져오기 축·경미), 필요 시 개발책임자 판단으로 후속 분리.

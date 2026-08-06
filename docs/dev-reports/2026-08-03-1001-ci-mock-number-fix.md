# PR #1061 CI mock business document number 후속

## 작업 로그

### 시작

- `git pull` 실행 결과: `Already up to date.`
- 기준 커밋과 작업 트리 상태는 다음 조사 단계에서 기록한다.

### 조사 기준

- HEAD: `559adce44` (`[FIX] #1061 CI H-2 가드 — QA 하네스 캡처 경로를 resolveQaShotsDir() 경유로`)
- 기존 사용자 변경: `clients/desktop/playwright/1001-live-qa/`는 보존한다.
- 이번 보고서 파일 자체는 새 untracked 파일이다.
- 대상 테스트: `clients/desktop/src/renderer/api/mock.test.ts`

### Phase 1 — 재현 실패 원문

실행 명령:

```text
npm test -- --run src/renderer/api/mock.test.ts
```

### Phase 3 — H-2 guard verification

### 최종 변경 목록

- `clients/desktop/src/renderer/api/mock.test.ts`: R14 저장 분개번호 fixture를 외부 계약 명시 허용 목록에 추가.
- `clients/desktop/playwright/1001-live-qa/capture.mjs`: H-2 가드가 발견한 `OUT` 경로를 `resolveQaShotsDir()` 경유로 정정.
- `docs/dev-reports/2026-08-03-1001-ci-mock-number-fix.md`: 이번 작업에서 새로 생성한 보고서.
- `docs/qa/**`: 변경·삭제 없음. 기존 커밋 QA 캡처 보존.
- 커밋·push는 실행하지 않았다.

최종 재검증 GREEN 원문(2026-08-03 21:32:19):

```text
✓ src/renderer/api/mock.test.ts (128 tests) 217ms
✓ src/renderer/test-utils/harness-false-green-guard.test.ts (49 tests) 7237ms
Test Files  2 passed (2)
Tests       177 passed (177)
Duration    8.07s
```

Running both target tests exposed one separate existing working-tree violation:

```text
FAIL ... H-2: 캡처 목적지로 쓰이는 docs/qa 경로 상수는 전부 resolveQaShotsDir 를 경유한다
커밋 QA 증거로 직접 쓰는 경로 상수 발견 — resolveQaShotsDir() 경유 필수:
1001-live-qa/capture.mjs → const OUT
```

This was not a rollback of any of the four `.mjs` files in `559adce44`; it was the untracked `clients/desktop/playwright/1001-live-qa/capture.mjs` being newly included by the H-2 guard. Only that harness `OUT` path was corrected to call `resolveQaShotsDir()`. No QA captures were deleted and no product code was changed.

### Phase 4 — GREEN 원문

실행 명령:

```text
npm test -- --run src/renderer/api/mock.test.ts src/renderer/test-utils/harness-false-green-guard.test.ts
```

GREEN 원문:

```text
✓ src/renderer/api/mock.test.ts (128 tests) 176ms
✓ src/renderer/test-utils/harness-false-green-guard.test.ts (49 tests) 6681ms

Test Files  2 passed (2)
Tests       177 passed (177)
Duration    7.54s
```

실패 원문:

```text
FAIL src/renderer/api/mock.test.ts > mock business document number contract > renderer document-number field literals use standard format or explicit markers
AssertionError: expected [ { …(3) } ] to deeply equal []

- Expected
+ Received

- Array []
+ Array [
+   Object {
+     "field": "journalNo",
+     "file": "src/renderer/print/PartnerLedgerView.test.tsx",
+     "value": "JR-2026-05-06-003",
+   },
+ ]

src/renderer/api/mock.test.ts:1225:24
```

테스트 결과: 128개 중 127 passed, 1 failed. 보고된 3건은 동일 위반 객체의 `field`, `file`, `value` 세 실제 항목이다.

### Phase 2 — 판정 및 최근 변경 대조

- 위반 값: `src/renderer/print/PartnerLedgerView.test.tsx`의 `journalNo: 'JR-2026-05-06-003'`
- 판정: **(나) 규약 밖 값인데 명시적 마커가 빠진 경우**.
- 근거: 표준 형식은 `yyyy/MM/dd-N`이므로 `JR-2026-05-06-003`은 슬래시·날짜 선행 형식을 만족하지 않는다. 그러나 이 값은 제품 mock 응답이나 화면 기본값이 아니라, R14에서 저장된 BE 분개번호(`JR-...`)를 그대로 보존·렌더링하는 회귀 테스트 fixture이다. 따라서 값을 표준형으로 바꾸면 테스트가 검증하던 “저장값 그대로 표시” 계약이 사라지고, 제품 동작을 바꾸지 않는 이번 범위에도 맞지 않는다. 테스트 가드의 명시 허용 마커 목록에 이 외부 계약 fixture를 등록하는 것이 정합하다.

직전 H-2 커밋 `559adce44`의 변경 파일은 다음 네 `.mjs` 하네스뿐이다:

```text
clients/desktop/playwright/1001-partner-ledger-real-qa/capture.mjs
clients/desktop/playwright/1001-partner-ledger-real-qa/electron-probe.mjs
clients/desktop/playwright/1001-partner-ledger-real-qa/probe.mjs
clients/desktop/playwright/1001-partner-ledger-real-qa/run-scenario.mjs
```

이 네 파일은 QA 캡처 경로를 `resolveQaShotsDir()`로 바꿨고 `PartnerLedgerView.test.tsx`는 건드리지 않았다. 문제의 `JR-2026-05-06-003` fixture는 그보다 앞선 `28815b3c9`에서 추가됐다. 따라서 직전 `.mjs` 변경은 원인이 **아니다**.

### 2026-08-03 정정 라운드 — 실 DB 형식에 맞춘 fixture 복구

개발책임자 정정에 따라 직전 판정을 폐기했다.

1. `ALLOWED_NON_DOCUMENT_MARKERS`에서 `JR-2026-05-06-003`을 제거했다. 현재 mock 가드는 이 값을 명시 허용하지 않으며, `mock.test.ts`의 저장 분개번호 형식 검사는 실 경로의 형식 위반을 계속 드러낸다.
2. `PartnerLedgerView.test.tsx`의 fixture를 `2026/05/06-3`으로 변경했다. PM이 확인한 `accounting_db.journals.journal_no` 전수 요약(124/124건)이 `^\d{4}/\d{2}/\d{2}-\d+$`와 일치하고 `JR-%`가 0건이며, 저장 표본도 `2027/01/30-1`, `2027/01/25-1`, `2027/01/20-1`이므로 이 값은 백엔드가 만들 수 있는 형식이다.
3. 원래의 “분개번호 훼손 없이 표시” 의도는 유지했다. `storedJournalNo`를 mock 반환값과 기대값에 함께 쓰되, 렌더된 노드의 `textContent`가 `2026/05/06-3`과 정확히 일치하는지 단언한다. 실 형식은 zero-padding을 허용하지 않으므로 `003` 대 `3` 비교는 폐기했다. 대신 번호가 변형된 `2026/05/06-4`가 렌더되지 않는 회귀 단언을 남겼다. 이는 기대 문자열을 단순히 찾는 것에 그치지 않고 실제 표시 텍스트의 전체 문자열 보존을 검증한다.

#### 이번 라운드 GREEN 원문

실행 명령:

```text
npm test -- --run src/renderer/api/mock.test.ts src/renderer/test-utils/harness-false-green-guard.test.ts src/renderer/print/PartnerLedgerView.test.tsx
```

```text
✓ src/renderer/api/mock.test.ts (128 tests) 226ms
✓ src/renderer/print/PartnerLedgerView.test.tsx (4 tests) 194ms
✓ src/renderer/test-utils/harness-false-green-guard.test.ts (49 tests) 7154ms

Test Files  3 passed (3)
Tests       181 passed (181)
Duration    7.97s
```

#### 변경 파일 및 보존 범위

- `clients/desktop/src/renderer/print/PartnerLedgerView.test.tsx`: 실 형식 fixture와 훼손 없음 단언 수정.
- `docs/dev-reports/2026-08-03-1001-ci-mock-number-fix.md`: 본 정정 결과 append.
- `clients/desktop/src/renderer/api/mock.test.ts`: 직전 작업 트리의 잘못된 허용 목록 등재를 되돌려 HEAD 기준으로 복구됨(최종 diff에는 남지 않음).
- `clients/desktop/playwright/1001-live-qa/`: 미추적·`-real-qa` 접미사 없음이므로 커밋 대상에서 제외. 내부 `capture.mjs` 수정은 보존한다.
- `docs/qa/**`: 삭제·변경 없음. H-2 `resolveQaShotsDir()` fix와 커밋 캡처를 보존했다.
- 제품 코드는 변경하지 않았으며, commit/push도 실행하지 않았다.

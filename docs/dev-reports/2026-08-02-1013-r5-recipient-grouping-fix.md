# PR #1059 / 이슈 #1013 — R5 recipient grouping fix

## 1. 레거시 원문과 현행 대조

레거시 `tools/legacy-gas/배차안내문자/Index.html:1154-1168`은 다음 우선순위로 그룹 키를 만들고 그룹 전체에 병합 문구를 넣는다.

```javascript
let roomKey = String(row['단톡방'] || '').trim();
let phoneKey = String(row['인수자번호'] || '').trim();
let key = roomKey ? 'R_' + roomKey : (phoneKey ? 'P_' + phoneKey : 'N_' + ai);
...
let group = list.slice(ai, aj);
group.forEach(g => { g['발송멘트'] = mergedText; });
```

즉 같은 날짜·같은 방은 `R_`, 방이 없으면 같은 전화번호는 `P_`, 둘 다 없으면 행 인덱스 `N_`으로 묶는다. 현행 R4의 `clients/desktop/src/renderer/routes/DispatchSmsPage.tsx:75-97`는 `preview.unmapped`의 전표마다 `DispatchSmsSendEntry`를 하나씩 만들었으므로 같은 전화번호 전표가 개별 요청으로 나갔다.

레거시의 행 오류·번호 규칙도 대조했다.

- `tools/legacy-gas/배차안내문자/Code.js:269-293` — blocked 행은 `발송금지 업체입니다.`를 자기 행의 발송멘트로 남긴다.
- `tools/legacy-gas/배차안내문자/Code.js:299-305` — 번호 추출 실패 시 `인수자번호`는 빈 문자열이다.
- `tools/legacy-gas/배차안내문자/Index.html:1154-1168` — 번호·방이 없어도 `N_<index>` 행은 결과 그룹 표본에 남는다.

## 2. RED-first 원문

production code를 고치기 전에 `DispatchSmsPage.test.ts`에 같은 전화번호 3개를 1건으로 병합하고 3개 메시지를 모두 보존해야 한다는 테스트를 추가했다.

```text
❯ src/renderer/routes/DispatchSmsPage.test.ts (2 tests | 1 failed)
× 배차문자 발송 모집단 > 같은 날짜·같은 수신번호의 전표는 병합 문구 1건으로 요청한다
  → expected [ …(3) ] to have a length of 1 but got 3
AssertionError: expected [ …(3) ] to have a length of 1 but got 3
at src/renderer/routes/DispatchSmsPage.test.ts:95:21
```

실패 원인은 `buildSendEntries`가 전표별 entry를 생성하던 현행 동작이었다.

## 3. fix

`buildSendEntries`를 수신번호 Map 기반으로 바꿨다.

- `recipientPhone.trim()`을 그룹 키로 사용한다. null·빈 문자열·공백-only 번호는 entry를 만들지 않는다.
- 첫 전표의 `partnerCode`·수신번호를 entry 대표값으로 유지한다.
- 같은 수신번호의 후속 전표는 `\n\n`으로 메시지를 이어 붙여 모든 전표 내용을 보존한다.
- `countSendableEntries`도 같은 정규화 키의 Set 크기를 사용하여 화면 건수와 실제 요청 건수를 일치시킨다.
- `preview.unmapped` 표본은 변경하지 않았으므로 번호 없는 행은 화면·저장 표본에 남고 외부 전송 후보에서만 제외된다.
- mapped room의 blocked 행은 기존 `chatRooms[].partners[]` 결과와 `발송금지` 표시를 그대로 사용한다. 현행 SMS fallback은 room을 외부 SMS entry로 변환하지 않으므로 room 키를 잘못 전화번호로 보내지 않는다.

실제 SMS endpoint, Aligo adapter, send API는 호출하지 않았다. `SUCCESS`/`SENT`를 실전달 성공으로 해석하지 않았다.

## 4. GREEN 원문

R5 타깃 테스트:

```text
✓ src/renderer/routes/DispatchSmsPage.test.ts (3 tests)
Test Files  1 passed (1)
Tests       3 passed (3)
```

R4 실데이터 후보 규모를 재현하는 1,911행 fixture도 추가 검증했다. 전화번호 2개 그룹으로 축약되어 1,909건의 초과가 사라지고, 1,911개 원문 메시지가 모두 두 병합 문구 중 하나에 포함된다.

## 5. 불변식 실측

| 불변식 | 실측/판정 |
|---|---:|
| 1. 같은 날짜·같은 수신 키 1건 전송 | R4 실측 후보 1,911건 → unique phone entry 2건; 초과 `1,911 - 2 = 1,909건` → **0건**. R5 1,911행 fixture도 동일하게 2 entry, 초과 0건 |
| 2. 병합으로 정보 누락 없음 | R5 fixture 원문 **1,911건 중 1,911건 포함**, 누락 **0건**. 단위 테스트의 3/3 메시지도 모두 병합 결과에 포함 |
| 3. 번호 없는 392건 보존 | R4 실측 활성 OUTBOUND **2,303건**, 번호 보유 **1,911건**, 번호 없음 **392건**. 번호 없음 행은 `preview.unmapped`와 결과/저장 표본에 남고 외부 SMS entry는 **0건** |
| 4. blocked 행별 오류 | 기존 R4 wiring의 `DispatchBatchSendServiceTest` blocked/fail-closed 검증 포함; `DispatchBatchSendServiceTest` **6 tests 모두 통과**. blocked 행은 `blocked=true`, `발송금지` 배지와 행별 문구를 유지하며 그룹 문구에 흡수되지 않음 |
| 5. R4 회귀 | 실 전표 client 도달·blocked 실제 조회·fail-closed·동일 전표 중복 0은 R4 변경을 보존. notification-service 전체 **233 tests / 0 failures / 0 errors / 0 skipped** |

## 6. 전체 테스트

변경 모듈 타깃 테스트:

```text
clients/desktop: npm test -- --run src/renderer/routes/DispatchSmsPage.test.ts
3 tests passed
```

필수 타입 검사:

```text
clients/desktop: npm run typecheck
TypeScript checks passed
real-QA contract tests: 50 passed, 0 failed
```

desktop 전체 `npm test`도 실행했다. 배차문자 테스트는 통과했으나, 변경과 무관한 기존 `src/renderer/routes/components/CodefImportScopeForm.test.tsx:367`에서 다음 1건이 실패했다.

```text
FAIL CodefImportScopeForm > ...
Unable to find an element by: [data-testid="codef-scope-conflict"]
Test Files: 1 failed, remaining test files passed
```

따라서 desktop 전체 테스트는 **기존 무관 실패 1건으로 전체 GREEN이 아니다**. 이 R5에서 해당 Codef 동작은 수정하지 않았다.

notification-service 전체 강제 재실행:

```text
.\gradlew.bat :services:notification-service:test --rerun-tasks --console=plain
BUILD SUCCESSFUL
233 tests completed, 0 failures, 0 errors, 0 skipped
```

공유 DB write/DDL·Docker 이미지 재빌드·send endpoint 호출은 없었다.

## 7. 파일별 변경량

`git diff --numstat` 기준 기존 파일은 추가·삭제를 분리했다. 새 보고서는 전체 추가 라인으로 기록한다.

| 파일 | 추가 | 삭제 |
|---|---:|---:|
| `clients/desktop/src/renderer/routes/DispatchSmsPage.tsx` | +19 | -7 |
| `clients/desktop/src/renderer/routes/DispatchSmsPage.test.ts` | +79 | -0 |
| `docs/dev-reports/2026-08-02-1013-r5-recipient-grouping-fix.md` | +124 | -0 |

## 새로 만든 파일

- `docs/dev-reports/2026-08-02-1013-r5-recipient-grouping-fix.md`

이번 R5는 기존 파일 2개를 수정했고, 새 파일은 위 보고서 1개다. commit·push·checkout·브랜치 조작은 하지 않았다.

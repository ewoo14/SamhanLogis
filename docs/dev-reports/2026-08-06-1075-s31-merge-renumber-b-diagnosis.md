# #1075 S31 병합·마이그레이션 개번·B 결함 규명

## 판정 요약

- `origin/main` 병합은 텍스트 충돌 없이 완료했고, 병합 커밋은 만들지 않았다.
- `V113__add_estimate_specification_source.sql`을 `V116__add_estimate_specification_source.sql`로 개번했다.
- B는 (a)가 아니라 **(b) 품목 해제 후 저장이 막히는 실제 결함**이다.
- 저장 버튼은 disabled 상태가 아니며, `buildBody()`의 유효 라인 가드가 `null`을 반환해 mutation과 PUT을 막는다.
- 이 가드는 화면에 오류를 표시하므로 완전한 무반응은 아니지만, 백엔드가 허용하는 전체 라인 삭제 계약과 모순되는 잘못된 차단이다.
- 결함을 수정하지 않고, 수정 전 실패를 고정하는 S31 RED만 추가했다.
- Docker 재빌드·재배포, commit, push는 실행하지 않았다.

## 1. `origin/main` 병합 결과와 의미 충돌 검토

### 실행 결과

```text
git fetch origin                                      exit 0
git rev-list --left-right --count HEAD...origin/main  26 7
git merge-tree HEAD origin/main                       exit 0, conflict marker 없음
git merge --no-commit origin/main                     exit 0
```

`origin/main`의 7개 커밋은 memory와 handoff 문서 변경이었다. 병합으로 들어온 변경에는 `clients/` 또는 `services/` 코드가 없었다.

따라서 다음의 의미 충돌 가능성을 확인했다.

- #874 거래처 전역DC·고정DC: 이 병합의 incoming diff에 판매전표/견적 단가 경로 코드가 없으므로, 병합 해소로 해당 경로가 덮어써지거나 붙은 부분은 없다. #874 코드는 이미 이 브랜치 쪽 이력에 존재한다.
- #1069 세트 전개 및 V114/V115 예약: 이번 incoming diff에 세트 전개 코드 또는 migration 파일이 없었다. 현재 브랜치의 migration 번호는 `V112` 다음이 `V116`이 되도록 정합화했다.

병합 후 작업 트리에는 incoming memory/handoff 변경이 staged 상태로 남아 있으며, 병합 커밋은 만들지 않았다.

## 2. 마이그레이션 개번 및 전수 조사

### 변경

- 삭제: `services/slip-service/src/main/resources/db/migration/V113__add_estimate_specification_source.sql`
- 추가: `services/slip-service/src/main/resources/db/migration/V116__add_estimate_specification_source.sql`
- SQL 내용은 변경하지 않고 파일 버전만 `V116`으로 이동했다.
- migration 디렉터리의 마지막 연속 번호는 `V110`, `V111`, `V112`이며, 신규 파일은 `V116`이다.

### grep 결과

다음 코드·설정·테스트 범위에서 `V113` 및 `add_estimate_specification_source`를 조사했다.

```text
services clients scripts 및 sql/ts/tsx/java/kt/properties/yml/yaml/json 대상 rg
rg exit 1 (일치하는 참조 없음)
```

파일명과 SQL 파일만 정합화할 코드 참조는 없었다. 전체 저장소에서 남은 참조는 다음의 역사 기록이다.

- `docs/handoff/CURRENT-WORK.md:1784` — 당시 #1078 예약 번호 기록
- `.claude/memory/feedback_migration_number_three_counts.md:46,54` — 과거 migration 번호 교훈
- `docs/qa/1075-s26-real-qa/qa-report.md:13,34` — S26 당시 V113 상태를 기록한 QA 보고서
- `docs/dev-reports/**` — 과거 실행 이력

위 기록은 당시 상태를 보존해야 하므로 수정하지 않았다. 특히 `docs/dev-reports`의 과거 V113 언급은 변경하지 않았다.

## 3. B 결함 코드 추적

### 저장 버튼에서 PUT까지의 경로

1. 모델명 입력을 지우고 blur하면 desktop 경로의 `onInputCommitChange`가 실행된다.
   - `clients/desktop/src/renderer/routes/EstimateFormPage.tsx:2151-2154`
   - mobile에도 동일한 경로가 `:2058-2061`에 있다.
2. `handleProductSelection(i, null)`이 호출된다.
   - `EstimateFormPage.tsx:1549-1563`
   - 이 분기에서 `productId: null`, `modelName: ''`, `productName: ''`을 기록하고, 자동 규격이면 규격도 비운다.
3. 저장 버튼은 품목 유효성 때문에 disabled 되지 않는다.
   - `EstimateFormPage.tsx:2443-2447`
   - disabled 조건은 pending/coedit pending/가격 확인 중/미해결 가격뿐이며 `productId`가 없는 라인은 포함하지 않는다.
4. 클릭은 `handleSave`로 들어간다.
   - `EstimateFormPage.tsx:1725-1727`
5. `buildBody()`는 `productId`와 양수 수량을 모두 가진 라인만 `valid`로 만든다.
   - `EstimateFormPage.tsx:1674-1676`
6. 유일한 라인이 해제되면 `valid.length === 0`이 된다.
   - `EstimateFormPage.tsx:1677-1681`
   - `topError`를 설정하고 `null`을 반환한다.
7. `handleSave`의 `if (!body) return`에서 종료한다.
   - `EstimateFormPage.tsx:1725-1728`
8. 따라서 `updateMutation.mutate()`가 호출되지 않는다.
   - edit PUT mutation 정의: `EstimateFormPage.tsx:1610-1617`
   - mutation 발화 지점: `EstimateFormPage.tsx:1728-1740`
   - 결과적으로 `PUT /estimates/{id}`는 발생하지 않는다.

### 의도된 가드인가

`valid.length === 0` 가드와 오류 문구는 “최소 1개 라인을 입력해야 한다”는 프론트엔드 정책으로 명시되어 있으므로, 우연한 예외나 mutation 누락은 아니다. 다만 이 정책이 편집 화면의 전체 라인 삭제 상태에도 적용되어 잘못된 차단이 된다.

백엔드 계약은 반대다.

- `services/slip-service/src/main/java/com/samhanair/logis/slip/estimate/web/dto/UpdateEstimateRequest.java:17-18`
  - `lines == null`은 라인 보존, 빈 list는 모든 라인 제거, 값이 있는 list는 교체로 정의한다.
- `services/slip-service/src/test/java/com/samhanair/logis/slip/estimate/service/EstimateUpdateLineIdContractTest.java:237-250`
  - `update_onBundleEstimate_withEmptyLines_isAcceptedAsExplicitFullDeletion`가 `List.of()` 전체 삭제를 허용하고 라인이 비워지는 것을 검증한다.

따라서 가드 자체는 의도되었지만, 빈 `lines`를 유효한 명시적 전체 삭제로 정의한 수정 계약과 불일치한다. 이는 **(b) 실제 결함**이다. 제3의 원인은 확인되지 않았다.

### 사용자에게 보이는 결과

완전히 조용한 무반응은 아니다.

- `EstimateFormPage.tsx:2402-2408`에서 `topError`를 `role="alert"`로 표시한다.
- 표시 문구는 `라인 1개 이상 (모델명 lookup 성공 + 수량 > 0) 을 입력하세요.`이다.

즉 사용자는 저장을 다시 시도할 수 있지만, 실제로는 품목을 모두 해제한 합법적 편집을 저장할 수 없고 “라인을 입력하라”는 잘못된 안내만 받는다. 현재 상태에서 사용자가 할 수 있는 저장 가능한 경로는 품목과 양수 수량을 다시 입력하는 것뿐이다.

## 4. 재현 RED

추가한 테스트:

- `clients/desktop/src/renderer/routes/EstimateFormPage.coedit.test.tsx:732-749`
- 테스트명: `S31 RED: 유일한 품목을 해제한 편집 견적도 빈 lines로 PUT 저장한다`
- 유일한 모델명을 지우고 blur한 뒤 저장 버튼을 클릭하고, `updateEstimate('estimate-1', { lines: [] })`가 호출되어야 한다는 계약을 고정한다.

실행:

```text
npx vitest run src/renderer/routes/EstimateFormPage.coedit.test.tsx --reporter=dot
exit 1
Test Files  1 failed (1)
Tests       46 passed | 1 failed (47)
```

실패 원문:

```text
expected "spy" to be called 1 times, but got 0 times
```

실패 위치는 `EstimateFormPage.coedit.test.tsx:745`의 `mocks.updateEstimate` 호출 검증이다. 이 RED는 현재 구현이 `buildBody()`에서 반환되어 PUT을 발화하지 않는 사실을 재현한다.

## 5. 실행 명령과 종료 코드

| 명령 | 종료 코드 | 결과 |
|---|---:|---|
| `git fetch origin` | 0 | origin 갱신 |
| `git merge-tree HEAD origin/main` | 0 | 텍스트 충돌 없음 |
| `git merge --no-commit origin/main` | 0 | 병합 완료, commit 전 정지 |
| `npm run typecheck` | 0 | 최종 실행 성공, freshness/cleanup/scope 포함 |
| `npx vitest run src/renderer/routes/EstimateFormPage.coedit.test.tsx --reporter=dot` | 1 | 기존 테스트 46 통과, 의도된 S31 RED 1 실패 |
| `npx vitest run src/renderer/routes/EstimateFormPage.coedit.test.tsx --reporter=verbose --testNamePattern='S31 RED'` | 1 | S31 RED 재현 |
| `./gradlew :services:slip-service:test --tests "*Estimate*" --console=plain` | 0 | `BUILD SUCCESSFUL in 1m 46s` |
| migration 참조 `rg` | 1 | 코드·설정·테스트 대상 일치 없음 |
| `git diff --check` | 0 | whitespace 오류 없음 |

`npm run typecheck`는 최종 실행에서 exit 0을 받았다. 초기 기본 제한 시간 실행 두 번은 124로 종료되었으나, 더 긴 제한 시간으로 재실행해 전체 typecheck 하네스가 통과한 것을 확인했다.

## 6. 신규 파일 및 변경 파일

신규 파일:

- `docs/dev-reports/2026-08-06-1075-s31-merge-renumber-b-diagnosis.md` — 본 보고서
- `services/slip-service/src/main/resources/db/migration/V116__add_estimate_specification_source.sql`

변경 파일:

- `clients/desktop/src/renderer/routes/EstimateFormPage.coedit.test.tsx` — S31 RED 추가
- `services/slip-service/src/main/resources/db/migration/V113__add_estimate_specification_source.sql` — V116으로 이동하며 삭제

병합으로 staged 된 기존 파일은 `.claude/memory/**` 및 `docs/handoff/CURRENT-WORK.md`다. 이번 작업에서는 애플리케이션 B 결함을 수정하지 않았고, commit/push와 Docker 배포도 하지 않았다. B의 최종 실행 확인은 사용자가 지정한 다음 배포 라운드로 넘긴다.

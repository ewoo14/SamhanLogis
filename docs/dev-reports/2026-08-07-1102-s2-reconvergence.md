# PR #1103 / 이슈 #1102 S2 적대검증 재수렴

## 검증 좌표

```text
cwd       C:\dev\Samhan-Public
branch    chore/1102-flaky-slipform-price-idref
HEAD      1650190e0d8a5cb596675fbf28fee66934adcac0
comparison git diff origin/main..1650190e0
merge-base 06b468a805cd741ee6bcc3b4fb9a5776f5b314c3
PR 자체   1650190e0^..1650190e0 (2파일, +140)
```

`origin/main..1650190e0`은 PR 생성 뒤 `origin/main`이 전진해 #1075 계열 등을 포함한 136파일 양방향 차이를 보인다. PR #1103의 실제 커밋은 `SlipFormPage.test.tsx` 4줄 추가와 진단 보고서 1파일 추가뿐이다.

## 본 범위와 안 본 범위

본 범위는 (1) 추가된 `waitFor`가 최종값·IDREF 단언을 가리는지, (2) 관측된 `1000`이 실제 사용자 렌더 경로에 노출되는지, (3) PR 본문의 실측·원문 주장이 재현되는지다.

범위 외인 테스트 강도 일반론, 커버리지, 네이밍, 리팩터링, #1075 계열을 포함한 비교 노이즈 134개 파일의 기능, 백엔드 서비스, Docker·배포·라이브 서비스는 조사하지 않았다. 다른 워크트리는 열거나 변경하지 않았다.

## ① 단정 보존 결과

단정은 보존됐다.

- 추가 대기: `SlipFormPage.test.tsx:2245-2248`의 `getPriceMemories(partnerB.id, [productA.id])` 호출 계약
- 최종값: `:2249`의 `unitPrice === "200000"`
- 변경 표지: `:2250`
- IDREF 순서·개수·실재 DOM: `:2257-2262`의 `[note.id, changed.id]`, 길이 2, 양쪽 `getElementById` 동일성
- card-level `aria-describedby` 부재: `:2263`

다만 새 호출 대기 자체가 최종 DOM 상태를 보장하는 것은 아니다. API mock 호출은 Promise 완료와 React state 반영보다 앞선다. 이 PR은 바로 뒤의 최종값·표지·IDREF 단언을 그대로 두었기 때문에 아무 때나 통과하지는 않지만, 별도 `waitFor`를 하나 더 둬 호출 전과 호출 후에 각각 새 timeout 예산을 주는 효과가 있다. 따라서 플래키 완화는 설명되지만 제품 상태의 정확성을 증명하는 대기는 아니다.

## ② 감춰진 제품 결함 결과

실사용자 도달 결함 1건을 발견했다.

`SlipFormPage.tsx:1303-1326`은 거래처가 선택된 상태에서 품목을 고르면 최근단가 조회 전에 카탈로그 `fallbackUnitPrice`를 `nextLine.unitPrice`로 즉시 기록한다. 모바일 input은 `:394`에서 이를 그대로 렌더한다. 이후 `:1390-1425`의 단건 조회가 끝나야 기억 단가로 덮인다.

따라서 `거래처 A 선택 → 판매가 1000인 품목 A 선택 → 조회 완료 전 관찰`이라는 실 사용자 경로에서 `1000`이 잠깐 보이고, 이후 `100000`으로 바뀐다. `최근단가 확인 중…` 표시와 저장 차단은 존재하지만 값 자체의 사용자 노출은 막지 않는다. 개발책임자가 제시한 판정 기준에 따라 이는 테스트만 고쳐서는 안 되는 제품 결함이다.

제시된 두 갈래 밖의 셋째 가능성도 확인했다. PR의 호출 대기는 응답 완료를 보장해서 고친 것이 아니라, 호출까지의 대기와 최종 DOM 대기를 둘로 나눠 총 timeout 여유를 늘린다. 즉 “잘못된 조건이라 아무 때나 통과”도 아니고 “제품 상태 완료를 직접 기다림”도 아닌, **테스트 스케줄링 여유 확대 + 기존 최종 단언 유지**다. 이 사실은 제품의 중간값 노출 결함과 양립한다.

상세 fix 지시: `docs/dev-reports/2026-08-07-1102-s2-fix-directive.md`.

## ③ 증거 무결성 결과

### 대상 20회

```text
npx vitest run src/renderer/routes/SlipFormPage.test.tsx --reporter=basic
20/20 실행 성공, 실패 0
각 실행 exit 0; 파일에는 95 tests가 있으며 CI PR head도 Frontend Desktop 성공
```

### 전체 1,918/1,922

```text
npx vitest run --reporter=basic
Test Files  1 failed | 210 passed (211)
Tests       4 failed | 1918 passed (1922)
EXIT        1
```

네 실패는 모두 `src/renderer/test-utils/harness-false-green-guard.test.ts`에서 재현됐다.

### 실패 4건의 로컬 잔재

현재 워크트리에서 다음 네 파일이 모두 실제 존재하고, 각각 `git ls-files -- <path>` 결과가 비어 있다.

```text
clients/desktop/playwright/n3b-fcm-push-real-qa/n3b-real-qa.spec.ts
clients/desktop/playwright/coedit-s3-3-accounting/coedit-s3-3-accounting-real-qa.spec.ts
clients/desktop/playwright/n1b-native-qa/n1b-real-qa.spec.ts
.claude/tmp/arologis-qa/capture.cjs
```

네 파일 모두 `git check-ignore -v`로 `.gitignore` 대상임을 확인했다. 따라서 PR의 “untracked 로컬 잔재”는 Git 비추적이라는 의미로는 사실이지만, `git status --porcelain`에 나타나는 일반 untracked가 아니라 **ignored·untracked 로컬 파일**이라고 쓰는 편이 정확하다. 전체 실패 메시지는 이 네 파일을 각각 직접 지목했다. H-2와 G8c는 추가 ignored 파일도 함께 열거하지만 실패 테스트 수는 보고대로 4건이다.

### SHA 원문

- `git diff --stat 9c71030ce..7f45ebebc`는 `docs/dev-reports/2026-08-07-1065-qa-readiness.md` 1파일, 4+/4-만 출력했다. 코드 차이는 0이다.
- GitHub Actions run `31142655806`은 `9c71030ce`의 CI success다.
- `7f45ebebc`의 CI run `31142932338`은 attempt 1의 Frontend Desktop job `92756681956`이 실패했고, 로그 원문은 `Expected "200000" / Received "1000"`, `SlipFormPage.test.tsx:2245`, `1 failed / 1921 passed`다.
- 같은 run의 attempt 2는 success다.

증거 무결성 결함은 발견하지 않았다. 다만 위 ignored/untracked 용어 정밀화가 필요하다.

## 판정

**실 사용자 경로로 재현 가능한 결함 1건. PR #1103은 현재 상태로 결함 0 판정할 수 없다.**

IDREF와 최종값 단언은 유지됐고 PR의 실측 증거도 재현됐지만, 테스트 실패가 읽은 카탈로그 중간값은 제품 렌더 경로에서도 사용자에게 노출된다. 제품 상태 경계를 먼저 바로잡고 양방향 RED로 재검증해야 한다.

## 새 파일 목록

검증 종료 시 `git status --porcelain=v1 --untracked-files=all` 기준으로 본 S2가 추가한 파일은 다음 두 개다.

```text
?? docs/dev-reports/2026-08-07-1102-s2-fix-directive.md
?? docs/dev-reports/2026-08-07-1102-s2-reconvergence.md
```

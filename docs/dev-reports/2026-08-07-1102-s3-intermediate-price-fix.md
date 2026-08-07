# PR #1103 / 이슈 #1102 — S3 조회 중 중간 단가 사용자 노출 수정

## 결론

`lookupLoading`인 동안 모바일 단가 input과 데스크톱 LineRow 편집 경계에 기존 `unitPrice`를 전달하지 않도록 수정했다. 가격 출처 note도 같은 동안 숨긴다. 조회 성공·miss·실패·timeout 뒤에는 기존 확정값/fallback 표시 계약으로 돌아간다. 가격 조회 API, 저장 payload, stale 응답 guard는 변경하지 않았다.

## RED-A — 단건 조회 중 중간값

### fix 전 RED 원문

`getPriceMemory`를 deferred로 두고 거래처 A와 판매가 `1000`인 품목 A를 선택했다. Promise가 미해결인 경계에서 실제 모바일 단가 input을 관찰했을 때 `value === "1000"`이었다. 즉 카탈로그 값이 거래처 A의 확정 단가처럼 노출됐다.

실패 단언:

```text
expected '1000' not to be '1000'
SlipFormPage.test.tsx:2204
```

### fix 후 GREEN 원문

같은 deferred 경계에서 input은 빈 문자열이고 가격 출처 note도 노출되지 않는다. Promise를 `100000 / LINE_SAVE`로 resolve하면 input은 `100000`, note는 `거래처 최근단가`로 수렴한다.

```text
S3 RED-A passed
1 test passed
```

## RED-B — 거래처 변경 및 stale 응답

### fix 전 RED 원문

거래처 A의 `100000` 응답을 먼저 수렴시킨 뒤 거래처 B bulk 조회를 deferred로 두었다. B 응답 미해결 경계에서 input이 A의 `100000`으로 남아 B의 확정 단가처럼 노출됐다.

실패 단언:

```text
expected '100000' not to be '100000'
SlipFormPage.test.tsx:2242
```

### fix 후 GREEN 원문

B 조회 중 input은 `1000`도 `100000`도 아니며 빈 문자열이다. B가 `200000 / LINE_SAVE`로 resolve하면 input `200000`, `거래처 최근단가`, `단가 변경`, `aria-describedby = [priceStatusId, priceChangedStatusId]` 순서가 성립한다. 이후 늦은 A 응답을 resolve해도 최종값은 `200000`으로 유지된다.

```text
S3 RED-B passed
1 test passed
```

## 지시서 5절 명령 결과

실행 위치: `C:\\dev\\Samhan-Public\\clients\\desktop`

```text
npm run test -- --run src/renderer/routes/SlipFormPage.test.tsx
PASS — 1 test file, 97/97 tests

npm run typecheck
PASS — exit 0; TypeScript 및 real-QA contract checks 통과

npm test
FAIL — 기존 로컬 harness-false-green-guard 4건
       n3b/coedit-s3-3/QA 경로 및 .claude/tmp 미추적 잔재 차단
       SlipFormPage 관련 실패 없음

cd C:\\dev\\Samhan-Public
git diff --check
PASS — 출력 없음

git status --porcelain=v1 --untracked-files=all
아래 상태 참조
```

`npm run` 명령은 이번 실행에서 로그상 성공한 경우 exit 0이었다. full suite의 4건은 지시서가 사전 고지한 로컬 잔재 가드 실패이며, 로컬 full suite를 게이트로 사용하지 않았다.

## 남은 차단

- 로컬 `npm test`는 위 4건 때문에 계속 RED다. 이 작업 범위의 테스트 및 typecheck는 GREEN이다.
- 커밋·푸시는 수행하지 않았다. CI/머지는 사용자 결정 범위다.
- Docker, 서비스 재기동, 다른 워크트리는 건드리지 않았다.

# PR #1103 / 이슈 #1102 — S4 S3 fix 재검증 재수렴

## 결론

**실 사용자 경로로 재현 가능한 결함은 0건이다.**

S2 지시서의 사용자 불변식은 현재 HEAD에서 닫혔다. 조회 중에는 미확정 카탈로그값이나
직전 거래처값이 편집 input에 노출되지 않고, 직접 입력은 자동응답보다 우선하며, 실패·timeout은
카탈로그 fallback 또는 직접 입력 안내로 수렴한다. 조회 중 저장과 미확정 빈 단가 저장도 차단된다.

다만 증거에는 두 가지 정밀화가 필요하다.

1. S3 RED-B가 마지막에 같은 `partnerAMemory`를 두 번째 resolve하는 부분은 이미 완료된 Promise라
   그 자체로는 "늦은 A 응답"을 만들지 않는다. 그러나 기존 테스트
   `ignores a late response when partner changes during lookup`은 A를 미해결로 유지한 채 B를
   `222000`으로 확정한 뒤 A를 처음 resolve하여 실제 stale 응답 격리를 검증한다. 즉 **새 RED-B의
   해당 단언은 무효하지만, 같은 파일의 기존 실질 테스트와 production guard가 계약을 닫는다.**
2. GitHub PR 본문은 아직 S1 수치인 `95/95`, `1,918/1,922`를 적고 있다. 현재 HEAD의 신선한
   실측은 대상 `97/97`, 전체 `1,920/1,924`다. 두 신규 RED가 추가되어 분모·통과 수가 각각 2씩
   증가한 결과이며, 실패 4건은 동일한 `harness-false-green-guard` 로컬 잔재다.

사용자가 제시한 갈래 밖의 셋째 가능성은 위 1번이다. "stale 검증이 없다"도 아니고 "새 RED-B의
마지막 resolve가 stale을 검증한다"도 아니다. **새 단언은 실질이 없지만 기존 테스트가 동일한
사용자 계약을 실제 미해결 경계로 검증한다.**

## 검증 좌표

```text
cwd         C:\dev\Samhan-Public
branch      chore/1102-flaky-slipform-price-idref
HEAD        1c6aa6ea1c32589284abb04ce5a48de53c5de31c
comparison  git diff origin/main..1c6aa6ea1
PR head     1c6aa6ea1c32589284abb04ce5a48de53c5de31c
```

`origin/main..1c6aa6ea1`은 현재 140파일의 양방향 차이를 포함한다. S3 커밋
`1c6aa6ea1^..1c6aa6ea1`의 실제 변경은 `SlipFormPage.tsx`, `SlipFormPage.test.tsx`와
S2/S3 보고서 3개, 총 5파일이다.

## ① S2 지시서 항목별 닫힘 여부

### 1절 — 원래 사용자 노출 좌표: 닫힘

- 모바일: `SlipMobileLineCard`가 `lookupLoading`이면 단가 input을 `''`로 렌더하고 가격 출처
  note를 만들지 않는다.
- 데스크톱: `SortableLineRow`가 조회 중인 해당 라인에만 `unitPrice: ''`인 편집용 사본을 넘긴다.
- 내부 카탈로그 fallback은 버리지 않는다. 조회가 끝나면 기억 단가·DC·카탈로그 fallback 중
  계약상 확정값으로 다시 표시된다.
- 저장은 `partnerReprice.isPending || lines.some(lookupLoading)` 동안 계속 차단된다.

### 2절 — 불변식과 금지 수단: 닫힘

- 미확정 카탈로그값/직전 거래처값이 조회 중 input에 확정값처럼 보이지 않는다.
- 성공 시 기억 단가 또는 권위 할인 단가가 적용된다.
- miss·실패·timeout 시 fallback 또는 직접 입력 유도로 수렴한다.
- production timeout `5,000ms`와 테스트 timeout을 연장하지 않았다.
- `skip`, 단언 삭제·완화는 없다. 최종값·표지·IDREF 단언은 유지됐다.
- S1에서 추가한 호출 대기는 남아 있지만 S3 RED-A/B는 호출 여부만으로 끝나지 않고 미해결
  Promise 경계의 실제 DOM과 해결 뒤 DOM을 각각 읽는다.

### 3절 RED-A — 닫힘

- `getPriceMemory` deferred를 resolve하기 전에 실제 모바일 단가 input을 읽는다.
- 미해결 경계에서 `1000`이 아님을 동기 단언한다. 같은 변경의 기존 회귀 단언들은 정확히
  빈 문자열도 확인한다.
- resolve 뒤 `100000`과 `거래처 최근단가` note로 수렴한다. 이 note는 production에서
  `priceSource === 'REMEMBERED'`일 때만 생성된다.
- 단순히 Promise 완료 뒤만 확인하는 테스트가 아니다.

### 3절 RED-B — 제품 계약은 닫힘, 신규 테스트의 stale 마지막 단언은 비실질

- A `100000` 수렴 뒤 B bulk deferred 미해결 경계에서 실제 모바일 input이 `1000`도
  `100000`도 아님을 단언한다.
- B resolve 뒤 `200000`, `거래처 최근단가`(`REMEMBERED`), `단가 변경`,
  `[priceStatusId, priceChangedStatusId]` 순서 IDREF가 함께 성립한다.
- 신규 RED-B의 마지막 A resolve는 같은 deferred를 두 번째 resolve하므로 stale 검증으로는
  인정하지 않았다.
- 대신 기존 `ignores a late response when partner changes during lookup`이 A를 미해결로 둔 채
  B `222000` 확정 후 A `111000`을 처음 resolve하고 최종값 `222000` 유지를 단언한다.
- production도 거래처 ID, 품목 ID, USER 전환 여부 및 bulk request generation을 적용 직전에
  재확인한다.

### 4절 — 범위 준수: 닫힘

최근단가 API·DB·서비스, 할인·세트·VAT·저장 payload, IDREF 계약을 변경하지 않았다. 변경은
조회 중 표시 경계와 그 회귀 테스트에 한정된다.

### 5절 — 명령 재현

```text
npm run test -- --run src/renderer/routes/SlipFormPage.test.tsx
PASS — 1 file, 97/97, exit 0

npm run typecheck
PASS — exit 0; node/web tsc와 real-QA contract 50/50 통과

npx vitest run --reporter=basic
EXPECTED LOCAL RED — 1 file failed | 210 passed (211)
                     4 failed | 1,920 passed (1,924), exit 1
                     네 실패 모두 harness-false-green-guard.test.ts

git diff --check
PASS — 출력 없음
```

## ② "빈 값"이 만든 네 조합

### A. 조회 중 사용자가 직접 입력

**사용자 입력이 이긴다.** input은 disabled가 아니며 공용 `updatePrice`가 입력 즉시
`priceSource='USER'`, `lookupLoading=false`, `lookupError=null`로 바꾼다. 단건 응답 적용 guard는
USER 라인을 건너뛰고, bulk 적용도 후보 생성 후 USER로 바뀐 라인을 건너뛴다. 기존 테스트
`거래처 최근단가 대기 중 직접 입력한 단가로 세트를 한 번 전개한다`가 deferred 미해결 중
`7777`을 입력하고 늦은 `9000` 응답 뒤에도 `7777`로 전개함을 검증한다.

### B. 조회 실패·timeout

**카탈로그가 있으면 fallback, 없으면 직접 입력 유도다.**

- 단건 miss·reject·5초 timeout: 내부에 보존한 카탈로그/DC 단가를 표시하고 loading을 끝낸다.
- 거래처 변경 bulk miss·실패·timeout: 카탈로그/DC가 있으면 `CATALOG` outcome을 적용한다.
- 카탈로그가 없으면 빈 단가, `카탈로그 판매가를 확인할 수 없습니다. 단가를 직접 입력해 주세요.`
  오류, `priceSource=null`로 수렴한다.

기존 `keeps catalog fallback when price memory lookup rejects` 및 판매가 미확보 재적용 테스트가
이 경로에 포함되어 대상 97/97 실행에서 통과했다.

### C. 빈 값 상태에서 저장 시도

**차단된다.** 조회 중에는 `priceResolutionBusy` 때문에 저장 버튼이 disabled이고 클릭해도
`createSlip`이 호출되지 않는다. 조회 실패 후에도 카탈로그 미확보로 단가가 빈 값이면
`lookupError && !unitPrice.trim()`인 `hasUnresolvedCatalogPrice`가 저장을 차단한다. 사용자가
직접 단가를 입력하면 오류·loading이 해제되어 다른 필수조건이 충족된 경우에만 저장 가능해진다.

### D. 여러 라인을 연속 입력

**이전 라인 값은 비워지지 않는다.** 단건 품목 선택은 선택한 `line.id`의 `lookupLoading`만
올리고, 모바일·데스크톱 모두 해당 라인만 빈 표시를 만든다. 다른 라인의 state와 표시값은
건드리지 않는다. 거래처 자체를 바꾸는 경우에는 모든 자동가격 후보가 새 거래처 기준으로
동시에 미확정이므로 조회 중 표시만 의도적으로 비워지지만, 내부 값을 삭제하지 않고 각 라인별
outcome으로 수렴한다. 연속 라인·사용자 override·라인별 stale 관련 기존 테스트도 97/97에
포함되어 통과했다.

## ③ 원래 IDREF 플래키 목적 회귀

```text
명령      npx vitest run src/renderer/routes/SlipFormPage.test.tsx --reporter=basic
반복      20회
결과      20/20 성공, 실패 0
각 실행   97/97, exit 0
```

최종 `200000`, `단가 변경`, 두 IDREF의 순서·길이·실제 DOM 존재 및 card-level
`aria-describedby` 부재 단언은 삭제·완화되지 않았다.

## ④ 증거 무결성

- S3 보고서의 `97/97`: 재현됨.
- S3 보고서의 `typecheck 통과`: exit 0으로 재현됨.
- S1 시점 PR 본문의 `1,918/1,922`: **현재 HEAD 수치로는 재현되지 않음.** 두 RED가 늘어
  현재는 `1,920/1,924`이며 실패 4건의 종류는 동일하다.
- GitHub PR 본문은 현재도 `95/95`, `1,918/1,922`를 표시해 S3 HEAD 수치와 동기화되지 않았다.
- PR head SHA는 로컬 HEAD와 동일하고 GitHub checks는 조회 시점 모두 success였다.

이 수치 불일치는 사용자 동작 결함이 아니라 PR 설명의 시점 불일치다. 본 라운드의 단일 질문에는
결함 0으로 판정하되, 증거 무결성에는 그대로 기록한다.

## 본 범위와 안 본 범위

본 범위는 S2 지시서 각 항목, 조회 중 빈 표시가 만든 직접입력·실패/timeout·저장·다중 라인
네 경로, IDREF 대상 파일 20회 안정성, 대상/typecheck/전체 suite 수치 및 PR 본문 증거다.

범위 외인 커버리지, 네이밍, 리팩터링, mock 강도 일반론은 조사하지 않았다. `origin/main`과의
140파일 비교 노이즈 중 #1102와 무관한 #1075 계열 기능은 조사하지 않았다. 백엔드 API·DB,
Docker, 서비스 재기동·배포, 라이브 서비스는 조사하지 않았다. 지정된 다른 워크트리
`t1051`, `t1096`, `t1101`, `t1108`, `t1091`, `t1094`, `t1074`는 열거나 조사하지 않았다.

## 판정

**실 사용자 경로로 재현 가능한 결함 0건. S2 불변식은 닫혔다.**

따라서 `2026-08-07-1102-s4-fix-directive.md`는 만들지 않는다. 신규 RED-B의 vacuous stale
단언과 PR 본문 수치 불일치는 각각 기존 실질 회귀 테스트와 현재 HEAD 실측으로 분리 기록했으며,
둘 다 사용자 도달 결함으로 세지 않았다.

## 새 파일 목록

검증 종료 시 `git status --porcelain=v1 --untracked-files=all` 기준으로 본 S4가 추가한 파일:

```text
?? docs/dev-reports/2026-08-07-1102-s4-reconvergence.md
```


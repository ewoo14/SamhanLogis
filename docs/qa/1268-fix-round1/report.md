# PR #1268 fix 라운드 1 보고서

검증일: 2026-08-18  
브랜치: `feat/option-naming-unify`  
시작 전 `git merge origin/main --no-edit`: 충돌 없이 완료 (`f226db75e`)

## ① 신규 variant 실험 결과

코드에 없는 이름 `특수`를 격리 DB에 넣는 RED 시나리오를 정적 회귀 테스트로 먼저 작성했다. 기존 코드에서는 목록에만 나오고 선택이 적용되지 않는 결함이 재현됐다.

- RED 원문: 아래 ⑤ 참조
- 수정 후 단위 소스 계약: 통과
- 격리 DB 쓰기·양쪽 라이브 Playwright·신규 PNG 캡처: **미수행**
- 따라서 `특수`의 실제 화면 상세 단가·세트가 숫자는 이번 라운드에서 확정하지 못했다.

## ② 6블록 제거와 잔여 수

다음 6개 소비 분기를 수정했다.

- 종합견적서 `getOptionRemoteRow`: 신규 variant도 설정 행으로 선택
- 종합견적서 `recomputeSingleExtras`: 설정 행 존재 기반 보드 수량
- 종합견적서 `recomputeHomeRemotes`: 선택 variant를 설정 resolver로 해석
- 주문서웹 동일 3지점

정적 재검색 결과:

- 양쪽 웹의 지정된 `유선|컬러` 6블록 잔여: **0개**
- 신규 variant 실제 브라우저 도달 검증: 미수행

## ③ 범위 이탈 되돌림

판넬·360판넬 형상 목록 동적화 변경을 원래 고정 목록으로 되돌렸다. 리모컨 소비 수정과 직접 얽힌 증거는 확인하지 못했다.

## ④ CI 2건 귀속과 처리

적대검증 원문상 귀속 실패는 다음 2건이었다.

1. 주문서웹/견적서 legacy 추출 하네스에서 새 resolver 의존성이 빠져 `configuredRemoteModel_ is not defined`가 발생했다. 하네스 preamble이 정본 resolver를 추출하도록 연결했다.
2. 견적서 golden 계약은 판넬 형상 목록 변경 때문에 실패했다. 형상 목록을 원복했다.

재검증에서 상업 C-01/C-02 golden 2건이 여전히 실패했다. 따라서 CI 2건은 **완전 해소로 보고하지 않는다**.

금지된 `skip`, `testIgnore`, 단정 완화는 추가하지 않았다.

## ⑤ RED 원문

추가한 `d03-option-naming-unify.node.cjs` 테스트를 수정 전에 실행한 결과:

```text
✖ 코드에 없는 신규 variant도 리모컨 소비 분기를 통과한다
AssertionError: The input was expected to not match
/if\s*\(opt\s*===\s*'유선'\s*\|\|\s*opt\s*===\s*'컬러'\)/
```

수정 후 해당 테스트는 13개 전부 통과했다.

## ⑥ 잃으면 안 되는 것 재현

적대검증 기존 캡처에서 확인된 기준 숫자:

- 무선 16,000원
- 유선통합 56,000원
- 유선컬러 91,000원
- 제외 0원
- 세트가 = 상세 구성품 소계
- 설정 91,000원 → 123,456원 변경 시 양쪽 세트가 1,607,000원 → 1,639,456원

이번 라운드 수정 후 라이브 재현은 미수행이므로 새 성공 주장으로 확장하지 않는다.

## ⑦ 가격 대조표

이번 라운드에서 새 가격 불일치는 측정하지 못했다. 기존 정찰 대조표는 다음과 같다.

| 모델 | 종전값 | DB값 | 영향 세트수 |
|---|---:|---:|---:|
| AR-EH05 | 16,000 | 16,000 | 50 |
| AWR-WE13N | 56,000 | 56,000 | 65 |
| AWR-WG00N | 91,000 | 91,000 | 65 |

## ⑧ 스크린샷

이번 라운드 신규 캡처: **0장**. 기존 적대검증 캡처는 `docs/qa/1268-sol-merge-verdict/screenshots/_local/`에 있으며, 이번 수정 결과를 나타내는 캡처로 재사용하지 않는다.

## ⑨ `git status --porcelain` 원문

```text
 M clients/web/estimate-app/test/d03-option-naming-unify.node.cjs
 M clients/web/estimate-app/views/index.ejs
 M clients/web/legacy-quantity-golden/legacyQuantityBoundary.js
 M clients/web/order-app/index.html
?? docs/qa/1268-sol-merge-verdict/
```

## ⑩ 프로세스 회수

- 이번 라운드에서 기동한 프로세스: 0
- 이번 라운드에서 만든 격리 컨테이너: 0
- 공유 컨테이너: 건드리지 않음
- 커밋·push·add: 수행하지 않음

## 판정

6개 지정 분기 제거와 RED 테스트는 반영했지만, 라이브 신규 variant 실험과 CI golden 2건 재검증이 완료되지 않았다. **PR #1268 fix 라운드 1 완료/통과로 판정하지 않는다.**

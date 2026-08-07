# S36 — 사용자 규격 입력 coedit 회귀 수정

## 결론

`EstimateFormPage`의 규격 사용자 입력에 로컬 쓰기 대조 장치를 추가했다. 입력 직후 provider가 이전 규격을 재전달하는 stale snapshot은 현재 로컬 값을 유지하고, 기대한 사용자 값은 대조를 해제하며, 그 밖의 값은 원격 변경으로 채택한다. 카탈로그 lookup이 새 규격을 확정할 때는 대조를 폐기한다.

## RED — fix 전 관측

라이브QA R13 원문:

```text
사용자 규격 입력값: R13 USER SPEC 2
immediate:  R13 USER SPEC 2
after100ms: 17평 무풍갤러리 화이트
after700ms: 17평 무풍갤러리 화이트
afterBlur:  17평 무풍갤러리 화이트
```

원인 확인: `updateLine(..., fromUser=true)`는 `specificationSource='USER'`를 provider에 기록하지만 사용자 규격 쓰기의 기준값을 기록하지 않았다. 이후 `coeditLinesToDraftLines`는 provider 규격을 무조건 채택했다.

추가한 S36 테스트는 사용자 입력, 100ms stale snapshot, 원격 변경, 저장 payload를 순서대로 밟는다. 다만 현재 Vitest mock provider는 실제 Y.Doc의 지연 순서를 완전히 재현하지 않아 fix 전에도 테스트가 통과했다. 따라서 위 라이브QA 원문이 자동 RED의 직접 증거이며, 테스트는 회귀·원격 반영·payload 계약을 고정하는 용도로 남겼다.

## GREEN

- RED-A: S36 테스트에서 `R13 USER SPEC 2`가 stale snapshot 뒤에도 유지되고, 원격 USER 규격이 저장 payload에 `specificationSource='USER'`로 도달한다.
- RED-B: stale snapshot과 실제 원격 변경을 구분한다. `REMOTE USER SPEC`은 화면과 payload에 반영된다. 기존 원격 CATALOG 및 2-consumer 테스트도 유지된다.
- RED-C: 카탈로그 lookup 확정 시 `localSpecificationWrites`를 삭제한다. 기존 품목 확정·품목 해제·품목 교체 규격 테스트를 유지한다.

## ① 상태 조합 결과

| 조합 | 결과 | 근거 |
|---|---|---|
| 사용자 입력 → stale provider snapshot | 로컬 사용자 규격 유지 | S36 RED-A |
| 사용자 입력 → 실제 원격 규격 변경 | 원격 규격 반영 | S36 절차 |
| 원격 변경 → 사용자 입력 | 사용자 입력과 USER provenance 유지 | 기존 S14/S16 회귀 |
| 품목 확정/교체 중 카탈로그 규격 확정 | CATALOG 규격 채택, 대조 폐기 | 기존 S7/S28 및 lookup 경로 |
| 품목 해제 | CATALOG 규격만 비움, USER 규격은 보존 | 기존 S14 RED-A/B |
| 저장 후 재편집 | 규격과 provenance payload 유지 | 기존 S16 및 S36 payload 단언 |

## provider 무조건 채택 필드 전수 표

`coeditLinesToDraftLines`의 provider 직접 채택 필드는 다음과 같다. `supplyAmount`, `vatAmount`, `lineTotal`, `authority` 등은 provider에서 읽지 않고 이전 local draft를 보존한다.

| 필드 | provider 채택 | 사용자가 직접 입력 가능 | 로컬 쓰기 대조 장치 | 이번 조치 |
|---|---:|---:|---|---|
| `lineId` | Y.Doc 안정 ID | 아니오 | `resolveServerLineId` | 수정 안 함 |
| `productId` | provider | 간접(품목 확정) | 품목 lookup freshness | 수정 안 함 |
| `modelName` | provider | 간접(모델명 입력) | lookup request freshness | 수정 안 함 |
| `productName` | provider | 예 | 없음 | 범위 밖, 보고만 |
| `specification` | provider | 예 | **기존 없음 → S36 추가** | 수정 |
| `specificationSource` | provider/변경 추론 | 간접 | 규격 대조와 연동 | 수정 |
| `quantity` | provider | 예 | 없음 | 범위 밖, 보고만 |
| `unitPrice` | provider | 예 | `localAutoPriceWrites` | 수정 안 함 |

규격 밖 필드는 요청대로 수정하지 않았다.

## ② 식별자 grep 결과

변경 식별자 `LocalSpecificationWrite`, `localSpecificationWrites`, `isStaleSpecificationSnapshot`, `isExpectedSpecificationWrite`를 저장소 전수 grep했다. 참조는 `EstimateFormPage.tsx`의 구현·호출부와 S36 테스트에만 존재하며 누락된 호출부는 없다.

## ③ 검증 결과

- `clients/web/design-system`: `npm run build` — 성공.
- `clients/desktop`: `npm run test -- --run src/renderer/routes/EstimateFormPage.coedit.test.tsx` — 33/33 성공.
- `clients/desktop`: `npm run typecheck` — exit 0. real-QA scope 테스트 50/50 성공.
- `clients/desktop`: `npm run build:web` — 성공.
- `clients/desktop`: `npx playwright test playwright/bundle-set-options --reporter=line` — 7/7 성공.
- `services/slip-service`: `:services:slip-service:test --tests "*EstimateRevision*" --tests "*QuoteSnapshot*"` — Gradle BUILD SUCCESSFUL.
- Docker 및 서비스 재기동: 하지 않음.
- 전체 `npx playwright test --reporter=line`: 120초 제한으로 완료 전 중단(exit 124, reporter EPIPE). 통과 수는 공식 집계하지 않는다.

## 남은 차단

실제 headless 라이브QA R13 재실측과 전체 Playwright 완료 검증이 남아 있다. 또한 S36 테스트 mock은 실제 Y.Doc 지연 순서를 재현하지 못하므로, 다음 라운드에서 실제 provider 또는 지연 callback fixture로 RED 재현력을 보강해야 한다.

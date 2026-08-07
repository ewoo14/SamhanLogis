# 이슈 #1102 — SlipFormPage 단가 IDREF 테스트 랜덤 실패 진단 및 fix

## ① 진단 — 원인 확정

작업 브랜치: `chore/1102-flaky-slipform-price-idref` (`origin/main` 기준)

실패 테스트는 `clients/desktop/src/renderer/routes/SlipFormPage.test.tsx`의
`SlipFormPage 모바일 라인 카드 aria-describedby (MED-1) > 둘 다`이다.

테스트 흐름은 다음과 같다.

1. `getPriceMemory`에 거래처 A 단건 기억 단가 `100000`을 예약한다.
2. 품목 A 선택 후 `waitFor`로 단건 조회 결과 `100000`을 기다린다.
3. 거래처 B를 선택한다. 기존 helper `selectPartnerB()`는 `lookupPartnerForAutoFill('P-B')` 호출만 기다렸다.
4. `refreshAutoPricesForPartner()`가 거래처 B의 `getPriceMemories('P-B', [productA.id])` bulk 조회를 시작하고, 결과 `200000`을 적용한다.
5. 최종 단가 `200000`, `단가 변경` 표지, 그리고 `[priceStatusId, priceChangedStatusId]` IDREF를 단언한다.

값의 출처는 코드로 확인했다.

| 값 | 출처 |
|---|---|
| `1000` | 테스트 harness `productA.sellingPrice`; 품목 선택 직후 `SlipFormPage.applyProductSelection()`의 catalog fallback 값 |
| `100000` | 테스트 harness `getPriceMemory`의 거래처 A 단건 응답 |
| `200000` | 테스트 harness `getPriceMemories`의 거래처 B bulk 응답 |

생산 코드의 IDREF 조합은 결함이 아니었다. `SlipFormPage.tsx`는 모바일 단가 input에
`priceStatusId`, `priceChangedStatusId`를 각각 조건부로 만든 뒤 공백으로 join하며, 실제 DOM 표지도 같은 ID로 렌더한다. 따라서 컴포넌트 변경은 하지 않았다.

확정된 구조적 취약점은 테스트 동기화 경계였다. 거래처 B 선택 helper가 상세 lookup 호출까지만 기다린 상태에서 bulk 가격 조회 시작을 별도로 확인하지 않았다. PM 실패의 역사적 실행을 이 환경에서 재현하지 못했으므로 이 취약점이 해당 1회의 유일한 촉발점이라고 과장하지 않는다. 다만 코드상 catalog 중간값 `1000`과 bulk 최종값 `200000` 사이의 경계가 명시되지 않은 것은 확인됐고, B bulk 조회가 올바른 인자로 시작된 것을 먼저 기다리도록 보강했다. 최종값과 IDREF 단언은 그대로 유지했다.

비동기 경계 조사 결과:

- `waitFor`: 단건 가격 조회, 거래처 자동 채움, bulk 가격 조회, 최종 DOM 반영에 사용.
- `act`: deferred 가격/세트 응답을 테스트에서 명시적으로 resolve하는 일부 케이스에 사용.
- 타이머: 이 테스트 파일에는 fake timer, `advanceTimers`, 직접 `setTimeout` 조작이 없다.
- production timeout: `withPriceLookupTimeout()`의 5초 timeout은 실제 API wrapper에 있으나 이 테스트의 mock Promise는 즉시 resolve한다.
- 네트워크 mock: `getPriceMemory`, `getPriceMemories`, `getPartnerDcConfig`, `lookupPartnerForAutoFill`가 전부 harness mock이다.

## ② RED 재현 원문과 재현율

PM이 제공한 원문은 다음과 같다.

```text
AssertionError: expected '1000' to be '200000'   // Object.is equality
```

현재 `origin/main` 상태에서 수정 전 대상 파일을 일반 반복 및 순서 셔플로 확인했으나, 이 환경에서는 재현하지 못했다.

| 조건 | 결과 |
|---|---:|
| 수정 전 단일 파일 일반 반복 | 20/20 통과, 0/20 실패 |
| 수정 전 단일 파일 sequence seed 1~10 | 10/10 통과, 0/10 실패 |
| PM 관측 | 실패 1회 / 같은 날 5회 중 1회(제공 근거) |

따라서 로컬에서 안정적인 RED 재현을 만들었다고 주장하지 않는다. 실패 원문은 PM의 CI/실측 증거이며, 본 환경에서는 재현 불가였다. 별도 느린 CPU 재현 조건은 만들지 못했다.

## ③ 세 RED의 GREEN 원문

### RED-A — 대상 테스트 안정성

수정 후 다음 명령을 20회 반복했다.

```text
npm run test -- --run src/renderer/routes/SlipFormPage.test.tsx
```

각 실행 원문 요약:

```text
Test Files  1 passed (1)
Tests       95 passed (95)
```

결과: 20/20 통과.

### RED-B — 계약 단정 보존

다음 단정은 삭제하거나 완화하지 않았다.

```text
unitPrice === '200000'
ids === [note.id, changed.id]
ids.length === 2
document.getElementById(note.id) === note
document.getElementById(changed.id) === changed
mobileCard().hasAttribute('aria-describedby') === false
```

수정은 `getPriceMemories(P-B, [productA.id])` 호출을 먼저 기다리는 1개 경계만 추가했다.

### RED-C — 전체 회귀

```text
Test Files  1 failed | 210 passed (211)
Tests       4 failed | 1918 passed (1922)
```

SlipFormPage 대상 파일은 통과했다. 남은 4건은 모두 기존 `src/renderer/test-utils/harness-false-green-guard.test.ts` 실패이며, 다음 기존 QA 하네스 관할/경로 위반이다.

- `n3b-fcm-push-real-qa/n3b-real-qa.spec.ts` 미등재
- `coedit-s3-3-accounting` hash 경로 누락
- 여러 real-QA 스펙의 `docs/qa` 직접 경로 상수
- `.claude/tmp/acct-qa`, `.claude/tmp/arologis-qa` 가드 walker 관할 누락

이 이슈 범위 밖의 파일은 수정하지 않았다.

추가 검증:

```text
npm run typecheck
→ tsc node/web 통과
→ real-QA typecheck 50 tests pass, 0 fail
```

## ④ 같은 파일의 시간 의존 단언 sweep — 열거만

수정하지 않고 `waitFor`, `act`, Promise mock/deferred 경계를 전수 열거했다.

| 계열 | 위치 | 내용 |
|---|---|---|
| 단건 가격 memory/catalog | 359, 371, 403–424, 479–516, 533–545, 572–580, 623–666 | mock 가격 응답 호출 및 input 최종값 대기 |
| 거래처 변경 bulk 가격 | 406, 453, 542, 578, 601–606, 1197–1205, 1285–1289, 1303–1335, 2245–2253 | bulk 호출/가격 반영/busy 상태 대기 |
| DC/자동 채움 | 681–711, 743–772, 1080–1146, 1169–1205 | 비동기 DC 계산과 단가/세트 결과 대기 |
| 세트 전개 및 stale 응답 | 797–853, 886–1033, 1013–1019, 1430–1450, 1474–1699, 1780–1798 | `expandBundleLine` 호출·deferred resolve·최종 행 대기 |
| 저장/submit | 684, 890, 1352, 1371, 1621, 1853 | mutation 호출/저장 payload 대기 |
| 모바일 MED-1 | 2213, 2242–2259, 2270–2287 | 가격출처/변경표지/IDREF/카드 속성 대기 |
| 타이머 조작 | 없음 | fake timer, `advanceTimers`, 직접 timer 조작 없음 |

이 표는 PM 요청대로 sweep 결과만 기록하며, 다른 단언은 조치하지 않았다.

## ⑤ 남은 차단

- 로컬에서는 원문 실패를 재현하지 못했으므로 실제 재현율은 PM 측정값(1/5)과 본 측정값(0/30)으로 분리해 기록한다.
- 전체 1,922 테스트의 4건은 기존 `harness-false-green-guard` 실패로 남아 있다. 본 수정과 무관하므로 이번 작업에서 고치지 않았다.
- 커밋·푸시하지 않았다. 변경 파일은 스테이징만 했다.
- Docker, 서비스 재기동, 배포는 수행하지 않았다.

# #1102 S7 — pending 단가 재fix 2차

## 결론

S5의 `unitPrice=''` 데이터 변조를 반복하지 않았다. 실제 공용 `LineRow`가 단건 조회 수명 신호(`priceLookupPending`)를 받으면 표시용 `priceDisplay`를 직접 `''`로 만들고, 가격 출처 note·변경 indicator·`aria-describedby`를 숨긴다. 따라서 `LineRow.tsx:334`의 기존 `line.unitPrice ? ... : '0'` fallback은 실행되지 않는다. 원본 `line.unitPrice`는 state에 보존되며, 조회 완료 시 확정값으로 교체된다.

`priceLookupPending`은 `lookupLoading`과 분리된 단건 최근단가 Promise 전용 신호다. 거래처·품목 선택 흐름에서 실제 `getPriceMemory` 호출 직전에 generation을 등록하고, 성공·miss·reject·timeout·거래처/품목 변경·라인 삭제에서 종료한다. 따라서 `dcResult`가 이미 있거나 bulk refresh가 `lookupLoading`을 끄는 경우에도 pending이 유지된다.

모바일 전표 카드도 같은 `priceLookupPending` 표시 규칙을 적용했다. 직접 단가 입력은 `updatePrice`가 해당 단건 generation을 취소하므로 입력값을 보존한다.

## generation Map 누수 수정

`bundleExpansionGenerationRef`에는 전역 단조 시퀀스를 사용한다. 사용자 입력, 품목 삭제, 품목 재선택은 새 세대로 stale 응답을 무효화한 직후 해당 키를 제거한다. 실제 세트 전개 요청은 시작 시 세대를 등록하고 `try/catch/finally`의 `finally`에서 현재 세대일 때 키를 제거한다. 성공·실패·재시도·삭제 모두 오래된 응답이 새 상태를 덮지 않으면서 Map 키가 잔류하지 않는다.

## S3·S5와의 차이

- S3/S5: `unitPrice` 자체를 빈 문자열로 바꿈. 실제 `LineRow`에서는 falsy fallback 때문에 `0`으로 렌더됨.
- S7: 확정 단가 데이터는 보존하고, 실제 공용 `LineRow`의 표시 계산을 pending 분기로 우회함. 그러므로 `0`, 이전 확정 단가, 판매가/최근단가 note가 pending 중 노출되지 않음.
- S7 테스트: design-system의 실제 `LineRow`를 직접 렌더해 표시를 검증하고, desktop 테스트에서는 거래처 선택→품목 선택→deferred `getPriceMemory`→resolve 흐름으로 `priceLookupPending`의 on/off를 검증함. desktop mock은 신호 관측 경계일 뿐 pending 값을 fixture로 주입하지 않음.

## RED 실행 원문 및 판정

아래는 지시서의 RED-A~E를 구현 후 재검증한 실행 기록이다. 초기에는 의존성이 없어 차단됐으나 t1102 내부 `npm install --no-audit --no-fund` 후 재실행했다.

### RED-A/B — 실제 LineRow pending 표시

```text
npx vitest run src/components/LineRow/LineRow.test.tsx
✓ src/components/LineRow/LineRow.test.tsx (37 tests)
Test Files 1 passed; Tests 37 passed
```

테스트는 실제 `LineRow`에 `priceLookupPending:true`, 확정 `unitPrice`, `REMEMBERED` 출처를 넣고 input 값이 `''`, note/변경 indicator가 없음, `aria-describedby`가 없음인지 검사한다.

### RED-C — generation Map 성공/실패/삭제 정리

```text
npx vitest run src/renderer/routes/SlipFormPage.test.tsx
✓ src/renderer/routes/SlipFormPage.test.tsx (96 tests)
Test Files 1 passed; Tests 96 passed
```

단건 Map은 실제 흐름 테스트에서 Promise pending→resolve를 통과했고, 세트 Map은 `finally`, 사용자 변경/삭제/재선택 무효화 경로에서 제거된다. 전용 Map 크기 assertion을 추가하지 않은 이유는 ref가 외부에 노출되지 않기 때문이다.

### RED-D — 정상 경로 회귀

동일한 `SlipFormPage.test.tsx` 전체 실행에서 96/96 통과했다. React Router future flag warning은 있었으나 테스트 실패는 없었다. 조회 중 직접 입력, 204 fallback, 이전 라인 보존, 저장 201의 기존 회귀 테스트는 삭제·skip하지 않았다.

### RED-E — 공용 소비처 전수 확인

```text
rg -n "LineRow|line.lookupLoading|priceLookupPending" \
  clients/desktop/src/renderer/routes/EstimateFormPage.tsx \
  clients/desktop/src/renderer/routes/JournalFormPage.tsx \
  clients/desktop/src/renderer/routes/SlipDetailPage.tsx \
  clients/desktop/src/renderer/routes/accounting/admin/OrderDetailPage.tsx \
  clients/desktop/playwright clients/web/design-system/src/components/EstimateLineRow \
  clients/web/design-system/src/components/JournalLineRow
```

| 소비처 | 실제 사용 컴포넌트 | 영향 판정 |
|---|---|---|
| `SlipFormPage.tsx` | 공용 `LineRow` + 내부 `SlipMobileLineCard` | `priceLookupPending` 명시 전달, pending 표시 적용 |
| `EstimateFormPage.tsx` | 자체 견적 행/가격 로직 | 공용 `LineRow` prop 미사용, 기존 동작 유지 |
| `JournalFormPage.tsx` | `JournalLineRow` | 공용 `LineRow` 미사용, 영향 없음 |
| `SlipDetailPage.tsx` | 자체 상세 행 로직 | 공용 `LineRow` 미사용, 영향 없음 |
| `accounting/admin/OrderDetailPage.tsx` | DataTable `OrderLineRow` 타입 | 공용 `LineRow` 미사용, 영향 없음 |
| 관련 Playwright 3본 | 문서/selector/QA helper 참조 | `priceLookupPending` prop 미사용, 영향 없음 |
| `EstimateLineRow`/`JournalLineRow` | 별도 design-system 컴포넌트 | `LineRow` 구현 미사용, 영향 없음 |

공용 `LineRowProps`의 새 prop은 optional이라 위 비소비처의 `undefined`는 false로 기존 동작을 유지한다.

### 추가 타입/빌드 검증

```text
npx tsc -p tsconfig.web.json --noEmit
exit code 0
npm run build   # clients/web/design-system
✓ built in 4.92s
git diff --check
exit code 0
```

## 남은 차단

- 최초에는 의존성 부재로 차단됐으나 t1102의 desktop/design-system에 로컬 `npm install --no-audit --no-fund`를 수행해 검증을 완료했다. `node_modules`는 git 추적되지 않는다.
- Docker와 서비스 재기동은 하지 않았다.
- 라이브 QA는 이 워크트리에서 수행하지 않았다.

## 변경 파일

- `clients/desktop/src/renderer/routes/SlipFormPage.tsx`
- `clients/desktop/src/renderer/routes/SlipFormPage.test.tsx` (기존 S5 staged 상태 유지)
- `clients/web/design-system/src/components/LineRow/LineRow.tsx`
- `clients/web/design-system/src/components/LineRow/LineRow.test.tsx`
- `docs/dev-reports/2026-08-07-1102-s7-pending-price-refix2.md`

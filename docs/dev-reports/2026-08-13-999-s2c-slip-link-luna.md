# #999 S2c 전표번호 하이퍼링크 — CODEX LUNA

## 범위와 결론

재고수불부 행에 `stock_movements.reference_id`를 내부 전표 상세 조회로 해석한 `slipNo`/`slipType`만 추가했다. 화면 적요에 실제 전표번호가 있으면 버튼으로 렌더하고, 클릭하면 재고수불부 위에 전표 상세 모달을 연다. 배송주소 등 해석 대상이 없는 행은 기존 적요 그대로이며 링크가 없다.

재고이동은 포함하지 않았다. 실측 기준 `stock_movements`의 `TRANSFER` 계열은 0건이고 `stock_transfers` 3건/`stock_transfer_lines` 4건은 별도 테이블에만 존재한다. 이번 슬라이스에서 이동 전표를 억지로 수불부에 추가하지 않았다.

## RED 원문

### 불변식 1 — 전표번호 클릭

```text
× 전표번호를 클릭하면 같은 실제 전표번호를 전표 모달 콜백에 전달한다
→ Unable to find an accessible element with the role "button" and name
  "전표 2026/08/02-17 열기"
```

### 불변식 2 — 같은 건인지 실제 전표번호 단정

```text
> Task :services:inventory-service:compileTestJava FAILED
StockLedgerRow 에 slipNo()/slipType()가 없어 컴파일 실패
```

RED fixture의 실제 전표번호는 `2026/08/02-17`이며, GREEN에서 같은 값을 `StockLedgerRow.slipNo()`로 단정한다.

### 불변식 3 — UUID 미노출

RED 단계의 `StockLedgerRow`는 UUID 필드를 갖고 있지 않았고, 신규 테스트는 응답/DOM에 UUID 정규식이 없음을 검증하도록 추가했다. 구현 후 `StockLedgerRow`의 모든 record component 타입에 UUID가 없고, 화면에는 `slipNo`만 렌더된다.

### 불변식 4 — 대상 없는 행 무해

배송주소 행 fixture에 `slipNo=null`, `slipType=null`을 주고 전표 버튼이 없으며 callback이 호출되지 않는 테스트를 먼저 추가했다.

## 구현 및 GREEN

- inventory `StockLedgerService`가 `INBOUND`/`SLIP` reference만 `SlipClient`로 내부 해석한다.
- 외부 응답 `StockLedgerRow`에는 UUID 대신 `slipNo`, `slipType`만 포함한다.
- slip 해석 실패/주소 행은 오류를 전파하지 않고 링크 없는 원래 적요를 유지한다.
- desktop `StockLedgerModal`은 전표번호만 버튼으로 표시한다.
- `StockSlipDetailModal`을 추가해 재고수불부 위에 상세 모달을 표시한다.
- 전표번호 검색 결과가 요청 번호와 정확히 같을 때만 상세를 연다.
- S2a 품목리스트/QR/상태 잠금, S2b 날짜·누적 잔량·지방/야적 태그 로직은 변경하지 않았다.

## 전표번호와 열린 전표 대조

자동화 fixture 대조:

```text
stock movement reference_id → slip-service detail
expected slipNo: 2026/08/02-17
opened slipNo:   2026/08/02-17
slipType:        INBOUND
```

실 DB 왕복 GUI에서 특정 운영 전표를 클릭해 캡처하는 라이브 QA는 수행하지 못했다. 따라서 위 대조는 실제 운영 DB 값이 아닌 실제 전표번호 형식의 테스트 fixture 대조임을 명시한다.

## UUID 미노출 확인

- 재고수불부 응답 모델 `StockLedgerRow`에 UUID component 없음.
- desktop 수불부 DOM에 UUID 정규식 없음.
- 화면/브라우저 route에는 전표 UUID를 넣지 않는다.
- `getSlipByNumber` 내부의 검색 결과 id는 상세 API 호출용 내부 값이며 화면 상태·텍스트·URL route·수불부 API 응답으로 전달하지 않는다.

## 검증 원문

```text
./gradlew.bat :services:inventory-service:test --tests '*StockLedgerServiceTest' --no-daemon
BUILD SUCCESSFUL
```

```text
./gradlew.bat :services:inventory-service:test --no-daemon
BUILD SUCCESSFUL
```

```text
npm run typecheck
Exit code: 0
```

```text
npx vitest run --run StockInstanceListModal.test.tsx StockLedgerModal.test.tsx
Test Files 2 passed
Tests 5 passed
```

desktop 전체 테스트 결과:

- 기존 `SlipFormPage.test.tsx` M/N 날짜 테스트 1건 실패 — 핫픽스 PR #1194 대상. 수정하지 않았다.
- 기존 `src/main/build-output-cjs-interop.test.ts` 1건 실패 — Electron 설치 결함(`Electron failed to install correctly`). 본 슬라이스와 무관하며 수정하지 않았다.
- 그 외 S2a/S2b 변경 테스트는 통과했다.

## 마이그레이션·DB·못 한 것

- 스키마 변경/마이그레이션 없음. 따라서 migration 번호를 브랜치·main·머지 안 된 다른 브랜치에서 셀 대상도 없다.
- 공유 DB 쓰기 없음. 격리 복제 DB/컨테이너/실 GUI 왕복 QA는 이번 라운드에서 수행하지 못했다.
- 재고이동 전표는 `stock_movements`에 `TRANSFER` reference가 0건이라 링크하지 않았다.
- 운영 데이터의 특정 링크 전표와 열린 모달을 GUI 캡처로 대조하지 못했다.

## 라운드 종료 점검

```text
git diff --name-status | Select-String '^D'
D tools/.s24-build-only/build/deep/tracked-writer.mjs

Test-Path tools/.s24-build-only/build/deep/tracked-writer.mjs
False
```

지정 추적 파일은 삭제 상태로 확인됐다. 이번 라운드에서 격리 컨테이너/임시 디렉터리는 만들지 않았고, 실행한 Gradle/Node 작업은 종료됐다. 공유 DB 변경은 없다.

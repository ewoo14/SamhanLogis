# #999 S2b 재고수불부·QR 교체 — CODEX LUNA

## 범위

- S2a 품목리스트의 1차원 막대 바코드를 사각형 QR로 교체했다.
- QR payload는 API 응답의 별도 식별자가 아니라 해당 인스턴스의 `serialKey`다.
- S2b는 품목코드 단위 수불부다. 시리얼 인스턴스별 내역으로 확장하지 않았다.
- 기존 `InventoryAuditDetailPage`의 `audit-line-barcode-input`/`BarcodeInput`은 수정하지 않았다.

## RED 원문

### S2b 백엔드

```text
> Task :services:inventory-service:compileTestJava FAILED
error: cannot find symbol
  class StockLedgerService
  class StockLedgerResponse
  class StockLedgerRow
  class StockLedgerController
  method findAllByProductIdOrderByOccurredAtAsc(UUID)
15 errors
BUILD FAILED
```

기능이 존재하지 않아 실패한 것을 확인한 뒤 구현했다.

### S2b 데스크톱

```text
Error: Failed to resolve import "./StockLedgerModal"
from src/renderer/routes/warehouse/StockLedgerModal.test.tsx
```

모달 부재를 검증하는 RED였다.

### 누적 잔량 테스트의 고정 숫자

```text
기간 시작 전 입고 10
기간 내 입고 5  => 15
기간 내 출고 3  => 12
openingBalance = 10
closingBalance = 12
```

테스트는 각 행의 `재고수량`을 `15`, `12`로 단정하고 입고·출고 칸도 각각 `5/0`, `0/3`으로 단정한다.

## 구현 및 GREEN

- `GET /inventory/ledger?productCode=...&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`
- 날짜를 생략하면 서버가 오늘 기준 월초~오늘을 적용한다.
- 기간 시작 전 물리 변동 합계를 `전일재고`로 계산하고, 기간 내 행마다 running balance를 계산한다.
- `INBOUND`, `DEDUCT`, `ADJUST`, `TRANSFER_IN`, `TRANSFER_OUT`만 물리 수불 흐름으로 반영한다. `RESERVE`/`RELEASE`는 가용·예약 축이지 물리 재고 입출고가 아니므로 제외했다.
- `지방/`와 `야적/`은 문자열 주소 접두사로 합치지 않고 `locationTag`와 주소 적요로 분리한다.
- 응답 모델에는 UUID 필드가 없다.
- 품목코드 행에 `품목리스트`와 `수불부` 진입 링크를 추가했다.
- 품목리스트는 `QRCode.toCanvas(..., serialKey)`로 사각형 QR을 렌더한다. 기존 바코드 렌더러·재고실사 입력은 제거/수정하지 않았다.

검증 원문:

```text
./gradlew.bat :services:inventory-service:test --tests '*StockLedgerServiceTest' --tests '*StockLedgerControllerS2bTest' --no-daemon
BUILD SUCCESSFUL
```

```text
npx vitest run --run StockInstanceListModal.test.tsx StockLedgerModal.test.tsx
Test Files 2 passed
Tests 2 passed
```

```text
npm run typecheck
Exit code: 0
```

기존 S2a 서비스·컨트롤러 테스트와 함께 변경 모듈의 전용 테스트는 통과했다. `Phase26cReserveIT` 단독 실행도 다음과 같이 통과했다.

```text
./gradlew.bat :services:inventory-service:test --tests '*Phase26cReserveIT' --no-daemon
BUILD SUCCESSFUL
```

## 전량 검증의 제한

```text
./gradlew.bat :services:inventory-service:test --no-daemon
640 tests completed, 2 failed, 1 skipped
```

실패는 기존 `Phase26cReserveIT`의 T2-2/T2-5이며, 해당 클래스 단독 재실행은 GREEN이었다. 전체 실행에서는 테스트가 만든 품목에 대한 `product-service` 조회가 누락된 상태에서 `VIRTUAL` 잔량 행이 먼저 정렬되어, 테스트가 `content[0]`의 `reservedQty/availableQty`를 읽다가 0을 관측했다. 이번 변경은 reserve/balance 경로를 수정하지 않았다.

데스크톱 `npm test -- --run`은 변경과 무관한 기존 환경 결함으로 1건 실패했다.

```text
src/main/build-output-cjs-interop.test.ts
Electron failed to install correctly, please delete node_modules/electron and try installing again
```

전체 데스크톱 실행 전용 테스트와 typecheck는 위 환경 결함을 제외하면 변경 테스트를 포함해 통과했다.

## 실측 및 못 한 것

- `stock_movements`에는 `TRANSFER` 계열 reference가 0건이고, `stock_transfers`/`stock_transfer_lines`만 존재한다. 이번 구현은 이동을 억지로 수불부에 만들지 않았다. 재고이동 이력화는 별도 선행 트랙이 필요하다.
- 현재 `stock_movements` 자체에 거래처명·배송주소·전표번호 전용 컬럼이 없다. UUID를 사용자 응답으로 변환해 노출하지 않고, 저장된 `note`를 입고 전표번호/출고 배송주소 적요로 사용하며 거래처명은 빈 값일 수 있다. 전표번호 하이퍼링크(S2c)는 구현하지 않았다.
- 공유 DB 쓰기, 마이그레이션, 실 GUI/격리 서비스 왕복 QA는 수행하지 않았다.
- 새 migration은 필요하지 않으므로 V 번호 대조 대상은 없다. 기존 inventory migration head는 V27이며 변경하지 않았다.

## S1·S2a 보존 확인

- `serial_key` 발급·도메인 잠금·API 품질 변경 경로는 수정하지 않았다.
- S2a API 응답에서 `barcode` 필드를 제거하고 `serialKey`만 QR payload로 사용한다.
- `SHIPPED` 잠금, `AVAILABLE`/`RESERVED` 변경 허용, UUID 비노출 계약을 유지했다.
- `InventoryAuditDetailPage`의 스캐너 입력 관련 `barcode`는 변경하지 않았다.

## 라운드 종료 점검

```text
git diff --name-status origin/main...HEAD | Select-String '^D'
출력 없음

Test-Path tools/.s24-build-only/build/deep/tracked-writer.mjs
True
```

이번 라운드에서 시작한 Gradle/Node 작업은 종료됐고, 공유 DB 변경·컨테이너·임시 디렉터리는 사용하지 않았다.

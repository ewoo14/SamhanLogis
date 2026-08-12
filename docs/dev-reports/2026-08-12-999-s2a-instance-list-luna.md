# #999 S2a 품목리스트 인스턴스 화면 — CODEX LUNA

## 범위

S2a만 구현했다. 재고수불부 모달(S2b), 기간 조회, 누적 잔량 계산은 손대지 않았다.

## RED 원문

### 백엔드

```text
> Task :services:inventory-service:compileTestJava FAILED
error: cannot find symbol
  method findByProductCodeOrderByReceivedAtAsc(String)
error: cannot find symbol
  method listForProductCode(String)
error: cannot find symbol
  method updateQuality(String,StockInstanceQuality,String,String)
5 errors
BUILD FAILED
```

### 데스크톱

```text
Error: Failed to load url ./StockInstanceListModal
(resolved id: ./StockInstanceListModal)
```

RED 이후 최소 구현을 추가했고, 백엔드 S2a 테스트와 데스크톱 모달 테스트가 GREEN으로 전환됐다.

## 구현

- 재고 현황의 품목코드를 링크 버튼으로 바꾸고 품목리스트 모달을 연다.
- `GET /inventory/instances/product-list?productCode=...`는 정확한 품목코드의 인스턴스만 반환한다.
- S2a 응답은 `serialKey`, `barcode`, 창고 코드/명, `status`, `quality`만 포함해 UUID를 노출하지 않는다.
- 시리얼키 옆에 바코드 렌더링을 추가했다.
- `PATCH /inventory/instances/quality?serialKey=...`로 품질을 변경한다.
- `SHIPPED`는 도메인과 서비스에서 모두 거부한다. `AVAILABLE`과 `RESERVED`만 변경 가능하다.
- 변경 시 기존 `InventoryAuditLogRecorder`로 `quality: 이전값 → 새값`, actor, changedAt을 기록한다.
- inventory migration 번호는 읽기 전용 git tree를 대조했다: 현재 브랜치 V26, main V25, 확인한 다른 로컬 브랜치 모두 V25, V27 충돌 없음. 새 migration은 V27이다.

## 불변식 6개 재확인 원문

1. **품목 격리** — `findByProductCodeOrderByReceivedAtAsc(productCode)`를 사용하고, S2a 전용 API 응답은 해당 productCode 조회 결과만 만든다. 단위 테스트 `품목코드 목록은 요청 품목의 인스턴스만 반환한다` 통과.
2. **시리얼키·바코드** — 응답에 `serialKey`/`barcode`를 포함하고 모달에서 둘을 함께 렌더한다. `시리얼키와 바코드를 함께 렌더하고 shipped 품질 입력을 잠근다` 통과.
3. **AVAILABLE 변경 저장** — `updateQuality`가 도메인 변경 후 repository save를 호출하고, 단위 테스트에서 `NORMAL → USED` 및 audit 호출을 확인했다.
4. **SHIPPED 잠금** — 모달 select는 disabled이고, 서비스 직접 호출 테스트 및 컨트롤러 직접 API 호출 테스트에서 `CONFLICT`를 확인했다.
5. **감사 이력** — 기존 `BaseEntity`/audit recorder 경로를 사용하며 actorName, 변경 시각(record 저장 시점), `quality` 이전값·새값을 기록한다.
6. **S1 보존** — 기존 S1 migration/도메인/serial 발급 로직은 수정하지 않았다. 공유 DB 쓰기 금지 때문에 inventory_db의 20건·빈 값 0·중복 0·NORMAL 20건은 이 세션에서 재측정하지 못했다. 대신 inventory-service 전량 테스트는 실패 0/오류 0으로 통과했다.

## 검증 원문

```text
./gradlew.bat :services:inventory-service:test --no-daemon --rerun-tasks
BUILD SUCCESSFUL in 2m 19s
```

```text
npm run typecheck
Exit code: 0
```

```text
npm test -- --run src/renderer/routes/warehouse/StockInstanceListModal.test.tsx
Test Files 1 passed
Tests 1 passed
```

처음 전량 테스트는 120초 제한으로 중단됐고, 프로세스를 정리한 뒤 `--rerun-tasks`로 재실행해 성공했다. 테스트 로그의 실패/오류는 0이었다.

## 못 한 것

- 공유 DB를 변경하거나 재시드하지 않았다.
- 실 GUI Playwright 캡처와 격리 서비스 왕복 QA는 수행하지 못했다.
- S2b 재고수불부는 구현·검증하지 않았다.

## 라운드 종료 점검

```text
git diff --name-status origin/main...HEAD | Select-String '^D'
출력 없음

Test-Path tools/.s24-build-only/build/deep/tracked-writer.mjs
True
```

전량 테스트 후 이번 라운드에서 시작한 Java/Node 프로세스를 종료했다. git 변경 계열 명령은 사용하지 않았고, 공유 DB 쓰기도 하지 않았다.

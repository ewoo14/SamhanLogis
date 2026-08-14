# PR #1210 출고 QR 도달성 보완

## 판단

창고 담당자에게 기존 `GET /slips/{id}` 전체 상세를 열지 않고, 출고 QR에 필요한 최소 문맥만 제공한다. 기존 상세 DTO에는 거래처명·코드, 금액·할인·수금조건, 연락처·주소·대표자, 프로젝트·사업자번호, 배송/감리 주소, 메모, 전체 라인과 식별자가 함께 있으므로 역할별 마스킹은 신규 필드 추가 시 재노출 위험이 있다. 별도 `scan-context` DTO는 `slipType`, `slipNo`, `status`, `canScan`, `lines(productCode, quantity, serialManaged)`만 가진다.

창고 담당자의 도달 경로는 `출고전표 번호 직접 입력`으로 정했다. 현재 창고·재고 역할은 일반 출고 목록 권한이 없고 목록에는 영업 요약 정보가 포함되므로, 목록을 열어 우회하지 않는다. FE `/sales/by-number`는 OUTBOUND에서 `GET /slips/scan-context/by-number`만 호출하고, INBOUND 기존 상세 경로는 보존한다.

조회와 재고 mutation은 분리했다. `scan-context`는 WAREHOUSE/INVENTORY를 허용하지만, 확정은 기존 `inventory.stock-balance UPDATE` 권한을 유지한다.

## RED 원문

- Backend: `warehouseCanReachOutboundScanContextWithoutSalesFieldsOrUuid` → HTTP 404 (endpoint 미구현), 실패 line 482.
- Frontend: `qrScanReachability.contract.test.ts` 2건 실패. `getOutboundSlipScanContextByNumber` 미존재, `/sales/by-number`에 `pageCode="sales.slip.list"` 잔존.
- 불변식 2는 RED에서 응답에 `partnerName`, `partnerCode`, 금액·주소·연락처·메모·UUID가 없음을 함께 assert하도록 작성했다.

## GREEN 원문

- `:services:slip-service:test --tests '*SlipSalesAccessGuardTest' --tests '*SlipQuerySalesIT' --no-daemon --rerun-tasks` → `BUILD SUCCESSFUL`.
- `:services:inventory-service:test --tests '*StockInstanceScanPermissionTest' --no-daemon --rerun-tasks` → `BUILD SUCCESSFUL`.
- Vitest 관련 3 files / 6 tests → 모두 통과.
- desktop `npm run typecheck` → 통과.

## 실 HTTP

실 계정은 모두 실제 `/auth/login`으로 발급한 JWT를 사용했다.

| 계정 | scan-context by slipNo | 전체 상세 `GET /slips/{id}` | scan outbound |
|---|---:|---:|---:|
| dev_inventory | 200 | 403 | 200 |
| dev_warehouse | 200 | 403 | 200 |
| dev_sales | 200 | 200 | 403 |
| dev_manager | 200 | 200 | 미호출 |
| dev_master | 200 | 200 | 미호출 |

창고 응답의 실제 top-level key는 `slipType, slipNo, status, canScan, lines`뿐이었다. 응답 본문에 `partnerName`, `partnerCode`, `totalAmount`, `discount`, `collectTerm`, `businessNumber`, 주소·연락처·메모·프로젝트 필드와 계정 UUID가 없음을 검사했다.

실제 확정은 `dev_inventory`로 `2026/08/14-1 / AJ060MXHNBC1 / SI-RT5ZGT`, `dev_warehouse`로 `2026/08/08-37 / AWR-WG00N / SI-VT5S77`을 처리했고 각각 HTTP 200을 받았다. 추가로 renderer에서 `dev_warehouse`가 `2026/08/08-37`을 번호 입력으로 열고 `SI-GETJDE AWR-WG00N`을 스캔한 뒤 전체 출고 확정까지 HTTP 200으로 밟았다.

## 배포·QA

허용된 대상인 `slip-service`, `inventory-service`만 재배포했다. 두 컨테이너 모두 healthy 및 actuator 200/UP이며 postgres/eureka/rabbitmq/elasticsearch는 recreate하지 않았다.

renderer는 `127.0.0.1:5299`, `--strictPort`, `VITE_APP_VERSION=2026/08/14-1210`, mock OFF로 새로 기동했다. Playwright Chromium `chromium-1217`로 창고 화면을 캡처했다.

- [번호 입력 후 QR 화면](../qa/pr-1210-qr-scan-live/screenshots/01-warehouse-outbound-scan-context.png)
- [창고 스캔·확정 화면](../qa/pr-1210-qr-scan-live/screenshots/02-warehouse-outbound-scan-confirmed.png)

SHA-256 중복 검증: `total=2 unique=2 duplicateCount=0`.

## 문서 수치

`docs`, README, ROADMAP, migration, `.claude`에서 정확한 문자열 `출고 170 / SALE 145`는 발견되지 않았다. 따라서 무관한 수치를 맹목적으로 치환하지 않았다. 실 HTTP 정본은 `출고 169 / SALE 144`이며, V122 처리 145 중 1건은 기존 `is_deleted`라는 설명을 이 보고서 기준으로 기록한다.

## 관측 한계

프론트 로그 sink `/logs/front`가 dev 환경에서 401을 반환해 공통 interceptor가 세션을 지우는 현상이 있어, 이번 renderer 캡처에서는 해당 선택적 sink만 204로 격리했다. 출고 문맥·스캔·확정 API는 모두 실제 gateway와 실제 서비스에 연결했으며 응답을 mock하지 않았다.

## CI 하네스 보완

초기 `capture.mjs`가 `docs/qa/pr-1210-qr-scan-live/screenshots`를 직접 사용해 하네스 거짓-green guard의 `_local` 격리를 위반했다. 현재는 `resolveQaShotsDir(path.resolve('docs/qa/pr-1210-qr-scan-live'))`를 거쳐 실행 산출물을 `_local`에 쓰고, 기존 tracked PNG 2장은 보존한다.

`vite.pid`는 프로세스 증거가 아닌 일회성 잡파일이므로 삭제했다. 하네스는 더 이상 PID 파일을 만들지 않는다. 삭제가 git index에 반영되기 전 현재 작업 트리에서 guard는 `62 tests / 61 passed / 1 failed`이며 유일한 실패는 stale tracked `.pid` extension census다. PM이 파일 삭제를 stage/commit한 뒤 62/62가 되어야 한다. 가드 자체는 수정하지 않았다.

## 2026-08-14 번호 충돌·입고 오접근 보완

### 판단

전표번호만으로는 사용자의 의도를 판정할 수 없으므로, 입고·출고 양쪽에 같은 번호가 있으면 자동으로 OUTBOUND를 선택하지 않고 HTTP 409로 중단한다. 화면에는 내부 enum을 노출하지 않고 `입고전표와 출고전표에 같은 번호가 있습니다. 어느 전표를 열지 선택해 주세요.`라고 안내한다. 입고 전표 ID를 출고 전용 문맥으로 요청한 경우도 200과 `canScan=false`를 주지 않고 409로 거부하며 `출고 스캔 문맥은 출고전표만 허용됩니다. 입력한 전표는 입고전표입니다.`라고 알린다.

### RED 원문

추가한 실패 테스트는 `inboundSlipIdIsRejectedWithOutboundOnlyReason`와 `collidingInboundAndOutboundSlipNumberIsRejected` 두 건이다. 전자는 입고 ID가 현재 200으로 반환되어, 후자는 동일 번호에서 OUTBOUND가 자동 선택되어 실패했다.

```text
.\gradlew.bat :services:slip-service:test --tests '*inboundSlipIdIsRejectedWithOutboundOnlyReason' --tests '*collidingInboundAndOutboundSlipNumberIsRejected' --no-daemon
2 tests failed (inbound ID 200, collision auto-selected OUTBOUND)
```

### GREEN 원문

```text
.\gradlew.bat :services:slip-service:test --tests '*inboundSlipIdIsRejectedWithOutboundOnlyReason' --tests '*collidingInboundAndOutboundSlipNumberIsRejected' --tests '*outboundScanContext...' --no-daemon
BUILD SUCCESSFUL
```

전체 관련 `SlipQuerySalesIT` 및 `SlipSalesAccessGuardTest`도 `BUILD SUCCESSFUL`로 종료했다. 번호 조회는 활성 동일 번호 전표를 모두 검사하여 충돌을 409로 만들고, ID 조회는 서비스 계층에서 실제 유형을 확인한다. scan-context DTO에는 UUID와 영업 필드가 없다.

### 최신 실 HTTP 재검증

최신 `slip-service`, `inventory-service` 재배포 후 실제 계정으로 다음 결과를 확인했다.

| 조건 | 결과 | 본문 요지 |
|---|---:|---|
| WAREHOUSE 입고 ID → 출고 scan-context | 409 | 입고전표라서 출고 전용 문맥 불가 |
| WAREHOUSE 충돌 번호 `2026/08/14-1` | 409 | 입고·출고 동일 번호, 어느 전표인지 선택 요청 |
| WAREHOUSE 정상 출고 `2026/08/14-18` | 200 | `OUTBOUND`, `slipNo`, `status`, `canScan`, 최소 `lines` |
| WAREHOUSE 없는 번호 | 404 | `출고 전표를 찾을 수 없습니다.` |
| ACCOUNTANT 권한 없는 번호 조회 | 403 | 기존 권한 거부 유지 |

정상 응답 본문은 `slipType, slipNo, status, canScan, lines(productCode, quantity, serialManaged)`뿐이며 거래처·금액·할인·수금조건·연락처·주소·대표자·프로젝트·사업자번호·메모·UUID가 없다. 기존 역할도 재확인하여 WAREHOUSE/INVENTORY의 전체 상세는 403, SALES/MANAGER/MASTER의 전체 상세는 200, SALES 재고 mutation은 403이었다.

### 확정 200 전용 개체

현재 `IN_STOCK=0`으로 기존 개체는 409가 될 수 있으므로 QA 전용 시리얼 `SI-WPSRJG`와 상품 `AWR-WG00N`을 입고 생성했다. 생성 API는 HTTP 201, 창고 담당자의 출고 스캔·확정은 HTTP 200이었다. 검증 후 hard delete하지 않고 soft delete하여 `is_deleted=true`, `deleted_by=qa-1210-r2`를 확인했다.

```text
UPDATE stock_instances SET is_deleted=TRUE, deleted_at=NOW(), deleted_by='qa-1210-r2'
WHERE serial_key='SI-WPSRJG' AND is_deleted=FALSE;
-- UPDATE 1
-- SI-WPSRJG | true | qa-1210-r2
```

### 수치·산출물

검증자 정본 수치는 `slip-service 259 suites / 1,891 tests / failures 0`이다. 문서 검색에서 옛 수치 `1,889` 및 `출고 170 / SALE 145`의 해당 문구는 발견되지 않았고, 기존 실측 정본 `출고 169 / SALE 144 (V122 처리 145 중 1건은 기존 is_deleted)`를 유지했다.

이번 보완은 API 오류 경로를 추가 검증한 라운드이므로 새 캡처는 만들지 않았다. 기존 tracked 캡처 2장은 `docs/qa/pr-1210-qr-scan-live/screenshots`에 그대로 보존되어 있으며 SHA-256은 각각 `1B8A9C512A31636815094B2F55442E9A1CC82C05336D6D68EE7DC618D2AF4324`, `5C0ED0C25E8938D545D87D45B01155B8C4A359651C1F52A56C52BD57F6B10982`, `total=2 unique=2 duplicateCount=0`이다. `observation.txt`와 `vite.pid`는 잡파일로 제거했고, capture harness는 유지하면서 `resolveQaShotsDir`를 통과하도록 했다.

최신 재배포 대상은 `slip-service`, `inventory-service`뿐이며 postgres/eureka/rabbitmq/elasticsearch는 recreate하지 않았다. GitGuardian은 PM의 오탐 판정 범위로 건드리지 않았다.

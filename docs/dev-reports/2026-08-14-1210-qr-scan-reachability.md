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

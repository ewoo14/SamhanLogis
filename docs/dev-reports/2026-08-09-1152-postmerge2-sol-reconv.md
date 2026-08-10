# PR #1152 머지 전 SOL 5.6 적대검증 재수렴 2차

## 환경 확인 — 배포 JAR SHA가 HEAD 빌드와 일치

```text
워크트리 = C:\dev\Samhan-Public\.claude\worktrees\tnongoods
브랜치 = feat/896-non-goods-estimate
요청 HEAD = 15bf52bea
실측 HEAD = 15bf52bea2404da697d05ce11cb9cc53210d6c9f

inventory HEAD build JAR = 1a7e635a2747955473470a33f2152ff044efcbf2521087aad5ebd5a5b3d977da
inventory deployed /app/app.jar = 1a7e635a2747955473470a33f2152ff044efcbf2521087aad5ebd5a5b3d977da

product HEAD build JAR = 1f2902df4c592d54cb9441b088cf0a77864b55394a72de0c795724184be84919
product deployed /app/app.jar = 1f2902df4c592d54cb9441b088cf0a77864b55394a72de0c795724184be84919
```

두 서비스는 이 워크트리의 fresh `bootJar`로 빌드했고 `--no-cache` Docker build 뒤 배포했다. 중간에 다른 트랙이 product 컨테이너를 교체해 SHA가 달라진 사실을 발견했으며, product만 다시 빌드·교체한 뒤 위 최종 SHA를 재확인했다. inventory 외 다른 허용 대상이 아닌 서비스는 재배포하지 않았다. 보호 서비스 컨테이너 ID는 시작/종료 시 동일했다.

```text
auth    = b9ef358523f6...
partner = da4cd793c357...
slip    = 4f3b6638b119...
```

Desktop은 Playwright Chromium을 직접 headless로 기동했고 HashRouter URL을 사용했다. Vite는 다음 strictPort 프로세스였다.

```text
node ... vite.js dev --config vite.renderer.dev.config.ts
  --host 127.0.0.1 --port 5175 --strictPort
http://127.0.0.1:5175/ -> 200
```

네트워크로 확인한 호출 API:

```text
GET   http://127.0.0.1:8080/actuator/health -> 200
GET   http://127.0.0.1:8084/actuator/health -> 200
GET   http://127.0.0.1:8085/actuator/health -> 200
GET   http://127.0.0.1:8080/api/products?page=0&size=50 -> 200 (인증)
PATCH http://127.0.0.1:8080/api/v1/products/AJ060MXHNBC1/goods-type -> 500 (인증)
GET   http://127.0.0.1:8080/api/v1/products/admin/sync/last -> 200 (인증)
POST  http://127.0.0.1:8080/slips/2026%2F08%2F08-41/complete에 대응하는 내부 ID 경로 -> 409 (GUI, 인증)
```

실서비스 식별 UUID는 화면과 본 보고서에 표시하지 않았다.

## 판정

```text
발화 조건 — 견적품목 첫 페이지 상품 표본 = 38
발화 조건 — 전체 품목 상품/비상품 표본 = 3,050 / 34
실 사용자 경로 재현 결함 = 1건
머지 판단 = 차단
```

결함은 PR 본래 기능의 진입점에서 재현된다. 사용자가 **견적품목 메뉴에서 상품을 비상품으로 바꾸면 PATCH가 500**이 되어 지정할 수 없다. 따라서 그 비상품을 견적에 넣고 납품가 입력 시 수량이 1이 되는 다음 단계에도 도달할 수 없다.

원인은 병합 상태의 gateway route 누락이다. Desktop은 `/api/v1/products/{modelCode}/goods-type`을 호출하고 product-service 컨트롤러도 같은 풀패스를 보유한다. 그러나 gateway에는 `usage`, `variable-discount`, `fixed-discount`, `classification` 등의 no-strip 예외만 있고 `goods-type` 예외가 없다. 요청은 generic `/api/v1/products/**`의 `StripPrefix=2`로 들어가 product-service에 `/products/{modelCode}/goods-type`으로 전달된다.

실 product-service 원문:

```text
org.springframework.web.servlet.resource.NoResourceFoundException:
No static resource products/AJ060MXHNBC1/goods-type.
```

GUI 네트워크 원문:

```text
[TRIGGER COUNT] PRODUCT_TOTAL=3084 FIRST_PAGE_GOODS=38
[GOODS TYPE RESPONSE] HTTP=500
BODY={"success":false,"code":"INTERNAL_ERROR","message":"서버 내부 오류가 발생했습니다.",...}
```

증거: `docs/qa/2026-08-09-1152-postmerge2/01-estimate-item-designation-error.png`

## 각도 1 — PR 본래 기능

실 GUI에서 `#/products/estimate-items`로 이동하고 편집 가능한 실제 상품 `AJ060MXHNBC1`을 선택했다. 상품/비상품 select에서 `NON_GOODS`를 선택한 즉시 위 PATCH 500이 재현되었다. DB 값은 `GOODS`로 남았고, 실패 뒤 화면도 원상태로 재조회했다. DB 직접 INSERT는 하지 않았다.

비상품 지정 자체가 막혀 `#/sales/estimates/new`의 납품가 입력 및 수량 자동 1은 **판정 불가**다. 표본 0 때문이 아니라 선행 사용자 동작의 재현 결함 때문이다.

## 각도 2 — 실 출고와 #1151 journal

`shipBatch` 4인자 호출 관계는 PM 확정 사실을 뒤집지 않았고 재조사하지 않았다. 실제 GUI에서는 기존 정상 후보 전표 `2026/08/08-41`, 활성 일반상품 `0000098`, HQ-001 재고 표본 1건을 사용했다.

첫 시도 원문:

```text
save -> 200
send -> 200
accept -> 200
process -> 200
complete -> 409
```

재시도 원문:

```text
[OUTBOUND STATE] 2026/08/08-41 STATUS=PROCESSING REMAINING=complete
[OUTBOUND RESPONSE] 2026/08/08-41 complete HTTP=409
BODY={"success":false,"code":"CONFLICT","message":"inventory-service 호출 실패(400 BAD_REQUEST):
{\"success\":false,\"code\":\"INVALID_INPUT\",\"message\":\"sourceContext: sourceContext 는 필수입니다\",...}"...}
```

DB 원문:

```text
slip_no       | status     | revision_count | version | partner_code       | partner_name
2026/08/08-41 | PROCESSING | 1              | 6       | 서초1동주민센타    | 서초1동주민센타

source_journal_count
0
```

다만 이것은 PR 결함으로 세지 않는다. 사용자 지시대로 slip-service를 재배포하지 않았고, 실제 보호 배포본은 `t1051` 워크트리에서 2026-08-09 08:05 KST에 생성된 JAR(`a57d210f...`)이다. 반면 현재 병합 소스의 `SlipService.complete`는 `sourceContext(slip)`을 넘기며, 실 응답은 보호 배포본이 이를 보내지 않았음을 증명한다. 즉 **병합 코드의 출고 결함과 보호된 구 slip 배포본의 계약 불일치는 구분할 수 없다는 셋째 가능성**이 실제로 성립한다. 증거 무결성 예외로 이 각도는 판정 불가다.

증거: `docs/qa/2026-08-09-1152-postmerge2/03-before-outbound-complete.png`

## 각도 3 — Flyway 실제 적용 순서

inventory 원문:

```text
installed_rank | version | description                                | type | installed_on                | success
23             | 23      | stock balances warehouse active index      | SQL  | 2026-08-02 01:33:29.631499 | t
24             | 24      | create source operation journals           | SQL  | 2026-08-09 19:26:31.284197 | t
25             | 25      | assert non goods candidate stock absence   | SQL  | 2026-08-09 19:26:31.356385 | t
```

inventory 기동 로그도 `Current version 23 → Migrating 24 → Migrating 25 → Successfully applied 2 migrations, now at version v25`였다.

product 원문:

```text
installed_rank | version | description                                | type | installed_on                | success
32             | 32      | bundle components manual                    | SQL  | 2026-08-07 22:44:16.214956 | t
33             | 33      | mark non goods estimate candidates          | SQL  | 2026-08-09 10:12:35.966992 | t
34             | 34      | expand product statuses                      | SQL  | 2026-08-09 19:31:46.170440 | t
```

요청한 `inventory V23 → V24 → V25`, `product V32 → V33` 순서와 success=true를 확인했다. product V34는 이 HEAD에 없는 다른 실행 트랙의 공유 DB 적용분이며, 이를 PR #1152 결함이나 잔재로 세지 않았다. 최종 HEAD product-service는 DB version 34를 정상 인식하고 기동했다.

## 각도 4 — product-service #1127 겹침

최종 HEAD product JAR 재배포 뒤 `#/admin/sheet-sync`를 실제로 열었다.

```text
[SHEET SYNC] GET /api/v1/products/admin/sync/last -> 200
SUMMARY=null-after-redeploy
```

`구글 시트 동기화` 화면과 결과 표의 `비고` 열이 정상 렌더링됐다. 재배포로 메모리성 마지막 실행 summary가 null인 상태도 오류 없이 표시했다. 이 화면에서 사용자 재현 결함은 찾지 못했다.

증거: `docs/qa/2026-08-09-1152-postmerge2/05-sheet-sync-remark-surface.png`

## 신규 파일 목록

- `clients/desktop/playwright/1152-postmerge2-sol-reconv-real-qa/1152-postmerge2-sol-reconv-real-qa.spec.ts`
- `docs/qa/2026-08-09-1152-postmerge2/01-estimate-item-designation-error.png`
- `docs/qa/2026-08-09-1152-postmerge2/03-before-outbound-complete.png`
- `docs/qa/2026-08-09-1152-postmerge2/05-sheet-sync-remark-surface.png`
- `docs/dev-reports/2026-08-09-1152-postmerge2-sol-reconv.md`

QA 스펙은 `resolveQaShotsDir()`을 사용하고, 각 테스트 본문에서 credential 해석을 `try/catch` 후 `test.skip` 처리한다. 파일명은 `*-real-qa.spec.ts`라 mock hard gate 제외 규약에 걸린다. DB 직접 INSERT, git commit/push, 다른 worktree 또는 main checkout은 하지 않았다.

# PR #1175 재수렴 적대검증 2회차 (SOL)

- 대상: `feat/883-s4-order-ds-migration`, 사용자 제공 HEAD `aab3d29df`
- 일시: 2026-08-12 (Asia/Seoul)
- 판정 질문: 실 사용자 경로로 재현 가능한 결함이 있는가(심각도 무관)
- 제한 준수: git 명령 미사용, 공유 Docker 스택 미사용, 구현 코드 미변경

## 측정 1 — fix4 정적 도달성·문구·권한 게이트

실행 원문:

```powershell
rg -n --glob '*.tsx' --glob '*.ts' --glob '!**/*.test.*' --glob '!**/playwright/**' "주문서 앱 접근권한|주문서 승인|order-approvals|showPartnerOrderList" clients/desktop/src/renderer
```

출력 원문(해당 전량):

```text
clients/desktop/src/renderer\components\AppLayout.tsx:561:  const showPartnerOrderList       = dynamicCanAccess('sales.partner-order.list',     'view')
clients/desktop/src/renderer\components\AppLayout.tsx:654:    showSalesSlipList || showEstimatesList || showPartnerOrderList
clients/desktop/src/renderer\components\AppLayout.tsx:710:              '/sales/order-approvals',
clients/desktop/src/renderer\components\AppLayout.tsx:742:              show={showPartnerOrderList}
clients/desktop/src/renderer\components\AppLayout.tsx:748:              to="/sales/order-approvals"
clients/desktop/src/renderer\components\AppLayout.tsx:749:              show={showPartnerOrderList}
clients/desktop/src/renderer\components\AppLayout.tsx:751:              주문서 승인
clients/desktop/src/renderer\components\sales\SalesSubNav.tsx:3: * `/sales/order-approvals`, `/sales/partner-dc-config` 4 sub-route 의 1단계 탭.
clients/desktop/src/renderer\components\sales\SalesSubNav.tsx:6: * - `/sales/long-pending` → `/sales/order-approvals` (장기미발주 → '주문서 승인')
clients/desktop/src/renderer\components\sales\SalesSubNav.tsx:23:  { to: '/sales/order-approvals', label: '주문서 승인' },
clients/desktop/src/renderer\utils\orderAppAccess.ts:1:/** 주문서 앱 접근권한 설정의 비밀번호 초기화 안전 게이트. */
clients/desktop/src/renderer\api\mock.ts:8421:  // GET /api/v1/partner-approvals — 주문서 승인 (status 6종)
clients/desktop/src/renderer\routes\index.tsx:518:        // [Round C P1 #4 FE] 주문서 승인 — 사이드바 노출(showPartnerOrderList)과 동일 page-code 로
clients/desktop/src/renderer\routes\index.tsx:521:        path: '/sales/order-approvals',
clients/desktop/src/renderer\api\sales.ts:997:// partner-service — 주문서 승인 (v2 §정정 9, /sales/order-approvals)
clients/desktop/src/renderer\api\sales.ts:1001: * PartnerApprovalStatus — 주문서 승인 status enum 6종 (v2 §정정 9 / §정정 11).
clients/desktop/src/renderer\api\sales.ts:1003: * <p>csv 시드 (`주문서 승인현황 *.csv`) 의 status 분포 + DECISIONS.md 정정 라운드 명세.
clients/desktop/src/renderer\api\sales.ts:1023:/** PartnerApproval row — `/sales/order-approvals` grid source. */
clients/desktop/src/renderer\api\sales.ts:1040:/** 주문서 앱 접근권한 미리보기 — 후보와 외부 조회 보류를 함께 표시한다. */
clients/desktop/src/renderer\api\sales.ts:1049: * 주문서 승인 페이지 조회 — `/api/v1/partner-approvals?page=&size=&status=`.
clients/desktop/src/renderer\api\sales.ts:1066: * 주문서 승인 후보 미리보기.
clients/desktop/src/renderer\api\sales.ts:1081: * 영업자 주문서 승인 status 변경 (v2 §정정 9/11).
clients/desktop/src/renderer\routes\SalesOrderApprovalsPage.tsx:2: * 주문서 승인 — `/sales/order-approvals` (v2 정정 §9/§10/§11/§14 통합).
clients/desktop/src/renderer\routes\SalesOrderApprovalsPage.tsx:72:    setPageTitle({ title: '주문서 승인', meta: '영업' })
clients/desktop/src/renderer\routes\SalesOrderApprovalsPage.tsx:246:            주문서 승인
clients/desktop/src/renderer\routes\SalesOrderApprovalsPage.tsx:319:          <div className={styles['emptyState']}>주문서 승인 목록을 불러오는 중…</div>
```

실행 원문:

```powershell
rg -n -C 6 'showPartnerOrderList|order-approvals|SalesSubNav' clients/desktop/src/renderer/components/AppLayout.tsx clients/desktop/src/renderer/components/sales/SalesSubNav.tsx clients/desktop/src/renderer/routes/SalesOrderApprovalsPage.tsx
```

확인 결과:

- 사이드바의 `/sales/order-approvals` 링크는 1개이며 `showPartnerOrderList`로 노출된다.
- 판매 상단 탭의 같은 라우트 항목도 1개이며 라벨은 `주문서 승인`이다.
- 라우트는 삭제되지 않았고 `routes/index.tsx`에 남아 있다. 직접 URL 진입도 동일 `sales.partner-order.list` VIEW 권한으로 보호된다.
- `sales.ts:1040`과 `orderAppAccess.ts:1`의 옛 문구는 각각 `/** ... */` 주석이다. 현재 프런트 사용자 노출 문자열 검색에는 주석 이외의 옛 문구가 검출되지 않았다.
- 이 측정 범위에서 실 사용자 결함은 발견되지 않았다. 라이브 렌더·상호작용으로 재검증한다.

## 측정 2 — fix4 집중 단위 회귀

실행 원문:

```powershell
npx vitest run src/renderer/routes/SalesOrderApprovalsMenu.test.ts src/renderer/routes/SalesOrderApprovalsPage.test.tsx src/renderer/utils/orderAppAccess.test.ts
```

출력 원문:

```text
 RUN  v2.1.9 C:/dev/Samhan-Public/.claude/worktrees/w883/clients/desktop

 ✓ src/renderer/routes/SalesOrderApprovalsMenu.test.ts (1 test) 3ms
 ✓ src/renderer/utils/orderAppAccess.test.ts (2 tests) 2ms
 ✓ src/renderer/routes/SalesOrderApprovalsPage.test.tsx (1 test) 57ms

 Test Files  3 passed (3)
      Tests  4 passed (4)
   Start at  11:51:51
   Duration  1.81s (transform 135ms, setup 0ms, collect 458ms, tests 62ms, environment 704ms, prepare 436ms)
```

판정: 메뉴 단일성, 화면 기능 렌더, 비밀번호 초기화 안전 게이트 집중 테스트 4/4 PASS. 이 측정에서 실 사용자 결함은 발견되지 않았다.

## 측정 3 — 격리 스택 상태

공유 `samhan-*` 스택에는 로그인·API 호출을 하지 않았다. 1회차가 만든 전용 `recon1175-net`, 전용 PostgreSQL `recon1175-pg:39832`, 전용 gateway `39880`, 전용 auth `39881`, 전용 partner-auth `39891`과 새 renderer 포트 `52883`만 사용했다.

실행 원문:

```powershell
$services=@(@('auth',39881),@('partner-auth',39891),@('product',39884),@('partner',39895),@('slip',39886),@('order',39888),@('dc',39889),@('gateway',39880)); foreach($s in $services){try{$status=(Invoke-RestMethod -Uri "http://127.0.0.1:$($s[1])/actuator/health" -TimeoutSec 3).status}catch{$status='FAIL'}; "$($s[0])=$status@$($s[1])"}
```

출력 원문:

```text
auth=UP@39881
partner-auth=UP@39891
product=UP@39884
partner=UP@39895
slip=UP@39886
order=UP@39888
dc=UP@39889
gateway=UP@39880
```

기능 버튼까지 실동작시키기 위해 격리 `partner_auth_db`에만 활동 60일 전 후보 1건을 넣었다. 최초 seed에서 내부 enum을 외부 표시 enum(`APPROVED`)으로 잘못 넣어 500을 만들었으나, 스택 로그의 `No enum constant ... PartnerStatus.APPROVED`를 확인한 뒤 제품 enum `NEED_PW_INPUT`으로 바로잡았다. 이는 제품 결함이 아니라 검증 seed 오류이며, 교정 후 목록·미리보기는 HTTP 200이었다.

## 측정 4 — 격리 라이브 QA

실행 원문:

```powershell
node .codex-tmp\1175-reconv2-liveqa.mjs
```

출력 원문:

```text
SALES_INTERNAL_TABS=["견적서 관리","주문서 관리","주문서 승인","거래처 DC 설정","견적 가격 설정"]
SALES_EXTERNAL_BUTTONS=["웹 종합견적서 ↗","웹 주문서 ↗"]
SALES_INTERACTIVE_TOTAL=7
PREVIEW_COUNT_TEXT="현재 대상 1건"
RESET_CONFIRM="다음 1개 거래처의 비밀번호를 초기화하시겠습니까?\n\n1018100001 1018100001"
RESET_HTTP_STATUS=200
LOW_ROLE="WAREHOUSE"
LOW_ROLE_MENU_COUNT=0
LOW_ROLE_DIRECT_URL=http://127.0.0.1:52883/#/
LOW_ROLE_DIRECT_TITLE_COUNT=0
LIVE_QA_RESULT=PASS
```

사용자 경로 판정:

- `MASTER` 홈 → 판매 그룹 펼침 → 사이드바 `주문서 승인` 단일 링크 클릭 → `/#/sales/order-approvals` 진입 성공.
- 화면 제목과 앱 제목은 `주문서 승인`; 옛 문구 `주문서 앱 접근권한 설정`은 화면에 0건.
- 장기미발주 기준은 `주문·출고 활동 없음 30일`로 노출된다.
- 상태 필터는 `전체 상태 + 6상태` 7개 option이며 `APPROVED` 선택/전체 복귀가 동작한다.
- 미리보기는 격리 후보 `현재 대상 1건`을 반환했다. 체크 전 bulk 버튼 disabled, 체크 후 `선택 대상 비밀번호 초기화 (1)` enabled, 확인 대화상자 후 실제 `POST .../reset-password` HTTP 200, 목록 상태가 `비밀번호 재설정 대기`로 갱신됐다.
- `WAREHOUSE`에서는 `showPartnerOrderList` 결과로 사이드바 링크 0개. 직접 URL 진입도 보호 화면을 렌더하지 않고 홈 `/#/`로 복귀했다.
- 판매 상단 navigation 실측은 **고유 내부 탭 5개 + 외부 웹 버튼 2개 = 상호작용 항목 7개**다. fix4 전 내부 6개 중 2개가 같은 `/sales/order-approvals`였고, 삭제 후 고유 화면 5개가 각각 도달 가능하다. 즉 별도 화면 소실은 없다.

시각 검수: PNG 4장 모두 실제 렌더이며 빈 이미지·오류 화면·옛 문구 노출이 없다. 화면에서 사이드바 단일 항목, 기능 3종, 초기화 후 상태, 저권한 미노출을 직접 확인했다.

스크린샷 파일 전부:

- `docs/qa/2026-08-12-1175-reconv2/01-sidebar-order-approval-entry.png`
- `docs/qa/2026-08-12-1175-reconv2/02-order-approval-features.png`
- `docs/qa/2026-08-12-1175-reconv2/03-password-reset-completed.png`
- `docs/qa/2026-08-12-1175-reconv2/04-low-role-hidden-and-blocked.png`

## 현재 판정

- **실 사용자 경로로 재현 가능한 결함: 0건.**
- **증거 무결성 신규 불일치: 0건.** 1회차가 이미 판정한 CSS 수치 불일치 2건은 fix4 이후에도 기존 판정으로 유지하며, 이번 메뉴 fix가 새로 만든 불일치는 발견하지 못했다.

## 종료 검증

fresh 라이브 QA 재실행 원문:

```text
UPDATE 1
SALES_INTERNAL_TABS=["견적서 관리","주문서 관리","주문서 승인","거래처 DC 설정","견적 가격 설정"]
SALES_EXTERNAL_BUTTONS=["웹 종합견적서 ↗","웹 주문서 ↗"]
SALES_INTERACTIVE_TOTAL=7
PREVIEW_COUNT_TEXT="현재 대상 1건"
RESET_CONFIRM="다음 1개 거래처의 비밀번호를 초기화하시겠습니까?\n\n1018100001 1018100001"
RESET_HTTP_STATUS=200
LOW_ROLE="WAREHOUSE"
LOW_ROLE_MENU_COUNT=0
LOW_ROLE_DIRECT_URL=http://127.0.0.1:52883/#/
LOW_ROLE_DIRECT_TITLE_COUNT=0
LIVE_QA_RESULT=PASS
```

산출물 검증 원문:

```text
REPORT_EXISTS=True
REPORT_BYTES=9966
PNG_COUNT=4
01-sidebar-order-approval-entry.png|1440x1034|55674bytes
02-order-approval-features.png|1440x1034|98180bytes
03-password-reset-completed.png|1440x1034|99690bytes
04-low-role-hidden-and-blocked.png|1440x900|42990bytes
REPORT_CONTAINS[실 사용자 경로로 재현 가능한 결함: 0건]=True
REPORT_CONTAINS[01-sidebar-order-approval-entry.png]=True
REPORT_CONTAINS[02-order-approval-features.png]=True
REPORT_CONTAINS[03-password-reset-completed.png]=True
REPORT_CONTAINS[04-low-role-hidden-and-blocked.png]=True
```

git 명령 없이 worktree index v2의 19,246개 추적 entry를 읽어 실제 경로 존재를 전수 확인했다.

```text
INDEX_VERSION=2
TRACKED_ENTRY_COUNT=19246
MISSING_TRACKED_COUNT=0
```

**삭제된 추적 파일 없음.**


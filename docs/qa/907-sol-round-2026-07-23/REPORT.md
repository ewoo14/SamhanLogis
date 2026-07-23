# PR #907 마감 지향 재수렴 적대검증 — CODEX SOL 5.6

- 대상: PR #907 / `feat/867-s7-order-merge-partner-first`
- 검증 SHA: `833c3dcdc161bf7c922b6167eada5d6bdbc13315`
- 일시: 2026-07-23
- 판정 기준: 실 사용자 UI/API 경로에서 실행 재현한 결함은 심각도와 무관하게 `도달가능`

## 판정

도달가능: 4건 / 검증품질: 6건

## 도달가능 (게이트)

### R-1 동일 코드·상이 UUID 주문이 같은 병합 후보로 노출됨 [NEW] [도달가능]

- 파일: `PartnerOrderQueryService.java:274,359`, `PartnerOrderSummaryResponse.java:68`,
  `PartnerOrderMergeConvertService.java:123-131`
- 실 사용자 경로: 거래처가 soft-delete된 뒤 같은 코드를 새 UUID로 재등록한 상태에서 사용자가
  현재 거래처를 선택하면, 이전 UUID 주문과 현재 UUID 주문이 모두 후보로 표시된다.
- 재현 실행 결과:
  - 마커 `CODEX-907-QA-BE`로 `partner_code=P-2026-0001`, 서로 다른 `partner_id` 주문 2건 생성.
  - `GET /api/v1/partner-orders?...&partnerCode=P-2026-0001`:
    `markerRows=2`, 두 행 모두 `mergeEligible=true`, DB `count(DISTINCT partner_id)=2`.
  - 같은 2건을 `POST /api/v1/partner-orders/convert-to-slip-merge`:
    `HTTP 409`, `"병합은 동일 거래처 정체성의 주문만 가능합니다."`
  - 동일 UUID 대조군은 정체성 409를 통과하고 의도적으로 잘못 준 line UUID에서 422에 도달했다.
- 왜 게이트인가: 후보 단계는 `partnerCode`, 실행 단계는 UUID를 사용해 사용자가 선택 가능한 후보와
  실제 병합 가능한 후보의 정체성 축이 다르다. 최종 409 안전망은 살아 있지만 S7-1 UX를 깨뜨린다.
- 불변식 위반: S7-1. S7-2 안전망은 정상.
- 신규성: `git diff 783d31ca6..833c3dcdc`에서 exact `partnerCode` predicate,
  `mergeEligible`, UUID 비교가 본 PR에서 도입·변경된 것을 확인했다.

### R-2 거래처 전환 후 이전 거래처의 창고·충돌 헤더가 새 거래처 제출에 재사용됨 [NEW] [도달가능]

- 파일: `MergeConvertDialog.tsx:257-262,314,321-323,365-390,410-417`
- 실 사용자 경로:
  1. A 거래처 주문 2건을 고르고 창고·납기·요청사항 충돌값을 확정한다.
  2. 제출 전 B 거래처로 바꾸고 B 주문 2건을 고른다.
  3. B 충돌 라디오는 하나도 선택하지 않았는데 `병합 발행` 버튼이 활성화된다.
- 재현 실행 결과:
  - Playwright 실 GUI에서 A/B 각각 2건의 throwaway 주문을 생성해 실행했다.
  - B 충돌 라디오 선택 수 `0`, 제출 버튼 `enabled`.
  - 제출 클릭 직전 outgoing POST body를 부작용 방지 차단 캡처:
    `shippingInfo={"paymentDueLabel":"2026-08-12","memo":"SOL 충돌 메모 11"}`.
    둘 다 A 주문 값이며 B 주문 값은 `2026-08-02/03`, `SOL 충돌 메모 21/22`였다.
  - 증거: `07-거래처A-창고와충돌값확정.png`,
    `08-거래처B-충돌값미선택인데제출활성.png`
- 왜 게이트인가: B 판매전표에 A 배송 헤더가 조용히 들어갈 수 있는 실제 데이터 오염 경로다.
- 불변식 위반: S7-4.
- 신규성: `0e5df0788`에서 거래처 우선 선택과 `handlePartnerChange`가 신설됐으며,
  변경 핸들러가 `selectedOrders`만 초기화하는 것을 diff로 확인했다.

### R-3 병합 후보 캐시가 모달 재진입에서 새 주문을 최대 5분 누락함 [NEW] [도달가능]

- 파일: `MergeConvertDialog.tsx:227-236`, `App.tsx:18-27`,
  `SalesPartnerOrderListPage.tsx:156,213-219`
- 실 사용자 경로:
  1. A 거래처 후보를 한 번 조회하고 모달을 닫는다.
  2. 다른 사용자가 A 주문을 생성한다.
  3. 5분 안에 모달을 다시 열고 A를 선택하면 새 주문이 후보에서 빠진다.
- 재현 실행 결과:
  - 최초 후보 API 요청 `1회`, 첫 양성 후보 노출.
  - 모달을 닫고 두 번째 throwaway 주문을 생성한 뒤 재진입:
    추가 후보 API 요청 `0회`, 새 주문 검색 결과 `0건`.
  - 양성 대조로 전체 새로고침 후 재진입:
    후보 API 누적 `2회`, 같은 새 주문이 즉시 노출.
  - 증거: `09-재진입-5분캐시로새주문누락.png`,
    `10-양성대조-새로고침후새주문노출.png`
- 왜 게이트인가: 실 사용자는 정상 생성된 같은 거래처 주문을 병합 후보에서 찾지 못한다.
- 불변식 위반: S7-1의 동일 거래처 후보 제공 약속.
- 신규성: 후보 전용 query key `partner-order-merge-candidates`는 `0e5df0788`에서 신설됐다.
  realtime·성공 invalidate는 기존 `partner-orders`/`partner-order` 키만 갱신한다.

### R-4 거래처 검색에서 `%`·`_`가 리터럴이 아니라 SQL wildcard로 확장됨 [pre-existing] [도달가능]

- 파일: `PartnerRepository.java:80-85,102-120`, `PartnerService.java:187-194`
- 실 사용자 경로: 병합 모달의 거래처 검색란에 `%` 또는 `_`를 입력한다.
- 재현 실행 결과:
  - `GET /admin/partners/search?q=%25&size=20` → `HTTP 200`, `total=55`.
  - `GET /admin/partners/search?q=_&size=20` → `HTTP 200`, `total=55`.
  - 반환 20건 중 입력 리터럴 `%`/`_`를 실제 포함한 거래처는 0건.
  - 병합 후보 API의 `partnerCode=%`, `partnerCode=_`는 각각 0건으로 exact 계약은 정상.
- 왜 게이트인가: 권한 보유 사용자의 정상 자유 입력이 무관한 전체 거래처 결과로 확장된다.
  권한 상승은 아니지만 실제 검색 결과 오류다.
- 불변식 위반: S7 직접 위반은 없고, 보안 관점의 SQL 리터럴 검색 계약 위반.
- 신규성: `git diff main...833c3dcdc -- PartnerRepository.java PartnerService.java`가 비어 있어
  PR 이전 결함임을 확증했다.

## 검증품질 (이월)

### Q-1 제공된 real-QA 하네스가 지정 렌더러의 HashRouter에 도달하지 못함 [NEW]

- `867-s7-merge-real-qa.spec.ts:207`은 `/sales/partner-orders`로 이동하지만,
  지정된 `vite.renderer.dev.config.ts` 렌더러는 `createHashRouter`를 사용한다.
- 사용자 제공 명령 그대로 실행하면 대시보드에서
  `병합 진입 버튼이 없다`로 실패했다.
- `AUDIT_BASE_URL=http://localhost:5190/#`로 실행하면 `/#/sales/partner-orders`가 되어
  양성 A/B·legacy 제외·S7-4가 `1 passed`.
- 제품 결함이 아니라 검증 하네스 결함이므로 이월한다. 원인 커밋은 `eb5fe57a6`.

### Q-2 mock 거래처 검색이 실 BE의 `partners.search:view` 403을 재현하지 않음 [pre-existing]

- 실 BE `PartnerAdminController.java:137`은 VIEW를 강제하지만 `mock.ts:8131-8153`은 권한 검사 없이 반환한다.
- mock QA로 `MergeConvertDialog.tsx:218-223`의 403 한국어 안내를 만들 수 없다.
- 실제 API 헤더 위조(`dev_warehouse` + SALES/MASTER 헤더)에서는 403으로 차단돼 제품 우회는 없었다.

### Q-3 mock의 기존 `partnerId` 부분검색이 `bizCode`를 누락함 [NEW]

- `mock.ts:7839-7844`는 `partnerCode`만 비교하지만 실 BE는
  `partner_code OR biz_code` 부분검색이다.
- 신규 테스트는 P-1/P-10 코드 접두사만 보며 사업자번호 회귀를 잡지 못한다.
- 이번 병합 후보의 `partnerCode` exact 계약과는 다른 공용 목록 계약이라 이월한다.

### Q-4 컴포넌트→sales API→Axios params 직렬화 연결 테스트가 끊겨 있음 [NEW]

- 실제 구현 `sales.ts:730,746`과 소비처 `MergeConvertDialog.tsx:227-233`은 정상이다.
- 컴포넌트 테스트는 `listPartnerOrders`를 mock하고 mock API 테스트는 완성된 params를 직접 넣어,
  전체 연결을 한 테스트에서 검증하지 않는다.

### Q-5 음수 page·size=0에서 400이 아니라 500 [pre-existing]

- `page=-1&size=20`, `size=0` 실제 API가 각각 HTTP 500.
- 현 UI 페이지 상태가 이 입력을 만들지 않아 실 사용자 경로로 재현하지 못했고 검증품질로 분류한다.

### Q-6 단건 상세 cache key 정규화와 성공 invalidate key 형식이 다름 [pre-existing]

- 상세 조회는 하이픈 정규화 key, 성공 invalidate는 BE의 슬래시 주문번호 원문을 사용한다.
- 부분 병합 성공을 실서버에서 실행하면 재고·전표 부작용이 생겨 허용 범위를 벗어나므로
  이번 라운드에서 실행 재현하지 않았다. 정적 위험으로 이월한다.

## 라이브QA 수행 기록

### 기동/접속 증거

```text
HEAD=833c3dcdc161bf7c922b6167eada5d6bdbc13315
PORT 5190 LISTEN PID=3424
CommandLine:
node.exe ...\s7-merge\clients\desktop\node_modules\vite\bin\vite.js
  dev --config vite.renderer.dev.config.ts --port 5190 --strictPort
GET http://localhost:5190 → 200
```

### 양성 대조군과 결과

- 거래처 A/B에 `partner_id`가 있는 주문을 각각 생성했고 양쪽 모두 실제 후보 option으로 노출됐다.
- legacy `partner_id IS NULL` 주문은 후보에서 빠지고 한국어 제외 사유와 단건 발행 가능 안내가 보였다.
- 후보 캐시 음성(재진입 시 새 주문 없음) 뒤 전체 새로고침 양성(같은 새 주문 노출)을 확인했다.
- BE 409 대조:
  - 상이 UUID → 409 정체성 차단.
  - 동일 UUID → 정체성 차단을 통과하고 다음 의도적 line 오류 422.
- 권한 대조:
  - `dev_sales` 병합 미존재 주문 → 권한 통과 후 404.
  - `dev_accountant`·위조 `dev_warehouse` → 403.

### 실행 명령

```powershell
$env:AUDIT_BASE_URL='http://localhost:5190'
.\node_modules\.bin\playwright.cmd test `
  --config=playwright.real-qa.config.ts `
  --reporter=line --timeout=60000 `
  '907-sol-adversarial-real-qa.spec.ts'
```

최종 결과:

```text
3 passed (22.1s)
[상태 대조] 전환·새로고침·뒤로가기 모두 주문 선택 잔존 0
[재현] B 충돌 라디오 선택 0건, 제출 enabled
[캐시 재현] 재진입 요청=1, 새 주문 누락 / 새로고침 요청=2, 새 주문 노출
```

선별 재실행에서 outgoing body 확증:

```text
[재현] B 충돌 라디오 선택 0건, 제출 enabled,
outgoing shippingInfo={"paymentDueLabel":"2026-08-12","memo":"SOL 충돌 메모 11"}
1 passed
```

### 스크린샷 경로

모두 `docs/qa/907-sol-round-2026-07-23/` 아래에 있다.

1. `01-주문목록-실서버.png`
2. `02-거래처선택전-주문후보없음.png`
3. `03-거래처A-양성후보선택-legacy제외.png`
4. `04-거래처B전환-A선택제거-B양성후보.png`
5. `05-새로고침후-선택상태초기화.png`
6. `06-뒤로가기복귀-선택상태미잔존.png`
7. `07-거래처A-창고와충돌값확정.png`
8. `08-거래처B-충돌값미선택인데제출활성.png`
9. `09-재진입-5분캐시로새주문누락.png`
10. `10-양성대조-새로고침후새주문노출.png`

### throwaway 생성/정리 SQL과 원상 확인

생성 범위:

```sql
INSERT INTO partner_orders (..., created_by, partner_id, due_date, memo)
VALUES (..., 'CODEX-907-QA-SOL', ...);
INSERT INTO partner_order_lines (..., created_by)
VALUES (..., 'CODEX-907-QA-SOL');
```

각 테스트 `finally` 정리:

```sql
DELETE FROM partner_order_history WHERE partner_order_id IN (<marker 주문>);
DELETE FROM slip_publish_outbox WHERE partner_order_id IN (<marker 주문>);
DELETE FROM partner_order_lines WHERE partner_order_id IN (<marker 주문>);
DELETE FROM partner_orders WHERE id IN (<marker 주문>);
```

최종 원상 확증:

```text
orders=0
lines=0
history=0
outbox=0
```

직원 JWT 주문 생성 401 때문에 DB fixture는 알려진 대로 `requirePartnerId` 생성 경로를 지나지 않는다.
따라서 이 라이브 QA가 검증한 범위는 후보 조회·선택·전환·캐시·409 안전망이며,
생성 시 identity resolve는 BE 단위/IT 검증 범위다.

## 도달가능 0 인가?

아니오. exact SHA의 CI 40/40과 무관하게 실제 서버·GUI에서 신규 도달가능 3건과
pre-existing 도달가능 1건을 실행 재현했다. 특히 후보 정체성 축 불일치와 거래처 전환 상태 오염은
각각 S7-1, S7-4를 직접 위반하므로 PR #907은 이 상태로 마감 수렴할 수 없다.

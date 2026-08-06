```
git -C . rev-parse --show-toplevel     # D:/dev/Samhan-Public/.claude/worktrees/w1057
git -C . branch --show-current         # feat/874-set-riusage-global-dc
git -C . rev-parse HEAD                # e28e0fd606a8c2f0f202331714c1e45017abc524
```

# #874 R37 SOL 적대 재수렴 — R35·R36 사용자 도달 표면

## 판정

**머지 비권고.** R35는 같은 `SlipDetailPage` 인스턴스 안에서 직접 수정과 협업 수정을 배타화했지만,
서로 다른 사용자 세션 사이에서는 두 편집 폼을 동시에 열 수 있다. 협업 저장 계약에는
`updatedAt`/revision 비교가 없어서, 한 사용자의 직접 수정 뒤 다른 사용자가 오래된 협업 초안을 저장하면
최신 값을 조용히 되돌릴 수 있다. 현재 실 데이터에서 이 경합 표면은 OUTBOUND DRAFT **116건**,
로그인 가능한 관련 역할 계정 **3명(MASTER·MANAGER·SALES 각 1명)**이다.

추가로 협업 폼의 접근성 구역명이 아직 `수정`으로 남은 실제 화면 결함 1건과, 대시보드가
PageCode를 완전히 소비하지 않아 정상적인 권한 회수 뒤 버튼→홈 리다이렉트가 되는 역방향 계약 결함이 남았다.
전 라우트 회귀의 최우선 질문에 대해서는, **현재 실 역할 데이터에서 작동하던 라우트가 R35 때문에
사라진 건수는 0이고 비전표 메뉴 감소도 0**이다.

R36은 제품 코드를 바꾸지 않았으므로 별도 사용자 표면 회귀는 없다.

## 증거 무결성 및 실행 환경

### 무결성

- `integrity_toplevel`: `D:/dev/Samhan-Public/.claude/worktrees/w1057`
- `integrity_branch`: `feat/874-set-riusage-global-dc`
- `integrity_head_start`: `e28e0fd606a8c2f0f202331714c1e45017abc524`
- `integrity_head_end`: `e28e0fd606a8c2f0f202331714c1e45017abc524`
- `integrity_status_before`: clean
- `integrity_status_before_report`: clean
- 비교 기준: R35 직전 `17e79e1d6`, R35 `2edf75405`, R36/HEAD `e28e0fd60`
- 주어진 CI 상태: `42/42 green` (`e28e0fd60`).

### 컨테이너 필드

| 필드명 | 실측값 |
|---|---|
| `slip_service_name` | `/samhan-slip-service` |
| `slip_service_created` | `2026-08-05T02:50:44.702471161Z` |
| `slip_service_started` | `2026-08-05T02:51:02.147121178Z` |
| `api_gateway_name` | `/samhan-api-gateway` |
| `api_gateway_created` | `2026-08-05T02:50:37.64267995Z` |
| `api_gateway_started` | `2026-08-05T02:50:51.017973805Z` |
| `deployed_code` | `#1045` |

`docker inspect`는 gateway `created`의 끝 0을 생략해 `.64267995Z`로 출력했다. PM이 제시한
`.642679950Z`와 같은 timestamp다. 착수·종료 재실측에서 두 컨테이너의 `created`/`started`가 모두 같았다.
컨테이너 재배포·재빌드·중지와 DB 쓰기는 하지 않았다.

### 프런트 실행 필드

| 필드명 | 실측값 |
|---|---|
| `vite_config` | `clients/desktop/vite.renderer.dev.config.ts` |
| `mock_frontend` | `http://127.0.0.1:5176`, `--strictPort`, version `2026/08/05-37` |
| `live_auth_frontend` | `http://127.0.0.1:5177`, `--strictPort`, version `2026/08/05-38` |
| `browser` | 저장소에 설치된 Playwright Chromium으로 실제 렌더링 |
| `cleanup` | 검증용 로컬 Vite 두 프로세스만 종료, 5176·5177 listener 없음 |

5177은 mock을 끄고 `VITE_API_BASE_URL=http://127.0.0.1:8080`으로 실행했다. 역할별 실제 계정 로그인,
권한 API, `#1045` 서버를 사용했다. 화면을 바꾸는 저장·전이·삭제 동작은 수행하지 않았다.

## 결함 1 — P1: 편집 배타화가 사용자 세션 경계를 넘지 못해 최신 값을 조용히 덮을 수 있다

### ① 화면 동선

1. 사용자 A(MASTER)가 판매관리 → DRAFT 전표 상세 → `협업 수정`을 연다.
2. 사용자 B(SALES)가 같은 전표 상세 → `직접 수정`을 연다.
3. A 화면에는 협업 폼, B 화면에는 직접 수정 폼이 동시에 존재한다.
4. B가 메모를 직접 저장한 뒤, A가 이미 열어 둔 메모 초안을 협업 저장한다.
5. B의 직접 수정은 성공했지만 A의 협업 저장에는 B 이후의 `updatedAt`/revision 확인이 없어,
   A의 오래된 `after` 값으로 다시 바뀔 수 있다. 반대 순서에서 B의 직접 저장은 stale `updatedAt` 때문에
   409가 나므로 두 저장 경로가 비대칭이다.

### ② 재현 근거

실 서버 로그인 두 계정과 같은 실 DRAFT 전표를 사용한 비변경 GUI 재현 결과:

```text
초기 A: 직접 수정 1, 협업 수정 1
초기 B: 직접 수정 1, 협업 수정 1
A 협업 오픈: 직접 버튼 0, 협업 폼 1
B 직접 오픈: 협업 버튼 0, 직접 폼 1
동시 상태: A 협업 폼 1 + B 직접 폼 1
A 협업 닫기: 직접 수정 1, 협업 수정 1
B 직접 닫기: 직접 수정 1, 협업 수정 1
```

따라서 “열었다 닫으면 다른 진입점이 영구히 사라진다”는 결함은 없다. 같은 페이지 안에서도 두 폼이
함께 열리지 않는다. 실패 지점은 서로 다른 페이지/사용자 사이에 공유 배타 상태나 서버 충돌 토큰이 없다는 점이다.

코드 경로:

- `SlipDetailPage.tsx:1199-1211`의 `editSurfaceEntryAvailability()`는 로컬 React state인
  `directOpen`/`collabOpen`만 본다.
- `SlipDetailPage.tsx:2350-2359`의 `directEditOpen`과 `collabEditMode`도 한 페이지 인스턴스의 값이다.
- `SlipCollaborationPanel.tsx:142-157`은 편집을 처음 열 때만 `editValues`를 채운다. 원격 event로
  `currentValues`가 갱신되어도 `editModeInitializedRef` 때문에 기존 초안은 그대로 남는다.
- `SlipCollaborationPanel.tsx:195-214`는 저장 시 최신 `currentValues`를 `before`, 오래된 로컬 초안을
  `after`로 보내므로 최신 값→오래된 값이 정상 변경처럼 보인다.
- `SlipDocumentCollaborationPort.java:168-185`는 클라이언트 baseline을 검증하지 않고 저장 시점의
  현재 값을 새 `before`로 다시 만든다.
- `SlipDocumentCollaborationPort.java:205-223`은 `before`를 버리고 `after`만 patch map으로 파싱한다.
- `SlipCollabEditService.java:71-76` → `SlipService.java:555-575`는 revision/updatedAt 비교 없이
  현재 row에 `after`를 적용한다.
- 직접 수정은 `SlipUpdateRequest.java:28-30`의 필수 `updatedAt`과
  `SalesSlipUpdateService.java:78`/`SlipUpdateService.java:74`의 version 검증을 거쳐 stale 저장을 409로 막는다.
- R35·R36은 이 서버 경로를 바꾸지 않았다. R34가 실증한 “직접 저장 뒤 협업 저장 시 조용한 되돌림”의
  원인이 그대로다.

### ③ 실 데이터 건수

종료 시점 `slip_db.slips WHERE is_deleted=false`:

| 유형 | 상태 | 건수 | 직접 수정 | 협업 수정 | 동시 경합 표면 |
|---|---:|---:|---:|---:|---:|
| INBOUND | CONFIRMED | 1 | 아니오 | 예 | 아니오 |
| INBOUND | INSPECTING | 1 | 아니오 | 예 | 아니오 |
| OUTBOUND | CONFIRMED | 1 | 아니오 | 예 | 아니오 |
| OUTBOUND | DRAFT | **116** | 예 | 예 | **예** |
| OUTBOUND | SENT | 4 | 아니오 | 예 | 아니오 |
| 합계 |  | **123** | 116 | 123 | **116** |

`SAVED` 활성 전표는 0건이다. OUTBOUND 직접·협업 양쪽 권한을 가진 로그인 가능 계정은
MASTER 1명, MANAGER 1명, SALES 1명으로 **3명**이다. `dev_locked`는 enabled row지만 실제 locked라
실사용 계정 수에서 제외했다.

## 결함 2 — P2: 협업 수정 폼의 접근성 이름에 옛 `수정`이 남았다

### ① 화면 동선

전표 상세 → `협업 수정` → 보조기기의 landmark/region 탐색을 사용한다. 시각 버튼은 `협업 수정`인데
편집 구역은 `수정`으로 읽혀 `직접 수정`과 구분되지 않는다.

### ② 재현 근거

- 제품 소스 `SlipCollaborationPanel.tsx:428`: `<section aria-label="수정">` 1건.
- 실제 Chromium에서 협업 폼을 연 뒤:

```text
button[name="직접 수정"] = 0
button[name="협업 수정"] = 1
section[aria-label="수정"] = 1
section[aria-label="협업 수정"] = 0
```

- 관련 전표 상세 버튼/Playwright selector/mock/manual의 옛 exact action `수정`은 이 구역명을 제외하고
  남지 않았다. 전역 grep에서 잡힌 다른 `수정` 버튼은 배차업체·버전관리·개발메뉴 등 다른 동작이고,
  전표 버전 이력의 변경 유형 `수정`도 행위 진입점이 아니므로 결함에서 제외했다.
- 데스크톱·모바일 상세 진입점은 `직접 수정`/`협업 수정`, 삭제와 취소는
  `전표 삭제`/`전표 취소`로 분리되어 있다.

### ③ 실 데이터 건수

현재 123개 활성 전표의 상태가 모두 `isCollabEditStatus=true`다. OUTBOUND 121건은
MASTER·MANAGER·SALES, INBOUND 2건은 MASTER·MANAGER·WAREHOUSE가 협업 폼에 도달할 수 있다.
로그인 가능한 고유 계정은 **4명**, 계정×전표 도달 조합은 `121×3 + 2×3 = 369`개다.

## 결함 3 — P2: 대시보드가 유형 guard만 소비해 PageCode 권한 회수와 어긋난다

### ① 화면 동선

1. 권한 설정에서 SALES/MANAGER의 `sales.slip.list VIEW` 또는 WAREHOUSE/MANAGER의
   `purchases.slip.list VIEW`를 회수한다. 역할/기본 그룹은 유지한다.
2. 해당 사용자는 대시보드에서 `판매관리` 또는 `구매관리` 빠른 버튼을 계속 본다.
3. 버튼을 누르면 `/sales` 또는 `/purchases`의 새 `PermissionGuard`가 홈으로 즉시 되돌린다.

현재도 WAREHOUSE·ACCOUNTANT·DISPATCH·INVENTORY 대시보드에는 `처리중 판매전표` 카드가 남아 있다.
R35가 조회 query만 disable했으므로 권한 없는 사용자는 조회하지 않은 값을 `0`으로 본다.

### ② 재현 근거

- `DashboardPage.tsx:22-24`: `canAccess`를 얻지만 `canReadSales`/`canReadPurchases`는
  `canQuery*` 역할/그룹 판정만 사용한다.
- `DashboardPage.tsx:83-92`: 빠른 버튼 조건에 `sales.slip.list`/`purchases.slip.list`가 없다.
- `DashboardPage.tsx:26-38,46-52`: 판매 query는 `canReadSales`로 끄지만 카드는 항상 렌더되고,
  데이터가 없으면 `0`을 만든다.
- 반면 사이드바는 `AppLayout.tsx:557-558`에서 `dynamicCanAccess && canQuery*`를 모두 요구하고,
  라우트는 `routes/index.tsx`의 `PermissionGuard`와 `SlipReadGuard`를 모두 요구한다.

### ③ 실 데이터 건수

- 현재 로그인 가능 계정 중 “유형 guard 허용 + 해당 PageCode VIEW 거부” 조합은 **0명**이다.
  따라서 버튼→홈 리다이렉트는 현재 seed로 즉시 발생하지 않지만, 지원되는 권한 회수 동작 한 번으로 생긴다.
- 판매 유형을 읽지 못하면서 판매 처리 카드가 보이는 로그인 가능 계정은 WAREHOUSE·ACCOUNTANT·DISPATCH·INVENTORY
  각 1명, 합계 **4명**이다.
- 현재 OUTBOUND PROCESSING은 **0건**이라 화면 숫자와 실 건수의 차이는 지금은 0건이다. 그러나 이는
  권한에 의해 조회하지 않은 값을 실제 0건으로 표현하는 계약이라 데이터가 생기면 항상 거짓 0이 된다.

## 역할 × 변경 라우트 접근 대조표 — R35 전후

R35가 새 guard를 붙인 8개 route element만 센다.

- `S4`: `/sales`, `/sales/slips`, `/sales/:id`, `/sales/query`
- `P4`: `/purchases`, `/purchases/slips`, `/purchases/:id`, `/purchases/query`
- `S3`: `S4` 중 기존에도 PageCode가 있던 `/sales/slips`를 뺀 3개
- `P3`: `P4` 중 기존에도 PageCode가 있던 `/purchases/slips`를 뺀 3개
- “화면 수용”은 route element가 홈으로 redirect하지 않은 수다. “서버 성공”은 해당 역할과 현재
  PageCode로 실제 목록/상세 API가 성공할 수 있던 수다.

| 역할 | 로그인 가능 계정 | R35 전 화면 수용 | R35 후 화면 수용 | R35 전 서버 성공 | R35 후 서버 성공 | 작동 기능 감소 |
|---|---:|---|---|---|---|---:|
| MASTER | 1 | 8 (`S4+P4`) | 8 (`S4+P4`) | 8 | 8 | 0 |
| MANAGER | 1 | 8 (`S4+P4`) | 8 (`S4+P4`) | 8 | 8 | 0 |
| SALES | 1 | 7 (`S4+P3`) | 4 (`S4`) | 4 (`S4`) | 4 (`S4`) | 0 |
| WAREHOUSE | 1 | 7 (`P4+S3`) | 4 (`P4`) | 4 (`P4`) | 4 (`P4`) | 0 |
| ACCOUNTANT | 1 | 8 (`S4+P4`) | 0 | 0 | 0 | 0 |
| DISPATCH | 1 | 6 (`S3+P3`) | 0 | 0 | 0 | 0 |
| INVENTORY | 1 | 8 (`S4+P4`) | 0 | 0 | 0 | 0 |

R35 전의 초과 수용분은 정상 화면이 아니라 내부 경고/403/빈 목록으로 끝나던 경로다. 따라서 ACCOUNTANT
8→0, INVENTORY 8→0처럼 URL 수는 크게 줄었지만 작동 기능은 줄지 않았다.

### 서버 근거

- OUTBOUND 서버 허용: MASTER·MANAGER·SALES 또는 built-in group `100/101/102`
  (`SlipSalesAccessGuard.java:42-78`).
- INBOUND 서버 허용: MASTER·MANAGER·WAREHOUSE 또는 built-in group `100/101/103`
  (`SlipPurchaseAccessGuard.java:40-86`).
- 프런트 `canQuerySales`/`canQueryPurchases`는 같은 역할·그룹 집합이다
  (`session.ts:149-174`). 새 `SlipReadGuard`는 전표 8개 route element에서만 사용되며 비전표 경로에는 없다.

### 새 PermissionGuard와 서버 PageCode의 반대 방향 차이

| 프런트 route element | 주 조회 계약 | 서버 유형 guard | 서버 동일 PageCode | 현재 차단 계정 |
|---|---|---:|---:|---:|
| `/sales`, `/sales/query` | `GET /slips/query?slipType=OUTBOUND` | 예 | 아니오 | 0 |
| `/sales/:id` | `GET /slips/{id}` | 예 | 아니오 | 0 |
| `/sales/slips` | `GET /slips?slipType=OUTBOUND` | 예 | 예 | 0 |
| `/purchases`, `/purchases/query` | `GET /slips/query?slipType=INBOUND` | 예 | 아니오 | 0 |
| `/purchases/:id` | `GET /slips/{id}` | 예 | 아니오 | 0 |
| `/purchases/slips` | `GET /slips?slipType=INBOUND` | 예 | 예 | 0 |

즉 R35가 `PermissionGuard`를 새로 추가한 **6개 route element**는 전부 프런트가 PageCode까지
요구하지만 대응 서버 query/detail은 유형 guard만 요구한다
(`SlipQueryController.java:111-174`, `SlipController.java:269-279`). 나머지 목록 전용 2개는 R35 전부터
프런트 PageCode guard가 있었고 서버도 PageCode를 확인한다(`SlipController.java:148-187`). 현재 실제
허용 역할 계정은 모두 해당 VIEW가 있고 MASTER는 bypass라 즉시 차단은 0명이나, 결함 3의 정상 권한
회수 경로에서는 화면만 막히는 역전이 생긴다.

## 역할 × 사이드바 메뉴 대조표 — R35 전후

실 계정으로 8개 카테고리와 하위 그룹을 모두 펼쳤다. `홈`·`알림 내역` 2개 고정 링크를 포함한
사이드바 전체 링크 수다. R35 전 수는 같은 실 PageCode에 R35 직전 predicate를 적용했다.

| 역할 | R35 전 | R35 후 | 감소 | 사라진 메뉴 | 비전표 감소 |
|---|---:|---:|---:|---|---:|
| MASTER | 102 | 102 | 0 | 없음 | 0 |
| MANAGER | 94 | 94 | 0 | 없음 | 0 |
| SALES | 19 | 19 | 0 | 없음 | 0 |
| WAREHOUSE | 17 | 17 | 0 | 없음 | 0 |
| ACCOUNTANT | 60 | 58 | **-2** | 판매관리, 구매관리 | 0 |
| DISPATCH | 13 | 13 | 0 | 없음 | 0 |
| INVENTORY | 17 | 15 | **-2** | 판매관리, 구매관리 | 0 |

ACCOUNTANT·INVENTORY에서 사라진 4개 역할×메뉴는 모두 서버 유형 guard가 거부하던 전표 메뉴다.
회계·재고·인사·대시보드·아로로지스 등 비전표 링크는 모든 역할에서 전후 차이 **0개**다.

## 대시보드 빠른 진입점 대조

R35 전에는 `판매관리`·`구매관리` 두 버튼이 모든 역할에 있었다. R35 후 유형 guard로 줄었다.

| 역할 | R35 전 | R35 후 | 감소 | 서버 근거 |
|---|---:|---:|---:|---|
| MASTER | 2 | 2 | 0 | 양쪽 허용 |
| MANAGER | 2 | 2 | 0 | 양쪽 허용 |
| SALES | 2 | 1 | -1 | 구매 거부 |
| WAREHOUSE | 2 | 1 | -1 | 판매 거부 |
| ACCOUNTANT | 2 | 0 | -2 | 양쪽 거부 |
| DISPATCH | 2 | 0 | -2 | 양쪽 거부 |
| INVENTORY | 2 | 0 | -2 | 양쪽 거부 |

이 감소는 모두 서버 근거가 있다. 다만 결함 3처럼 동일 PageCode까지 보지 않아 사이드바·라우트와 완전
정합하지 않고, `처리중 판매전표` 통계 카드는 어느 역할에서도 사라지지 않았다.

## 편집 상태 대조

| 전표 상태 | 직접 수정 | 협업 수정 | R34 대조 | R35 실제 |
|---|---:|---:|---|---|
| DRAFT, SAVED | 예 | 예 | 둘 다 진입 가능하되 동시에 편집하면 안 됨 | 같은 페이지는 배타, 다른 사용자 세션은 동시 가능 |
| SENT, ACCEPTED, PROCESSING, INSPECTING, COMPLETED, CONFIRMED | 아니오 | 예 | 협업만 | 일치 |
| SHIPPING, DELIVERED, CANCELED, REJECTED | 아니오 | 아니오 | 둘 다 없음 | 일치 |

같은 페이지에서는 한 폼을 열어도 열려 있는 모드의 버튼/폼은 남으므로 “둘 다 안 나오는 막다른 상태”가
관찰되지 않았다. 닫은 뒤 두 진입점도 즉시 복구됐다.

## 라벨 전수 대조

| 표면 | 결과 |
|---|---|
| 데스크톱 상단 직접 편집 | `직접 수정` |
| 모바일 더보기 직접 편집 | `직접 수정` |
| 데스크톱·모바일 협업 진입 | `협업 수정` |
| 직접 삭제 action/modal | `전표 삭제` 또는 유형이 필요한 곳의 `매입/매출 전표 삭제` |
| 상태 전이 cancel | `전표 취소` |
| 모바일 매뉴얼 8번 행 | `전표 취소` |
| 협업 폼 접근성 구역명 | **옛 `수정` 1건 — 결함 2** |

관련 Playwright·mock·매뉴얼에서 옛 exact 진입점이 실행 selector로 남은 건은 0건이다. 문서의 과거 결함
설명과 다른 도메인의 일반 `수정`, 전표 이력의 변경 유형 `수정`은 동일 행위를 지칭하지 않으므로 제외했다.

## R34 4건 전후 대조

| R34 결함 | R35/R36 후 판정 | 근거 |
|---|---|---|
| 1. 직접 수정과 협업 수정 동시 허용·조용한 덮어쓰기 | **미종결(부분 닫힘)** | 한 페이지의 진입점 배타화·닫기 복구는 정상. 두 사용자 세션 동시 폼과 협업 무버전 저장은 남음. 실 경합 116건. |
| 2. 재고 부족 complete가 accept 문구 사용 | **닫힘** | `INVENTORY_SHORTAGE_ACCEPT_MESSAGE`와 `INVENTORY_SHORTAGE_COMPLETE_MESSAGE` 분리. COMPLETE는 `검수 대기 상태로 전환` 문구. 현재 PROCESSING 0건, 전단계 SENT 4건. |
| 3. 상세에서만 권한 정합, 메뉴/목록은 서버 403 | **원 결함 닫힘, 역방향 잔차 있음** | 현재 역할별 작동 기능 감소 0, 비전표 감소 0. 다만 query/detail 6 route element는 프런트만 PageCode를 추가 요구하고 Dashboard도 PageCode를 빠뜨림. |
| 4. 모바일 매뉴얼 삭제/취소 오기 | **닫힘** | `docs/manual/08-실시간-협업/08-모바일-실시간-알림.md:50`이 `전표 취소 / CANCELED 처리`. |

## 최종 답

> R35·R36이 바꾼 표면에서, 실 사용자가 화면으로 도달할 수 있는데 잘못 동작하는 것이 있는가.

**있다.** 가장 심각한 것은 R35의 편집 배타화가 한 화면의 로컬 state에만 머물러, 실 사용자 두 명이
같은 DRAFT 전표에서 직접 수정과 협업 수정을 동시에 열 수 있고 협업 저장이 최신 직접 수정 값을
조용히 되돌릴 수 있다는 점이다. 또한 협업 폼은 보조기기에 여전히 `수정`으로만 읽히고, 대시보드의
PageCode 소비도 사이드바·라우트와 다르다.

전 라우트 회귀 자체는 현재 실 데이터 기준으로 **작동하던 기능 차단 0건, 비전표 메뉴 차단 0건**이다.
ACCOUNTANT·INVENTORY에서 각각 2개 줄어든 것은 서버가 원래 거부하던 판매/구매 전표 메뉴다.

따라서 **머지 비권고**다. 무손실 동시 편집 계약이 서버 경계에서 성립하기 전에는 R34 결함 1이 닫혔다고
볼 수 없다.

## 이 라운드가 보지 않은 것

- 개발책임자가 A안으로 분리한 시나리오 2~5(회계 배분·전기).
- `#1045` 이외 컨테이너 재배포 결과. R35·R36 프런트는 지정 Vite로 확인했고 컨테이너는 건드리지 않았다.
- 저장을 수반하는 새 실 DB 경합 실행. DB 쓰기 금지 때문에 두 실 사용자 폼의 동시 존재까지만 재현했고,
  덮어쓰기 결과는 R34의 기존 실증과 현재 프런트→서버 코드 경로로 판정했다.
- 네이티브 Capacitor 푸시, 실제 모바일 기기, 인쇄 출력물의 시각 결과.
- 다른 트랙 `#1061`·`#1045`·`#1063`·`#1066` 파일 및 Gradle 전체 스위트.

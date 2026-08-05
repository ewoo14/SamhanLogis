```text
git -C . rev-parse --show-toplevel     # D:/dev/Samhan-Public/.claude/worktrees/w1057
git -C . branch --show-current         # feat/874-set-riusage-global-dc
git -C . rev-parse HEAD                # 3891e618193b8ac5746535fbf489c09723719831 이어야 함
```

- `show_toplevel`: `D:/dev/Samhan-Public/.claude/worktrees/w1057`
- `branch`: `feat/874-set-riusage-global-dc`
- `HEAD`: `3891e618193b8ac5746535fbf489c09723719831` (일치, 검증 계속)

## 실행 환경 기준선

착수 시 실측값은 PM이 제시한 값과 일치했다.

| container | created | started |
|---|---|---|
| `samhan-slip-service` | `2026-08-04T01:39:40.048202533Z` | `2026-08-04T23:34:13.316469916Z` |
| `samhan-api-gateway` | `2026-08-03T08:02:47.605315527Z` | `2026-08-04T23:34:13.124824996Z` |

실행 원문:

```text
/samhan-slip-service created=2026-08-04T01:39:40.048202533Z started=2026-08-04T23:34:13.316469916Z
/samhan-api-gateway created=2026-08-03T08:02:47.605315527Z started=2026-08-04T23:34:13.124824996Z
```

종료 무결성 재확인에서는 두 컨테이너의 `created`와 `started`가 아래처럼 바뀌어 있었다.

```text
/samhan-slip-service created=2026-08-05T02:50:44.702471161Z started=2026-08-05T02:51:02.147121178Z
/samhan-api-gateway created=2026-08-05T02:50:37.64267995Z started=2026-08-05T02:50:51.017973805Z
```

즉 이 라운드 도중 컨테이너 교체가 발생했다. 본 검증에서 실행한 Docker 명령은 `inspect`와
`docker exec ... psql`의 `SELECT`뿐이며, compose/rebuild/redeploy/restart/stop 명령은 실행하지 않았다.
교체 주체는 이 증거만으로 귀속하지 않는다. 종료 시 전표 상태별 건수는 착수 시와 동일했다. 이 환경 변동은
허용된 예외인 **증거 무결성**으로 기록하며, 로컬 R33 렌더러의 버튼 공존 재현과 HEAD 소스의 저장·권한
제어 흐름 판정 자체를 뒤집지는 않는다.

R32·R33은 프런트 전용이므로 본 검증은 컨테이너를 변경하지 않았다. 로컬 렌더러만
`vite.renderer.dev.config.ts`로 띄웠다. 인증은 로그인 API를 호출하지 않고 기존 개발 계정 클레임의
단기 JWT를 로컬 브라우저 세션에만 설정했다. 따라서 로그인 시각 갱신을 포함한 DB write는 0건이다.

## 요약 판정

**있다. 머지 비권고다.** R33이 다시 공존시킨 직접수정·협업수정은 같은 `memo`를 서로 다른
로컬 초안으로 유지한다. 직접수정 저장 후 협업수정을 저장하면 협업 경로가 최신 `before`를 서버에서
다시 읽고도 오래된 `after`를 그대로 적용해 **409 없이 먼저 저장한 메모를 덮어쓴다**. 반대 순서는
직접수정의 오래된 `updatedAt`이 409를 낸다. 현재 실 DB에서 즉시 노출된 OUTBOUND DRAFT가 **115건**이다.

또한 R33의 “차집합 0”은 **상세를 이미 성공적으로 읽은 후의 액션 helper↔mutation 권한**으로 한정하면
맞지만, 실제 사용자 동선인 메뉴→목록→상세까지 포함하면 0이 아니다. `ACCOUNTANT`는 판매·구매 진입점을
보지만 판매는 권한 경고, 구매는 실 API 403으로 끝난다. `WAREHOUSE`는 OUTBOUND 전이 권한이 있지만
판매 상세를 읽을 수 없다. 현재 기본 조회 기간에서 즉시 숨겨지는 전표는 15건, 전 기간 활성 전표는
122건이며, 그중 `WAREHOUSE`가 처리할 수 있어야 하는 현재 OUTBOUND SENT는 4건이다.

## 실 데이터 기준선

```text
 slip_type |   status   | count
-----------+------------+-------
 INBOUND   | CONFIRMED  |     1
 INBOUND   | INSPECTING |     1
 OUTBOUND  | CONFIRMED  |     1
 OUTBOUND  | DRAFT      |   115
 OUTBOUND  | SENT       |     4
```

- 전체: 활성 122건.
- 렌더러 기본 기간 `2026-07-21..2026-08-20`: INBOUND 2건 + OUTBOUND 13건 = 15건.
- 현재 전표는 모두 `MANUAL`이므로 OUTBOUND SENT 4건은 취소가 허용된다.

## 결함 1 — R33이 직접수정·협업수정의 양방향 저장 충돌을 다시 열었다

### ① 화면 동선

`MANAGER` 로그인 권한 계정 → 판매관리 → OUTBOUND DRAFT `2026/06/19-1` 상세 → 상단 `수정` →
상단 `협업 수정`. 두 진입점은 어느 한쪽도 다른 쪽을 닫지 않아 한 화면에 동시 존재했다.

### ② 재현 근거

실 렌더러 오프라인 JWT 세션에서 직접 관측한 결과:

```text
@e16 [button] "수정"
@e17 [button] "협업 수정"
true  # [data-testid="sales-slip-edit-modal"]
true  # [data-testid="slip-collab-edit-form"]
@e32 [textbox] "적요": R34-direct-local
@e57 [textbox] "메모 수정값": R34-collab-local
```

즉, 같은 저장 칼럼 `memo`를 직접수정은 `적요`, 협업수정은 `메모`라고 다르게 부르며 서로 다른
값을 동시에 보유했다. 배송주소/배송지, 감리주소/검수지, 인수자 번호/수령자 연락처는 유사한 이름이지만
서로 다른 DB 필드다. 실제 중복 저장 필드는 `memo` 1개다.

저장 순서를 끝까지 연결한 코드·서버 근거:

1. 직접수정은 폼을 열 때의 `updatedAt`을 보관하고 저장 body에 보낸다
   (`SlipDetailPage.tsx:2017-2043`, `:2834-2855`). 서버는 이 시각을 현재 modifiedAt과 비교해 stale이면
   409를 낸다 (`SalesSlipUpdateService.java:73-80`, `:142-160`).
2. 협업 폼은 편집 진입 시 `currentValues`로 한 번 초기화된 후 열린 동안 다시 시드하지 않는다
   (`SlipCollaborationPanel.tsx:124-152`).
3. 협업 commit은 클라이언트 `before`/version을 동시성 검사에 쓰지 않는다. 서버가 commit 시점의 최신
   `before`를 다시 읽고(`SlipDocumentCollaborationPort.java:168-185`), 클라이언트의 `after`를 그대로
   `applyOverlayPatchBatch` 한다(`SlipCollabEditService.java:59-73`, `SlipService.java:555-575`).

따라서 실제 결과는 다음과 같다.

- **직접수정 저장 → 협업수정 저장**: 직접수정이 성공한 뒤에도 협업 폼의 오래된 `after`가
  덮어쓴다. 서버가 최신 값을 `before`로 기록할 뿐 비교·거부하지 않으므로 **409가 없다**.
- **협업수정 저장 → 직접수정 저장**: 협업 저장으로 modifiedAt이 바뀌어 직접수정의 예전
  `updatedAt`이 stale이 되고 409 충돌 배너로 끝난다. 양방향 UX가 대칭이 아니다.

사용자가 DB write를 금지했으므로 두 저장 버튼은 실 DB에 실행하지 않았다. 대신 한 화면에서 두 초안이
서로 다른 값을 보유하는 데까지는 실 GUI로 밟았고, 그 다음 결과는 실제 controller→service 제어 흐름으로
확정했다. mock·테스트 강도 판정이 아니다.

협업수정 중 전이 시도는 R27·R28 계열 409를 재발하지 않았다. 두 폼에 서로 다른 로컬 값을 넣고
`완료 (저장)`을 누른 후 폐기 확인창을 취소했으며, 두 폼과 두 입력은 그대로 남았고 write 요청은
0건이었다. 코드도 dirty 표면이 있으면 먼저 저장/폐기 확인을 강제한다
(`SlipDetailPage.tsx:2397-2432`).

### ③ 실 데이터 건수

- OUTBOUND DRAFT 115건: `MASTER`·`MANAGER`·`SALES`가 직접수정·협업수정 모두를 열 수 있다.
- OUTBOUND SAVED 0건, INBOUND DRAFT/SAVED 0건.
- 현재 즉시 노출 합계: **서로 다른 전표 115건**.

## 결함 2 — R32의 재고 부족 안내가 `complete`에서도 “수락할 수 없다”고 말한다

### ① 화면 동선

판매관리 → OUTBOUND SENT 상세 → `완료 (수락)` → `완료 (처리 시작)` → PROCESSING 상세의
`완료 (재고 반영 후 검수 대기)`. 마지막 `complete` 단계에서 예약재고 부족 409가 나도 화면은
`재고가 부족하여 전표를 **수락**할 수 없습니다`라고 안내한다. 사용자가 실행한 동작은 수락이 아니라
재고 차감 후 검수 대기 전환이다.

### ② 재현 근거

- R32 상수는 액션을 받지 않고 모든 inventory 409에
  `재고가 부족하여 전표를 수락할 수 없습니다`를 반환한다
  (`SlipDetailPage.tsx:1125-1167`).
- `complete` controller는 409의 원인으로 상태 불일치 또는 재고 부족을 명시한다
  (`SlipController.java:532-540`).
- 실제 OUTBOUND `complete`는 일반 품목에 `inventoryClient.deduct(..., fromReservation=true)`를 호출하고,
  이 client는 예약재고 부족 4xx를 CONFLICT로 올린다
  (`SlipService.java:992-1018`, `InventoryClient.java:98-113`).

즉 R32의 분류 자체(재고 부족↔동시 전이)는 맞지만, 재고 부족을 보여 주는 사용자 문구가 현재
액션과 맞지 않는다. 이 경우 `blockEditSurfaces=false`라서 R31의 편집 표면 잠금은 재발하지 않는다.

### ③ 실 데이터 건수

- 현재 PROCESSING: **0건** — 즉시 단일 클릭 발화 전표는 없다.
- 현재 OUTBOUND SENT: **4건**, 모두 활성 4라인. 이 전표들이 정상 화면 전이로 PROCESSING에 도달하면
  `complete` 재고 409가 발화하는 실 데이터 선행 집합이다.
- DB write 금지로 4건을 실제 PROCESSING으로 전이시키지는 않았다.

## 결함 3 — 권한 “차집합 0”은 상세 로드 후에만 맞고, 실 사용자 동선에서는 틀리다

### ① 화면 동선

1. `ACCOUNTANT` → 대시보드/사이드바 `판매관리` → 화면 경고
   `매출 전표 조회 권한이 없습니다. (SALES / MANAGER / MASTER 역할 필요)`.
2. `ACCOUNTANT` → `구매관리` → 빈 목록 +
   `구매 전표 목록을 불러오지 못했습니다. 백엔드 연결을 확인하세요.` → 실 요청 403.
3. `WAREHOUSE` → 대시보드 `판매관리` → 같은 조회 권한 경고. OUTBOUND SENT를 처리할
   `slip.transfer.process UPDATE`는 있지만 목록/상세를 읽지 못한다.

### ② 재현 근거

실 `role_page_permission_templates`·`account_page_permissions` 행은 서로 같았다. `dev_master`는 account 별도행 없이
`is_system_master=true`로 전권을 받는다.

| role | IN list | IN edit/delete/inspect | OUT list | OUT edit/confirm/cancel | transfer/reject/collab |
|---|---|---|---|---|---|
| MASTER | V | U/D/U | V | U/U/U | U/U/U |
| MANAGER | V | U/D/- | V | U/U/U | U/U/U |
| SALES | - | -/-/- | V | U/-/U | -/-/U |
| WAREHOUSE | V | U/D/U | - | -/-/- | U/-/U |
| ACCOUNTANT | V | -/-/- | V | -/U/- | -/-/- |

`V=VIEW`, `U=UPDATE`, `D=DELETE`, `-=불허`. collab은 `slip.audit-overlay UPDATE`다.

이 행을 실 GUI에 대입한 원문:

```text
session=ACCOUNTANT offline_jwt login_db_write=0
@e11 [button] "판매관리"
@e12 [button] "구매관리"
@e33 [alert]: 매출 전표 조회 권한이 없습니다. (SALES / MANAGER / MASTER 역할 필요)
GET /slips/query?slipType=INBOUND... -> 403
@e66 [alert]: 구매 전표 목록을 불러오지 못했습니다. 백엔드 연결을 확인하세요.

session=WAREHOUSE offline_jwt login_db_write=0
@e10 [button] "판매관리"
@e23 [alert]: 매출 전표 조회 권한이 없습니다. (SALES / MANAGER / MASTER 역할 필요)
GET /slips/<OUTBOUND-SENT> -> 403
@e23 [alert]: 전표를 불러오지 못했습니다.
```

서버의 읽기 guard는 OUTBOUND를 `MASTER/MANAGER/SALES`, INBOUND를
`MASTER/MANAGER/WAREHOUSE`만 허용한다(`SlipSalesAccessGuard.java`, `SlipPurchaseAccessGuard.java`). 반면 프런트
사이드바는 실 `*.slip.list VIEW`를 그대로 쓰고, 대시보드 빠른 진입점은 더 넓게 노출된다. 구매 화면은
403을 권한 문제가 아닌 “백엔드 연결” 문제로 잘못 안내한다.

### ③ 실 데이터 건수

- `ACCOUNTANT`: 기본 기간에서 판매 13건 + 구매 2건 = **15건**이 진입점 뒤에서 숨겨진다.
  기간을 늘리면 활성 122건 전체가 같은 경로에 걸린다.
- `WAREHOUSE`: 현재 OUTBOUND SENT **4건**에 대해 server mutation 권한 `slip.transfer.process UPDATE`를
  보유하지만 판매 목록/상세 읽기 guard를 통과하지 못해 화면 처리가 불가능하다.
- `ACCOUNTANT` OUTBOUND `confirm` 권한의 직접 발화 상태 DELIVERED는 현재 0건이다.

이 읽기 경계는 R33이 신규로 만든 것이 아니다. 하지만 R33이 실 역할 행을 쓰지 않고 상세 로드 후의
액션 helper만으로 “차집합 0”을 선언했기 때문에, 이번에 요청된 양방향 재계산에서는 빠질 수 없다.

## 갱신된 전 상태 × 실 역할 대조표

약어: `저` 저장, `전` 전송, `수` 수락, `처` 처리 시작, `검대` 재고 반영 후 검수 대기,
`검완` 처리 완료, `배시` 배송 시작, `배완` 배송 완료, `확` 확정, `반` 반려, `취` 취소,
`직` 직접수정, `기` 기사 편집, `협` 협업수정, `삭` soft delete. 표는 `MANUAL` 전표 기준이며
PARTNER_ORDER SENT는 화면·서버 둘 다 `취`를 제외한다.

### INBOUND

| 상태 | 실건 | MASTER | MANAGER | SALES | WAREHOUSE | ACCOUNTANT |
|---|---:|---|---|---|---|---|
| DRAFT | 0 | 저·취·직·협·삭 | 저·취·직·협·삭 | 조회 거부 | 저·취·직·협·삭 | 진입점 노출→조회 403 |
| SAVED | 0 | 전·취·직·협·삭 | 전·취·직·협·삭 | 조회 거부 | 전·취·직·협·삭 | 진입점 노출→조회 403 |
| SENT | 0 | 수·반·취·협 | 수·반·취·협 | 조회 거부 | 수·취·협 | 진입점 노출→조회 403 |
| ACCEPTED | 0 | 처·반·협 | 처·반·협 | 조회 거부 | 처·협 | 진입점 노출→조회 403 |
| PROCESSING | 0 | 검대·협 | 검대·협 | 조회 거부 | 검대·협 | 진입점 노출→조회 403 |
| INSPECTING | 1 | 검완·반·협 | 반·협 | 조회 거부 | 검완·협 | 진입점 노출→조회 403 |
| COMPLETED | 0 | 확·협 | 확·협 | 조회 거부 | 확·협 | 진입점 노출→조회 403 |
| SHIPPING | 0 | - | - | 조회 거부 | - | 진입점 노출→조회 403 |
| DELIVERED | 0 | - | - | 조회 거부 | - | 진입점 노출→조회 403 |
| CONFIRMED | 1 | 협 | 협 | 조회 거부 | 협 | 진입점 노출→조회 403 |
| REJECTED | 0 | - | - | 조회 거부 | - | 진입점 노출→조회 403 |
| CANCELED | 0 | - | - | 조회 거부 | - | 진입점 노출→조회 403 |

### OUTBOUND

| 상태 | 실건 | MASTER | MANAGER | SALES | WAREHOUSE | ACCOUNTANT |
|---|---:|---|---|---|---|---|
| DRAFT | 115 | 저·취·직·기·협·삭 | 저·취·직·기·협·삭 | 저·취·직·기·협·삭 | 진입점 노출→조회 거부 | 진입점 노출→조회 거부 |
| SAVED | 0 | 전·취·직·기·협·삭 | 전·취·직·기·협·삭 | 전·취·직·기·협·삭 | 진입점 노출→조회 거부 | 진입점 노출→조회 거부 |
| SENT | 4 | 수·반·취·협 | 수·반·취·협 | 취·협 | 진입점 노출→조회 거부 | 진입점 노출→조회 거부 |
| ACCEPTED | 0 | 처·반·협 | 처·반·협 | 협 | 진입점 노출→조회 거부 | 진입점 노출→조회 거부 |
| PROCESSING | 0 | 검대·협 | 검대·협 | 협 | 진입점 노출→조회 거부 | 진입점 노출→조회 거부 |
| INSPECTING | 0 | 검완·반·협 | 검완·반·협 | 협 | 진입점 노출→조회 거부 | 진입점 노출→조회 거부 |
| COMPLETED | 0 | 배시·협 | 배시·협 | 협 | 진입점 노출→조회 거부 | 진입점 노출→조회 거부 |
| SHIPPING | 0 | 배완 | 배완 | - | 진입점 노출→조회 거부 | 진입점 노출→조회 거부 |
| DELIVERED | 0 | 확 | 확 | - | 진입점 노출→조회 거부 | 진입점 노출→조회 거부 |
| CONFIRMED | 1 | 협 | 협 | 협 | 진입점 노출→조회 거부 | 진입점 노출→조회 거부 |
| REJECTED | 0 | - | - | - | 진입점 노출→조회 거부 | 진입점 노출→조회 거부 |
| CANCELED | 0 | - | - | - | 진입점 노출→조회 거부 | 진입점 노출→조회 거부 |

### 양방향 차집합 판정

| 계층 | 도메인/서버 허용 → 화면 부재·차단 | 화면 노출 → 서버 거부 | 판정 |
|---|---|---|---|
| 상세 로드 후 R33 액션 helper | 0 | 0 | **0** |
| 실 동선(진입·읽기 포함) | WAREHOUSE OUTBOUND transfer 4건, ACCOUNTANT OUTBOUND confirm 현재 0건 | ACCOUNTANT 판매·구매 진입점, WAREHOUSE 판매 빠른 진입점 | **0 아님** |

R33이 바꾼 INBOUND soft delete는 정확하다. 서버 `DELETE /slips/{id}`는 실제로
`purchases.slip.delete DELETE`를 요구한다(`SlipDeleteController.java:49-59`). OUTBOUND soft delete는 종전대로
`sales.slip.edit DELETE`를 요구하며(`SalesSlipDeleteController.java:51-61`), OUTBOUND 액션 요구사항은 R33에서
바뀌지 않았다. 즉 R33의 타입별 mutation 매핑은 맞지만, 전체 사용자 동선의 권한 상품은 아직 맞지 않는다.

## 라벨 변경 도달성

실 화면의 두 버튼은 각자 이름대로 동작하도록 연결됐다.

- 상단 `전표 삭제`: `deletePurchaseSlip`/`deleteSalesSlip` soft-delete modal·mutation.
- 하단 `전표 취소`: 취소 확인문 후 `handleTransition('cancel')`, 상태 `CANCELED` 전이.
- 실 OUTBOUND DRAFT 115건에서 두 버튼이 같은 화면에 `전표 삭제`/`전표 취소`로 다르게 보였다.
- 실 OUTBOUND SENT 4건에서 soft delete는 없고 `전표 취소`만 존재한다.
- 모바일 더보기 분기도 `매입/매출 전표 삭제` 및 `전표 취소`를 같은 핸들러에 연결한다
  (`SlipDetailPage.tsx:3760-3871`). 목록의 삭제는 실제 soft delete이므로 삭제 표기가 맞고, 인쇄 화면에는 이 액션이 없다.

다만 사용자 매뉴얼의 의미 어긋남이 1건 남았다.

```text
docs/manual/08-실시간-협업/08-모바일-실시간-알림.md:50
| 8 | 전표 삭제 | CANCELED 처리 | 푸시 + 토스트 |
```

`CANCELED 처리`는 R33이 `전표 취소`로 바꾼 동작이다. 테스트·Playwright active source에서 예전 footer
라벨을 소비하는 경로는 발견하지 못했지만, 이 매뉴얼은 취소를 삭제로 알린다. 제품 화면 라벨 동작은 PASS,
사용자 증거/매뉴얼 정합은 FAIL이다. R33 보고서의 단순 문자열 전수 검색은 `전표 삭제`라는 새 header
라벨과 예전 cancel 의미를 구분하지 못했다. 이것은 이 라운드의 유일한 검증-품질 예외인 **증거 무결성**으로만
기록한다.

## R31 4건 재수렴 판정

| R31 결함 | R34 판정 |
|---|---|
| 409 원인 분류 | 재고 부족은 편집을 잠그지 않고, 동시 전이·unknown은 fail-loud한다. 단 `complete` 재고 부족 문구가 “수락”으로 잘못된 신규 결함 1건. |
| INBOUND 권한 매핑 | 상세 로드 후 mutation 매핑은 재수렴. soft delete도 서버 `purchases.slip.delete DELETE`와 일치. 단 end-to-end 읽기 경계 차집합은 잔존. |
| 협업수정 진입점 | 다시 보이지만 직접수정과 중복 가능하게 만들어 `memo` lost update/409 비대칭을 신규 생성. |
| 삭제/취소 라벨 | 제품 화면·핸들러는 재수렴. 모바일 실시간 알림 매뉴얼 1행은 취소를 삭제로 오기. |

## 최종 판정

**머지 비권고.** 차단 근거는 다음 세 가지다.

1. R33이 도입한 버튼 공존으로 OUTBOUND DRAFT 115건에서 같은 `memo`를 두 편집 표면이
   동시 보유하며, 저장 순서에 따라 무음 덮어쓰기 또는 409가 난다.
2. R32의 재고 부족 안내가 `complete`에서도 수락 실패라고 말해 사용자가 실행한 단계를 잘못 설명한다.
3. R33의 권한 차집합 0 주장은 상세 로드 후에만 성립한다. 실 메뉴·목록·상세 동선에서
   `ACCOUNTANT`는 노출 후 거부되고, `WAREHOUSE`는 보유한 OUTBOUND 처리 권한을 화면에서 실행하지 못한다.

제품 화면의 `전표 삭제`/`전표 취소` 라벨·핸들러 분리와 INBOUND soft-delete mutation 권한은 확인된 PASS다.

## 이 라운드가 보지 않은 것

- 시나리오 2~5 회계 배분·전기.
- 다른 트랙 `#1061`·`#1045`·`#1063`·`#1066` 파일.
- 실 DB에서의 직접수정↔협업수정 두 저장 순서 실행. DB write 금지 때문에 동시 폼·서로 다른
  로컬 값까지 실 GUI로 재현하고, 저장 결과는 실 서버 제어 흐름으로 확정했다.
- PROCESSING 전표 생성 후 `complete` 재고 부족 실행. 현재 해당 상태 0건이고 전이는 write이므로 실행하지 않았다.
- 모바일 네이티브 런타임·인쇄 출력물 실행. 관련 active source의 라벨·핸들러 연결만 추적했다.
- 본 검증이 실행하지 않은 조작: 컨테이너 재배포·재빌드·중지, Gradle 전체 스위트, DB/DDL write.
  단, 검증 도중 발생한 출처 미상의 컨테이너 교체는 실행 환경 기준선에 별도 기록했다.
- 테스트 강도·mock 품질·문서 충실도·가드 빈틈. 단, 사용자가 허용한 증거 무결성 예외로
  취소를 삭제로 표기한 매뉴얼 1행은 기록했다.

## 신규 파일

- `docs/dev-reports/2026-08-05-874-r34-sol-reconvergence.md`

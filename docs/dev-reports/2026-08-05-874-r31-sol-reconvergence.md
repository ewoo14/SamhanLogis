# PR #1057 R31 SOL 적대 재수렴 보고서

## 착수 전 무결성 확인 — 원문

```text
git -C . rev-parse --show-toplevel
D:/dev/Samhan-Public/.claude/worktrees/w1057

git -C . branch --show-current
feat/874-set-riusage-global-dc

git -C . rev-parse HEAD
52ed78e4dd458f681efa3a8e85e13513e193a146
```

요청된 HEAD와 일치한다. 검증을 계속했다.

## 실행 환경 확인 — 원문 및 증거 무결성 판정

현재 컨테이너 `StartedAt` 실측:

```text
docker inspect -f "{{.Name}} {{.State.StartedAt}}" samhan-slip-service samhan-api-gateway
/samhan-slip-service 2026-08-04T23:34:13.316469916Z
/samhan-api-gateway 2026-08-04T23:34:13.124824996Z
```

PM 제시 원문인 `samhan-slip-service 2026-08-04T01:39:40Z`,
`samhan-api-gateway 2026-08-03T08:02:47Z`는 현재 재현되지 않는다. 두 컨테이너 모두 그 뒤에
재시작된 상태다. 이것은 이번 라운드에서 허용된 **증거 무결성 불일치**로 기록한다.
`StartedAt`만으로 현재 이미지의 소스 내용을 역추론하지는 않는다. 이번 라운드는 컨테이너를
재배포·재빌드·중지하지 않았다.

전표 상태 실측은 PM 원문과 일치했다.

```text
docker exec samhan-postgres psql -U samhan -d slip_db -c "SELECT slip_type, status, COUNT(*) FROM slips WHERE is_deleted=false GROUP BY 1,2;"
 slip_type |   status   | count
-----------+------------+-------
 INBOUND   | CONFIRMED  |     1
 INBOUND   | INSPECTING |     1
 OUTBOUND  | CONFIRMED  |     1
 OUTBOUND  | DRAFT      |   115
 OUTBOUND  | SENT       |     4
(5 rows)
```

현재 활성 전표 122건은 모두 수동 전표다.

```text
 source_type | count
-------------+-------
 MANUAL      |   122
(1 row)
```

R30 프런트는 요청대로 `clients/desktop/vite.renderer.dev.config.ts`로만 로컬 실행했다.

```text
VITE v5.4.21 ready in 1649 ms
Local: http://127.0.0.1:5187/
```

mock OFF, gateway `http://localhost:8080`, `dev_manager` 실 로그인으로 화면을 읽었다. 어떤 전이,
저장, 삭제 버튼도 누르지 않았다. 검증 뒤 로컬 renderer만 종료했고 `PORT_5187=STOPPED`를
확인했다.

## 결론

**머지 비권고.** R30이 만진 상세/협업 편집 표면에서 실 사용자 도달 결함 4개를 확인했다.

1. 재고 부족 같은 정상적인 업무 409도 “다른 사용자가 먼저 전이”한 것으로 오인하여 열린 협업
   편집을 저장 불가로 잠근다. 현재 SENT 4건 중 최소 2건이 즉시 발화한다.
2. INBOUND 전이 권한을 화면과 서버가 서로 다르게 판정한다. 현재 INSPECTING 1건에서 MANAGER에게
   서버가 거부할 버튼을 활성 노출하며, WAREHOUSE는 그 전표를 COMPLETED로 만든 다음 서버가
   허용하는 확정을 화면에서 할 수 없다.
3. DRAFT/SAVED에서 직접수정 권한과 협업수정 권한을 함께 가진 사용자는 협업 수정 진입점이
   사라진다. 현재 OUTBOUND DRAFT 115건이 해당한다.
4. 취소 전이를 데스크톱 화면에서 “삭제”라고 표시한다. DRAFT에서는 실제 soft delete와 취소가
   같은 이름으로 동시에 보인다. 현재 119건에서 노출된다.

R29의 반려 버튼 소실형 회귀는 다시 나타나지 않았다. 상태별 구조 전이 집합 자체는 아래 표처럼
도메인과 대체로 일치하지만, 권한·편집 진입·409 분류·라벨에서 양방향 차집합이 남았다.

## 도메인 허용 액션 대 화면 노출 액션 — 전 상태 × 두 유형

표의 범위는 요청된 진행·반려·편집·취소다. `직접수정`은 DRAFT/SAVED 핵심 전표/라인 수정,
`기사편집`은 OUTBOUND DRAFT/SAVED 기사 폼, `협업수정`은 11개 overlay 필드 수정이다.
`soft delete`는 `is_deleted=true`가 되는 별도 삭제이며 `CANCELED` 전이와 구별한다.

도메인 기준은 다음 코드로 대조했다.

- 전이: `services/slip-service/src/main/java/com/samhanair/logis/slip/domain/Slip.java:997`,
  `:1007`, `:1042`, `:1058`, `:1071`, `:1087`, `:1104`, `:1119`, `:1134`, `:1155`, `:1185`
- 화면 전이 집합: `clients/desktop/src/renderer/routes/SlipDetailPage.tsx:285-313`
- 협업수정 허용 상태: `services/slip-service/src/main/java/com/samhanair/logis/slip/service/SlipService.java:655-675`
- 화면 협업수정 허용 상태: `clients/desktop/src/renderer/routes/SlipDetailPage.tsx:2228-2239`

| 유형 | 상태 | 도메인이 허용하는 액션 전부 | 화면이 노출하는 액션 전부(해당 권한 보유 시) | 양방향 차집합 |
|---|---|---|---|---|
| INBOUND | DRAFT | 저장→SAVED, 취소→CANCELED, 직접수정, 협업수정, soft delete | `완료 (저장)`, 직접 `수정`, header `삭제`(soft delete), footer `삭제`(취소) | 협업수정 진입 누락. WAREHOUSE는 저장·취소도 잘못 disabled. 취소 라벨 오류 |
| INBOUND | SAVED | 전송→SENT, 취소→CANCELED, 직접수정, 협업수정, soft delete | `완료 (전송)`, 직접 `수정`, header `삭제`(soft delete), footer `삭제`(취소) | 협업수정 진입 누락. WAREHOUSE는 전송·취소도 잘못 disabled. 취소 라벨 오류 |
| INBOUND | SENT | 수락→ACCEPTED, 반려→REJECTED, 취소→CANCELED, 협업수정 | `수정`, `반려`, `완료 (수락)`, footer `삭제` | WAREHOUSE 취소가 잘못 disabled. 취소 라벨 오류 |
| INBOUND | ACCEPTED | 처리 시작→PROCESSING, 반려→REJECTED, 협업수정 | `수정`, `반려`, `완료 (처리 시작)` | 구조 차이 없음 |
| INBOUND | PROCESSING | 검수 대기→INSPECTING, 협업수정 | `수정`, `완료 (재고 반영 후 검수 대기)` | 구조 차이 없음 |
| INBOUND | INSPECTING | 처리 완료→COMPLETED, 반려→REJECTED, 협업수정 | `수정`, `반려`, `완료 (처리 완료)` | MANAGER에게 서버가 거부할 처리 완료를 활성 노출 |
| INBOUND | COMPLETED | 확정→CONFIRMED, 협업수정 | header/footer `수정`, `완료 (확정)` | WAREHOUSE에게 서버가 허용할 확정을 disabled |
| INBOUND | SHIPPING | 도메인 도달 불가 | 없음 | 도달 불가라 결함으로 세지 않음 |
| INBOUND | DELIVERED | 도메인 도달 불가 | 없음 | 도달 불가라 결함으로 세지 않음 |
| INBOUND | CONFIRMED | 협업수정 | `수정` | 일치 |
| INBOUND | REJECTED | 없음 | 없음 | 일치 |
| INBOUND | CANCELED | 없음 | 없음 | 일치 |
| OUTBOUND | DRAFT | 저장→SAVED, 취소→CANCELED, 직접수정, 기사편집, 협업수정, soft delete | `완료 (저장)`, 직접 `수정`, 기사 `편집`, header `삭제`(soft delete), footer `삭제`(취소) | 협업수정 진입 누락. 서로 다른 두 동작을 모두 `삭제`로 표시 |
| OUTBOUND | SAVED | 전송→SENT, 취소→CANCELED, 직접수정, 기사편집, 협업수정, soft delete | `완료 (전송)`, 직접 `수정`, 기사 `편집`, header `삭제`(soft delete), footer `삭제`(취소) | 협업수정 진입 누락. 서로 다른 두 동작을 모두 `삭제`로 표시 |
| OUTBOUND | SENT | 수락→ACCEPTED, 반려→REJECTED, 취소→CANCELED, 협업수정 | `수정`, `반려`, `완료 (수락)`, footer `삭제` | 취소 라벨 오류. 정상 업무 409를 타 사용자 전이로 오인 |
| OUTBOUND | ACCEPTED | 처리 시작→PROCESSING, 반려→REJECTED, 협업수정 | `수정`, `반려`, `완료 (처리 시작)` | 구조 차이 없음 |
| OUTBOUND | PROCESSING | 검수 대기→INSPECTING, 협업수정 | `수정`, `완료 (재고 반영 후 검수 대기)` | 구조 차이 없음. 업무 409 분류기는 동일하게 잘못 적용됨 |
| OUTBOUND | INSPECTING | 처리 완료→COMPLETED, 반려→REJECTED, 협업수정 | `수정`, `반려`, `완료 (처리 완료)` | 구조 차이 없음 |
| OUTBOUND | COMPLETED | 배송 시작→SHIPPING, 협업수정 | header/footer `수정`, `완료 (배송 시작)` | 일치 |
| OUTBOUND | SHIPPING | 배송 완료→DELIVERED | `완료 (배송 완료)` | 일치 |
| OUTBOUND | DELIVERED | 확정→CONFIRMED | `완료 (확정)` | 일치 |
| OUTBOUND | CONFIRMED | 협업수정 | `수정` | 일치 |
| OUTBOUND | REJECTED | 없음 | 없음 | 일치 |
| OUTBOUND | CANCELED | 없음 | 없음 | 일치 |

현재 활성 전표는 전부 MANUAL이므로 SENT 취소가 도메인상 허용된다. `PARTNER_ORDER`라면 도메인과
화면 모두 취소를 제외하므로 그 분기는 차집합이 아니다.

양방향 집계:

- **도메인 허용 → 화면 부재/차단**: DRAFT/SAVED 협업수정 2개 상태 × 2유형,
  WAREHOUSE INBOUND 저장·전송·취소·확정.
- **화면 노출 → 도메인 거부**: MANAGER INBOUND INSPECTING 처리 완료.
- **집합은 같지만 동작 의미가 틀림**: 취소를 `삭제`로 표시, 업무 409를 타 사용자 전이로 표시하고
  편집 저장을 잠금.

## 결함 1 — 정상적인 재고 부족 409를 타 사용자 전이로 오인하고 협업 편집을 잠근다

### ① 사용자가 밟는 화면 동선

`dev_manager` → 판매관리 → 상태가 SENT인 `2026/08/04-7` 또는 `2026/08/04-8` 상세 → 상단
`수정`으로 협업 overlay 입력 → 하단 `완료 (수락)` → 재고 부족 409.

화면에는 실제 동시 전이가 없었는데도 다음 문구가 뜨고 열린 협업 입력은 저장 disabled가 된다.

```text
다른 사용자가 먼저 전표를 전이했습니다. 현재 편집 내용은 저장할 수 없습니다. 내용을 복사한 뒤 취소하세요.
```

### ② 재현 근거

R30의 `onError`는 409의 원인을 구분하지 않는다.

- `clients/desktop/src/renderer/routes/SlipDetailPage.tsx:1608-1618`: 모든 409에 위 동시전이
  문구를 설정하고, 열린 직접/기사 폼을 stale로, 협업 폼을 blocked로 바꾼다.
- `services/slip-service/src/main/java/com/samhanair/logis/slip/web/SlipController.java:485-496`:
  accept의 409는 **상태 불일치 또는 재고 부족**이다.
- `services/slip-service/src/main/java/com/samhanair/logis/slip/service/SlipService.java:841-884`:
  OUTBOUND accept가 실제 inventory reserve를 호출하며 재고 부족도 CONFLICT다.
- `services/slip-service/src/main/java/com/samhanair/logis/slip/client/InventoryClient.java:38`,
  `:187-190`, `:298-325`: inventory 4xx, 특히 재고 부족 409를 CONFLICT로 전달한다.

실화면 관련 행 원문:

```text
@e22 [button] "수정"
@e35 [button] "반려"
@e85 [button] "삭제"
@e86 [button] "완료 (수락)"
```

R30 보고서의 “일반 실패에서는 어떤 폼도 닫지 않는다”는 서술
(`docs/dev-reports/2026-08-04-874-r30-edit-surface-fix.md:58-59`)도 재고 부족 409에는 성립하지
않는다. 테스트 품질 문제가 아니라 실제 409 의미를 잘못 분류한 제품 동작이다.

### ③ 실 데이터 해당 건수

현재 SENT OUTBOUND 4건은 모두 같은 serial-managed 4개 품목을 각 1개 요구한다.

```text
product_code   model_name    serial_managed
AC060CN1DBC1   AC060CN1DBC1  t
AC060CX1DBC1   AC060CX1DBC1  t
AR-EC05        AR-EC05       t
PC1BWSK3NW     PC1BWSK3NW    t
```

```text
slip_no       source_warehouse_id                    line count / 각 quantity
2026/08/04-1  11111111-1111-1111-1111-000000000001  4 / 1
2026/08/04-6  11111111-1111-1111-1111-000000000001  4 / 1
2026/08/04-7  5ab14cf6-d97e-40c4-b991-0c04ef60fee9  4 / 1
2026/08/04-8  11111111-1111-1111-1111-000000000002  4 / 1
```

inventory 실측에서는 첫 번째 창고에만 각 품목 AVAILABLE 1개가 있고 나머지 두 창고에는 대상
인스턴스가 0개다.

```text
warehouse_id                              product_id                              status     count
11111111-1111-1111-1111-000000000001      76eb9c36-3401-44f3-8a88-d28b8eeed5ee    AVAILABLE  1
11111111-1111-1111-1111-000000000001      8f0becf3-82d9-4a6b-9c86-30ce497e0f3d    AVAILABLE  1
11111111-1111-1111-1111-000000000001      dafcc9e1-c699-4ccd-97d8-3dba35e8b3f0    AVAILABLE  1
11111111-1111-1111-1111-000000000001      dd7503d5-58a5-44ab-b0ca-abc416037042    AVAILABLE  1
```

따라서 **현재 즉시 확정 발화 2건**(`2026/08/04-7`, `2026/08/04-8`)이다. `-1`과 `-6`은
같은 창고의 각 품목 AVAILABLE 1개를 경쟁하므로 한 건이 정상 수락되면 남은 한 건이 세 번째
재고 부족 대상이 된다. 이번 라운드는 전이를 실행하지 않았다.

## 결함 2 — INBOUND 전이 권한을 화면과 서버가 서로 다르게 판정한다

### ① 사용자가 밟는 화면 동선

두 방향이 모두 존재한다.

1. `dev_manager` → 구매관리 → 현재 INBOUND INSPECTING `2026/08/04-2` → 활성
   `완료 (처리 완료)` 클릭 가능 → 서버는 `inbound.inspection UPDATE`가 없어 거부.
2. `dev_warehouse` → 구매관리 → DRAFT/SAVED/SENT에서 저장·전송·취소, 또는 현재
   INSPECTING 1건을 정상 처리해 COMPLETED에 도달 → 서버는 `purchases.slip.edit UPDATE`로
   허용하지만 화면은 `sales.*` 권한을 요구해 버튼을 disabled.

### ② 재현 근거

프런트는 유형을 보지 않고 전이별 판매 권한을 고정한다.

- `clients/desktop/src/renderer/routes/SlipDetailPage.tsx:1173-1193`:
  save/send=`sales.slip.edit`, confirm=`sales.slip.confirm`, cancel=`sales.slip.cancel`,
  inspect=`slip.transfer.process` 하나만 사용.
- `clients/desktop/src/renderer/routes/SlipDetailPage.tsx:2305-2313`, `:2483-2491`,
  `:4736-4771`: 이 매핑으로 실행/disabled를 결정한다.

서버 계약은 다르다.

- `services/slip-service/src/main/java/com/samhanair/logis/slip/web/SlipController.java:797-804`:
  INBOUND save/send/cancel/confirm은 모두 `purchases.slip.edit UPDATE`로 분기한다.
- 같은 파일 `:519-528`: INBOUND inspect는 `slip.transfer.process UPDATE`에 더해
  `inbound.inspection UPDATE`도 요구한다.

실계정 권한 원문:

```text
login_id       page_code             can_view can_create can_update can_delete
dev_manager    inbound.inspection    t        f          f          f
dev_manager    purchases.slip.edit   t        t          t          t
dev_manager    sales.slip.cancel     t        t          t          t
dev_manager    sales.slip.confirm    t        t          t          t
dev_manager    sales.slip.edit       t        t          t          t
dev_manager    slip.transfer.process t        t          t          t
dev_warehouse  inbound.inspection    t        t          t          t
dev_warehouse  purchases.slip.edit   t        t          t          t
dev_warehouse  sales.slip.cancel     f        f          f          f
dev_warehouse  sales.slip.confirm    f        f          f          f
dev_warehouse  sales.slip.edit       f        f          f          f
dev_warehouse  slip.transfer.process t        t          t          t
```

현재 INBOUND 검수 결재선에는 실제 approver 행이 없다.

```text
document_type  action_key       sequence  label   approver_type  approver
SLIP_INBOUND   INBOUND_INSPECT  2         검수인  (null)         (null)
```

`services/auth-service/src/main/java/com/samhanair/logis/auth/service/ApprovalLineAuthorizationService.java:37-48`은
approver가 비어 있으면 `configured=false`로 돌려주고, slip-service의
`SlipService.java:937-947`은 그 경우 결재선으로 차단하지 않는다. 따라서 현재
`dev_warehouse`의 INSPECTING→COMPLETED 경로는 권한상 실제 도달 가능하다.

MANAGER 실화면은 현재 INBOUND INSPECTING 전표에서 서버가 거부할 액션을 활성 노출했다.

```text
입고전표 상세 [2026/08/04-2]
@e20 [button] "수정"
@e33 [button] "반려"
@e82 [button] "완료 (처리 완료)"
```

### ③ 실 데이터 해당 건수

- **즉시 false-positive 1건**: INBOUND INSPECTING `2026/08/04-2`. MANAGER 화면 버튼은 활성,
  서버 권한은 거부다.
- WAREHOUSE false-negative가 즉시 보이는 INBOUND DRAFT/SAVED/SENT/COMPLETED는 현재 **0건**이다.
  그러나 `dev_warehouse`는 `purchases.slip.list VIEW`, `purchases.slip.edit CREATE/UPDATE`를
  실제 보유하고, 현재 INSPECTING **1건**을 처리 완료할 수 있다. 그 정상 한 단계를 밟으면 바로
  COMPLETED 확정 버튼이 잘못 차단된다. 즉 실제 데이터 파이프라인 선행 건수는 **1건**이다.

PROCESSING·COMPLETED 등을 새로 만들지 않은 이유는 제품이 만들 수 없어서가 아니다. 현재
INSPECTING→COMPLETED와 SENT→ACCEPTED 등 정상 화면/도메인 경로가 존재하지만, 이번 라운드의
DB 쓰기 금지 때문에 전이를 실행하지 않았다.

## 결함 3 — DRAFT/SAVED에서 협업수정 진입점이 직접수정에 가려진다

### ① 사용자가 밟는 화면 동선

`dev_manager` 또는 `dev_sales` → 판매관리 → DRAFT 상세 → 상단 `수정`.

두 계정은 `sales.slip.edit UPDATE`와 `slip.audit-overlay UPDATE`를 모두 가지지만, 화면의 유일한
상단 `수정`은 직접수정 폼을 연다. 협업 overlay 수정 버튼은 렌더되지 않고, footer 협업수정은
COMPLETED에서만 추가된다. 따라서 거래처 연락처·주소·대표자, 할인 정보, 회수 조건, 약정 조건
같은 overlay 필드를 화면에서 편집할 경로가 없다.

### ② 재현 근거

- `clients/desktop/src/renderer/routes/SlipDetailPage.tsx:2182-2198`: DRAFT/SAVED 직접수정 권한.
- 같은 파일 `:2236-2254`: 같은 상태에서 협업수정도 허용하며 11개 overlay 필드를 구성.
- 같은 파일 `:3511-3563`: 직접수정이 가능하면 협업 버튼 조건
  `canCollabEdit && !canDirectEditSales && !canDirectEditPurchase`가 false다.
- 같은 파일 `:316-328`, `:4753-4765`: footer 협업수정은 COMPLETED에서만 렌더된다.
- `services/slip-service/src/main/java/com/samhanair/logis/slip/service/SlipService.java:655-675`:
  서버는 DRAFT/SAVED 협업수정을 허용한다.

실화면 DRAFT 관련 행 원문:

```text
@e22 [button] "수정"
@e23 [button] "삭제"
@e25 [button] "편집"               # 기사 편집
@e53 [button] "전표 복사"
@e54 [button] "삭제"
@e55 [button] "완료 (저장)"
```

협업 패널의 코멘트 연결 필드들은 보이지만 `slip-collab-edit-open`에 해당하는 두 번째 수정 버튼은
없다. 직접수정 payload(`SlipDetailPage.tsx:2742-2763`)에는 overlay 전용 거래처 연락처·주소·대표자,
할인 정보, 회수 조건, 약정 조건이 없다.

### ③ 실 데이터 해당 건수

- OUTBOUND DRAFT **115건** 전부가 화면 조합 대상이다.
- OUTBOUND SAVED, INBOUND DRAFT/SAVED는 현재 **0건**이다.
- 실제 `dev_manager`, `dev_sales` 모두 `sales.slip.edit UPDATE`와
  `slip.audit-overlay UPDATE`를 보유하므로 가상 role 조합이 아니다.

## 결함 4 — 취소를 “삭제”라고 표시하며 DRAFT에서는 실제 삭제와 구분할 수 없다

### ① 사용자가 밟는 화면 동선

- DRAFT/SAVED 상세: header `삭제`는 실제 soft delete, footer `삭제`는 CANCELED 상태 전이다.
- SENT 상세: footer `삭제`를 누르면 행이 삭제되는 것이 아니라 CANCELED 상태가 된다.

### ② 재현 근거

- `clients/desktop/src/renderer/routes/SlipDetailPage.tsx:3564-3590`: header `삭제`는
  `deletePurchaseSlip`/`deleteSalesSlip` soft delete mutation을 연다.
- 같은 파일 `:2417-2431`: footer `삭제`는 `handleTransition('cancel')`을 호출한다.
- 같은 파일 `:4725-4751`: 화면 라벨은 `삭제`다.
- `services/slip-service/src/main/java/com/samhanair/logis/slip/domain/Slip.java:1185-1199`:
  cancel은 `is_deleted`를 바꾸지 않고 상태를 `CANCELED`로 바꾼다.

DRAFT 실화면에는 서로 다른 두 버튼이 같은 이름으로 동시에 보였다.

```text
@e23 [button] "삭제"    # header soft delete
@e54 [button] "삭제"    # footer cancel → CANCELED
```

SENT 실화면에도 cancel이 `삭제`로 보였다.

```text
@e85 [button] "삭제"
@e86 [button] "완료 (수락)"
```

확인창 안에서야 “전표가 취소 상태로 변경됩니다”라고 밝히므로, 버튼 단계의 사용자 노출 텍스트와
실제 전이가 일치하지 않는다.

### ③ 실 데이터 해당 건수

현재 MANUAL이라 취소 가능한 OUTBOUND DRAFT 115건 + SENT 4건 = **119건**이다. DRAFT 115건은
실제 soft delete와 cancel 두 버튼이 같은 이름으로 동시에 노출되고, SENT 4건은 cancel 하나가
`삭제`로 노출된다. 현재 INBOUND 취소 가능 상태는 0건이다.

## 본인/타인 및 협업 패널 교차 확인

- R30의 본인/타인 조정 코드는 요청 성공 또는 외부 status 변경 뒤 열린 로컬 폼을
  유지/close/stale 처리한다. 전이 실행 자체는 계속 프런트 권한 확인
  (`SlipDetailPage.tsx:2305-2344`)과 서버 권한을 통과해야 한다. R30으로 타인 전표의 권한 없는
  편집·전이가 새로 열린 근거는 찾지 못했다.
- 이 저장소의 전표 변경 계약은 작성자 일치가 아니라 계정 page permission이다. 실제 타인이어도
  해당 UPDATE 권한을 가진 MANAGER/WAREHOUSE가 업무 전이를 수행하는 것은 서버 계약과 일치한다.
- 협업 패널과 상세 화면의 상태 집합은 SHIPPING/DELIVERED/CANCELED/REJECTED 차단에서 일치한다.
  다만 DRAFT/SAVED에서는 상세 직접수정 버튼이 협업수정 진입을 숨겨 결함 3의 차집합이 생긴다.
- 반려는 SENT/ACCEPTED/INSPECTING 양 유형에서 화면과 도메인 모두 존재한다. 과거 R23의
  INSPECTING 반려 버튼 소실은 현재 재발하지 않았다.

## 정상 경로 차단 실데이터 요약

| 차단/오동작 | 현재 즉시 해당 | 정상 한 단계 뒤 해당 | 비고 |
|---|---:|---:|---|
| 재고 부족 409을 타 사용자 전이로 오인해 협업 저장 차단 | 2건 | 추가 1건 가능 | SENT `-7`, `-8` 즉시; `-1`/`-6` 재고 경쟁 |
| MANAGER INBOUND INSPECTING 버튼 false-positive | 1건 | - | 화면 활성, 서버 추가 권한 없음 |
| WAREHOUSE INBOUND confirm false-negative | 0건 | 1건 | 현재 INSPECTING 1건을 정상 완료하면 발화 |
| DRAFT 협업 overlay 수정 진입 차단 | 115건 | 신규 DRAFT마다 | OUTBOUND 현재값 |
| 취소를 삭제로 표시 | 119건 | 신규 DRAFT/SAVED/SENT마다 | 현재 전부 MANUAL |

## 이 라운드가 보지 않은 것

- 개발책임자가 A안으로 분리한 시나리오 2~5의 회계 배분·전기.
- PR #1061, #1045, #1063, #1066의 파일과 동작.
- 컨테이너 재배포·재빌드·중지 및 Docker 이미지 내용 교체.
- 전표/재고 DB 쓰기, 전이 버튼 실제 클릭, 상태 fixture 생성. 현재 0건인 PROCESSING,
  SHIPPING, DELIVERED, COMPLETED는 정상 전이로 만들 수 있는 코드·권한 경로까지만 확인했다.
- 실제 두 브라우저에서 SSE를 발생시키는 타 사용자 전이. 본인/타인 판정은 R30 변경 코드와
  프런트/서버 권한 계약을 대조했다.
- Gradle 전체 스위트.
- 테스트 강도, mock 충실도, 가드 품질, 문서 과장 여부. 단, 맨 앞 컨테이너 시간 원문과 현재
  실측 불일치는 사용자 지시에 따른 증거 무결성 예외로 기록했다.

## 최종 판정

**머지 비권고.** 상태→다음 전이의 구조표만 보면 대부분 맞지만, 반대 방향 대조에서 도메인이
허용한 협업수정/INBOUND 전이가 화면에서 사라지고, 화면이 허용한 INBOUND inspect는 서버가
거부한다. 더 직접적으로 R30의 핵심 409 조정기가 실제 재고 부족을 동시전이로 오인하여 현재
실데이터 최소 2건에서 정상 업무 실패 뒤 유효한 편집 표면까지 잠근다. 이 네 경로는 모두 실제
계정과 현재 화면/데이터로 도달 가능하므로 현 HEAD 머지를 권고하지 않는다.

## 신규 파일

```text
docs/dev-reports/2026-08-05-874-r31-sol-reconvergence.md
```

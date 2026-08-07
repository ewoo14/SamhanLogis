# PR #1097 / 이슈 #1096 — S10 S9 재검증 + SOL 직접 라이브 QA

검증일: 2026-08-07 KST  
검증자: SOL  
결론: **S8 결함 2건은 모두 완전히 닫히지 않았다. S10 도달 결함은 3건이다.** 다만 F1은 S9 코드 자체의 실패가 아니라 **S9 이전 slip-service 배포본을 S9 배포본으로 전제한 환경 불일치**라는 셋째 가능성이 확정됐다.

## 0. 환경 확인

| 항목 | 직접 확인 결과 |
|---|---|
| cwd | `C:\dev\Samhan-Public\.claude\worktrees\t1096` |
| 브랜치 / HEAD | `chore/1096-test-seed-cleanup` / `4e261682d43222fd2f42596de344f01e04669bae` |
| Docker | **18/18 컨테이너 healthy** |
| 게이트웨이 | `GET http://localhost:8080/actuator/health` → HTTP 200 |
| Flyway | `slip_db V117`, `product_db V31`, `partner_order_db V18`, 모두 `success=true` |
| 렌더러 | **t1096 HEAD**의 `clients/desktop`, `VITE_MOCK_MODE=0`, `VITE_APP_VERSION=2026/08/07-109610`, `http://localhost:5196` |
| 브라우저 | `node + @playwright/test`, `chromium.launch({ headless: true })`, 1600×1000 |
| 자격 | `infrastructure/.env.local` 없음. `docs/handoff/CURRENT-WORK.md` 환경 절 사용. 보고서에는 `<redacted>` |
| DB 변경 | 직접 SQL은 전부 `SELECT`. `INSERT/UPDATE/DELETE` 없음 |
| 금지 준수 | 컨테이너 재빌드·재기동, migration 수정, 코드 수정, commit, push 모두 하지 않음 |

### 배포 식별 검증 — 지시된 환경 전제가 slip-service에서 성립하지 않음

S9 HEAD 커밋 시각은 `2026-08-07 17:47:46 +09:00`이다. 반면 실행 중 slip-service 컨테이너는 `16:54:29 KST`에 생성되고 `16:54:33 KST`에 시작됐다. 시간상 S9 커밋보다 약 53분 앞선 배포본이다.

행위 증거도 동일하다. S10이 새 견적을 만든 뒤 같은 인증 세션으로 직접 호출한 결과:

```text
GET /slips/estimates?page=0&size=1&includeDeleted=false → HTTP 200, totalElements=2,029
GET /slips/estimates?page=0&size=1&includeDeleted=true  → HTTP 200, totalElements=2,029
DB active estimates                                    → 36
```

즉 S9 소스의 `(:includeDeleted = TRUE OR e.is_deleted = FALSE)`가 현재 배포본에서는 작동하지 않는다. HEAD 소스에는 수정이 있으나 실행 artifact에는 없다. 컨테이너 금지 지시 때문에 재배포하지 않고 관측 그대로 판정했다.

renderer는 처음 `127.0.0.1`로 접근했을 때 gateway의 `localhost` httpOnly 세션 쿠키와 site가 갈라져 로그인 직후 401이 발생했다. 동일 Vite 프로세스를 `localhost:5196`으로 접근하자 정상 인증됐다. mock이나 쿠키 주입 없이 실제 로그인 UI를 사용했다.

## 1. 결함 수 — S8 대비

```text
S8 결함 수: 2
S10 결함 수: 3
증감: +1
```

| ID | 결함 | 정확한 도달 경로 | 판정 |
|---|---|---|---|
| S10-F1 | 견적 기본 목록이 여전히 삭제행 포함 | 로그인 → 판매 → 견적서 관리 → `삭제 문서 포함` 꺼짐 확인 → `전체 2,028건`, 삭제행 15건이 첫 50행에 노출. 생성 후 명시적 `includeDeleted=false` API도 2,029건 | **S8 F1 미종결. 현재 원인은 S9 이전 slip-service 배포본** |
| S10-F2 | 확정 가능한 test seed 판매전표 100건이 활성로 잔존 | `slips.is_deleted=false AND created_by='system'` → 100건 전부 모든 라인이 `TEST-MODEL-*`; 93건은 `[Stage 2 시드]` 메모 | **S8 F2 중 100건 미종결** |
| S10-F3 | `삭제 문서 포함` 대량 결과에 페이지네이션 없음 | 견적 토글 ON → 2,028건 중 50행만, 주문 토글 ON → 1,988건 중 50행만, 판매전표 토글 ON → 2,465건 중 20행만. 세 화면 모두 이전/다음 버튼 0개 | **S9 신규 표면 결함** |

개발책임자 규칙의 수치 조건인 “같거나 늘면”에 해당한다. 다만 **S10-F1은 S9 코드 회귀가 아니라 S9가 배포되지 않은 셋째 가능성**이다. S9 커밋을 기계적으로 되돌리면 HEAD에 있는 견적 필터 수정까지 제거돼 더 나빠진다. PM 재분석에서는 먼저 배포 artifact 불일치를 분리하고, LUNA fix 범위는 F2의 결정적 100건과 F3 페이지 계약으로 좁혀야 한다.

## 2. S8 결함 2건 닫힘 여부

### S8-F1 — 기본 목록이 삭제행 포함

**부분 종결 / 전체 미종결.**

- 주문: 기본 3건, 삭제행 0 → PASS.
- 판매전표: OUTBOUND 기본 303건, 첫 20행 삭제행 0 → PASS.
- 견적: 기본 2,028건, 첫 50행 중 삭제행 15건 → FAIL.
- HEAD 소스는 수정됐지만 실행 중 slip-service가 S9 이전 artifact라서 견적 backend 필터만 라이브 환경에 없다.

증거: [견적 기본 목록 — 토글 OFF인데 2,028건](../qa-shots/1096-s10-live-qa/01-estimates-default.png), [주문 기본 3건](../qa-shots/1096-s10-live-qa/05-orders-default.png), [판매전표 기본 활성행](../qa-shots/1096-s10-live-qa/09-sales-slips-default.png)

### S8-F2 — system/system-internal 시드 103건 잔존

**100건은 결함 확정, 3건은 별도 provenance 조사 대상. 따라서 F2 전체는 닫히지 않았다.** 상세 수치는 §5에 기록한다.

## 3. 직접 라이브 QA ①~⑦

### ① 견적 목록 — FAIL

- GUI 진입 전 DB 활성값: **35 = 기존 34 + S8 GUI 생성 `2026/08/07-4` 1건**.
- GUI 기본값: 체크박스 OFF인데 **전체 2,028건**, 첫 페이지 50행 중 삭제행 15건.
- S10 신규 견적 생성 후 DB 활성 36, 전체 2,029가 됐고 `includeDeleted=false/true`가 둘 다 2,029를 반환했다.
- count와 목록은 같은 잘못된 집합을 사용하므로 숫자끼리는 맞지만 활성 기본 계약은 깨졌다.

증거: [01-estimates-default.png](../qa-shots/1096-s10-live-qa/01-estimates-default.png), [02-estimates-include-deleted.png](../qa-shots/1096-s10-live-qa/02-estimates-include-deleted.png)

### ② 주문 목록 — PASS

- 기본 체크박스 OFF, API `totalElements=3`, GUI 3행, 삭제행 0.
- 정확 주문번호 `2026/07/30-1` 검색은 API 1건 / GUI 1행.
- 토글 ON은 현재 기본 상태필터 DRAFT 기준 1,988건, 첫 페이지 50행.

증거: [05-orders-default.png](../qa-shots/1096-s10-live-qa/05-orders-default.png), [07-order-search.png](../qa-shots/1096-s10-live-qa/07-order-search.png)

### ③ 판매전표 목록 — PASS, 기대값 축 정정

사용자가 제시한 345는 `OUTBOUND 303 + INBOUND 42` 전체 slip 수다. `/sales/slips`는 OUTBOUND 전용 화면이므로 GUI/API 기대값은 **303**이었다. 기본 목록 API는 303, 첫 20행 삭제행 0으로 정상이다.

S10은 GUI로 `2026/08/07-21`을 하나 생성했다. 같은 시간 공유 DB에 다른 트랙이 `-22`, `-23`을 생성했으므로 종료 시점 총수는 S10 단독 증분으로 판정하지 않았다. S10 소유 생성분은 POST 201과 문서번호로 분리 확인했다.

증거: [09-sales-slips-default.png](../qa-shots/1096-s10-live-qa/09-sales-slips-default.png)

### ④ 품목 목록 — PASS

- API와 GUI 모두 **3,082건**.
- 첫 페이지 50행, `1 / 62`.
- 다음 페이지 클릭 → API page 1, GUI `2 / 62`.
- `AC023CS1DBC1SY` 검색 → API 1건 / GUI 1행.

증거: [12-products-default.png](../qa-shots/1096-s10-live-qa/12-products-default.png), [13-products-page-2.png](../qa-shots/1096-s10-live-qa/13-products-page-2.png), [14-product-search.png](../qa-shots/1096-s10-live-qa/14-product-search.png)

### ⑤ `삭제 문서 포함` 토글 — 견적 FAIL, 주문·판매전표 PASS

| 화면 | OFF | ON | 다시 OFF/재진입 |
|---|---|---|---|
| 견적 | **FAIL** — 2,028 전체가 이미 보임 | 2,028, 변화 없음 | 새로고침 시 OFF로 초기화되나 결과는 여전히 전체 |
| 주문 | 3 활성행 | DRAFT 1,988건, 삭제행 취소선/복원 표시 | 새로고침·다른 route 왕복 후 OFF |
| 판매전표 | OUTBOUND 활성 303 | OUTBOUND 전체 2,465, 삭제행 취소선/복원 표시 | 새로고침 후 OFF |

토글 상태를 URL이나 storage에 보존하지 않고 컴포넌트 로컬 상태로만 유지한다. **새로고침과 route 이동 때 안전 기본값 OFF로 돌아가는 동작은 PASS**다.

증거: [06-orders-include-deleted.png](../qa-shots/1096-s10-live-qa/06-orders-include-deleted.png), [10-sales-slips-include-deleted.png](../qa-shots/1096-s10-live-qa/10-sales-slips-include-deleted.png)

### ⑥ 정상 생성 경로 — PASS (핵심)

실제 GUI에서 다음 순서로 수행했다.

1. 새 판매전표: 본사창고 → 주식회사 제이앤피공조 → `AC023CS1DBC1SY` 선택/전개 → 4라인, 총 690,000원 → 저장.
2. `POST /slips` HTTP 201 → **`2026/08/07-21`** 상세 열림.
3. 새 견적: 같은 거래처와 모델 선택 → 4라인, 총 690,000원 → 임시저장.
4. `POST /slips/estimates` HTTP 201 → **`2026/08/07-5`** 상세 열림.

활성 문서를 감추는 쪽의 회귀는 없었다.

증거: [15-new-slip-ready.png](../qa-shots/1096-s10-live-qa/15-new-slip-ready.png), [16-new-slip-saved-detail.png](../qa-shots/1096-s10-live-qa/16-new-slip-saved-detail.png), [17-new-estimate-ready.png](../qa-shots/1096-s10-live-qa/17-new-estimate-ready.png), [18-new-estimate-saved-detail.png](../qa-shots/1096-s10-live-qa/18-new-estimate-saved-detail.png)

### ⑦ 상세·검색·페이지네이션 — 부분 PASS

- 활성 견적 `2026/08/07-4`, 활성 주문 `2026/07/30-1`, 최신 활성 판매전표 상세가 모두 열림.
- 견적 거래처명 필터는 현재 로드된 페이지에서 3행으로 축소됨.
- 주문 정확 문서번호 검색 1건, 품목 모델 검색 1건.
- 품목 페이지네이션 1→2 페이지 정상.
- 삭제 견적, 주문, 판매전표 직접 URL은 모두 상세를 열지 않고 오류/조회 실패 화면으로 차단. 주문은 최초 자동 판정에서 오류 문구를 누락했으나 재실행으로 차단을 확인했다.
- **견적·주문·판매전표 목록 자체는 이전/다음 UI가 없어 대량 결과의 뒤 페이지에 도달할 수 없음(S10-F3).**

증거: [03-estimate-active-detail.png](../qa-shots/1096-s10-live-qa/03-estimate-active-detail.png), [04-deleted-estimate-direct-blocked.png](../qa-shots/1096-s10-live-qa/04-deleted-estimate-direct-blocked.png), [08-order-active-detail.png](../qa-shots/1096-s10-live-qa/08-order-active-detail.png), [11-sales-slip-active-detail.png](../qa-shots/1096-s10-live-qa/11-sales-slip-active-detail.png), [20-deleted-order-direct-blocked.png](../qa-shots/1096-s10-live-qa/20-deleted-order-direct-blocked.png)

## 4. S9 새 표면 검증

### 토글 상태의 페이지 이동·새로고침

- 견적/주문/판매전표 모두 로컬 `useState(false)`.
- 새로고침 시 OFF.
- 주문에서 ON → 견적으로 이동 → 주문으로 복귀했을 때 OFF.
- 안전 기본값 복귀이므로 결함으로 세지 않았다.

### count와 목록 정합

| 화면/상태 | API total | 받은 행 | GUI 행 | 판정 |
|---|---:|---:|---:|---|
| 견적 OFF | 2,028 | 50 | 50 | count/list는 같은 전체집합이나 기본 필터 실패 |
| 견적 ON | 2,028 | 50 | 50 | OFF와 동일 — 배포본 필터 부재 |
| 주문 OFF | 3 | 3 | 3 | PASS |
| 주문 ON, DRAFT | 1,988 | 50 | 50 | count/list 일치, 페이지 접근 FAIL |
| 판매전표 OFF, OUTBOUND | 303 | 20 | 20 | PASS |
| 판매전표 ON, OUTBOUND | 2,465 | 20 | 20 | count/list 일치, 페이지 접근 FAIL |
| 품목 | 3,082 | 50 | 50 | PASS, 62페이지 접근 가능 |

countQuery만 따로 빠진 증거는 없었다. 문제는 견적 배포 artifact와 세 문서 목록의 페이지 UI 부재다.

### 삭제 문서 상세 직접 진입

| 문서 | 결과 |
|---|---|
| 견적 | “견적서 상세를 불러오지 못했습니다” — 차단 |
| 주문 | “주문 조회에 실패했습니다” — 차단 |
| 판매전표 | 상세 조회 실패 — 차단 |

목록만 막고 상세가 열리는 반쪽 구현은 재현되지 않았다.

### 다른 목록 화면과 S9 전수 grep 표 검증

| 표면 | 직접 UI | backend/source 필터 | 판정 |
|---|---|---|---|
| 입고전표 | `/purchases` 열림, 삭제 토글 없음 | `SlipController`가 INBOUND의 includeDeleted를 강제로 false | PASS |
| 분개 | `/accounting/journals` 열림, 삭제 토글 없음 | `Journal @SQLRestriction("is_deleted = false")` | PASS |
| 세금계산서 | `/accounting/tax-invoices` 열림, 삭제 토글 없음 | entity restriction + native list/count의 `t.is_deleted=false` | PASS |
| 품목 | `/products/catalog` 3,082건 | `Product @SQLRestriction("is_deleted = false")` | PASS |
| 견적 상세 | 삭제 문서 직접 URL 차단 | `Estimate @SQLRestriction` 기본 상세 경로 | PASS |
| 주문 상세/복원 | 직접 상세 차단, 목록 복원만 별도 | 기본 repository와 `findByIdIncludingDeleted` 분리 | PASS |
| 판매전표 상세/복원 | 직접 상세 차단, 복원만 별도 | 기본 repository와 `findByIdIncludingDeleted` 분리 | PASS |

증거: [19-other-list-tax-invoices.png](../qa-shots/1096-s10-live-qa/19-other-list-tax-invoices.png)

## 5. F2 잔존 103건 provenance 확정

### 정확한 분해

| 집합 | 문서 수 | 판별 증거 | 실데이터 혼입 가능성 |
|---|---:|---|---|
| `created_by='system'` | **100** | 100/100 문서의 모든 활성 라인이 `TEST-MODEL-*`; 93/100은 메모가 `[Stage 2 시드]`; 2026-05-09~05-30 생성; 상태 11종에 규칙적으로 분포 | **사실상 없음. deterministic Stage 2 test seed로 확정 가능** |
| `created_by='system-internal'` | **3** | 2026/05/30-1~-3, 모두 DRAFT, 같은 `PARTNER_ORDER` source를 약 2분 37초 사이 세 번 변환, 거래처/메모 없음, 각 1라인 | **낮지만 0으로 확정 불가** |

3건의 source ID를 `partner_order_db.partner_orders`와 대조했으나 원본 행과 라인이 모두 없었다. 동일 source 반복·빈 거래처·짧은 생성 간격은 QA/재시도 artifact에 강하게 가깝지만, 정상 모델을 사용했고 원본 provenance가 사라져 deterministic cleanup 조건으로 쓰기에는 부족하다.

### S9의 “103건 전체 provenance 부족” 판정

**과도하게 넓어 부당하다.** 정확한 판정은 다음이다.

```text
확정 test seed       100건
provenance 불명        3건
합계                103건
```

F2를 한 덩어리로 보류하면 확정 가능한 100건을 계속 활성 업무 목록에 남긴다. 권고는:

1. **100건은 이 PR의 과소 삭제 결함으로 유지**하고, 닫으려면 V117을 수정하지 말고 deterministic signature를 쓰는 **새 migration**만 추가한다.
2. **3건은 별도 provenance 조사로 분리**한다. 새 migration에 섞지 않는다.

이번 S10에서는 코드/migration을 추가하거나 수정하지 않았다.

## 6. 본 범위와 안 본 범위

본 범위:

- t1096 HEAD renderer를 새로 띄운 실제 gateway 로그인/GUI.
- 견적·주문·판매전표·품목 기본 목록, 삭제 토글, 활성 상세, 삭제 직접 URL.
- 신규 판매전표/견적 GUI 생성과 저장.
- 주문/품목 검색, 품목 페이지네이션, 문서 목록 페이지 접근성.
- 입고·분개·세금계산서 목록 smoke.
- Flyway/DB row count와 F2 103건 provenance SELECT.
- HEAD source와 실행 container 시각/행위 대조.

안 본 범위:

- 모바일/PWA, 아로로지스, 구매 주문 작성, 회계 mutation.
- Excel 파일 다운로드 결과 자체. 화면과 export의 includeDeleted 전달 코드는 읽었지만 파일 생성은 실행하지 않음.
- 삭제 문서 복원 실행과 삭제행 되살리기.
- cleanup 문서 전체 6천여 건의 행별 수동 열람.
- 3건의 사라진 partner-order 원본을 외부 로그/백업까지 추적하는 조사.
- 다른 트랙이 공유 DB에 동시에 만든 `2026/08/07-22`, `-23`의 기능 판정.

## 7. 프로세스 및 새 파일

- 임시 Playwright 드라이버는 모두 제거했다.
- renderer 프로세스는 라운드 종료 시 회수하고 5196 listener 해제를 확인한다.
- 컨테이너 프로세스는 건드리지 않았다.

새 파일:

```text
docs/dev-reports/2026-08-07-1096-s10-reconvergence-and-live-qa.md
docs/qa-shots/1096-s10-live-qa/*.png  (20개)
```


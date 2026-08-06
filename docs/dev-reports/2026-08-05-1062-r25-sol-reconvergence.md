```text
git -C . rev-parse --show-toplevel     # D:/dev/Samhan-Public/.claude/worktrees/w1062-lineux
git -C . branch --show-current         # fix/1062-line-input-ux
git -C . rev-parse HEAD                # 1524e60afcfe4c76d195dbe102834fe120db0f9b 이어야 함
```

# PR #1063 R25 SOL 재수렴 적대검증 보고서

## 최종 판정

**머지 비권고.** R23·R24가 바꾼 화면 표면에서 실 사용자가 도달할 수 있는 오동작 **3건**을 확인했다.

1. 네 라인 입력 화면 모두 trailing 빈행을 사용자가 삭제하면 정상적인 다음 행 생성 수단이 사라진다.
2. `AsyncAutocomplete`에서 확정 선택을 다시 편집할 때 입력 비우기가 선택을 해제하지 못하고, 전표 품목 교체에서는 첫 글자가 소실된다.
3. 견적 버전 복원으로 서버 라인 수가 줄면 R23의 선행-provider 보존 분기가 stale Y.Doc 행을 되살린다.

R22의 원결함 5건은 문자 그대로는 모두 닫혔다. 그러나 1·4·5번 표면에서 위 역방향 결함이 남았으므로 현재 HEAD는 병합 가능한 상태가 아니다.

## 실행 환경과 증거 무결성

### 컨테이너 실측

```text
container=/samhan-slip-service created=2026-08-05T02:50:44.702471161Z started=2026-08-05T02:51:02.147121178Z
container=/samhan-api-gateway created=2026-08-05T02:50:37.64267995Z started=2026-08-05T02:50:51.017973805Z
container=/samhan-product-service created=2026-08-03T08:31:27.357896901Z started=2026-08-04T23:34:13.092136224Z
```

- 세 컨테이너 모두 재배포하지 않았다.
- `samhan-product-service`는 R23보다 먼저 만들어진 배포본이다. 실행 JAR의 `ProductSummaryResponse.class`에는 기존 `modelName` 문자열은 있으나 `specification` 문자열은 없었다. 따라서 공유 스택의 실행 응답에는 R23 필드가 아직 없다.
- 직접 product-service `/actuator/health`는 `200 {"status":"UP"}`였다. 인증 없는 상품 검색은 direct `403`, gateway `401`이므로 인증을 우회하지 않았다. 규격 열의 R23 판정은 아래 소스 코드 기준이다.

### 데스크톱 렌더러

```text
config=clients/desktop/vite.renderer.dev.config.ts
host=127.0.0.1
port=5187
strictPort=true
command=vite dev --config vite.renderer.dev.config.ts --host 127.0.0.1 --port 5187 --strictPort
result=VITE v5.4.21 ready, http://127.0.0.1:5187/
```

실 GUI 동선은 branch renderer의 mock role/data로 수행했다. DB·API mutation, 컨테이너 재시작·재배포는 하지 않았다. 실 데이터 건수는 모두 `docker exec samhan-postgres psql -U samhan -d <db> -c "<SELECT>"` 형식의 읽기 쿼리로만 집계했다.

## 발견 1 — trailing 빈행을 삭제하면 네 화면 모두 다음 라인을 정상 추가할 수 없다

### ① 화면 동선

| 화면 | 사용자 동선 | 도달한 막힌 상태 |
|---|---|---|
| 판매전표 신규 `/sales/new` | 마지막 빈행에서 `AJ040RXH4BC1` 선택 → 자동 빈행 생성 → 뒤의 빈행들을 삭제 | 유효행 1개만 남고 삭제도 최소행 때문에 비활성. `+ 라인 추가` 0개, 새 입력행 0개 |
| 견적 신규 `/sales/estimates/new` | 유일한 빈행에 `AJ040RXH4BC1` 입력·blur → 자동 빈행 생성 → 새 빈행 삭제 | 유효행 1개만 남음. 그 유효행을 지우거나 내용을 바꾸지 않고는 두 번째 행을 만들 수 없음 |
| 분개 신규 `/accounting/journals/new` | 2행의 메모를 입력 → 3행 자동 생성 → 3행 빈행 삭제 | 차변·대변용 2행만 남고 3행 생성 수단 없음 |
| 재고이동 신규 `/transfers/new` | 유일한 빈행에 `AJ040RXH4BC1` 입력·blur → 자동 빈행 생성 → 새 빈행 삭제 | 유효행 1개만 남고 최소 1행 규칙 때문에 삭제 비활성. 다음 행 생성 수단 없음 |

이후 마지막 유효행을 다시 편집하면 빈행이 생길 수는 있다. 그러나 이는 이미 입력한 업무 데이터를 변경해야 하는 우회이며, “다음 행 추가” 동선이 아니다. 특히 값이 이미 정확한 경우 사용자는 데이터를 지우거나 임의 변경 후 되돌려야 한다.

### ② 재현 근거

실 GUI에서 얻은 최종 DOM 상태는 다음과 같았다.

```text
판매전표: lineInputs=[{label:"라인 1 품목", value:"AJ040RXH4BC1"}],
           deleteButtons=[{label:"라인 1 삭제", disabled:true}], addButtons=0
견적:     models=["AJ040RXH4BC1"], deletes=[{label:"라인 1 삭제", disabled:false}], addButtons=0
분개:     notes=["", "대변 메모"], deleteButtons=2, addButtons=0
재고이동: rows=1, modelValues=["AJ040RXH4BC1"], deleteDisabled=[true], addButtons=0
```

코드 원인도 네 화면에서 동일하다.

- `autoBlankRow.ts:8-20`의 `appendBlankRowIfLastChanged`는 **현재 마지막 행의 내용이 변경될 때만** 빈행을 붙인다.
- `autoBlankRow.ts:41-50`의 `removeLinePreservingMinimum`은 최소 개수만 채우며 trailing 빈행을 복원하지 않는다.
- 전표 `SlipFormPage.tsx:677-710`, 견적 `EstimateFormPage.tsx:1047-1058,1225-1232`, 분개 `JournalFormPage.tsx:367-388`, 재고이동 `TransferFormPage.tsx:97-116`의 삭제 경로 어디에도 `ensureTrailingBlankRow`가 없다.
- 최소행은 전표 1, 견적 1, 분개 2, 재고이동 1로 보존된다. 따라서 **0행 상태에는 빠지지 않지만, 입력 가능한 trailing 빈행이 없는 상태에는 빠진다.**

모바일·협업·읽기 전용도 교차 확인했다.

- 모바일 판매전표는 5행째 품목 선택 후 6번째 빈 카드가 생겼다. 모바일 견적도 같은 update/remove handler를 사용한다. 분개 모바일 카드와 재고이동 반응형 화면 역시 데스크톱과 같은 handler를 호출하므로 동일한 삭제 단절이 성립한다.
- 견적 협업 편집 `/sales/estimates/est-001/edit`은 3행(유효 2+빈 1)에서 마지막 빈행 입력 후 4행(유효 3+빈 1)이 됐다. 협업 중 모든 삭제 버튼이 비활성이라 발견 1의 삭제 단절에는 빠지지 않는다.
- 읽기 전용 견적 `/sales/estimates/est-003/edit`은 유효 2+빈 1을 표시했고 모든 입력이 read-only였다. 읽기 전용 사용자는 원래 행을 추가할 수 없으므로 별도 오동작으로 판정하지 않았다.

### ③ 실 데이터 건수

```text
slip_db: OUTBOUND DRAFT=116, SENT=4, CONFIRMED=1
         INBOUND INSPECTING=1, CONFIRMED=1
slip_db: QUOTE_DRAFT 견적=24, 활성 견적 라인=35
accounting_db: DRAFT 분개=5/라인 13, POSTED=2540/라인 7201, REVERSED=7/라인 17
inventory_db: 재고이동=0, 활성 창고=30
product_db: 화면 선택 가능 ACTIVE+BOTH 품목=774
```

신규 작성 화면은 기존 레코드 존재 여부와 무관하게 항상 도달한다. 기존 편집 가능한 견적 24건·분개 5건에도 동일 삭제 handler가 사용된다. 재고이동 기존 건수는 0이지만 활성 창고 30건을 이용한 신규 작성 동선이 열려 있다.

## 발견 2 — 자동완성 확정값의 정상 해제·교체 동선이 끊긴다

### ① 화면 동선

판매전표 신규 `/sales/new`에서 다음 두 경로를 실제 GUI로 재현했다.

1. `AJ040RXH4BC1` 선택 → 수량 필드로 blur → 품목 입력 재포커스 → Backspace → Tab.
2. 같은 확정 품목을 재포커스 → 다른 검색어 `AJ` 또는 한 글자 `X`를 입력.

첫 경로는 선택 해제를 기대하지만 blur 후 `AJ040RXH4BC1`이 다시 나타나고 product 선택이 유지됐다. 두 번째 경로는 첫 글자를 입력하는 순간 상위 전표가 선택을 null로 바꾸고 공용 컴포넌트의 controlled-value effect가 draft를 다시 비워, `AJ` 중 `A`가 사라져 최종 검색어가 `J`만 남았다. 한 글자 `X`만 입력하면 화면 값이 빈 문자열이 되고 기존 품목만 해제됐다. 사용자는 기존 품목을 정상적으로 새 검색어로 교체할 수 없다.

### ② 재현 근거

- `AsyncAutocomplete.tsx:198-218`: 확정값을 다시 포커스하면 `draft=''`로 만든다. 따라서 사용자가 보는 입력은 이미 빈칸이다.
- `AsyncAutocomplete.tsx:244-299`: 빈 draft blur는 `onChange(null)`을 호출하지 않고 `selectedLabel`을 복원한다.
- `AsyncAutocomplete.tsx:380-403`: 첫 실제 입력은 `setCommitted(false)`를 발화한다.
- `SlipFormPage.tsx:1634-1645,1712-1723`: 판매·구매 두 렌더 분기 모두 `committed=false`를 즉시 `productId=null`로 해석한다.
- `AsyncAutocomplete.tsx:428-446`: 상위 controlled value가 null로 바뀌면 현재 검색 surface를 닫고 draft를 다시 설정한다. 이것이 첫 글자를 소실시킨다.
- 공용 컴포넌트의 어떤 사용자 이벤트 경로도 `onChange(null)`을 호출하지 않는다. wrapper의 공개 타입은 null을 “선택 해제”로 선언하지만 입력 비우기만으로 그 콜백에 도달할 수 없다.

소비자를 전수 검색했다. 직접 소비자는 `ProductAutocomplete`·`PartnerAutocomplete` wrapper뿐이다. 범위 밖 `SlipDetailPage`와 테스트를 제외하면 데스크톱 **14개 source 화면 파일, 19개 인스턴스**다.

- `onInputCommitChange`를 받는 인스턴스는 전표 2개, `DailyClosingPage` 1개, `BlockedPartnersPage` 1개뿐이다.
- R23이 고친 일마감·차단거래처는 typed draft와 확정 label을 submit 시 비교하므로 예전 선택을 조용히 실행하는 문제는 닫혔다. 일마감에는 별도 `해제` 버튼도 있다.
- callback이 없는 나머지 인스턴스는 다른 문자열을 입력한 뒤 blur하면 기존 선택 label로 복귀한다. 즉 전표처럼 첫 글자를 잃지는 않지만, **입력을 비워 선택을 해제하는 공용 정상 동선은 제공되지 않는다.** 화면별 별도 초기화 버튼 유무는 서로 다르다.

### ③ 실 데이터 건수

```text
product_db: ACTIVE 품목=3061, 자동완성 선택 가능 ACTIVE+BOTH 품목=774
partner_db: ACTIVE 거래처=7025, SUSPENDED 거래처=5
source 소비자: 범위 내 14개 화면 파일 / 19개 자동완성 인스턴스
```

판매·구매 신규 전표에서 선택 가능한 774개 품목 모두가 재포커스 후 교체 경로의 대상이다. 공용 PartnerAutocomplete의 입력 해제 계약은 활성 거래처 7,025건을 검색하는 화면들에도 동일하다.

## 발견 3 — 견적 버전 복원 뒤 stale 선행 Y.Doc이 복원 결과를 덮고 삭제 라인을 되살린다

### ① 화면 동선

현재 실데이터에서 라인 수가 2·3으로 달랐던 revision을 함께 가진 `QUOTE_DRAFT` 견적 중 하나를 사용하면 다음 정상 화면 동선이 성립한다.

1. 견적 편집 화면을 한 번 열어 현재 2개 서버 라인+trailing 빈행을 협업 Y.Doc에 만든다.
2. 협업 패널의 버전이력에서 3라인 revision의 `이 시점으로 복원`을 실행한다.
3. 다시 편집 화면을 연다. provider가 서버보다 뒤이므로 R23 조건 `<`가 full-seed하여 Y.Doc을 3라인+빈행으로 만든다.
4. 버전이력으로 돌아가 2라인 revision을 복원한다.
5. 편집 화면을 다시 연다. 이제 provider 4행이 서버 기준 3행보다 앞서므로 R23 분기는 seed를 하지 않고 stale 3라인+빈행을 화면에 적용한다.

서버 복원으로 삭제된 세 번째 라인의 Y.Doc lineId는 새 서버 lineId 집합에 없어서 `lineId=null` 신규 라인으로 강등되지만 품목·수량·금액은 그대로 남는다. 협업 중 삭제 버튼은 비활성이다. 사용자가 그대로 저장하면 복원으로 제거했던 라인이 신규 라인으로 다시 영속될 수 있다.

### ② 재현 근거

- `EstimateVersionHistoryPanel.tsx:62,118-126,241,299-307,316-348`: `DRAFT/SENT`에서 과거 revision 복원 버튼과 확인 모달이 실제 화면에 제공된다.
- `EstimateFormPage.tsx:876-907`: R23 조건은 provider가 비었거나 `providerLineCount < serverLineCount`일 때만 seed한다. provider가 더 많으면 stale 여부를 판정할 revision/version 기준이 없다.
- `EstimateFormPage.tsx:340-400`: Y.Doc 행의 lineId가 복원된 서버 소유 집합에 없으면 null로 바꾸지만 행 내용은 유지한다.
- `EstimateFormPage.tsx:2055-2068`: 협업 활성 중 행 삭제 버튼은 비활성이다.
- `CollabCoeditService.java:15-18,35-38,43-58`: Yjs update는 문서별 노드 메모리에 누적되고 문서 삭제에도 자동 회수되지 않는다. 견적 저장·revision 복원 성공 시 이 entry를 지우거나 서버 revision으로 교체하는 호출은 없다.
- 따라서 이 stale-ahead 상태는 사용자가 편집 화면을 닫아도 남으며, 현재 구현에서는 slip-service 재시작 전까지 행 수 비교만으로 복구되지 않는다.

DB 쓰기 금지 때문에 실제 복원 버튼은 누르지 않았다. 위 동선은 화면에 노출된 두 복원 action, 현재 존재하는 서로 다른 라인 수 revision, 그리고 결정적인 count 분기·인메모리 보존 경로를 연결한 재현이다.

### ③ 실 데이터 건수

```text
QUOTE_DRAFT 견적=24, 현재 활성 라인=35
estimate_revisions=47, revision 보유 견적=24
라인 수가 2와 3으로 다른 revision을 함께 가진 복원 가능 견적=4
  2026/07/16-5
  2026/07/16-7
  2026/07/16-14
  2026/07/16-20
```

네 건 모두 `QUOTE_DRAFT`이고 각 2개 revision에서 `min_lines=2`, `max_lines=3`이었다. 즉 설명한 “큰 revision 복원 후 작은 revision 복원”을 현재 화면·현재 데이터로 구성할 수 있다.

## R23의 ProductSummaryResponse specification 변경 대조

이 표면에서는 신규 사용자 오동작을 찾지 못했다.

- 소스 `ProductSummaryResponse` canonical record는 `specification`을 포함하고, `from(Product)`는 `p.getSpecification()`을 넣으며 parent-set 변환도 `base.specification()`을 보존한다.
- 기존 호환 생성자가 null을 넣는 것은 수동 생성·구 호출 호환 경로다. 실제 상품 검색·내부 lookup은 `from(Product)`를 사용하므로 DB 값이 있는 실상품은 null 호환 생성자를 지나지 않는다.
- slip-service `ProductClient`는 응답을 먼저 `Map<String,Object>`로 받은 뒤 주입된 Spring `ObjectMapper`로 자기 `ProductSummary`에 변환한다. additive JSON 필드를 소비 DTO가 선언하지 않아도 기존 필드는 유지된다. 저장소에서 unknown-property를 강제로 실패시키는 runtime 설정은 찾지 못했다.
- `productApi.ts:32,84`는 새 값을 optional/null-safe로 받는다.
- 실 DB는 ACTIVE 3,061건 중 규격 보유 1,264건, 선택 가능 774건 중 규격 보유 315건이다. `AJ` 후보는 45건이고 45건 모두 규격이 있다.
- 단, 현재 공유 스택의 product-service 배포본에는 이 필드가 없다. 따라서 **코드 기준으로 R22 규격 결함은 닫혔지만, 재배포 전 현재 스택 화면은 여전히 `—`를 보이는 것이 정상적인 배포 차이**다.

## R22 5건 전후 대조

| R22 발견 | R22 상태 | R23/R24 현재 HEAD | 닫힘 판정 |
|---|---|---|---|
| 1. 확정 품목을 단순 포커스하면 productId 해제 | 포커스만으로 전표 라인이 저장 대상에서 빠짐 | `handleFocus`의 committed reset 제거로 단순 포커스만으로 productId가 지워지지 않음 | **원결함 닫힘.** 다만 실제 편집·해제에서 발견 2의 역방향 결함 발생 |
| 2. 판매·구매 전표 2건 이상 후보 모달 미표시 | `resultSelectionMode={null}` | 두 렌더 분기 모두 `"single"`; GUI에서 `AJ` 복수 후보 모달 진입 확인 | **닫힘** |
| 3. 검색 모달 규격이 항상 `—` | 응답 DTO에 필드 없음 | 소스 DTO·매핑·front mapping 모두 specification 전달. 다른 소비자는 additive 호환 | **코드 기준 닫힘.** 공유 배포본은 구버전임을 별도 기록 |
| 4. 서버보다 앞선 견적 Y.Doc을 참가자 진입 시 full-seed하여 미저장 행 유실 | `!==`이면 seed | provider가 앞선 활성 협업 문서는 보존 | **원결함 닫힘.** 다만 revision 복원으로 stale-ahead가 된 경우 발견 3의 역방향 결함 발생 |
| 5. “자동 빈행만” 결정과 달리 네 화면에 `+ 라인 추가` 유지 | 버튼·addLine 존재 | 네 화면 버튼·handler 제거, GUI `addButtons=0` | **원결함 닫힘.** 다만 trailing 빈행 삭제 후 발견 1의 정상 경로 단절 발생 |

R24는 Playwright 준비 locator를 `header-page-title`로 좁힌 변경뿐이며 제품 코드 표면의 추가 오동작은 만들지 않았다.

## 이 라운드가 보지 않은 것

- 후속 이슈 #1071 범위인 `/sales/:id/edit`, `SlipDetailPage`, `CollaborativeSlipInput`
- 다른 트랙 #1045·#1057·#1061·#1066의 파일과 동작
- 컨테이너 재배포 뒤의 통합 환경 화면; 특히 새 `specification` 응답의 실제 배포 확인
- DB/API 쓰기가 필요한 견적 revision 실제 복원·재저장, 신규 전표·견적·분개·재고이동 실제 저장
- 전체 Gradle 스위트와 이번 질문 밖의 검증 품질
- R23/R24가 변경하지 않은 화면의 일반 회귀

## 신규 파일

- `docs/dev-reports/2026-08-05-1062-r25-sol-reconvergence.md`

# PR #907 LUNA 5.6 라운드 fix 보고서

대상 브랜치: `feat/867-s7-order-merge-partner-first`

기준 SHA: `1f5910c4e`

작업 위치: `C:\dev\Samhan-Public\.claude\worktrees\s7-merge`

## 구현 요약

- `clients/desktop/src/renderer/routes/components/MergeConvertDialog.tsx`
  - 거래처 변경 시 주문 선택, 수량, 창고, 배송 필드, 충돌 확정값, 직접입력값, 오류 상태를 함께 초기화했습니다.
  - 후보 조회에 거래처 UUID exact filter를 추가하고, 모달 재진입 시 항상 최신 후보를 조회하도록 했습니다.
- `clients/desktop/src/renderer/routes/SalesPartnerOrderListPage.tsx`
  - 병합 성공 후 목록, 병합 후보, 정규화된 주문 상세 캐시를 무효화하도록 했습니다.
- `clients/desktop/src/renderer/api/sales.ts`
  - `partnerIdExact`를 FE 요청 계약과 query parameter에 추가했습니다.
- `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/web/dto/PartnerOrderListFilter.java`
  - exact 거래처 UUID 필드를 목록 filter에 추가했습니다.
- `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/web/PartnerOrderListController.java`
  - `partnerIdExact` query parameter를 Controller에서 전달하도록 했습니다.
- `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderQueryService.java`
  - native/JPA 후보 query에 exact UUID 조건을 적용했습니다.
- `services/partner-service/src/main/java/com/samhanair/logis/partner/repository/PartnerRepository.java`
  - 거래처 검색 query의 ESCAPE 절을 추가했습니다.
- `services/partner-service/src/main/java/com/samhanair/logis/partner/service/PartnerService.java`
  - 거래처 검색어의 `\\`, `%`, `_`를 LIKE 리터럴로 escape하고 JPQL/native query에 ESCAPE 절을 적용했습니다.
- `clients/desktop/src/renderer/api/mock.ts`
  - mock 거래처 검색이 실 BE와 같이 `partnerCode` 또는 `bizCode`를 부분검색하도록 맞췄습니다.
- `clients/desktop/src/renderer/routes/SalesPartnerOrderListPage.test.tsx`
  - 병합 성공 시 세 종류의 cache key가 무효화되는 회귀 테스트를 추가했습니다.
- `clients/desktop/src/renderer/routes/components/MergeConvertDialog.test.tsx`
  - exact UUID 후보 요청 계약 회귀 assertion을 추가했습니다.
- `services/partner-order-service/src/test/java/com/samhanair/logis/partnerorder/it/PartnerOrderListIT.java`
  - 동일 코드·상이 UUID 후보 격리 IT를 추가했습니다.
- `services/partner-service/src/test/java/com/samhanair/logis/partner/it/PartnerAdminControllerIT.java`
  - `%`·`_` 리터럴 검색 IT를 추가했습니다.
- `clients/desktop/playwright/907-sol-adversarial-live-qa/907-sol-adversarial-real-qa.spec.ts`
  - 결함 상태를 단언하던 R-2/R-3 스펙을 M-2/M-3/M-4 불변식 단언으로 반전하고, 실 서버 요청·payload·상태 전이를 계측했습니다.

추가된 작업 문서:

- `docs/superpowers/specs/2026-07-23-907-luna-round-fix-design.md` — 요구사항·불변식·검증 설계
- `docs/superpowers/plans/2026-07-23-907-luna-round-fix.md` — 구현·검증 plan
- `docs/qa/907-luna-round-2026-07-23/REPORT.md` — 본 라운드 결과 보고서

M-1은 후보 쿼리와 병합 가드가 동일한 `partner_id` UUID를 보도록 맞췄습니다. 후보 API가 `partnerCode`와 `partnerIdExact`를 함께 요구하고, SQL/JPA 양쪽에 `partner_id = :partnerIdExact` 조건을 적용합니다. `partner_id IS NULL` legacy 주문은 후보에서 제외되어 fail-closed가 유지됩니다. S7-2의 409 안전망과 S7-3 병합 로직 자체는 변경하지 않았습니다.

## M-1

### RED 원문

FE 계약 RED:

```text
expected spy called with ... partnerIdExact...
Received Object {includeDeleted:false, partnerCode:"PARTNER-A"}
1 failed
```

BE exact predicate 제거 후 RED:

```text
PartnerOrderListIT > list_merge_candidate_exact_partner_id_excludes_same_code_different_identity() FAILED
java.lang.AssertionError at PartnerOrderListIT.java:168
...
1 test completed, 1 failed
BUILD FAILED in 38s
```

초기 live adversarial 실행에서는 같은 `partner_code`·다른 UUID 주문이 후보에 함께 보이고 병합 시 409가 발생했습니다.

### fix 내용

`PartnerOrderListFilter.partnerIdExact`, Controller query parameter, QueryService native/JPA 조건을 추가했습니다. `MergeConvertDialog`는 선택 거래처 UUID를 후보 query key와 요청 parameter에 함께 전달하고, UUID와 코드가 모두 있을 때만 후보를 조회합니다.

### 뮤테이션 RED 출력

수정한 native/JPA exact predicate를 모두 제거한 뒤 focused IT를 다시 실행했습니다.

```text
PartnerOrderListIT > list_merge_candidate_exact_partner_id_excludes_same_code_different_identity() FAILED
java.lang.AssertionError at PartnerOrderListIT.java:168
...
1 test completed, 1 failed
BUILD FAILED in 38s
```

### 라이브 확인

실행 명령:

```text
GET http://localhost:8080/api/v1/partner-orders?partnerCode=CODEX-907-R1-20260723&partnerIdExact=<UUID-A>&includeDeleted=false
GET http://localhost:8080/api/v1/partner-orders?partnerCode=CODEX-907-R1-20260723&partnerIdExact=<UUID-B>&includeDeleted=false
```

관측값:

```text
selectedPartnerId=3c6b8aa8-7356-4f9c-ade0-c68e6976e113
selectedResult=2026/07/23-907R1A
total=1
otherPartnerId=46117302-a5e8-4c70-baed-a45f4e9d528a
otherResult=2026/07/23-907R1B
otherTotal=1
```

같은 코드의 서로 다른 UUID 주문이 서로의 후보에 섞이지 않았습니다. 양성 대조는 동일 UUID 주문 1건이 후보에 보이는 것이며, SOL 스펙에서도 legacy `partner_id IS NULL` 주문은 후보 0건으로 제외되었습니다. 실 브라우저 증거: [`03-거래처A-양성후보선택-legacy미노출.png`](./03-거래처A-양성후보선택-legacy미노출.png).

## M-2·M-3

### RED 원문

불변식 단언으로 반전한 직후 실행 결과입니다.

```text
1) ... Error: expect(locator).toBeDisabled failed
Expected: disabled
Received: enabled
Locator: getByTestId('merge-convert-submit')
... line 349
```

당시 outgoing body에는 A 거래처의 확정값이 남아 있었습니다.

```text
{"paymentDueLabel":"2026-08-12","memo":"SOL 충돌 메모 11"}
```

### fix 내용

`handlePartnerChange`에서 `selectedOrders`, `qtyMap`, `selectedWarehouse`, `shippingFields`, `customInputs`, `errorMessage`를 모두 초기화했습니다. 충돌 라디오 선택 수가 0이면 제출 버튼이 비활성화되는 기존 안전 조건을 유지하고, 거래처 변경 시 이전 거래처 충돌값이 새 payload에 도달하지 않게 했습니다.

### 뮤테이션 RED 출력

수정 중 reset을 `selectedOrders`만 초기화하도록 되돌린 뒤 live SOL을 실행했습니다.

```text
Error: ... toHaveCount(0)
Locator ... conflict-section ... radiogroup nth(1) ... input[type="radio"]:checked
Expected: 0 Received: 1
... line 345
```

### 라이브 확인

실행 명령:

```text
cd clients/desktop
$env:AUDIT_BASE_URL='http://localhost:5190'
node_modules\.bin\playwright.cmd test playwright/907-sol-adversarial-live-qa/907-sol-adversarial-real-qa.spec.ts --config=playwright.config.ts --workers=1
```

최종 관측값:

```text
[불변식] 거래처 B 전환 후 이전 거래처의 배송·충돌 확정값·직접입력값은 제출 payload에 도달할 수 없음
3 passed (23.9s)
```

거래처 B 전환 뒤 창고 placeholder, B 충돌 라디오 0건 선택, 직접입력 memo 빈값, 제출 disabled를 확인했습니다. 양성 대조로 A 거래처 충돌을 선택하고 직접입력값을 넣는 경로도 통과했습니다. 증거: [`07-거래처A-창고와충돌값확정.png`](./07-거래처A-창고와충돌값확정.png), [`08-거래처B-충돌값미선택-제출비활성-이전값초기화.png`](./08-거래처B-충돌값미선택-제출비활성-이전값초기화.png).

## M-4

### RED 원문

```text
2) ... Error: expect(locator).toBeVisible failed
Locator getByTestId('merge-convert-order-option-2026/07/23-907S3286845')
Expected visible, element not found
... line 457
```

모달을 닫았다가 다시 열었을 때 5분 staleTime 때문에 신규 주문 요청이 추가로 발생하지 않았습니다.

### fix 내용

병합 후보 query에 `staleTime: 0`, `refetchOnMount: 'always'`를 지정했습니다. 후보 key에도 선택 거래처 UUID를 포함하여 거래처 identity가 바뀐 query cache가 재사용되지 않게 했습니다.

### 뮤테이션 RED 출력

`staleTime: 0` 및 `refetchOnMount: 'always'`를 제거한 결함 상태에서 위와 같은 신규 후보 미노출 RED가 재현됐습니다.

```text
Expected visible, element not found
Locator getByTestId('merge-convert-order-option-2026/07/23-907S3286845')
... line 457
```

### 라이브 확인

최종 SOL 실행 출력:

```text
[계측] 모달 재진입 후보 요청=2
[캐시 GREEN] 최초 요청=1, 모달 재진입 요청=2로 신규 주문 노출, 전체 새로고침 누적 요청=3
[정리] throwaway 주문 2건 삭제
[원상 확인-캐시] 주문=0 / 라인=0
```

양성 대조로 전체 새로고침 후에도 신규 주문이 노출되고 누적 요청 수가 3회가 되는 것을 확인했습니다. 증거: [`09-재진입-신규주문즉시노출.png`](./09-재진입-신규주문즉시노출.png), [`10-양성대조-새로고침후새주문노출.png`](./10-양성대조-새로고침후새주문노출.png).

## M-5

### RED 원문

정규화된 상세 key가 아닌 raw 주문번호로 무효화하도록 뮤테이션한 focused test의 출력입니다.

```text
× ... 병합 성공 시 목록·후보·정규화된 주문 상세 키를 무효화한다
expected ... ['partner-order','2026-05-31-2']
Received ... 3rd call queryKey ['partner-order','2026/05/31-2']
Number of calls: 3
... line 283
```

### fix 내용

성공 callback에서 `partner-orders`, `partner-order-merge-candidates`를 무효화하고, 각 결과 주문번호를 기존 상세 조회와 동일한 `toOrderPathId(orderNo)`로 정규화한 뒤 상세 cache를 무효화하도록 했습니다.

### 뮤테이션 RED 출력

위 raw-key mutation을 적용한 상태에서 동일하게 실패했고, 정상화 후 focused test가 통과했습니다.

### 라이브 확인

병합 성공 callback에 대한 cache invalidation test는 `2026/05/31-2`가 `2026-05-31-2` key로 무효화되는 것을 확인했습니다. M-4 live 후보 재조회도 실제 서버에서 수행했습니다.

실제 부분 병합 API를 통해 잔여수량을 재조회하는 live 증명은 병합 후속 데이터 정리 범위가 별도로 필요해 이번 라운드에서는 실행하지 않았습니다. 따라서 이 항목의 실제 partial-merge live 확인은 PM 확인 필요 사항으로 남겼습니다. 증거 test는 `SalesPartnerOrderListPage.test.tsx`의 성공 callback cache assertion입니다.

## M-6

### RED 원문

기존 검색은 `ESCAPE` 절이 없어 `%`와 `_`를 wildcard로 처리했습니다.

```text
q=%25 → 200 total=55
q=_ → 200 total=55
```

### fix 내용

`PartnerService.escapeLikeLiteral`에서 백슬래시·퍼센트·밑줄을 순서대로 escape하고, PartnerRepository의 JPQL 및 native 검색/count query에 `ESCAPE '\\'`를 적용했습니다. 공유 검색 계약은 유지했습니다.

### 뮤테이션 RED 출력

escape helper를 `q.trim()`으로 되돌린 focused IT 결과입니다.

```text
PartnerAdminControllerIT > search_treats_percent_and_underscore_as_literal_characters() FAILED
java.lang.AssertionError at PartnerAdminControllerIT.java:306
1 test completed, 1 failed
BUILD FAILED
```

### 라이브 확인

실행 명령:

```text
GET http://localhost:8080/api/admin/partners?q=%25&page=0&size=20
GET http://localhost:8080/api/admin/partners?q=_&page=0&size=20
```

관측값:

```text
q=%25 total=1 items=CODEX-907-M6-%_
q=_ total=1 items=CODEX-907-M6-%_
```

양성 대조는 marker 거래처의 실제 코드 `CODEX-907-M6-%_`가 두 리터럴 검색에서 정확히 1건 반환되는 것입니다.

## SOL 스펙 반전 내역

- R-2의 `paymentDueLabel = '2026-08-12'` 단언을 제거하고, 거래처 B 전환 후 배송·충돌 확정값·직접입력값이 초기화되며 제출 버튼이 disabled인지 단언하도록 변경했습니다.
- R-2의 A memo 고정 단언을 제거하고, B 전환 후 직접입력 memo가 빈 문자열인지 단언하도록 변경했습니다.
- R-3의 stale cache 결함 재현 제목과 누락 기대를 제거하고, 모달 재진입에서 신규 후보가 visible하며 후보 요청 수가 2회인지 단언하도록 변경했습니다.
- R-1에서 legacy 주문이 병합 후보에 노출되지 않는 fail-closed 단언을 추가했습니다.
- HashRouter를 사용하도록 실 하네스 base URL을 `http://localhost:5190/#/sales/partner-orders`로 사용했습니다.

## 검증 실행 결과

- partner-order-service 테스트: `BUILD SUCCESSFUL in 4m 2s`
- partner-service 테스트: `BUILD SUCCESSFUL in 55s`
- FE Vitest: `Test Files 146 passed (146)`, `Tests 1167 passed (1167)`, `Duration 28.80s`
- mock 회귀 hard gate: `615 passed (615)`, 114 files, 4 workers, `3.2m`. 기본 1 worker 시도는 604초 timeout으로 종료되어 CLI `--workers=4`로 재실행했고 전량 통과했습니다.
- typecheck: 기존 범위 밖 `src/renderer/routes/SlipFormPage.tsx`의 `LineDraft`/`LineRow`/`LineTableHeaderProps` 타입 오류 16건으로 실패했습니다. 이번 변경 파일과 무관하며 수정하지 않았습니다.
- `git diff --check`: 통과
- tracked PNG diff: 0건

BE 재배포:

```text
.\gradlew.bat :services:partner-order-service:bootJar :services:partner-service:bootJar -x test --no-daemon --console=plain
BUILD SUCCESSFUL in 13s
```

워크트리 jar를 메인 트리 jar로 복사한 뒤 두 파일의 SHA-256이 각각 일치함을 확인했고, 다음 overlay로 image build 및 force recreate했습니다.

```text
docker compose -f infrastructure/docker-compose.yml -f infrastructure/docker-compose.local-all.yml -f infrastructure/docker-compose.no-host-ports.yml build partner-order-service partner-service
docker compose -f infrastructure/docker-compose.yml -f infrastructure/docker-compose.local-all.yml -f infrastructure/docker-compose.no-host-ports.yml up -d --force-recreate --no-deps partner-order-service partner-service
```

두 컨테이너 healthy 및 `/app/app.jar` timestamp `2026-07-23 20:22`를 확인한 뒤 live SOL 3건을 재실행하여 `3 passed (23.9s)`를 얻었습니다. 전용 renderer는 5190에서 실행했고 최종 점검 시 5190 listener만 유지했습니다.

## throwaway 정리 확증 (SQL 출력)

R-1:

```text
BEGIN
DELETE 0
DELETE 0
DELETE 2
DELETE 2
COMMIT
DELETE 0
DELETE 0
DELETE 2
orders=0
lines=0
partners=0
```

M-6:

```text
DELETE 0
DELETE 0
DELETE 1
post-cleanup=0
```

SOL live R-2/R-3:

```text
[정리] throwaway 주문 2건 삭제
[원상 확인] 주문=0 / 라인=0
[정리] throwaway 주문 4건 삭제
[원상 확인-충돌] 주문=0 / 라인=0
[정리] throwaway 주문 2건 삭제
[원상 확인-캐시] 주문=0 / 라인=0
```

공유 실데이터는 수정·삭제하지 않았습니다.

## 재생성된 스크린샷 목록 (PM 이 원복 처리)

새 증거는 모두 [`docs/qa/907-luna-round-2026-07-23`](.) 아래에 있습니다.

- `01-주문목록-실서버.png`
- `02-거래처선택전-주문후보없음.png`
- `03-거래처A-양성후보선택-legacy미노출.png`
- `04-거래처B전환-A선택제거-B양성후보.png`
- `05-새로고침후-선택상태초기화.png`
- `06-뒤로가기복귀-선택상태미잔존.png`
- `07-거래처A-창고와충돌값확정.png`
- `08-거래처B-충돌값미선택-제출비활성-이전값초기화.png`
- `09-재진입-신규주문즉시노출.png`
- `10-양성대조-새로고침후새주문노출.png`

## 미해결 · PM 확인 필요

- typecheck의 기존 16건 오류는 이번 라운드 범위 밖입니다.
- M-5는 cache invalidation focused test와 M-4 live 재조회까지 확인했으나, 실제 부분 병합 성공 API 후 잔여수량을 다음 조회에서 확인하는 live 시나리오는 후속 정리 계획 확인 후 실행해야 합니다.
- 변경 사항은 커밋하지 않았습니다. 커밋·push·PR 갱신은 PM이 대행해야 합니다.

# PR #984 R3 SOL 적대검증 리뷰 — 도달성

- 검증일: 2026-07-30
- 대상: `fix/ecount-import-model-code-merge`
- 대상 HEAD: `76af7f871`
- 질문: **이 PR이 바꾼 표면 전체에서 실 사용자 경로로 재현 가능한 결함이 있는가?**
- 판정: **있음 — 실사용 도달 결함 2건, 증거 무결성 불일치 1건**
- 게이트 판정: **차단**

## 조사 방식과 안전 경계

메인 리뷰어를 포함한 5개 역할로 병합 입력, 대표품목 판정·시트 순서, 다운스트림, 실패 원자성, 마이그레이션·증거를 나누어 조사했다. 동시 실행 슬롯은 최대 4개였으므로 완료된 역할 자리에 다음 역할을 투입했다.

- 공유 `product_db`는 기본적으로 읽기 전용으로 조사했다.
- 전표 수락 실요청에 사용한 고정 UUID throwaway 전표·라인·재고 인스턴스는 요청 직후 정확한 키로 삭제했고 최종 잔재는 각각 0건이었다.
- 실패 원자성은 throwaway DB `product_984_sol_r3_pf_20260730`와 별도 HEAD bootJar, 허용 포트 `5195`로만 재현했다. 종료 후 Java PID, 포트 리스너, DB와 임시 로그가 모두 없음을 확인했다.
- Docker 스택은 재배포하지 않았다.
- R2의 실 파일 2회 임포트는 반복하지 않았다. 기존 응답 원문, 파일 해시, DB 상태를 읽기 전용으로 대조했다.
- git 쓰기(`add/commit/push/checkout`)는 하지 않았다.

## 각도별 판정

| 각도 | 판정 | 도달성 근거 |
|---|---|---|
| 1. 잘못된 병합 입력 | **확정 결함 0 / 일부 판정불가** | 실 raw 2,836행과 활성 SHEET 행에서 서로 다른 품목을 하나로 합치는 충돌을 찾지 못했다. 대소문자만 다른 한 쌍의 실제 물리적 동일성은 원천 근거가 없어 판정불가다. |
| 2. `resolveMainCandidate` 5단계 | **결함 1건** | 대표로 선택된 코드가 기존 DB 규칙과 달라진 실 raw 행은 0건이었지만, 후보 결정 실패를 전체 실패가 아닌 HTTP 200 그룹 누락으로 바꾼 경로에서 24개 실 품목코드가 조회 불가능하다. |
| 3. 계보 컬럼과 sync 순서 | **결함 1건** | `sync → import`는 SHEET 정본을 보존하지만 `import → sync → import`는 ECOUNT 계보·이름과 `usageScope=NONE`에 고정된다. |
| 4. 다운스트림 | **정상 병합 726건 통과** | 726/726 `lookup-by-code` HTTP 200, 실제 전표 수락 HTTP 200 및 재고 `AVAILABLE → RESERVED`. 단, 결함 1의 누락 코드 24/24는 HTTP 404다. |
| 5. 중간 실패 부분 반영 | **결함 0** | 격리 실요청의 두 번째 행에서 alias 충돌 409를 유도했으며 첫 번째 행의 product·alias·staging까지 모두 rollback됐다. |
| 6. V27·V28 번호 충돌 | **결함 0** | 원격 head 24개와 열린 PR 7개의 migration tree를 대조했다. 다른 열린 브랜치의 V27/V28 점유는 없었다. |
| 증거 무결성 | **불일치 1건** | 최종 R2 핵심 수치와 해시는 재현됐지만, 이전 R4 보고서의 “raw 원본 존재 확인” 출력은 0개를 보여 주면서 3개를 사용했다고 서술한다. |

## 실사용 도달 결함

### [HIGH-1] 후보 결정 실패 12그룹을 HTTP 200으로 건너뛰어 실 품목코드 24개가 조회 불가능하다

**실 사용자 경로**

시스템 마스터가 이카운트 품목 임포트 화면에서 실 CSV 3종을 업로드한다. 응답은 HTTP 200이다. 이후 재고·전표 경로가 임포트된 이카운트 `productCode`로 품목을 조회한다.

**재현 절차**

1. R2의 실제 첫 번째 및 두 번째 임포트 응답 원문을 확인한다. 두 응답 모두 HTTP 200이고 `skippedGroupCount=12`다.
2. 응답의 12개 그룹에 포함된 24개 `rawCode`를 추출한다.
3. 공유 DB에 읽기 전용으로 각 코드의 활성 `products.product_code`, `products.model_name`, `product_aliases.alias_code` 존재 여부를 대조한다.
4. R4로 실행 중인 product-service에 각 코드를 `POST /products/internal/lookup-by-code`로 실요청한다.

**관측된 잘못된 결과**

- 12개 그룹, 24개 raw 품목행이 정상 응답 아래 `SKIPPED_MAIN_CANDIDATE`로 누락됐다.
- 24개 코드의 활성 `product_code` 일치 0건, alias 일치 0건, model name 일치 0건이었다.
- `lookup-by-code` 실요청은 **24/24 HTTP 404**였다. 예: `AAAA-00008`, `ZENG-00009`, `00131`, `SAR-00006`.
- 대조 품목 `AJ012BN1PBC2`는 같은 요청에서 HTTP 200이었다.
- 따라서 “대표 후보가 모호하다”는 행 단위 상태가 관리자에게 HTTP 200 성공으로 반환된 뒤, 재고·전표 사용자는 유효한 이카운트 품목코드를 사용할 수 없다.

**파일:행 근거**

- `services/product-service/src/main/java/com/samhanair/logis/product/service/EcountProductImporter.java:96-123` — 사전 후보 판정에서 `MIG2_NO_MAIN_CANDIDATE`를 잡아 그룹으로 수집
- `services/product-service/src/main/java/com/samhanair/logis/product/service/EcountProductImporter.java:141-148` — 같은 이름의 행을 전부 `SKIPPED_MAIN_CANDIDATE`로 표시하고 계속 진행
- `services/product-service/src/main/java/com/samhanair/logis/product/service/EcountProductImporter.java:250-285` — 현재 5단계 후보 판정과 fail-closed 예외
- `services/product-service/src/main/java/com/samhanair/logis/product/web/ProductInternalController.java:132-145` — 실제 코드 조회 요청
- `services/product-service/src/main/java/com/samhanair/logis/product/service/ProductService.java:218-225` — 활성 `product_code`가 없으면 `NOT_FOUND`
- `services/inventory-service/src/main/java/com/samhanair/logis/inventory/client/ProductClient.java:147-173` — inventory-service의 실제 `lookup-by-code` 의존 경로
- `docs/qa/984-ecount-import-live/R2-REPORT.md:93,101,129` — 두 HTTP 200 응답의 12개 누락 그룹 원문

### [HIGH-2] ECOUNT-first 모델은 시트 sync 후에도 SHEET 정본으로 수렴하지 않아 견적·주문 목록에서 사라진다

**실 사용자 경로**

1. `products.ecount-import` 권한 관리자가 아직 시트에 없는 신규 모델을 이카운트 CSV로 먼저 임포트한다.
2. 담당자가 같은 모델을 Google Sheet의 홈멀티 탭에 추가하고 `products.sync` 권한 관리자가 수동 sync를 실행한다.
3. 관리자가 이카운트 CSV를 다시 임포트한다.
4. 데스크톱 견적품목 화면 또는 거래처 주문 품목 목록에서 해당 모델을 찾는다.

**재현 절차**

공유 DB를 쓰지 않고 임시 PostgreSQL에 Flyway V1~V28을 적용한 뒤, 실제 service 코드를 사용한 격리 IT로 같은 한 모델에 대해 두 순서를 실행했다.

1. 대조군: `sheet sync → ECOUNT import → sheet sync`
2. 실험군: `ECOUNT import → sheet sync → ECOUNT 재import`
3. 두 흐름의 최종 `name`, `lineage`, `productCategory`, `usageScope`, exposure와 productCode를 대조한다.

**관측된 잘못된 결과**

| 실행 순서 | 요청 결과 | 최종 상태 |
|---|---|---|
| sync → import → sync | `inserted=1`, `updated=1`, `unchanged=1` | `name=시트 정본명`, `lineage=SHEET`, `productCategory=HOME_MULTI`, `usageScope=BOTH` |
| import → sync → 재import | `imported=1`, sync `updated=1`, 재import `updated=1` | `name=이카운트 재임포트명`, `lineage=ECOUNT`, `productCategory=NULL`, `usageScope=NONE` |

- 실험군에도 HOME_MULTI exposure는 생성되지만 `usageScope=NONE`이라 데스크톱 견적품목 화면의 필터에서 제외된다.
- 거래처 주문 API는 `usageScope=PARTNER_ORDER`를 요청하고 저장소 쿼리가 `NONE`을 제외하므로 주문 품목 목록에도 나오지 않는다.
- 일반 품목관리 목록에는 ECOUNT 재임포트 이름으로 남는다. 즉 같은 모델이 최초 실행 순서에 따라 화면별로 보이거나 사라지고, 사용자 표시 이름도 달라진다.
- 격리 시험 결과는 2 tests / 0 failures였으며 임시 test source와 컨테이너를 삭제했다.

**파일:행 근거**

- `services/product-service/src/main/java/com/samhanair/logis/product/web/EcountProductImportController.java:23-44` — 관리자 multipart 임포트 경로
- `services/product-service/src/main/java/com/samhanair/logis/product/web/ProductAdminController.java:50-72` — 관리자 시트 sync 경로
- `services/product-service/src/main/resources/db/migration/V28__add_product_lineage.sql:37-60` — ECOUNT 신규 행을 `lineage=ECOUNT`로 고정하는 INSERT trigger
- `services/product-service/src/main/java/com/samhanair/logis/product/service/EcountProductImporter.java:388-429` — 일반 conflict 분기가 `name=EXCLUDED.name`으로 재덮음
- `services/product-service/src/main/java/com/samhanair/logis/product/service/EcountProductImporter.java:438-467` — 병합 경로는 `lineage=SHEET`만 허용
- `services/product-service/src/main/java/com/samhanair/logis/product/service/ProductSheetSyncService.java:1246-1325` — 기존 ECOUNT 행은 신규 `seedFromSheet` 분기에 들어가지 않고, category 불일치로 분류·usage 갱신을 건너뜀
- `services/product-service/src/main/java/com/samhanair/logis/product/service/ProductSheetSyncService.java:1343` — 위 상태에서도 exposure는 생성
- `services/product-service/src/main/java/com/samhanair/logis/product/domain/Product.java:404-419` — SHEET-first 신규 행만 SHEET 계보·분류·usage를 받음
- `clients/desktop/src/renderer/routes/EstimateItemsCatalogPage.tsx:1194-1214` — 견적품목 화면이 `usageScope=NONE`을 제거
- `clients/web/order-app/src/samhanApi.ts:193-199` — 거래처 주문이 `PARTNER_ORDER` 품목만 요청
- `services/product-service/src/main/java/com/samhanair/logis/product/repository/ProductRepository.java:200-221` — `PARTNER_ORDER`/`ESTIMATE` 조회에서 `NONE` 제외

## 각도별 상세 근거

### 1. 잘못된 품목 병합 여부

실 CSV를 파싱한 결과는 품목 2,836행, 관계 155행, 그룹 58행이었다.

- raw 품목코드 exact 중복: 0
- 대소문자, 모든 공백 제거, 괄호 전각/반각, NFKC 및 결합 정규화 후 서로 다른 raw 코드 충돌: 각각 0
- 관계 alias 한 개가 서로 다른 main을 가리키는 경우: 0
- 그룹 코드 한 개가 서로 다른 이름을 갖는 경우: 0
- 활성 SHEET의 동일 exact model name 복수 행: 0
- raw code와 활성 SHEET model name의 exact 교집합: 726
- 위 726건 중 `product_code=model_name` 병합 완료: 726

raw 코드에는 소문자 포함 8건, 앞뒤 공백 1건, ASCII 괄호 2건이 있었으나 fullwidth 괄호와 NFKC 변화는 0건이었다. importer의 실제 비교도 tab 제거와 양끝 strip 뒤 대소문자·유니코드 정규화 없는 exact 비교다.

`SI-AL600a` raw와 `SI-AL600A` SHEET 쌍은 확인했지만 두 표기가 같은 물리 품목인지 다른 품목인지 제조사·시트 원천 근거가 없다. 현재 lowercase 요청은 HTTP 200, uppercase 요청은 HTTP 404다. 이는 **판정불가**이며 서로 다른 물건을 하나로 합친 확정 결함으로 집계하지 않았다.

근거:

- `shared/common/src/main/java/com/samhanair/logis/common/ecount/EcountCsvSupport.java:132-153`
- `services/product-service/src/main/java/com/samhanair/logis/product/service/EcountProductImporter.java:438-467`

### 2. `resolveMainCandidate` 불변식

코드 구조는 불변이 아니다. PR은 전체 행 사전 해결 pass와 raw 승인 규칙을 추가했고 raw 규칙을 DB 동명 후보보다 먼저 실행한다. 다만 실 raw 2,836행과 현재 DB를 read-only로 대조한 결과, 대표 코드 자체가 달라지는 사례는 찾지 못했다.

- 새 raw 규칙 도달: 783행 (`EXACT=739`, `PAREN=44`)
- 기존 DB 후보와 다른 대표 선택: 0
- DB ambiguity를 새 raw 규칙이 가린 경우: 0
- raw 규칙을 제외했을 때 DB 단계 도달: 1,747행
- 그중 single DB 후보: 1,447행
- DB 코드가 raw/fallback 결과와 다른 경우: 0
- 시트 sync 전·후 DB 상태 때문에 실제 입력의 대표 결과가 달라지는 경우: 0

따라서 “대표로 뽑힌 코드”의 도달 결함은 0이다. 다만 실패 처리 의미가 전체 실패에서 성공 응답 아래 그룹 누락으로 달라져 [HIGH-1]에 도달했다.

### 3. 계보 전용 컬럼의 독자와 순서

런타임에서 `lineage`를 판정에 사용하는 경로는 ECOUNT importer의 `lineage='SHEET'` SQL 한 곳뿐이다. 시트 sync와 다른 서비스는 계보를 읽지 않는다. 이 비대칭 때문에 ECOUNT-first 행은 SHEET로 전환되지 않으며 [HIGH-2]가 발생한다.

현재 공유 DB는 `SHEET=1,119`, `ECOUNT=1,929`, `MANUAL=1` 활성 행이다. 현재 데이터는 R2의 `sync → import` 726건만 포함하므로 반대 순서는 격리 DB에서 검증했다.

### 4. 다운스트림 도달성

정상 병합된 726개 SHEET 품목을 R4 product-service의 `POST /products/internal/lookup-by-code`로 전수 호출했다.

- HTTP 200: 726/726
- 실패: 0
- 응답 UUID가 DB UUID와 다른 경우: 0
- `serialManaged=true`: 726/726

`AJ012BN1PBC2`에 대한 inventory-service FIFO와 recall 조회는 모두 HTTP 200이었다. 재고가 없는 reserve-batch 대조 요청은 과거의 `productCode 필수` 400이 아니라 정상적인 “재고 부족” HTTP 409에 도달했다.

고정 UUID throwaway 전표·라인·stock instance로 전표 수락을 실요청한 결과:

- 응답 HTTP 200
- 전표 `SENT → ACCEPTED`
- 동일 `product_code=AJ012BN1PBC2`의 stock instance `AVAILABLE → RESERVED`
- 다른 품목과 잘못 매칭된 수: 0

정리 후 throwaway 전표·라인·stock instance는 각각 0건이고 제품 집계는 전후 동일하다.

### 5. 실패 원자성과 부분 반영

throwaway DB에서 다음 실요청을 수행했다.

1. 충돌 seed: 대표 `PF984-BLOCKER`와 alias `PF984-BLOCKER`, `PF984-COLLISION`을 임포트 — HTTP 200, products 1, aliases 2.
2. 실패 파일: 첫 행 `PF984-FIRST`를 정상 신규 반영한 뒤 두 번째 행 `PF984-COLLISION`을 새 대표로 재매핑.
3. 두 번째 행에서 HTTP 409, `MIG2_ALIAS_DUPLICATE`, `sourceRowNo=2`를 관측.

| 대상 | 실패 직전 | 실패 직후 |
|---|---:|---:|
| products | 1 | 1 |
| product_aliases | 2 | 2 |
| item staging | 2 | 2 |
| relation staging | 1 | 1 |
| group staging | 0 | 0 |
| alias staging | 2 | 2 |

실패 파일 hash의 staging 행은 0건이고, 첫 행 `PF984-FIRST`의 product·public alias·staging alias도 모두 0건이었다. 기존 `PF984-COLLISION` alias의 target은 `PF984-BLOCKER`로 보존됐다. 실제 중간 실패 뒤 잔재는 없다.

근거:

- `services/product-service/src/main/java/com/samhanair/logis/product/service/EcountProductImporter.java:55-56` — `REQUIRES_NEW` transaction
- `services/product-service/src/main/java/com/samhanair/logis/product/service/EcountProductImporter.java:61-71` — staging 선기록
- `services/product-service/src/main/java/com/samhanair/logis/product/service/EcountProductImporter.java:125-168` — 행 순차 처리
- `services/product-service/src/main/java/com/samhanair/logis/product/service/EcountProductImporter.java:520-559` — alias 충돌 예외
- `services/product-service/src/main/java/com/samhanair/logis/product/service/EcountProductImporter.java:596-698` — staging 기록·상태 갱신

### 6. 마이그레이션 번호

`git ls-remote --heads origin`으로 원격 head 24개를 열거하고 각 SHA에 대해 product-service migration 경로를 `git ls-tree`로 읽었다. tree 조회 실패는 0이었다. `gh pr list` 기준 열린 PR 7개도 별도로 대조했다.

- V27/V28을 함께 가진 ref: 현재 `fix/ecount-import-model-code-merge`, 같은 PR #984 계열의 `wip/984-r4-product-lineage-unverified`
- 다른 열린 PR #991, #993, #994, #997, #998: 최고 V26
- 열린 PR #996: 최고 V29이나 V27/V28 파일 없음

따라서 다른 열린 작업과 V27/V28 파일명 충돌은 없다. 같은 #984의 WIP ref는 별도 기능 브랜치 충돌로 집계하지 않았다.

## 증거 무결성 대조

### 재현된 최종 R2 증거

R2 실 임포트를 재실행하지 않고 원문 파일과 현재 R4 상태를 대조했다.

| 항목 | 대조 결과 |
|---|---|
| 품목 raw | 313,221 bytes, SHA-256 `02785A731FCC502D8828ADA534DF103DC79BFDBB67D84A7142825AA323CE083C` |
| 관계 raw | 15,632 bytes, SHA-256 `00A1964DF081FEDB1EAF270ED0110345E1F856531EB630210F6E5BA7867DE85` |
| 그룹 raw | 4,710 bytes, SHA-256 `4955F2999017F37511AF3ADE552113FA30C0628B081D6B992F7D171A7CC1` |
| 1·2회차 응답 | 각 4,415 bytes, SHA-256 동일, byte-equal |
| DB pre·post1·post2 | 각 1,060 bytes, SHA-256 동일, byte-equal |
| 현재 DB | products 3,049 / product_code 보유 2,655 / aliases 2,811 / 중복 product_code 0 |
| migration | V28 `add product lineage`, `success=t` |
| AJ012 품목명 | raw 전·1회·2회 이름 보존, 현재도 동일 |
| 726 snapshot | 1·2 snapshot 각 726, membership/name/category 차이 각각 0 |
| 배포물 | 현재 jar hash가 R2 로컬 build jar와 동일, 이미지 digest `sha256:44d94868dc02463cec4d2d021f27a343807eca842ed216e9011c2882705d146c` 동일 |

최종 `R2-REPORT.md`의 핵심 수치와 입력 파일 hash에는 불일치를 찾지 못했다.

### [EVIDENCE-1] 이전 R4 보고서의 “raw 원본 존재 확인” 출력과 사용 주장이 서로 모순된다

이 항목은 실사용 도달 결함이 아니라 허용된 예외인 증거 무결성 결함이다.

**재현 절차**

1. `docs/dev-reports/2026-07-29-984-r4-product-lineage-verification.md`의 “raw 원본 존재 확인” 명령과 출력을 읽는다.
2. host와 container의 디렉터리 출력에 지정 CSV 3개가 있는지 센다.
3. 바로 다음 사용 주장과 비교한다.

**관측된 잘못된 결과**

- 보고서가 원문으로 제시한 host/container 출력에는 `.gitkeep`만 있고 raw CSV는 **0개**다.
- 같은 보고서는 곧바로 “위 3개 raw 파일을 읽기 전용으로 사용했다”고 적고 상대 경로로 1·2회차 import 명령을 제시한다.
- 즉 제시된 “원본 존재 확인” 출력만으로는 3개 파일 사용 주장을 재현할 수 없고, 출력의 실측 수치 0개와 서술의 3개가 다르다.
- 이후 최종 R2가 `t9-984` 실 파일과 메인 트리 원본의 SHA-256을 대조한 결과는 이번 라운드에서도 재현됐다. 그러므로 이 불일치는 최종 R2 해시 판정을 뒤집지 않지만, 이전 R4 보고서의 해당 원문 증거는 무결하지 않다.

**파일:행 근거**

- `docs/dev-reports/2026-07-29-984-r4-product-lineage-verification.md:16`
- `docs/dev-reports/2026-07-29-984-r4-product-lineage-verification.md:294-320`
- `docs/dev-reports/2026-07-29-984-r4-product-lineage-verification.md:354-361`
- `docs/qa/984-ecount-import-live/R2-REPORT.md:58-69`

## 이 라운드가 보지 않은 것

다음은 결함 0으로 간주하지 않는다.

- `SI-AL600a`와 `SI-AL600A`가 실제 같은 제조사 품목인지 여부: 제조사 원장과 현재 Google Sheet 원본을 확보하지 못해 판정불가다.
- 현재 공유 DB의 활성 `stock_instances`가 0건이어서, 기존 운영 stock row의 장기 보존 여부는 판정하지 않았다. 대신 새 throwaway stock instance의 전표 수락 경로만 검증했다.
- Google API에서 실제 시트 행을 추가·수정하는 외부 vendor 구간은 실행하지 않았다. 순서 의존성은 동일 sync service와 격리 DB의 실제 V1~V28 스키마로 재현했다.
- AWS/RDS 운영 환경과 운영 브라우저 세션은 조사하지 않았다. 검증 대상은 로컬 R4 Docker 서비스와 격리 프로세스였다.
- Issue #1000 소관인 순번코드→모델명 전환(슬라이스 2~5)은 조사하지 않았다.
- 선재 gateway `/admin/products/**` 404는 조사·집계하지 않았다.
- 테스트 강도, mock·guard 누락, 문서 표현 품질, 범위 밖 서비스의 일반 품질은 의도적으로 조사하지 않았다. 문서는 오직 원문·실측 수치의 증거 무결성만 대조했다.


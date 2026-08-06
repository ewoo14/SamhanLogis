# PR #984 R7 SOL 최종 재수렴 적대검증

- 대상 PR: `#984`
- 대상 브랜치: `fix/ecount-import-model-code-merge`
- 검증 HEAD/PR head: `94dc40aace6a0c2feb172ebfe9553a5b3f7bc8d0`
- 방식: 총 5 agents(주 agent 1 + subagents 4) 병렬 조사. 동시 슬롯 4 제한으로 4개 동시 조사 후 완료 슬롯에 독립 red-team 1개를 이어 실행하고 결과를 재수렴
- 검증 원칙: 코드·git·공유 DB write·Docker 배포/중단 없음

## 최종 판정

**BLOCK — 머지 불가.**

실 사용자 경로로 재현 가능한 결함이 있다. 결정적인 차단 사유는 신규 fail-closed guard가 ECOUNT 주문의 `품목명[규격]` 전체 라벨과 품목코드 alias 사이의 기존 계약 차이를 전건 fatal로 바꾼 것이다.

현재 공유 DB와 실제 read-only resolver 응답을 교차하면:

| 항목 | 결과 |
|---|---:|
| 활성 PENDING | 26,055행 |
| 주문 | 3,489건 |
| distinct `item_name` | 474개 |
| resolver가 exact 해소한 라벨 | 16/474 |
| 해소 행 | 193/26,055 |
| 미해소 행 | 25,862/26,055 |
| 모든 라인이 해소되는 주문 | **0/3,489** |
| 신규 guard가 거부하는 주문 | **3,489/3,489** |
| 생성되는 주문/라인 | **0/0** |

CI가 green이어도 현재 실 PENDING 주문을 하나도 이식하지 못하므로 머지 조건을 충족하지 않는다.

---

## 결함

### [HIGH-1] 정상 활성 품목 주문 3,489건이 전체 라벨 exact alias 조회 때문에 전부 거부된다

**실 사용자 경로**

관리자가 ECOUNT `주문서-Excel다운로드`를 재import한 뒤 `POST /admin/ecount/reimport/mig-8`을 실행한다. 주문 importer는 CSV의 `품목명[규격]` 전체 문자열을 `item_name`으로 저장하지만, product-service resolver는 품목 importer가 만든 품목코드 alias만 exact 조회한다. 신규 guard는 주문에 미해소 라인이 하나라도 있으면 주문 그룹 전체를 `MIG8_LOOKUP_MISS`로 거부한다.

**재현 절차**

1. `accounting_db.staging.ecount_order_raw`에서 활성 `PENDING`의 `order_no`, `item_name` 전량을 read-only 조회했다.
2. `product_db.staging.ecount_item_alias`를 활성 Product와 JOIN한 alias 전량을 read-only 조회했다.
3. 실제 read-only `/products/internal/resolve-ecount-aliases`에 현재 474개 라벨을 배치 요청했다.
4. 응답 key를 현재 Java 계약과 같은 trim 후 대소문자 구분 exact 방식으로 PENDING 행에 결합했다.
5. `order_no`별로 한 라인이라도 miss가 있는지 집계했다.
6. `ensureProductAliasesResolved`와 `rejectGroup`의 무조건 분기로 쓰기 없이 후결과를 산출했다.

**관측된 잘못된 결과(숫자)**

- 실제 resolver 응답: 해소 `16/474`, 미해소 `458/474`
- 행 기준: 해소 `193/26,055`, 미해소 `25,862/26,055`
- 완전 해소 주문: `0/3,489`
- 주문 그룹 거부: `3,489/3,489`
- staging 거부 결정값: `26,055/26,055`
- `orders`/`order_lines` INSERT 결정값: `0/0`
- 첫 토큰이 활성 품목코드/alias와 일치하는 정상 라벨은 `459/474`, `25,776/26,055행`이다. 삭제 품목이나 임의 쓰레기 값이 아니라 대부분 정상 품목 라벨이다.
- 예: `AJ072BN1PBC1 [홈-WIFI 모델] [​]`, `PC1NWSK3NW (WIFI판넬) [​]`은 첫 토큰의 활성 Product가 존재하지만 전체 라벨 exact alias가 아니어서 miss다.

`AR-EC05` 자체는 정상 활성 alias로 해소되지만 같은 결함을 피하지 못한다.

| `AR-EC05` 범위 | 결과 |
|---|---:|
| exact 해소 라인/주문 | 160행 / 160주문 |
| 해당 160개 주문의 전체 라인 | 1,140행 |
| 함께 들어 있는 full-label miss | 980행 |
| 거부 주문 | **160/160** |
| 거부 라인 | **1,140/1,140** |

**파일:행 근거**

- CSV 헤더 `품목명[규격]`과 전체 라벨 저장: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/EcountOrderImporter.java:29-32,49-65,104-130,146-156`
- 관리자 MIG-8 command 등록: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/EcountReimportService.java:406-419`
- 모든 PENDING 조회: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/Mig8OrderTransformService.java:50-62,226-236`
- 전체 `itemName`을 resolver에 전달: 같은 파일 `:118-132`
- 한 라인 miss로 주문 전체 거부: 같은 파일 `:64-69,106-114,432-437`
- exact map lookup: 같은 파일 `:474-495`
- exact `alias_code IN (:codes)`와 활성 Product JOIN: `services/product-service/src/main/java/com/samhanair/logis/product/service/EcountAliasResolveService.java:20-49`
- 품목 importer가 `row.code()`를 alias로 저장: `services/product-service/src/main/java/com/samhanair/logis/product/service/EcountProductImporter.java:183-201,564-603`

이 판정은 Issue #1000의 괄호 앞 코드 전환이나 원본 병합 해결책을 검토한 것이 아니다. 이 PR이 기존 nullable lookup 계약을 fatal로 바꾼 현재 결과만 판정했다.

### [HIGH-2] resolver의 일시 장애가 부분 반영과 영구 REJECTED를 만든다

**실 사용자 경로**

product-service가 일시적으로 5xx/timeout인 동안 운영 cron 또는 관리자가 MIG-8을 실행한다. `ProductAliasClient`는 인증 오류 외의 HTTP/네트워크 실패를 빈 map으로 바꾼다. 신규 guard는 이를 실제 alias miss와 구분하지 않고 해당 주문을 `REJECTED`로 확정한다. 서비스가 회복되어도 정상 재시도는 이 행을 읽지 않는다.

**재현 절차**

1. 활성 exact alias만 가진 PENDING 주문을 준비한다.
2. alias batch의 한 HTTP chunk에 5xx/timeout을 발생시킨다.
3. 나머지 chunk는 정상 응답시킨다.
4. 같은 MIG-8 endpoint를 다시 실행한다.
5. 동일 원본을 다시 import한다.

**관측된 잘못된 결과(숫자)**

- 현재 26,055행 실행에서 resolver 전체 장애가 한 번 발생하는 경우의 결정값: imported/updated `0`, REJECTED `26,055`
- 서비스 회복 후 재실행 대상: `0행`; 결과는 `MIG8_STAGING_ROW_NOT_FOUND`
- 동일 raw 재import: 기존 `(source_file_hash, source_row_no)`와 충돌해 `DO NOTHING`; `REJECTED → PENDING` 복구 `0건`
- client chunk 크기는 200이다. 201개 서로 다른 활성 exact alias 주문에서 첫 chunk만 실패하면 코드상 `200건 REJECTED + 1건 반영`이 같은 실행에 commit된다. 실패한 200건의 다음 정상 재시도 대상은 `0건`이다.

**파일:행 근거**

- 200개 chunk 및 부분 응답 누적: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/client/ProductAliasClient.java:28,44-59`
- 5xx/timeout을 빈 map으로 변환: 같은 파일 `:62-85`
- 빈 map을 실제 lookup miss로 처리: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/Mig8OrderTransformService.java:103-143`
- 주문 그룹별 예외를 잡고 다음 그룹 계속 처리: 같은 파일 `:50-80`
- PENDING만 재시도 대상으로 조회: 같은 파일 `:226-236`
- 기존 staging 행 재import는 `DO NOTHING`: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/EcountOrderImporter.java:104-130`

### [HIGH-3] 정상 운영 endpoint가 거부 수만 보이고 무엇이 왜 거부됐는지 버린다

**실 사용자 경로**

관리자가 R6의 정상 운영 경로인 `POST /admin/ecount/reimport/mig-8`을 실행한다. 직접 transform 결과에는 제한된 sample이 있지만 reimport wrapper가 이를 버리고 count만 반환한다. 예외가 아니므로 실행 상태와 운영 metric은 `PROCESSED`/`SUCCESS`로 기록된다.

**재현 절차**

1. HIGH-1의 현재 PENDING 상태로 reimport endpoint 결과 구성 경로를 추적했다.
2. `EcountMig8TransformResult.samples`가 `EcountReimportResult`로 전달되는지 확인했다.
3. reimport run 상태와 desktop 운영 dashboard의 reject 표시를 추적했다.
4. staging의 `reject_reason`과 정상 관리자 API/UI 노출 경로를 비교했다.

**관측된 잘못된 결과(숫자)**

현재 HIGH-1 경로의 정상 HTTP 200 응답은 다음 값으로 수렴한다.

- `totalRejected=26055`
- `details[order-transform].status=PROCESSED`
- `details[order-transform].imported=0`
- `details[order-transform].rejected=26055`
- `details[order-transform].message=null`
- `errors=[]`
- reimport run metric: `SUCCESS`

직접 transform 결과도 sample은 최대 20개뿐이며 wrapper에서 전부 폐기된다. dashboard의 reject 집계는 현재 경로에서 `MIG8_LOOKUP_MISS=20`, `UNSPECIFIED=26,035`가 된다. R6의 160행 fixture라면 `20 + 140`이다. 관리자는 거부 건수는 볼 수 있지만, 정상 endpoint 응답과 dashboard에서는 어떤 품목·행이 왜 거부됐는지 알 수 없다. 상세 사유는 DBA가 staging을 직접 SELECT해야만 확인된다.

**파일:행 근거**

- 직접 결과의 사유 생성: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/Mig8OrderTransformService.java:106-114,432-437`
- sample 최대 20개: `shared/common/src/main/java/com/samhanair/logis/common/ecount/EcountMig8TransformResult.java:52-70`
- command 성공 branch가 count와 null message만 전달: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/EcountReimportService.java:175-195,559-560`
- errors가 없으면 reject 수와 무관하게 SUCCESS: 같은 파일 `:129-136`
- 운영 endpoint: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/EcountReimportController.java:19-41`
- sample 외 나머지를 `UNSPECIFIED`로 집계: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/EcountMigMetricsSupport.java:105-122,177-195`
- dashboard는 error code와 count만 표시: `clients/desktop/src/renderer/routes/accounting/admin/MigOpsDashboardPage.tsx:139-159`
- HTTP non-2xx만 실패로 보는 운영 예시: `docs/migration/ECOUNT-CUTOVER-GUIDE.md:1216-1225,1244-1252`

### [HIGH-4] 동시 시트 sync 경로에서는 삭제 UUID가 다시 저장될 수 있다

**실 사용자 경로**

한 관리자가 MIG-8을 실행하는 동안 다른 관리자가 같은 활성 품목을 시트에서 제거하고 `지금 동기화`를 누른다.

**재현 절차**

1. accounting이 활성 alias를 resolve해 UUID map을 받는다.
2. 응답 직후 product-service 시트 sync가 그 Product를 soft-delete하고 commit한다.
3. accounting이 이미 받은 map으로 주문 라인을 INSERT한다.

**관측된 잘못된 결과(숫자)**

- line INSERT 전 Product 활성 상태 재검증: `0회`
- 서비스 간 lock/version 검증: `0회`
- 활성 exact alias 한 라인 주문의 위 interleaving 결정값: 삭제 UUID 저장 `1/1`
- AR-EC05만 있는 160개 단일 라인 fixture라면 삭제 UUID 저장 결정값: `160/160`

현재 공유 PENDING은 HIGH-1 때문에 완전 해소 주문이 `0/3,489`이므로 이 경합을 공유 실데이터 write 없이 직접 관측할 수는 없었다. 그러나 HIGH-1을 제거한 정상 exact-alias 주문에서는 resolver 응답과 line INSERT 사이에 재검증이 없어 위 순서가 그대로 도달 가능하다.

**파일:행 근거**

- 활성 상태 확인은 resolver SELECT 시점 한 번뿐: `services/product-service/src/main/java/com/samhanair/logis/product/service/EcountAliasResolveService.java:20-49`
- 정상 시트 soft-delete: `services/product-service/src/main/java/com/samhanair/logis/product/service/ProductSheetSyncService.java:1140-1144,1362-1389`
- resolve map을 실행 전체에서 한 번 만들고 재사용: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/Mig8OrderTransformService.java:50-67,118-143`
- line INSERT는 cache UUID를 재검증 없이 사용: 같은 파일 `:314-360,474-495`

---

## 각도별 판정

### 1. fix가 정상 경로를 막는가

**FAIL.**

- 활성 exact alias 자체는 정상 해소된다.
- 외부 공백은 trim된다. ` 00022 `은 `00022`와 같은 UUID로 해소됐다.
- 같은 활성 Product를 가리키는 `00022`, `00027`, `EG-SOU05M`은 `3/3` 같은 UUID로 해소됐다.
- 공유 DB의 다중 alias target은 167개, target당 최대 3개다.
- staging/public alias target 불일치는 `0/2,835`, deleted/dangling target은 `0/2,835`다.
- lowercase `eg-sou05m`은 exact 계약대로 miss다. 현재 PENDING의 casefold-only 해소 후보는 `0건`이므로 대소문자만으로 발생한 별도 실 결함은 확인하지 않았다.
- alias/order의 바깥 공백 데이터도 현재 `0건`이다.

그러나 전체 라벨 계약 불일치 때문에 정상 활성 품목 주문 `3,489/3,489`가 거부된다. exact alias의 개별 정상 동작이 사용자 주문 경로의 정상 동작을 보장하지 않는다.

### 2. 거부가 조용하지 않은가

**FAIL.**

거부 count는 보이지만 원인·행·품목은 정상 reimport 응답에서 소실된다. `HTTP 200`, `PROCESSED`, `SUCCESS`, `errors=[]`, `message=null` 아래 `26,055건`이 빠진다. 이는 이 PR이 고치려던 “HTTP 200 아래 조용한 누락”을 거부 쪽에서 반복한다.

### 3. 부분 반영과 트랜잭션 경계

**FAIL.**

- 한 주문 그룹은 alias guard를 line upsert 전에 통과해야 하므로 그룹 내부는 all-or-none이다.
- 메서드 전체는 `REQUIRES_NEW` 단일 transaction이다.
- 다만 예상 `BusinessException`을 주문 그룹별로 내부에서 catch하므로 거부 그룹과 성공 그룹이 함께 commit된다.
- 잡히지 않은 SQL/runtime 예외는 전체 transaction을 rollback한다.
- resolver가 chunk별 실패를 빈 map으로 바꾸므로 서로 다른 alias 주문은 같은 실행에서 부분 성공·부분 영구 거부될 수 있다.
- 현재 공유 PENDING은 `3,489/3,489`가 guard에서 막혀 실제 성공 부분은 `0건`이다.
- 현재 `AR-EC05` 160개 주문도 companion miss 980행 때문에 성공 `0/160`, 거부 `160/160`이다.

### 4. R6 결함의 실 경로가 사라졌는가

**순차 7단계는 PASS, 동시 실행은 FAIL.**

R6의 7단계를 그대로 대조했다.

1. Google Sheet에서 활성 `AR-EC05` 행 제거
2. 관리자가 `지금 동기화` 실행
3. Product 1건 soft-delete commit
4. `/admin/ecount/reimport/mig-8` 실행
5. resolver가 활성 Product JOIN 때문에 삭제 UUID를 반환하지 않음
6. partner-order MIG-8 이식 실행
7. 삭제 UUID 기반 downstream lookup miss 확인

순차 경로의 결정값:

- resolver가 반환하는 삭제 UUID: `0`
- accounting에 저장되는 삭제 UUID: `0`
- 새 accounting 주문/라인: `0/0`
- partner-order로 넘어가는 삭제 UUID 주문: `0`
- 대신 accounting에서 해당 160개 주문 그룹의 `1,140/1,140행`이 HIGH-1로 REJECTED

따라서 R6이 지적한 **순차 경로의 삭제 UUID 저장은 소멸했다.** 그러나 resolver 응답 뒤 시트 sync가 commit되는 동시 실행에는 write-time 재검증이 없어 HIGH-4가 남는다.

### 5. 신규 IT가 기존 테스트를 오염시키는가

**PASS — 오염 재발 없음.**

- 신규 IT에 `@DirtiesContext`가 없다.
- Testcontainers 전용 datasource를 사용한다.
- 고유 prefix를 쓰며 `@BeforeEach`/`@AfterEach` 모두 alias를 먼저 삭제한 뒤 Product를 정리한다.
- repo 전체에서 해당 prefix 사용처는 신규 IT 한 곳이다.
- 공유 운영 DB sentinel은 Product `0`, staging alias `0`이다.
- product-service 전체 재실행은 `63 suites / 630 tests / failures 0 / errors 0 / skipped 0`이다.
- 신규 IT 단독은 `2/2`, failure/error/skip `0`이다.

근거:

- 전용 Testcontainers datasource: `services/product-service/src/test/java/com/samhanair/logis/product/it/AbstractPostgresIT.java:23-55`
- 고유 fixture와 전·후 cleanup: `services/product-service/src/test/java/com/samhanair/logis/product/it/EcountAliasResolveServiceIT.java:27-29,43-50,103-106`
- controller IT의 transaction/flush: `services/product-service/src/test/java/com/samhanair/logis/product/it/ProductInternalControllerIT.java:53-56,272-289`

### 6. 증거 무결성

**CI와 핵심 DB 수치는 일치한다. 변경량 인용 1건은 불일치한다.**

| 증거 | R7 재대조 |
|---|---|
| local HEAD | `94dc40aace6a0c2feb172ebfe9553a5b3f7bc8d0` |
| PR head | local HEAD와 exact 일치 |
| exact SHA check-runs | **42/42 SUCCESS**, failure 0, pending 0, exact head SHA 42, 고유 name 42 |
| GitHub merge metadata | `MERGEABLE`, `CLEAN` — 기능 판정과 별개 |
| product-service 전체 | 630 tests, failures 0, errors 0, skipped 0 |
| accounting-service 전체 | 1,684 tests, failures 0, errors 0, skipped 10 |
| 신규 IT sentinel | Product 0 / staging alias 0 |
| `AR-EC05` Product | 활성 1 / 삭제 0 |
| `AR-EC05` staging alias | 활성 target 1 |
| `AR-EC05` PENDING | 160행 / 160 order_no |
| accounting 전체 PENDING | 26,055행 / 3,489 order_no |
| R4 대상 alias | 24/24 |
| R4 동명 그룹 | 12그룹, 그룹별 1행 |
| R4 target source hash skip | 0 |

전체 suite XML은 검토 시작 시 `630/0/0/0`, `1684/0/0/10`으로 대조했다. 이후 이번 라운드의 focused 재실행이 로컬 XML을 product `2/2`, accounting `20/20` 결과로 덮어썼다. 둘 다 failure/error/skip 0이다. exact-SHA 전체 판정은 GitHub의 42/42와 검토 시작 시 전체 XML을 기준으로 했다.

기존 R3/R4 증거 문서와 현재 DB를 교차한 결과:

- lookup-by-code `24/24 HTTP 200`, `skippedGroupCount 0`
- alias 24개, 12그룹 각 1행, 2차 import 멱등
- lookup `726/726`, 실 전표 수락 `HTTP 200`, 재고 `AVAILABLE → RESERVED`
- 중간 실패 rollback

R3의 전표·재고·rollback은 이번 fix가 건드리지 않은 이미 확인된 범위이므로 사용자 지시대로 다시 write 실행하지 않고 기존 증거와 변경 diff만 대조했다.

`git diff --numstat HEAD^ HEAD`의 exact 변경량은 6파일, `+400/-5`다. 기존 파일 변경 합계 `+65/-5`는 인용과 일치한다. 다만 “신규 2파일 합계 `+332/-0`” 인용은 실제와 다르다.

- 신규 dev report: `+227`
- 신규 `EcountAliasResolveServiceIT`: `+108`
- 신규 2파일 합계: **`+335/-0`**

이는 기능 결함은 아니지만 증거 무결성 수치 불일치다.

---

## R6 결함의 경로 소멸 여부

- **순차 운영 경로:** 삭제 UUID 저장 `0` — 소멸 확인
- **현재 실 주문의 정상 이식:** `0/3,489` — 새 HIGH-1로 전건 차단
- **동시 sync/transform:** 삭제 UUID write-time 재검증 `0회` — HIGH-4 잔존

R6 증상 하나를 막았지만 정상 이식 성공으로 수렴하지 않았고, 동시 실행 경계도 닫히지 않았다.

## 이 라운드가 보지 않은 것

- 본 R7 산출물 외 코드·문서 수정, git add/commit/push/checkout
- 공유 DB write, 실제 재import·시트 sync·partner-order 이식 실행
- Docker 재배포·중단
- 게이트웨이 `/admin/products/**` 404
- Issue #1000의 코드 규칙 전환·이카운트 원본 병합
- 동명 병합·결정성 되돌리기
- 이미 PASS한 마이그레이션 순서 재검증
- R3의 726 lookup·전표·재고·rollback write 재실행
- 새 이슈 등록·브랜치 생성

## 머지 가능 여부

**명시적 최종 판정: PR #984는 현재 머지하면 안 된다.**

최소 차단 조건은 HIGH-1 해소와 HIGH-3의 운영자 원인 가시성 복구다. HIGH-2의 transient failure/재시도 및 HIGH-4의 resolve 이후 soft-delete 경쟁도 삭제 UUID와 영구 거부를 다시 만들 수 있으므로 함께 닫혀야 한다.

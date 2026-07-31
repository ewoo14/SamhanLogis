# PR #1003 기능 회귀 검토 보고서 — Issue #1001 거래처별 원장

- 검토 일자: 2026-07-31
- 검토 역할: 기능 회귀 검토자(구현 변경 없음)
- 대상 브랜치: `feat/1001-partner-ledger-spec`
- 검증 대상 HEAD: `92adeec557f03324272bc186746fe947d1884e10`
- 검토 커밋: 슬라이스 1 `5fc3c27ad05b84c2492bf5995df39fbe84652228`, 슬라이스 2 `92adeec557f03324272bc186746fe947d1884e10`

## 최종 판정 — BLOCK

머지 게이트 3개 중 2개가 충족되지 않았다.

| 머지 게이트 | 판정 | 근거 |
|---|---|---|
| ① 실 사용자 경로로 재현 가능한 오작동 0 | **실패** | 배포 전 생성된 거래처 주문 발행의 멱등 키로 동일 본문을 재시도하면 정상 replay 대신 `CONFLICT`가 발생했다. 검토용 exact-HEAD 서비스 경로 재현은 **1/1회 실패**, 공유 DB의 노출된 활성 키는 **16개(단건 13, 병합 3)**다. |
| ② CI green(exact SHA) | 통과 | PR #1003 head가 exact SHA와 일치했고 `gh pr checks 1003`의 모든 check가 성공했다. |
| ③ 라이브QA 실서버 실행 | **실패(미실행)** | 현재 공유 Docker 서비스는 다른 트랙의 이미지이며 exact SHA가 배포되지 않았다. PR 기록에도 슬라이스 1·2 라이브QA 미실행이 명시되어 있다. 금지 조건에 따라 이미지 재빌드·서비스 재기동은 하지 않았다. |

따라서 다른 항목이 정상이더라도 현재 상태로는 머지할 수 없다.

## 발견한 기능 회귀

### BLOCK-1. 배포 전 발행의 동일 멱등 재시도가 정상 replay 대신 409가 된다

#### 실 사용자 경로

거래처 주문을 단건 또는 병합 전환해 전표를 발행한 뒤, 응답 유실·호출자 재시도·outbox 재처리 등으로 같은 `Idempotency-Key`와 같은 업무 본문을 다시 보내는 경로다.

- 단건: `POST /api/v1/slips/from-partner-order`
- 병합: `POST /api/v1/slips/from-orders-merge`
- 기존 계약의 기대 결과: 같은 키 + 같은 본문이면 기존 전표를 **200 OK replay**
- 관측 결과: 배포 전 알고리즘으로 저장된 지문과 새 알고리즘의 지문이 달라져 `BusinessException(CONFLICT)`가 발생하며 HTTP 계약상 **409**가 된다.

#### 재현 절차

1. 공유 `slip_db.slip_publish_audit`를 읽기 전용으로 조회했다.

   ```powershell
   docker exec samhan-postgres psql -U samhan -d slip_db -At -F '|' -c "SELECT count(*) FILTER (WHERE is_deleted=false), count(*) FILTER (WHERE is_deleted=false AND request_fingerprint IS NOT NULL), count(DISTINCT idempotency_key) FILTER (WHERE is_deleted=false), count(*) FILTER (WHERE is_deleted=false AND idempotency_key LIKE 'PO-MRG-%'), count(*) FILTER (WHERE is_deleted=false AND idempotency_key NOT LIKE 'PO-MRG-%') FROM slip_publish_audit WHERE source_type='PARTNER_ORDER';"
   ```

   결과는 `16|16|16|3|13`이었다.

2. `92adeec55^`의 기존 단건 지문 입력과 exact HEAD의 입력을 같은 무주소 요청으로 계산했다. 기존 구현에는 `deliveryAddress` 키 자체가 없고, 새 구현은 값이 `null`이어도 키를 넣는다.

   - 기존 지문: `b7687cf2d9c7580c1f8902e724a170aefa46d88b5f1980b40508b7e6c0e3a46c`
   - 새 지문: `ce7807252fb9ba8d4581a376e7a1eae68d6fb5e9c5a9fbe1cea097dade3d217c`
   - 동일 여부: `false`

3. exact HEAD의 `SlipPublishService`에 기존 지문을 가진 기존 전표·감사행을 제공하고, 배송주소가 없는 동일 요청과 동일 키를 다시 전달하는 검토용 임시 probe를 실행했다. 임시 소스는 결과 확인 후 삭제했고 추적 파일로 남기지 않았다.

   ```powershell
   .\gradlew.bat :services:slip-service:test --tests com.samhanair.logis.slip.publish.Pr1003LegacyFingerprintProbeTest --rerun-tasks --console=plain
   ```

   probe는 새 지문이 기존 지문과 다르다는 이유로 `동일 Idempotency-Key 로 다른 본문이 도착했습니다` 예외가 발생하는 것을 확인했고 `BUILD SUCCESSFUL`로 끝났다. 이 성공은 잘못된 `CONFLICT` 발생을 단정한 검토 assertion이 충족됐다는 뜻이다.

#### 관측된 잘못된 결과(숫자)

- 동일 키·동일 업무 본문의 기대 `CONFLICT`: **0건**
- 직접 재현된 `CONFLICT`: **1/1건**
- 공유 DB에서 기존 지문을 보유한 활성 거래처 주문 발행 키: **16개**
  - 단건 키: **13개**
  - 병합 키: **3개**
- 직접 실행한 것은 단건 재시도 1건이며, 병합 3개 키는 동일한 strict 비교와 같은 종류의 지문 키 추가에 노출된 수치다.

#### 파일:행 근거

- 기존 키가 있으면 새 지문으로 strict 비교: `services/slip-service/src/main/java/com/samhanair/logis/slip/publish/SlipPublishService.java:197-204`
- 불일치 시 `CONFLICT` 발생: 같은 파일 `586-595`
- 병합 지문에 새 키를 무조건 추가: 같은 파일 `778-792`, 특히 `787`
- 단건 지문에 새 키를 무조건 추가: 같은 파일 `810-823`, 특히 `817`
- HTTP 단건 경로와 replay 응답 계약: `services/slip-service/src/main/java/com/samhanair/logis/slip/web/SlipPublishController.java:124-133`
- HTTP 병합 경로와 replay 응답 계약: 같은 파일 `165-175`

## 첫 번째 각도 — 핵심 업무 흐름 회귀 조사

### 1. 배송주소 입력 경계와 발행 차단 수

exact HEAD의 실제 발행 DTO에 적용되는 Bean Validation으로 누락, 빈 문자열, 501자, 특수문자를 각각 실행했다.

```powershell
.\gradlew.bat :services:slip-service:test --tests com.samhanair.logis.slip.publish.Pr1003AddressBoundaryProbeTest --rerun-tasks --console=plain
```

관측 출력은 다음과 같았다.

```text
주소 경계 차단 수: 누락=0, 빈문자열=0, 501자=1, 특수문자=0
```

| 입력 | 차단 수 | 판정 |
|---|---:|---|
| 필드 누락/null | 0 | 주소 부재 자체는 기존 발행을 막지 않음 |
| 빈 문자열 | 0 | 기존 호출 호환 |
| 501자 | 1 | DTO와 DB가 모두 최대 500자이므로 계약상 경계 차단이며 기능 회귀로 판정하지 않음 |
| 특수문자 포함 주소 | 0 | 정상 수용 |

단, 위의 누락 입력도 **기존 멱등 키 재시도**와 결합하면 BLOCK-1의 지문 불일치로 1/1회 막혔다. 따라서 보고서의 “주소 부재로 신규 차단 0건”은 단순 신규 요청 경계에는 맞지만, 기존 발행 재시도까지 포함한 “발행 차단 0건”으로 일반화할 수 없다.

파일 근거는 단건 DTO `services/slip-service/src/main/java/com/samhanair/logis/slip/publish/PublishFromPartnerOrderRequest.java:27-42` 및 병합 DTO `PublishFromOrdersMergeRequest.java:41-56`이며, 양쪽 `deliveryAddress`는 각각 `36`, `51`에서 `@Size(max = 500)` 선택값이다.

### 2. V14가 기존 데이터와 조회를 깨뜨리는지

SQL 원문은 다음 동작만 한다.

- `partner_orders.delivery_address VARCHAR(500)` nullable 컬럼 추가
- `NOT NULL` 없음
- `DEFAULT` 없음
- 값 검증용 별도 제약 없음
- 인덱스 없음
- 기존 행 `UPDATE`/backfill 없음

근거: `services/partner-order-service/src/main/resources/db/migration/V14__add_partner_order_delivery_address.sql:1-7`.

따라서 V14 적용 시 기존 행은 새 컬럼 값이 `NULL`이 되며 기존 컬럼 값은 바뀌지 않는다. JPA 필드도 nullable 매핑이다(`services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/domain/PartnerOrder.java:100-102`).

공유 DB 읽기 결과는 다음과 같다.

- `partner_orders`: **2,021행**, 활성 **2,021행**
- 현재 공유 DB에 `delivery_address` 컬럼: **없음**
- 이 검토 중 공유 DB 기존 행 변경: **0건**

공유 DB는 V14 미적용 상태이므로 exact 마이그레이션의 실DB 적용·잠금·배포 호환은 라이브로 보지 않았다. 다만 SQL 정적 조사와 격리 테스트의 V14 적용에서는 기존 조회를 깨뜨리는 제약을 찾지 못했다.

### 3. 과거 revision의 새 필드 부재

공유 DB의 과거 snapshot을 읽기 전용으로 전수 집계했다.

```powershell
docker exec samhan-postgres psql -U samhan -d partner_order_db -At -F '|' -c "SELECT count(*), count(*) FILTER (WHERE snapshot::jsonb ? 'deliveryAddress'), count(*) FILTER (WHERE NOT (snapshot::jsonb ? 'deliveryAddress')) FROM partner_order_revisions;"
```

- 전체 revision: **2,003건**
- `deliveryAddress` 키 있음: **0건**
- 새 키 없음: **2,003건**

실 사용자 읽기 경로 `GET /api/v1/partner-orders/{주문ID}/revisions/1`을 기존 공유 서버에서 권한 헤더와 함께 호출해 **HTTP 200**을 확인했다. 이어 exact HEAD에서 새 키가 없는 legacy snapshot JSON을 역직렬화하고 복원하는 실제 서비스 경로를 실행했다.

```powershell
.\gradlew.bat :services:partner-order-service:test --tests 'com.samhanair.logis.partnerorder.revision.service.PartnerOrderRevisionServiceTest$RestoreTests.restore_draftOrder_headerAndLinesRestored' --rerun-tasks --console=plain
```

결과는 `BUILD SUCCESSFUL`이었다. 관측된 읽기·복원 실패는 **0건**이다. snapshot record는 새 필드가 없으면 `null`로 받고(`PartnerOrderSnapshot.java:48-66`), legacy 생성자도 명시적으로 `null`을 전달한다(`68-87`). 복원은 역직렬화 후 그 값을 헤더에 넘긴다(`PartnerOrderRevisionService.java:228-238`, `627-634`).

공유 서버는 exact SHA가 아니므로 위 HTTP 200만으로 새 버전 라이브QA를 대신하지 않았다. exact HEAD의 누락 필드 복원 경로와 실 데이터의 누락 형태를 함께 확인한 결과, 과거 revision 호환 회귀는 관측하지 못했다.

### 4. 서로 다른 배송주소의 병합 전환

서로 다른 주소를 가진 주문 2건을 exact HEAD의 주소 해소 로직에 전달해 다음 세 경우를 실행했다.

```powershell
.\gradlew.bat :services:partner-order-service:test --tests com.samhanair.logis.partnerorder.service.Pr1003MergeAddressProbeTest --rerun-tasks --console=plain
```

```text
상이 주소 병합 결과: 무선택 차단=1, 조용한 폐기=0, 명시 선택 전달=1
```

- 사용자가 주소를 선택하지 않음: **1건 차단**
- 어느 한 주소를 조용히 버림: **0건**
- 요청에서 주소를 명시 선택: **1건 그대로 전달**

주소 해소는 idempotency key 계산과 reserve 전에 수행된다(`PartnerOrderMergeConvertService.java:175-180`). 명시 선택값이 우선하고, 선택이 없을 때 서로 다른 정본 주소가 둘 이상이면 `INVALID_INPUT`을 던진다(`265-282`). 따라서 조용히 하나를 버리는 동작은 관측하지 않았다.

## 두 번째 각도 — 슬라이스 1 상태 필터와 UUID

### 실 데이터 포함·제외 수

공유 `slip_db`에서 활성 `OUTBOUND` 전표와 활성 라인을 읽기 전용으로 집계했다.

| 상태 | 문서 | 라인 | 원장 포함 여부 |
|---|---:|---:|---|
| ACCEPTED | 6 | 22 | 제외 |
| CANCELED | 55 | 65 | 제외 |
| COMPLETED | 7 | 17 | 포함 |
| CONFIRMED | 4 | 10 | 포함 |
| DELIVERED | 10 | 35 | 포함 |
| DRAFT | 2,160 | 2,369 | 제외 |
| INSPECTING | 5 | 12 | 제외 |
| PROCESSING | 7 | 21 | 제외 |
| REJECTED | 7 | 19 | 제외 |
| SAVED | 12 | 29 | 제외 |
| SENT | 21 | 45 | 제외 |
| SHIPPING | 5 | 15 | 제외 |
| **합계** | **2,299** | **2,658** | 포함 **21문서/62라인**, 제외 **2,278문서** |

구현자 보고의 **21문서 / 62라인 포함, 2,278문서 제외**와 일치했다. 포함 상태 상수는 `SlipInternalController.java:74-78`, 실제 조회 조건은 `SlipRepository.java:80-94`에 있다.

### 제외 문서가 원장에 실려야 하는지

사용자가 확정한 정책인 `CONFIRMED`·`DELIVERED`·`COMPLETED`만 거래 사실 문서로 싣는 기준에 따르면, 제외 2,278건 중 해당 상태인데 빠진 문서는 **0건**이다.

주의해서 본 집단은 `SENT` 21건이다. 이 중 `source_type=PARTNER_ORDER`는 **12건**이다. 거래처 주문 발행 전표는 발행 직후 `SENT`이고 이후 업무 상태 전이를 기다리는 문서이므로, 현재 확정된 3상태 정책에서는 제외된다. 상태 머신은 `Slip.java:38-44`, 거래처 주문 전표의 발행 직후 `SENT` 불변 설명은 `Slip.java:1173-1180`에 있다. 이 12건을 포함시키는 정책 변경은 이번 판정에 넣지 않았다.

### UUID 노출

새 응답 record의 헤더 필드는 `slipNo`, `slipDate`, `status`, `partnerCode`, `partnerName`, `deliveryAddress`, `lines`뿐이며 라인도 품목명·모델명·수량·부가세 포함 단가·품목 금액뿐이다. UUID 필드는 **0개**다.

- 응답 계약: `services/slip-service/src/main/java/com/samhanair/logis/slip/web/dto/PartnerLedgerSalesResponse.java:10-39`
- entity 변환: 같은 파일 `48-68`
- endpoint: `services/slip-service/src/main/java/com/samhanair/logis/slip/web/SlipInternalController.java:361-383`

exact SHA가 공유 서버에 배포되지 않았으므로 실제 HTTP JSON 캡처는 하지 않았고, 정적 응답 계약과 exact-HEAD 실행 결과로 확인했다.

## 세 번째 각도 — 두 변경이 연 새 표면 전체

`git show --numstat 5fc3c27ad`와 `git show --numstat 92adeec55`의 전체 목록을 확인했다.

### 슬라이스 1

새 운영 표면은 다음 3개로 한정된다.

1. `GET /internal/slips/partner-ledger-sales` 라우트와 3상태·날짜·거래처코드 입력 처리
2. 활성 `OUTBOUND` 전표와 라인을 조회하는 별도 repository query
3. UUID 없는 전표·품목 read projection

기존 `/internal/slips/outbound-lines` 코드는 변경하지 않았다. 나머지 변경 파일은 개발 보고서와 새 계약 검증 파일이다.

### 슬라이스 2

운영 표면 전체는 다음과 같다.

1. 주문 확정 요청 → 주문 entity의 nullable `deliveryAddress`
2. 주문 수정 시 미전달은 기존값 유지, 전달값은 snapshot 갱신
3. 주문 상세 응답의 새 필드
4. 단건 전환 payload의 주소 전달
5. 병합 전환의 주소 선택·충돌 처리와 병합 payload 전달
6. revision snapshot 저장·역직렬화·복원
7. Flyway V14 nullable 컬럼
8. slip-service 단건·병합 발행 DTO, 전표 저장, 멱등 지문

이 중 기능 회귀는 8번의 **기존 지문과의 하위 호환 부재**에서 재현됐다. 나머지 표면에서는 이 라운드의 실행 범위 안에서 실 사용자 오작동을 관측하지 않았다.

### PR #991의 `SlipPublishService.java` 중첩

PR #991 head `64946d67b600587da4bb8f73811733a0280c5e5c`의 patch와 비교했다.

- PR #991: `resolveLines`, `canonicalLine`, `ResolvedLines.toEntityLines`를 수정해 품목 분류·부가세 포함 가격을 다룬다.
- PR #1003: `publishFromPartnerOrder`, `publishFromOrdersMerge`, `computeMergeFingerprint`, `computeFingerprint(PublishFromPartnerOrderRequest)`를 수정해 배송주소를 저장·지문에 넣는다.
- **동일 메서드를 직접 수정하지는 않는다.** 다만 같은 파일의 인접한 fingerprint 영역을 건드리므로 병합 시 두 의미를 모두 보존해야 한다.
- PR #991의 `canonicalLine` 변경도 fingerprint 입력을 바꾸므로, BLOCK-1의 “배포 전 지문 하위 호환” 관점은 두 PR 통합 순서에서도 별도로 유지해서 확인해야 한다.

## 네 번째 각도 — 보고서 수치 재현

| 항목 | 구현자 보고 | 재현 결과 | 판정 |
|---|---:|---:|---|
| 원장 포함 문서 | 21 | 21 | 일치 |
| 원장 포함 라인 | 62 | 62 | 일치 |
| 기존 전표 배송주소 값 있음 | 0 | 0 | 일치 |
| 상태 필터 제외 문서 | 2,278 | 2,278 | 일치 |
| partner-order-service 테스트 | 483 | 483, 실패 0·오류 0·건너뜀 0 | 일치 |
| slip-service 테스트 | 1,510 | 1,510, 실패 0·오류 0·건너뜀 0 | 일치 |
| 주소 부재 때문에 신규 발행 차단 | 0 | 누락 0, 빈 문자열 0 | 일치 |
| 전체 검토 입력의 발행 차단 | 0으로 일반화 | 501자 1, **기존 멱등 재시도 1/1** | 불일치 |
| 공유 DB 기존 행 변경 | 0 | 0 | 일치 |

전체 서비스 테스트는 다음 명령으로 exact HEAD에서 다시 실행했다.

```powershell
.\gradlew.bat :services:partner-order-service:test --rerun-tasks --console=plain
.\gradlew.bat :services:slip-service:test --rerun-tasks --console=plain
```

- partner-order-service: `BUILD SUCCESSFUL`, **483개**
- slip-service: `BUILD SUCCESSFUL`, **1,510개**

추가 수치 불일치가 하나 있다. 슬라이스 2 보고서 `165`행은 “기존 2,342건”이라고 적었지만, 같은 보고서 `109`행과 2026-07-31 공유 DB 재조회는 모두 `partner_orders` **2,021건**이다. 이는 기능 회귀 판정 근거로 삼지는 않았지만 수치 불일치로 기록한다.

## CI 및 라이브QA 확인

- `git rev-parse HEAD`: `92adeec557f03324272bc186746fe947d1884e10`
- `gh pr view 1003`의 head: exact SHA 일치
- `gh pr checks 1003`: 모든 check 성공
- 공유 `samhan-slip-service`, `samhan-partner-order-service`: 다른 작업 트랙 이미지로 실행 중
- exact SHA 라이브 서버: 미실행
- Docker 이미지 재빌드·서비스 재기동·공유 DB 쓰기: 수행하지 않음

즉 CI gate는 통과했지만 라이브QA gate는 충족되지 않았다. 기존 공유 서버에서 과거 revision GET을 1회 확인한 것은 exact SHA 라이브QA로 세지 않았다.

## 이 라운드가 보지 않은 것

다음은 **내가 보지 않은 범위**다.

1. exact SHA를 실제 서버에 배포한 뒤의 전체 HTTP 라이브QA. 금지된 Docker 재빌드·재기동 없이 수행할 수 없었다.
2. 공유 DB에 V14를 실제 적용했을 때의 DDL lock 시간, 배포 중 구버전·신버전 동시 접근, 운영 rollback. 공유 DB 쓰기를 하지 않았다.
3. 서로 다른 주소 병합의 exact-SHA 전체 HTTP 요청부터 전표 DB 저장까지의 라이브 실행. 서비스의 실제 주소 해소 경로는 실행했지만 서버 전체 경로는 보지 않았다.
4. 기존 **병합** 멱등 키 3개의 실제 재요청. 단건은 1/1회 직접 재현했고, 병합은 코드와 기존 키 수만 확인했다.
5. PR #991의 기능 전체. `SlipPublishService.java` 중첩과 메서드·의미 충돌 여부만 비교했다.
6. 운영/AWS 데이터와 실제 사용자 계정·권한 조합.
7. 슬라이스 3·4·5의 회계 통합 원장 API, 데스크톱 화면·CSV, 실제 인쇄. 이들은 계획상 후속 범위이므로 부재를 결함으로 판정하지 않았다.

## 변경 보존 확인

검토 과정에서 제품 코드는 고치지 않았다. 검토용 임시 probe 소스 3개는 실행 후 삭제했고, 최종 추적 변경은 이 보고서뿐이다. git commit·index·branch·원격에는 쓰지 않았다.

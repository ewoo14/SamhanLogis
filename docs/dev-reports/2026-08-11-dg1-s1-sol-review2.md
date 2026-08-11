# D-G1 S1 SOL 5.6 재검토 2차

검토일: 2026-08-11  
대상: PR #1165 S1 head `f9476d28dfafdb5649c77845b7f0754e13954bb0` / `accounting-service`  
판정: **PASS — 차단 결함 0건**

## 1. PM 판정

직전 차단 결함 `SOL-S1-01`은 닫혔다.

- `findByDocumentNo(null / blank)`는 repository 진입 전에
  `BusinessException(ErrorCode.INVALID_INPUT)`으로 종료된다.
- 문서번호 입력을 선택 필터로 받는 목록 조회나 “비우면 전체 조회” production 경로는 없다.
- 유효 번호와 앞뒤 공백이 붙은 유효 번호는 같은 CONFIRMED 정산서를 회수한다.
- 신규 V97 테이블에는 배포 전 기존 행이 없고, production 생성 경로는 공백 없는 채번 번호만
  저장하므로 `trim()`이 기존 정상 저장값을 잃게 만드는 도달 경로도 없다.
- 번호 채번 제거 뮤테이션은 실제 PostgreSQL 왕복 테스트를 RED로 만들었다.
- 최신 원격 `main`의 accounting migration 최대값은 V96이므로 V97은 여전히 `+1`이다.
- 복원 상태 강제 전체 suite가 0 failure/error로 완주했다.

코드 결함과 별개로 LUNA 보고의 전체 테스트 수 `1,624`는 이번 강제 실행 산출물과 맞지 않는다.
Gradle HTML과 217개 XML의 `tests` 합계는 **1,841**이다. 실패 판정에는 영향이 없는 비차단 증거
정정이며, `1,841 - 1,624 = 217`이 XML suite 수와 정확히 같지만 LUNA의 집계 스크립트가 없으므로
원인을 단정하지 않는다.

## 2. 첫 각도 — 차단이 정상 경로를 막는가

### production 호출 좌표 전수

다음 검색을 저장소 전체 production/test에서 수행했다.

```text
findByDocumentNo(
findByDocumentNoAndIsDeletedFalse(
SalesCommissionSettlementService
SalesCommissionSettlementRepository
```

production 결과는 아래 세 좌표뿐이다.

| 좌표 | 역할 | 정상적인 null/blank 의미 | fix 영향 |
|---|---|---|---|
| `SalesCommissionSettlementService.findByDocumentNo(String)` | 문서번호 단건 업무 조회 | 없음. Javadoc도 “확정 후 문서번호로 되찾는다” | null/blank만 `INVALID_INPUT`; 정상 번호 유지 |
| `SalesCommissionSettlementRepository.findByDocumentNoAndIsDeletedFalse(String)` | 위 서비스의 단일 repository query | 직접 null 호출 시 JPA `IS NULL`이지만 production 직접 caller 없음 | 서비스 guard 뒤에만 도달 |
| `SalesCommissionSettlementService.confirm(UUID)`의 `findById(UUID)` | 번호 없는 DRAFT를 UUID로 찾는 확정 경로 | 문서번호 입력이 아님 | 영향 없음 |

별도 controller, 다른 service caller, 목록 endpoint, optional document-number filter는 0건이다.
따라서 “문서번호를 비우면 전체 목록”이어야 할 정상 호출을 이번 guard가 400으로 바꾸는 경로는 없다.
DRAFT는 문서번호로 찾지 않고 확정 시 UUID로 찾는다.

### `trim()` 양방향 판정

좁히는 방향과 넓히는 방향을 모두 확인했다.

1. **기존 저장값 손실 여부**
   - `sales_commission_settlements`는 이번 V97에서 새로 생기는 테이블이라 배포 전 기존 저장 행이 없다.
   - production 저장은 `numberService.next(settlementDate)`가 만든 `yyyy/MM/dd-N`을 domain
     `confirm()`에 전달하며, domain도 저장 전에 `trim()`한다.
   - 따라서 앞뒤 공백이 업무적으로 유효한 기존 저장값은 현재 지원 경로에서 만들어지지 않는다.
2. **다른 문서 오조회 여부**
   - 생성 가능한 문서번호는 공백 없는 canonical 번호뿐이다.
   - 입력 `"  2099/12/28-1  "`을 canonical 값으로 정규화해 같은 문서를 찾는 것은 의도한 계약이다.
   - 공백 포함 번호와 미포함 번호를 서로 다른 정상 문서로 저장하는 production 경로는 없다.

수기 SQL·향후 bulk import가 공백 포함 값을 직접 넣는 표면은 이번 S1 production 계약 밖이다. 그
표면을 추가한다면 저장 경계 정규화 또는 migration 정제가 별도 필요하지만, 현재 fix의 차단 결함은
아니다.

## 3. 계열 전수 — null/빈 문자열 인자표

정산 aggregate와 바로 붙은 일자 시퀀스 조회까지 분모에 포함했다.

| 공개/내부 경계 | 실제 persistence 동작 | null | 빈 문자열 | 유효하지만 없음 | 판정 |
|---|---|---|---|---|---|
| `SalesCommissionSettlementService.findByDocumentNo(String)` | active document no 단건 조회 | `INVALID_INPUT`, repository 0회 | `INVALID_INPUT`, repository 0회 | `NOT_FOUND` | 정상 |
| `SalesCommissionSettlementRepository.findByDocumentNoAndIsDeletedFalse(String)` | derived query | 직접 호출 시 `document_no IS NULL` | `Optional.empty()` | `Optional.empty()` | production caller는 guard된 서비스 1개뿐 |
| `SalesCommissionSettlementService.confirm(UUID)` | `findById` 후 확정 | Spring Data가 null UUID를 거부 | UUID라 해당 없음 | `BusinessException(NOT_FOUND)` | 문서번호 조회 계열 아님, fix 영향 없음 |
| inherited `findAll`/`findAllById`/`existsById` 등 | 범용 JPA 조회 | 현재 production caller 없음 | 문서번호 인자 없음 | 해당 없음 | 신규 업무 조회 누락 없음 |
| `SalesCommissionSettlementNumberService.next(LocalDate)` | 일자 시퀀스 생성 후 잠금 조회 | repository 전에 `IllegalArgumentException` | 날짜라 해당 없음 | insert 후에도 없으면 `IllegalStateException` | 정산 일자 null이 query로 내려가지 않음 |
| `SalesCommissionSettlementNumberSequenceRepository.findLockedBySettlementDate(LocalDate)` | `PESSIMISTIC_WRITE` 단건 조회 | production은 `next()` guard 뒤에서만 호출 | 날짜라 해당 없음 | `Optional.empty()` | 호출 계열 닫힘 |

`findByDocumentNo` 외 같은 “nullable 업무값이 `IS NULL` 조회로 바뀌는” 신규 production 메서드는
발견되지 않았다.

## 4. 채번 자체 재확인

### fixture가 아닌 실제 생성 경로

PostgreSQL 왕복 테스트의 경로는 다음과 같다.

```text
createDraft(FIRST_DATE)
→ repository.save(DRAFT, documentNo=null)
→ confirm(draft.id)
→ repository.findById(id)
→ numberService.next(settlementDate)
→ 일자 sequence insert-if-absent + pessimistic row lock + next()
→ aggregate.confirm(generatedDocumentNo)
→ repository.save(CONFIRMED)
→ findByDocumentNo(confirmed.documentNo)
```

테스트 fixture가 정산서 번호를 심지 않는다. 중복 제약 테스트만 의도적으로 duplicate aggregate에
기존 번호를 넣어 DB unique index를 검증하며, 정상 왕복 채번 증거와 분리되어 있다.

### 채번 제거 뮤테이션

production의 아래 호출을 임시 제거했다.

```java
// 원문
return repository.save(settlement.confirm(numberService.next(settlement.getSettlementDate())));
// mutation
return repository.save(settlement);
```

실행 결과:

```text
SalesCommissionSettlementNumberSequenceIT
  createDraft_thenConfirm_thenFindByDocumentNo_roundTripsTheSameSettlement FAILED
  BusinessException at line 72
1 test completed, 1 failed
BUILD FAILED in 37s
```

번호가 null이라 `findByDocumentNo`가 `NOT_FOUND`가 되어 실제 왕복 테스트가 RED가 됐다. 이후 파일을
원복했고 SHA-256이 뮤테이션 전후 동일한
`BC32310880C18150F206958DDEFD20789A3142EEB9A7D965E396B8284FA6F625`임을 확인했다.

### 불변식 결과

| 불변식 | 근거 | 결과 |
|---|---|---|
| DRAFT 무번호 | 생성 직후 domain/실 PostgreSQL `documentNo == null` | 통과 |
| DRAFT → CONFIRMED 채번 | 실제 service/number/domain/save 왕복 | 통과 |
| 같은 날 N 순증 | `2099/12/28-1`, `-2` | 통과 |
| 날짜 변경 시 1부터 | `2099/12/29-1` | 통과 |
| 동시 중복 없음 | 같은 일자 8 worker가 row lock 경로를 통과해 `-1`~`-8`, 중복 0 | 통과 |
| 활성 동일 번호 차단 | partial unique index + 실 PostgreSQL `DataIntegrityViolationException` | 통과 |
| 40자 제한 | 컬럼/domain 40자, 생성 가능 최대 21자 | 통과 |

40자 계산은 `yyyy/MM/dd-` 11자 + signed positive PostgreSQL/Java `INTEGER` 최대 10자리 = 최대
21자다. `ApprovalAttachment.ref_doc_no VARCHAR(40)`보다 19자 짧다.

## 5. 설계·migration·컨벤션

### settlementDate 변경과 참조 안정성

직전 SOL 보고서 §6에 이미 답이 있다. 코드도 같은 결론이다.

- `settlementDate`는 private이고 setter·변경 domain method가 없다.
- 생성자에서만 대입되며 `confirm()`은 문서번호와 상태만 바꾼다.
- `confirm()`은 DRAFT에서 한 번만 허용한다.

따라서 현재 지원 경로에서는 확정 후 정산 기준일이 바뀌지 않고 문서번호도 따라 바뀌지 않는다.
향후 날짜 편집이 필요해지면 DRAFT에서만 허용하고 CONFIRMED에서는 거부한다는 RED가 먼저 필요하다.
그 미래 편집 API는 이번 S1에 존재하지 않는다.

### Flyway V97

2026-08-11 재집계 결과:

```text
원격 main SHA  6b801a55345beb114e1864c27f85731a22aa4a69 (#1132 merge)
accounting migration  70개
최대 version          V96
중복 version          0개
신규 후보             V97 (+1)
```

#1132의 변경 파일도 확인했으며 accounting migration 추가는 없다.

### 저장소 컨벤션

- 두 entity 모두 `BaseEntity`를 상속해 7 audit field를 매핑한다.
- V97 두 테이블 모두 7 audit field와 `is_deleted`를 갖는다.
- 두 entity 모두 `@SQLRestriction("is_deleted = false")`; production hard-delete caller는 없다.
- 공개 class/method에 한국어 Javadoc이 있다.
- setter 없이 `createDraft`/`confirm`과 `create`/`next` domain method로 상태를 바꾼다.
- aggregate `confirm()`은 현재 aggregate를 반환해 domain method chain을 유지한다.

## 6. 강제 재검증

### S1 전체 19건

```text
.\gradlew.bat :services:accounting-service:test \
  --tests 'com.samhanair.logis.accounting.domain.SalesCommissionSettlementTest' \
  --tests 'com.samhanair.logis.accounting.service.SalesCommissionSettlementNumberServiceTest' \
  --tests 'com.samhanair.logis.accounting.service.SalesCommissionSettlementServiceTest' \
  --tests 'com.samhanair.logis.accounting.it.SalesCommissionSettlementNumberSequenceIT' \
  --rerun-tasks --no-daemon
```

```text
SalesCommissionSettlementTest                    2 / 0 / 0 / 0
SalesCommissionSettlementNumberServiceTest       1 / 0 / 0 / 0
SalesCommissionSettlementServiceTest             7 / 0 / 0 / 0
SalesCommissionSettlementNumberSequenceIT        9 / 0 / 0 / 0
합계                                             19 / 0 / 0 / 0
BUILD SUCCESSFUL in 1m 3s
```

직전 원본 8건은 위 19건 안의 기존 method 8개로 모두 실행됐다.

### accounting-service 전체

```text
.\gradlew.bat :services:accounting-service:test --rerun-tasks --no-daemon
```

```text
BUILD SUCCESSFUL in 7m 16s
217 XML suites
1,841 tests / failures=0 / errors=0 / skipped=10
21 actionable tasks: 21 executed
```

수치는 Gradle HTML의 `tests=1841`, `failures=0`, `ignored=10`과 217개 XML의 suite attribute 합계를
각각 대조했다.

## 7. 이 라운드가 보지 않은 표면

다음은 결함 없음 판정에 포함하지 않았다.

1. S2 요율 계약·계산기와 금액 계산.
2. S3 `ApprovalReferenceDocType` 추가, 실제 `ApprovalAttachment.ref_doc_no` 저장·조회 왕복.
3. S4 화면·버튼·HTTP 사용자 경로.
4. 공유/운영 DB에 V97을 직접 적용하는 배포 검증과 수기 SQL·외부 bulk import.
5. 아직 존재하지 않는 향후 settlementDate 편집 API.
6. number allocation보다 넓은 운영 부하·장시간 stress 시험. 이번 동시성 근거는 같은 날 8 worker다.

공유 DB write와 git 조작은 하지 않았다. DB write 검증은 Testcontainers PostgreSQL에만 수행했다.

## 8. PM 전달문

```text
D-G1 S1 SOL 재검토 2차 PASS. 차단 결함 0건.
SOL-S1-01의 null/blank guard는 단건 문서번호 조회에만 적용되고 선택 필터 caller는 0건이다.
trim은 신규 빈 테이블 + canonical 저장 경로에서 정상 문서를 가리지 않는다.
채번 제거 mutation RED, S1 19/19, accounting 전체 강제 실행 1,841/1,841 확인.
LUNA 보고의 전체 1,624는 비차단 집계 오차로 1,841로 정정한다.
S2 요율/계산기, S3 그룹웨어 연결, S4 UI, 운영 DB 적용은 이 라운드가 보지 않았다.
```

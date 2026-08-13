# D-G1 S3 영업수수료 정산서 그룹웨어 참조 첨부 구현 보고

> 상태: **구현 완료, 전체 회귀 GREEN**  
> 조사·구현일: 2026-08-11  
> 대상 워크트리: PR #1168

## 1. 범위와 결론

개발책임자 확인에 따라 groupware의 다음 V19 변경을 적용했다.

1. `ApprovalReferenceDocType.SALES_COMMISSION_SETTLEMENT`를 7번째 값으로 추가했다.
2. `ck_approval_attachments_ref_doc_type`에 7번째 값을 추가하고, 기존 6개 값을 모두 보존했다.
3. 활성 참조 역방향 조회용 partial index를 `(ref_doc_type, ref_doc_no)`에 추가했다.
4. 기존 지출결의서 작성 경로의 참조 선택기에 정산서 유형과 확정 정산서 검색 endpoint를 추가했다.
5. 실제 참조 첨부 POST가 저장한 정산서 번호로 연결 결재번호·제목·상태를 조회한다.

정산서 화면, 정산서에서 결재를 연결하는 S4 버튼, 기준일 잠금, 40% 규칙, 결재 상태의 accounting 역전파는 추가하지 않았다.

## 2. 기존 6종 조사와 적용 규칙

### 2.1 중복 첨부와 다중 결재

기존 `ApprovalAttachmentService.addReference()`에는 동일 참조 중복 검사가 없고,
`ApprovalAttachmentRepository`와 V5 migration에도 `(ref_doc_type, ref_doc_no)` unique 제약이 없다.
따라서 기존 규칙은 **한 업무문서가 여러 결재에 참조될 수 있음**이다. S3도 같은 정산서가 여러 결재에 붙도록 했다.
조회 응답에서는 한 결재에 여러 matching attachment가 있더라도 결재를 한 건으로 deduplicate한다.
첨부 자체의 새 unique 규칙은 만들지 않았다.

### 2.2 결재 상태 역전파

기존 결재 완료·반려 경로는 `ApprovalLine`의 결재 상태만 바꾸며,
`ref_doc_type/ref_doc_no`를 따라 accounting 업무문서 상태를 바꾸는 호출은 없었다.
따라서 S3는 역전파하지 않고 역방향 조회 결과에 연결 결재의 현재 `approvalNo`, 제목, `status`만 반환한다.

### 2.3 attachment_type 매핑표

| 참조 문서 유형 | 실제 기존 저장 경로 | `attachment_type` | 번호 저장 컬럼 | 근거 |
|---|---|---|---|---|
| `OUTBOUND_SLIP` | `documentRef()` + `refSlipType=SLIP_OUTBOUND` | `SLIP_REF` | `ref_doc_no` 및 legacy slip 필드 | `ApprovalAttachmentService`, 기존 IT |
| `INBOUND_SLIP` | `documentRef()` + `refSlipType=SLIP_INBOUND` | `SLIP_REF` | `ref_doc_no` 및 legacy slip 필드 | `ApprovalAttachmentService`, 기존 IT |
| `JOURNAL` | `documentRef()` + `refDocType` | `SLIP_REF` | `ref_doc_no` | 기존 IT 실제 POST 응답 |
| `TAX_INVOICE` | `documentRef()` + `refDocType` | `SLIP_REF` | `ref_doc_no` | 기존 IT 실제 POST 응답 |
| `STATEMENT` | `documentRef()` + `refDocType` | `SLIP_REF` | `ref_doc_no` | 기존 IT 실제 POST 응답 |
| `PARTNER_LEDGER` | `partnerLedgerRef()` | `PARTNER_LEDGER_REF` | 거래처 코드·기간, `ref_doc_no` 없음 | 기존 IT 실제 POST 응답 |
| `FILE` | 파일 업로드 | `FILE` | 문서 참조 없음 | `ApprovalAttachmentType` 및 파일 endpoint |
| `SALES_COMMISSION_SETTLEMENT` | 기존 `documentRef()` 계열 | **`SLIP_REF` 재사용** | `ref_doc_no` | 문서 참조 계열 5종과 동일한 저장 경로 |

결론적으로 기존 참조 문서 6종 중 문서번호 기반 5종은 `SLIP_REF`이고,
거래처원장만 별도 `PARTNER_LEDGER_REF`였다. 정산서는 문서번호 기반 문서 참조이므로
새 `attachment_type`을 만들지 않고 `SLIP_REF`를 재사용했다.
따라서 `attachment_type` CHECK는 변경하지 않았다.

### 2.4 기존 6종 저장·조회·렌더링 원문

fixture에 `ref_doc_no`를 심지 않고, `ApprovalAttachmentRequest`를 실제 POST한 뒤
`GET /admin/groupware/approvals/{approvalId}/attachments`로 되찾았다.
Gradle MockMvc 원문에서 확인한 저장 응답의 핵심 부분은 다음과 같다.

```text
OUTBOUND_SLIP       => attachmentType=SLIP_REF,           refDocNo=2026/08/11-1
INBOUND_SLIP        => attachmentType=SLIP_REF,           refDocNo=2026/08/11-2
JOURNAL             => attachmentType=SLIP_REF,           refDocNo=2026/08/11-3
TAX_INVOICE         => attachmentType=SLIP_REF,           refDocNo=2026/08/11-4
STATEMENT           => attachmentType=SLIP_REF,           refDocNo=2026/08/11-5
PARTNER_LEDGER      => attachmentType=PARTNER_LEDGER_REF, refDocNo=null,
                       refPartnerCode=P-001, refPeriod=2026-08
```

동일 GET 응답에서 `refDocType`은 각각 `OUTBOUND_SLIP`, `INBOUND_SLIP`, `JOURNAL`,
`TAX_INVOICE`, `STATEMENT`, `PARTNER_LEDGER`로 보존되었고 응답 배열은 6건이었다.
실행 원문은 `build/test-results/test/TEST-com.samhanair.logis.groupware.it.ApprovalTemplateAttachmentIT.xml`에 남는다.

## 3. V19 CHECK와 index

groupware migration 최대가 V18임을 확인하고 V19를 사용했다.

### 3.1 변경 전 정의

```sql
ck_approval_attachments_ref_doc_type:
ref_doc_type IS NULL OR ref_doc_type IN (
  'OUTBOUND_SLIP','INBOUND_SLIP','JOURNAL','TAX_INVOICE','STATEMENT','PARTNER_LEDGER'
)

approval_attachments_attachment_type_check:
attachment_type IN ('SLIP_REF','PARTNER_LEDGER_REF','FILE')
```

### 3.2 변경 후 정의

```sql
ck_approval_attachments_ref_doc_type:
ref_doc_type IS NULL OR ref_doc_type IN (
  'OUTBOUND_SLIP','INBOUND_SLIP','JOURNAL','TAX_INVOICE','STATEMENT',
  'PARTNER_LEDGER','SALES_COMMISSION_SETTLEMENT'
)

approval_attachments_attachment_type_check:
attachment_type IN ('SLIP_REF','PARTNER_LEDGER_REF','FILE') -- 변경 없음

CREATE INDEX ix_approval_attachments_ref_doc_active
ON approval_attachments (ref_doc_type, ref_doc_no)
WHERE is_deleted = FALSE;
```

V19는 기존 CHECK를 `DROP CONSTRAINT` 후 동일 이름으로 다시 추가하지만,
기존 행을 UPDATE/DELETE/INSERT하지 않는다. SQL 계약 테스트는 기존 6개와 새 값,
기존 attachment type 3개 보존 및 DML 부재를 확인한다.
partial index는 soft-deleted 첨부를 역방향 업무 조회에서 제외하고, 의미 변경 없이 조회 성능만 보강한다.

## 4. 구현 설계

### 4.1 정산서 후보 검색

`GET /admin/accounting/sales-commission-settlements/search?q=&limit=`를 추가했다.
기존 회계 문서 검색과 같은 자동완성 계층을 사용하며 `accounting.reports` VIEW 권한을 적용했다.
repository는 `status=CONFIRMED`, `documentNo IS NOT NULL`만 검색하므로 번호 없는 DRAFT는 선택 후보가 될 수 없다.
응답은 UUID 없이 `settlementNo`, 기준일, 상태, 지급액만 반환한다.

### 4.2 지출결의서 참조 선택

기존 `DocumentReferencePicker`의 6개 유형 목록에 `SALES_COMMISSION_SETTLEMENT`를 추가했다.
검색 결과의 `settlementNo`를 `refDocNo`로 사용하고, 기존 작성/상세 페이지의 공통
`buildReferenceInput`이 다음 payload를 보낸다.

```json
{
  "attachmentType": "SLIP_REF",
  "refDocType": "SALES_COMMISSION_SETTLEMENT",
  "refDocNo": "2026/08/11-1"
}
```

새 정산서 화면이나 결재 연결 버튼은 만들지 않았다.

### 4.3 역방향 조회

`GET /admin/groupware/approval-references?refDocType=SALES_COMMISSION_SETTLEMENT&refDocNo=2026/08/11-1`

repository가 `ref_doc_type/ref_doc_no`로 active attachment를 찾고 결재를 fetch join한다.
soft-deleted attachment와 `@SQLRestriction`으로 제외되는 결재는 결과에서 빠진다.
응답은 다음처럼 UUID 없는 결재 식별자와 상태만 노출한다.

```json
{
  "approvalNo": "2026/08/11-1",
  "title": "영업수수료 정산 지출결의",
  "status": "PENDING"
}
```

## 5. RED 원문과 조합표

### 5.1 RED-A/B 원문

enum만 추가하지 않은 현행에서 새 참조 POST는 다음 원인으로 400이었다.

```text
Status = 400
Resolved Exception = HttpMessageNotReadableException
message = JSON parse error: cannot deserialize ApprovalReferenceDocType
           from value "SALES_COMMISSION_SETTLEMENT"
```

enum을 추가한 뒤 V19 전 역방향 GET은 다음 원문으로 500이었다.

```text
GET /admin/groupware/approval-references?... 
Status = 500
NoResourceFoundException: No static resource admin/groupware/approval-references.
```

이후 실제 POST 저장과 역방향 API를 구현해 GREEN으로 확인했다. 기존 6종은 각 유형을
실제로 하나씩 POST하고 GET 목록·응답 원문·attachment type을 검증했다.

### 5.2 조합 결과

| 조합 | S3 판정 | 검증 |
|---|---|---|
| DRAFT 정산서(번호 없음) 첨부 | 400, `refDocNo` 필수 | 실제 POST 테스트 |
| CONFIRMED 정산서 첨부 | 201, `SLIP_REF` + 7번째 유형 + 번호 저장 | 실제 POST 테스트 |
| 정산서 1건 → 결재 여러 건 | 허용, 조회 2건 | 실제 POST 2회 + 역방향 조회 |
| 결재 삭제 후 정산서 조회 | soft-deleted 첨부 제외, 0건 | 실제 DELETE + 역방향 조회 |
| 결재 반려 후 조회 | `REJECTED` 반환, 정산서 역전파 없음 | 실제 reject + 역방향 조회 |
| 정산서가 없는 번호 | 기존 6종 규칙대로 첨부 자체는 201, 검색 후보는 없음 | 실제 POST 경로 |
| 번호 40자 초과 | 400 | 실제 POST 경로 |

## 6. 테스트 결과

| 명령 | 결과 |
|---|---|
| V19 SQL 계약 + 기존 6종 + 왕복 + 다중/반려/삭제/경계 groupware targeted | **GREEN**, BUILD SUCCESSFUL |
| accounting 검색 서비스 targeted | **GREEN**, BUILD SUCCESSFUL |
| 기존 groupware 직접 지출결의서 생성 경로 | 기존 `ApprovalTemplateAttachmentIT` 전체 흐름에 포함, GREEN |
| accounting 전체 | **GREEN**, 1,867 tests, failures 0, ignored 10 (기존 1,866 + 새 검색 테스트 1) |
| groupware 전체 | **GREEN**, 254 tests, failures 0, ignored 0 |
| desktop picker test | **GREEN**, 12 tests; typecheck도 GREEN |

desktop은 처음 실행 시 `npm ci`, design-system dist, `out/main` 선행조건이 없어 보류되었으나,
워크트리의 로컬 파생물을 생성한 뒤 재실행하여 통과했다.
공유 DB write, 배포, git 조작은 하지 않았고, backend 통합 테스트는 Testcontainers 격리 PostgreSQL로 실행했다.

## 7. 신규 파일 목록

- `services/groupware-service/src/main/resources/db/migration/V19__extend_approval_reference_doc_type.sql`
- `services/groupware-service/src/main/java/com/samhanair/logis/groupware/controller/GroupwareApprovalReferenceController.java`
- `services/groupware-service/src/main/java/com/samhanair/logis/groupware/dto/ApprovalReferenceLookupResponse.java`
- `services/groupware-service/src/test/java/com/samhanair/logis/groupware/migration/GroupwareSalesCommissionReferenceMigrationSqlTest.java`
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/dto/AccountingSalesCommissionSettlementSearchResponse.java`

주요 수정 파일:

- groupware `ApprovalReferenceDocType`, `ApprovalAttachmentService`, `ApprovalAttachmentRepository`, `ApprovalTemplateAttachmentIT`
- accounting `SalesCommissionSettlementRepository`, `AccountingDocumentSearchService`, `AccountingDocumentSearchController`, 검색 서비스 테스트
- desktop `documentReferenceSearch.ts`, `DocumentReferencePicker.tsx`, 해당 테스트, `mock.ts`

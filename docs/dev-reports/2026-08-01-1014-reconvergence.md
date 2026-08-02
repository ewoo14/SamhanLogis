# 1014 문서 자동저장·이력 머지 직전 재수렴 검증

## 검증 기준

- 워크트리/브랜치: `feat/1014-doc-autosave`
- 검증 SHA: `1f85cd95`
- 시작 시 변경 상태: 본 보고서 파일만 untracked. 기존 코드 변경 없음.
- 제약 준수: Git 쓰기, 코드 수정, Docker 재빌드·재기동, 실 DB 쓰기 금지.

## 변경 범위 확인

- HEAD 커밋은 `LedgerImageService`, `AccountingReportController`, 기존 구현 보고서만 변경한다.
- 브랜치 전체에는 `LedgerSnapshotService`, `V95__add_document_snapshot_type.sql`, 권한 IT 및 단위 테스트가 포함된다.
- 실제 대상 API는 거래처원장 이미지 조회(자동 스냅샷), 원장 이력 목록, 배치번호 기반 복원이다.

## 각도 2 — `getLedger` 3인자 복구

### 확인 2-1: 호출부 정합성

- `services/accounting-service`의 `LedgerImageService.getLedger` 호출부는 모두 3인자이다. 4인자 호출 잔존은 없다.
- `LedgerSnapshotService.capture(..., actor)`는 현재 production 호출부가 없고, 내부에서 3인자 `getLedger`만 호출한다.

### 결함 후보 2-A: 네 번째 인자의 의미가 사라짐

- 직전 구현의 네 번째 인자는 요청 헤더 `X-User-Id`를 파싱한 `actorUserId`였고 `TaxInvoiceBatch.createDocumentSnapshot(..., actorUserId)`로 저장 작성자를 기록했다.
- HEAD는 controller의 사용자 헤더 수신을 제거했고 스냅샷 생성 시 작성자를 항상 `null`로 넘긴다.
- 즉 컴파일/호출부 정합성은 회복됐지만, 작성자 audit 및 작성자 자동 대상자 포함에 필요한 입력 의미가 조용히 사라졌다.
- 실 사용자 경로: `GET /api/v1/accounting/journals/ledger-data` 호출 시 발생한다. 실 데이터 영향 건수는 DB 읽기 조사 후 확정한다.

## 각도 1 — 정상 사용자 차단 여부

### 결함 1-A: 이력 조회·복원은 화면에서 도달 불가

1. 실 사용자 경로 재현: `/accounting/partner-ledger` 화면에는 원장 현재 조회·인쇄·CSV만 있고 이력 목록/복원 UI가 없다. Desktop production 코드에는 `ledger-history` API client 호출도 없다.
2. 재현 명령과 출력 원문:

```text
> rg -n -S "ledger-history|ledgerHistory|restoreLedger|ledger-data" clients/desktop/src
clients/desktop/src/renderer/print/PartnerLedgerView.tsx:22: ... ledger-data ...
clients/desktop/src/renderer/api/mock.test.ts:1190: ... ledger-data ...
clients/desktop/src/renderer/api/mock.ts:9427: ... ledger-data ...
clients/desktop/src/renderer/api/partnerLedgerApi.ts:135: ... ledger-data ...
clients/desktop/src/renderer/api/partnerLedgerApi.ts:148: '/accounting/journals/ledger-data',
```

`ledger-history` 결과는 0건이다.

3. 실 데이터 영향 건수: 실 DB의 `PARTNER_LEDGER` 기존 행 수를 읽기 조회 후 확정한다. 화면 기준으로는 해당 행 전부가 조회·복원 불가이다.

### 확인 1-1: 현재 공유 accounting DB의 과거 행 상태

재현 명령과 출력 원문:

```text
> SELECT column_name ... tax_invoice_batches ...;
 processed_by
(1 row)

> SELECT version, success FROM flyway_schema_history WHERE version='95';
(0 rows)

> SELECT COUNT(*) AS all_batches FROM tax_invoice_batches;
0
```

- 현재 공유 실 DB에는 V95가 적용되지 않았고 `tax_invoice_batches` 자체가 0행이다. 따라서 이 DB에서는 “이미 있던 원장 문서” 호환 표본이 원천적으로 없다.
- 결함 1-A의 **현재 실 데이터 영향 건수는 0건**이다. 이는 기존 문서 호환 통과가 아니라 실측 가능한 기존 행이 없다는 뜻이다.
- 실행 중 accounting-service도 공유 이미지이며, DB 스키마상 SHA `1f85cd95` 기능이 배포된 상태가 아니다. Docker 재빌드·재기동 금지에 따라 이 환경을 바꾸지 않았다.

### 결함 1-B (머지 차단): 자동저장이 read-only transaction에서 무동작

1. 실 사용자 경로 재현: 권한 있는 사용자가 `/accounting/partner-ledger`에서 거래처 row의 `원장 보기`를 누르면 `GET /accounting/journals/ledger-data`가 호출된다. `LedgerImageService`는 class-level `@Transactional(readOnly = true)` 안에서 `taxInvoiceBatchRepository.save(batch)`를 호출한다. repository의 REQUIRED transaction은 이미 열린 read-only transaction에 참여하므로 쓰기 transaction으로 전환되지 않는다. 표준 Spring JPA/Hibernate 경로에서는 commit flush가 억제되어 UI 응답과 무관하게 snapshot insert가 남지 않는다.
2. 재현 명령과 출력 원문:

```text
> SELECT character_maximum_length AS batch_no_max ... column_name='batch_no';
 batch_no_max
--------------
           20

> SELECT MIN(length(partner_code)), MAX(length(partner_code)) FROM partners WHERE is_deleted=false;
 min_partner_code_len | max_partner_code_len
----------------------+----------------------
                    1 |                   20
```

코드 원문:

```text
@Transactional(readOnly = true)
public class LedgerImageService { ...
    taxInvoiceBatchRepository.save(batch);
}
```

3. 실 데이터 영향 건수:

```text
partners_with_journal_lines = 42
journal_lines_with_partner   = 221
active_partners              = 7,259
권한 역할 사용자             = ACCOUNTANT 6 + MANAGER 2 + MASTER 2 = 10명
```

- 기간을 넓혀 실제 원장 데이터가 있는 거래처 42곳(분개라인 221건)의 조회 호출은 모두 자동저장이 남지 않는다.
- 빈 원장도 저장 대상이므로 유효 거래처코드 전체 7,259곳이 API 수준 영향 범위이다.
- 공유 컨테이너는 아직 이 SHA가 아니므로 금지된 재빌드 없이 branch runtime을 실 DB에 붙이지 않았다. 현재 공유 DB의 snapshot 행은 호출 전후 비교 자체가 불가능한 0건/미배포 상태이다.

### 결함 1-C (머지 차단): 쓰기 transaction을 회복하면 모든 배치번호가 컬럼 한도를 초과

1. 실 사용자 경로 재현: 결함 1-B가 해소되어 insert가 실제 flush되는 순간 동일 `원장 보기` 경로에서 발생한다. 배치번호는 `LED-` + 17자리 시각 + `-` + 거래처코드라 최소 23자인데 `batch_no`는 20자이다.
2. 재현 명령과 출력 원문은 위 `batch_no_max=20`, `min_partner_code_len=1` 결과와 같다.
3. 실 데이터 영향 건수: 원장 데이터 거래처 42곳/분개라인 221건, API 입력 가능 active 거래처 7,259곳, 권한 역할 사용자 10명 전체.

### 확인 1-2: 등급별 기존 실 사용자 경로 baseline

배포 중인 기존 accounting-service와 실 DB의 기존 원장 문서번호를 사용해 동일 GET을 직접 호출했다. 호출 전후 `tax_invoice_batches=0`으로 DB 쓰기가 없음을 확인했다.

```text
dev_accountant ([DEV-SEED] 개발회계, ACCOUNTANT) status=200
dev_manager    ([DEV-SEED] 개발매니저, MANAGER) status=200
dev_master     ([DEV-SEED] 개발마스터, MASTER) status=200
dev_sales      ([DEV-SEED] 개발영업, SALES) status=403
tax_invoice_batches=0
```

- 정상 허용 3등급은 기존 배포본에서 실제 200이고 비허용 SALES는 403이다. 권한 fix가 바꾸면 안 되는 baseline이다.
- 실 DB materialized 권한도 ACCOUNTANT 6명 + MANAGER 2명은 VIEW/PRINT true이며, MASTER 2명은 system-master bypass 대상이다.
- 다만 현재 컨테이너는 SHA `1f85cd95`가 아니므로 이 호출은 “기존 정상 사용자가 있었다”는 baseline 증거이며 branch 서비스 동작 통과 증거가 아니다.

### 결함 1-D: 작성자 자동 포함 정책을 구현할 작성자 정보가 전부 유실

1. 실 사용자 경로: 위 200 사용자 3등급이 원장을 생성하면 직전 구현은 요청자의 `X-User-Id`를 `processed_by`에 기록했다. HEAD는 header 수신과 네 번째 인자를 제거해 모든 신규 snapshot의 `processed_by`를 `null`로 만든다. history/restore query에도 작성자 집합 또는 자동 포함 로직이 없다.
2. 재현 원문:

```text
직전: getLedger(partnerCode, from, to, parseUuid(userId))
HEAD: getLedger(partnerCode, from, to)
HEAD snapshot: createDocumentSnapshot(..., from, to, null)
```

3. 실 데이터 영향 건수: 현재 기존 snapshot은 0건. 배포 후 생성되는 snapshot은 100% 작성자 식별 불가이다. 따라서 현재 실측 차단 건수는 0건이나, 확정 정책인 “작성자는 대상자 집합에 자동 포함”을 적용할 데이터가 생성되지 않는다.

## 각도 3 — `LedgerSnapshotService` mock이 가린 실 경로

### 확인 3-1: 권한 AOP와 service 실행을 분리

재실행 명령과 출력 원문:

```text
> .\gradlew.bat :services:accounting-service:test --tests "*AccountingPermissionControllerIT" --no-daemon --no-build-cache --rerun-tasks --console=plain
> Task :services:accounting-service:test
BUILD SUCCESSFUL in 57s
21 actionable tasks: 21 executed

AccountingPermissionControllerIT: tests="78" skipped="0" failures="0" errors="0"
```

- 이 중 원장 3 endpoint의 grant/deny 6경로는 실제 MockMvc + 권한 AOP를 통과한다.
- 그러나 `LedgerImageService`와 `LedgerSnapshotService`가 모두 mock이라 권한 통과 뒤에는 실 transaction, 실 repository, 압축 복원, 배치번호 DDL 경로가 하나도 실행되지 않는다.
- 실 서비스로 같은 경로를 따르면 결함 1-B(read-only 저장 무동작), 이어 쓰기가 회복되면 결함 1-C(배치번호 길이 초과), 작성자는 결함 1-D(null)로 간다. 따라서 mock 등록은 권한 로직의 6경로만 증명하며 실제 문서 기능 결함을 통과시킨다.

## 각도 4 — 자동저장의 실제 동작

### 결함 4-A: 저장 후 다시 열기 경로가 성립하지 않음

1. 실 사용자 경로: `원장 보기`는 현재 화면 데이터를 200으로 받을 수 있어도 결함 1-B 때문에 DB snapshot이 남지 않는다. 이어서 사용자가 다시 열 수 있는 history UI도 결함 1-A처럼 존재하지 않는다.
2. 재현 원문:

```text
실 DB: tax_invoice_batches=0
Frontend production 검색: ledger-history 호출 0건
Service: @Transactional(readOnly = true) 안에서 repository.save(...)
```

3. 실 데이터 영향 건수: 원장 데이터 거래처 42곳/분개라인 221건의 모든 조회 결과, API 입력 가능 active 거래처 7,259곳의 모든 생성 시도.

### 확인 4-1: 동시 편집·빠른 연속 입력의 마지막 값

- 이번 구현에는 사용자가 문서 내용을 보내는 create/update/autosave endpoint가 없다. GET으로 서버가 만든 원장 snapshot을 append하려는 구조라 “편집 중 마지막 입력값” 자체가 존재하지 않는다.
- 현재 실제 DB 결과는 결함 1-B로 **마지막 값이 아니라 저장값 0건**이다.
- 쓰기 transaction만 회복해도 결함 1-C로 첫 insert부터 실패하므로 동시성/lost-update 단계까지 도달하지 못한다.
- 잠재 동시성 축: 배치번호가 millisecond 시각 + 거래처코드이므로 같은 거래처의 동시 요청은 동일 배치번호가 될 수 있다. 그러나 현재는 선행 결함 때문에 DB 충돌까지 실측할 수 없고, 실 DB 쓰기 금지에 따라 부하 호출하지 않았다.

## 최종 판정

- **머지 차단 결함 4건**: 1-A(화면 이력 도달 불가), 1-B(DB 자동저장 무동작), 1-C(쓰기 회복 시 배치번호 컬럼 초과), 1-D(작성자 정보 100% 유실).
- 정상 권한 baseline은 ACCOUNTANT/MANAGER/MASTER 200, SALES 403으로 확인했다. 권한 AOP 78건도 재실행 통과했다. 차단/무동작은 권한 판정 뒤 실제 문서 service 경로에 있다.
- `getLedger` 호출부는 3인자로 수렴했지만 네 번째 인자의 작성자 의미는 보존되지 않았다.

## 이번 라운드가 보지 않은 축

- SHA `1f85cd95`를 공유 Docker에 배포한 live HTTP/DB 검증: 재빌드·재기동 금지로 미수행.
- 기존 `PARTNER_LEDGER` 행의 migration/복원 호환: 현재 실 DB가 V95 미적용이며 대상 행 0건이라 표본 없음.
- 실제 DB write를 동반한 동시 요청/충돌 부하: 실 DB 쓰기 금지로 미수행.
- Desktop에서 history/restore의 시각적 동작: production UI/API client가 없어 도달 불가.
- 다른 문서 계열(홈택스, 전표, 결재문서 등)의 자동저장·이력: 이번 변경의 거래처원장 첫 적용 범위 밖.

## 보고서 무결성 확인

- Git 상태: 본 보고서 1개만 untracked. 코드 변경 없음.
- UUID 형식 실값 검색: 0건.
- 필수 축/최종 판정/미검증 축 section 존재 확인.
- 권한 IT fresh 실행: 78 tests, failures 0, errors 0.

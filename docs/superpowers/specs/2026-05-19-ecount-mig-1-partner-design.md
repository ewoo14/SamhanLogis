# 이카운트 → SamhanLogis MIG-1 거래처 PoC — 설계서 v1

> 작성일: 2026-05-19
> 입력: `docs/migration/ecount-data/raw/거래처-Excel다운로드.csv` (실 운영 7,748 행 / 17 컬럼)
> 출력: `staging.ecount_partner_raw` + `samhan_partner.partners` (이카운트 → partner-service 멱등 적재)
> 전제: `docs/migration/ecount-data/README.md` + `01-partner-mapping.md` 기반. 단, **실 CSV 헤더가 spec 27 필드와 다름 — 본 v1 이 정정**.

---

## 1. 배경 / 목적

이카운트 ERP 의 `Self-Customizing > 정보관리 > 데이터관리 > 백업 및 삭제 > 기초코드 탭 > 거래처` Excel 다운로드 (CSV) 를 SamhanLogis `partner-service` 도메인에 일괄 이식. MIG-2~6 (마스터 + 트랜잭션) 의 선행 PoC 로서:

1. **3-Tier (Excel → staging raw → 도메인)** 패턴 검증
2. 멱등 적재 (`source_file_hash` + `source_row_no` 복합 PK + 비즈니스 키 UPSERT)
3. 데이터 품질 가드 (NULL/중복/공백/trailing tab 정규화)
4. 27 필드 spec 의 **실 CSV 헤더 17 컬럼 매핑 정정**
5. 이카운트 운영 약 7,000 거래처 단번 적재

**비목표**: MIG-2 (품목/계정/부서/창고/카드), MIG-3~6 (전표), 첨부파일 (사업자등록증 PDF 등 — README §2-B Phase 2 별도).

---

## 2. 실 CSV 헤더 vs spec 정정

### 2-1. 실 헤더 (17 컬럼, 첫 행은 메타데이터 "데이터관리>거래처-Excel다운로드")

| Idx | 헤더 | 매핑 | 비고 |
|---|---|---|---|
| 0 | 거래처코드 | `biz_no` + `partner_code` 둘 다 (이카운트는 동일 식별자) | NULL/빈/`-`/`00`/`0004` 등 임시값 다수 (1,265건) |
| 1 | 등록일자 | `registration_date` | `YYYYMMDD` or `임시` |
| 2 | 담당자명 | (신규) `manager_name` VARCHAR(50) | 이성미/장영구/김미선 등 직원명 |
| 3 | 종사업장번호 | `sub_biz_no` | 대부분 빈값 |
| 4 | 거래처명 | `name` (NOT NULL) | **771 행 빈값 → reject** |
| 5 | 대표자명 | `representative` | |
| 6 | 주소1 | `address1` + `address` (legacy 호환) | 대부분 빈값 |
| 7 | 전화번호 | `phone` | |
| 8 | 핸드폰번호 | `mobile` | |
| 9 | 검색창내용 | `search_keyword` | |
| 10 | 특이사항 | **(신규) `note` TEXT** | 비즈니스 메모 (예: "엘케이토탈 개인고객") |
| 11 | 그룹 | `partner_group1` | SF(밴더) 2712 / 일반업체 787 / 조달업체 111 / 파트너사 88 / 기타 다양 |
| 12 | 사용구분 | `status` (YES → ACTIVE, 빈 → SUSPENDED) | YES 6446 / 빈 1302 |
| 13 | 이체정보 | **(신규) `transfer_info` VARCHAR(20)** | 등록 6446 / 빈 1302 (사용구분과 1:1) |
| 14 | 여신한도 | `credit_limit` | 대부분 빈/0 |
| 15 | 최초작성일자 | (audit `created_at` 참조용으로 staging 보관만, 도메인 INSERT 시점은 마이그레이션 일자) | `YYYY/MM/DD 오전/오후 H:mm:ss` KST 포맷 |
| 16 | (trailing 빈 컬럼) | 무시 | CSV trailing comma 부산물 |

### 2-2. spec 27 필드 vs 실 17 컬럼 차이

이카운트 거래처 Excel 의 실 export 가 27 필드 전체를 한 시트로 내리지 않고 핵심 17 컬럼만 출력함을 본 PoC 에서 확인. 나머지 (FAX/email/email2/주소2/우편번호/거래처분류2/통화/출하대상/판매유형/매출계정관리/조정률/단가그룹/여신기간/결제기한/업태/종목) 는 본 export 에 부재.

→ **v1 결정**: 본 PoC 는 17 컬럼만 적재. 나머지 필드는 NULL 유지. 이카운트 운영 콘솔에서 추가 export 가 가능해지면 후속 슬라이스 (MIG-1B 보강) 에서 합치기.

---

## 3. 13 핵심 결정 (D-MIG-1-01 ~ D-MIG-1-13)

| # | 결정 | 비고 |
|---|---|---|
| D-MIG-1-01 | **3-Tier 적재** = Excel/CSV → `staging.ecount_partner_raw` (17 raw text 컬럼) → transform → `samhan_partner.partners` | README §2 패턴 |
| D-MIG-1-02 | **멱등 키** = staging `(source_file_hash, source_row_no)` 복합 PK + 도메인 `partner_code` UNIQUE (활성 행). 동일 파일 재실행 시 UPSERT. 다른 파일 (재추출) 도 partner_code 기준 멱등 | source_file_hash = SHA-256(첫 1KB + total size) |
| D-MIG-1-03 | **거래처코드 = partnerCode + bizNo 동시 적재** (이카운트는 둘을 분리하지 않음). 빈/`-`/`0000...` 류 가짜값 6건은 `PLACEHOLDER-{row_no:000000}` 자동 생성 + reject 분류 마킹 (staging 만 적재, 도메인 INSERT 스킵) | 사용자 후속 검증용 |
| D-MIG-1-04 | **거래처명 NULL 거부** = 771 행 (10%) → `REJECT_NAME_NULL` 카테고리 분리, staging 적재 유지 (사용자가 이카운트에서 보정 후 재 import) | Partner.name NOT NULL 가드 |
| D-MIG-1-05 | **사용구분 매핑** = `YES → ACTIVE`, `빈/NO → SUSPENDED`. `terminate()` 매핑 없음 (이카운트 거래종료 플래그는 본 export 에 없음) | 1,302 행 SUSPENDED 분류 |
| D-MIG-1-06 | **trailing tab/CR/공백 일괄 trim** = OpenCSV 파싱 후 모든 셀에 `String.strip()` (이카운트 export 의 일관 트랩) | 모든 값 후처리 |
| D-MIG-1-07 | **신규 컬럼 2개** (V9 migration) = `transfer_info VARCHAR(20)` + `note TEXT` + `manager_name VARCHAR(50)`. NULLable, 기본값 NULL | spec 27 필드에 없는 운영 데이터 보존 |
| D-MIG-1-08 | **등록일자 파싱** = `YYYYMMDD` 정상 / `임시` or 빈값 → NULL. `최초작성일자` 는 staging 만 (도메인 created_at 는 BaseEntity audit 자동) | KST `YYYY/MM/DD 오전 H:mm:ss` 도 staging text 그대로 |
| D-MIG-1-09 | **여신한도 파싱** = 빈값/`-` → `BigDecimal.ZERO`. `,` 천단위 구분자 제거 후 `BigDecimal(String)` | NOT NULL DEFAULT 0 |
| D-MIG-1-10 | **PII 마스킹 불필요** = 실 CSV 에 주민번호 컬럼 부재 확인. `01-partner-mapping.md` §3 마스킹 로직 skip (spec 정정) | Phase 2 (운영 cutover) 시 첨부파일에 주민번호 PDF 가 있을 수 있으므로 첨부 import 시 재검토 |
| D-MIG-1-11 | **importer 호출 방식** = Spring `@Service` + Admin REST `POST /admin/partners/imports/ecount` (multipart upload). 동기 실행 (7천 건 < 30초 예상). 응답 = `{total, imported, updated, rejected[], skippedPlaceholder, skippedNullName}` | Phase 11 cutover 시 비동기 변경 검토 |
| D-MIG-1-12 | **권한** = `ROLE_MASTER` + `ROLE_MANAGER` only (대량 운영 데이터 적재 + 미수금 노출). `ROLE_DISPATCH` 차단 | SecurityConfig 추가 |
| D-MIG-1-13 | **첨부파일 out-of-scope** = README §2-B Phase 1 (PoC) 결정 일관 — 사업자등록증/명함/계약서 일괄 import 안 함. 운영 cutover 시 상위 30~50건 사용자 수동 업로드 | MIG-1B 후속 |

---

## 4. staging 스키마 (V9 migration)

```sql
CREATE SCHEMA IF NOT EXISTS staging;

CREATE TABLE staging.ecount_partner_raw (
    source_file_hash  VARCHAR(64) NOT NULL,        -- SHA-256 hex (32 byte)
    source_row_no     INT         NOT NULL,        -- 2부터 (1=메타, 2=헤더, 3+=데이터)
    -- 17 raw text 컬럼 (이카운트 헤더 순서 그대로, 모두 NULLable text — staging 책임 = "원본 보존")
    raw_partner_code     TEXT,
    raw_registration     TEXT,
    raw_manager_name     TEXT,
    raw_sub_biz_no       TEXT,
    raw_name             TEXT,
    raw_representative   TEXT,
    raw_address1         TEXT,
    raw_phone            TEXT,
    raw_mobile           TEXT,
    raw_search_keyword   TEXT,
    raw_note             TEXT,
    raw_partner_group1   TEXT,
    raw_usage_flag       TEXT,
    raw_transfer_info    TEXT,
    raw_credit_limit     TEXT,
    raw_first_created    TEXT,

    -- transform 결과 분류 (멱등 재실행 시 update)
    transform_status     VARCHAR(30) NOT NULL DEFAULT 'PENDING',  -- IMPORTED / UPDATED / REJECT_NAME_NULL / SKIPPED_PLACEHOLDER
    target_partner_id    UUID,                                     -- transform 성공 시 채움
    reject_reason        TEXT,                                     -- 분류 사유 (사용자 검토용)

    imported_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    imported_by          VARCHAR(50) NOT NULL,                     -- actor user id

    PRIMARY KEY (source_file_hash, source_row_no)
);

CREATE INDEX ix_ecount_partner_raw_status ON staging.ecount_partner_raw (transform_status);
CREATE INDEX ix_ecount_partner_raw_partner_id ON staging.ecount_partner_raw (target_partner_id) WHERE target_partner_id IS NOT NULL;
```

### partner-service 측 신규 3 컬럼 (V9)

```sql
ALTER TABLE partners
    ADD COLUMN transfer_info VARCHAR(20),     -- 이체정보 ("등록" / NULL)
    ADD COLUMN note          TEXT,            -- 특이사항 (자유 메모)
    ADD COLUMN manager_name  VARCHAR(50);     -- 담당자명 (이카운트 운영 데이터)

CREATE INDEX ix_partners_manager_name ON partners (manager_name)
    WHERE is_deleted = FALSE AND manager_name IS NOT NULL;
```

---

## 5. EcountPartnerImporter 흐름

```
[Admin REST POST /admin/partners/imports/ecount]
   multipart file (CSV, UTF-8 BOM, 7,748+ 행)
        │
        ▼
[parseCsv]
   BOMInputStream + CSVReader (OpenCSV 5.9)
   skip rows 1~2 (메타 + 헤더)
   strip(trailing tab/whitespace) all cells
   row_no = 3, 4, ...
        │
        ▼
[stagingUpsert]
   (source_file_hash, source_row_no) UPSERT
   raw_* 17 컬럼 그대로 적재
   transform_status = PENDING
        │
        ▼
[transform per row]
   step a: classify
      - raw_name 빈 → REJECT_NAME_NULL (staging 마킹, partner INSERT skip)
      - raw_partner_code in {NULL, "", "-", "00", "000...", "0000"} → SKIPPED_PLACEHOLDER + auto generate "MIG1-{row_no:000000}"
   step b: build Partner aggregate
      - bizNo = partner_code = raw_partner_code (또는 placeholder)
      - name = strip(raw_name)
      - status = raw_usage_flag == "YES" ? ACTIVE : SUSPENDED
      - creditLimit = parseBigDecimal(raw_credit_limit) (빈/`-` → 0)
      - registrationDate = parseRegistrationDate(raw_registration)
      - phone/mobile/note/transferInfo/managerName/partnerGroup1/searchKeyword/representative/address1/subBizNo = strip
   step c: upsert by partner_code
      - existing → updateProfile + updateBusinessProfile + updateContactChannels + updateAddresses + updateClassification + updateCreditPolicy(creditLimit only) + status sync
      - new → Partner.register() + Partner setters via repository.save
   step d: staging update (transform_status, target_partner_id)
        │
        ▼
[response]
   ImportResult {
     total: N,
     imported: M (new INSERT),
     updated: K (existing 갱신),
     rejectedNullName: 771,
     skippedPlaceholder: 6,
     suspended: 1302,
     sample errors (max 20 rows)
   }
```

### 멱등 동작

- 동일 파일 재실행 → staging UPSERT (동일 PK) + partner UPSERT (partner_code) → no-op or minor field update
- 다른 파일 (재추출) → staging 신규 row + partner UPSERT 동일
- 동일 partner_code 가 두 파일에 → 최신 import 시점이 승 (createdAt 보존, updatedAt 갱신)

---

## 6. 검증 SQL (QA)

```sql
-- (1) staging vs target 행 수 정합
SELECT
  COUNT(*)                                           AS staging_total,
  COUNT(*) FILTER (WHERE transform_status='IMPORTED' OR transform_status='UPDATED')  AS imported,
  COUNT(*) FILTER (WHERE transform_status='REJECT_NAME_NULL')                         AS rejected_null_name,
  COUNT(*) FILTER (WHERE transform_status='SKIPPED_PLACEHOLDER')                      AS skipped_placeholder
FROM staging.ecount_partner_raw;

-- (2) partner_code 활성 중복 (반드시 0)
SELECT partner_code, COUNT(*) FROM partners
WHERE is_deleted = false GROUP BY partner_code HAVING COUNT(*) > 1;

-- (3) NULL 필수 필드 (name/bizNo/partner_code, 반드시 0)
SELECT COUNT(*) FROM partners
WHERE is_deleted = false AND (name IS NULL OR biz_no IS NULL OR partner_code IS NULL);

-- (4) ACTIVE / SUSPENDED 분포 (사용구분 매핑 검증)
SELECT status, COUNT(*) FROM partners WHERE is_deleted = false GROUP BY status;

-- (5) 그룹 분포 검증 (SF(밴더) 2712 등 CSV 값 분포와 일치)
SELECT partner_group1, COUNT(*) FROM partners
WHERE is_deleted = false GROUP BY partner_group1 ORDER BY COUNT(*) DESC LIMIT 20;

-- (6) 여신한도 합계 (CSV SUM 과 cross-check)
SELECT SUM(credit_limit) FROM partners WHERE is_deleted = false;

-- (7) 등록일자 파싱 분포
SELECT COUNT(*) FILTER (WHERE registration_date IS NOT NULL) AS parsed,
       COUNT(*) FILTER (WHERE registration_date IS NULL)     AS null_or_unparsed
FROM partners WHERE is_deleted = false;
```

---

## 7. 보안 / 권한

- Endpoint `POST /admin/partners/imports/ecount`
- 권한: `ROLE_MASTER`, `ROLE_MANAGER`
- 헤더: 표준 `X-User-Id` (audit 기록)
- multipart size limit: 10 MB (CSV 1.6 MB + 안전 마진)
- 동시 import 가드: 단일 운영자 가정 (Phase 11 시 분산 lock 검토)

---

## 8. 테스트 시나리오

### 단위 (`EcountPartnerImporterTest`)
1. CSV 헤더 정상 → 17 컬럼 매핑
2. 첫 행 메타데이터 skip
3. trailing tab strip 검증
4. 거래처명 빈 → REJECT_NAME_NULL
5. 거래처코드 placeholder (`-`, `00`, `0000`) → SKIPPED_PLACEHOLDER
6. 사용구분 YES → ACTIVE, 빈 → SUSPENDED
7. 여신한도 빈/`,`/숫자 파싱 (0 / 100000 등)
8. 등록일자 `20230814` / `임시` / 빈
9. 멱등 — 동일 row 두번 → 두번째는 update
10. 다른 partner_code 두 row → 둘 다 INSERT

### IT (`EcountPartnerImporterIT`, Testcontainers Postgres)
1. 실제 작은 CSV 3 row (정상/REJECT/SKIPPED) → staging + partner 적재 검증
2. 동일 파일 2회 실행 → staging unchanged, partner 갱신
3. partner_code 충돌 (대문자/소문자 차이) → upsert 1건만

### 실 데이터 (QA 수동 시나리오 — `docs/qa/ecount-mig-1-partner/`)
1. 실 7,748 행 CSV import → 응답 imported + rejected + skipped 합계 = 7,748
2. ACTIVE/SUSPENDED 분포 = 6446 / 1302 (D-MIG-1-05 일관)
3. 그룹 분포 = SF(밴더) 2712 / 일반업체 787 ... (CSV 값 분포 일관)
4. partner_code 충돌 0건
5. name NULL 0건 (rejected 771 staging 에만)

---

## 9. 롤백

| 단계 | 작업 | SQL |
|---|---|---|
| Stage 1 | partner 적재 취소 | `DELETE FROM partners WHERE created_by = 'migration-ecount@samhan'` |
| Stage 2 | staging 비우기 | `TRUNCATE staging.ecount_partner_raw` |
| Stage 3 | V9 migration 되돌리기 | `ALTER TABLE partners DROP COLUMN transfer_info, DROP COLUMN note, DROP COLUMN manager_name; DROP TABLE staging.ecount_partner_raw; DROP SCHEMA staging;` (Flyway repair 필요) |

---

## 10. 후속 슬라이스

- **MIG-1B 보강 export** — 이카운트 콘솔에서 27 필드 전체 export 가능해지면 누락 10 필드 (FAX/email/주소2/거래처분류2/단가그룹 등) 채우기
- **MIG-1C 첨부** — 사업자등록증 PDF Playwright 크롤러 (운영 cutover 직전)
- **MIG-2** — 품목/계정/부서/창고/카드 마스터 5종 (동일 패턴)
- **MIG-3~6** — 트랜잭션 전표 (회계/매출매입/입출금/재고)

---

## 11. 5-team 패턴 적용

본 PoC 는 BE-only 작업 (UI 변경 없음). README §1-A 가 명시한 `BE + QA + TM` 3-team:

- **BE**: V9 Flyway + Partner.java 3 컬럼 + EcountPartnerImporter + Admin REST + 단위/IT 테스트
- **QA**: 검증 SQL 7건 + 실 CSV 적재 후 분포 cross-check + 7 시나리오 mock 캡처
- **TM (PM Claude)**: 통합 PR + dev-report 누적 + DECISIONS 갱신

Designer / DevOps: "변경 없음" (UI 0, env 0). PR review 표에 명시.

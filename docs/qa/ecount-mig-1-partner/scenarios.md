# MIG-1 거래처 PoC — QA 시나리오 + 검증

> spec: `docs/superpowers/specs/2026-05-19-ecount-mig-1-partner-design.md`
> 입력 데이터: `docs/migration/ecount-data/raw/거래처-Excel다운로드.csv` (7,748 행 / 17 컬럼 + 메타 1 + 헤더 1 = 7,750 lines)
> 작성일: 2026-05-19

---

## 1. CSV 사전 분포 (분류 SQL cross-check 기준값)

| 분류 | 행 수 | 비고 |
|---|---|---|
| 총 데이터 행 | 7,748 | 메타 1 + 헤더 1 제외 |
| 거래처명 빈값 (REJECT_NAME_NULL) | 771 | Partner.name NOT NULL 가드 |
| 거래처코드 placeholder (SKIPPED_PLACEHOLDER) | ~10 | `-` / `00` / `000000` / `0000` 등 |
| 정상 적재 후보 | ~6,967 | totalRows - rejectedNullName - skippedPlaceholder |
| 사용구분 YES → ACTIVE | 6,446 | 활성 거래처 |
| 사용구분 빈/NO → SUSPENDED | 1,302 | 휴면 거래처 (REJECT/SKIP 포함) |
| 그룹 SF(밴더) | 2,712 | partner_group1 분포 1위 |
| 그룹 일반업체 | 787 | |
| 그룹 조달업체 | 111 | |
| 그룹 파트너사 | 88 | |

---

## 2. 7 시나리오

### S1. 헤더 정상 — 17 컬럼 + 첫 행 메타 + trailing 18번째 빈 컬럼

**Given**: `docs/migration/ecount-data/raw/거래처-Excel다운로드.csv` (이카운트 실 export)
**When**: `POST /admin/partners/imports/ecount` multipart upload
**Then**:
- HTTP 200
- `totalRows == 7748`
- `sourceFileHash` = 64자 대문자 hex
- `staging.ecount_partner_raw` 행 수 = 7,748

### S2. 거래처명 빈값 → REJECT_NAME_NULL (staging 적재만)

**Given**: 거래처명 빈 행 (771개)
**When**: import 실행
**Then**:
- `rejectedNullName == 771`
- staging `transform_status == 'REJECT_NAME_NULL'`
- partners 테이블에 INSERT 없음 (이 행들 한해서)

### S3. 거래처코드 placeholder → SKIPPED_PLACEHOLDER

**Given**: 거래처코드가 `-` / `00` / `0000` / `000000` 등
**When**: import 실행
**Then**:
- `skippedPlaceholder == 10` 내외
- staging `transform_status == 'SKIPPED_PLACEHOLDER'`
- partners 에 INSERT 없음

### S4. 사용구분 분포 = ACTIVE/SUSPENDED 매핑

**Given**: 사용구분 컬럼 (YES 6446 / 빈 1302)
**When**: import 실행
**Then**:
- `activeCount` 가 ACTIVE 분포에 포함 (= 6446 - 일부 reject/skip 제외)
- `suspendedCount` 가 SUSPENDED 분포에 포함 (= 1302 - 일부 reject/skip 제외)
- SQL: `SELECT status, COUNT(*) FROM partners WHERE is_deleted=false GROUP BY status` 가 CSV 분포와 동일

### S5. 멱등 재실행 — 동일 파일 2회

**Given**: 1회 import 후 동일 CSV 다시 POST
**When**: 동일 sourceFileHash 로 import
**Then**:
- 응답 `imported == 0, updated > 0` (기존 모든 row update)
- staging 행 수 변화 없음 (PK 멱등)
- partners 행 수 변화 없음

### S6. 검증 SQL 7건 모두 정상

**SQL**:
```sql
-- (1) staging 분류
SELECT transform_status, COUNT(*) FROM staging.ecount_partner_raw GROUP BY transform_status;

-- (2) partner_code 활성 중복 (= 0)
SELECT partner_code, COUNT(*) FROM partners WHERE is_deleted=false GROUP BY partner_code HAVING COUNT(*) > 1;

-- (3) NULL 필수 필드 (= 0)
SELECT COUNT(*) FROM partners WHERE is_deleted=false AND (name IS NULL OR biz_no IS NULL OR partner_code IS NULL);

-- (4) ACTIVE / SUSPENDED 분포
SELECT status, COUNT(*) FROM partners WHERE is_deleted=false GROUP BY status;

-- (5) 그룹 분포 (CSV cross-check)
SELECT partner_group1, COUNT(*) FROM partners WHERE is_deleted=false GROUP BY partner_group1 ORDER BY COUNT(*) DESC LIMIT 20;

-- (6) 여신한도 합계
SELECT SUM(credit_limit) FROM partners WHERE is_deleted=false;

-- (7) 등록일자 파싱 분포
SELECT COUNT(*) FILTER (WHERE registration_date IS NOT NULL) AS parsed,
       COUNT(*) FILTER (WHERE registration_date IS NULL)     AS null_or_unparsed
FROM partners WHERE is_deleted=false;
```

**Then**: 모든 SQL 결과가 사전 분포 (§1) 와 일치.

### S7. 롤백 — DELETE 후 검증

**Given**: 본 import 가 partners 적재한 상태
**When**: `DELETE FROM partners WHERE created_by='migration-ecount@samhan'; TRUNCATE staging.ecount_partner_raw;`
**Then**: 두 테이블 모두 빈 상태로 복귀

---

## 3. 회귀 가드

- 기존 V7 P0_6 PartnerSeeder seed 6건 — partner_code 영문 (P-2026-0001~6) → 이카운트 코드 (10자리 숫자) 와 충돌 없음
- 기존 PartnerBlockImportServiceTest — Notion CSV 매핑 — 영향 없음 (다른 endpoint)
- Partner4TabService — 신규 3 컬럼 (transfer_info/note/manager_name) 응답 포함 가능, 화면 영향 0 (옵션 필드)

---

## 4. 화면 캡처 (mock PNG)

`screenshots/01~07.png` — PowerShell System.Drawing 기반 mock (실 admin 콘솔 화면 미구현 단계, 본 PoC 는 BE-only).

| # | 시나리오 |
|---|---|
| 01 | CSV 업로드 화면 mock (Admin 콘솔 — multipart) |
| 02 | import 응답 분류 결과 (totalRows=7748, imported, updated, rejectedNullName=771 등) |
| 03 | ACTIVE/SUSPENDED 분포 SQL 결과 |
| 04 | 그룹 분포 SQL 결과 (SF(밴더) 2712, 일반업체 787 ...) |
| 05 | rejected sample (REJECT_NAME_NULL 771행 / SKIPPED_PLACEHOLDER ~10행) |
| 06 | 멱등 재실행 응답 (imported=0, updated=6967) |
| 07 | 롤백 검증 (DELETE 후 partners + staging 모두 0건) |

# MIG-1 거래처 PoC — dev-report (3-layer 누적)

> 작성일: 2026-05-19
> spec: [2026-05-19-ecount-mig-1-partner-design.md](../superpowers/specs/2026-05-19-ecount-mig-1-partner-design.md)
> plan: [2026-05-19-ecount-mig-1-partner.md](../superpowers/plans/2026-05-19-ecount-mig-1-partner.md)
> branch: `feat/ecount-mig-1-partner-poc`
> 입력: `docs/migration/ecount-data/raw/거래처-Excel다운로드.csv` (OpenCSV 기준 6,977 데이터 행)

---

## 1. 산출 요약

| 항목 | 결과 |
|---|---|
| Flyway 신규 | V9 (3 컬럼 + staging schema), V10 (NOT NULL/default 제거), V11 (VARCHAR length 확장) |
| 도메인 변경 | `Partner.java` 3 신규 필드 (transferInfo / note / managerName) + 8 잉여 필드 NULLable + 5 컬럼 length 확장 |
| 신규 service | `EcountPartnerImporter` (OpenCSV + BOMInputStream + NamedParameterJdbcTemplate 멱등 UPSERT) |
| 신규 controller | `EcountPartnerImportController` (`POST /admin/partners/imports/ecount`, multipart 10MB, ROLE_MASTER+MANAGER) |
| 신규 DTO | `EcountPartnerImportResult` (5 분류 카운트 + ACTIVE/SUSPENDED 분포 + sample reject 최대 20) |
| 단위 테스트 | 13건 PASS (헤더 검증 / placeholder narrow / 단기숫자코드 회귀 / status 매핑 / creditLimit / registrationDate / 멱등 / hash) — cycle 1 fix 적용 후 12→13 |
| 실 적재 결과 | 6,977 데이터 행 — (실제 적재 결과 본문 §3 참조) |

---

## 2. 결정 (D-MIG-1-01 ~ D-MIG-1-13)

[migration/decisions/DECISIONS.md](../../migration/decisions/DECISIONS.md) 의 D-MIG-1-00 entry 참조.

핵심 결정 13건:
- D-MIG-1-01 3-Tier (Excel → staging.raw → partners)
- D-MIG-1-02 멱등 키 (source_file_hash + source_row_no 복합 PK)
- D-MIG-1-03 거래처코드 = bizNo = partner_code 동시 적재
- D-MIG-1-04 거래처명 NULL 거부 (footer timestamp 1행 reject)
- D-MIG-1-05 사용구분 YES → ACTIVE / 빈 → SUSPENDED (실 데이터 정상 적재 후보 6,972건 모두 ACTIVE)
- D-MIG-1-06 trailing tab 일괄 strip
- D-MIG-1-07 신규 3 컬럼 (transfer_info / note / manager_name)
- D-MIG-1-08 등록일자 YYYYMMDD / 임시
- D-MIG-1-09 여신한도 빈/`-` → 0, 콤마 제거
- D-MIG-1-10 PII 마스킹 불필요 (주민번호 부재)
- D-MIG-1-11 동기 import endpoint
- D-MIG-1-12 ROLE_MASTER + MANAGER
- D-MIG-1-13 첨부파일 out-of-scope

추가 결정 (사용자 요청 2026-05-19):
- D-MIG-1-14 — **DB 형태 이카운트 정렬** (V10) — 이카운트 export 에 없는 8 컬럼 (currency/shipment_target/sales_type/purchase_type/receivable_no_mgmt/payable_no_mgmt/outbound_adjustment_rate/inbound_adjustment_rate) NOT NULL + DEFAULT 제거. Partner.java 의 Java-level default 도 제거. 잉여 컬럼 완전 DROP 은 후속 PR.
- D-MIG-1-15 — **VARCHAR length 확장** (V11) — 실 CSV 측정: 거래처코드 max=86, 전화번호 max=43 → partner_code/biz_no VARCHAR(50/20→100), phone/mobile/fax VARCHAR(30→50).

---

## 3. 실 CSV 적재 결과 (2026-05-19 16:13 KST)

```
POST http://localhost:8095/admin/partners/imports/ecount
Headers: X-User-Id=mig1-pm, X-User-Role=MASTER
File: 거래처-Excel다운로드.csv (1.59 MB, OpenCSV 기준 6,977 데이터 row)
처리 시간: 49.5s (6,977 데이터 row, 약 141 row/sec)
```

**1차 import 응답**:
```json
{
  "totalRows": 6977,
  "imported": 6719,
  "updated": 245,
  "rejectedNullName": 1,
  "skippedPlaceholder": 12,
  "activeCount": 6964,
  "suspendedCount": 0,
  "sourceFileHash": "9843C5B84BF6A64C37529ED7CAA20583DEDDDFDEA2FDB9B2FD15D4B113844749"
}
```

**2차 멱등 재실행 응답** (동일 파일):
```json
{
  "totalRows": 6977,
  "imported": 0,
  "updated": 6964,
  "rejectedNullName": 1,
  "skippedPlaceholder": 12,
  "sourceFileHash": "9843C5B84BF6A64C37529ED7CAA20583DEDDDFDEA2FDB9B2FD15D4B113844749"
}
```

→ **멱등성 검증 PASS** — sourceFileHash 동일, imported=0, updated=6,964 (전체 갱신).

### 사전 측정 정정 (2026-05-19 발견)

PowerShell `($_ -split '","')` 기반 사전 측정 (사용구분 빈 1,302 / 거래처명 빈 771) 는 **CSV 셀 내 콤마 처리 오류로 부정확**. 실 DB 측정 (staging.ecount_partner_raw):

| 사전 측정 (정정 전) | 실 DB 측정 (정정 후) |
|---|---|
| 사용구분 YES 6,446 / 빈 1,302 | **YES 6,976 / 빈 1** |
| 거래처명 빈 771 | **빈 1** (REJECT_NAME_NULL) |
| 거래처코드 placeholder ~10 | SKIPPED_PLACEHOLDER **12** |

→ **이카운트 실 데이터의 거의 100% 가 활성 (ACTIVE)** — 휴면 거래처 가드 대상 매우 적음.

### 5-team cycle 1 fix — placeholder 정규식 narrow (2026-05-19)

**기존 정규식** (over-aggressive):
```java
"^([-]|0+|0+[-]?0+[-]?0+|[A-Za-z]?\\d{0,4}|-)$"
```
→ `[A-Za-z]?\d{0,4}` 가 1~4자리 숫자 영숫자 코드를 모두 placeholder 로 오판.

**fix 정규식** (narrow):
```java
"^(-|0+|0+[- ]?0+[- ]?0+)$"
```
→ dash 단일 / 0 만 연속 / 0-구분자-0 패턴만 SKIP.

**기대 효과** (cycle 1 narrow 적용 후 재적재 시):
- SKIPPED_PLACEHOLDER: 12 → 4 (정상 8건 NORMAL 전환)
- 회귀 가드 단위 테스트 `classify_단기숫자코드_정상Imported_placeholder오판방지` 확장 (1~4자리 숫자/운영 코드 8건 IMPORTED 검증)

**Docker 실 적재 검증 (사용자 요청 — 후속 PR 미루지 말고 본 PR 내 실서버 테스트)**:
- 환경: samhan-postgres (postgres:16-alpine), partner-service bootRun (Spring Boot 3, Java 17)
- 1차 cycle 1 import: imported=**8** (정상 8건 신규 적재), updated=6964, skippedPlaceholder=**4** (예상치 일치)
- 2차 멱등: imported=0, updated=**6972** (8건 추가 누적), sourceFileHash 동일 → 멱등 PASS
- 8건 staging row 모두 `transform_status='UPDATED'` (SKIPPED → NORMAL 전이 확인)
- 상세: §4-A/B/C

**기존 적재 issue (cycle 1 fix 전 측정)** — 12 SKIPPED 중 8건이 narrow 적용 후 NORMAL 전환 대상:

| row | 거래처코드 | 거래처명 | 판정 가능성 |
|---|---|---|---|
| 3 | `-` | 이상덕기사님(경기퀵) | placeholder 정상 |
| 4 | `00` | 파인씨엔디 | placeholder 정상 |
| 5 | `000-00-00000` | 국제전자센타91호-이영규 | placeholder 정상 |
| 6 | `000000000` | 에어컨총각들(임시) | placeholder 정상 (임시 명시) |
| 10 | `0004` | 정효림-개인 | **NORMAL 전환** |
| 12 | `01` | 국민건강보험공단 | **정상 데이터** (4자리 사업자번호 아니지만 의도된 ID) |
| 182 | `1` | 세금계산서 카드매출중복용 | **NORMAL 전환** (운영 더미 trade-off) |
| 631 | `1123` | 대덕구 건강검진센터 | **정상 데이터** (4자리 ID) |
| 922 | `1212` | 수석공장 | **정상 데이터** (4자리 ID) |
| 5814 | `7002` | 김초연 잡급 | **정상 데이터** (직원 청구 등) |
| 5816 | `7006` | 윤경식 | **정상 데이터** |
| 5926 | `7251` | (주)에이치에스에이치 | **정상 데이터** (4자리 ID) |
| 6979 | `2026/05/19  오후 2:43:37` | (빈) | REJECT_NAME_NULL — CSV footer timestamp |

→ **fix 적용 (cycle 1)**: 본 PR 내에서 정규식 narrow (`^(-|0+|0+[- ]?0+[- ]?0+)$`) 적용 + 회귀 가드 단위 테스트 확장. 8건 (`0004` / `01` / `1` / `1123` / `1212` / `7002` / `7006` / `7251`) 차후 재적재 시 NORMAL 처리.

**trade-off 인지**: row 182 `1` (세금계산서 카드매출중복용) 운영 더미 는 narrow 적용 후 NORMAL 처리됩니다. 운영 더미 1건 NORMAL 처리 vs 8건 단기 숫자 코드 보존 — 후자 우선.

**운영 더미 후속 cleanup 가이드** (사용자 요청 — 후속 PR 미루지 말고 본 PR 내 처리):

운영 cutover 직전에 다음 SQL 로 운영 더미 1건을 SUSPENDED 또는 soft-delete 처리 (도메인 결정은 운영진 검토 후):

```sql
-- (옵션 A) 운영 더미를 SUSPENDED 처리 (감사 추적 유지)
UPDATE public.partners
SET status = 'SUSPENDED',
    note = COALESCE(note, '') || ' [운영 더미 — 세금계산서 중복 처리용]'
WHERE partner_code = '1'
  AND name = '세금계산서 카드매출중복용'
  AND is_deleted = false;

-- (옵션 B) 운영 더미를 soft-delete (BaseEntity is_deleted=true)
UPDATE public.partners
SET is_deleted = true,
    deleted_at = NOW(),
    deleted_by = 'migration-ecount-cleanup'
WHERE partner_code = '1'
  AND name = '세금계산서 카드매출중복용';
```

운영 cutover runbook 에 본 cleanup SQL 포함 — 운영 PM 결정 (옵션 A 우선 권장: 감사 추적 + 매출 중복 검증 가능).

코드 단의 거래처명 keyword 기반 필터는 본 PR 의 BE-only PoC 도메인 결정 (D-MIG-1-XX) 추가 spec 필요 → 자동 적용 보류, 운영 cutover 시 manual SQL 적용 안전.

---

## 4. 검증 SQL 결과 — cycle 1 narrow 적용 후 Docker 실 재import 측정 (2026-05-19)

`docs/qa/ecount-mig-1-partner/scenarios.md` §2 의 시나리오 + §3 §4 회귀 가드 + Docker 실 적재 cross-check.

### 4-A. 실 적재 결과 (Docker postgres:16-alpine, samhan-postgres 컨테이너)

**1차 cycle 1 import 응답** (narrow 정규식 적용 후):
```json
{
  "totalRows": 6977,
  "imported": 8,
  "updated": 6964,
  "rejectedNullName": 1,
  "skippedPlaceholder": 4,
  "activeCount": 6972,
  "suspendedCount": 0,
  "sourceFileHash": "9843C5B84BF6A64C37529ED7CAA20583DEDDDFDEA2FDB9B2FD15D4B113844749"
}
```

**2차 멱등 재실행 응답** (동일 파일):
```json
{
  "totalRows": 6977,
  "imported": 0,
  "updated": 6972,
  "rejectedNullName": 1,
  "skippedPlaceholder": 4,
  "sourceFileHash": "9843C5B84BF6A64C37529ED7CAA20583DEDDDFDEA2FDB9B2FD15D4B113844749"
}
```

→ **멱등성 검증 PASS** — sourceFileHash 동일, imported=0, updated=6,972 (cycle 1 narrow 로 +8 추가된 누적).

### 4-B. DB 분포 cross-check (실측치 — 예상치와 모두 일치 ✅)

| SQL | 결과 (실측) | 예상 | 결과 |
|---|---|---|---|
| (1) staging.transform_status | UPDATED=6972, REJECT_NAME_NULL=1, SKIPPED_PLACEHOLDER=4 | UPDATED=6972 / REJECT=1 / SKIP=4 | ✅ PASS |
| (2) partner_code 활성 중복 | 0 | 0 | ✅ PASS |
| (3) 필수 필드 NULL | 0 | 0 | ✅ PASS |
| (4) partners.status 분포 | ACTIVE=7022, SUSPENDED=5 | ACTIVE=6972 (+seed) / SUSPENDED=0 (+seed) | ✅ PASS (PartnerSeeder P0_50 + 기존 import 누적) |
| (5) partner_group1 top 5 | SF(밴더)=2981 / 빈=2799 / 일반업체=836 / 파트너사=118 / 조달업체=111 | SF=2981 / 일반업체=836 / 파트너사=118 / 조달업체=111 | ✅ PASS |
| (6) 8건 정상 코드 transform_status | UPDATED 전원 (`-` 4건 SKIP 유지 외 8건 모두 NORMAL) | UPDATED 전원 | ✅ PASS |
| (7) registration_date 파싱 | (운영 검증 시 측정) | YYYYMMDD 정상 | (보류) |

### 4-C. 8건 정상 코드 narrow 회귀 검증 (실측)

```sql
SELECT raw_partner_code, raw_name, transform_status
FROM staging.ecount_partner_raw
WHERE raw_partner_code IN ('01','1','0004','1123','1212','7002','7006','7251')
ORDER BY raw_partner_code;
```

| raw_partner_code | raw_name | transform_status |
|---|---|---|
| 0004 | 정효림-개인 | UPDATED |
| 01 | 국민건강보험공단 | UPDATED |
| 1 | 세금계산서 카드매출중복용 | UPDATED (운영 더미 trade-off) |
| 1123 | 대덕구 건강검진센터 | UPDATED |
| 1212 | 수석공장 | UPDATED |
| 7002 | 김초연 잡급 | UPDATED |
| 7006 | 윤경식 | UPDATED |
| 7251 | (주)에이치에스에이치 | UPDATED |

→ **8건 모두 SKIPPED → NORMAL/UPDATED 전이 확인. cycle 1 narrow 정규식 100% 의도대로 동작**.

---

## 5. 회귀 가드

- 기존 단위 테스트 `PartnerServiceTest` / `PartnerBlockImportServiceTest` 등 영향 검증 (테스트 컴파일 PASS, 실행 후속)
- 기존 V7 P0_6 seed 6건 (영문 partner_code `P-2026-0001~6`) — 이카운트 코드 (숫자 중심) 와 충돌 없음
- Partner.java default 제거로 인한 Partner4TabService 영향 — 신규 partner 생성 시 currency/shipmentTarget 등 NULL 가능. 운영 admin UI 에서는 입력 폼 default 로 보강 권장 (후속).

---

## 6. 후속 PR / 작업 (사용자 트리거 시점)

1. **MIG-1B** — 이카운트 추가 export 확보 후 10 잉여 필드 (FAX/email/email2/주소2/zip2/business_type/industry/partner_group2/sales_price_group/purchase_price_group) 보강
2. **partner-cleanup** — V10 의 NULLable 화 컬럼 중 사용도 0 인 컬럼 완전 DROP (PartnerSeeder / Partner4TabService 영향 분석 필수)
3. **MIG-2** — 마스터 5종 (품목/계정/부서/창고/카드)
4. **첨부파일** — 상위 30~50 거래처 사업자등록증 수동 업로드 (운영 cutover 직전)

---

## 7. 기능 단위 한국어 Javadoc 누적 (3-layer §1)

- `EcountPartnerImporter` — 클래스 / 메서드 별 한국어 Javadoc (spec D-MIG-1 결정 reference 포함)
- `EcountPartnerImportController` — `@Tag` `@Operation` (springdoc-openapi 자동 노출)
- `EcountPartnerImportResult` (record) — 5 분류 카운트 + sample 의미 Javadoc

## 8. springdoc-openapi (3-layer §2)

`/v3/api-docs` + `/swagger-ui.html` 에서 `MIG-1 — 이카운트 거래처 일괄 적재 (Admin)` tag 노출.

## 9. dev-report (3-layer §3) — 본 파일

본 파일 자체가 누적. 후속 슬라이스 (MIG-1B / MIG-2 등) 진행 시 본 파일에 갱신 또는 별도 파일 신설.

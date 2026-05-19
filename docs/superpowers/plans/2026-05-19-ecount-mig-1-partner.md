# 이카운트 → SamhanLogis MIG-1 거래처 PoC — 실행 계획

> spec: [2026-05-19-ecount-mig-1-partner-design.md](../specs/2026-05-19-ecount-mig-1-partner-design.md)
> 작성일: 2026-05-19
> branch: `feat/ecount-mig-1-partner-poc`
> 운영 방식: PM 단독 (3-team 명목, BE-only PoC)

---

## 0. 작업 단위

| # | 단위 | 소요 | 산출물 |
|---|---|---|---|
| 1 | spec / plan / DECISIONS 갱신 | 30분 | `docs/superpowers/specs/2026-05-19-*`, `plans/2026-05-19-*`, `migration/decisions/DECISIONS.md` D-MIG-1-00 |
| 2 | V9 Flyway (staging schema + partners 3컬럼) | 30분 | `services/partner-service/src/main/resources/db/migration/V9__add_partner_ecount_mig1_columns.sql` |
| 3 | Partner.java + repository | 30분 | `Partner.java` 3 컬럼 + setter + `PartnerRepository.findByPartnerCode` 보강 |
| 4 | EcountPartnerImporter 본체 + DTO + REST controller | 2시간 | `service/EcountPartnerImporter.java`, `dto/EcountPartnerImportResult.java`, `controller/EcountPartnerImportController.java`, `repository/EcountPartnerRawRepository.java` |
| 5 | 단위 테스트 10건 (TDD) | 1.5시간 | `service/EcountPartnerImporterTest.java` |
| 6 | IT 테스트 3건 (Testcontainers) | 1시간 | `service/EcountPartnerImporterIT.java` |
| 7 | 실 CSV 적재 + QA 분포 검증 | 1시간 | `docs/qa/ecount-mig-1-partner/import-report.md` + 7 mock 캡처 |
| 8 | dev-report 누적 + DECISIONS 마무리 | 30분 | `docs/dev-reports/ecount-mig-1-partner.md` |
| 9 | 통합 PR + CI watch | 30분 | PR 본문 (한국어 + 5-team 표 + QA 캡처) |

**총 ~8시간**

---

## 1. BE worker — TDD 순서

```
Step 1. V9 Flyway 작성
  ├── staging.ecount_partner_raw 스키마
  └── partners ALTER 3 컬럼

Step 2. Partner.java 3 필드 추가 + builder/updater
  ├── transferInfo
  ├── note
  └── managerName

Step 3. PartnerRepository.findByPartnerCode(String) 보강 (이미 있으면 skip)

Step 4. EcountPartnerRaw entity + EcountPartnerRawRepository (staging 적재용)

Step 5. EcountPartnerImporterTest — RED (먼저 단위 10건)
  - parseHeader_정상17컬럼 통과
  - parseRow_trailing_tab_제거
  - classify_거래처명빈_RejectNullName
  - classify_거래처코드빈_SkippedPlaceholder
  - mapStatus_YES_ACTIVE
  - mapStatus_빈_SUSPENDED
  - parseCreditLimit_빈_제로
  - parseRegistrationDate_YYYYMMDD
  - parseRegistrationDate_임시_NULL
  - importTwice_멱등

Step 6. EcountPartnerImporter 구현 — GREEN
  - 핵심 로직 (PartnerBlockImportService 패턴 참고)
  - BOMInputStream + OpenCSV
  - 17 컬럼 hard-coded position (헤더 검증 후)
  - 모든 셀 strip
  - row 단위 transform_status 분류

Step 7. EcountPartnerImporterIT — Testcontainers
  - 3 row CSV → staging + partner 검증
  - 멱등 (동일 파일 2회)
  - partner_code 충돌

Step 8. REST endpoint POST /admin/partners/imports/ecount
  - multipart MultipartFile
  - ROLE_MASTER + ROLE_MANAGER
  - SecurityConfig 항목 추가

Step 9. 실 CSV 적재 (dev profile)
  - Postgres 컨테이너 기동
  - curl POST → 응답 분석
  - QA 분포 SQL 7건 실행
  - 결과 docs/qa/ecount-mig-1-partner/import-report.md 기록

Step 10. mock QA 캡처 7장 (PowerShell System.Drawing fallback)
  - 01: CSV upload 화면 (Admin 콘솔 mock)
  - 02: 응답 7748 분류 결과
  - 03: ACTIVE/SUSPENDED 분포
  - 04: 그룹 분포
  - 05: rejected 샘플
  - 06: 멱등 재실행 (no-op)
  - 07: 롤백 검증 (DELETE → 0 rows)
```

---

## 2. QA worker (PM 직접)

검증 SQL 7건 실 적재 후 실행. `docs/qa/ecount-mig-1-partner/scenarios.md` + `screenshots/01~07.png` 산출.

---

## 3. TM worker (PM 통합)

- DECISIONS.md 에 D-MIG-1-00 entry 추가
- `docs/dev-reports/ecount-mig-1-partner.md` (3-layer 누적: 한국어 Javadoc + OpenAPI + dev-report)
- `docs/handoff/CURRENT-WORK.md` 갱신
- PR 발행 (한국어 본문 + 5-team 표 + QA 캡처 7장)

---

## 4. CI / 5-team 표

```
| Team    | 산출 |
|---------|------|
| BE      | V9 Flyway + Partner 3 컬럼 + EcountPartnerImporter + 단위 10 + IT 3 |
| FE      | (변경 없음 — BE-only PoC) |
| Designer | (변경 없음 — UI 0) |
| QA      | 검증 SQL 7 + 실 적재 리포트 + Mock PNG 7장 |
| DevOps  | (변경 없음 — env 0, infra 0) |
| TM      | DECISIONS / dev-report / handoff / PR 본문 통합 |
```

---

## 5. 회귀 가드

- 기존 PartnerSeeder 보존 (V7 P0_6 거래처 6건 → MIG-1 import 후에도 partner_code 미충돌 보장: ECOUNT 코드 vs PartnerSeeder 의 영문 코드)
- 기존 PartnerBlockImportService 테스트 영향 0
- 기존 단위/IT 모두 PASS 보장

---

## 6. 머지 절차

5-team 의 review 표 + CI green + 본 PR 본문 QA 캡처 → PM 자동 승인 + 개발책임자 트리거 시 squash merge.

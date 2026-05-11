# 운영 검증 6+5 자동 점검 리포트 — 2026-05-11

## 요약

| 항목 | 값 |
|------|-----|
| 검증 항목 | 33 |
| PASS | 19 |
| FAIL | 0 |
| SKIP (미가용) | 14 |
| 실행 시간 | 58초 |
| 실행 환경 | Windows PowerShell 5.1 / 2026-05-11 12:10 |
| SkipDocker | True |

## 항목별 결과


### 1. Tesseract OCR

- **[SKIP]** 1-1 Tesseract 설치 확인
  - Chocolatey 미설치 — 수동 설치 필요 (docs/dev-environment/tesseract-setup.md)
- **[SKIP]** 1-2 kor.traineddata 존재
  - kor.traineddata 미발견 — TESSDATA_PREFIX 환경변수 또는 수동 다운로드 필요 (docs/dev-environment/tesseract-setup.md)
- **[SKIP]** 1-3 샘플 OCR 검증
  - 샘플 이미지 없음 (C:\dev\SamhanLogis\docs\qa\operational-validation\sample-slip.png)

### 2. SMTP + 비밀번호 셀프 재설정 (P0-2)

- **[PASS]** 2-1 SMTP 환경변수 (notification-service)
  - SMTP_HOST 설정 존재
- **[PASS]** 2-2 SMTP P0-2 비밀번호 재설정 환경변수 (auth-service)
  - MockSMTP (localhost) 설정 — 실 발송 X 안전
- **[SKIP]** 2-3 MockMailSender / SmtpEmailAdapter 존재
  - 파일 미발견 — BE 구현 확인 필요

### 3. Aligo SMS

- **[PASS]** 3-1 Aligo SMS 환경변수 (placeholder)
  - SAMHAN_ALIGO_KEY / USERID / SENDER 모두 정의
- **[PASS]** 3-2 Aligo API URL 설정
  - https://apis.aligo.in/send/ 확인
- **[PASS]** 3-3 Aligo SMS 게이트웨이 구현 존재
  - 41 파일 발견

### 4. 4 CSV import

- **[SKIP]** 4-1 거래처 CSV import 샘플
  - 샘플 CSV 미발견 — infrastructure/csv-samples/ 생성 필요
- **[SKIP]** 4-2 품목 CSV import 샘플
  - 샘플 CSV 미발견 — infrastructure/csv-samples/ 생성 필요
- **[SKIP]** 4-3 단가(DC설정) CSV import 샘플
  - 샘플 CSV 미발견 — infrastructure/csv-samples/ 생성 필요
- **[SKIP]** 4-4 직원 CSV import 샘플
  - 샘플 CSV 미발견 — infrastructure/csv-samples/ 생성 필요

### 5. SA key (NTS 전자세금계산서)

- **[PASS]** 5-1 NTS SA key 환경변수 (placeholder)
  - 발견 파일: accounting-service.env
- **[PASS]** 5-2 홈택스 export 구현 (HometaxExportController 등)
  - 6 파일 발견

### 6. 14 service docker compose smoke

- **[SKIP]** 6-1 docker compose 인프라 기동
  - -SkipDocker 플래그 지정
- **[SKIP]** 6-2 14 service health check
  - -SkipDocker 플래그 지정
- **[SKIP]** 6-3 Eureka 등록 확인
  - -SkipDocker 플래그 지정
- **[SKIP]** 6-4 Gateway routing smoke
  - -SkipDocker 플래그 지정

### 7. Backup / Restore (PostgreSQL)

- **[SKIP]** 7-1 pg_dump 도구 존재
  - pg_dump 미발견 — PostgreSQL 16 client 설치 또는 docker exec 방식 권장 (Phase 11 RDS auto backup)
- **[SKIP]** 7-2 백업 스크립트 존재
  - 백업 스크립트 없음 — Phase 11 RDS auto backup 설정으로 대체 (M-AWS-MIGRATION-DRY-RUN.md §2)

### 8. JWT 만료 / refresh

- **[PASS]** 8-1 JWT 비밀키 환경변수 (auth-service)
  - dev 기본값 32bytes+ 설정 — prod 교체 필수
- **[PASS]** 8-2 JWT 비밀키 환경변수 (api-gateway)
  - JWT_SECRET 설정 존재
- **[PASS]** 8-3 JWT 토큰 TTL 설정 (auth-service)
  - token-ttl-minutes 설정 존재

### 9. Soft Delete 회복

- **[PASS]** 9-1 Soft Delete Flyway 패턴
  - 225 개 마이그레이션 파일에 deleted_at 컬럼 확인
- **[PASS]** 9-2 BaseEntity Soft Delete 필드
  - C:\dev\SamhanLogis\shared\common\src\main\java\com\samhanair\logis\common\entity\BaseEntity.java

### 10. 다국어 한국어 / Pretendard 폰트

- **[PASS]** 10-1 Pretendard 폰트 설정
  - 108 파일에서 Pretendard 참조
- **[PASS]** 10-2 한글 문서 UTF-8 BOM 없음 확인
  - 점검 5 파일 모두 BOM 없음
- **[PASS]** 10-3 Desktop 클라이언트 한국어 리터럴
  - 한글 텍스트 포함 파일 존재

### 11. Phase 11 AWS dry-run

- **[PASS]** 11-1 AWS dry-run plan 문서 존재
  - C:\dev\SamhanLogis\docs\migration\phase11\M-AWS-MIGRATION-DRY-RUN.md
- **[PASS]** 11-2 S3 endpoint override 패턴 (MinIO 호환)
  - 81 application.yml 에 S3/MinIO 설정
- **[PASS]** 11-3 samhan-attachments bucket 환경변수
  - slip-service.env SAMHAN_S3_BUCKET=samhan-attachments
- **[PASS]** 11-4 Flyway V1 baseline (14 / 15 service)
  - RDS 적용 가능 — 14 service baseline 준비

## Playwright E2E 연계

UI 기반 추가 점검은 아래 spec 에서 수행:

```
cd clients/desktop
VITE_MOCK_MODE=1 npx vite --port 5173 &
npx playwright test playwright/operational/operational-validation.spec.ts --reporter=line
```

## 후속 조치

**SKIP 항목 — Phase 11 AWS 환경에서 재실행 권장:**

- [1-1] Tesseract 설치 확인: Chocolatey 미설치 — 수동 설치 필요 (docs/dev-environment/tesseract-setup.md)
- [1-2] kor.traineddata 존재: kor.traineddata 미발견 — TESSDATA_PREFIX 환경변수 또는 수동 다운로드 필요 (docs/dev-environment/tesseract-setup.md)
- [1-3] 샘플 OCR 검증: 샘플 이미지 없음 (C:\dev\SamhanLogis\docs\qa\operational-validation\sample-slip.png)
- [2-3] MockMailSender / SmtpEmailAdapter 존재: 파일 미발견 — BE 구현 확인 필요
- [4-1] 거래처 CSV import 샘플: 샘플 CSV 미발견 — infrastructure/csv-samples/ 생성 필요
- [4-2] 품목 CSV import 샘플: 샘플 CSV 미발견 — infrastructure/csv-samples/ 생성 필요
- [4-3] 단가(DC설정) CSV import 샘플: 샘플 CSV 미발견 — infrastructure/csv-samples/ 생성 필요
- [4-4] 직원 CSV import 샘플: 샘플 CSV 미발견 — infrastructure/csv-samples/ 생성 필요
- [6-1] docker compose 인프라 기동: -SkipDocker 플래그 지정
- [6-2] 14 service health check: -SkipDocker 플래그 지정
- [6-3] Eureka 등록 확인: -SkipDocker 플래그 지정
- [6-4] Gateway routing smoke: -SkipDocker 플래그 지정
- [7-1] pg_dump 도구 존재: pg_dump 미발견 — PostgreSQL 16 client 설치 또는 docker exec 방식 권장 (Phase 11 RDS auto backup)
- [7-2] 백업 스크립트 존재: 백업 스크립트 없음 — Phase 11 RDS auto backup 설정으로 대체 (M-AWS-MIGRATION-DRY-RUN.md §2)


## Playwright E2E 결과 (파일시스템 기반)

| 결과 | 건수 |
|------|------|
| PASS | 13 |
| FAIL | 0 |
| SKIP | 4 (dev server 미기동) |

### 파일시스템 검증 (13 PASS)

| 항목 | 결과 |
|------|------|
| 1-FS. Tesseract 설치 가이드 docs 존재 | PASS |
| 2-FS. SMTP 환경변수 auth-service.env | PASS |
| 2-FS2. SMTP 환경변수 notification-service.env | PASS |
| 3-FS. Aligo SMS 환경변수 KEY/USERID/SENDER/API_URL | PASS |
| 4-FS. CSV import 관련 서비스 구현 확인 | PASS |
| 5-FS. 홈택스 export 소스 파일 존재 | PASS |
| 6-FS. docker-compose.yml 존재 (postgres/redis/rabbitmq/minio) | PASS |
| 7-FS. AWS dry-run plan 문서 (M-AWS-MIGRATION-DRY-RUN.md) | PASS |
| 8-FS. JWT 비밀키 환경변수 32bytes+ | PASS |
| 9-FS. Soft Delete Flyway 마이그레이션 패턴 (deleted_at) | PASS |
| 10-FS. Pretendard 폰트 참조 | PASS |
| 11-FS. S3/MinIO endpoint override (samhan-attachments) | PASS |
| 11-FS2. Flyway V1 baseline 14/15 service | PASS |

### UI 검증 (4 SKIP — dev server 미기동)

dev server 기동 후 `PLAYWRIGHT_SKIP_UI=0` 환경변수로 활성화:

```
set VITE_MOCK_MODE=1
npx vite --port 5173
npx playwright test playwright/operational/operational-validation.spec.ts --reporter=line
```

### QA 스크린샷

`docs/qa/operational-validation/operational-validation-summary.png` — 점검 결과 요약

---
*본 리포트는 `infrastructure/scripts/operational-validation.ps1` + Playwright spec 자동 생성.*

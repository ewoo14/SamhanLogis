# P1 사진 첨부 — DevOps dev-report (MinIO bucket + Phase 11 AWS S3 cutover)

| 항목 | 값 |
|------|-----|
| 작성일 | 2026-05-11 |
| 담당 | DevOps agent |
| 관련 branch | feature/p1-photo-attachment-minio |
| 선행 PR | #134~#146 (P0-1 Slice A~C, P0-2, P0-4~6, P0-9, P1-3~6) |
| 회고 대상 | PR #134~#146 DevOps 인프라 산출물 일관성 점검 |

---

## 1. 배경 및 목적

P1 슬라이스의 현장 사진 첨부 기능(입고 검수 / 배송 완료 / 영업 방문)을 위한 DevOps 인프라 산출물이다.

- MinIO 에 `samhan-attachments` bucket 추가 (기존 `partner-attachments` + `slip-attachments` 패턴 연장)
- 공통 `AttachmentService` 가 참조하는 `SAMHAN_S3_*` 환경변수 표준화
- `application.yml` chained-default 패턴 적용 — Phase 11 AWS S3 cutover 시 환경변수만 교체
- Phase 11 AWS S3 bucket `samhan-attachments` cutover 계획 명시

---

## 2. PR #134~#146 DevOps 회고

### 2-1. 인프라 산출물 현황 (PR 별)

| PR | 슬라이스 | DevOps 관여 내용 | 상태 |
|----|---------|----------------|------|
| #134 | P0-1 Slice A (3대 재무 보고서) | accounting-service.env 서버 포트 환경변수화 (포함 #129) | 완료 |
| #135 | Desktop mock 9건 결함 fix | 인프라 변경 없음 | 완료 |
| #136 | P0-1 Slice B (부가세/법인세) | 동일 env 패턴 검증 | 완료 |
| #137 | P0-1 Slice C (현금흐름표 등) | 동일 env 패턴 검증 | 완료 |
| #138 | P0-2 비밀번호 재설정 | SMTP 환경변수 (.env.example §SMTP) 사전 존재 확인 | 완료 |
| #139 | P0-4 세금계산서 | 인프라 변경 없음 | 완료 |
| #140 | P0-5 사용자/권한 관리 | 인프라 변경 없음 | 완료 |
| #141 | P0-6 거래처 4탭 | SAMHAN_PARTNER_MINIO_ENABLED toggle 기 적용 확인 | 완료 |
| #142 | P0-9 입고 검수 UI | slip-service port 환경변수화 (#129 기 반영) | 완료 |
| #143 | P1-3 안전재고 알림 | 인프라 변경 없음 | 완료 |
| #144 | P1-4 영업 native 앱 | 인프라 변경 없음 | 완료 |
| #145 | P1-5 arologis 배차 | 인프라 변경 없음 | 완료 |
| #146 | P1-6 Excel export | SAMHAN_SLIP_MINIO_ENABLED 환경변수 기 존재 확인 | 완료 |

### 2-2. 회고 포인트

**공통 S3 환경변수 표준 부재**: PR #134~#146 전 기간에 `SAMHAN_SLIP_MINIO_*` (slip 전용) 와 `SAMHAN_PARTNER_MINIO_*` (partner 전용) 는 존재했으나, P1 범용 첨부(`samhan-attachments` bucket) 를 위한 공통 `SAMHAN_S3_*` 표준이 정의되지 않았다. 본 PR 에서 표준화.

**Phase 11 cutover 동선 불명확**: `M-AWS-MIGRATION-DRY-RUN.md` §3 에 slip / partner bucket 외 신규 `samhan-attachments` bucket 체크리스트가 없었다. 본 PR 에서 보강.

**start-local-full.ps1 후속 메시지 미갱신**: setup-minio-buckets.ps1 의 후속 가이드에 `samhan-attachments` 관련 안내가 없었다. 본 PR 에서 추가.

---

## 3. 인프라 산출물 변경 상세

### 3-1. docker-compose.yml (infrastructure/docker-compose.yml)

MinIO 서비스 섹션에 bucket 용도 주석 추가. 실 bucket 생성은 `setup-minio-buckets.ps1` 위임 (docker-compose restart 없이 멱등 재실행 가능).

추가 bucket:
- `samhan-attachments` — P1 범용 첨부, presigned TTL 300s, private

### 3-2. setup-minio-buckets.ps1 (infrastructure/scripts/setup-minio-buckets.ps1)

`$buckets` 배열에 `samhan-attachments` 항목 추가.

```powershell
@{
    Name        = 'samhan-attachments'
    Purpose     = 'P1 범용 첨부 (P1-photo, 공통 AttachmentService — 입고 검수/배송/영업 방문 사진)'
    ManualRef   = 'docs/manual/04-모바일/04-사진-첨부.md'
    PresignTtl  = 300
}
```

정책: `mc anonymous set none minio/samhan-attachments` (private, presigned URL 전용).

### 3-3. .env.example (infrastructure/.env.example)

`SAMHAN_S3_*` 공통 환경변수 블록 신규 추가:

```env
SAMHAN_S3_ENDPOINT=http://localhost:9000
SAMHAN_S3_ACCESS_KEY=samhan
SAMHAN_S3_SECRET_KEY=samhan_dev_pw
SAMHAN_S3_BUCKET=samhan-attachments
SAMHAN_S3_PRESIGNED_EXPIRY=300
```

Phase 11 cutover 시 `SAMHAN_S3_ENDPOINT` 빈 값 + `SAMHAN_AWS_REGION=ap-northeast-2` 설정만으로 AWS S3 전환.

### 3-4. env-templates/slip-service.env

slip-service 가 P1 범용 첨부를 사용할 경우를 위해 `SAMHAN_S3_*` 블록 추가.

### 3-5. slip-service application.yml

`app.s3` chained-default 블록 신규 추가:

```yaml
app:
  s3:
    endpoint: ${SAMHAN_S3_ENDPOINT:http://localhost:9000}
    access-key: ${SAMHAN_S3_ACCESS_KEY:samhan}
    secret-key: ${SAMHAN_S3_SECRET_KEY:samhan_dev_pw}
    bucket: ${SAMHAN_S3_BUCKET:samhan-attachments}
    presigned-expiry-seconds: ${SAMHAN_S3_PRESIGNED_EXPIRY:300}
    region: ${SAMHAN_AWS_REGION:us-east-1}
    path-style-access: ${SAMHAN_S3_PATH_STYLE_ACCESS:true}
```

BE agent 는 본 블록을 바인딩하는 `S3Properties` + `AttachmentStorageConfig` 를 구현한다.

---

## 4. bucket 정책 정리

| bucket | 정책 | presigned TTL | Phase 11 AWS S3 전환 |
|--------|------|---------------|----------------------|
| `partner-attachments` | private | 3600s (1시간) | `SAMHAN_PARTNER_MINIO_*` → S3 SDK endpoint override |
| `slip-attachments` | private | 300s (5분) | `SAMHAN_SLIP_MINIO_*` → S3 SDK endpoint override |
| `samhan-attachments` | private | 300s (5분) | `SAMHAN_S3_ENDPOINT` 빈 값으로 전환 (본 PR 표준) |

모든 bucket: anonymous read 금지, presigned URL 만 다운로드 허용.

---

## 5. Phase 11 AWS S3 cutover 계획

### 5-1. 사전 준비 (Phase 11 구축 완료 전)

1. S3 bucket `samhan-attachments` 생성 (ap-northeast-2, private, SSE-S3 암호화)
2. EC2 IAM Role 에 `s3:GetObject / PutObject / DeleteObject` 최소권한 정책 첨부
3. bucket lifecycle: 180일 후 Glacier Instant Retrieval (월 비용 절감)
4. 버전 관리 활성 (우발적 삭제 방지)

### 5-2. cutover 환경변수 (EC2 .env / Secrets Manager)

```env
# Phase 11 AWS S3 cutover 시 변경 사항
SAMHAN_S3_ENDPOINT=                        # 빈 값 → AWS SDK default endpoint
SAMHAN_S3_ACCESS_KEY=                      # EC2 IAM Role 사용 시 불필요 (생략 가능)
SAMHAN_S3_SECRET_KEY=                      # EC2 IAM Role 사용 시 불필요 (생략 가능)
SAMHAN_S3_BUCKET=samhan-attachments        # 동일 이름 유지
SAMHAN_S3_PRESIGNED_EXPIRY=300
SAMHAN_AWS_REGION=ap-northeast-2
SAMHAN_S3_PATH_STYLE_ACCESS=false          # AWS S3 = virtual-hosted-style
```

### 5-3. cutover 검증 항목

- presigned URL 생성 + 만료 (300s) PASS
- PUT 5MB 이하 단일 파일 정상
- anonymous GET → 403 (private 정책 확인)
- SSE-S3 암호화 헤더 확인
- IAM 최소권한: 다른 bucket PUT → 403 확인

### 5-4. 비용 추정 (Phase 11 월 ₩405K 계획 포함)

| 항목 | 추정 규모 | 월 비용 |
|------|---------|---------|
| S3 PUT/GET 요청 | 사진 업로드 100건/일 × 30일 = 3,000 건 | ~₩2,000 |
| S3 스토리지 | 평균 500KB/건 × 3,000건/월 = 1.5GB/월 | ~₩500 |
| lifecycle Glacier 전환 (180일+) | 연 18GB 전환 | ~₩500/월 평균 |
| **소계** | | **~₩3,000/월** |

Phase 11 월 ₩405,000 계획 내 수용 가능.

---

## 6. 참고 문서

- [M-AWS-MIGRATION-DRY-RUN §3](../../docs/migration/phase11/M-AWS-MIGRATION-DRY-RUN.md) — S3 SDK endpoint override dry-run
- [04-사진-첨부.md](../../docs/manual/04-모바일/04-사진-첨부.md) — 사용자 매뉴얼 (P1 미구현 안내)
- [setup-minio-buckets.ps1](../../infrastructure/scripts/setup-minio-buckets.ps1) — 버킷 생성 스크립트
- [project_phase11_aws.md](memory: project_phase11_aws.md) — Phase 11 AWS 마이그레이션 계획

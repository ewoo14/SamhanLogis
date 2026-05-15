# Phase 11 — Signature Copy (Phase F) 메모리 / CPU / 스토리지 검증

> Phase F (D-DF-01/06/10) 의 사본 합성 (Playwright Chromium headless + PNG screenshot) 가
> Phase 11 AWS 단일 환경 (m5.xlarge + db.t3.medium, [project_phase11_aws.md] 참조) 의
> 자원 한도 안에서 안정 동작하는지 사전 검증한다.
>
> spec: `docs/superpowers/specs/2026-05-14-samhan-signature-copy-design.md` §6
> plan: `docs/superpowers/plans/2026-05-15-samhan-signature-copy.md` DO3

---

## 1. 추가 부하 (Phase F)

| 항목 | 단일 요청당 | pool peak |
|---|---|---|
| Chromium headless 1 page render | heap ~150MB / RSS ~250MB | ~500MB (단일 BrowserContext, page open/close 1회) |
| PlaywrightCopyRenderer goto + screenshot | CPU 200~400ms (1 vCPU 점유) | — |
| PNG 산출물 (A4 portrait ~600x850) | ~120KB ~ 250KB / 건 | — |
| Java heap (arologis-service 기존) | 2GB Xmx (기존 운영 표준) | 2GB |

**합산 (정상 1 동시 발송)**: ~2.5GB peak (Java 2GB + Chromium 0.5GB).

---

## 2. m5.xlarge 16GB 자원 여유 검증

| 컴포넌트 | RAM | 비고 |
|---|---|---|
| OS + Docker daemon + sshd | ~1.0GB | base |
| arologis-service (Java) | 2.0GB | Xmx 2g 고정 |
| arologis-service (Chromium pool) | ~0.5GB | 동시 1건 가정 |
| 기타 14 service (Java avg 1.5GB × 13) | ~9.0GB | inventory / partner / user / slip / notification 등 |
| RDS db.t3.medium | 분리 (별도 인스턴스) | 본 m5.xlarge 자원 안 씀 |
| **합산** | **~12.5GB** | **여유 ~3.5GB** |

**동시 발송 ~3건 시뮬레이션**: Chromium pool 1.5GB → 합산 ~13.5GB → 여유 ~2.5GB. **적정.**

> **결론**: Chromium 단일 BrowserContext + lazy launch 패턴으로 m5.xlarge 16GB 안에서 동작 충분.
> 이상 (동시 5건 이상 + 다른 service spike 동시 발생) 은 Phase 11 cutover 후 1주일 모니터링 후
> Auto Scaling Group 검토.

---

## 3. CPU 부하

- m5.xlarge = 4 vCPU (Intel Xeon Platinum, 3.1GHz boost).
- Chromium 단일 page render = 200~400ms × 1 vCPU.
- 동시 3건 = 600~1200ms × 3 vCPU 점유 (peak), 평상시 1 vCPU 미만.
- arologis-service 다른 endpoint (배차 board / GPS heartbeat 등) 는 IO bound → CPU 영향 미미.

**결론**: CPU 도 여유 충분.

---

## 4. 디스크 / 스토리지 검증

### 4.1 EC2 EBS (사본 PNG 보관, Phase 10 단계)

| 항목 | 추정 |
|---|---|
| 사본 PNG 평균 크기 | 200KB |
| 일 평균 발송 건수 (정상 운영 가정) | 100건 |
| 월 누적 (30일) | 600MB |
| 연간 누적 | ~7.2GB |
| **EBS gp3 200GB (Phase 11 default) 점유율 / 년** | **3.6%** |

**결론**: Phase 10 단계는 EBS 단독으로 5년 이상 운용 가능. Phase 11 cutover 시점 S3 이전 권장.

### 4.2 Docker volume 마운트

```yaml
# docker-compose 또는 ECS task definition 예시
volumes:
  - /var/lib/arologis/signature-copies:/var/lib/arologis/signature-copies
```

- 호스트 경로 = EBS gp3 마운트.
- ENV `AROLOGIS_SIGNATURE_COPY_DIR=/var/lib/arologis/signature-copies` (env-templates 표준).
- 권한: 컨테이너 user `app` (uid 999) 가 write 가능하도록 호스트 측 chown 필요.

---

## 5. Cutover 시 storage migration (Disk → S3)

> Phase 11 cutover 별도 PR 진행 — 본 노트는 가이드만.

### 5.1 마이그레이션 절차

1. **S3 버킷 생성**: `samhan-air-signature-copies` (Seoul ap-northeast-2, SSE-S3 default, lifecycle: 1년 후 Glacier).
2. **batch upload**: aws-cli 로 EBS → S3 일괄 업로드.
   ```bash
   aws s3 sync /var/lib/arologis/signature-copies/ s3://samhan-air-signature-copies/ \
     --storage-class STANDARD_IA --exclude "*.tmp"
   ```
3. **DB 마이그레이션**: `arologis.signatures.copy_image_path` 의 disk path 를 S3 키로 갱신.
   ```sql
   UPDATE arologis.signatures
   SET copy_image_path = REPLACE(copy_image_path,
       '/var/lib/arologis/signature-copies/',
       's3://samhan-air-signature-copies/')
   WHERE copy_image_path LIKE '/var/lib/arologis/signature-copies/%';
   ```
4. **CopyImageDiskStorage → CopyImageS3Storage** 교체 (별도 PR — Spring profile or 환경변수 토글).
5. **ENV 전환**: `AROLOGIS_SIGNATURE_COPY_BUCKET=samhan-air-signature-copies`.
6. **검증**: 100건 샘플 S3 GetObject 확인 → 응답 PNG = 디스크 PNG 동일 hash.
7. **EBS 디렉토리 archive**: `/var/lib/arologis/signature-copies-legacy-YYYYMMDD/` 으로 rename, 30일 보관 후 삭제.

### 5.2 IAM 권한

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
    "Resource": "arn:aws:s3:::samhan-air-signature-copies/*"
  }]
}
```

EC2 instance profile 에 부착 → arologis-service 컨테이너가 STS 자동 인증 사용.

---

## 6. 모니터링 / Alert (별도 PR)

| metric | threshold | action |
|---|---|---|
| `copy_send_failure_count` (BE 메트릭, Micrometer) | > 5 / 10분 | Slack `#ops-alert` |
| `playwright_render_timeout_count` | > 3 / 10분 | Slack + DevOps on-call |
| Chromium process RSS | > 800MB | Java heap dump + Chromium restart |
| EBS gp3 free space | < 20GB | EBS 용량 증설 또는 S3 cutover 가속 |

> 본 alert 정의는 Phase F 머지 후 monitoring PR (별도) 에서 CloudWatch / Prometheus 룰 작성.

---

## 7. Phase 11 cutover 체크리스트 합류

[CUTOVER-CHECKLIST.md](./CUTOVER-CHECKLIST.md) 에 본 노트 §5 절차를 항목으로 추가 의무 (cutover PR 시점):

- [ ] S3 버킷 생성 + lifecycle 설정
- [ ] EBS → S3 batch upload (aws s3 sync)
- [ ] DB 경로 갱신 SQL 실행
- [ ] CopyImageS3Storage 교체 PR 머지 + 환경변수 전환
- [ ] 100건 샘플 검증
- [ ] EBS 디렉토리 archive

---

## 8. 회귀 안전성 (Phase 11 이전 운영 영향)

- **현 Phase 10 운영 시 Phase F 영향**: arologis-service 컨테이너 메모리 fingerprint 가 0.5GB 증가.
  현 운영 host (사용자 사내 서버 추정 16GB+) 동일하게 여유 확보.
- **Docker 이미지 크기 증가**: Chromium binary ~280MB + fonts-noto-cjk ~70MB → 이미지 ~380MB 증가
  (기존 ~250MB → ~630MB). pull 시간 +30초 (1Gbps 회선 기준). 무시 가능.
- **시작 지연 (cold start)**: Playwright Chromium launch ~2초 (이미지 빌드 시 한번 install 후 캐시).
  기존 Java startup ~30초 → 영향 미미.

---

**작성**: 2026-05-15 (Phase F DevOps DO3)
**연관 spec**: §6 (Cutover storage migration), §8 (모니터링)
**연관 plan**: DO1 (Dockerfile env), DO3 (본 노트)

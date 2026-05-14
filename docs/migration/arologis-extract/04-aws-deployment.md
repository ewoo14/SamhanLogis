# 04 — AWS 배포 가이드 (아로로지스 독립 분리)

> 작성: 2026-05-14 — DevOps Team
> 근거: [spec §8 — AWS 운영 환경](../../superpowers/specs/2026-05-14-arologis-extract-design.md), [plan DO3 ~ DO6](../../superpowers/plans/2026-05-14-arologis-extract.md)

---

## 1. 인프라 구성 (변경 0 — Phase 11 그대로)

| 자원 | 사양 | 비고 |
|---|---|---|
| EC2 | m5.xlarge 1대 (Seoul, ap-northeast-2) | Samhan Public + 아로로지스 같은 호스트 공유 |
| RDS | db.t3.medium 1대 (Seoul) | `arologis_db` 가 14 DB 옆에 추가 (총 15 DB) |
| Route 53 | hostedzone `samhan-air.com` 그대로 | A 레코드 3개 추가 (`infrastructure/terraform/arologis.tf`) |
| ACM | wildcard `*.samhan-air.com` | **갱신 필요** — SAN 에 `*.arologis.samhan-air.com` 추가 |
| Nginx | host-header 라우팅 | `infrastructure/nginx/arologis.conf` 신규 추가 |
| ALB | `aws_lb.main` 그대로 | host-header 라우팅 = Nginx 가 처리, ALB 변경 0 |

**비용 영향**: 월 ₩405K → 월 ₩405K (변경 0). Route 53 record 3개 = 무료.

---

## 2. 신규 Route 53 레코드 (`infrastructure/terraform/arologis.tf`)

```
api.arologis.samhan-air.com      A (ALIAS)   → ALB
app.arologis.samhan-air.com      A (ALIAS)   → ALB
mobile.arologis.samhan-air.com   A (ALIAS)   → ALB
```

Terraform apply 흐름:

```powershell
cd infrastructure\terraform
terraform plan -var-file=terraform.tfvars   # 변경 사항 = Route 53 record 3개 추가
terraform apply tfplan                       # 실 적용 (개발책임자 확인 후)
```

---

## 3. ACM 인증서 갱신 (cutover D-3 ~ D-1)

현재 ACM 은 `*.samhan-air.com` 단일 wildcard 만 커버 — `*.arologis.samhan-air.com` 미커버.

**해결 방법 2 가지**:

### 3.1 SAN 추가 (권장)

```hcl
# infrastructure/terraform/main.tf 또는 acm 정의 위치
resource "aws_acm_certificate" "main" {
  domain_name = var.domain_name   # "samhan-air.com"
  subject_alternative_names = [
    "*.samhan-air.com",
    "*.arologis.samhan-air.com",   # 신규 추가
  ]
  validation_method = "DNS"
  # ...
}
```

- `terraform apply` → DNS 검증 record 가 Route 53 에 자동 추가 → 검증 완료 시 ACM `ISSUED`.
- 소요: 검증 record propagation 5~15분.

### 3.2 별도 ACM 발급

- 새 ACM 인증서를 `*.arologis.samhan-air.com` 단독으로 발급.
- ALB listener rule 에서 host-header 별 인증서 분기 (SNI).
- Terraform 변경량 더 큼 — **3.1 SAN 권장**.

---

## 4. Nginx 라우팅 (`infrastructure/nginx/arologis.conf`)

EC2 운영 환경에서 conf.d 로 마운트:

```bash
# EC2 ssh
sudo cp /opt/arologis/nginx/arologis.conf /etc/nginx/conf.d/arologis.conf
sudo nginx -t                                # 구문 검증
sudo systemctl reload nginx                  # 무중단 reload
```

라우팅 규칙 (spec §8.3):

| host | 라우팅 |
|---|---|
| `api.samhan-air.com` | `proxy_pass http://api-gateway:8080` (Samhan Public, 변경 0) |
| `api.arologis.samhan-air.com` | `proxy_pass http://arologis-service:8097` (gateway 우회) |
| `app.arologis.samhan-air.com` | `root /var/www/arologis-desktop` (Electron installer 다운로드) |
| `mobile.arologis.samhan-air.com` | `root /var/www/arologis-mobile` (Store deeplink) |

**HTTP→HTTPS redirect** 도 3 도메인 일괄 처리.

---

## 5. Docker 운영 (`infrastructure/docker/docker-compose.arologis.yml`)

EC2 의 `/opt/arologis` 배치:

```
/opt/arologis/
  ├── docker-compose.arologis.yml    # 본 repo 의 infrastructure/docker/ 복사
  ├── .env                            # AROLOGIS_IMAGE / DB 자격증명 등
  └── nginx/arologis.conf             # nginx 마운트용
```

`.env` 예시 (git ignored):

```
AROLOGIS_IMAGE=ghcr.io/<owner>/samhanpublic/arologis-service:arologis-v1.0.0
SAMHAN_AROLOGIS_DB_HOST=<rds-endpoint>
SAMHAN_AROLOGIS_DB_PORT=5432
SAMHAN_AROLOGIS_DB_NAME=arologis_db
SAMHAN_AROLOGIS_DB_USER=samhan
SAMHAN_AROLOGIS_DB_PASSWORD=<vault-managed>
SAMHAN_INTERNAL_TOKEN=<vault-managed>
EUREKA_URL=http://eureka-server:8761/eureka/
SPRING_PROFILES_ACTIVE=prod
```

기동:

```bash
cd /opt/arologis
docker-compose -f docker-compose.arologis.yml pull
docker-compose -f docker-compose.arologis.yml up -d
curl -fsS http://localhost:8097/actuator/health
```

---

## 6. 배포 cadence (별도 release — spec §8.5)

### 6.1 GitHub Actions tag-based deploy

```bash
# 로컬 (또는 release manager)
git tag arologis-v1.0.0
git push origin arologis-v1.0.0
```

→ `.github/workflows/arologis-deploy.yml` 자동 트리거:

1. `./gradlew :services:arologis-service:bootJar`
2. `docker build -f services/arologis-service/Dockerfile` → push `ghcr.io/<owner>/samhanpublic/arologis-service:arologis-v1.0.0`
3. EC2 ssh → `docker-compose pull && up -d`
4. `curl http://localhost:8097/actuator/health` 검증
5. 결과 = `GITHUB_STEP_SUMMARY`

### 6.2 필요 시크릿 (Repo Settings → Secrets)

| Secret | 용도 |
|---|---|
| `AROLOGIS_EC2_HOST` | EC2 public DNS or IP |
| `AROLOGIS_EC2_USER` | ssh 사용자 (예: `ubuntu`) |
| `AROLOGIS_EC2_KEY` | ssh private key (PEM) |
| `GITHUB_TOKEN` | 자동 — ghcr.io 푸시 |

미설정 시 deploy step 은 `graceful skip` 으로 build/push 만 검증.

### 6.3 Samhan Public 배포와 독립

- Samhan Public 14 service 배포 (별도 워크플로) → 아로로지스 영향 0.
- 아로로지스 배포 → Samhan Public 영향 0.
- 같은 EC2 호스트 공유 → 한 쪽 docker-compose down 도 다른 쪽 영향 0 (`samhan-net` external network).

---

## 7. Cutover 절차 (D-7 ~ D-Day)

| Day | 단계 | 산출물 |
|---|---|---|
| D-7 | Terraform plan 검증 (`arologis.tf` 추가, ACM SAN 추가) | `tfplan` |
| D-3 | ACM 갱신 (SAN 추가) → DNS 검증 record propagation 대기 | ACM status = `ISSUED` |
| D-3 | `nginx -t` + 임시 별도 호스트에 `arologis.conf` 적용 가드 | Nginx config 검증 PASS |
| D-1 | Terraform apply (Route 53 record 3개 추가) | DNS propagation 대기 (TTL 60s) |
| D-1 | 첫 배포 — `arologis-v1.0.0` tag push → deploy workflow 실행 | image 푸시 + EC2 up |
| D-Day | EC2 ssh → `nginx -s reload` (arologis.conf 활성) | 라우팅 활성 |
| D-Day | 검증: `curl https://api.arologis.samhan-air.com/actuator/health` → `{"status":"UP"}` | smoke PASS |
| D-Day | 검증: Samhan Public 영향 0 확인 (`curl https://api.samhan-air.com/actuator/health`) | smoke PASS |

---

## 8. 모니터링 영향 (Phase 11 Auto Recovery + Health Check Lambda)

→ 별도 문서 `06-ec2-recovery-impact.md` 참조 (DO6 산출).

요약:
- EC2 Auto Recovery: 인스턴스 전체 복구 — 아로로지스 컨테이너 자동 재기동 (`restart: unless-stopped`).
- Health Check Lambda: 현재 `api-gateway:8080` 만 폴링 — 아로로지스 endpoint 추가 시 별도 alarm 추천.
- Prometheus / Grafana: Eureka 공유 시 자동 scrape — dashboard 변경 0.

---

## 9. Rollback 절차

→ 별도 문서 `05-rollback-runbook.md` 참조 (다른 팀 산출).

빠른 rollback:

```bash
# EC2 ssh
cd /opt/arologis
docker-compose -f docker-compose.arologis.yml down   # 2분, Samhan Public 영향 0
# Route 53 record 3개 삭제 (또는 TTL 60s 활용한 빠른 전환)
```

---

## 10. 검증 체크리스트 (cutover D+1)

- [ ] `curl https://api.arologis.samhan-air.com/actuator/health` → `200 UP`
- [ ] `curl https://app.arologis.samhan-air.com/` → 200 (installer 다운로드 페이지)
- [ ] `curl https://mobile.arologis.samhan-air.com/` → 200 (store deeplink 페이지)
- [ ] `curl https://api.samhan-air.com/actuator/health` → `200 UP` (Samhan Public 영향 0)
- [ ] Grafana dashboard `arologis-slip-bridge` 정상 scrape
- [ ] CloudWatch alarm = `arologis-health-fail` 무발화 (DO6 추가 시)
- [ ] docker-compose down test (스테이징): `docker-compose -f docker-compose.arologis.yml down` → Samhan Public 14 service 정상

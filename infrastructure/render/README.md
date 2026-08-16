# Render.com Blueprint — estimate-app v2 + order-app v4

본 디렉토리는 [Render.com](https://render.com/) Blueprint 기반 호스팅 정의를 보관한다.
`docs/migration/phase7/M-ESTIMATE-APP-hosting-decision.md` 의 **B 옵션 (Render Starter $7/mo)** 채택 결과
implementation 산출물이다.

## 파일 목록

| 파일 | 용도 |
|---|---|
| `render.yaml` | Blueprint 정의 (estimate-app Web + order-app Static mirror) |
| `deploy-checklist.md` | cutover 직전 체크리스트 (DNS / secret / smoke test) |
| `README.md` | 본 파일 |

## 배포 절차 (1차 — estimate-app v2 만)

1. **Render 계정 + 결제 등록**
   - [https://dashboard.render.com](https://dashboard.render.com) 가입 후 신용카드 등록
   - Starter plan ($7/mo, always-on, 512MB RAM) 활성

2. **Blueprint 등록**
   - dashboard 우상단 `New +` → `Blueprint`
   - 저장소 `ewoo14/SamhanLogis` 연결 + branch `main` 선택
   - `infrastructure/render/render.yaml` 자동 인식 → service 2개 (estimate / order) 검출
   - 1차에서는 `samhan-estimate-app` 만 활성화. `samhan-order-app` 은 `autoDeploy: false`
     로 정의되어 있으므로 default 비활성. (order-app 은 PR #77 의 Cloudflare Pages workflow 가 owner)

3. **Secret 환경변수 등록 (Render dashboard → service → Environment)**

   `sync: false` 로 지정된 항목은 Blueprint 가 등록하지 않는다. dashboard 에서 직접 등록한다.
   키 이름은 `clients/web/estimate-app/.env.example` + `lib/code.js` + `server.js` 의
   `process.env.*` read 와 1:1 일치한다 (BE Reviewer 의견 반영, PR #81 fix commit):

   | Key | 값 (출처) |
   |---|---|
   | `SAMHAN_API_BASE_URL` | Phase 7 backend gateway base URL (호스팅 결정 후) |
   | `PARTNER_SERVICE_URL` | M3 dc-config-service staging URL (partner master + DC config) |
   | `ESTIMATE_SERVICE_URL` | estimate-service staging URL (snapshot 임시저장 + history) |
   | `AUDIT_LOG_URL` | audit-log endpoint (logFrontEvent 대체, 예: `<host>/api/v1/audit-logs/front`) |
   | `SLIP_SERVICE_URL` | M5 slip-service staging URL |

4. **DNS 연결**
   - 카페24 또는 Cloudflare DNS 콘솔에서 `quote.samhan-air.com` CNAME → Render 가 발급하는
     `samhan-estimate-app.onrender.com` 등록
   - Render dashboard 에서 custom domain 추가 + DNS 검증 통과 → 자동 SSL (Let's Encrypt)

5. **smoke test**
   ```bash
   curl -fsS https://quote.samhan-air.com/healthz   # {"ok":true,...}
   ```

## CI workflow 활성화

`.github/workflows/deploy-estimate-app.yml` 는 PR/push 시점에 빌드 검증 +
단위 테스트 + syntax 게이트만 수행한다. 실 배포는 트리거하지 않는다.

`render.yaml` 의 estimate-app `autoDeploy: false` 정책에 따라, 신규 deploy 는
Render dashboard "Manual Deploy" 또는 GitHub Actions workflow_dispatch 로
수동 trigger 한다. 절차는 `deploy-checklist.md` "수동 deploy trigger" 섹션 참조.

## 미결 항목

- `SAMHAN_API_BASE_URL` 의 실 값은 14 backend MSA 호스팅 결정 (`M-PHASE-7-readiness.md` § 4) 의
  X1~X4 중 1건 채택 후 확정한다. 그 전까지는 Render 측에서 estimate-app 의 backend 호출
  endpoint 미구성 상태로 둔다 (frontend 정적 + Google Sheets 직접 연동만 동작).
- `samhan-order-app` Render 활성화는 Cloudflare Pages 와의 단일 owner 결정 후. 현재는 mirror 정의만 보관.

## Phase 10 cutover 가이드 (D-P9-01 cascade)

Phase 8 호환성 가드 (`docs/migration/phase8/M-AWS-COMPATIBILITY-guards.md`) 의 X3 AWS 옵션 채택 (D-P8-03) 결과,
다음 두 도메인은 Phase 10 cutover 시점에 호스팅 owner 변경이 의무이다.

### `quote.samhan-air.com` cutover

- **현재 owner**: Render Starter ($7/mo, `samhan-estimate-app`)
- **Phase 10 cutover 후**: AWS CloudFront + ALB (또는 S3 정적 호스팅 + CloudFront)
- **결정**: **owner 변경 의무** — D-P7-04 의 Render Starter 채택은 Phase 7 임시 결정. AWS X3 옵션 채택 후 Render 운영비 절감 + 단일 AWS account 관리 일관.
- **사전 조건**: `docs/migration/phase10/M-AWS-MIGRATION-DRY-RUN.md` § 5 (ALB 구성) + § 7 (Route 53 DNS cutover) 모두 staging dry-run PASS.
- **roll-back 옵션**: cutover 직전 Render service 보존 (deployment 삭제 X). DNS TTL 60s 단축 후 cutover, 트래픽 회귀 시 5분 내 record 원복.

### `order.samhan-air.com` cutover

- **현재 owner**: Cloudflare Pages (PR #77 의 deploy workflow)
- **Phase 10 cutover 후**: AWS CloudFront → S3 (정적 호스팅, order-app v4 의 build 결과물)
- **결정 옵션**:
  - (a) **CloudFront 이전** — 단일 AWS account 일관, $1~$5/월 (트래픽 의존)
  - (b) **Cloudflare Pages 유지** — DNS 만 Route 53 으로 가져오고 origin 은 Cloudflare 그대로 (multi-cloud, $0)
- **결정 시점**: Phase 10 W3 (cutover 직전). 본 시점은 옵션 (b) 가 비용 절감 + 무중단 가능성 우세 — Cloudflare Pages 의 SLA 가 Phase 6/7 운영 중 안정적.
- **owner 미결**: D-P10-XX 별도 결정 (Phase 10 진입 시점 대표 보고 후 확정).

### Render Starter 운영 종료 시점

- D-P7-04 (Render Starter $7/mo) → Phase 10 ALB cutover 완료 후 Render service 정지 + Blueprint 보관 (roll-back 대비 30일 유지)
- 본 README 의 Render dashboard secret 환경변수는 cutover 후 Secrets Manager (`docs/migration/phase8/M-SECRETS-ROTATION-spec.md`) 로 이전.

상세 cutover 절차는 `docs/migration/phase10/M-AWS-MIGRATION-DRY-RUN.md` § 7.2 참조.

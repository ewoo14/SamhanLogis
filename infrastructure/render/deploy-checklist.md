# Render cutover 체크리스트 — estimate-app v2

본 체크리스트는 Render Blueprint 활성화 시 1회 실행한다.

`render.yaml` 의 estimate-app `autoDeploy: false` 정책에 따라, 이후 main push 시
자동 배포는 동작하지 않는다. 신규 deploy 는 Render dashboard 의 "Manual Deploy"
버튼으로 trigger 하거나, GitHub Actions 의 deploy-estimate-app workflow 를
`workflow_dispatch` 로 수동 실행한다.

## 사전 준비

- [ ] Render 계정 + Starter plan 결제 등록 완료
- [ ] 저장소 `ewoo14/SamhanLogis` Render 측 연결 완료
- [ ] Phase 7 backend staging endpoint 5종 확정 (M2 / M3 / M4 / M5 / product-service)
- [ ] Google Cloud service account JSON 발급 + spreadsheet 권한 위임 (Editor)
- [ ] DNS 관리자 권한 확보 (`quote.samhan-air.com` CNAME 등록 가능 상태)

## Blueprint 등록

- [ ] dashboard `New +` → `Blueprint` → `infrastructure/render/render.yaml` 인식 확인
- [ ] `samhan-estimate-app` (Web Service) 만 활성. `samhan-order-app` 은 비활성 유지 (Cloudflare Pages 가 owner)

## 환경변수 등록 (sync: false 항목)

키 이름은 `clients/web/estimate-app/.env.example` + `lib/code.js` + `server.js` 의
`process.env.*` read 와 1:1 일치한다 (BE Reviewer 의견 반영, PR #81 fix commit).

| Key | 출처 | 등록 |
|---|---|---|
| `SAMHAN_API_BASE_URL` | backend 호스팅 결정 (gateway base) | [ ] |
| `PARTNER_SERVICE_URL` | backend 호스팅 결정 (dc-config-service M3) | [ ] |
| `DC_CONFIG_SERVICE_URL` | dc-config-service 내부 RPC base (`/internal/**`, gateway 우회) | [ ] |
| `ESTIMATE_SERVICE_URL` | backend 호스팅 결정 (estimate-service) | [ ] |
| `AUDIT_LOG_URL` | backend 호스팅 결정 (audit-log endpoint) | [ ] |
| `SLIP_SERVICE_URL` | backend 호스팅 결정 (slip-service M5) | [ ] |

## DNS 연결

- [ ] Render 측 `samhan-estimate-app.onrender.com` endpoint 활성 확인
- [ ] DNS CNAME 등록: `quote.samhan-air.com` → `samhan-estimate-app.onrender.com`
- [ ] Render dashboard custom domain 등록 + DNS 검증 PASS
- [ ] SSL 자동 발급 (Let's Encrypt) PASS

## 수동 deploy trigger (autoDeploy: false 정책)

- [ ] Render dashboard → samhan-estimate-app → "Manual Deploy" → "Deploy latest commit"
- [ ] 또는 GitHub Actions → `Deploy estimate-app to Render` workflow → `Run workflow` (workflow_dispatch)
- [ ] 빌드 log 에서 `npm ci` PASS + `node server.js` 부팅 메시지 확인
- [ ] Render 측 `samhan-estimate-app.onrender.com/healthz` 200 응답 확인

## 1차 smoke test

- [ ] `curl -fsS https://quote.samhan-air.com/healthz` → `{"ok":true,...}`
- [ ] 브라우저로 `https://quote.samhan-air.com/` 진입 → legacy 견적 UI 정상 렌더링
- [ ] product-service DB 카탈로그 연동 정상 (모델 목록 / 단가 표시)
- [ ] backend RPC 호출 1건 성공 (`POST /rpc/<fn>` → 200)

## QA 시나리오 PASS

- [ ] `qa/playwright/tests/` 의 `web-estimate-app` project 시나리오 60 cell PASS (Phase 7 staging 환경)

## 카탈로그 DB 원천 고정

- [ ] 백엔드 `product-service` 와 `dc-config-service` 배포 완료
- [ ] estimate-app 운영 환경변수 등록: `PRODUCT_SERVICE_URL`, `DC_CONFIG_SERVICE_URL`, `SAMHAN_INTERNAL_TOKEN` (또는 표준 internal token alias)
- [ ] `CATALOG_SOURCE` 설정 여부와 무관하게 프로덕션 DB 카탈로그 로드 확인

## Rollback 절차

배포 직후 critical 결함 발견 시:

1. Render dashboard → samhan-estimate-app → Manual Deploy → 직전 commit hash 선택
2. (autoDeploy: false 이므로 git revert push 만으로는 rollback 되지 않음 — 위 manual deploy 필수)
3. Starter 512MB RAM + NODE_OPTIONS=--max-old-space-size=400 가드로 OOM-kill 회피.
   rollback latency = 빌드 1회 (~2~3분).

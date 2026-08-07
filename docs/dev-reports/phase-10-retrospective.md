# Phase 10 — 회고 보고서 (arologis-service 도입 + 모바일 어플 driver tab + slip 전자서명 통합 + 로컬 풀-수준 검증)

> **Phase 10 = arologis-service** (배차 마이크로서비스) — 사용자 결정 2026-05-07 (`project_arologis_phase10.md`)
> **Phase 11 = AWS migration cutover** — 기존 Phase 10 → 11 renumber. Phase 11 진입 plan = `docs/migration/phase11/M-PHASE-11-readiness.md` 참조.
> **본 회고**: Phase 10 5 슬라이스 (W10-1 / W10-2 보류 / W10-3 / W10-4 / W10-5 본 회고) 의 산출, 결정, 가드, 학습을 종합. Phase 9 회고 (`phase9-retrospective.md`) 와 동일한 10 섹션 패턴.

---

## 1. Phase 10 요약 (5 슬라이스 W10-1 ~ W10-5)

| W | 산출 | PR | 머지 commit | 핵심 |
|---|---|---|---|---|
| W10-1 | arologis-service skeleton (port 8097) + 카톡 파싱 + 5 entity + DriverMatcher 추상화 | #97 | `a98048e` | 카카오톡 13 차량 80% 정확도 + Mock + Insung Quick placeholder + 4 client (partner/user/slip/notification) skeleton-mode |
| W10-2 | 인성데이타 퀵프로그램 vendor 통합 (`InsungQuickDriverMatcher` impl) + 양방향 동기화 | (보류) | — | 사용자 협약 / API 발급 대기 (memory `project_arologis_phase10.md` § "사용자 결정 2026-05-07" 1/2/5번 협의 미완료) |
| W10-3 | 모바일 어플 driver tab (clients/mobile-staff 내부) | #98 | `4b2c077` | RN Expo 6 화면 신규 + useGpsPermission + arologis API client + Pretendard self-host + W3+W4+W5+post-W5+W10-1 토큰 1:1 복제 |
| W10-4 | slip-service 전자서명 통합 (LINK + APP signatureSource) | #99 | `3cc1e6d` | Flyway V10 (3 컬럼) + 신규 enum + 신규 endpoint 2 (slip-service) + SlipResolver (arologis) + InternalTokenFilter slip 신규 + DV-3 부수 효과 = `shared:security` 모듈 추출 (13 service 통합) |
| W10-5 | Phase 10 회고 + 로컬 풀-수준 검증 (PR #100 머지 후) + Phase 11 진입 plan | (본 PR) | TBD | env prefix 통일 4 service + Phase 10 회고 docs + 로컬 검증 4 issue 회고 + slip-it nightly 시나리오 |

총 1 신규 service (arologis-service, port 8097) + 1 모바일 어플 driver tab (mobile-staff 내부) + 1 shared module (security) + slip-service signatureSource 통합 + 4 service env prefix 통일 (W10-5 본 PR).

W10-2 (인성 vendor) 는 사용자 협약 / API 발급 대기 — Phase 11 진입 후 또는 별도 슬라이스 분리 진행. 본 회고 § 5-2 학습 참조.

---

## 2. 산출 통계 (누적 매트릭스)

| 영역 | W10-1 | W10-2 | W10-3 | W10-4 | W10-5 | 누적 |
|---|---|---|---|---|---|---|
| 신규 service | 1 (arologis) | (보류) | 0 | 0 | 0 | 1 |
| 신규 shared module | 0 | (보류) | 0 | 1 (`shared:security`, DV-3) | 0 | 1 |
| Flyway V1 (init) | 1 (arologis V1) | (보류) | 0 | 1 (slip V10 = 3 컬럼) + 1 (slip V11 hotfix) | 0 | 3 |
| 모바일 어플 신규 | 0 | (보류) | 6 화면 + 1 hook + 1 client + 1 theme | 1 화면 (slipBridged) | 0 | 7 화면 + 1 hook + 1 client + 1 theme |
| 외부 client 신규 | 4 (partner/user/slip/notification, skeleton) | (보류) | 0 (재사용) | +1 (SlipClient 실 호출 분기) | 0 | 4 client + 실 호출 |
| 신규 endpoint (Backend) | 9 (arologis admin + driver-app + parser) | (보류) | 0 | +2 (slip /internal/signatures + /by-partner-code) | 0 | 11 |
| dev-report | 1 | (보류) | 1 | 1 | 1 (본 PR) | 4 |
| QA 캡처 PNG | 3 | (보류) | 3 | 3 | 0 (docs only) | 9 |
| DECISIONS D-P10-NN | 01→05 | (보류) | 06→10 | 11→15 (DV-3 = D-P10-15) | 16→20 (예정) | 15+5 = 20 |
| backlog 채택 (본 PR) | 0 | (보류) | 5 (W10-1 → W10-3 fix 4건 + Designer 1건) | 11 (W10-3 → W10-4) + DV-1/DV-2/DV-3 = 14 | 4 (W10-4 → W10-5 로컬 4 issue) | 23 |

> **누적 결정 D-P10-01 ~ D-P10-15** (W10-4 시점). W10-5 본 PR 에서 D-P10-16 ~ D-P10-20 추가 예정 (회고 + Phase 11 진입 + 로컬 4 issue fix + slip-it nightly).

---

## 3. 핵심 결정 (D-P10 시리즈 15+5건)

| ID | 결정 | W | 출처 |
|---|---|---|---|
| D-P10-01 | arologis-service 도입 (port 8097, DB arologis_db) | W10-1 | PR #97 |
| D-P10-02 | 5 entity + 7 enum + DriverLocation (BaseEntity 미상속, 30일 hard DELETE) | W10-1 | PR #97 |
| D-P10-03 | KakaoDispatchParser (정규표현식 + heuristic 5단계, 80% 정확도) | W10-1 | PR #97 |
| D-P10-04 | DriverMatcher 추상화 (Mock + Insung Quick placeholder) | W10-1 | PR #97 |
| D-P10-05 | Phase 10/11 renumber (사용자 결정 2026-05-07) — Phase 10 = arologis / Phase 11 = AWS cutover | W10-1 | PR #97 |
| D-P10-06 | mobile-staff 내부 driver tab 채택 (별도 mobile-driver 신규 X, 사용자 결정 2026-05-07) | W10-3 | PR #98 |
| D-P10-07 | GPS foreground 의무 + background 선택 + 거부 시 어플 사용 불가 (`GpsBlockedScreen`) | W10-3 | PR #98 |
| D-P10-08 | 본 어플 GPS only (인성 LBS 통합 = W10-2 시점) — `source = APP_GPS_ACTIVE` 만 활성 | W10-3 | PR #98 |
| D-P10-09 | Pretendard self-host (jsdelivr CDN 회피, expo-font plugin) | W10-3 | PR #98 |
| D-P10-10 | W3+W4+W5+post-W5+W10-1 토큰 1:1 복제 (`theme/tokens.ts` ← `tokens.css` RGB) | W10-3 | PR #98 |
| D-P10-11 | slip-service signature_source 컬럼 NOT NULL DEFAULT 'LINK' (기존 데이터 backfill) | W10-4 | PR #99 |
| D-P10-12 | LINK / APP 분리 + audit 테이블도 source 보존 (전자서명법 §17) | W10-4 | PR #99 |
| D-P10-13 | InternalTokenFilter `/internal/**` prefix 한정 (slip-service 신규 + arologis/partner 일관 패턴) | W10-4 | PR #99 |
| D-P10-14 | UUID 비공개 가드 — partnerId UUID 직접 노출 회피 (`SlipResolver` fallback) | W10-4 | PR #99 |
| D-P10-15 | DV-3 채택 = `shared:security` 모듈 추출 + 13 service 통합 (InternalTokenFilter / pathPrefix / role / allowMissingToken 표준화) | W10-4 후속 | `f9fea6d` |
| D-P10-16 (예정) | env 변수 prefix 통일 — 4 service `application.yml` 의 SAMHAN_<X>_SEED_TEST_DATA 표준 + chained-default fallback | W10-5 | 본 PR |
| D-P10-17 (예정) | partner-service `CHANGE_ME_LOCAL_ONLY` placeholder → samhan default fallback chain (다른 service 일관) | W10-5 | 본 PR |
| D-P10-18 (예정) | 로컬 풀-수준 검증 4 issue 회고 채택 → start-local-full.ps1 health-gated startup + pre-flight port 검사 (DevOps W10-5 backlog) | W10-5 | 본 PR |
| D-P10-19 (예정) | slip-it nightly 시나리오 plan (2 group, 02:00 KST, fail 시 자동 Issue + main + feature branch 회귀 검증) | W10-5 | 본 PR |
| D-P10-20 (예정) | Phase 11 진입 준비 완료 — 단일 환경 + RDS auto backup + EC2 Auto Recovery + Health Check Lambda 채택 (사용자 결정 2026-05-08, `project_phase11_aws.md`) | W10-5 | 본 PR |

---

## 4. 누적 backlog 채택 결과

| 시점 | backlog 식별 | 채택 | 잔존 | 위임 |
|---|---|---|---|---|
| W10-1 → W10-1 (사용자 가드 적용 후) | reviewer 식별 4건 + Designer baseline 1건 | 5건 본 PR 채택 (`195a3ae` + `119c9f8`) | 0 | 0 |
| W10-3 → W10-3 (W10-1 머지 후) | 5건 (BE-1/BE-2/BE-3 + Designer-1/Designer-2 + FE-1/FE-2 + B-DEVOPS-1 + O-DEVOPS-1) | 9건 본 PR 채택 (`8ff2430` + `8279e19` + `d569b01`) | 0 | 0 |
| W10-4 → W10-4 (W10-3 머지 후) | 11건 (BE-1/BE-2/BE-3 + DV-1/DV-2/DV-3 + FE-2/FE-3 + QA-1/QA-2/QA-3 + Designer-1/2/3) | 11건 본 PR 채택 + 후속 fix 5건 (DV-1 timeout + DV-2 V11 hotfix + DV-3 shared:security + auth-service 호환 + product/dc-config 호환) | 0 | 0 |
| W10-5 (본 PR) | 4건 로컬 검증 issue + slip-it nightly 1건 | 4건 본 PR 채택 (env prefix 통일 + partner default fallback + start-local-full health-gated + pre-flight port) + 1건 plan 신규 (slip-it nightly) | 0 | 0 |

**핵심 학습**: Phase 9 W4 부터 정착한 사용자 가드 (`feedback_integrated_pr_pattern.md` § fix 후속 PR/Phase 위임 금지) 가 Phase 10 5 슬라이스 모두 일관 적용. backlog 누적 0 패턴 정착. 단, W10-2 (인성 vendor) 는 외부 의존 (사용자 협약) 으로 분리 — 사용자 가드 위반이 아닌 외부 차단 사유.

---

## 5. 핵심 회고 (성공 + 학습)

### 5-1. 성공

1. **Phase 10/11 renumber 사용자 결정 즉시 cascade** (D-P10-05): 기존 Phase 10 (AWS) → Phase 11 이동 + 신규 Phase 10 = arologis. README + ROADMAP + DECISIONS + readiness 2건 (재작성 + 신규) 동시 갱신. 9 service README 의 "Phase 10" 표기 일괄 정정 (W10-1 후속 fix `195a3ae`).
2. **arologis-service skeleton 1 PR 완성** (PR #97): 5 entity + 7 enum + DriverLocation + KakaoDispatchParser + DriverMatcher 추상화 + 4 client skeleton + 신규 endpoint 9건 + 단위 20 + IT 13 = 1 슬라이스 만에 통합 발행. backlog 0 fix 본 PR 채택 패턴 일관.
3. **모바일 어플 driver tab clients/mobile-staff 내부 통합** (D-P10-06): 별도 mobile-driver 신규 회피 → AppRootNavigator estimate / driver mode 분기 + DriverTabNavigator. 6 화면 신규 + Pretendard self-host + 토큰 1:1 복제 (5+ phase 누적 토큰).
4. **slip 전자서명 LINK/APP 직교 컨셉** (D-P10-11/12): SignatureChannel (입력 매체) vs SignatureSource (발급 경로) 직교 분리. 기존 V5 보존 + V10 추가. partial index 2종 (인수자 APP + 기사 APP) 운영 통계 lookup 가속화.
5. **DV-3 = `shared:security` 모듈 추출 cascade** (D-P10-15): InternalTokenFilter 패턴 13 service (auth / user / partner / partner-auth / product / inventory / slip / partner-order / accounting / groupware / notification / dashboard / arologis) 통합. 환경변수 표준화 (pathPrefix / role / allowMissingToken) → 다른 service 의 standalone test 호환 가드 동시 적용 (auth `2547f7e` + product/dc-config `2bfdbba`).
6. **mobile-staff 내부 driver tab CI workflow 통합** (D-P10-10 후속 `d569b01`): expo doctor / prebuild layer 추가 → CI 에서 mobile build 검증 진입.
7. **W10-1 후속 fix 4건 + W10-3 후속 fix 9건 + W10-4 후속 fix 5건 모두 동일 PR 채택**: backlog 누적 0 패턴 일관. Phase 9 W4 부터 정착한 사용자 가드 그대로.
8. **로컬 풀-수준 검증 환경 통합** (PR #100): 11 시드 toggle + 풀 스택 docker-compose + start-local-full.ps1 + .env.dev-seed + 7 시나리오 + 도메인 정합성 SQL. PR #100 머지 후 실제 로컬 검증에서 발견된 4 issue (env prefix / placeholder / 의존순 / port 충돌) 본 PR (W10-5) 에서 즉시 fix.

### 5-2. 학습 / 개선

1. **W10-2 (인성 vendor) 외부 차단으로 슬라이스 보류**: 사용자 협약 / API 발급 대기. 사용자 가드 위반 X (외부 차단). 단, W10-2 가 W10-3/W10-4 진입 차단이 안 되도록 진입 조건 정정 (2026-05-07) — "**W10-2 의존 X. W10-1 완료 후 W10-3 진입 가능**" (W10-3 dev-report § 진입 조건). 외부 vendor 차단 시 슬라이스 분리 + 진입 조건 재정의 패턴 정착.
2. **slip-service V10 직후 V11 hotfix CONCURRENTLY 회귀** (PR #102, `314e93e`): V10 의 `CREATE INDEX CONCURRENTLY` 가 운영 환경 transaction 안에서 deadlock → V11 에서 CONCURRENTLY 제거. 회고 = "Flyway 의 single-transaction 가정과 CONCURRENTLY 의 non-transactional 충돌". 향후 partial index / GIN index 추가 시 별도 V_post 마이그레이션 분리 패턴 (`flyway.outOfOrder=true` 미사용 + 기본 sequential 보존).
3. **shared:security 추출 후 13 service 호환 가드 cascade**: auth-service standalone test (`2547f7e`) + product/dc-config application.yml (`2bfdbba`) 사후 호환 fix 2건. 학습 = "공유 모듈 추출 시 모든 13 service 의 application.yml + standalone test 사전 점검 의무" (DV-3 회고 → Phase 11 진입 시 신규 공유 모듈 추출 시 일관 적용).
4. **CI slip-it timeout 60분도 부족 → 옵션 B 분리 (PR matrix 제거)**: GitHub Actions ubuntu-latest (2-core/7GB) 환경에서 ApplicationContext 시작 자체가 60분 안에 안 끝나 5/6차 모두 cancel. 옵션 B 채택 = `slip-it-public + slip-it-core` matrix entry 제거, 회귀 검증은 nightly workflow 또는 main merge trigger 로 분리. **본 PR (W10-5) 에서 nightly 시나리오 plan 신규** (`docs/qa/local-test-seed-data/scenarios/08-nightly-slip-it.md`).
5. **로컬 풀-수준 검증 4 issue (env prefix / placeholder / 의존순 / port 충돌)**: PR #100 머지 후 실제 로컬 환경에서 발견. 4건 모두 본 PR (W10-5) 에서 즉시 fix. 학습 = "통합 PR 의 단위/IT 검증 PASS 와 실제 로컬 풀 스택 부팅 검증은 별개" → CI 에 `start-local-full.ps1` 통합 검증 step 추가 plan (Phase 11 진입 시 도입 권고).
6. **GitGuardian dev-only 비밀번호 false positive 처리** (`feedback_gitguardian_false_positive.md`): PR #100 fix `4a8152c` 시점 dev-only test 비밀번호 (samhan_dev_pw / ${QA_MASTER_PASSWORD} / dev-internal-token-change-me) 검출. 옵션 B (dashboard false positive mark) 표준화. git history rewrite + admin 강행 머지 회피.
7. **사용자 머지 권한 명시** (`feedback_user_merge_authority.md`): PR #100 회고 — PM 의 자의적 admin 머지 금지. 모든 PR 머지 = 사용자 본인 GitHub UI 직접 클릭. PM 은 "개발책임자 머지 요청 드립니다" 댓글만.
8. **PR 표준 리뷰 워크플로우 5 단계 정착** (`feedback_pr_review_workflow.md`): 5-team agent 리뷰 → TM 종합 → CI → PM 최종 승인 → 사용자 머지. PR #97 / #98 / #99 / #100 모두 일관 적용. 단순 chore PR (#101 GitGuardian config / #102 V11 hotfix) 도 형식적 5-team 리뷰 의무화.

### 5-3. Frontend 안정성 (Phase 10 회고 — FE-W10-2 보강)

- **clients/mobile-staff 의 driver tab 통합**: estimate WebView v3 → estimate / driver 분기 v4 (D-P10-06). 기존 estimate 화면 100% 보존 + driver tab 신규 6 화면 + AppRootNavigator + DriverTabNavigator. v3 회귀 0.
- **Pretendard self-host + expo-font plugin**: jsdelivr CDN 회피 (W10-3 D-P10-09). 4 weight (400/500/600/700) 자체 호스팅. PR #98 후속 fix `8279e19` 에서 Pretendard 4 weight 정식 활성.
- **W3+W4+W5+post-W5+W10-1 토큰 1:1 복제** (D-P10-10): `clients/design-system/src/tokens.css` ↔ `clients/mobile-staff/src/theme/tokens.ts` RGB 1:1 매핑. 모바일 / 웹 token 동기화 강제.
- **slipBridged UX 시각화 (FE-3 채택, W10-4)**: arologis driver-app sign 후 slip 양쪽 저장 성공/실패 사용자 안내. mobile-staff DriverSignatureScreen + 결과 카드.

---

## 6. Phase 11 진입 준비 상태

> Phase 11 = AWS migration cutover (기존 Phase 10 → 11 renumber). 사용자 결정 2026-05-08 (`project_phase11_aws.md`) — 단일 환경 + RDS auto backup + EC2 Auto Recovery + Health Check Lambda + 월 ₩405K (정상가) / ₩290K (RI 1년).

| 항목 | 준비도 | 비고 |
|---|---|---|
| 14 + 1 = 15 service skeleton | OK | Phase 0~10 완료, arologis-service (Phase 10 W10-1) 신규 + migration-service (Phase 11 P11-3 신규 예정) |
| ServiceDiscoveryClient 추상화 | OK | 5 service 적용 (partner / groupware / notification / dashboard / arologis), Phase 11 cutover 시 `aws-cloud-map` toggle 가능 |
| Caffeine vs Redis | OK | D-P9-12 결정, `samhan.cache.provider=caffeine\|redis` toggle 보유 |
| Materialized view + ShedLock | OK | multi-instance race 가드 (D-P9-13) |
| Secrets Manager spec | 대기 | Phase 8 spec 보유, Phase 11 P11-1 시점 lambda 배포 |
| AWS RDS 호환 | OK | Postgres standard SQL + JSONB + partial unique index 일관 (Phase 8 22 file 검증) |
| 12-factor + chained-default 환경변수 | OK | Phase 8 D-P8-07 일관, 14+1 service env-template 보유 + W10-5 본 PR env prefix 통일 (D-P10-16) |
| QA 캡처 + raw URL HEAD 가드 | OK | Phase 9 W3 회고로 강화 |
| 사용자 가드 (fix 본 PR 채택) | OK | Phase 9 W4 부터 일관 적용, Phase 10 5 슬라이스 일관 |
| `shared:security` 모듈 (DV-3 채택) | OK | 13 service 통합 (D-P10-15) — Phase 11 cutover 시 토큰 표준화 일관 |
| 로컬 풀-수준 검증 환경 | OK | PR #100 머지 + W10-5 4 issue fix 후 안정 진입 — start-local-full.ps1 + .env.dev-seed |
| AWS account + IAM baseline | 대기 | Phase 11 진입 시점 사용자 발급 (memory `project_phase11_aws.md` 진입 trigger) |
| 단일 환경 + 자동 복구 사양 결정 | OK | 사용자 결정 2026-05-08 (m5.xlarge + db.t3.medium + RDS backup + EC2 Auto Recovery + Health Check Lambda) |

---

## 7. Phase 11 진입 plan 요약 (단일 환경 + 자동 복구)

> 상세는 `docs/migration/phase11/M-PHASE-11-readiness.md` + memory `project_phase11_aws.md` 참조. 본 회고는 Phase 11 의 단일 환경 + 자동 복구 패턴 기준 plan 요약.

### 7-1. 인프라 사양 (사용자 결정 2026-05-08)

| 항목 | 사양 | 월 비용 |
|---|---|---|
| EC2 | m5.xlarge × 1 (4 vCPU + 16 GB) — 14+1 service docker-compose | $130 |
| RDS PostgreSQL | db.t3.medium Single-AZ + 100GB gp3 (15 DB 통합) | $80 |
| ALB × 1 | | $22 |
| Route53 + ACM | samhan-air.com 호스팅 영역 + SSL 무료 | $1 |
| S3 + CloudFront | 서명/인쇄/CDN | $25 |
| CloudWatch | log + metric 14일 retention | $30 |
| ECR | 15 image (~7.5GB) | $5 |
| Data Transfer | 인터넷 outbound | $9 |
| **총** | | **$302/월 ≈ ₩405,000** |

### 7-2. 자동 복구 + 백업 (모두 무료 + 무위험)

- **RDS automated backup** (retention 7일, 무료) — 데이터 손실 ≤ 24시간
- **EC2 Auto Recovery** (CloudWatch alarm 거의 무료) — AWS hardware/네트워크/hypervisor fail 자동 감지 + 5-15분 재기동
- **Health Check Lambda** (Lambda 무료 한도) — `/actuator/health` 5분 연속 fail → EC2 reboot. OS hang / Spring Boot OOM / deadlock 감지

### 7-3. 작업 분해 (3 슬라이스 P11-1 ~ P11-3)

1. **P11-1: AWS account + IAM baseline + Secrets Manager + Cache 전환** (1 통합 PR)
   - AWS account 발급 + IAM role + Secrets Manager 인스턴스 1개 + ElastiCache Redis 1개
   - 14+1 service `spring.config.import` 일괄 추가 (chained-default 보존)
   - Caffeine → Redis 전환 (`samhan.cache.provider=redis`)
   - ShedLock cluster (RDS shedlock 테이블 공유)
2. **P11-2: Discovery + Resilience4j + RDS migration cutover dry-run** (1 통합 PR)
   - aws-cloud-map provider 활성 (5 service 토글)
   - Resilience4j 4 client + 3 adapter (Aligo / FCM / SES) — timeout / circuit breaker / retry
   - Aurora PostgreSQL 16 cluster (단일 환경) + 15 schema 분리 + Flyway baseline 자동 적용
   - Cutover dry-run 3단계 (staging Flyway PASS / target group health / DNS TTL 60s)
3. **P11-3: Production cutover + Health Check Lambda + EC2 Auto Recovery 적용 + Migration service** (1 통합 PR)
   - 8 subdomain 점진 cutover (10 → 50 → 100%)
   - EC2 Auto Recovery CloudWatch alarm 활성
   - Health Check Lambda 배포 (`/actuator/health` polling + EC2 reboot)
   - Migration service (8096) ECount 일괄 이관 첫 슬라이스
   - 단일 환경 production 전환 완료

### 7-4. 추후 단계적 보강 (사용자 증가 + 매출 검증 시)

| 우선순위 | 보강 항목 | 추가 월 비용 |
|---|---|---|
| 1 | Staging 환경 (m5.xlarge × 1 + db.t3.medium) | +$240 |
| 2 | Multi-AZ HA (EC2 × 2 + db.t3.large Multi-AZ) | +$370 |
| 3 | DR (snapshot 매 6h + cross-region replica) | +$220 |
| 4 | Dev 환경 추가 | +$145 |

전체 보강 시 = $1,320/월 (이전 환경 분리+DR 안과 동일). 현재 단계 = Tier 0 (단일+자동 복구) 로 시작, 6개월 안정 운영 검증 후 단계적 보강.

---

## 8. 잔존 backlog (W10-5 본 PR 흡수 4건 + W10-2 보류 + Phase 11 위임 N건)

### 8-1. W10-5 본 PR 채택 (D-P10-16 ~ D-P10-19)

- **D-P10-16**: env 변수 prefix 통일 — 4 service `application.yml` 의 SAMHAN_<X>_SEED_TEST_DATA 표준 + chained-default fallback (inventory / partner / slip / user)
- **D-P10-17**: partner-service `CHANGE_ME_LOCAL_ONLY` placeholder → samhan default fallback chain (다른 service 일관)
- **D-P10-18**: 로컬 풀-수준 검증 4 issue 회고 채택 → start-local-full.ps1 health-gated startup + pre-flight port 검사 (DevOps W10-5 backlog)
- **D-P10-19**: slip-it nightly 시나리오 plan 신규 (`docs/qa/local-test-seed-data/scenarios/08-nightly-slip-it.md`)
- **D-P10-20**: Phase 11 진입 준비 완료 — 단일 환경 + RDS auto backup + EC2 Auto Recovery + Health Check Lambda 채택

### 8-2. W10-2 보류 (외부 차단)

- 인성데이타 퀵프로그램 vendor 통합 (`InsungQuickDriverMatcher` impl)
- 양방향 동기화 (배차 등록 / 기사 매칭 webhook / 배송 완료)
- 인성 알림톡 (배차 단계 전용, notification-service 우회)
- 인성 LBS GPS 통합 (어플 미설치 기사 추적, 하이브리드 정책)

**진입 trigger** (memory `project_arologis_phase10.md` § "사용자 결정 2026-05-07" 1/2/5번):
1. 인성과 비즈니스 협약 체결
2. API 문서 / 인증 키 / 비용 협상 완료
3. 통합 방식 (REST API / SOAP / 파일 교환) 확정

### 8-3. Phase 11 위임

- AWS account + IAM baseline 발급 (사용자)
- AWS Secrets Manager rotation lambda 실 배포
- Caffeine → Redis 전환 (multi-instance scaling)
- aws-cloud-map provider 5 service 토글 활성
- Resilience4j 4 client + 3 adapter
- Aurora PostgreSQL 16 cluster + 15 schema baseline
- 8 subdomain 점진 cutover
- EC2 Auto Recovery CloudWatch alarm + Health Check Lambda
- Migration service (8096) ECount 일괄 이관
- KPI 산출 batch job (Spring Batch / Quartz) — Phase 9 잔존
- Dashboard 화면 design-system Chart / Sparkline 컴포넌트 — Phase 9 잔존
- W3 BE backlog #2 (UserClient.verifyBulk fail-fast 토글) — properties 만 보유
- W3 BE backlog #3 (NotificationGatewayResult 자동 재시도 큐) — Phase 9 잔존

### 8-4. CI nightly workflow 신규 plan

- `slip-it-public + slip-it-core` 2 group, 02:00 KST cron
- timeout 60분 (PR matrix 60분 timeout 도 부족 회고 후 단독 nightly 분리)
- fail 시 GitHub Issue 자동 생성 + Slack 알림 (옵션)
- main + feature branch 모두 검증
- 회귀 검증 = PR #102 V11 fix 후에도 slip-it-* 정상 통과

---

## 9. 관련 PR + 문서

### Phase 10 PR

- W10-1 PR #97 — arologis-service skeleton (`a98048e`)
- W10-2 (보류) — 인성 vendor 통합 (외부 차단)
- W10-3 PR #98 — 모바일 어플 driver tab (`4b2c077`)
- W10-4 PR #99 — slip 전자서명 통합 (`3cc1e6d`) + 후속 fix 5건 (`d24c1d9` / `2ae4df3` / `6277bc3` / `0d87694` / `41c2889` / `a1d6ec7` / `2301e13` / `0936f7e` + DV-3 = `f9fea6d` / `2547f7e` / `2bfdbba` + DV-2 = `3126de6`)
- 부수 PR — #100 (로컬 풀-수준 시드 검증, `67e552b`) + #101 (GitGuardian config, `3fac21d`) + #102 (V11 CONCURRENTLY 제거 hotfix, `e6ac6dc`)
- W10-5 본 PR — Phase 10 회고 + 로컬 4 issue 회고 + slip-it nightly 시나리오 + env prefix 통일

### dev-report

- `docs/dev-reports/phase10-step-1-arologis-skeleton.md`
- `docs/dev-reports/phase10-step-3-mobile-driver-tab.md`
- `docs/dev-reports/phase10-step-4-slip-signature-integration.md`
- `docs/dev-reports/phase-10-retrospective.md` (본 PR)
- `docs/qa/local-test-seed-data/retrospective.md` (본 PR — 로컬 4 issue 회고)
- `docs/qa/local-test-seed-data/verification-report-2026-05-09.md` (본 PR — 검증 결과 보고)
- `docs/qa/local-test-seed-data/scenarios/08-nightly-slip-it.md` (본 PR — slip-it nightly plan)

### plan / readiness

- `docs/migration/phase10/M-PHASE-10-readiness.md` (Phase 10 = arologis 재작성)
- `docs/migration/phase11/M-PHASE-11-readiness.md` (Phase 11 = AWS cutover 신규)
- `docs/migration/phase11/M-AWS-MIGRATION-DRY-RUN.md` (Phase 8 도입 14 section dry-run plan)

### DECISIONS

- `migration/decisions/DECISIONS.md` D-P10-01 ~ D-P10-15 (Phase 10 W10-1~W10-4 시점) + D-P10-16 ~ D-P10-20 (W10-5 본 PR 추가 예정)

### service / client README

- `services/arologis-service/README.md` (W10-1 신규)
- `services/slip-service/README.md` (W10-4 signatureSource 섹션 추가)
- `clients/mobile-staff/README.md` (W10-3 driver tab 섹션 추가)
- `services/*/README.md` (W10-4 DV-3 후속 — 13 service shared:security 통합 표기)

### memory 갱신 history

- `project_arologis_phase10.md` — Phase 10 = arologis (사용자 결정 2026-05-07)
- `project_phase11_aws.md` — Phase 11 단일 환경 + 자동 복구 (사용자 결정 2026-05-08)
- `feedback_user_merge_authority.md` — PM admin 강행 머지 금지 (PR #100 회고)
- `feedback_gitguardian_false_positive.md` — dev-only 비밀번호 false positive mark 표준화 (PR #100 회고)
- `feedback_pr_review_workflow.md` — 5-team agent → TM → CI → PM → 사용자 머지 5 단계 표준 (PR #100 회고)

---

## 10. 마무리 메시지

Phase 10 은 **신규 도메인 마이크로서비스 (arologis-service) 도입 + 모바일 어플 driver tab 통합 + slip 전자서명 LINK/APP 양쪽 채널 통합 + 로컬 풀-수준 검증 환경 안정화** 4 큰 산출을 5 슬라이스 (W10-1 / W10-2 보류 / W10-3 / W10-4 / W10-5) 로 분할 완성한 phase. 사용자 결정 (2026-05-07) 의 Phase 10/11 renumber 적용 후 cascade 가 모든 docs / readiness / DECISIONS 일관 갱신되었다.

W10-2 (인성 vendor) 는 외부 차단 (사용자 협약 / API 발급 대기) 으로 보류 — Phase 11 진입 후 또는 별도 슬라이스 분리 진행. 사용자 가드 (fix 본 PR 채택) 위반이 아닌 외부 차단 사유로 분리.

W10-4 의 DV-3 = `shared:security` 모듈 추출이 13 service 통합 cascade 효과 → Phase 11 cutover 시 토큰 표준화 일관 보강. PR #100 머지 후 실제 로컬 풀 스택 검증에서 발견된 4 issue (env prefix / placeholder / 의존순 / port 충돌) 는 W10-5 본 PR 에서 즉시 fix → "통합 PR 의 단위/IT 검증 PASS 와 실제 로컬 풀 스택 부팅 검증은 별개" 학습 정착.

Phase 11 (AWS migration cutover) 의 4 큰 변화 (AWS Secrets Manager / Discovery / Cache / RDS) 는 모두 Phase 8/9/10 시점에 추상화로 사전 흡수되어 있어 코드 변경이 1줄 ~ 1 모듈 수준이다. 사용자 결정 2026-05-08 의 단일 환경 + 자동 복구 패턴 (월 ₩405K 정상가 / ₩290K RI 1년) 으로 MVP/스타트업 모드 비용 우선 진입. 6개월 안정 운영 검증 후 단계적 보강 (Staging → Multi-AZ → DR → Dev) 진행.

# 로컬 실사용자 동시 부하 + 장기 운영(soak) 검증 계획

> 2026-06-08 개발책임자 지시: "로컬에서 실사용자 동시 부하 / 장기 운영 검증도 테스트했으면 좋겠어."
> 파라미터 확정(개발책임자): **평시 20 VU / 피크 50 VU / 스트레스 100 VU · soak 밤새 6~8시간 · 읽기 80% + 쓰기 20% (테스트 식별자 + 종료 후 일괄 정리)**.

---

## 1. 목적 / 비목적

### 목적
- **동시 부하**: 실사용자 규모(~20명, 피크 50, 스트레스 100)의 혼합 트래픽에서 게이트웨이 경유 실 HTTP 응답 지표(p95/p99 latency, error rate, throughput) 실측.
- **장기 운영(soak)**: 평시 부하(20 VU)를 6~8시간 지속하며 **메모리 누수(JVM heap 추세) / 커넥션 풀 고갈(HikariCP) / 에러율 추세 / 컨테이너 재시작** 검출.
- 전 구간 **실서버·실측정만** ([[feedback_no_fake_data_ever]]) — 로컬 Docker 스택 14 서비스 + Prometheus/Grafana.

### 비목적
- FE(Electron) 렌더링 부하 — API 레벨 검증으로 한정.
- 운영 환경 절대치 보증 — 집 PC(32 core / 62 GB)는 AWS 목표 사양(m5.xlarge 4 vCPU / 16 GB)과 다름. **본 결과는 결함 검출(누수/고갈/병목)과 추세 분석용**이며, 절대 성능치는 Phase 11 배포 후 재측정 의무. (정직 명시 — 과대 해석 금지)

---

## 2. 도구 / 토폴로지

- **k6** (`grafana/k6` Docker 이미지) — `samhan-net` 네트워크 합류, `api-gateway:8080` 직접 타격 (실사용 경로 동일: 게이트웨이 → 서비스).
- 메트릭 2원 수집:
  - **k6 자체**: http_req_duration p50/p95/p99, http_req_failed, iteration 지표 — `--summary-export` JSON + 콘솔 로그 박제.
  - **Prometheus** (기가동, 9090): JVM heap used/max, GC pause, HikariCP active/pending/timeout, HTTP 5xx 카운트 — soak 중 주기 스냅샷 스크립트로 시계열 박제.
- 호스트 자원 병행 기록: `docker stats` 주기 캡처 (컨테이너별 CPU/MEM).

## 3. 시나리오 (실업무 혼합, 읽기 80 / 쓰기 20)

### 가상 사용자 흐름 (역할별 가중)
| 역할 (dev 계정) | 비중 | 흐름 |
|---|---|---|
| 영업 (dev_sales) | 40% | 로그인 → 대시보드 → 전표 목록/상세 → 거래처 목록 → 주문 목록 → **[쓰기] 주문/전표 생성** |
| 창고 (dev_warehouse) | 25% | 로그인 → 재고 조회 → 재고이동 목록 → 전표 목록 |
| 회계 (dev_accountant) | 20% | 로그인 → 분개장/계정과목 → 재무보고서 → 전표 목록 |
| 관리 (dev_manager) | 15% | 로그인 → 권한/사용자 목록 → 대시보드 → 알림 목록 |

- JWT 는 VU 별 로그인 1회 후 재사용 + 만료 시 재로그인 (실사용 동일).
- think time: 요청 간 1~5s 랜덤 (실사용자 모사. 스트레스 단계만 0.5~1s).

### 쓰기 작업 설계 (장시간 반복 가능성 의무)
- **재고 고갈 함정 회피**: 출고전표 발행이 시리얼 인스턴스 FIFO 를 소진하면 수 시간 내 seed 재고 고갈 → 인위적 실패. **쓰기는 재고 비차감 작업 위주로 구성**:
  1. 거래처 주문 생성 (DRAFT — 재고 무관) + 보류/복귀 전이
  2. 전표 DRAFT 생성 (구현 도메인상 DRAFT 가 재고 차감하면 제외 — **Codex 가 도메인 코드로 차감 시점 검증 후 확정**)
  3. 견적서 생성
- **테스트 식별자 의무**: 생성 본문 식별 필드(메모/거래처명 표기 등)에 `LOADTEST-` prefix — 정리 스크립트의 단일 키.
- 시퀀스/번호 채번(YYYY/MM/DD-{번호}) 경합 = 쓰기 부하의 핵심 검증 대상 (lock 경합/중복 채번).

## 4. 단계 (staged)

| 단계 | VU | 시간 | 목적 |
|---|---|---|---|
| S0 smoke | 2 | 1m | 스크립트/흐름 자체 검증 |
| S1 baseline | 20 | 10m | 평시 기준선 |
| S2 peak | 50 | 10m | 피크 내성 |
| S3 stress | 100 | 10m | 한계 탐색 (저하 양상 관찰) |
| S4 soak | 20 | 6~8h (밤새) | 누수/고갈/추세 |

### 임계치 (S1/S2/S4 PASS 기준 — S3 은 관찰 전용)
- http_req_failed < 1% · p95 < 500ms · p99 < 1.5s
- soak: heap used 추세 기울기 ≈ 0 (GC 후 baseline 회귀), HikariCP pending/timeout 0, 컨테이너 재시작 0, 에러율 시간대별 증가 없음

## 5. 정리 (cleanup)

- 종료 후 `LOADTEST-` 식별자 기반 일괄 정리 스크립트 (로컬 한정 psql — 생성 row + 연관 line/revision). 실행 전 카운트 보고 → 실행 → 0 확인 박제.
- dev 계정 잠금/실패 카운트 오염 원복 (dev_locked 제외 계정 failed_login_attempts=0).

## 6. 산출물

| 경로 | 내용 |
|---|---|
| `perf/k6/` | 시나리오 스크립트 (mixed-load.js 등) + 단계 config |
| `scripts/run-load-test.ps1` | 단계 실행 러너 (k6 Docker 호출 + 결과 수집) |
| `scripts/loadtest-metrics-snapshot.ps1` | Prometheus/docker stats 주기 스냅샷 |
| `scripts/cleanup-loadtest-data.ps1` | LOADTEST 식별자 일괄 정리 |
| `docs/qa/local-load-soak-test/` | 실측 보고서 + k6 summary JSON + 시계열 캡처 |

## 7. 워크플로우

- 조기 PR ([[feedback_open_pr_early]]) → **Codex 구현** ([[feedback_codex_implements_claude_reviews]], codex exec 백그라운드 + `</dev/null`) → 단계 실측 → soak(밤새, 주기 모니터) → 보고서 → dual review (Claude 5-agent + Codex) → CI green → PM 종합 → 자율 머지 ([[feedback_user_merge_authority]] — 0결함+green 시).
- CI 에는 풀 부하 비탑재 — 스크립트 lint/문법 검증 수준만 (장시간 부하는 로컬 전용). 보고서에 실측 증빙 박제.

## 8. 사전 정비 (본 세션 선행 완료)
- 구경로(`SamhanLogis`) bind mount 컨테이너 14개 재생성 (rename 잔재 — soak 중 재시작 실패 지뢰 제거).
- Prometheus 재기동 (25h 다운 상태였음 — exit 127, 구경로 mount 원인).
- influxd(호스트, 8086/8088 점유) 충돌 → `docker-compose.no-host-ports.yml` overlay 로 slip/partner-order 호스트 포트 제거 (기존 우회 컨벤션 유지).

## 9. 리스크

| 리스크 | 대응 |
|---|---|
| 채번 lock 경합으로 쓰기 병목/데드락 | 검출이 곧 목적 — 발생 시 결함 박제 + fix 사이클 |
| seed 재고/마스터 데이터 고갈 | §3 쓰기 설계로 회피 + smoke 에서 장시간 반복 가능성 검증 |
| 집 PC 절전/재부팅으로 soak 중단 | 시작 전 절전 상태 확인, 중단 시 실측 구간까지만 정직 보고 |
| Windows Docker 네트워크 한계 (npipe 등) | k6 를 컨테이너로 실행해 host 네트워크 변수 제거 |
| 야간 무인 — 스택 전체 다운 | 주기 모니터가 컨테이너 상태/에러율 감시, 이상 시 soak 중단 기록 |

# 로컬 실사용자 동시 부하 + 장기 운영(soak) 실측 보고

PR #424 | 브랜치 `feature/local-load-soak-test` | 실행일: 2026-06-08 (심야~오전, 개발책임자 취침 위임 자율)
환경: 로컬 Docker 스택 14 서비스 (집 PC 32 core / 62 GB) · k6 (grafana/k6, samhan-net → api-gateway 실 HTTP) · Prometheus 시계열 병행

> ⚠️ **환경 한정**: 본 결과는 결함 검출·추세 분석 목적. 집 PC 사양은 AWS 목표(m5.xlarge 4 vCPU/16 GB)와 다르므로 **절대 성능치는 Phase 11 배포 후 재측정 의무**.

---

## 1. 단계 실측 결과 (최종 — 전 fix 반영판)

| 단계 | VU | 시간 | 요청수 | rps | p50 | p95 | 실패율 | 4xx | 5xx | 판정 |
|---|---|---|---|---|---|---|---|---|---|---|
| smoke #4 | 2 | 1m | 256 | 4.2 | — | 23.7ms | **0.00%** | 0 | 0 | ✅ PASS |
| baseline #3 | 20 | 10m | 21,597 | 35.9 | 4.8ms | 8.8ms | **0.00%** | 0 | 0 | ✅ PASS |
| peak | 50 | 10m | 53,458 | 89.0 | 4.0ms | 6.2ms | **0.00%** | 0 | 0 | ✅ PASS |
| stress | 100 | 10m | 410,413 | **685.9** | 3.4ms | 5.8ms | 0.0005% | 0 | 1* | ✅ (관찰 단계) |
| soak | 20 | 6h | (별도 §3) | | | | | | | 진행 |

\* stress 5xx 1건 = D-LOAD-05 (draft_seq 채번 — 직후 fix8 로 해소, §2). 임계: 실패율<1% · p95<500ms · p99<1.5s — 전 단계 충족. **100VU 에서도 latency 한계 미도달** (32코어 로컬 여유).

원본: `perf/k6/out/summary-*.json` + `raw/k6-*.log` (실패 run 포함 전부 보존 — 결함 적발 증빙).

## 2. 적발 결함 처리 (전부 본 사이클 내 fix — 백로그 0)

### 제품 결함 (P1 — 기존 IT/QA/dual review 가 못 잡던 잠복)
| ID | 결함 | 적발 | fix | 검증 |
|---|---|---|---|---|
| D-LOAD-01 | inventory 재고잔량 productId 조회 `LazyInitializationException` → **항상 500** (부하 무관 단발 재현) | baseline #1 (5xx 798) | `StockBalanceRepository` `@EntityGraph(warehouse)` — OSIV 우회 없음 | 실서버 500→200 + 비트랜잭션 `StockBalanceQueryLazyIT` (기존 미적발 사유 = @Transactional 테스트가 세션 유지로 은폐) |
| D-LOAD-02 | slip 채번 동시 경합 `ux_slips_slip_type_no_active` 중복 → 500 | baseline #1 | `SlipNumberService` INSERT ON CONFLICT + PESSIMISTIC_WRITE 직렬화 | 병렬 8 유일성 IT (기존 IT 는 순차만) |
| D-LOAD-04 | **estimate 채번 동일 계열** — fix4 보호 밖 별개 구현 | baseline #2 | 계열 전수 sweep: **17행 처분표** 작성, 불안전 7경로 일괄 보호 (estimate/journal/taxinvoice/transfer/dispatch/taxinvoice-batch/hometax) | 병렬 IT 5종 신규 — `docs/dev-reports/d-load-04-fix5-numbering-family-sweep.md` |
| D-LOAD-05 | partner-order `draft_seq` 채번 — 처분표 사각 | **stress 410k 중 1건** | 기존 advisory lock 패턴 적용 + 처분표 정정 | 병렬 8 IT |

### 하네스/시나리오 결함 (실측이 스스로 적발)
- 러너 PS5.1 stderr 즉사 / exit code 배열 오판 (2건) — Start-Process 직캡처 + Write-Host 로 교정
- 시나리오 권한 미정렬 (sales→inventory 403 등) — **BE seed grant 1:1 정렬** (전 호출 page-code 근거 주석). RBAC 가 부하 중에도 일관 거부함을 역으로 실증
- 주문번호 `%2F` 게이트웨이 차단 — 기지 함정([[feedback_slip_order_number_format]]) 재현, `toOrderPathId` 이식
- accountant→slips 403 (grant 오판) — 호출 제거 (seed 진실원 수용)

### 환경 정비 (부수)
- 구경로(`SamhanLogis`) bind mount 컨테이너 14개 재생성 (rename 잔재 — soak 중 재시작 실패 지뢰)
- Prometheus 25h 다운 복구 (exit 127, 구경로 mount) + influxd 8086/8088 충돌 overlay 우회
- slip_db V33 checksum 로컬 드리프트 repair (의미 동등 — 인덱스 실존 확인 후)
- baseline #2 의 5xx ~85건 = PM 의 사전 재시작 직후 Eureka 라우트 캐시 503 burst 로 판명 (제품 결함 아님 — #3 무재시작 청정 측정으로 0 실증)

## 3. soak 6h (20VU 혼합, 읽기 80/쓰기 20) — 진행 중 간이 기록

| 경과 | heap 합계 | HikariCP pending/timeout | 서비스 ERROR | 컨테이너 |
|---|---|---|---|---|
| 0~1h | 1.37~1.52GB 진동 | 0 / 0 | 0 | 전부 healthy |
| ~2h | 1.45~1.60GB | 0 / 0 | 0 | 전부 healthy |
| ~3h | 1.33~1.70GB | 0 / 0 | 0 | 전부 healthy |
| ~4h | 1.46~1.61GB | 0 / 0 | 0 | 전부 healthy |

- **heap 전구간 1.22~1.70GB 경계 진동 — 증가 추세 없음** (GC 정상 회귀, 누수 무징후)
- 시계열 원본: `timeseries/metrics-20260608.csv` (5분 주기, Prometheus instant query)

### 최종 판정 (02:51~08:46 KST, 5h53m 실측 / summary-soak-20260608-025137.json)
| 지표 | 결과 | 판정 |
|---|---|---|
| 요청/iteration | 488,746 req · 143,466 iter (중단 0) | ✅ |
| **5xx** | **0** | ✅ |
| latency | p50 3.6ms · p95 5.9ms · max 403ms | ✅ |
| heap/HikariCP/컨테이너 | 누수 무징후 · pending/timeout 0 · 재시작 0 | ✅ |
| **4xx** | **47,756 (9.79%) — 전량 `GET /admin/partners/search` 403** | 🔴 **D-LOAD-06 적발** |

### 🔴 D-LOAD-06 (P1): 권한 판정 deny 고착 — soak 만이 적발 가능했던 결함
- **onset +65분 (03:56)** = 첫 JWT 만료/재로그인 웨이브와 정확히 일치 (게이트웨이 401 누적 100 = 20 VU × 시간당 재로그인 횟수 정합) → 종료까지 5시간 균일 지속 (2.7/s)
- 같은 계정(dev_sales/dev_manager)의 **다른 권한 경로는 전 구간 200** — partners.search 만 deny
- partner-service fallback WARN 0 → **auth-service 가 200 + allowed=false 응답** (DB account_page_permissions 판정)
- 부하 종료 ~15분 후 신선 로그인 단발 = **200 (자가 회복)** — 로그인 트리거 materializer 동시성/만료 데이터 의심
- 10분 100VU stress 에선 미발생 (TTL 미도달) — **장기 가동 검증의 가치 실증**. 근본 규명/fix 진행 중 (fix13)

## 4. 정리(cleanup) — 완료

- `LOADTEST-` 일괄 삭제 실행: partner_order_db (drafts 4,787 · orders 4,786 · lines 4,786 · revisions 4,786 · history 9,573) + slip_db (slips 4,685 · lines/revisions 동수 · estimates 4,484 · lines/revisions 동수) → **잔존 전부 0 재확인**
- dev 계정 failed_login_attempts 원복 11종 (dev_locked 은 5/잠금 유지 — seed 의도 보존 실측 확인)
- soak 컨테이너 제거, 스냅샷 루프 해제

## 5. 잔여/한계 (정직 박제)

- 스냅샷 스크립트 `abnormal_container_count` 카운팅 버그 (P3 — 실측엔 무영향, 별도 열 무시)
- FE(Electron) 렌더링 부하 비대상 (API 레벨 한정)
- 단일 노드 로컬 — 네트워크 지연/다중 AZ 변수 미반영. Phase 11 배포 후 동일 하네스 재실행 권장 (BASE_URL 만 교체)

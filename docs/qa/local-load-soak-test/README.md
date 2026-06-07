# 로컬 부하/soak 테스트 하네스

본 디렉터리는 k6 기반 로컬 API 부하 검증 산출물을 보관한다. 실측 결과를 가짜로 만들지 않는다. PM이 로컬 Docker 스택에서 실행한 원본 로그와 summary JSON만 저장한다.

## 실행 절차

1. 로컬 Docker 스택을 올린다. 게이트웨이는 `localhost:8080`, Prometheus는 `localhost:9090` 기준이다.
2. smoke:
   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\run-load-test.ps1 -Profile smoke
   ```
3. baseline / peak / stress:
   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\run-load-test.ps1 -Profile baseline
   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\run-load-test.ps1 -Profile peak
   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\run-load-test.ps1 -Profile stress
   ```
4. soak:
   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\run-load-test.ps1 -Profile soak -SoakDuration "7h" -Detach
   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\loadtest-metrics-snapshot.ps1 -IntervalSec 300
   ```
5. 정리:
   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\cleanup-loadtest-data.ps1
   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\cleanup-loadtest-data.ps1 -Execute
   ```

## 프로파일

| Profile | VU | 시간 | 목적 |
|---|---:|---:|---|
| smoke | 2 | 1m | 스크립트/로그인/읽기·쓰기 흐름 검증 |
| baseline | 20 | 10m | 평시 기준선 |
| peak | 50 | 10m | 피크 내성 |
| stress | 100 | 10m | 한계 탐색 |
| soak | 20 | 기본 7h | 누수/커넥션 고갈/재시작 추세 |

## 임계치

- `http_req_failed < 1%`
- `http_req_duration p95 < 500ms`
- `http_req_duration p99 < 1500ms`
- soak 추가 관찰: heap used가 GC 후 기준선으로 회귀, HikariCP pending/timeout 0, 컨테이너 재시작 0, 5xx 증가 추세 없음.

## 환경 한정

이 하네스는 로컬 결함 검출용이다. 집 PC의 CPU/메모리와 Phase 11 목표 AWS `m5.xlarge`는 자원 특성이 다르므로 절대 성능치를 운영 보증값으로 해석하지 않는다. Phase 11 배포 후 동일 시나리오를 AWS 환경에서 다시 측정해야 한다.

## 산출물 위치

- k6 원본 콘솔 로그: `docs/qa/local-load-soak-test/raw/`
- Prometheus/docker 주기 스냅샷 CSV: `docs/qa/local-load-soak-test/timeseries/`
- k6 summary JSON: `perf/k6/out/`

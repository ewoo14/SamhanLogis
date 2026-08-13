# MIG-23 로컬 직접 검증 스택

이 문서는 개발책임자가 로컬 PC에서 backend 14개 service와 6 운영 단위 (= 8 dev target: desktop, mobile, mobile-staff, web 3종 = estimate/order/design-system, arologis 2종 = desktop/mobile) 를 직접 실행해 클릭 검증하는 절차다.

## 1 command 시작

PowerShell:

```powershell
cd C:\dev\SamhanLogis
.\scripts\launch-local-stack.ps1
.\scripts\seed-local-stack.ps1
```

Bash:

```bash
cd /c/dev/SamhanLogis
./scripts/launch-local-stack.sh
powershell.exe -ExecutionPolicy Bypass -File scripts/seed-local-stack.ps1
```

`launch-local-stack`는 service bootJar를 먼저 만들고, `infrastructure/docker-compose.yml` + `infrastructure/docker-compose.local-all.yml` 조합으로 infra/backend를 올린 뒤 client dev server를 병렬 실행한다. 이 기본 런처는 기존 서비스 집합만 기동하며 logging-service는 기본 profile에서 제외된다.

logging-service가 필요할 때만 기존 Compose 대상 지정 방식으로 명시적으로 기동한다. 이미 실행 중인 공유 의존성을 건드리지 않도록 `--no-deps`를 유지한다.

```powershell
.\gradlew.bat :services:logging-service:bootJar
docker compose -f infrastructure/docker-compose.yml -f infrastructure/docker-compose.local-all.yml up -d --build --no-deps logging-service
```

기본 런처를 실행해도 logging-service가 자동 생성되지 않으며, 위 명령을 실행한 경우에만 `samhan-logging-service`가 추가된다.

## 접속 URL / Port

| 대상 | URL / 실행 방식 | 비고 |
|---|---|---|
| API Gateway | http://localhost:8080 | Samhan Public 통합 진입점 |
| Eureka | http://localhost:8761 | 서비스 등록 상태 |
| Grafana | http://localhost:3000 | `admin / samhan_dev_pw` |
| Prometheus | http://localhost:9090 | MIG-21 metrics |
| MinIO Console | http://localhost:9001 | `samhan / samhan_dev_pw` |
| desktop | Electron 자동 실행, renderer http://localhost:5173 | 회계/영업 admin |
| mobile | Expo QR | 거래처 주문서 WebView |
| mobile-staff | Expo QR | 현장 직원 견적 WebView |
| web/estimate-app | http://localhost:5183 | 종합견적서 (기존 PORT 표준 유지) |
| web/order-app | http://localhost:5180 | 거래처 주문서 (vite.config 표준 유지) |
| web/design-system | http://localhost:5176 | 디자인 시스템 Vite dev |
| arologis-desktop | Electron 자동 실행 | API `http://localhost:8097` |
| arologis-mobile | Expo QR | 아로로지스 기사 앱 |

Client 로그는 `logs/local-stack/clients/*.log`에 쌓인다.

## 로그인 credential

| 사용자 | 비밀번호 | 역할 |
|---|---|---|
| `master@samhan.test` | `Pa$$w0rd!` | `MASTER` |
| `manager@samhan.test` | `Pa$$w0rd!` | `MANAGER` |
| `accountant@samhan.test` | `Pa$$w0rd!` | `ACCOUNTANT` |
| `staff@samhan.test` | `Pa$$w0rd!` | `STAFF` |
| `driver@samhan.test` | `Pa$$w0rd!` | `DRIVER` |

Samhan Public backend role enum은 `MASTER / DEVELOPER / MANAGER / DISPATCH / SALES / ACCOUNTANT / WAREHOUSE / INVENTORY / STAFF / DRIVER` 10종이다. STAFF/DRIVER 추가는 본 MIG-23 슬라이스에서 진행되었다. 아로로지스 기사 앱은 별도 자체 인증이며, dev seed의 기사 전화번호 `010-2000-0001`부터 사용할 수 있다.

## 마이그레이션 검증 절차

### 적용된 Flyway 마이그레이션 불변 규칙

`origin/main`에 이미 존재하는 `**/db/migration/V*.sql`은 적용된 마이그레이션으로 취급한다. 기존 파일의 내용 수정(주석만 변경하는 경우 포함), 삭제, 이름변경은 Flyway 체크섬 또는 파일 식별자를 깨뜨려 기존 DB를 기동 불가로 만들 수 있으므로 금지한다. 변경이 필요하면 기존 파일을 편집하지 말고 새 `V*.sql` 마이그레이션을 추가한다.

부득이하게 이미 적용된 파일을 변경한 경우에는 모든 환경에서 다음 복구 스크립트를 실행해야 한다. 이 작업은 체크섬 메타데이터를 복구하는 운영 조치이며, 새 변경의 대안이 아니다.

```powershell
.\scripts\repair-flyway-checksums.ps1 -WhatIf
.\scripts\repair-flyway-checksums.ps1
```

CI의 `Applied Flyway Migration Guard`가 서비스명 목록 없이 레포 전체의 `**/db/migration/V*.sql`을 `origin/main`과 비교해 수정·삭제·이름변경을 차단한다. 신규 migration 추가는 허용한다.

1. `.\scripts\seed-local-stack.ps1` 실행 후 MIG-1~11 reimport 결과에서 `processed` 또는 `skipped`가 출력되는지 확인한다.
2. desktop 로그인: `master@samhan.test / Pa$$w0rd!`.
3. 회계 관리자 메뉴에서 다음 화면을 순서대로 연다.
   - Cash 지출/입금
   - Order 목록/상세
   - Aging Snapshot
   - Sales Ledger / Purchase Ledger
   - 운영 대시보드
4. 새로고침 또는 필터 클릭 시 500 오류가 없고, UUID 대신 전표번호/주문번호/거래처명 같은 업무 식별자가 보이는지 확인한다.
5. Grafana `MIG-21` dashboard 또는 Prometheus에서 `ecount_*` metrics가 노출되는지 확인한다.

## 흔한 트러블슈팅

| 증상 | 조치 |
|---|---|
| port 충돌 | `Get-NetTCPConnection -LocalPort 8080,8761,3000,5173,5176,5180,5183`로 점유 프로세스 확인 후 종료한다. |
| Docker memory 부족 | Docker Desktop memory를 8GB 이상으로 올리고 `.\scripts\launch-local-stack.ps1 -SkipClients`로 backend만 먼저 올린다. |
| bootJar 실패 | JDK 17 확인 후 `.\gradlew.bat :services:auth-service:bootJar --no-daemon`처럼 단일 service부터 확인한다. |
| Electron build 실패 | 해당 client에서 `npm.cmd install` 후 `npm.cmd run typecheck`를 먼저 실행한다. |
| Expo QR 인식 실패 | 같은 Wi-Fi인지 확인한다. 안 되면 client 로그 터미널에서 Expo `tunnel` 모드로 전환한다. |
| MIG reimport 일부 실패 | `logs/local-stack`와 해당 service container log를 확인한다. source hash 멱등으로 이미 처리된 파일은 `skipped`가 정상이다. |
| Grafana 3000 충돌 | `infrastructure/docker-compose.local-all.yml`의 grafana host port를 임시로 `3100:3000`으로 바꾼다. |
| IDE에서 `ecount-io project missing` | 회사 PC IDE workspace stale. `./gradlew :shared:ecount-io:eclipse :services:accounting-service:eclipse :services:inventory-service:eclipse :services:partner-service:eclipse :services:slip-service:eclipse --no-daemon --no-parallel` 실행 후 IDE에서 Reload Window. |
| `docker compose -f local-all.yml config` 실패 | 본 파일은 base `docker-compose.yml` 의 overlay이다. `-f infrastructure/docker-compose.yml -f infrastructure/docker-compose.local-all.yml` 조합으로 검증해야 한다. |
| 스크립트 실행 시 `'docker' 미설치` | Docker Desktop 설치 + 실행 확인. PowerShell 재시작으로 PATH 갱신. |
| 스크립트 실행 시 `Docker daemon 미가동` | Docker Desktop 트레이 아이콘 확인. 기동 후 다시 시도. |

## 회사 PC 첫 셋업

1. `git fetch origin && git checkout spec/2026-05-21-mig-23-local-6-client-direct-test` (또는 main 머지 후 `git checkout main && git pull origin main`).
2. `./scripts/sync-claude-memory.ps1` 으로 Claude 메모리 동기화 (양 PC 일관성).
3. Docker Desktop 설치/기동 + memory 8GB+ 할당.
4. JDK 17 설치 + `JAVA_HOME` 설정. 한글 path 회피 위해 `C:\dev\SamhanLogis` 등 ASCII path 권장.
5. Node.js 20+ + npm 10+ 설치.
6. `./gradlew :shared:ecount-io:eclipse :services:accounting-service:eclipse :services:inventory-service:eclipse :services:notification-service:eclipse :services:partner-order-service:eclipse :services:partner-service:eclipse :services:product-service:eclipse :services:slip-service:eclipse :services:user-service:eclipse --no-daemon --no-parallel` 으로 IDE 인덱싱용 `.classpath`/`.project` 생성.
7. IDE 재로드 — VS Code/Cursor: `Developer: Reload Window`, IntelliJ IDEA: `Gradle Tool Window > Reload All Gradle Projects`, Eclipse: `File > Refresh + Project > Clean`.
8. `.env` 등 시크릿은 [`docs/dev-environment-setup-multi-pc.md`](../dev-environment-setup-multi-pc.md) 참고.

## 중지

```powershell
.\scripts\stop-local-stack.ps1
```

또는 Bash:

```bash
./scripts/stop-local-stack.sh
```

`stop-local-stack` 는 client process (8 target) 의 process group kill (Bash) 또는 PID 종료 (PowerShell) 후 `docker compose down` 까지 처리한다.

데이터까지 초기화하려면 `-DownVolumes` (PowerShell) 또는 `--down-volumes` (Bash) 옵션을 사용한다. 로컬 검증 데이터가 삭제된다.

## 로그 cleanup

`logs/local-stack/clients/*.log` 는 매 launch 시 자동 truncate (덮어쓰기) 되지만, 단일 launch 안에서는 Expo/Vite HMR 로그가 누적된다. 장시간 dev 작업 후 디스크 절약은 `Remove-Item logs/local-stack/clients/*.log -ErrorAction SilentlyContinue` 또는 `rm -f logs/local-stack/clients/*.log` 를 stop 직후 실행한다.

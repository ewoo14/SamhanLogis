# MIG-23 로컬 직접 검증 스택

이 문서는 개발책임자가 로컬 PC에서 backend 14개 service와 6개 client 묶음을 직접 실행해 클릭 검증하는 절차다.

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

`launch-local-stack`는 service bootJar를 먼저 만들고, `infrastructure/docker-compose.yml` + `infrastructure/docker-compose.local-all.yml` 조합으로 infra/backend를 올린 뒤 client dev server를 병렬 실행한다.

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
| web/estimate-app | http://localhost:5174 | 종합견적서 |
| web/order-app | http://localhost:5175 | 거래처 주문서 |
| web/design-system | http://localhost:5176 | 디자인 시스템 Vite dev |
| arologis-desktop | Electron 자동 실행 | API `http://localhost:8097` |
| arologis-mobile | Expo QR | 기사 앱 |

Client 로그는 `logs/local-stack/clients/*.log`에 쌓인다.

## 로그인 credential

| 사용자 | 비밀번호 | 요청 role label | 현재 backend role |
|---|---|---|---|
| `master@samhan.test` | `Pa$$w0rd!` | `ROLE_MASTER` | `MASTER` |
| `manager@samhan.test` | `Pa$$w0rd!` | `ROLE_MANAGER` | `MANAGER` |
| `accountant@samhan.test` | `Pa$$w0rd!` | `ROLE_ACCOUNTANT` | `ACCOUNTANT` |
| `staff@samhan.test` | `Pa$$w0rd!` | `ROLE_STAFF` | `SALES` alias |
| `driver@samhan.test` | `Pa$$w0rd!` | `ROLE_DRIVER` | `DISPATCH` alias |

현재 Samhan Public backend role enum은 `MASTER / DEVELOPER / MANAGER / DISPATCH / SALES / ACCOUNTANT / WAREHOUSE / INVENTORY` 8종이다. 따라서 MIG-23 seed는 사용자 요구 label을 보존하되 `STAFF -> SALES`, `DRIVER -> DISPATCH`로 등록한다. 아로로지스 기사 앱은 별도 자체 인증이며, dev seed의 기사 전화번호 `010-2000-0001`부터 사용할 수 있다.

## 마이그레이션 검증 절차

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
| port 충돌 | `Get-NetTCPConnection -LocalPort 8080,8761,3000,5173,5174,5175,5176`로 점유 프로세스 확인 후 종료한다. |
| Docker memory 부족 | Docker Desktop memory를 8GB 이상으로 올리고 `.\scripts\launch-local-stack.ps1 -SkipClients`로 backend만 먼저 올린다. |
| bootJar 실패 | JDK 17 확인 후 `.\gradlew.bat :services:auth-service:bootJar --no-daemon`처럼 단일 service부터 확인한다. |
| Electron build 실패 | 해당 client에서 `npm.cmd install` 후 `npm.cmd run typecheck`를 먼저 실행한다. |
| Expo QR 인식 실패 | 같은 Wi-Fi인지 확인한다. 안 되면 client 로그 터미널에서 Expo `tunnel` 모드로 전환한다. |
| MIG reimport 일부 실패 | `logs/local-stack`와 해당 service container log를 확인한다. source hash 멱등으로 이미 처리된 파일은 `skipped`가 정상이다. |
| Grafana 3000 충돌 | `infrastructure/docker-compose.local-all.yml`의 grafana host port를 임시로 `3100:3000`으로 바꾼다. |

## 중지

```powershell
docker compose -f infrastructure/docker-compose.yml -f infrastructure/docker-compose.local-all.yml down
```

데이터까지 초기화하려면 `down -v`를 사용한다. 로컬 검증 데이터가 삭제된다.

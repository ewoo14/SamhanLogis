# MIG-23 로컬 6 client 직접 검증 환경 구축 — Design Spec

> 작성일: 2026-05-21
> branch: `spec/2026-05-21-mig-23-local-6-client-direct-test`
> 입력: **사용자 강한 요구** (MIG-22 머지 후)

## 개요

사용자 명시: "로컬에서 직접 접속을 원함. 5개의 클라이언트 앱을 만들어서 로컬에서 직접 테스트 원함" → 기존 6 client 정비 + 1 command launcher.

- baseline: MIG-1~22 머지 완료
- 옵션 C 21단계 + Codex 전체 권한 + **TM PR comment 머지 게이트 의무**

## 6 client 매핑

| Client | 디렉토리 | 기술 | 대상 사용자 |
|---|---|---|---|
| **desktop** | `clients/desktop` | Electron (회계 + 영업 admin) | 회계 담당자, 관리자 |
| **mobile** | `clients/mobile` | React Native Expo | (Phase 9 W3 검토 후 결정) |
| **mobile-staff** | `clients/mobile-staff` | RN Expo (현장 직원) | 현장 직원 |
| **web** | `clients/web/{estimate-app, order-app, design-system}` | Vite/React (3 sub-app) | 거래처/외부 |
| **arologis-desktop** | `clients/arologis-desktop` | Electron (배차 관리자) | 배차 관리자 |
| **arologis-mobile** | `clients/arologis-mobile` | RN Expo (기사) | 기사 |

## 산출

### 1. Docker compose 통합 (BE 14 service + infra)

`infrastructure/docker-compose.yml` 보강 + `docker-compose.local-all.yml` 신규:
- postgres (5432) — 14 service 별 DB 또는 공유
- redis (6379)
- eureka-server (8761)
- api-gateway (8080)
- auth-service / user-service / product-service / inventory-service / slip-service / accounting-service / partner-service / partner-auth-service / partner-order-service / dc-config-service / groupware-service / notification-service / dashboard-service / arologis-service
- (선택) grafana (3000) + prometheus (9090)
- (선택) MinIO (9001 / 9000)

### 2. 6 client 로컬 dev server 실행 정합

각 client `package.json scripts.local-dev` 신규 (BASE_URL=http://localhost:8080):
- desktop: `npm run dev` (Electron) — http://localhost:5173 (Vite renderer) + Electron main
- mobile / mobile-staff / arologis-mobile: `npx expo start` (Expo Go)
- web sub-app: `npm run dev` (Vite, port 5174~5176 각)
- arologis-desktop: `npm run dev` (Electron, port 5180)

### 3. 1 command launcher

루트 `scripts/launch-local-stack.ps1` (Windows) + `scripts/launch-local-stack.sh` (Linux/Mac):
- Step 1: `docker compose -f infrastructure/docker-compose.yml -f infrastructure/docker-compose.local-all.yml up -d`
- Step 2: 5 service health check (postgres / eureka / gateway / auth / dashboard)
- Step 3: 6 client dev server 병렬 실행 (concurrently 또는 PowerShell Start-Process)
- Step 4: 사용자 직접 접속 URL 출력 (다음 표)

### 4. 사용자 직접 접속 가이드

| Client | 접속 URL | 비고 |
|---|---|---|
| desktop | Electron 자동 실행 | 회계 admin |
| mobile-staff | Expo Go QR 또는 emulator | 현장 직원 |
| web/estimate-app | http://localhost:5174 | 견적 |
| web/order-app | http://localhost:5175 | 주문 |
| web/design-system | http://localhost:5176 | Storybook |
| arologis-desktop | Electron 자동 실행 | 배차 관리자 |
| arologis-mobile | Expo Go QR | 기사 |
| **api-gateway** | http://localhost:8080 | BE 통합 진입점 |
| **swagger** | http://localhost:8080/swagger-ui.html | 14 service API docs |
| **eureka** | http://localhost:8761 | service discovery |

### 5. Mock 데이터 + 시드

`scripts/seed-local-stack.ps1`:
- 14 service Flyway 자동 실행
- 이카운트 raw 11종 자동 import (MIG-1~11 endpoint 자동 호출)
- 사용자 5명 seed (MASTER/MANAGER/ACCOUNTANT/STAFF/DRIVER)
- 배차 sample 데이터 seed

### 6. 운영자 README + 트러블슈팅

`docs/local-stack/README.md`:
- 1 command 시작
- 6 client 접속 가이드
- 흔한 트러블슈팅 (port 충돌 / Docker memory / Electron build 실패 등)
- 사용자 5명 로그인 credential

## 결정 (D-MIG-23-XX)

- D-MIG-23-01 기존 6 client 정비 (신규 X)
- D-MIG-23-02 Docker compose local-all 신규 (기존 + dashboard/grafana/prometheus 통합)
- D-MIG-23-03 1 command launcher PowerShell + Bash 양쪽
- D-MIG-23-04 사용자 5 credential seed (MASTER/MANAGER/ACCOUNTANT/STAFF/DRIVER)
- D-MIG-23-05 이카운트 raw 11종 자동 import seed (mock 데이터)
- D-MIG-23-06 docs/local-stack/README.md 사용자 친화 가이드
- D-MIG-23-07 옵션 C 21단계 + **TM PR comment 머지 게이트 의무** + Codex 전체 권한

## 비즈니스 영향

사용자 의도:
- 즉시 로컬 실행 + 직접 접속 + 클릭 테스트 가능
- 6 client UX 검증 (특히 admin UI MIG-14 + cutover guide MIG-19 사용성)
- 이카운트 마이그레이션 결과 시각 확인 (Cash/Order/AgingSnapshot/Ledger admin 화면)
- AWS 배포 전 마지막 로컬 검증

🤖 PM Claude — 2026-05-21 사용자 강한 요구 후

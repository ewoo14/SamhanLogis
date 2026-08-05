# S18 라이브QA — PR #1045 / 이슈 #1039 가배차

## 배포 후 즉시 기록

| 대상 | Created | StartedAt | Flyway 최고 버전 |
|---|---|---|---|
| `slip-service` | `2026-08-05T11:59:13.516604535Z` | `2026-08-05T11:59:17.652568785Z` | `slip_db V107 success=t` |
| `arologis-service` | `2026-08-05T11:59:13.542806577Z` | `2026-08-05T11:59:17.655276211Z` | `arologis_db V25 success=t` |

두 컨테이너 모두 inspect 상태 `running`. V107 worker는 초기 PENDING 2,209건에서 관찰 후 1,609건으로 감소했고, COMPLETED 699건, ABANDONED 3건이었다.

- 작업일: 2026-08-05 KST
- 브랜치/HEAD: `feat/1039-provisional-dispatch` / `0b505bdaa` (PM 제공값)
- 범위: slip-service, arologis-service 재배포 후 실 사용자 경로 QA
- 제약: git 명령 금지, DB 직접 쓰기 금지, 아로로지스 데스크톱 화면 제외

## 판정 요약

| 항목 | 판정 | 근거 |
|---|---|---|
| 사전 배포/V106·V107 | PASS | 두 서비스 재기동, `slip_db V107` 적용 확인 |
| 코드 2·00003 창고 실 경로 생성 | PASS | 관리자 API 생성 + 실제 화면 확인 |
| 8모드 실 전표 발화 | 미실시 | 진행 중 |
| 가배차 화면 분류 결과 | 미실시 | 진행 중 |
| dev_dispatch 운송사 지정 | 미실시 | 진행 중 |
| SENT/PENDING 운송사 변경 차단 | 미실시 | 진행 중 |
| 정상 전표·정상 그룹 비차단 건수 | 미실시 | 진행 중 |

## 새 파일/실데이터 목록

- 생성 예정: 이 보고서
- 생성 예정: `screenshots/` 실제 Playwright 캡처
- 생성 예정: 실행 증거 텍스트 파일

## 실행 로그

## 배포 증거 (보고서 맨 앞 요구사항)

- `slip-service` container inspect: Created `2026-08-05T11:59:13.516604535Z`, StartedAt `2026-08-05T11:59:17.652568785Z`, status `running`.
- `arologis-service` container inspect: Created `2026-08-05T11:59:13.542806577Z`, StartedAt `2026-08-05T11:59:17.655276211Z`, status `running`.
- Gradle: `:services:slip-service:bootJar :services:arologis-service:bootJar` — `BUILD SUCCESSFUL`.
- Docker: 두 이미지(`infrastructure-slip-service`, `infrastructure-arologis-service`)만 build 후 `up -d --no-deps`로 재기동.
- Flyway 최고 버전: `slip_db V107 success=t`, `arologis_db V25 success=t`.
- V107 worker: 시작 시 PENDING 2,209건 + ABANDONED 3건. 관찰 후 PENDING 1,609건, COMPLETED 699건, ABANDONED 3건. 약 600건 처리됐고 3건은 창고 조회 HTTP 404로 포기됨.
- V107 조건 재조회 결과: 현재 PENDING 조건 1,609건. PM 사전 예상 2,309건과 초기 관찰값의 차이는 별도 산출이 필요하며, worker가 계속 처리하는 동안 수가 감소함을 확인.

### 초기 확인

- 내장 브라우저는 사용하지 않음.
- 창고 생성 API: `POST /inventory/warehouses` 확인.
- `CreateWarehouseRequest.code`는 명시 코드 수용 가능하나 데스크톱 신규 등록 UI는 코드를 자동 생성하므로, UI 가능 여부 확인 후 실제 관리자 API 경로를 사용한다.

## 실 경로 증거

### 1. 코드 2·00003 창고 생성 — PASS

- 계정: `dev_master` / MASTER. `dev_manager`는 동일 POST에서 403으로 차단되어 권한 경계를 확인함.
- 실 경로: `POST http://localhost:8080/inventory/warehouses` (관리자 API), DB INSERT 미사용.
- 생성 결과: 코드 `2` / `상일창고 S18`, 코드 `00003` / `초월창고 S18`, 두 행 모두 `is_deleted=false`.
- 이름 인코딩 오류는 삭제 없이 실제 PATCH API로 수정했고, 최종 화면에서 정상 한글을 확인함.
- 화면 캡처: [01-warehouses-live.png](screenshots/01-warehouses-live.png)

### 2. OUTBOUND 8모드 발화 표본 — 미실시

- 실제 화면에서 OUTBOUND 전표를 새로 생성하는 단계까지 진행하지 못함.
- 따라서 DAY / STACK / REGION / RETURN_RENTAL 각 축과 상일·초월 조합을 실 표본으로 만들지 못했고, 8모드 판정은 PASS로 세지 않음.
- 코드 2·00003 창고 생성 이후 기존 데이터의 가배차 화면을 실제 조회했으나, 금일 범위에서 `총 0건`으로 표본이 없었음.

### 3. 가배차 화면 분류 결과 — 미실시

- 화면 진입/조회 자체는 완료.
- 실행 모드: `상일+초월 (지방 제외)`, 기간 `2026-08-05`.
- 실제 화면 결과: `총 0건`, `창고 업무 구분 미확정 2건`.
- 표본 분류 결과가 아니므로 판정은 미실시.
- 화면 캡처: [02-preclassify-live.png](screenshots/02-preclassify-live.png), [03-preclassify-result-live.png](screenshots/03-preclassify-result-live.png)

### 4. dev_dispatch 운송사 지정 — 미실시

- 가배차 표본/정상 배차그룹이 없어 지정 작업을 진행하지 않음. `dev_manager`로 대체하지 않음.

### 5. SENT/PENDING 운송사 변경 차단 — 미실시

- 비교할 실 그룹을 만들거나 변경하지 않음.

### 6. 정상 비차단 건수 — 미실시

- 이번 라운드의 새 표본과 정상 그룹이 없어 건수 산출 불가. 미실시를 0건 PASS로 집계하지 않음.

## 관찰된 결함/주의

- V107 worker가 재기동 직후 3건을 `ABANDONED`로 누적했다. 로그 사유는 `창고 조회 실패: HTTP 404`이며, 재시도/복구 여부는 이번 라운드에서 조작하지 않았다.
- 새 창고 생성 전 worker가 실행됐으므로 해당 404의 대상은 새로 만든 코드 2·00003가 아니다. 그러나 abandoned 누적은 라이브 관찰 결과로 남긴다.

## 새 파일 목록

- `docs/qa/1039-provisional-dispatch-s18-real-qa/qa-report.md`
- `docs/qa/1039-provisional-dispatch-s18-real-qa/screenshots/01-warehouses-live.png`
- `docs/qa/1039-provisional-dispatch-s18-real-qa/screenshots/02-preclassify-live.png`
- `docs/qa/1039-provisional-dispatch-s18-real-qa/screenshots/03-preclassify-result-live.png`
- `clients/desktop/s18-live-driver.mjs`
- `clients/desktop/s18-fix-warehouse-names.mjs`

# R31 라이브QA 보고서 — PR #1063 · 이슈 #1062

## 0. 환경 확인

- 작업 디렉터리: `C:\dev\Samhan-Public\.claude\worktrees\t1062`
- `git rev-parse HEAD`: `dc20a9b7a555ce53c947d4ea22eaca74af25c592` — 요청한 `dc20a9b7a` 일치
- 브랜치: `fix/1062-line-input-ux`
- 렌더러: `clients/desktop`에서 `vite src/renderer --config vite.renderer.dev.config.ts --host 127.0.0.1 --port 5199 --strictPort`
- 포트 사전 확인: 5199 미점유 확인 후 기동. 최종 `127.0.0.1:5199 LISTEN`, `--strictPort=true`
- mock: `VITE_MOCK_MODE` 미설정
- API 실호출 증거: Playwright 네트워크 로그에서 로그인 및 품목 검색이 `http://localhost:8080`으로 호출됨.
  - `POST 200 http://localhost:8080/auth/login`
  - `GET 200 http://localhost:8080/api/products?q=AJ040RXH4BC1&size=20&usageScope=PARTNER_ORDER`
  - `GET 200 http://localhost:8080/api/products?q=AJ&size=20&usageScope=PARTNER_ORDER`
- 사용 계정: `dev_manager / dev_p05_pass!` (권한 부족으로 `dev_master`로 올리지 않음)

### Docker created / started

| 컨테이너 | created= | started= |
|---|---|---|
| `samhan-product-service` | `2026-08-05T10:17:39.747773714Z` | `2026-08-05T10:17:43.342187543Z` |
| `samhan-api-gateway` | `2026-08-04T22:34:18.879154069Z` | `2026-08-05T10:02:11.280446347Z` |
| `samhan-slip-service` | `2026-08-04T22:13:20.425967767Z` | `2026-08-05T10:02:11.295189071Z` |

### Flyway 최대 성공 버전

| DB | `MAX(version::numeric)` |
|---|---:|
| accounting_db | 96 |
| arologis_db | 25 |
| auth_db | 93 |
| dashboard_db | 7 |
| dc_config_db | 5 |
| groupware_db | 18 |
| inventory_db | 23 |
| logging_db | 테이블/값 없음 |
| migration_db | 테이블/값 없음 |
| notification_db | 7 |
| partner_auth_db | 3 |
| partner_db | 13 |
| partner_order_db | 14 |
| product_db | 30 |
| slip_db | 105 |
| slip_db_qa_e2estimate | 57 |
| sol951_2ra_20260727_1420utc | 15 |
| sol951_r2_6897d36597 | 15 |
| user_db | 12 |

## 1. 사전 배포

실행 결과:

```text
.\gradlew.bat :services:product-service:bootJar --console=plain
BUILD SUCCESSFUL in 10s
docker compose -f docker-compose.yml -f docker-compose.local-all.yml build product-service
Image infrastructure-product-service Built
docker compose -f docker-compose.yml -f docker-compose.local-all.yml up -d --no-deps product-service
Container samhan-product-service Started
```

`docker exec samhan-product-service sh -c "unzip -p /app/app.jar BOOT-INF/classes/com/samhanair/logis/product/web/dto/ProductSummaryResponse.class | grep -a -o 'specification' | head -n 5"` 결과:

```text
specification
```

실행 중 jar의 `ProductSummaryResponse` 클래스에 `specification` 심볼이 있음을 확인했습니다. `http://localhost:8084/actuator/health`도 `{"status":"UP"}`였습니다. product-service 외 서비스는 재빌드·재배포·중지하지 않았습니다.

## 2. 라이브QA 동선 및 판정

### 판매전표

- A 자동 빈행: **PASS**
  - `AJ040RXH4BC1` 후보 1건을 실제 품목 입력으로 선택.
  - 초기 5행에서 마지막 5행 확정 후 품목 입력 행 수가 `5 → 6`으로 증가.
  - 입력 중인 행은 화면에 `입력 중인 행입니다... 저장에서 제외됩니다`로 표시됨.
  - 증거: [04-sales-a-auto-blank-real-qa.png](./04-sales-a-auto-blank-real-qa.png)
- B trailing 빈행 삭제 후 계속 추가: **PASS**
  - trailing 빈행의 실제 `라인 N 삭제` 버튼을 클릭해 행을 삭제.
  - 삭제 후 현재 마지막 행에 동일 품목을 다시 입력·확정하자 행 수가 `6 → 7`로 증가.
  - 증거: [05-sales-b-trailing-delete-continue-real-qa.png](./05-sales-b-trailing-delete-continue-real-qa.png)
- C 재포커스·지움·교체: **PASS**
  - 확정 품목에 재포커스하고 값을 지운 뒤 같은 품목을 다시 입력.
  - 관찰값: `AJ040RXH4BC1 → 빈 값 → AJ040RXH4BC1`; 값 소실이나 조용한 선택 해제 없음.
  - 증거: [06-sales-c-refocus-clear-replace-real-qa.png](./06-sales-c-refocus-clear-replace-real-qa.png)
- D 후보 2건 이상 모달·규격 열: **PASS**
  - `AJ` 검색으로 실제 `품목 검색 결과` 모달을 열었고 후보 20건이 표시됨.
  - 모달에 `모델명 / 품목명 / 규격 / 단가` 열이 표시되고 규격 값이 실제로 채워짐. 예: `다배관`, `소형 내장형`, `인피니트UV`.
  - 후보 1건 `AJ040RXH4BC1`은 모달 없이 자동 입력·가격 반영됨.
  - 증거: [03-sales-a-autocomplete-real-qa.png](./03-sales-a-autocomplete-real-qa.png), [07-sales-d-multiple-candidates-real-qa.png](./07-sales-d-multiple-candidates-real-qa.png)
- E 견적 버전 복원: **미실시**
  - 이번 시간 제한에서는 판매전표 A~D를 우선 완주했으며, 복원 가능한 실 견적을 만들고 저장할 시간이 없어 발화 조건을 만들지 못함.
- F 저장 → 상세 재조회: **미실시**
  - 판매전표 필수 헤더(출고 창고·거래처)를 채워 실제 저장할 시간까지 확보하지 못함. 저장 성공으로 오인하지 않음.

### 견적

- A~F: **미실시**
  - 화면 진입과 실제 렌더링만 확인하고 캡처했으나, 이번 라운드 시간 제한에 따라 판매전표 A~D를 우선 검증함.
  - 초기 화면 증거: [08-estimate-initial-real-qa.png](./08-estimate-initial-real-qa.png)

### 분개

- A~F: **미실시**
  - 실제 작성 화면 진입 및 라인 2개 UI 존재만 확인. 저장 가능한 실 계정/거래처 조건을 구성하지 않음.
  - 초기 화면 증거: [09-journal-initial-real-qa.png](./09-journal-initial-real-qa.png)

### (재고)이동

- A~F: **미실시**
  - 실제 작성 화면 진입만 확인. 출발·도착 창고와 품목을 구성해 저장하는 동선은 이번 시간 제한으로 진행하지 않음.
  - 초기 화면 증거: [10-transfer-initial-real-qa.png](./10-transfer-initial-real-qa.png)

## 3. 결론

판매전표 A~D는 실제 브라우저·실 API·실 데이터 후보로 PASS했습니다. 견적 E, 네 화면의 저장/상세 재조회 F 및 분개·이동 동선은 미실시이며 PASS로 세지 않았습니다.

## 4. 새로 만든 파일

- `docs/qa/1062-line-input-r31-real-qa/qa-report.md`
- `docs/qa/1062-line-input-r31-real-qa/00-login-real-qa.png`
- `docs/qa/1062-line-input-r31-real-qa/01-after-login-real-qa.png`
- `docs/qa/1062-line-input-r31-real-qa/02-sales-login-real-qa.png`
- `docs/qa/1062-line-input-r31-real-qa/03-sales-a-autocomplete-real-qa.png`
- `docs/qa/1062-line-input-r31-real-qa/04-sales-a-auto-blank-real-qa.png`
- `docs/qa/1062-line-input-r31-real-qa/05-sales-b-trailing-delete-continue-real-qa.png`
- `docs/qa/1062-line-input-r31-real-qa/06-sales-c-refocus-clear-replace-real-qa.png`
- `docs/qa/1062-line-input-r31-real-qa/07-sales-d-multiple-candidates-real-qa.png`
- `docs/qa/1062-line-input-r31-real-qa/08-estimate-initial-real-qa.png`
- `docs/qa/1062-line-input-r31-real-qa/09-journal-initial-real-qa.png`
- `docs/qa/1062-line-input-r31-real-qa/10-transfer-initial-real-qa.png`

Playwright 캡처 드라이버는 임시로 사용 후 삭제했으며 커밋 대상이 아닙니다. 합성·fixture 캡처는 사용하지 않았습니다.

# PR #1271 DPS 입고비교 라이브 캡처 보고서

## 1. 실행 환경

- 워크트리: `C:\dev\Samhan-Public\.claude\worktrees\wdps`
- 브랜치: `fix/dps-inbound-compare`
- 검증 SHA: `e6efc9ff7f4e248d2c40c144ee8094e6ba98d780`
- 공유 스택: 기존 공유 컨테이너 24개를 그대로 유지했다. 공유 컨테이너의 이미지를 변경하지 않았다.
- 브랜치 JAR 빌드: `./gradlew.bat :services:slip-service:bootJar :services:inventory-service:bootJar` 실행 결과 `BUILD SUCCESSFUL`.
- 브랜치 slip-service: 현재 브랜치 JAR를 `java -jar`로 `127.0.0.1:28086`에 기동했다. 공유 `slip_db`를 읽기 전용 조회로 사용했으며 Eureka 등록은 비활성화했다. `GET /internal/slips/inbound-lines`가 HTTP 200으로 응답했다.
- 브랜치 inventory-service: 현재 브랜치 JAR를 `java -jar`로 `127.0.0.1:28085`에 기동했다. 공유 `inventory_db`를 읽기 전용으로 사용했고, slip-service 정적 디스커버리를 `http://127.0.0.1:28086`으로 지정했다. 비교 multipart 요청이 HTTP 200으로 응답했다.
- 웹 렌더러: `clients/desktop`의 웹 빌드 산출물을 Vite preview `127.0.0.1:5942`로 제공했다.
- 실행 방식: in-app Browser가 아니라 로컬 Playwright Chromium으로 실제 화면을 조작·캡처했다. 자격증명은 `resolveQaCredential()`을 사용했고, 캡처 경로는 `resolveQaShotsDir()`를 통해 해석했다.
- 데이터: 기간 `2025-01-01`~`2026-08-17`의 실제 입고전표 라인 77행을 branch slip-service에서 조회했다. 공유 DB에는 write하지 않았다.

## 2. 스크린샷 목록 및 행 수

모든 캡처는 2400x1200 PNG이며, 화면의 `DPS 행`과 불일치 상세 행을 직접 확인해 행 수를 기록했다.

- A — [01-A-real-header-77-rows-real-qa.png](./_local/01-A-real-header-77-rows-real-qa.png)
  - 업로드 파일: `A-real-dps-header.xlsx`
  - 표지 3행 뒤에 실제 DPS 헤더를 배치했다: `납품일자·납품번호·모델·수량·매입단가·공급가·인도처명·부가세·합계`.
  - 화면 데이터 행 수: 77행. 출고전표 라인 77행, DPS 행 77행, 정상 일치 77행, 불일치 0행.
  - 증명: 표지 3행이 있는 실제 DPS 헤더 엑셀을 읽고 77개 데이터 행을 처리했다.
- C — [02-C-same-qty-amount-mismatch-real-qa.png](./_local/02-C-same-qty-amount-mismatch-real-qa.png)
  - 화면 데이터 행 수: DPS 77행, 불일치 상세 1행.
  - 정상 일치 76행, 불일치 1행이며 상세 분류가 `합계금액 불일치`로 표시됐다.
  - 증명: 수량이 같은데 금액만 다른 케이스를 불일치로 검출했다.
- D — [03-D-quantity-mismatch-real-qa.png](./_local/03-D-quantity-mismatch-real-qa.png)
  - 화면 데이터 행 수: DPS 77행, 불일치 상세 1행.
  - 정상 일치 76행, 불일치 1행이며 상세 분류가 `수량 불일치`로 표시됐다.
  - 증명: 수량 차이를 불일치로 검출했다.
- B — [04-B-all-match-zero-mismatch-real-qa.png](./_local/04-B-all-match-zero-mismatch-real-qa.png)
  - 화면 데이터 행 수: DPS 77행, 불일치 상세 0행.
  - 정상 일치 77행, 불일치 0행이며 `모든 라인이 정상 일치합니다`가 표시됐다.
  - 증명: 실제 입고전표와 동일한 DPS 입력은 전량 일치한다.

## 3. C 케이스 변경 내용

업로드 파일은 실제 DB 조회 결과 77행을 기반으로 만들었다. C 케이스에서 한 행만 변경했다.

- 전표번호: `2026/08/14-16`
- 모델/상품코드: `0000098`
- 거래처코드: `4483500844`
- 수량: 실제 DB 1 → 업로드 1 (변경 없음)
- 합계금액: 실제 DB `11,000` → 업로드 `12,000` (정확히 `+1,000` 변경)
- 결과: 정상 일치 76행, 금액 불일치 1행. 화면 상세에서 입고합계 `11,000`, DPS합계 `12,000`으로 확인됐다.

## 4. A~D 미촬영 항목

없음. A, C, D, B 네 장을 모두 촬영했다.

## 5. 변경 파일

- `clients/desktop/playwright/1271-dps-inbound-compare-real-qa/1271-dps-inbound-compare-real-qa.spec.ts` — 실제 Playwright 라이브 QA 스펙.
- `clients/desktop/playwright/1271-dps-inbound-compare-real-qa/playwright.config.ts` — 라이브 QA 설정.
- `docs/qa/1271-live-capture/report.md` — 본 보고서.
- `docs/qa/1271-live-capture/_local/` — `resolveQaShotsDir()`가 해석한 로컬 캡처·입력·측정 로그 산출물.

운영/제품 코드 변경은 없다. `git add`, `git commit`, `git push`는 수행하지 않았다.

## 6. 회수 결과

- 브랜치 slip-service Java 프로세스: 0
- 브랜치 inventory-service Java 프로세스: 0
- Vite/node/Playwright 실행 프로세스: 0
- 이번 라운드에서 기동한 격리 컨테이너: 0
- 공유 컨테이너: 24개 유지
- 포트 `28085`, `28086`, `5942`: 모두 회수 후 listen 없음

스크린샷 전체 경로:

- `C:\dev\Samhan-Public\.claude\worktrees\wdps\docs\qa\1271-live-capture\_local\01-A-real-header-77-rows-real-qa.png`
- `C:\dev\Samhan-Public\.claude\worktrees\wdps\docs\qa\1271-live-capture\_local\02-C-same-qty-amount-mismatch-real-qa.png`
- `C:\dev\Samhan-Public\.claude\worktrees\wdps\docs\qa\1271-live-capture\_local\03-D-quantity-mismatch-real-qa.png`
- `C:\dev\Samhan-Public\.claude\worktrees\wdps\docs\qa\1271-live-capture\_local\04-B-all-match-zero-mismatch-real-qa.png`

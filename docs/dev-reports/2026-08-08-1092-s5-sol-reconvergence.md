# #1092 S5 SOL 머지 전 재수렴 — PR #1122

## 1. 판정

**판정 불가 — 실서버 `slip-service` 배포본이 검증 HEAD `a646f50df93210513c0c1d40da423eb221a29edd`보다 오래되어 담당 축 구현의 발화 조건이 0이다.**

기능 결함 수는 0건으로 판정하지 않는다. 배포본이 HEAD와 일치하지 않는 상태에서 담당 변경, `created_by` 보존, 계열 교차 변경 차단, assigned 조회 범위, 담당자 선택 UI를 실행하면 PR #1122가 아닌 이전 코드를 검증하게 되므로 기능 실행을 중단했다. PM에게 현재 HEAD 재배포가 필요하다고 알렸으며, 검증자가 Docker 스택이나 서비스를 재기동하지 않았다.

## 2. 배포본/HEAD 대조

| 대조 항목 | 실측 | 판정 |
|---|---|---|
| 검증 HEAD | `a646f50df93210513c0c1d40da423eb221a29edd` · 2026-08-08 08:53:44 KST | 기준 |
| 담당 축 S2 커밋 | `7e44ce447` · 2026-08-08 06:34:19 KST | 신규 서버 계약 도입 |
| 실행 컨테이너 | `samhan-slip-service` · healthy · `127.0.0.1:18086 -> 8086` | 도달 |
| 실행 이미지 | `sha256:8984408edf244dbd09dd8cc7bf88c5e162a485571a60d3d9151fa1be7f3bc508` | 확인 |
| 배포 JAR의 `EstimateController.class` | 2026-08-08 06:21 KST | S2보다 약 13분 이전 |
| HEAD 신규 DTO | `ChangeEstimateOwnerRequest.java` 존재 | 확인 |
| 배포 JAR 신규 DTO | `ChangeEstimateOwnerRequest.class` 없음 | **불일치** |
| compose 출처 | `C:\dev\Samhan-Public\.claude\worktrees\t1074\infrastructure` | 현재 검증 worktree `t1092`와 다름 |

배포 JAR에는 기존 `EstimateController.class`, `EstimateService.class`, `EstimateRepository.class`, 응답 DTO들은 있으나 S2가 추가한 `ChangeEstimateOwnerRequest.class`가 없다. 단순 이미지 라벨 추정이 아니라 실행 중 컨테이너의 `/app/app.jar` 엔트리를 직접 대조했다.

## 3. 필수 각도별 도달성

| 검증 각도 | 발화 조건 | 도달성/판정 |
|---|---:|---|
| 담당을 여러 번 변경한 뒤 `created_by` 보존 | HEAD의 owner endpoint가 배포됨 | 0 · 판정 불가 |
| API 직접 호출로 `PARTNER_ORDER` 교차 변경 거부 | HEAD의 서비스 계층 가드가 배포됨 | 0 · 판정 불가 |
| 웹 assigned 표면이 자기 담당만 반환 | HEAD의 assigned endpoint/repository query가 배포됨 | 0 · 판정 불가 |
| 견적서 메뉴는 전체 조회 유지 | 같은 HEAD 서버와 실 GUI | 0 · 판정 불가 |
| 담당자 선택 UI의 사원명·UUID 비노출·없는 사원 선택 방지 | owner mutation을 처리하는 같은 HEAD 서버 | 0 · 판정 불가 |
| 슬라이스 1 통합 조회 무훼손 | 담당 축과 함께 배포된 실 GUI/서버 | 0 · 판정 불가 |

배포 불일치가 확인된 뒤에는 공유 데이터에 owner 변경을 남기지 않았고, API mutation도 호출하지 않았다. DB 직접 접근은 SELECT를 포함해 0건이다.

## 4. 실 GUI·캡처

브라우저 연결 표면에는 사용 가능한 인스턴스가 없었고, 그보다 앞선 필수 환경 관문인 배포본/HEAD 대조에서 불일치가 확정됐다. 따라서 이전 서버를 대상으로 실 GUI를 띄우거나 결과 캡처를 만들지 않았다.

`docs/qa-shots/1092-s5-recon/`에 신규 캡처는 0장이다. 발화 조건 0을 합성 이미지나 이전 라운드 캡처로 대체하지 않았다.

## 5. 무변경·신규 파일·프로세스 회수

- 제품 코드 수정, 커밋, push: 0건.
- Docker/백엔드 재기동: 0건.
- DB 직접 쓰기: 0건. DB 직접 SELECT도 0건.
- 평문 비밀번호/JWT 취급 및 기록: 0건.
- 이 라운드가 새로 띄운 Vite, Playwright Chromium, standalone 서버: 0개. `5196`, `5197`, `5198` LISTENING 소켓도 0개였다.
- 신규 파일: `docs/dev-reports/2026-08-08-1092-s5-sol-reconvergence.md` 1개.
- 신규 캡처: 0개.

## 6. 재개 조건

PM이 `a646f50df` 기준으로 `slip-service`를 재배포한 뒤, 실행 JAR에 `ChangeEstimateOwnerRequest.class`가 존재하고 owner/assigned 계약이 실제 HTTP에서 도달하는지 먼저 재대조해야 한다. 일치가 확인된 경우에만 지정된 실 API mutation과 Playwright headless GUI 검증을 수행한다.

## 7. 이 라운드가 보지 않은 것

- 담당을 두 명 이상으로 연속 변경한 뒤 `requester_id`만 바뀌고 `created_by`가 그대로인지 보지 않았다.
- `documentType=PARTNER_ORDER`를 owner endpoint에 직접 보내 서비스 층에서 거부되는지 보지 않았다.
- 서로 다른 실계정의 assigned 목록과 전체 견적 목록 건수를 세지 않았다.
- 담당자 자동완성 후보의 사원명, UUID 비노출, 존재하지 않는 사원 선택 방지를 보지 않았다.
- 슬라이스 1의 교차 정렬, 한쪽 API 부분 실패 보존, `담당` 열을 재검증하지 않았다.
- 복원 성공/실패, Electron 패키징 앱, 장시간 세션과 성능을 보지 않았다.

---

# 재실행 — 배포본 재정렬 후 머지 전 재수렴

## R1. 환경 확인

| 대조 항목 | 재실행 실측 | 판정 |
|---|---|---|
| 검증 HEAD | `a646f50df93210513c0c1d40da423eb221a29edd` | 기준 일치 |
| 실행 컨테이너 | `samhan-slip-service` · healthy · `127.0.0.1:18086 -> 8086` | 도달 |
| 실행 이미지 | `sha256:a095c4e47efe6c9a1eff7f46fca4a32d8edb206fd44bf78eb87eb5bbca6c2f07` | 재배포 이미지 확인 |
| 컨테이너 기동 시각 | `2026-08-08T00:13:04.664561912Z` | 재배포 후 기동 |
| 실행 JAR | `/app/app.jar` | 직접 열거 |
| 배포 JAR의 `ChangeEstimateOwnerRequest.class` | `BOOT-INF/classes/com/samhanair/logis/slip/estimate/web/dto/ChangeEstimateOwnerRequest.class` 존재 · JAR entry `2026-08-07 21:29` | **환경 일치 게이트 통과** |

직전 라운드와 달리 실행 중 컨테이너의 실제 `/app/app.jar`에 신규 DTO class가 존재한다. 따라서 담당 변경·assigned 조회 계약의 발화 조건이 확보되어 아래 실서버/API/GUI 검증을 재개했다. 검증자는 Docker 스택이나 서비스를 재기동하지 않았다.

## R2. 판정

**머지 차단 결함 0건. PR #1122 재수렴 통과.**

필수 각도의 발화 조건은 모두 1회 이상 확보됐다. 실서버 API mutation, 실 DB `SELECT`, 실 렌더러, headless Playwright를 연결해 담당 축과 슬라이스 1 무훼손을 재실행했다. 지정 스펙은 `1 passed (8.1s)`, 종료코드 0이었다.

## R3. 필수 각도 실측

| 각도 | 실측 | 도달성/판정 |
|---|---|---|
| `created_by` 불변 | 실 견적 `2026/08/07-22`의 담당을 원담당 → 개발영업 → 개발매니저 → 개발마스터 → 개발영업으로 연속 변경했다. 각 PATCH 직후 DB `SELECT`로 `created_by`와 `requester_id`를 비교했고, `requester_id`는 목표 담당과 일치하면서 `created_by`는 최초값을 전 단계에서 보존했다. 마지막에 원담당으로 복구 후에도 보존됨을 재확인했다. | 발화 5 checkpoint · 결함 0 |
| 계열 교차 서비스 가드 | 화면을 우회해 같은 owner endpoint에 `documentType=PARTNER_ORDER`를 직접 전송했다. HTTP `400`, 담당 불변, `created_by` 불변이었다. | 발화 1 · 결함 0 |
| 웹 assigned 범위 | 개발영업 계정 assigned `16/16`건 전부 자기 `requester_id`; 개발마스터 assigned `0/0`건. 개발영업 담당으로 바꾼 표본은 개발영업 목록에는 존재하고 개발마스터 목록에는 없었다. | 두 실계정 · 결함 0 |
| 견적서 메뉴 전체 범위 | 같은 시점 전체 endpoint `53/53`건, 그중 개발마스터 외 담당 `53`건. 데스크톱 실 GUI도 `전체 53건`을 표시했다. assigned 0건인 개발마스터에게 전체 53건이 보이므로 자기 담당 필터가 내부 견적서 메뉴로 새지 않았다. | API+GUI · 결함 0 |
| 담당자 선택 UI | 상세 자동완성에 `[DEV-SEED] 개발영업`, `[DEV-SEED] 개발매니저` 사원명이 표시됐다. DOM과 캡처에 계정 UUID가 없었고, 증거 JSON도 UUID 패턴 0건이다. | 실 GUI · 결함 0 |
| 통합 교차 정렬 | 실 견적 53건 + 실 주문서 4건 = 통합 57건. 두 API의 `estimateDate`/`submittedAt` 정렬 정본으로 계산한 57행 전체 순서와 DOM 57행 순서가 일치했다. | 57/57 · 결함 0 |
| 부분 실패 보존 | 주문서 API만 Playwright에서 실패시킨 뒤 통합 목록을 열었다. 오류 안내와 함께 견적 53행이 보존됐다. | 발화 1 · 결함 0 |
| 열 라벨 | 통합 목록 column header는 `담당`, `작성자` header는 0개였다. | 결함 0 |

## R4. 증거

- [`01-owner-autocomplete-name-no-uuid.png`](../qa-shots/1092-s5-recon/01-owner-autocomplete-name-no-uuid.png) — 실 상세의 담당자 사원명 자동완성, UUID 비노출.
- [`02-estimate-menu-all-count.png`](../qa-shots/1092-s5-recon/02-estimate-menu-all-count.png) — 개발마스터 내부 견적서 메뉴 전체 53건.
- [`03-unified-cross-sort-owner-label.png`](../qa-shots/1092-s5-recon/03-unified-cross-sort-owner-label.png) — 실 견적+주문서 통합 57건, `담당` 열.
- [`04-partner-order-failure-estimates-preserved.png`](../qa-shots/1092-s5-recon/04-partner-order-failure-estimates-preserved.png) — 주문서 API 실패 안내와 견적행 보존.
- [`evidence.json`](../qa-shots/1092-s5-recon/evidence.json) — 내부 UUID·토큰·비밀번호 없이 checkpoint boolean, HTTP 상태, 실건수, 원복 결과 기록.

재검증 명령은 `clients/desktop` cwd에서 `playwright.real-qa.config.ts`와 명시 스펙 경로를 사용했고 headless Chromium으로 실행했다. 스펙은 미추적 재수렴 하네스이므로 `REAL_QA_ALLOW_UNTRACKED=1` 로컬 실행 모드였으며 CI 공식 수치에는 포함하지 않는다.

## R5. 데이터·환경 원복

- DB 직접 쓰기: 0건. DB 직접 접근은 `SELECT`만 사용했다.
- 실 API 담당 변경: 검증 중 수행 후 표본을 원담당으로 복구했다.
- 종료 직전 독립 DB 확인: 표본 활성행 1건, `created_by = requester_id` true. 이는 원담당 복구 상태이며, 변경 중 불변 여부는 각 PATCH 직후 별도 checkpoint로 확인했다.
- Docker 스택/서비스 재기동: 0건.
- 라운드가 띄운 렌더러 PID `39204`를 종료했다. 종료 후 `5199` LISTENING 0개, 해당 QA Playwright/Chromium 프로세스 0개.
- 평문 비밀번호, JWT, 내부 UUID를 보고서·JSON·캡처에 기록: 0건.
- 제품 코드 수정, 커밋, push: 0건.

## R6. 신규/변경 파일

이 워크트리에서 보이는 미추적 산출물은 다음과 같다.

- `docs/dev-reports/2026-08-08-1092-s5-sol-reconvergence.md` — 직전 라운드 기존 보고서에 본 재실행 절 추가.
- `clients/desktop/playwright/1092-s5-recon-real-qa/1092-s5-recon-real-qa.spec.ts` — 재실행 전용 격리 하네스.
- `docs/qa-shots/1092-s5-recon/01-owner-autocomplete-name-no-uuid.png`
- `docs/qa-shots/1092-s5-recon/02-estimate-menu-all-count.png`
- `docs/qa-shots/1092-s5-recon/03-unified-cross-sort-owner-label.png`
- `docs/qa-shots/1092-s5-recon/04-partner-order-failure-estimates-preserved.png`
- `docs/qa-shots/1092-s5-recon/evidence.json`

## R7. 이 라운드가 보지 않은 것

- PR 범위 밖 주문서 자체의 담당 변경 기능은 보지 않았다. 주문서 계열이 견적 owner endpoint에서 거부되는지만 보았다.
- `assigned/{id}/restore`의 삭제 견적 복원 성공·타 담당 거부는 실행하지 않았다.
- 별도 웹 클라이언트 화면은 이 슬라이스에 consumer가 없어 보지 않았다. 이 PR이 추가한 웹 표면 계약인 `/slips/estimates/assigned`를 두 실계정으로 직접 검증했다.
- Electron 패키징 앱, 모바일 viewport, 장시간 세션, 동시 owner 변경 충돌, 성능은 보지 않았다.
- 슬라이스 1의 삭제/복원 UI 전체는 다시 돌리지 않았다. 이번 재실행은 교차 정렬 57/57, 부분 실패 보존, `담당` 열 라벨의 무훼손만 보았다.

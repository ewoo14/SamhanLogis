# PR #1166 S2 재검토5 — 머지 판단 라운드

- 검토자: CODEX SOL 5.6
- 검토일: 2026-08-12
- 검토 HEAD: `705f8bbf1`
- 판정: **MERGE BLOCK — 결함 1건 + 검증 차단 1건**

## 1. 결론

리터럴 제거 뒤 격리 라이브 QA는 5/5 통과했다. `SAMHAN_QA_INTERNAL_TOKEN`은 한 번 생성한 CSPRNG 값을 dc-config/slip/partner-order/Playwright에 동일하게 주입해 실제 내부 토큰 검증까지 통과했다. `/api/v1/quantity-sync-rules`의 `[]` 응답은 백엔드·프런트 계약과 맞고, 핸들러 삭제 뮤테이션은 새 ac-1049 단언을 정확히 RED로 만들었다.

그러나 전체 mock 스위트의 API base를 외부 trap으로 바꿔 실행하자 **36개 요청이 mock 경계를 벗어났다**. 특히 `GET /api/v1/products/admin/sync/last`는 이번 quantity 경로와 같은 종류의 미처리 Axios 요청이며, 나머지에는 realtime/SSE 및 레거시 slip 요청이 포함된다. 한 경로만 막은 현재 구현은 mock hard gate를 환경 독립적으로 만들지 못한다.

또한 일반 CI 모드 전체 mock 재실행은 666건 중 `admin-hr TC-HR1`이 최초·retry 모두 백지 화면에서 실패해 `665 passed / 1 unexpected`로 끝났다. 같은 파일 단독 재실행은 5/5 통과해 이번 두 커밋의 제품 회귀로 귀속하지는 않지만, 요구된 RED-B `666 passed · unexpected=0`은 이 라운드에서 충족되지 않았다.

따라서 **현재 HEAD는 머지 불가**다.

## 2. 격리 라이브 QA

공유 DB에는 쓰지 않았다. 격리 PostgreSQL 3개 데이터만 사용했고, 포트 충돌을 피하려고 dc-config/slip DB는 임시 clone 컨테이너로 띄웠다가 제거했다.

| 시나리오 | 실제 결과 | 판정 |
|---|---:|---|
| dc-config 정상, 주문 확정 | 600,000원 저장 | PASS |
| dc-config 중단 | HTTP 503, 주문 미저장 | PASS |
| helper 500, 고정DC 없음 | 600,000원 저장 | PASS |
| helper 500, 고정DC 15% | 850,000원 저장 | PASS |
| 견적 | 7%, 930,000원 | PASS |

dc-config 중단 전후 격리 DB 행 수는 `orders=13`, `order_lines=13`, `order_status_history=44`, `order_revisions=13`으로 네 테이블 모두 불변이었다. 이는 실패 상태가 주문을 부분 저장하지 않는다는 것을 확인한다.

모든 캡처는 스펙에서 `QA_SHOTS_DIR=docs/qa/2026-08-12-order40-sol-review5`를 주고 `resolveQaShotsDir()`를 거쳐 생성했다.

- `docs/qa/2026-08-12-order40-sol-review5/01-order-confirm-600000-visible.png`
- `docs/qa/2026-08-12-order40-sol-review5/02-order-confirm-dc-down-503-visible.png`
- `docs/qa/2026-08-12-order40-sol-review5/01-none-helper-500-order-600000.png`
- `docs/qa/2026-08-12-order40-sol-review5/03-fixed-15-helper-500-order-850000.png`
- `docs/qa/2026-08-12-order40-sol-review5/03-estimate-7-percent-930000-visible.png`

## 3. 환경변수와 리터럴 검토

### 3.1 값이 없을 때

- `SAMHAN_QA_JWT`를 제거하고 sol2 스펙을 `--list`로 로드: exit 1, `SAMHAN_QA_JWT 환경변수가 필요합니다`.
- `SAMHAN_QA_INTERNAL_TOKEN`을 제거하고 sol3 스펙을 `--list`로 로드: exit 1, `SAMHAN_QA_INTERNAL_TOKEN 환경변수가 필요합니다`.
- 두 값을 CSPRNG로 생성해 주입한 `--list`: 각각 2개 테스트를 정상 수집, exit 0.

즉 값이 없을 때 조용히 다른 동작을 돕거나 실 서버로 빠지지 않고, 파일·행과 원인을 표시하며 즉시 실패한다. 다만 현재 `infrastructure/.env.local`에는 두 변수가 없으므로 실행자가 직접 주입해야 한다.

### 3.2 생성 값의 사용 일관성

- `SAMHAN_QA_INTERNAL_TOKEN`: 같은 값이 세 서비스와 Playwright의 `X-Internal-Token`에 주입됐고 라이브 QA 5/5로 실제 검증했다.
- `SAMHAN_QA_JWT`: sol2의 HS256 서명 키이며, gateway/service의 `JWT_SECRET`에도 같은 값을 주입해야 한다. 이번 라운드는 sol2 gateway 라이브 경로를 기동하지 않아 실제 검증까지 관찰하지 않았다.
- 브라우저 `randomBytes(32)` 값: `window.samhanAuth`를 채우는 격리 UI용 bearer placeholder다. API route가 신뢰 헤더를 별도로 제공하므로 이 값 자체에 서명·검증 양쪽은 없다. 이를 JWT 또는 서비스 검증 토큰으로 설명하면 안 된다.

### 3.3 저장소 grep

- 제거 대상 3개 리터럴(종전 browser token, 종전 QA JWT 키, 종전 QA internal token): 저장소 0건.
- 변경된 실 QA 스펙 3개에서 장문 `secret/token = literal` 패턴: 0건.
- `.gitguardian.yaml`: 재검토4 이후 diff 0, Playwright 광역 ignore 없음.

단, 저장소 전체에서 “secret처럼 보이는 문자열 0건”이라는 일반 명제는 사실이 아니다. 기존 mock/테스트 fixture의 `playwright-token`, `test-internal-token`류는 검색된다. 이번 판정의 0건은 **제거 대상 리터럴과 변경된 실 QA 스펙의 credential-like assignment 범위**다. 로컬에 `ggshield`, `gitleaks`, `detect-secrets`가 없어 전 저장소 entropy scanner 결과는 만들지 않았다.

## 4. quantity-sync-rules 수정과 뮤테이션

백엔드 `QuantitySyncRuleController.list()`는 raw `List<QuantitySyncRuleResponse>`를 반환하고, Desktop `quantitySyncApi.list()`는 `res.data`를 배열로 소비한다. 따라서 mock의 `[]`는 “설정된 규칙 없음” 계약과 일치하며 정상 화면 동작을 바꾸지 않는다.

외부 trap을 둔 ac-1049 실행 결과는 다음과 같다.

1. 현재 핸들러: 대상 스펙 1 passed, trap 요청 0.
2. 핸들러를 임시 삭제: 새 단언이 `quantity-sync-rules가 mock adapter를 벗어남`으로 RED, HOME_MULTI/SINGLE_SET 두 URL을 보고. trap에도 OPTIONS 2건 도달.
3. 핸들러 복원: 1 passed, trap 요청 0, 소스 diff 0.

새 누수 단언은 핸들러 제거 회귀를 실제로 잡는다.

## 5. 차단 결함 S2-R5-B1 — mock adapter의 기본 동작이 fail-open

전체 mock 스위트를 `VITE_API_BASE_URL=http://127.0.0.1:28089` 외부 trap으로 실행한 결과는 `666 collected / 653 passed / 5 skipped / 8 failed`, 외부 도달 36건이었다.

| 이탈 요청군 | 건수 |
|---|---:|
| `/api/v1/admin/dispatch-tasks/*/collab/stream` OPTIONS | 24 |
| estimate/slip/cash-receipt/partner-order `collab/stream` OPTIONS | 9 |
| `/slips/estimates/est-001` OPTIONS | 1 |
| `/slips/slip-005/sales` OPTIONS | 1 |
| `/api/v1/products/admin/sync/last` GET | 1 |
| 합계 | **36** |

`client.ts`는 mock mode에서 `getMockResponse(config) === null`이면 실제 Axios를 계속 실행한다. 따라서 누락된 경로가 있을 때 로컬 8080의 상태, CORS, auth interceptor에 따라 결과가 달라진다. quantity 한 경로의 `[]` 추가만으로는 이 구조적 false-green을 닫지 못한다. fetch/EventSource 계열도 Axios adapter만으로는 막히지 않는다.

### 구현 지시

1. mock mode에서 미처리 Axios 요청은 실제 네트워크로 보내지 말고 식별 가능한 `MOCK_UNHANDLED_REQUEST`로 즉시 실패시키는 fail-closed 기본값을 둔다.
2. 실제 외부 통신이 의도된 mock 스펙이 있다면 중앙 allowlist에 경로·사유·소유 스펙을 명시한다. 암묵적 fallback은 허용하지 않는다.
3. `/api/v1/products/admin/sync/last`와 레거시 slip 경로는 실제 응답 계약에 맞는 mock을 추가한다.
4. realtime/SSE는 mock mode 전용 in-process stub 또는 명시적 비활성화를 적용한다. 브라우저 `request`/`fetch`/`EventSource` 전체를 세는 egress guard를 공통 fixture에 둔다.
5. ac-1049의 quantity 전용 단언과 핸들러 삭제 뮤테이션은 유지한다.

### 재검토 수용 조건

- 외부 trap 대상 전체 666 스펙: 외부 요청 0.
- 미처리 Axios 및 realtime 경로 각각의 뮤테이션: deterministic RED.
- 일반 CI mode: 666 passed, guard `expected=666 unexpected=0 skipped=0 flaky=0`.
- 격리 라이브 QA 5/5 및 본 보고서의 RED-B 전부 재통과.

## 6. RED-B 보존 결과

| 항목 | 결과 |
|---|---|
| 주문 40% 적용 범위 | 격리 라이브 정상/NONE/helper 실패/고정DC 15%로 확인 |
| 견적 40% 비적용 | 7%, 930,000원 확인 |
| NONE / 모름 / 실패 분리 | NONE 생략, 조회 helper 경로, dc-config 실패 503 확인 |
| S1 제품구분 | 두 커밋에 S1 코드·데이터 변경 없음; 재검토4 기준 916 / 41 / 2,126 유지 |
| Gradle | dc-config 79 + partner-order 533 + product 781 = **1,393**, 실패·오류·skip 0 |
| order-app Vitest | **246/246 passed** |
| Desktop Vitest | **2,155 passed / 1 pending** |
| Desktop mock 일반 CI mode | **665 passed / 1 failed**, guard `unexpected=1`; admin-hr 단독 5/5 재통과 |
| 라이브 스펙 규약 | 대상 디렉터리·파일명 `-real-qa` 유지 |

일반 mock의 실패 화면은 앱 전체가 빈 흰 화면이고 메뉴 visible 수가 0이었다. 같은 소스의 단독 5/5 통과와 변경 diff 부재 때문에 이번 두 커밋의 기능 회귀로 확정하지는 않았으나, merge gate 증거로는 green이 아니다.

## 7. 자원 정리

- 이번 라운드에서 만든 dc-config/slip clone 컨테이너 2개: 제거 완료.
- 기존 격리 QA 컨테이너 `sol3-1166-dc-config-db`, `sol3-1166-slip-db`, `sol3-1166-partner-order-db`: 모두 Exited 확인.
- QA 서비스/외부 trap/Vite 포트 `28084/28085/28086/28088/28089/5320/5321/5322/5330/56432/56433`: listener 0 확인.
- 기존 다른 작업의 `sol-1068-review-pg`(55433)는 건드리지 않았다.
- 임시 stub, mutation spec/config, trap 및 서비스 로그: 제거 완료.

## 8. 이 라운드가 보지 않은 표면

- sol2를 gateway까지 기동한 실제 `SAMHAN_QA_JWT` 서명·검증 왕복.
- 운영/공유 DB 쓰기 및 운영 배포 환경의 secret 주입 방식.
- 실제 외부 realtime 서버와의 장기 SSE 재연결·동시성.
- 모바일/Capacitor, 인쇄, Electron 패키징 화면.
- `ggshield`/`gitleaks`/`detect-secrets`에 의한 전 저장소 entropy 검사.
- PR 원격 CI 및 GitGuardian 최신 결과. 본 판정은 로컬 HEAD `705f8bbf1`의 독립 재검증 결과다.

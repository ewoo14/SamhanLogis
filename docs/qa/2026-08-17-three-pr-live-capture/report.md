# 2026-08-17 세 PR 라이브 QA 캡처 보고서

## 판정 요약

| PR | 캡처 | 판정 |
|---|---|---|
| #1241 | ⑤ 싱글중대형 구성품 금액 | **정상화 확인** — 판넬 128,000원, 리모컨 16,000원 |
| #1241 | ⑥ desktop / estimate-app 동일 조건 | **불일치 지속** — 1,355,640원 대 1,523,236원 |
| #1260 | ①~④ 옵션 구성 | **요구 옵션 수 확인** |
| #1261 | ⑦~⑧ HALF_UP 경계값 | **화면 라인 값 확인** — 110,005원 → 공급가 100,005원 / VAT 10,000원 |

코드 수정, `git add`, commit, push는 하지 않았다. 세 대상 워크트리는 소스 변경 없이 사용했고, 공유 DB에는 쓰지 않았다. 입력 화면은 저장하지 않았다.

## ① 스택 구성

### PR #1241 — `feat/gas-parity-order-web` (`32862d968`)

- `wgas1`에서 `:services:product-service:bootJar --rerun-tasks`를 먼저 실행해 해당 head의 JAR를 만들었다.
- 해당 JAR로 `product-service`만 격리 기동했다: 호스트 포트 `18084`.
- 공유 product DB를 격리 PostgreSQL에 바이너리 복제하고, 격리 DB에만 V44·V45를 적용했다.
- 인증은 공유 gateway/auth(`8080`)를 사용했다. 공유 컨테이너는 재시작하지 않았다.
- `wgas1` desktop은 `5198`, estimate-app은 `5184`에서 해당 브랜치 소스를 제공했다.

### PR #1260 — `feat/option-naming-unify` (`db77a38bf`)

- 프론트 변경만 있으므로 공유 gateway/auth/product 스택을 그대로 사용했다.
- `wd03` estimate-app만 `5183`에서 제공했다.
- 공유 컨테이너 재시작과 공유 DB 쓰기는 없었다.

### PR #1261 — `fix/vat-supply-amount-contract` (`a224461cd`)

- `wp103`에서 `slip-service`, `accounting-service`의 `bootJar --rerun-tasks`를 먼저 실행했다.
- 두 서비스와 전용 PostgreSQL만 격리 기동했다: slip `28086`, accounting `28087`.
- 인증은 공유 gateway/auth(`8080`)를 사용했다. 격리 auth-service는 띄우지 않았다.
- 공유 slip/accounting DB를 격리 PostgreSQL에 바이너리 복제했다. 전표·견적은 신규 작성 화면에서 값만 입력하고 저장하지 않았다.
- `wp103` desktop은 `5199`에서 제공했다. 포트 `8088`과 influxd는 건드리지 않았다.

## ② PR별 캡처와 행·옵션 수

### PR #1260

1. [홈멀티 리모컨·판넬](screenshots/01-home-multi-remote-panel-options.png)
   - 행: 전체 107, 화면 표시 107
   - 리모컨: 6개 — 기본, 360, 인피니트, 유선, 컬러, 제외
   - 판넬: 5개 — 판넬제외, 기본, 공청, 인피니트 25년형, 인피니트 공청+동작감지 AI
2. [인피니트 세트 판넬](screenshots/02-infinite-home-panel-options.png)
   - 행: 전체 107, 화면 표시 107, 인피니트 세트 행 1개 선택
   - 판넬: 총 5개, 즉 실제 4종 + 판넬제외 1개
   - 실제 표시 4종: 기본, 공청, 인피니트 25년형, 인피니트 공청+동작감지 AI
   - 요청된 `PC1ZNSK1NW`, `PC1ZNWK1NW`, `PC1ZNCK1NW`, `PC1ZNRK1NW`는 셀렉트에 모델 코드가 아닌 표시명으로 노출되므로, 화면에서는 위 4개 표시명으로 확인했다.
3. [상업멀티 리모컨·판넬](screenshots/03-commercial-multi-remote-panel-options.png)
   - 행: 전체 310, 화면 표시 310
   - 리모컨: 6개 — 기본, 인피니트, 360, 컬러, 유선, 제외
   - 판넬: 7개 — 판넬제외, 기본, 공청, 블랙, 승강, 인피니트 25년형, 인피니트 공청+동작감지 AI
   - 360 형상: 2개 — 원형, 사각
4. [싱글중대형 리모컨·판넬](screenshots/04-single-remote-panel-options.png)
   - 행: 전체 851, 화면 표시 133
   - 리모컨: 3개 — 기본, 컬러, 유선
   - 판넬: 5개 — 판넬제외, 기본, 블랙, 승강, 공청
   - 360 형상: 2개 — 원형, 사각

### PR #1241

5. [싱글중대형 구성품 금액](screenshots/05-pr1241-single-component-prices.png)
   - 구성품 행: 13
   - 판넬 금액: 128,000원
   - 리모컨 금액: 16,000원
   - 옵션 개수: 해당 캡처는 옵션 셀렉트 검증 대상이 아니므로 해당 없음
6. [desktop 동일 조건](screenshots/06a-pr1241-desktop-same-condition.png) / [estimate-app 동일 조건](screenshots/06b-pr1241-estimate-app-same-condition.png)
   - desktop 전표 라인: 5행 중 입력 1행
   - estimate-app 홈멀티 카탈로그: 전체 107행 중 선택 1행
   - 옵션 개수: 해당 캡처는 동일 거래처·품목·수량의 총액 검증 대상이므로 해당 없음

### PR #1261

7. [전표 HALF_UP 경계값](screenshots/07-pr1261-slip-half-up.png)
   - 전표 라인: 5행 중 입력 1행
   - 옵션 개수: 해당 없음
   - 입력 110,005원 → 공급가 100,005원 / VAT 10,000원
8. [견적 HALF_UP 경계값](screenshots/08-pr1261-estimate-half-up.png)
   - 견적 라인: 2행 중 입력 1행
   - 옵션 개수: 해당 없음
   - 입력 110,005원 → 공급가 100,005원 / VAT 10,000원

## ③ ⑤·⑥ 금액 실측표

### ⑤ 싱글중대형 구성품

| 항목 | SOL 직전 실측 | 이번 V45 격리 실측 | 판정 |
|---|---:|---:|---|
| 판넬 | 104,060원 | **128,000원** | 확정값 계열로 정상화 |
| 리모컨 | 13,915원 | **16,000원** | 확정값 계열로 정상화 |

### ⑥ 동일 거래처·품목 `AJ060MXHNBC1`·수량 1

| 화면 | 행 수 | 실측 총액 |
|---|---:|---:|
| desktop | 5행 중 입력 1행 | **1,355,640원** |
| estimate-app | 카탈로그 107행 중 선택 1행 | **1,523,236원** |
| 차이 | — | **167,596원** — estimate-app이 더 큼 |

따라서 ⑥의 목표인 두 화면 금액 일치는 달성되지 않았다. 캡처는 성공했지만 병합 관점에서는 **불일치 결함이 남아 있다**.

## ④ 못 찍은 것과 원문

- 못 찍은 화면은 없다. ①~⑧ 캡처를 모두 확보했다.
- 다만 ⑥은 성공 증거가 아니라 불일치 재현 증거다: `desktop 1,355,640` 대 `estimate-app 1,523,236`.
- #1261 견적 화면에서 모델명 입력 후 발생하는 격리 slip의 보조 상품 조회는 다음 응답을 냈다. 라인 공급가·VAT는 화면에서 확인됐지만, 이 조회까지 포함한 완전한 end-to-end 성공으로 해석하면 안 된다.

```text
ISOLATED_PROXY GET /slips/lookup-product HTTP 500
No servers available for service: product-service
ProductClient lookupByModel failed: No instances available for product-service
```

## ⑤ 프로세스 회수

- 종료한 로컬 서버: `5183`, `5184`, `5198`, `5199` — 잔여 listener **0**
- 제거한 격리 컨테이너: #1241 2개, #1261 3개 — 잔여 **0**
- 제거한 QA 이미지: 3개 — 잔여 **0**
- 제거한 빌드 산출 디렉터리: product/slip/accounting 각 1개 — JAR를 산출물에 남기지 않음
- task 전용 포트 `5183`, `5184`, `5198`, `5199`, `18084`, `28086`, `28087` 잔여 listener **0**
- 공유 컨테이너: **24개 그대로 실행 중, 24개 모두 healthy**
- 캡처 산출물: 16파일, 총 1,103,523바이트, 최대 단일 파일 429,407바이트

최종 잔여 수: **격리 컨테이너 0 / task 프로세스 0 / task listener 0 / QA 이미지 0 / 공유 컨테이너 24 healthy**.

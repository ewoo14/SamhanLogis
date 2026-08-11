# PR #1126 / Issue #896 — SOL 5.6 첫 적대검증

일시: 2026-08-09 KST

검증자: CODEX SOL 5.6

검증 대상: `feat/896-qty-sync-chip-track` / `1ae4cb9182c62c6cd0b396efe591d8cbe62ba4b5`

## 환경 확인

- 워크트리: `C:\dev\Samhan-Public\.claude\worktrees\t1126`
- `git rev-parse HEAD`: `1ae4cb9182c62c6cd0b396efe591d8cbe62ba4b5`
- Desktop: `http://127.0.0.1:5316`, 위 워크트리에서 Vite를 `--port 5316 --strictPort`로 새로 기동했다. HashRouter 경로 `/#/products/estimate-items?category=HOME_MULTI`를 사용했다.
- estimate-app: `http://127.0.0.1:5317`, 위 워크트리 HEAD의 `server.js`를 고정 포트로 새로 기동했다.
- order-app: `http://127.0.0.1:5318`, 위 워크트리에서 Vite를 `--port 5318 --strictPort`로 새로 기동했다.
- API gateway: `http://127.0.0.1:8080`
- product-service: `http://127.0.0.1:8084`. HEAD에서 `:services:product-service:bootJar`를 재빌드하여 재배포했다. HEAD 산출 JAR와 컨테이너 `/app/app.jar`의 SHA-256은 모두 `0e15a33ba651672236290b896aaa5d36f8129585cb2e099e232b268b999fd67e`였다.
- Desktop/order-app은 별도 잔존 번들을 사용하지 않고 해당 HEAD 워크트리 소스를 Vite가 직접 변환했다. estimate-app도 해당 HEAD 워크트리에서 서버 생성 HTML을 새로 발행했다.

실제 호출 경로:

```text
Desktop
GET  /api/v1/quantity-sync-rules?estimateCategory=HOME_MULTI
POST 또는 PUT /api/v1/quantity-sync-rules
PATCH /api/v1/products/AM052BN6PBH1/usage

estimate-app → product-service
GET /products/internal/estimate-catalog/quantity-sync-rules?estimateCategory=HOME_MULTI

order-app
GET /api/v1/partner-orders/bootstrap
GET /api/v1/quantity-sync-rules?estimateCategory=SINGLE_SET&page=0&size=50
```

발화 조건을 먼저 측정했다.

```text
UI 작업 전 활성 규칙 수: 0
UI 저장 후 활성 규칙 수: 1
product-service HOME_MULTI 노출 품목 수: 123

UI_HOME_MULTI_AM052BN6PBH1 | HOME_MULTI | enabled
source  = AM052BN6PBH1
targets = PC6NUDK1NW,AWR-WE13N,FH-LFHLN
```

규칙 생성에는 SQL을 사용하지 않았다. Desktop GUI의 칩 선택과 저장만 사용했다. DB 명령은 사전/사후 `SELECT` 계측뿐이며 `INSERT`/`UPDATE`는 실행하지 않았다.

## 판정

**결함 있음 — 머지 차단.**

칩 UI 자체는 규칙을 만들고 복원한다. 그러나 그 규칙은 요구한 소비 경로를 완성하지 못한다.

1. 종합견적서에서 판넬과 유연호스는 따라오지만 리모컨 `AWR-WE13N`은 따라오지 않는다.
2. 주문서 홈멀티는 라이브 bootstrap이 품목 0건을 반환하며, 화면이 조회한 동기화 규칙도 `HOME_MULTI`가 아니라 `SINGLE_SET`이다. 따라서 UI로 만든 HOME_MULTI 규칙을 주문서에서 발화시킬 수 없다.

## 각도 1 — 칩으로 규칙을 만들 수 있는가

**통과.**

실 GUI에서 기준 품목 `AM052BN6PBH1`을 조회한 뒤 다음 세 품목을 검색·선택하여 칩으로 추가했다.

```text
PC6NUDK1NW  판넬
AWR-WE13N   유선리모컨
FH-LFHLN    유연호스
```

`수량 동기화 저장`을 눌러 서버 CRUD 응답 성공을 확인했다. 서버 재조회 원문은 source 1개와 위 targets 3개를 그대로 반환했다. 페이지를 새로고침하고 기준 품목을 다시 조회해 세 칩이 모두 복원되는 것도 확인했다. 서버에는 활성 규칙 1건이 남아 있다.

스크린샷:

- `docs/qa/2026-08-09-896-chip-sol/01-before-rule-existing-category-and-toggle.png`
- `docs/qa/2026-08-09-896-chip-sol/02-three-target-chips-before-save.png`
- `docs/qa/2026-08-09-896-chip-sol/03-after-refresh-rule-persisted.png`

## 각도 2 — 만든 규칙이 실제로 발화하는가

**실패.**

### 종합견적서

종합견적서 홈멀티에서 기준 품목 `AM052BN6PBH1` 수량을 `2`로 입력했다. 화면 DOM의 실제 수량·단가·소계 원문은 다음과 같다.

```json
{
  "PC6NUDK1NW": { "qty": "2", "unitPrice": 104060, "subtotal": 208120 },
  "AWR-WE13N":  { "qty": "",  "unitPrice": 45375,  "subtotal": 0 },
  "FH-LFHLN":   { "qty": "2", "unitPrice": 10000,  "subtotal": 20000 }
}
```

즉, 판넬과 유연호스는 `2`로 발화했지만 리모컨은 빈 수량(화면 표시 0), 소계 0으로 남았다. 동일 규칙의 세 target 전체 동기화 요구를 충족하지 못한다.

스크린샷:

- `docs/qa/2026-08-09-896-chip-sol/04-estimate-source-qty-2.png`
- `docs/qa/2026-08-09-896-chip-sol/05-estimate-PC6NUDK1NW-qty-2.png`
- `docs/qa/2026-08-09-896-chip-sol/06-estimate-AWR-WE13N-qty-2.png`
- `docs/qa/2026-08-09-896-chip-sol/07-estimate-FH-LFHLN-qty-2.png`

### 주문서

사업자번호·비밀번호를 이용한 실제 로그인 후 홈멀티 버튼으로 진입했다. 홈멀티 표에는 헤더만 있고 품목 행이 한 건도 없었다. 실제 bootstrap 원문은 다음과 같다.

```json
{
  "success": true,
  "data": {
    "payloads": {
      "homemulti": [],
      "singleSets": [],
      "singleParts": [],
      "commercialMulti": []
    }
  }
}
```

동시에 브라우저가 호출한 규칙 경로는 `estimateCategory=SINGLE_SET`이었고 `estimateCategory=HOME_MULTI` 호출은 0회였다. 셋째 가능성은 단순히 발화 계산만 실패한 것이 아니라, **주문서의 HOME_MULTI 카탈로그 공급과 규칙 카테고리가 모두 이 UI 규칙의 소비 경로에 도달하지 않는 상태**라는 것이다. 이 상태에서는 기준 품목을 화면에 입력할 수조차 없으므로 주문서 발화는 실패로 판정한다.

스크린샷:

- `docs/qa/2026-08-09-896-chip-sol/09-order-home-empty-single-set-rule-request.png`

## 각도 3 — 규칙 없는 품목의 수량·금액 반대급부

**종합견적서 통과 / 주문서 판정 불가.**

규칙에 넣지 않은 실 품목 `AM060BN6PBH1`을 표본으로 지정했다. 기준 품목 수량을 2로 바꾸기 전후 값은 동일했다.

```json
{
  "before": { "qty": "", "price": "575,960", "subtotal": 0 },
  "after":  { "qty": "", "price": "575,960", "subtotal": 0 }
}
```

따라서 종합견적서에서 비규칙 품목의 수량·납품가·소계는 변하지 않았다. 주문서는 홈멀티 품목 행이 0건이어서 같은 표본을 만들 수 없으므로 판정 불가다.

스크린샷:

- `docs/qa/2026-08-09-896-chip-sol/08-estimate-unruled-quantity-price-unchanged.png`

## 각도 4 — 견적품목 메뉴의 기존 축

**통과.**

- 기준 품목의 기존 `홈멀티` 카테고리 칩이 저장 전과 새로고침 후 모두 유지됐다.
- 기존 `주문 노출` 토글을 GUI에서 off→on으로 왕복했다. 두 PATCH가 성공했고, 새로고침 후에도 on으로 복원됐다.
- 같은 행의 `견적 노출` 상태와 기존 카테고리 칩이 칩 추가·저장·새로고침 뒤에도 표시됐다.

근거 화면은 각도 1의 `01`, `02`, `03`이다.

## 재현 실행 결과

최종 한 번의 실 GUI 실행에서 세 시나리오가 모두 완료됐다. 여기서 소비 측 시나리오는 정상 성공을 주장하는 테스트가 아니라 위 결함 상태와 실측값을 고정하는 재현이다.

```text
각도 1·4: UI 저장·복원 및 기존 축 왕복 완료
각도 2·3: estimate-app 부분 발화와 비규칙 품목 불변 재현
각도 2: order-app 빈 HOME_MULTI 및 SINGLE_SET 규칙 조회 재현
```

`git diff --check`는 통과했다. commit/push는 하지 않았고 `tools/legacy-gas/**`는 변경·검증하지 않았다.

## 신규 생성 파일

- `clients/desktop/playwright/896-chip-sol-real-qa/896-chip-sol-real-qa.spec.ts`
- `docs/dev-reports/2026-08-09-896-chip-r1-sol-adversarial.md`
- `docs/qa/2026-08-09-896-chip-sol/01-before-rule-existing-category-and-toggle.png`
- `docs/qa/2026-08-09-896-chip-sol/02-three-target-chips-before-save.png`
- `docs/qa/2026-08-09-896-chip-sol/03-after-refresh-rule-persisted.png`
- `docs/qa/2026-08-09-896-chip-sol/04-estimate-source-qty-2.png`
- `docs/qa/2026-08-09-896-chip-sol/05-estimate-PC6NUDK1NW-qty-2.png`
- `docs/qa/2026-08-09-896-chip-sol/06-estimate-AWR-WE13N-qty-2.png`
- `docs/qa/2026-08-09-896-chip-sol/07-estimate-FH-LFHLN-qty-2.png`
- `docs/qa/2026-08-09-896-chip-sol/08-estimate-unruled-quantity-price-unchanged.png`
- `docs/qa/2026-08-09-896-chip-sol/09-order-home-empty-single-set-rule-request.png`

# PR #1126 R9 SOL 적대검증 재수렴

## 환경 확인

- 워크트리: `C:\dev\Samhan-Public\.claude\worktrees\t1126`
- 브랜치: `feat/896-qty-sync-chip-track`
- 검증 HEAD 원문: `git rev-parse HEAD` → `1f879d6dfa1018fd1309b54f15125d78772def54`
- 포트: estimate-app `127.0.0.1:5320`, desktop `127.0.0.1:5173`, API gateway `127.0.0.1:8080`, product-service `127.0.0.1:8084`
- 배포본 확인: 위 HEAD를 확인한 동일 워크트리의 `clients/web/estimate-app`에서 `node server.js`를 기동해 5320을 전용 검증 포트로 사용했다. `GET http://127.0.0.1:5320/healthz` 원문은 `{"ok":true,"app":"estimate-app","version":"2.0.0"}`였다. 앱에는 SHA를 반환하는 HTTP endpoint가 없으므로 SHA 증거는 기동 워크트리와 기동 직전 `git rev-parse HEAD`의 결합이며, 네트워크 응답이 SHA를 직접 증명한다고 과장하지 않는다.
- 실제 호출 API: 로그인 후 브라우저 네트워크에서 `GET http://127.0.0.1:8080/api/v1/quantity-sync-rules?estimateCategory=HOME_MULTI` → `200`, 응답 `mock=false`, 규칙 1건 `UI_HOME_MULTI_AM052BN6PBH1`. 5320 HTML의 `HOME_QUANTITY_SYNC_RULES` bootstrap과 API JSON도 일치했다.
- 자격 증명은 `resolveQaCredential`을 테스트 본문 `try/catch` 안에서만 읽었으며 문서와 캡처에는 `<redacted>` 처리했다.

### 현재 활성 규칙 SQL 원문

읽기 전용 조회만 했다. 내부 사용자 UUID는 사용자 노출 금지 규칙에 따라 아래 출력에서 `<internal-user-id>`로 치환했다. 해당 계정의 사용자 문맥은 개발책임자가 제시한 `dev_master`이다.

```sql
SELECT r.rule_key, r.estimate_category, r.name, r.enabled, r.aggregation,
       r.condition_json, r.inactive_behavior, r.conflict_policy, r.priority,
       r.legacy_ref, r.created_at, r.modified_at, r.created_by, r.modified_by,
       COALESCE((
         SELECT jsonb_agg(jsonb_build_object(
           'productCode', p.model_code, 'factor', s.factor
         ) ORDER BY p.model_code)
         FROM quantity_sync_source s
         JOIN products p ON p.id = s.source_product_id
         WHERE s.rule_id = r.id AND s.is_deleted = false
       ), '[]'::jsonb) AS sources,
       COALESCE((
         SELECT jsonb_agg(jsonb_build_object(
           'productCode', p.model_code, 'multiplier', t.multiplier,
           'order', t.display_order, 'rounding', t.rounding_mode
         ) ORDER BY t.display_order)
         FROM quantity_sync_target t
         JOIN products p ON p.id = t.target_product_id
         WHERE t.rule_id = r.id AND t.is_deleted = false
       ), '[]'::jsonb) AS targets
FROM quantity_sync_rule r
WHERE r.estimate_category = 'HOME_MULTI'
  AND r.enabled = true
  AND r.is_deleted = false
ORDER BY r.priority, r.rule_key;
```

```text
rule_key         = UI_HOME_MULTI_AM052BN6PBH1
category/name    = HOME_MULTI / 수량 동기화 - AM052BN6PBH1
enabled          = t
aggregation      = SUM
condition_json   = {}
inactive/conflict= ZERO / REPLACE
priority/ref     = 1000 / UI:AM052BN6PBH1
created_at       = 2026-08-09 20:30:03.762185
modified_at      = 2026-08-09 23:40:37.515393
created_by       = <internal-user-id> (dev_master)
modified_by      = <internal-user-id> (dev_master)
sources          = [{"factor":1,"productCode":"AM052BN6PBH1"}]
targets          = [{"order":1,"rounding":"NONE","multiplier":1,"productCode":"PC6NUDK1NW"},{"order":2,"rounding":"NONE","multiplier":1,"productCode":"AWR-WE13N"},{"order":3,"rounding":"NONE","multiplier":1,"productCode":"FH-LFHLN"}]
(1 row)
```

## 판정 요약

실 사용자 경로로 재현 가능한 결함이 있다.

1. 활성 규칙의 리모컨 계열이 이중 재계산되어 기본 리모컨과 유선/컬러 키트 수량이 중복된다.
2. 활성 규칙이 소유한 유연호스 대상은 `유연호스 제외`와 `유연호스 I형` 옵션을 무시한다.
3. 활성 규칙이 소유한 판넬 대상은 판넬 변경 옵션을 무시하거나 옵션 판넬과 기본 판넬을 함께 만든다.
4. `goodsType=NON_GOODS` 34건 축은 살아 있으나 실제 견적 작성 화면에서 납품가 입력 시 수량이 1로 바뀌지 않는다.

주문서 규칙 소비 경로와 옵션 평가기 부재는 지시대로 범위 밖이며 결함 수에 넣지 않았다. `OUT_OF_STOCK` 관련 `SINGLE_SET`·`COMMERCIAL_MULTI` 500도 판정에서 제외했다.

## ① 계열 단위 병합 — 0→2→4 실측

입력 모델은 `AM052BN6PBH1`이다. 셀은 `수량 / 금액(원) / 대표 모델`이다.

### 규칙 0건 통제 대조

공유 실 DB에는 타 표본인 활성 규칙 1건이 있었고 R9 소유 표본이 아니므로 비활성화하지 않았다. 따라서 이 표는 **실 DB 규칙 0건 상태가 아니다**. 동일 HEAD·동일 실제 HTML·동일 catalog/API 응답에서 문서 navigation 응답의 `HOME_QUANTITY_SYNC_RULES` bootstrap만 `[]`로 치환한 통제 반사실이다. 공유 DB write 없이 순수 레거시 분기를 재는 셋째 경로이며, 이 한계를 숨기지 않는다.

| 품목군 | 실내기 0 | 실내기 2 | 실내기 4 |
|---|---:|---:|---:|
| 판넬 | 0 / 0 / — | 2 / 208,120 / PC6NUDK1NW | 4 / 416,240 / PC6NUDK1NW |
| 유연호스 | 0 / 0 / — | 2 / 20,000 / FH-LFHLN | 4 / 40,000 / FH-LFHLN |
| 분기관 | 0 / 0 / — | 0 / 0 / — | 0 / 0 / — |
| 발통 | 0 / 0 / — | 0 / 0 / — | 0 / 0 / — |
| 리모컨 | 0 / 0 / — | 2 / 27,830 / AR-EC05 | **6 / 83,490 / AR-EC05** |

0→2→4를 같은 화면에서 바꿀 때 리모컨이 4가 아니라 6으로 누적된다. 즉 순수 레거시에도 실제 사용자 조작으로 도달 가능한 누적 결함이 있다.

### 규칙 1건 — 실 DB·실 API

| 품목군 | 실내기 0 | 실내기 2 | 실내기 4 |
|---|---:|---:|---:|
| 판넬 | 0 / 0 / — | 2 / 208,120 / PC6NUDK1NW | 4 / 416,240 / PC6NUDK1NW |
| 유연호스 | 0 / 0 / — | 2 / 20,000 / FH-LFHLN | 4 / 40,000 / FH-LFHLN |
| 분기관 | 0 / 0 / — | 0 / 0 / — | 0 / 0 / — |
| 발통 | 0 / 0 / — | 0 / 0 / — | 0 / 0 / — |
| 리모컨 | 0 / 0 / — | **4 / 55,660 / AR-EC05** | **8 / 111,320 / AR-EC05** |

판넬·유연호스는 2→4로 선형 추종한다. 분기관은 이 실내기 단독 표본에 분기관 선행조건인 단배관 실외기가 없어 0이고, 발통은 옵션과 실외기 원천이 없어 0이다. 별도 옵션 실측에서 두 계열의 계산 경로가 동작함을 확인했다. 리모컨은 규칙 적용 전후 재계산이 겹쳐 즉시 두 배가 된다. 소스 구조도 `recomputeHomeDerived`의 레거시 계산 뒤 `applyServerHomeQuantitySync_`가 실행되는 R6 형태를 유지하지만, 서버 적용 함수 안에서 `recomputeHomeRemotes()`를 다시 호출한다(`views/index.ejs` 8376, 8448 부근).

## ② 사용자 옵션 6개 실측

| 옵션 | 실제 조작과 전→후 | 판정 |
|---|---|---|
| `#home_no_hose` | 활성 규칙 실내기 2: FH-LFHLN `2 / 20,000` → `2 / 20,000` | **결함: 제외 무시** |
| `#home_hose_i` | 활성 규칙 실내기 2: FH-LFHLN `2 / 20,000` → 그대로, I형 0 | **결함: I형 전환 무시** |
| `#home_no_branch` | 실내기 2 + 단배관 실외기 1: AXJ-YA2512N `1 / 52,800` → `0 / 0` | 정상 |
| `#home_foot` | 단배관 실외기 2: 발통세트 `0 / 0` → `2 / 0` | 정상 |
| `#home_panel` 비규칙 원천 | 기본 PC1YNWK1NW `2 / 410,190`; 제외 0; 공청 PC1YNCK1NW `2 / 666,710`; 25년형 PC1YNWK1NW `2 / 410,190`; AI PC1YNRK1NW `2 / 765,930` | 정상 |
| `#home_panel` 활성 규칙 원천 | 기본 PC6NUDK1NW `2 / 208,120`; 제외도 동일; 공청은 기본 2 + PC6NUCK1NW 2; 25년형·AI도 기본 유지 | **결함: 제외/변경 무시 또는 중복** |
| `#home_remote` 활성 규칙 원천 | 기본 AR-EC05 `4 / 55,660`; 유선 AWR-WE13N 2 + AIM-A01N 4; 컬러 AWR-WG00N 2 + AIM-A01N 4; 제외 0 | 모델 전환·제외는 반영되나 **기본과 키트 수량 중복 결함** |

## ③ main 병합 표면

- `goodsType` 축: 실 product API의 `NON_GOODS`는 정확히 34건이었다.
- 실 견적 작성 화면에서 그중 `운임`을 선택하고 수량을 7로 둔 뒤 납품가 12,345원을 입력·blur했다. 수량은 **7 그대로**였다. `NON_GOODS`이면 납품가 입력 시 1이 되어야 하므로 실 사용자 경로 결함이다.
- 저장 버튼은 누르지 않아 공유 DB에는 견적 표본을 만들지 않았다.
- 같은 화면의 로그인, 실 품목 검색·선택, 금액 재계산, 옵션 영역 진입은 동작했다. 본 검증 중 위 결함 외에 이 화면에서 병합으로 유입된 별도 도달성 파손은 재현하지 못했다.

## ④ R8 testid 하위호환

- 메신저 실 화면: `김` 검색 후 실제 수신자 1명을 선택했고 고정 `multiselect-chip-count`가 `1개 선택됨`을 표시했다. 동적 `messenger-recipient-search-chip-count`는 없었다. 기존 고정 testid 소비 경로가 실제로 동작한다.
- 견적품목 실 화면: 실제 행 `AJ040RXH4BC1`, `AJ052RXH5BC1` 각각에 인스턴스별 `...-input-chip-count`가 하나씩 존재했다. 현재 선택 칩은 각 0개이고 두 count 요소의 접근성 텍스트도 각각 빈 값이어서 0/0과 일치했으며 행 간 누출은 없었다.
- 이 두 표면에서는 실 사용자 도달성 결함을 재현하지 못했다.

## ⑤ 증거 무결성과 하드게이트

- 공식 하드게이트: **최종 실행 결과 기입 예정**.
- 첫 전수 실행은 기존 5173 프로세스가 실행 중 사라져 658 통과 후 10건이 전부 `ERR_CONNECTION_REFUSED`였다. 이를 기능 실패나 성공으로 세지 않고, 관리형 webServer로 전수를 다시 실행했다.
- 규칙 0건 표는 위에서 밝힌 대로 통제 반사실이며 실 DB 0건으로 오인시키지 않는다.
- 활성 규칙은 검증 전후 읽기 전용 SQL로 확인한다. DB 직접 INSERT/UPDATE는 하지 않았다.
- 모든 캡처 쓰기는 `resolveQaShotsDir`를 경유한다. 최종 승격 실행은 `QA_SHOTS_DIR=docs/qa/2026-08-10-896-r9`, `QA_ALLOW_OVERWRITE=1`을 명시해 `_local` 없이 생성한다.

## 캡처

- `docs/qa/2026-08-10-896-r9/01-rule-1-family-qty-4.png`
- `docs/qa/2026-08-10-896-r9/02-rule-0-counterfactual-family-qty-4.png`
- `docs/qa/2026-08-10-896-r9/03-home-options-real-toggle.png`
- `docs/qa/2026-08-10-896-r9/04-messenger-live-fixed-chip-count.png`
- `docs/qa/2026-08-10-896-r9/05-estimate-items-row-chip-counts.png`
- `docs/qa/2026-08-10-896-r9/06-non-goods-live-price-quantity-one.png`

## 신규 파일·R9 표본·못 한 것

신규 파일:

- `clients/desktop/playwright/896-r9-sol-reconvergence-real-qa/896-r9-sol-reconvergence-real-qa.spec.ts`
- `clients/desktop/playwright/896-r9-sol-reconvergence-real-qa/playwright.config.ts`
- 이 보고서
- 위 캡처 6장

R9 표본:

- 영구 DB 표본 없음. 활성 규칙은 기존 `dev_master` 잔재를 읽기 전용 조건으로 사용했다.
- 견적 작성의 `운임` 행은 저장하지 않은 브라우저 로컬 입력뿐이다.
- 규칙 0건은 DB 표본이 아니라 문서 응답 bootstrap 통제 대조다.

못 한 것:

- 타 소유 활성 규칙을 변경할 수 없어 실 공유 DB의 규칙 0건 상태는 만들지 않았다.
- 주문서 소비 경로와 옵션 평가기는 이 PR 범위 밖이라 검증·결함 판정하지 않았다.


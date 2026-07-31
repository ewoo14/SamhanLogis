# PR #996 라이브 QA 2회차 보고서

- 일시: 2026-07-31 KST
- 범위: 게이트웨이 경유 order-app 거래처 주문 화면의 quantity-sync shadow 관측
- 제약: 코드 수정·git 쓰기·재빌드·재기동 금지

## 진행 로그

- 보고서 선생성 완료. 이후 검증 결과를 이 문서에 append한다.

## 배포본 확인

명령:

```text
docker inspect -f '{{.Created}}' infrastructure-api-gateway infrastructure-product-service
```

실제 응답:

```text
2026-07-31T14:50:41.668874152Z
2026-07-31T14:25:23.874519458Z
```

- `infrastructure-api-gateway`: 2026-07-31 23:50:41 KST (PM 배포 시각과 일치)
- `infrastructure-product-service`: 2026-07-31 23:25:23 KST
- 게이트웨이 생성 시각은 오늘 23:50 근처로 확인됨.

## 관측 산출 여부

### order-app 기동

실행 명령:

```text
cd clients/web/order-app
VITE_APP_VERSION="2026/07/31-1" VITE_API_BASE_URL="http://localhost:8080/api/v1" npx vite --port 5223 --strictPort
```

- 실제 Vite 프로세스 PID: `43156`
- `GET http://localhost:5223/` 응답: HTTP `200`
- 브라우저: 로컬 Chrome 실제 렌더링 세션(Playwright), 합성/목업 데이터·화면 사용 안 함

### 실제 거래처 주문 화면 관측

전용 QA 거래처 `2118712345`만 사용했으며, PIN은 보고서에 기록하지 않는다. 주문 확정/전송은 수행하지 않았다.

1. 화면에서 사업자번호 조회 → `GET http://localhost:8080/api/v1/auth/partner-status?bizNo=2118712345` → HTTP `200`, `status=NEED_PW_INPUT`
2. 화면에서 로그인 → `POST http://localhost:8080/api/v1/auth/partner-login` → HTTP `200`, `status=OK`, JWT 발급
3. order-app이 게이트웨이를 통해 호출:

```text
GET http://localhost:8080/api/v1/quantity-sync-rules?estimateCategory=SINGLE_SET&page=0&size=50
HTTP 200
[
  {
    "ruleKey": "SINGLE_S03_CEILING_DRAIN_PUMP",
    "estimateCategory": "SINGLE_SET",
    "enabled": true,
    "aggregation": "SUM",
    "inactiveBehavior": "ZERO",
    "legacyRef": "S-03",
    "sources": [{"productCode":"AC060CS6PBH1SY","factor":1}],
    "targets": [{"productCode":"AC072CS6PBH1SY","multiplier":1,"roundingMode":"FLOOR","displayOrder":1}],
    "when": {}
  }
]
```

- 브라우저 console: `[quantity-sync shadow] S-03 설정을 읽었습니다. 사용자 계산은 legacy 수식을 유지합니다.`
- `window.__SAMHAN_QUANTITY_SYNC__.getState()` 실제 결과: `status=ready`, `rule.ruleKey=SINGLE_S03_CEILING_DRAIN_PUMP`, `errorMessage=null`
- 결론: **게이트웨이를 거친 order-app shadow 관측이 실제로 산출됨(PASS)**
- 실제 화면 캡처: [r2-live-shadow-ready-filtered.png](r2-live-shadow-ready-filtered.png)

관측 성공을 위해 API로 전용 throwaway canonical 규칙을 만들었다. 생성 응답은 HTTP `201`이었고, 검증 후 soft-delete했다. 실 품목의 값·상태·가격은 변경하지 않았다.

## 범위 밖 규칙 재확인

canonical 규칙과 별도로 `QA996_R2_GENERAL_S03`(일반 ruleKey, `legacyRef=S-03`) throwaway 규칙을 API로 생성했다(HTTP `201`). 같은 거래처로 같은 화면 경로를 다시 실행했다.

- 게이트웨이 응답은 canonical `SINGLE_S03_CEILING_DRAIN_PUMP` **1건만** 반환했다.
- `QA996_R2_GENERAL_S03`은 partner shadow 응답에 섞이지 않았다.
- 브라우저 shadow 상태는 재실행 후에도 `ready`였다.
- 결론: **1회차에서 통과한 범위 밖 규칙 차단이 이번 관측 복구 후에도 유지됨(PASS)**

## 정리 후 행 수 대조

### 정리 전

```text
docker exec samhan-postgres psql -U samhan -d product_db -P pager=off -c "SELECT ..."

active_rule   | 2
active_source | 2
active_target | 2
```

활성 규칙은 `SINGLE_S03_CEILING_DRAIN_PUMP`와 `QA996_R2_GENERAL_S03` 두 건이었다. 두 규칙을 모두 API `DELETE`로 soft-delete했다(각 HTTP `204`).

### 정리 후

```text
active_rule           | 0
active_source         | 0
active_target         | 0
active_qa_products    | 0
active_products       | 1220
```

확인 SQL은 stdin을 사용하지 않고 `docker exec ... psql ... -c "SQL"`로 실행했다. Soft-delete 이력은 보존 정책상 남지만 활성 행은 0이며, 전체 활성 제품 수 `1220`도 변경되지 않았다. 기존 이력의 비활성 QA 제품 2건은 이번 회차에서 건드리지 않았다.

## 확인하지 못한 것

- 주문하기/주문 전송은 데이터 생성 방지를 위해 확인하지 않았다.
- shadow 상태는 사용자 화면에 별도 배지를 표시하는 기능이 아니므로, 캡처 화면에는 주문서와 로그인 후 화면이 보이고 `ready` 상태는 브라우저 console 및 `window.__SAMHAN_QUANTITY_SYNC__.getState()`로 증명했다.
- 내장 브라우저 연결은 이 세션에서 사용할 수 없어 로컬 Chrome 실제 렌더링으로 대체했다. 캡처는 실제 order-app DOM의 화면 캡처다.
- 제품 상태·가격·실 거래처 품목 데이터의 수정/삭제는 수행하지 않았다.

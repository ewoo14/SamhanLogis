# PR #802 (#773 S1b) 라이브 스모크 — /products/internal/lookup-by-label

실 Docker product-service(:8084·신 jar 배포·`85be81c2f`) 실서버 curl. dev product_db 실 데이터.

## ① modelName-fallback HIT (HIGH fix 라이브 종단 실증)
요청: `{"label":"AR09TXEAAWKNEU-04 [테스트]"}`
응답 200:
```json
{"success":true,"code":"OK","data":{"id":"d7f488a5-6259-379c-8035-ed551e75a102","name":"삼성 윈드프리 9평형","modelName":"AR09TXEAAWKNEU-04","productCode":"010004","modelCode":null,...}}
```
→ 토큰 `AR09TXEAAWKNEU-04` 추출 → modelCode miss → **modelName fallback hit** → 200 + **modelCode=null**. fix 전이라면 accounting resolveByLabel이 이 정상매칭을 500으로 오분류했을 지뢰를 실서버로 재현·해소 실증.

## ② 미매칭 404
요청: `{"label":"AC999ZZ9ZZZ9 [미등록]"}` → 404 `"라벨에 해당하는 제품이 없습니다"` (Design P3 문구 fix 확인)

## ③ 토큰추출 불가 400
요청: `{"label":"[포장재 비용]"}` (전체 대괄호→clean 후 빈문자열) → 400 `"라벨에서 모델코드를 추출할 수 없습니다"`

## ④ X-Internal-Token 누락 401
헤더 무 → 401 `"내부 인증 토큰이 유효하지 않습니다"`

## 유예 (정직 고지)
라벨→productId **전량** 매칭 실증(AC/AJ 삼한 자체제작 모델코드)은 dev=삼성유통품이라 여전히 S1d(실 카탈로그 sync) 후. 본 스모크는 modelName-fallback 경로(dev seed의 우연한 토큰 부합)로 HIGH fix + 4상태 계약을 실서버 검증.

# 회계 라벨 → 모델코드 토큰 매핑 IT 픽스처 (#773 S1b)

## legacy-invoice-labels.txt
- **출처**: `tools/legacy-gas/계산서일괄등록양식 생성/계산서 발행용.xlsx` sheet1 (실 삼한 계산서 발행 데이터).
- **추출**: sheet1 inline text 중 레거시 모델코드 정규식 `(AC|AP|AR|AF|AM|AJ|AXJ|PC|AWR|ARR)[A-Z0-9-]{4,}` 매치 라벨의 unique 집합 (총 791 매치 → 267 unique).
- **성격**: **실 레거시 데이터**(합성 아님·[[feedback_no_fake_data_ever]] 준수). `ModelTokenExtractor`가 실제 운영 라벨 전량에서 모델코드 토큰을 추출할 수 있는지 genuine 검증용.
- **형식**: `<모델코드12자> [<설명>] [<옵션설명>]` — 매칭 키 = **선두 모델코드 토큰**(공백 전), 대괄호/소괄호 설명은 표시용·매칭 무관.
- **엣지케이스 포함**: 소괄호 규격 `(RX다배관)`, 이중 대괄호, zero-width space `[​]`, 3상/단상 표기 등.

## 라이브 실증 유예
dev product_db는 삼성 유통품(model_code NULL)이라 이 AC… 모델코드에 매칭될 제품이 없음 → 라벨→productId **라이브 hit 실증은 S1d(실 카탈로그 sync) 후로 유예**. S1b는 토큰 추출·fallback·다의성 로직을 unit/IT로 genuine 검증(스펙 §5.5-5.6).

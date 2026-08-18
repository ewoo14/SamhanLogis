-- 리모컨 축 문맥 납품가 정본화.
-- V45의 무선(AR-EH05)·유선통합(AWR-WE13N)에 이어 컬러유선(AWR-WG00N)을
-- 구성품 관계 단가로 채운다. 웹의 모델별 단가표를 복원하지 않는다.
UPDATE bundle_component
SET context_delivery_price = 91000
WHERE is_deleted = FALSE
  AND component_product_code = 'AWR-WG00N'
  AND context_delivery_price IS DISTINCT FROM 91000;

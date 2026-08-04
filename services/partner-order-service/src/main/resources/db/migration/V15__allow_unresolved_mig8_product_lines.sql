-- MIG-8 미해소 품목도 주문을 보존할 수 있도록 product 참조를 nullable 로 허용한다.
ALTER TABLE partner_order_lines
    ALTER COLUMN product_id DROP NOT NULL;

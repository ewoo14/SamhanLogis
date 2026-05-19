-- MIG-2 품목코드는 product_code/model_code 양쪽에 적재된다.
-- product_code 는 V7 에서 VARCHAR(100) 으로 확장됐으므로 model_code 도 동일 폭으로 맞춘다.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
          FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'products'
           AND column_name = 'model_code'
    ) THEN
        ALTER TABLE products ALTER COLUMN model_code TYPE VARCHAR(100);
    END IF;
END $$;

-- #1090 분류 정본 전환
-- 218건은 기존 분류가 있는 레거시 품목의 옵션만 이관한다.
-- 분류가 없는 113건은 자동 추측하지 않으므로 NULL로 남긴다.
ALTER TABLE products ADD COLUMN IF NOT EXISTS discount_option VARCHAR(20);

UPDATE products
SET discount_option = CASE
    WHEN upper(coalesce(model_code, '')) LIKE 'AC%'
         AND length(upper(coalesce(model_code, ''))) >= 9
         AND substr(upper(model_code), 8, 1) = '6'
         AND substr(upper(model_code), 9, 1) = 'P' THEN 'THREE_SIXTY'
    WHEN upper(coalesce(model_code, '')) LIKE 'AC%'
         AND length(upper(coalesce(model_code, ''))) >= 9
         AND substr(upper(model_code), 8, 1) = '4'
         AND substr(upper(model_code), 9, 1) IN ('P', 'D') THEN 'FOUR_WAY'
    WHEN upper(coalesce(model_code, '')) LIKE 'AC%'
         AND length(upper(coalesce(model_code, ''))) >= 9
         AND substr(upper(model_code), 8, 1) = '1'
         AND substr(upper(model_code), 9, 1) IN ('P', 'D') THEN 'ONE_WAY'
    WHEN upper(coalesce(model_code, '')) LIKE 'AP%'
         AND (upper(model_code) LIKE 'AP230%' OR upper(model_code) LIKE 'AP290%'
              OR (length(upper(model_code)) >= 11 AND substr(upper(model_code), 11, 1) = 'C'
                  AND substr(upper(model_code), 9, 1) = 'D')
              OR (NOT (length(upper(model_code)) >= 11 AND substr(upper(model_code), 11, 1) = 'C')
                  AND substr(upper(model_code), 9, 1) = 'P')) THEN 'STAND'
    WHEN upper(coalesce(model_code, '')) LIKE 'AP%'
         AND length(upper(coalesce(model_code, ''))) >= 11
         AND substr(upper(model_code), 9, 1) = 'D'
         AND substr(upper(model_code), 11, 1) = 'H'
         AND upper(model_code) NOT LIKE 'AP230%'
         AND upper(model_code) NOT LIKE 'AP290%' THEN 'DELUXE'
    WHEN (upper(coalesce(model_code, '')) LIKE 'AC%' OR upper(coalesce(model_code, '')) LIKE 'AP%')
         AND length(upper(coalesce(model_code, ''))) >= 9
         AND substr(upper(model_code), 9, 1) = 'F' THEN 'FIRST_GRADE'
    ELSE NULL
END
WHERE is_deleted = false
  AND status = 'ACTIVE'
  AND (cat_l_id IS NOT NULL OR cat_m_id IS NOT NULL OR cat_s_id IS NOT NULL)
  AND discount_option IS NULL;


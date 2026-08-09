-- #896 S1: 운영 품목 마스터의 확정된 비상품 후보 34건만 전환한다.
-- 이름 검색은 후보 확정 단계에서만 사용되었고, 적용은 명시적 model_code 목록이다.
DO $$
DECLARE
    candidate_count INTEGER;
BEGIN
    SELECT count(*) INTO candidate_count
      FROM products
     WHERE is_deleted = FALSE
       AND model_code IN ('00101','01018','AAAA-00026','AAAA-00027','AAAA-00028','AAAA-00029','AAAA-00030','AAAA-00032','AAAA-00033','ZENG-00001','ZENG-00003','ZENG-00004','ZENG-00005','설치비1','설치비10','설치비11','설치비12','설치비13','설치비14','설치비15','설치비2','설치비3','설치비4','설치비5','설치비6','설치비7','설치비8','설치비9','영업수수료','운임','절삭','조달수수료','카드수수료','판매수수료');
    -- 신규/테스트 빈 카탈로그에는 운영 후보가 없으므로 적용 대상이 아니다.
    -- 일부만 존재하는 운영 드리프트만 실패시켜 조용한 부분 전환을 막는다.
    IF candidate_count NOT IN (0, 34) THEN
        RAISE EXCEPTION 'NON_GOODS 후보 수가 0 또는 34가 아닙니다: %', candidate_count;
    END IF;
END $$;

UPDATE products
   SET goods_type = 'NON_GOODS',
       inventory_qty_mgmt = FALSE
 WHERE is_deleted = FALSE
   AND model_code IN ('00101','01018','AAAA-00026','AAAA-00027','AAAA-00028','AAAA-00029','AAAA-00030','AAAA-00032','AAAA-00033','ZENG-00001','ZENG-00003','ZENG-00004','ZENG-00005','설치비1','설치비10','설치비11','설치비12','설치비13','설치비14','설치비15','설치비2','설치비3','설치비4','설치비5','설치비6','설치비7','설치비8','설치비9','영업수수료','운임','절삭','조달수수료','카드수수료','판매수수료');

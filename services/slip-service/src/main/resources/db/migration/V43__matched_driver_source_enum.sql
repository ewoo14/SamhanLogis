-- 배차 #3 — dispatch_matched_driver.driver_source 표준 enum + CHECK.
-- 기존 arologis/외부 자동 매칭 source 는 AROLOGIS 로 대표값 정규화한다.
-- 기존 MANUAL 값은 타사/기타 수동기입으로 보아 OTHER 로 보존한다.

UPDATE dispatch_matched_driver
SET driver_source = CASE
    WHEN driver_source IN ('AROLOGIS', 'INTERNAL_APP', 'EXTERNAL_INSUNG_QUICK',
                           'EXTERNAL_SMS', 'EXTERNAL_KAKAO') THEN 'AROLOGIS'
    WHEN driver_source IN ('GYEONGGI_QUICK', '경기퀵') THEN 'GYEONGGI_QUICK'
    WHEN driver_source IN ('JEONGUK_HWAMUL', '전국화물') THEN 'JEONGUK_HWAMUL'
    ELSE 'OTHER'
END
WHERE driver_source IS NOT NULL;

ALTER TABLE dispatch_matched_driver
    ADD CONSTRAINT ck_dispatch_matched_driver_source
    CHECK (driver_source IN ('AROLOGIS', 'GYEONGGI_QUICK', 'JEONGUK_HWAMUL', 'OTHER'));

-- #863 outbox 관측 pull 쿼리용 부분 인덱스.
--
-- #863 R1 MED 정정: 최초 정의는 (status, first_attempted_at) 복합 인덱스였다. 선두 컬럼이
-- status(2값 IN, ScalarArrayOpExpr)라 PostgreSQL의 min/max 인덱스 최적화
-- (preprocess_minmax_aggregates — MIN(col)을 "ORDER BY col LIMIT 1" 인덱스 탐색으로 치환)가
-- 적용되지 않아 oldest_pending_age 쿼리가 선두 탐색이 아닌 O(N) 집계로 실행됐다(주석은
-- "인덱스 항목부터 읽을 수 있다"고 반대로 적혀 있었다). first_attempted_at을 단독 선두 컬럼으로
-- 두면 부분 인덱스 predicate(is_deleted=false AND status IN (...))가 두 게이지 쿼리의 WHERE 절과
-- 정확히 일치해:
--   - oldest_pending_age의 MIN(first_attempted_at)이 인덱스 선두에서 1행만 읽는 탐색이 되고,
--   - pending_depth의 COUNT(*)는 (컬럼 순서와 무관하게) 이 부분 인덱스만으로 index-only scan이
--     가능하다 — heap fetch 없이, 그리고 현재 PENDING/PROCESSING 잔량에 비례하는 범위만 스캔한다.
CREATE INDEX ix_slip_publish_outbox_pending_first_attempted
    ON slip_publish_outbox (first_attempted_at)
    WHERE is_deleted = FALSE
      AND status IN ('PENDING', 'PROCESSING');

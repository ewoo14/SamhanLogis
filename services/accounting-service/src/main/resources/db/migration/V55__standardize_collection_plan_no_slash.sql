-- V55__standardize_collection_plan_no_slash.sql
-- 수금계획 번호를 전표번호 표준 yyyy/MM/dd-N 으로 정규화하고 일자별 채번 시퀀스를 도입한다.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
BEGIN
    IF EXISTS (
        WITH normalized AS (
            SELECT id,
                   CASE
                       WHEN plan_no LIKE 'CP-%'
                        AND plan_no ~ '^CP-[0-9]{8}-[0-9]+$'
                       THEN regexp_replace(
                               plan_no,
                               '^CP-([0-9]{4})([0-9]{2})([0-9]{2})-0*([0-9]+)$',
                               '\1/\2/\3-\4'
                            )
                       ELSE plan_no
                   END AS normalized_no
              FROM collection_plan
             WHERE is_deleted = FALSE
        )
        SELECT 1
          FROM normalized
         GROUP BY normalized_no
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'collection_plan.plan_no normalization would create active duplicates';
    END IF;
END $$;

UPDATE collection_plan
   SET plan_no = regexp_replace(
           plan_no,
           '^CP-([0-9]{4})([0-9]{2})([0-9]{2})-0*([0-9]+)$',
           '\1/\2/\3-\4'
       )
 WHERE plan_no LIKE 'CP-%'
   AND plan_no ~ '^CP-[0-9]{8}-[0-9]+$';

CREATE TABLE IF NOT EXISTS collection_plan_number_sequences (
    id              UUID        PRIMARY KEY,
    planned_date    DATE        NOT NULL,
    last_seq        INTEGER     NOT NULL DEFAULT 0,
    version         BIGINT      NOT NULL DEFAULT 0,
    created_at      TIMESTAMP   NOT NULL DEFAULT NOW(),
    created_by      VARCHAR(50) NOT NULL DEFAULT 'system',
    modified_at     TIMESTAMP,
    modified_by     VARCHAR(50),
    deleted_at      TIMESTAMP,
    deleted_by      VARCHAR(50),
    is_deleted      BOOLEAN     NOT NULL DEFAULT FALSE,
    CONSTRAINT ux_collection_plan_number_sequences_date UNIQUE (planned_date)
);

COMMENT ON TABLE collection_plan_number_sequences IS
    '수금계획 번호 yyyy/MM/dd-N 일자별 채번 시퀀스';

INSERT INTO collection_plan_number_sequences
    (id, planned_date, last_seq, version, created_at, created_by, is_deleted)
SELECT gen_random_uuid(),
       to_date(split_part(plan_no, '-', 1), 'YYYY/MM/DD') AS planned_date,
       MAX(split_part(plan_no, '-', 2)::INTEGER) AS last_seq,
       0,
       CURRENT_TIMESTAMP,
       'system',
       FALSE
  FROM collection_plan
 WHERE plan_no ~ '^[0-9]{4}/[0-9]{2}/[0-9]{2}-[0-9]+$'
 GROUP BY to_date(split_part(plan_no, '-', 1), 'YYYY/MM/DD')
ON CONFLICT (planned_date) DO UPDATE
    SET last_seq = GREATEST(collection_plan_number_sequences.last_seq, EXCLUDED.last_seq),
        modified_at = CURRENT_TIMESTAMP,
        modified_by = 'system'
  WHERE collection_plan_number_sequences.last_seq < EXCLUDED.last_seq;

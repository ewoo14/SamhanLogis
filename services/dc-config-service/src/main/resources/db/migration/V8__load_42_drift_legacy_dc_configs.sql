-- PR #1245: 판정표 기준 원천 정본 drift 42건 적재.
-- 4348703365는 2026-08-13 현행 정본이므로 의도적으로 제외한다.
-- 기존 활성 dc_configs 42행을 백업한 뒤 교체한다. 4348703365는 대상에 없다.
BEGIN;

CREATE TEMP TABLE legacy_dc_drift_1245 (
    partner_code VARCHAR(64) PRIMARY KEY,
    home_discount_rate NUMERIC(5,4), commercial_discount_rate NUMERIC(5,4),
    show_i_hose BOOLEAN NOT NULL, discount_360_amount NUMERIC(12,2),
    discount_4way_amount NUMERIC(12,2), discount_1way_amount NUMERIC(12,2),
    discount_stand_amount NUMERIC(12,2), discount_deluxe_amount NUMERIC(12,2),
    discount_first_grade_amount NUMERIC(12,2), unit_round_to INT,
    unit_processing_enabled BOOLEAN NOT NULL, unit_round_mode VARCHAR(10) NOT NULL,
    note TEXT
) ON COMMIT DROP;

INSERT INTO legacy_dc_drift_1245 VALUES
('1023108393',.45,NULL,FALSE,NULL,NULL,NULL,NULL,NULL,NULL,NULL,FALSE,'ROUND',NULL),
('1110854627',NULL,.47,FALSE,NULL,NULL,NULL,NULL,NULL,NULL,NULL,FALSE,'ROUND','상업47% / 360 -4만 / 4way -4만 / 1way -4만 / 스탠드 -4만 / 디럭스 -2만 / 1등급 -4만 / 발통필수'),
('1588802571',.48,.49,TRUE,60000,60000,50000,60000,30000,NULL,100,TRUE,'CEIL','홈48%&상업49% / 360 -6만 / 4way -6만 / 1way -5만 / 스탠드 -6만 / 디럭스 -3만 / 100원 올림'),
('1700202752',.46,.46,FALSE,NULL,NULL,NULL,NULL,NULL,NULL,NULL,FALSE,'ROUND',NULL),
('1928601146',NULL,.45,TRUE,NULL,NULL,NULL,NULL,NULL,NULL,NULL,FALSE,'ROUND','홈47%&상업45% / 유연호스I형'),
('1958803735',.47,NULL,FALSE,20000,20000,20000,20000,NULL,20000,NULL,FALSE,'ROUND',NULL),
('1978701449',NULL,NULL,FALSE,NULL,NULL,NULL,NULL,NULL,NULL,NULL,FALSE,'ROUND','홈45%&상업47% / 발통 요청하시는거 아니면 X'),
('2062722119',.47,NULL,FALSE,NULL,NULL,NULL,NULL,NULL,NULL,NULL,FALSE,'ROUND',NULL),
('2081312022',NULL,NULL,FALSE,NULL,NULL,NULL,NULL,NULL,NULL,NULL,FALSE,'ROUND','홈46% / 유연호스 0원'),
('2148720659',NULL,NULL,FALSE,NULL,NULL,NULL,30000,NULL,NULL,NULL,FALSE,'ROUND',NULL),
('2188601069',NULL,.46,FALSE,20000,20000,20000,20000,NULL,NULL,NULL,FALSE,'ROUND',NULL),
('2218135880',NULL,.46,FALSE,NULL,NULL,NULL,NULL,NULL,NULL,NULL,FALSE,'ROUND',NULL),
('2246300824',.45,NULL,FALSE,NULL,NULL,NULL,NULL,NULL,NULL,NULL,FALSE,'ROUND',NULL),
('3118142909',NULL,.45,FALSE,NULL,NULL,NULL,NULL,NULL,NULL,NULL,FALSE,'ROUND',NULL),
('3123184794',.47,.48,TRUE,NULL,NULL,NULL,NULL,NULL,NULL,NULL,FALSE,'ROUND','홈47%&상업48% / 유연호스I형 / 유연호스 I형 7,000원'),
('3128161229',NULL,.47,FALSE,50000,50000,50000,50000,NULL,NULL,NULL,FALSE,'ROUND',NULL),
('3998102101',NULL,NULL,FALSE,NULL,NULL,NULL,NULL,NULL,NULL,NULL,FALSE,'ROUND','홈45%&상업47% / 출고가 포함 견적 필수'),
('4340601242',NULL,NULL,FALSE,NULL,NULL,NULL,NULL,NULL,NULL,NULL,FALSE,'ROUND',NULL),
('4368601987',NULL,.45,FALSE,NULL,NULL,NULL,NULL,NULL,NULL,NULL,FALSE,'ROUND',NULL),
('4481802127',.47,.47,FALSE,NULL,NULL,NULL,NULL,NULL,NULL,NULL,FALSE,'ROUND',NULL),
('4758802006',NULL,.46,FALSE,NULL,NULL,NULL,NULL,NULL,NULL,NULL,FALSE,'ROUND','홈45%&상업46% / 3000이상 상업멀티 47%'),
('4868101328',NULL,.47,TRUE,NULL,NULL,NULL,NULL,NULL,NULL,NULL,FALSE,'ROUND','홈47%&상업47% / 유연호스 3,000원'),
('4960901372',NULL,NULL,FALSE,50000,50000,30000,50000,NULL,30000,NULL,FALSE,'ROUND','상업48% / 360 -5만 / 4way -5만 / 1way -3만 / 스탠드 -5만 / 1등급 -3만'),
('5041369971',NULL,NULL,TRUE,NULL,50000,NULL,NULL,NULL,NULL,NULL,FALSE,'ROUND',NULL),
('5042231142',NULL,NULL,FALSE,NULL,50000,NULL,NULL,NULL,NULL,NULL,FALSE,'ROUND',NULL),
('5218101918',NULL,NULL,FALSE,NULL,NULL,NULL,NULL,NULL,NULL,NULL,FALSE,'ROUND','상업45% / 멀티 단품40% 실외기43% 세트45%'),
('6030686342',.47,NULL,TRUE,NULL,NULL,NULL,NULL,NULL,NULL,NULL,FALSE,'ROUND','홈47% / 단배관(기본) / 유연호스 및 분기관 제외'),
('6132977742',NULL,NULL,FALSE,70000,70000,50000,70000,20000,NULL,NULL,FALSE,'ROUND',NULL),
('6323101362',NULL,NULL,TRUE,NULL,NULL,NULL,NULL,NULL,NULL,NULL,FALSE,'ROUND','홈47%&상업47% / 유연호스I형 / 발통필수'),
('6345300755',NULL,NULL,FALSE,NULL,NULL,NULL,NULL,NULL,NULL,NULL,FALSE,'ROUND','홈46% / 유연호스 0원'),
('6528702417',NULL,NULL,FALSE,30000,30000,30000,30000,NULL,30000,NULL,FALSE,'ROUND',NULL),
('6708701231',NULL,NULL,TRUE,50000,50000,50000,50000,NULL,NULL,NULL,FALSE,'ROUND','홈47%&상업48% / 유연호스 I형 7,000원'),
('6832001665',.47,.47,FALSE,NULL,NULL,NULL,NULL,NULL,NULL,NULL,FALSE,'ROUND',NULL),
('6931501445',NULL,NULL,FALSE,50000,50000,50000,50000,NULL,NULL,NULL,FALSE,'ROUND',NULL),
('7053900503',.45,NULL,FALSE,NULL,NULL,NULL,NULL,NULL,NULL,NULL,FALSE,'ROUND',NULL),
('7098602166',NULL,NULL,FALSE,50000,50000,50000,50000,30000,30000,NULL,FALSE,'ROUND',NULL),
('7698100748',NULL,.46,FALSE,NULL,NULL,NULL,NULL,NULL,NULL,NULL,FALSE,'ROUND',NULL),
('7968102976',NULL,NULL,TRUE,NULL,NULL,NULL,NULL,NULL,NULL,100,TRUE,'ROUND',NULL),
('8412400727',.45,NULL,TRUE,NULL,NULL,NULL,NULL,NULL,NULL,NULL,FALSE,'ROUND',NULL),
('8428102605',NULL,NULL,TRUE,60000,60000,50000,60000,NULL,NULL,100,TRUE,'ROUND',NULL),
('8718100468',NULL,NULL,FALSE,NULL,NULL,NULL,NULL,NULL,NULL,NULL,FALSE,'ROUND','홈45%&상업47% / 발통필수!'),
('8848101425',NULL,NULL,FALSE,NULL,NULL,NULL,NULL,NULL,NULL,NULL,FALSE,'ROUND','홈45%&상업47% / 남진열:010-3436-1588/ 강민석:010-2358-8836/ 정건우:010-3052-1090/ 노성현:010-4823-7706/ 이경택:010-6641-7611/ 고승빈:010-5008-9586 / 한현규:010-8749-1354/ 현재호:010-9140-8086/ 최태식:010-2329-6123/ 조성헌:010-7696-2286/ 김준연:010-8024-4170/ 박정일:010-9381-3822/ 김종연:010-3587-5485/ 김태현:010-7567-1251');

CREATE TABLE dc_config_legacy_drift_1245_backup (LIKE dc_configs INCLUDING ALL);

DO $$ DECLARE missing_partners INTEGER; existing_configs INTEGER; BEGIN
    SELECT COUNT(*) INTO missing_partners FROM legacy_dc_drift_1245 x
      LEFT JOIN partners p ON p.partner_code=x.partner_code AND p.is_deleted=FALSE WHERE p.id IS NULL;
    SELECT COUNT(*) INTO existing_configs FROM legacy_dc_drift_1245 x
      JOIN partners p ON p.partner_code=x.partner_code AND p.is_deleted=FALSE
      JOIN dc_configs c ON c.partner_id=p.id AND c.is_deleted=FALSE;
    IF missing_partners <> 0 THEN RAISE EXCEPTION 'PR1245 drift missing partners: %', missing_partners; END IF;
    IF existing_configs <> 42 THEN RAISE EXCEPTION 'PR1245 drift expected 42 existing rows, got %', existing_configs; END IF;
END $$;

INSERT INTO dc_config_legacy_drift_1245_backup
SELECT c.* FROM dc_configs c JOIN partners p ON p.id=c.partner_id
JOIN legacy_dc_drift_1245 x ON x.partner_code=p.partner_code WHERE c.is_deleted=FALSE;

UPDATE dc_configs c SET home_discount_rate=x.home_discount_rate, commercial_discount_rate=x.commercial_discount_rate,
 show_i_hose=x.show_i_hose, discount_360_amount=x.discount_360_amount, discount_4way_amount=x.discount_4way_amount,
 discount_1way_amount=x.discount_1way_amount, discount_stand_amount=x.discount_stand_amount,
 discount_deluxe_amount=x.discount_deluxe_amount, discount_first_grade_amount=x.discount_first_grade_amount,
 unit_round_to=x.unit_round_to, unit_processing_enabled=x.unit_processing_enabled, unit_round_mode=x.unit_round_mode,
 source='LEGACY_CSV', note=x.note, modified_at=CURRENT_TIMESTAMP, modified_by='PR1245'
FROM legacy_dc_drift_1245 x JOIN partners p ON p.partner_code=x.partner_code
WHERE c.partner_id=p.id AND c.is_deleted=FALSE;

DO $$ DECLARE backup_configs INTEGER; protected_configs INTEGER; BEGIN
    SELECT COUNT(*) INTO backup_configs FROM dc_config_legacy_drift_1245_backup;
    SELECT COUNT(*) INTO protected_configs FROM dc_config_legacy_drift_1245_backup b JOIN partners p ON p.id=b.partner_id
      WHERE p.partner_code='4348703365';
    IF backup_configs <> 42 THEN RAISE EXCEPTION 'PR1245 expected 42 backups, got %', backup_configs; END IF;
    IF protected_configs <> 0 THEN RAISE EXCEPTION 'PR1245 protected code backed up'; END IF;
END $$;

COMMIT;

/* 원복: BEGIN; UPDATE dc_configs c SET (home_discount_rate,commercial_discount_rate,show_i_hose,
discount_360_amount,discount_4way_amount,discount_1way_amount,discount_stand_amount,discount_deluxe_amount,
discount_first_grade_amount,unit_round_to,unit_processing_enabled,unit_round_mode,source,note,created_at,created_by,
modified_at,modified_by,deleted_at,deleted_by,is_deleted)=(b.home_discount_rate,b.commercial_discount_rate,b.show_i_hose,
b.discount_360_amount,b.discount_4way_amount,b.discount_1way_amount,b.discount_stand_amount,b.discount_deluxe_amount,
b.discount_first_grade_amount,b.unit_round_to,b.unit_processing_enabled,b.unit_round_mode,b.source,b.note,b.created_at,b.created_by,
b.modified_at,b.modified_by,b.deleted_at,b.deleted_by,b.is_deleted) FROM dc_config_legacy_drift_1245_backup b WHERE c.id=b.id; COMMIT; */

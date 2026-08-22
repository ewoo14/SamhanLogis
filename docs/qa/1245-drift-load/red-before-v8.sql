-- PR #1245 drift 42 적재 RED 검증
-- V8 적용 전에는 원천 정본 42건이 모두 일치하지 않아 실패해야 한다.
DO $$
DECLARE
    matched INTEGER;
    protected_code INTEGER;
BEGIN
    SELECT COUNT(*) INTO matched
      FROM dc_configs c
      JOIN partners p ON p.id = c.partner_id
     WHERE p.partner_code IN (
       '1023108393','1110854627','1588802571','1700202752','1928601146','1958803735',
       '1978701449','2062722119','2081312022','2148720659','2188601069','2218135880',
       '2246300824','3118142909','3123184794','3128161229','3998102101','4340601242',
       '4368601987','4481802127','4758802006','4868101328','4960901372','5041369971',
       '5042231142','5218101918','6030686342','6132977742','6323101362','6345300755',
       '6528702417','6708701231','6832001665','6931501445','7053900503','7098602166',
       '7698100748','7968102976','8412400727','8428102605','8718100468','8848101425'
     ) AND c.source = 'LEGACY_CSV';
    SELECT COUNT(*) INTO protected_code
      FROM partners p JOIN dc_configs c ON c.partner_id=p.id
     WHERE p.partner_code='4348703365' AND c.source='LEGACY_CSV';
    IF matched = 42 OR protected_code <> 0 THEN
        RAISE EXCEPTION 'RED 검증 조건이 이미 충족됨: matched=%, protected=%', matched, protected_code;
    END IF;
    RAISE EXCEPTION 'RED: drift 42건이 아직 적재되지 않음 (matched=%, protected=%)', matched, protected_code;
END $$;

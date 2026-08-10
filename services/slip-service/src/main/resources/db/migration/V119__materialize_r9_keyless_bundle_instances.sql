-- PR #1131 R9: 실 DRAFT 2026/08/07-20의 유일한 keyless 다중 인스턴스를
-- 런타임 정본(instanceKey + parentSetModel)에 맞게 명시 이관한다.
--
-- 이 migration은 parent_set_model/행 순서 휴리스틱으로 대상을 찾지 않는다.
-- 실측한 8개 line id와 두 인스턴스의 4행 매핑이 모두 일치할 때만 UPDATE한다.
-- 대상이 이미 이관됐거나 신규/테스트 DB에 없으면 no-op이다.

DO $$
DECLARE
    target_rows integer;
    target_heads integer;
    target_products integer;
    remaining_groups bigint;
BEGIN
    SELECT COUNT(*),
           COUNT(*) FILTER (WHERE COALESCE(l.set_head, false)),
           COUNT(DISTINCT l.product_id)
      INTO target_rows, target_heads, target_products
      FROM slips s
      JOIN slip_lines l ON l.slip_id = s.id
     WHERE s.is_deleted = false
       AND l.is_deleted = false
       AND s.slip_no = '2026/08/07-20'
       AND l.parent_set_model = 'AC060CS6PBH1SY'
       AND NULLIF(BTRIM(l.bundle_set_options ->> 'instanceKey'), '') IS NULL;

    IF target_rows = 0 THEN
        -- 이미 이관됐거나 대상이 없는 fresh/test DB.
        NULL;
    ELSE

        IF target_rows <> 8 OR target_heads <> 2 OR target_products <> 4 THEN
            RAISE EXCEPTION
                'R9 migration target drift: slip_no=2026/08/07-20 parent=AC060CS6PBH1SY rows=% heads=% products=%',
                target_rows, target_heads, target_products;
        END IF;

        IF (
            SELECT COUNT(*)
              FROM slip_lines
             WHERE id IN (
                 'ff5b90ed-21b4-465c-b463-a050d3b93c99',
                 'f8a7f65d-b1e7-4c1c-99aa-40194e555cf3',
                 'de3ff7c0-5354-4c4a-a29d-35231629bd89',
                 '7da4e3cd-420c-4035-991b-5cad02cae3e4',
                 'bdabf372-7b4f-4847-acdb-3bb62d23e4fc',
                 '866aae3a-7e91-49da-9755-bd1651d4ec01',
                 '6d3f40e3-dc2b-44c4-ae4e-65834cec1c70',
                 'c38aed6e-250f-43ef-8661-b8ea0496fb7a'
             )
               AND is_deleted = false
               AND parent_set_model = 'AC060CS6PBH1SY'
               AND NULLIF(BTRIM(bundle_set_options ->> 'instanceKey'), '') IS NULL
        ) <> 8 THEN
            RAISE EXCEPTION 'R9 migration line-id mapping drift for slip_no=2026/08/07-20';
        END IF;

        UPDATE slip_lines
           SET bundle_set_options = jsonb_set(
               COALESCE(bundle_set_options, '{}'::jsonb),
               '{instanceKey}',
               to_jsonb('r9-20260807-20-instance-a'::text),
               true)
         WHERE id IN (
             'ff5b90ed-21b4-465c-b463-a050d3b93c99',
             'f8a7f65d-b1e7-4c1c-99aa-40194e555cf3',
             'de3ff7c0-5354-4c4a-a29d-35231629bd89',
             '7da4e3cd-420c-4035-991b-5cad02cae3e4'
         );

        UPDATE slip_lines
           SET bundle_set_options = jsonb_set(
               COALESCE(bundle_set_options, '{}'::jsonb),
               '{instanceKey}',
               to_jsonb('r9-20260807-20-instance-b'::text),
               true)
         WHERE id IN (
             'bdabf372-7b4f-4847-acdb-3bb62d23e4fc',
             '866aae3a-7e91-49da-9755-bd1651d4ec01',
             '6d3f40e3-dc2b-44c4-ae4e-65834cec1c70',
             'c38aed6e-250f-43ef-8661-b8ea0496fb7a'
         );
    END IF;

    -- 이 migration 자체가 guard 활성 전 preflight다. 남은 keyless 다중 그룹은
    -- 어떤 임의 경계도 추정하지 않고 배포를 실패시킨다.
    WITH groups AS (
        SELECT s.id AS slip_id,
               BTRIM(l.parent_set_model) AS parent_set_model,
               COUNT(*) AS line_count,
               COUNT(*) FILTER (WHERE COALESCE(l.set_head, false)) AS head_count
          FROM slips s
          JOIN slip_lines l ON l.slip_id = s.id
         WHERE s.is_deleted = false
           AND l.is_deleted = false
           AND l.parent_set_model IS NOT NULL
           AND BTRIM(l.parent_set_model) <> ''
           AND NULLIF(BTRIM(l.bundle_set_options ->> 'instanceKey'), '') IS NULL
         GROUP BY s.id, BTRIM(l.parent_set_model)
    )
    SELECT COUNT(*)
      INTO remaining_groups
      FROM groups
     WHERE head_count > 1;

    IF remaining_groups <> 0 THEN
        RAISE EXCEPTION
            'R9 preflight failed: active_keyless_multi_instance_groups=%', remaining_groups;
    END IF;
END
$$;

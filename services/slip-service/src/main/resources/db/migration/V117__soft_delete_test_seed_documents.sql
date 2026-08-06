-- #1096 S1: created_by=system/qa-seed 테스트 품목 정리.
-- hard delete는 하지 않는다. 아래 UUID는 product_db의 created_by 기준 SELECT 결과 101건이다.
-- 복구: 해당 migration actor로 표시된 행에 대해
-- UPDATE <table> SET is_deleted=FALSE, deleted_at=NULL, deleted_by=NULL
-- WHERE deleted_by='issue-1096-test-seed-cleanup';

-- 혼합 전표는 부모를 보존하고 테스트 라인만 정리한다.
-- 시더 품목 provenance가 있는 견적은 혼합 여부와 관계없이 개발책임자 결정에 따라 문서 전체를 정리한다.
-- 활성 문서의 헤더와 모든 라인은 동일한 cleanup actor로 표시해 한 묶음 식별이 가능하도록 한다.
CREATE TEMP TABLE _issue_1096_test_product_ids (id UUID PRIMARY KEY) ON COMMIT DROP;
INSERT INTO _issue_1096_test_product_ids (id) VALUES
    ('b0000000-0000-0000-0000-000000000001'::uuid),
    ('01949ab7-e922-35c6-b289-5337d867a0ee'::uuid),
    ('210c51ce-f07e-3f15-a6ba-84a1f4dd2bf0'::uuid),
    ('2e40fa30-10b2-3a9b-a99c-570ac92287ad'::uuid),
    ('d7f488a5-6259-379c-8035-ed551e75a102'::uuid),
    ('ae339262-7ca9-3f7c-8418-4339e88b3466'::uuid),
    ('7550826e-d6d1-3a12-98b1-3e867188c6a9'::uuid),
    ('d15a3094-1c04-3db3-93da-2e5b50a9bc7a'::uuid),
    ('4599cfc1-35c1-3a8a-869b-f92f5f125b76'::uuid),
    ('13cce07c-8822-3d89-bd3c-dfe04660cf05'::uuid),
    ('ecc3d7e8-950b-3441-a60f-4b44ce7fbab5'::uuid),
    ('80bd3fac-6f65-3c05-8ec5-b1ac8d684b44'::uuid),
    ('b185b774-d801-34aa-99b5-e2abf5ff0748'::uuid),
    ('b9ed7fe2-734a-36fe-9e81-45907b92d00a'::uuid),
    ('c6f164a9-fe01-35d7-ae5c-8fb807ee05e7'::uuid),
    ('ed045c04-8fe4-3cd7-b31d-4ea0a728001a'::uuid),
    ('d03f3161-559e-30cf-968d-5d0b3f6a780b'::uuid),
    ('17e5da1c-b638-3cc8-a86d-254466a9ee54'::uuid),
    ('87c4b0ef-1c9f-3e93-8af0-0ebc88978d40'::uuid),
    ('71f0a01b-1d3f-32cc-ae07-b9ccea274466'::uuid),
    ('553a8e29-99ab-3ce1-841f-cbf01cfe7aee'::uuid),
    ('b94d18af-ef77-39ca-abf4-7a1afa43ed06'::uuid),
    ('f5edeecb-7382-36c9-b643-20f51092bbe7'::uuid),
    ('db0ae185-e1f4-3773-b8d8-39ef8eba5b70'::uuid),
    ('8f62c8cf-d312-3d68-af23-a21391f0eff0'::uuid),
    ('6bc25996-b322-37ec-8ee6-60a73b6b1120'::uuid),
    ('9a9dd245-c03e-3264-873d-e72596e8cb60'::uuid),
    ('565cc5d3-85af-3b9f-870d-0f3bd6c4dc76'::uuid),
    ('97307209-a471-3c5e-8717-3459bc23e40b'::uuid),
    ('c9e2752d-ca12-32bc-9397-12eaff083511'::uuid),
    ('64677bfa-f4ae-3c84-9afc-ce9131184f63'::uuid),
    ('7da82639-4494-3ba3-a18a-c5ec19db7534'::uuid),
    ('50813e5b-f6e4-36d0-8ebb-f2507f248dcb'::uuid),
    ('df53ced3-439d-3237-80f2-45f57a00cbfb'::uuid),
    ('d0e9c52b-942f-3ffb-8c69-9b790ccf4d3c'::uuid),
    ('03786abc-0185-3f34-a4d5-af787bc5bfd2'::uuid),
    ('d7fd042d-6d04-303c-88fc-fe50a326e221'::uuid),
    ('fb2619be-80d3-3da0-a4cf-4601fbf7e88a'::uuid),
    ('a698ab4f-45ba-30a3-b906-89023551d00f'::uuid),
    ('76db0149-839d-35de-a96f-5d17bf0dac80'::uuid),
    ('91974980-4d19-350d-8320-c479be95f6e0'::uuid),
    ('c5774020-04ce-3874-92cf-c95413897e43'::uuid),
    ('01a174a8-bc74-30f0-b729-67bf87d6610b'::uuid),
    ('e5867f26-8e85-39bc-a440-cac0621398b4'::uuid),
    ('2ec35099-ebd1-3234-9bc2-c84e8fecde1a'::uuid),
    ('39ad50ea-2aea-3a3a-8032-62bdcb4de4eb'::uuid),
    ('ecd40587-b0ba-396d-9d1d-b3154d8d52d4'::uuid),
    ('02c6c679-1743-35c3-9b08-d4c87979dddb'::uuid),
    ('4b54cdd6-14cf-3139-ab17-614e71c3e73f'::uuid),
    ('2c7873b8-c085-372b-992b-287e08855d40'::uuid),
    ('e35ae4a5-0505-36a1-bbf2-b2abea094b8a'::uuid),
    ('51e16f88-98ce-359c-b4e5-c6641325c5bd'::uuid),
    ('89fbb6de-2c36-3ebe-96f7-4dd832bf5300'::uuid),
    ('a2d7fde5-88b7-3cca-8771-264f16b1199b'::uuid),
    ('31897a51-efeb-300b-afb7-1ae61280ae87'::uuid),
    ('f7e7bee0-cad2-3003-ab2c-908fd6c8ff4f'::uuid),
    ('78ba4426-b711-340d-ab87-3374c9085b57'::uuid),
    ('a9d88f27-98af-3009-8e1f-3d9a390c41f4'::uuid),
    ('7e55e54f-b757-3d5b-8d4f-661084b2a88e'::uuid),
    ('50221b31-ef85-3faf-9cfa-5d09e858a9ca'::uuid),
    ('09367b6e-b597-39fc-8c56-d23a1f9e96bc'::uuid),
    ('f4caddce-cb1c-3b77-9541-633efe248c6a'::uuid),
    ('9dc444ac-aaff-3143-b266-85977b505d86'::uuid),
    ('3bb183d2-edf6-3967-9fc8-d604bf721f22'::uuid),
    ('198b917b-e26b-39dc-8db4-53b4c3fb4098'::uuid),
    ('ead3297d-8dcc-3b2a-8589-17216d679491'::uuid),
    ('87245769-c0aa-36e9-a10d-8e826dd7e1f9'::uuid),
    ('98f09b10-5f3c-3e10-9fb3-0744c7a28a96'::uuid),
    ('0e383a3c-06eb-3d4b-9455-5f4c10de7ea7'::uuid),
    ('ae0f223f-87e1-3004-b6b8-869794a8c68c'::uuid),
    ('2cd7f9a5-f139-37dc-9d59-c624f9b4fc64'::uuid),
    ('678d5932-a886-34e8-baad-06fe0a753288'::uuid),
    ('2c3886d8-f77e-3e07-81c9-d7205dcbb44b'::uuid),
    ('c5858a82-f634-3f51-9431-f86271c58ac8'::uuid),
    ('37db1dd8-862a-39b3-ae29-cacc2f67da45'::uuid),
    ('6c70e584-4e7c-38fd-85be-28c047f38fcb'::uuid),
    ('508ffc15-4ebe-363e-a395-389ba0d6b6a7'::uuid),
    ('a6992eb0-81fc-3b3d-957b-7accfe06288c'::uuid),
    ('841e6a99-06fe-3252-8a4f-5227de864a62'::uuid),
    ('e47852ff-2ea7-39e4-90d3-1cc0ea6ebfa1'::uuid),
    ('384c8baa-2755-3902-9131-799b1bf79832'::uuid),
    ('6f3e996f-96dd-3f38-8a9c-704ff462495a'::uuid),
    ('5ebf6916-1127-3091-821b-34a4faf15af4'::uuid),
    ('71a65c6a-3a15-37a7-8c67-4b0de18e92a4'::uuid),
    ('5a504cc7-5343-3650-ac34-49003d649d1a'::uuid),
    ('d35ab633-c3db-3187-acb0-b19262eb5fae'::uuid),
    ('367a48d3-0af8-3996-aafb-e80b4dcf3bf3'::uuid),
    ('5b586178-5bbc-329c-9309-f2773910f8ec'::uuid),
    ('3dc9ea39-8bc3-3a60-8dd5-c4bb4d499049'::uuid),
    ('e8efe136-b12f-3b6b-9d08-771196214089'::uuid),
    ('6b86e35b-4912-386f-8636-92453aa064d1'::uuid),
    ('273a5596-53d8-348a-8ac4-478e75124063'::uuid),
    ('47953963-4b68-3085-86d3-38c822f3702c'::uuid),
    ('2b3977b8-1ad3-320f-a247-f57e44fb55ac'::uuid),
    ('b2799515-dea3-3759-88a9-ed85205e9585'::uuid),
    ('e46cece2-ca40-3e81-8121-9b76a396d678'::uuid),
    ('9baffe53-4593-3a56-bbc9-129da0550391'::uuid),
    ('7bf268ec-9565-38a5-9bd3-7163933b1970'::uuid),
    ('f5b526e0-7d62-3829-8811-cac9e68e5a3b'::uuid),
    ('25e9c490-21df-3b32-9b27-d45c57c4c4c6'::uuid),
    ('0fdcd680-d002-3ee4-a397-0d0eae1af8fb'::uuid);

CREATE TEMP TABLE _issue_1096_cleanup_estimate_ids (id UUID PRIMARY KEY) ON COMMIT DROP;
-- 번호가 아니라 문서가 실제 시더 품목 라인을 갖는지로 provenance를 판정한다.
-- 활성 시더 라인이 하나라도 있는 DRAFT/미전환 문서는 혼합 여부와 관계없이
-- 헤더와 모든 라인을 한 묶음으로 정리한다.
INSERT INTO _issue_1096_cleanup_estimate_ids (id)
SELECT e.id
FROM estimates e
WHERE e.is_deleted=FALSE
  AND e.status='QUOTE_DRAFT'
  AND e.converted_slip_id IS NULL
  AND EXISTS (
      SELECT 1
      FROM estimate_lines l
      WHERE l.estimate_id=e.id
        AND l.is_deleted=FALSE
        AND l.product_id IN (SELECT id FROM _issue_1096_test_product_ids)
  );

UPDATE slip_lines l SET is_deleted=TRUE, deleted_at=COALESCE(l.deleted_at,CURRENT_TIMESTAMP),
 deleted_by='issue-1096-test-seed-cleanup'
 WHERE l.is_deleted=FALSE AND l.product_id IN (SELECT id FROM _issue_1096_test_product_ids);

UPDATE estimate_lines l SET is_deleted=TRUE, deleted_at=COALESCE(l.deleted_at,CURRENT_TIMESTAMP),
 deleted_by='issue-1096-test-seed-cleanup'
 WHERE l.is_deleted=FALSE
   AND (l.product_id IN (SELECT id FROM _issue_1096_test_product_ids)
        OR l.estimate_id IN (SELECT id FROM _issue_1096_cleanup_estimate_ids));

-- 혼합 견적의 정본 라인은 보존하되, 헤더 금액은 삭제 직후 활성 라인의 정본 합계로 맞춘다.
UPDATE estimates e SET
    total_supply = COALESCE((SELECT SUM(l.supply_amount) FROM estimate_lines l
                             WHERE l.estimate_id=e.id AND l.is_deleted=FALSE), 0),
    total_vat = COALESCE((SELECT SUM(l.vat_amount) FROM estimate_lines l
                          WHERE l.estimate_id=e.id AND l.is_deleted=FALSE), 0),
    total_amount = COALESCE((SELECT SUM(l.line_total) FROM estimate_lines l
                             WHERE l.estimate_id=e.id AND l.is_deleted=FALSE), 0)
 WHERE e.is_deleted=FALSE
   AND EXISTS (SELECT 1 FROM estimate_lines l
               WHERE l.estimate_id=e.id AND l.deleted_by='issue-1096-test-seed-cleanup');

UPDATE slips s SET is_deleted=TRUE,
 deleted_at=(SELECT max(l.deleted_at) FROM slip_lines l
             WHERE l.slip_id=s.id AND l.deleted_by='issue-1096-test-seed-cleanup'),
 deleted_by='issue-1096-test-seed-cleanup', deleted_by_name='이슈 #1096 테스트 시더 정리'
 WHERE s.is_deleted=FALSE
 AND EXISTS (SELECT 1 FROM slip_lines l WHERE l.slip_id=s.id AND l.deleted_by='issue-1096-test-seed-cleanup')
 AND NOT EXISTS (SELECT 1 FROM slip_lines l WHERE l.slip_id=s.id AND l.is_deleted=FALSE);

UPDATE estimates e SET is_deleted=TRUE,
 deleted_at=(SELECT max(l.deleted_at) FROM estimate_lines l
             WHERE l.estimate_id=e.id AND l.deleted_by='issue-1096-test-seed-cleanup'),
 deleted_by='issue-1096-test-seed-cleanup', deleted_by_name='이슈 #1096 테스트 시더 정리'
 WHERE e.is_deleted=FALSE
 AND EXISTS (SELECT 1 FROM estimate_lines l WHERE l.estimate_id=e.id AND l.deleted_by='issue-1096-test-seed-cleanup')
 AND NOT EXISTS (SELECT 1 FROM estimate_lines l WHERE l.estimate_id=e.id AND l.is_deleted=FALSE);

UPDATE slip_attachments a SET is_deleted=TRUE, deleted_at=COALESCE(a.deleted_at,CURRENT_TIMESTAMP),
 deleted_by='issue-1096-test-seed-cleanup'
 WHERE a.is_deleted=FALSE AND a.slip_id IN (SELECT id FROM slips WHERE deleted_by='issue-1096-test-seed-cleanup');

-- 정확한 복구:
-- UPDATE slip_attachments SET is_deleted=FALSE,deleted_at=NULL,deleted_by=NULL WHERE deleted_by='issue-1096-test-seed-cleanup';
-- UPDATE slips SET is_deleted=FALSE,deleted_at=NULL,deleted_by=NULL,deleted_by_name=NULL WHERE deleted_by='issue-1096-test-seed-cleanup';
-- UPDATE estimate_lines SET is_deleted=FALSE,deleted_at=NULL,deleted_by=NULL WHERE deleted_by='issue-1096-test-seed-cleanup';
-- UPDATE estimates SET is_deleted=FALSE,deleted_at=NULL,deleted_by=NULL,deleted_by_name=NULL WHERE deleted_by='issue-1096-test-seed-cleanup';
-- UPDATE slip_lines SET is_deleted=FALSE,deleted_at=NULL,deleted_by=NULL WHERE deleted_by='issue-1096-test-seed-cleanup';

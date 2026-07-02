-- E2 pillar2 dispatch soft-delete display metadata.
-- deleted_by keeps the audit userId; deleted_by_name stores the non-UUID display name for UI badges.

ALTER TABLE dispatch_vehicle_group
    ADD COLUMN deleted_by_name VARCHAR(100);

ALTER TABLE dispatch_vehicle_group_slip
    ADD COLUMN deleted_by_name VARCHAR(100);

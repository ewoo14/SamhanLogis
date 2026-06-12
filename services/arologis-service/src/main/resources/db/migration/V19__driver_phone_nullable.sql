ALTER TABLE drivers
    ALTER COLUMN phone_number DROP NOT NULL;

DROP INDEX IF EXISTS ux_drivers_phone_active;

CREATE UNIQUE INDEX ux_drivers_phone_active
    ON drivers (phone_number)
    WHERE is_deleted = FALSE
      AND phone_number IS NOT NULL;

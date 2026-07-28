-- Concurrent sheet sync ordering token.  The row is advanced before external HTTP
-- and checked while the graph advisory lock is held before any product mutation.
CREATE TABLE product_sheet_sync_generation (
    sync_key VARCHAR(255) PRIMARY KEY,
    generation BIGINT NOT NULL
);

-- V9__add_inspection_attachments.sql
-- inventory-service — P1 검수 사진 첨부.
--
-- 매뉴얼 출처: docs/manual/04-모바일/04-사진-첨부.md §검수 사진 첨부 (입고)
--
-- 컨텍스트:
--   * inspection_attachments 테이블 신규
--     — InboundInspection 1건당 N 첨부 (불량 사진 / 수량 차이 사진 등)
--   * 실 파일 = MinIO (S3 호환) bucket `inspection-attachments`.
--     본 row 는 metadata + EXIF GPS 만 보관.
--   * slip-service 의 slip_attachments, partner-service 의 partner_attachments 패턴 일관.
--
-- 컬럼 컨벤션:
--   * 짧은 문자열 VARCHAR(N), CHAR/bpchar 금지
--   * 위도/경도 NUMERIC(10,7) — 소수점 7자리 (1.1cm 정밀도)
--   * 파일 크기 BIGINT (Java Long 매핑)
--   * 모든 신규 컬럼 NULLable 또는 DEFAULT (legacy 호환 컨벤션)
--
-- 회귀 영향:
--   * inspection_attachments 신규 — 기존 IT 영향 0
--   * 기존 inbound_inspections 테이블 변경 없음

----------------------------------------------------------------------
-- inspection_attachments — 입고 검수 사진 첨부
----------------------------------------------------------------------
CREATE TABLE inspection_attachments (
    id              UUID          PRIMARY KEY,
    inspection_id   UUID          NOT NULL REFERENCES inbound_inspections(id),
    slip_no         VARCHAR(30)   NOT NULL,
    file_name       VARCHAR(200)  NOT NULL,
    file_size       BIGINT        NOT NULL,
    content_type    VARCHAR(100)  NOT NULL,
    storage_key     VARCHAR(500)  NOT NULL,
    storage_url     VARCHAR(1000),
    exif_gps_lat    NUMERIC(10,7),
    exif_gps_lng    NUMERIC(10,7),
    captured_at     TIMESTAMP,
    uploaded_by     VARCHAR(50)   NOT NULL,
    uploaded_at     TIMESTAMP     NOT NULL,
    description     VARCHAR(500),

    -- BaseEntity 7 audit
    created_at      TIMESTAMP     NOT NULL,
    created_by      VARCHAR(50)   NOT NULL,
    modified_at     TIMESTAMP,
    modified_by     VARCHAR(50),
    deleted_at      TIMESTAMP,
    deleted_by      VARCHAR(50),
    is_deleted      BOOLEAN       NOT NULL DEFAULT FALSE
);

COMMENT ON TABLE inspection_attachments IS
    'P1 입고 검수 사진 첨부 — 불량 사진 / 수량 차이 사진. 실 파일은 MinIO bucket inspection-attachments.';

COMMENT ON COLUMN inspection_attachments.slip_no IS
    '슬립번호 snapshot — UUID 비공개 가드 의무. 사용자 노출 식별자 (예: 2026/01/10-001)';

COMMENT ON COLUMN inspection_attachments.exif_gps_lat IS
    'EXIF GPS 위도 (선택) — 모바일 카메라 촬영 시 자동 추출';

COMMENT ON COLUMN inspection_attachments.exif_gps_lng IS
    'EXIF GPS 경도 (선택) — 불량 발생 위치 증빙';

COMMENT ON COLUMN inspection_attachments.captured_at IS
    '실 촬영 시각 (선택, EXIF DateTime). 미입력 시 uploaded_at 사용';

COMMENT ON COLUMN inspection_attachments.description IS
    '비고 (선택) — 불량 내용 설명, 수량 차이 메모 등';

CREATE INDEX ix_inspection_attachments_inspection_active
    ON inspection_attachments (inspection_id, is_deleted);

CREATE INDEX ix_inspection_attachments_slipno_active
    ON inspection_attachments (slip_no, is_deleted);

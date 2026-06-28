-- init-rds.sql — Phase 11 RDS PostgreSQL 초기화
-- user_data.sh 최초 부팅 시 psql 로 실행됨.
-- Owner: samhan (RDS master user)
--
-- 17 service 대응 16 DB 생성 (logging-service 는 ES/RabbitMQ 전용, PostgreSQL 불필요).
-- 기존 infrastructure/postgres/init/01-create-databases.sql + 02-extensions.sql 통합.
--
-- 실행 방법 (EC2 user_data.sh 내부):
--   psql -h "${RDS_ENDPOINT}" -U "${RDS_USERNAME}" -d postgres -f /opt/samhanlogis/init-rds.sql
--
-- 주의: \c 명령은 psql 전용 메타커맨드. psql 로만 실행할 것.

-- ─── 16 DB 생성 ───────────────────────────────────────────────────────────────

-- Phase 1~4 핵심 서비스
CREATE DATABASE auth_db          OWNER samhan;
CREATE DATABASE logging_db       OWNER samhan;
CREATE DATABASE user_db          OWNER samhan;
CREATE DATABASE product_db       OWNER samhan;
CREATE DATABASE inventory_db     OWNER samhan;
CREATE DATABASE slip_db          OWNER samhan;
CREATE DATABASE accounting_db    OWNER samhan;

-- Phase 6 (partner 계열 / dc-config)
CREATE DATABASE partner_auth_db  OWNER samhan;
CREATE DATABASE dc_config_db     OWNER samhan;
CREATE DATABASE partner_order_db OWNER samhan;

-- Phase 9 (잔여 도메인 4 신규 서비스)
CREATE DATABASE partner_db       OWNER samhan;
CREATE DATABASE groupware_db     OWNER samhan;
CREATE DATABASE notification_db  OWNER samhan;
CREATE DATABASE dashboard_db     OWNER samhan;

-- Phase 10 (arologis-service)
CREATE DATABASE arologis_db      OWNER samhan;

-- Phase 11 (마이그레이션 보조 DB)
CREATE DATABASE migration_db     OWNER samhan;

-- ─── 공통 Extension 설치 ─────────────────────────────────────────────────────
-- uuid-ossp: 대리 UUID PK
-- pgcrypto : 컬럼 수준 암호화

\c auth_db
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

\c logging_db
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

\c user_db
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

\c product_db
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

\c inventory_db
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

\c slip_db
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

\c accounting_db
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

\c partner_auth_db
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

\c dc_config_db
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

\c partner_order_db
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

\c partner_db
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

\c groupware_db
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

\c notification_db
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

\c dashboard_db
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

\c arologis_db
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

\c migration_db
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

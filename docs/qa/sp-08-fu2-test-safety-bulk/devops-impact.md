# SP-08-FU2 DevOps 영향 분석

작성일: 2026-05-19

---

## P2-2 — slip-service Flyway 마이그레이션

**신규 파일: V26__add_slip_warehouse_name_snapshot.sql**

현재 최신 번호는 V25 (`add_slip_cleanup_save_history`). 따라서 다음 번호는 **V26**.

컬럼 명세:

```sql
ALTER TABLE slips
    ADD COLUMN warehouse_name VARCHAR(100) NULL;

COMMENT ON COLUMN slips.warehouse_name IS
    'SP-08-FU2 창고명 snapshot — inventory-service 조회 시점에 채움. NULLable (기존 전표 소급 없음).';
```

- `NULL` 허용: 기존 전표(마이그레이션 이전 데이터)는 NULL 유지, 신규 전표부터 채움
- `spring.jpa.hibernate.ddl-auto=validate` 호환: NULLable 컬럼 추가이므로 Hibernate validate 통과
- 인덱스 불필요 (조회 필터 대상 아님, 표시 전용)

---

## P2-3 — partner-service 신규 엔드포인트

`/internal/partners/{partnerId}` 신규 추가.

- `infrastructure/docker-compose.yml`: 포트 변경 없음 — 영향 **0**
- `infrastructure/env-templates/partner-service.env`: 환경변수 추가 없음 — 영향 **0**

---

## P2-4 — accounting-service DTO 변경

서비스 내부 DTO 계층 변경만. 인프라 레이어(DB 스키마/포트/환경변수) 변경 없음 — 영향 **0**

---

## P2-5 — FE path 정합

클라이언트 측 라우트/경로 수정. 인프라 레이어 변경 없음 — 영향 **0**

---

## CI / GitHub Actions

`.github/workflows/ci.yml` — slip-service 는 `slip-units` 그룹(단위 테스트) 및 `slip-it-public` / `slip-it-core` 그룹으로 분리 실행 중.

V26 마이그레이션은 Testcontainers PostgreSQL 기반 IT 에서 Flyway가 자동 적용하므로 **CI 워크플로우 파일 수정 불필요**.

---

## 요약

| 항목 | 변경 필요 여부 |
|---|---|
| Flyway V26 SQL 신규 작성 | **필요** (P2-2 전담 BE 작업) |
| docker-compose.yml | 변경 없음 |
| .github/workflows/*.yml | 변경 없음 |
| env-templates/*.env | 변경 없음 |
| Prometheus / Grafana | 변경 없음 |

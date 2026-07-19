# #848 documentType 오버플로 — document_type 컬럼 40→70 확장 (기획 spec · OPUS 4.8)

- 이슈: #848 · 브랜치 `feat/848-documenttype-column-widen` · 결정=**컬럼 40→70 확장**(개발책임자 2026-07-19 배치·[[project_pending_decisions_2026_07_19]])
- 기준일: 2026-07-19 · 규모=S
- [[feedback_applied_migration_immutable]] · [[feedback_migration_fresh_postgres_probe]] · [[project_build_conventions]]

## 0. 목표
- `documentTypeFor()`가 `GROUPWARE_${code}`(최대 70자·`ApprovalTemplate.code` 최대 60자)를 생성하나 저장 컬럼 `document_type`은 **VARCHAR(40)** → **code 31자+ 결재 발의 시 value-too-long(500/truncation)**. 컬럼을 **40→70**으로 확장해 해소.
- **blast radius = groupware_db 한정**: `document_type`은 `ApprovalLineBase`(@MappedSuperclass·`shared/approval-core`) 필드이나 **콘크리트 엔티티는 groupware `ApprovalLine` 단 1개**(`extends ApprovalLineBase` grep 확증) → 실 컬럼은 `groupware_db.approval_lines.document_type`뿐. 타 서비스 ddl-validate 무영향.

## 1. 결정
| # | 결정 |
|---|---|
| D-848-01 | **`ApprovalLineBase.document_type` `@Column(length = 40)` → `length = 70`**(shared/approval-core·nullable 유지). |
| D-848-02 | **groupware `V11__widen_approval_lines_document_type.sql`**: `ALTER TABLE approval_lines ALTER COLUMN document_type TYPE VARCHAR(70);`(기존 V1~V10 불변). |
| D-848-03 | 70 근거 = `GROUPWARE_`(10) + code 최대 60 = 70. code 상한(60)은 `ApprovalTemplate.validateCode` 기존 유지(입력템플릿 도메인 변경 없음·접두사 유지). |

## 2. 스코프
- `shared/approval-core/.../ApprovalLineBase.java`: `@Column(length=40)` → `70`.
- `services/groupware-service/src/main/resources/db/migration/V11__widen_approval_lines_document_type.sql` 신규.

## 3. 검증
- **ddl-auto validate 부팅**: 엔티티(70)↔V11 컬럼(70) 정확 일치(불일치 시 groupware 부팅 실패). 전체 Flyway V1→V11 + Spring context validate 부팅.
- **테스트**: code 31~60자 결재유형으로 결재 발의 → `document_type = GROUPWARE_${code}`(41~70자) 저장 성공(기존 40 초과 케이스 IT). 기존 결재 발의 회귀 0.
- **fresh Postgres probe**(V1→V11 DROP/CREATE·ON_ERROR_STOP).
- genuine `--rerun-tasks`·변경 모듈(groupware) 전체.

## 4. 리스크
- 마이그 부팅(ddl validate 불일치)→엔티티+V11 동시. **적용된 마이그 불변**(V1~V10 무수정·V11만). ALTER TYPE VARCHAR 확장은 데이터 손실 없음(축소 아님).
- 선재 오버플로(code 31자+ 기존 결재 생성 경로)는 본 확장으로 해소(별건 아님).

## 5. 팀 배치 (구현=CODEX LUNA)
- BE: ApprovalLineBase @Column length + groupware V11 마이그 + code 41~70자 documentType IT.

---
연관 Issue: #848

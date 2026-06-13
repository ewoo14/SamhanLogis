---
name: project-kst-timezone-standard
description: 시스템 전역(DB 포함) KST(Asia/Seoul) 기준 표준화 — 현재 전부 UTC. 배차 collab 머지 후 전담 PR. 합의된 접근(JVM -Duser.timezone + postgres TZ + Hibernate/Jackson)
metadata:
  type: project
---

**개발책임자 지시 (2026-06-14)**: "시스템 전체적으로 DB 포함 한국시간(KST, Asia/Seoul)이 기준이 되어야 한다." 배차 collab QA 스크린샷 시각이 UTC(예: 15:50 = KST 00:50)로 표시되어 발견됨.

**진단 (현 상태 — 전부 UTC)**:
- postgres 컨테이너 `SHOW timezone`=UTC, `now()`=+00. 서비스 컨테이너 `date`=UTC, `TZ` env 없음.
- `infrastructure/docker-compose*.yml` 에 `TZ`/timezone 설정 **전무**.
- 서비스 application.yml 에 `hibernate.jdbc.time_zone` / `spring.jackson.time-zone` KST 설정 **없음**.
- 베이스 이미지 = `eclipse-temurin:17-jre-alpine` (Alpine — OS tzdata 미포함이나 **JVM 자체 tzdb(tzdb.dat) 보유** → `-Duser.timezone=Asia/Seoul` 은 OS tzdata 없이 동작).

**합의된 접근 (전담 PR, 시스템 14서비스 + DB 인프라)**:
1. 전 서비스 컨테이너: `JAVA_TOOL_OPTIONS=-Duser.timezone=Asia/Seoul` (compose env) → JVM 기본 TZ=KST → `LocalDateTime.now()` KST.
2. postgres 컨테이너: `TZ=Asia/Seoul` (compose env) → postgres `timezone` GUC=KST (postgres alpine 은 tzdata 포함).
3. Spring belt-and-suspenders: `spring.jackson.time-zone=Asia/Seoul` + `spring.jpa.properties.hibernate.jdbc.time_zone=Asia/Seoul`.
4. `docker-compose`(로컬) + Phase 11 AWS 설정 동일 적용. redis/rabbitmq/ES 등 로그 일관성 위해 동일 TZ 권장.
5. 검증: 각 컨테이너 `date`·postgres `SHOW timezone`·실 타임스탬프 KST 렌더(실서버 QA 캡처).

**주의 (기존 데이터)**: TIMESTAMP(tz 없음) 컬럼은 UTC 벽시계값으로 저장돼 있어 적용 후 신규 쓰기는 KST·기존은 UTC 혼재 → dev 는 재시드로 정리. TIMESTAMPTZ(decided_at 등)는 tz-aware 라 표시만 KST 로 시프트(정상).

**시점**: §7 배차 collab 머지(#478) 후 → 본 KST 전담 PR → 이후 §7 그룹웨어 결재. (개발책임자 "배차 머지 후 전담 PR" 선택.) 워크플로우 = [[temp-multimodel-workflow]] (Opus 4.8↔Codex, Fable5 제외) + DevOps 주도.

**✅ dev 환경 완료 (PR #479, 2026-06-14)**: 라이브 검증 — postgres `SHOW timezone=Asia/Seoul`·`now()=+09`, 서비스 JVM `-Duser.timezone`, 신규 배차 수정완료 타임스탬프 `2026-06-14 01:29`(KST) 캡처. Opus 라운드 핵심 fix = **postgres `command` 에 `-c timezone=Asia/Seoul`**(TZ env 만으론 GUC 미변경 — 라이브 적발). eureka/gateway RAM cap, arologis compose TZ, user_data `|| true` 동반.

**⚠️ Phase 11 prod cutover 체크리스트 (Codex 라운드 후속, 미적용)**:
1. **prod compose**(S3 `docker-compose.prod.yml`, 레포 부재) 의 전 Spring 서비스 env 에 `TZ=Asia/Seoul` + `JAVA_TOOL_OPTIONS` 에 `-Duser.timezone=Asia/Seoul` 포함 필수(EC2 host `timedatectl` 만으론 컨테이너 JVM TZ 보장 불가). user_data.sh S3 다운로드 구간 주석에 박제됨.
2. **RDS**: `rds.tf` 파라미터그룹 `timezone=Asia/Seoul` attach/apply 후 writer/reader 각각 `SHOW timezone` 확인(필요 시 reboot).
3. **기존 TIMESTAMP(tz없음) 데이터**: UTC→KST 의미 전환점 — prod 운영 데이터 있으면 변환 정책(무변환/+9h/수동) 운영 결정 + audit/표시 smoke check.

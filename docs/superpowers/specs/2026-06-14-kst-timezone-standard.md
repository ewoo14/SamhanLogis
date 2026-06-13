# KST(Asia/Seoul) 시스템 전역 타임존 표준화

> 개발책임자 지시(2026-06-14): "시스템 전체적으로 DB 포함 한국시간(KST)이 기준이 되어야 한다." 배차 collab QA 시각이 UTC(15:50=KST 00:50)로 표시되어 발견. [[project_kst_timezone_standard]].
> 워크플로우: Opus 4.8 ↔ Codex 2모델(Fable5 영구 제외). DevOps 주도. 기획→Codex 개발→Opus/Codex 라운드(실서버 검증 캡처)→PM 머지.

## 진단 (현 상태 — 전부 UTC)
- postgres 컨테이너 `SHOW timezone`=UTC, `now()`=+00. 서비스 컨테이너 `date`=UTC, `TZ` env 없음. docker-compose `TZ` 설정 전무.
- 베이스 `eclipse-temurin:17-jre-alpine` — OS tzdata 미포함이나 **JVM 자체 tzdb 보유** → `-Duser.timezone=Asia/Seoul` 가 OS tzdata 없이 JVM 기본 TZ 를 KST 로 만든다(LocalDateTime/Jackson/Hibernate 기본 모두 KST 파생).
- **Phase 11 AWS RDS 는 이미 KST**(`terraform/rds.tf` aws_db_parameter_group `timezone=Asia/Seoul` 기설정). EC2 user_data 는 CloudWatch JSON 에만 timezone, 호스트 `timedatectl` 미설정.

## 변경 범위
### 로컬 docker-compose (주 deliverable — 검증 가능)
- `infrastructure/docker-compose.local-all.yml`:
  - **`x-spring-env` 앵커**: `TZ: "Asia/Seoul"` 추가 + `JAVA_TOOL_OPTIONS` 에 ` -Duser.timezone=Asia/Seoul` append → **14 서비스 일괄**(전부 `<<: *spring-env` 병합).
  - **eureka-server + api-gateway**(앵커 미병합 자체 env): `TZ: "Asia/Seoul"` + `JAVA_TOOL_OPTIONS: "-Duser.timezone=Asia/Seoul"` 추가.
- `infrastructure/docker-compose.yml`: postgres(필수) + redis/rabbitmq/elasticsearch/minio/prometheus/grafana/nginx 에 `TZ: Asia/Seoul` env 추가(DB timezone + 로그 일관).

### Phase 11 AWS
- `terraform/templates/user_data.sh`: 호스트 `timedatectl set-timezone Asia/Seoul` 추가(EC2 호스트 시계 KST). RDS 는 이미 KST(무변경, 확인만).

## 검증 (실서버 — [[overnight-live-capture]])
- 스택 env 재적용(`docker compose ... up -d`, 이미지 rebuild 불요 — env 변경은 컨테이너 recreate 로 적용).
- 확인: ① 각 컨테이너 `date` = KST ② postgres `SHOW timezone` = Asia/Seoul·`now()` = +09 ③ 실 타임스탬프 KST 렌더(배차/견적 상세 수정완료 시각 = 실제 KST) — 데스크톱 실화면 캡처.

## 주의 (기존 데이터)
TIMESTAMP(tz 없음) 컬럼은 UTC 벽시계값으로 저장돼 적용 후 신규=KST·기존=UTC 혼재 → dev 재시드로 정리. TIMESTAMPTZ(decided_at 등)는 tz-aware → 표시만 KST 시프트(정상). 운영 데이터 없음(pre-production).

## 비범위
- 코드(LocalDateTime.now() 호출부) 변경 불요 — JVM 기본 TZ 가 KST 면 자동. per-service application.yml jackson/hibernate TZ 명시도 불요(JVM TZ 파생). 필요 시 후속.

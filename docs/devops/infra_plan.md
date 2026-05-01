# DevOps 팀 인프라 기획서

> **팀장(TM)**: TM-DO
> **인원**: 엔지니어 2명 + QA 2명
> **상태**: 🔵 기획 대기

---

## 담당 영역

| 담당자 | 역할 | 주요 업무 |
|--------|------|----------|
| TM-DO | DevOps 팀장 | 인프라 설계 총괄, CI/CD 전략 |
| DO-01 | 컨테이너 엔지니어 | Docker Compose, 서비스 오케스트레이션 |
| DO-02 | DB/모니터링 엔지니어 | PostgreSQL 클러스터, Prometheus, Grafana |
| QA-DO-01/02 | 인프라 QA | 부하 테스트, 장애 복구 테스트 |

---

## 인프라 구성

### Docker 서비스 목록
- Eureka Server × 2 (HA)
- API Gateway × 2 (HA)
- 각 마이크로서비스 × 1~2
- PostgreSQL Primary + Replica
- Redis Sentinel
- RabbitMQ Cluster
- Elasticsearch + Kibana
- MinIO
- Prometheus + Grafana

### CI/CD 파이프라인
1. GitHub Push → GitHub Actions 트리거
2. 빌드 + 테스트
3. Docker 이미지 빌드
4. 스테이징 배포 → QA
5. 프로덕션 배포 (수동 승인)

---

## 산출물

- `infra_plan.md`: 인프라 상세 설계
- `docker_compose/`: Docker Compose 파일
- `deployment_guide.md`: 배포 가이드
- `qa_reports/`: 부하 테스트/장애 복구 보고서

---

*Phase 1에서 기본 인프라 구축 착수*

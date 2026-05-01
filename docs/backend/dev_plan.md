# 백엔드 팀 개발 기획서

> **팀장(TM)**: TM-BE
> **인원**: 개발자 7명 + QA 2명
> **상태**: 🔵 기획 대기 (PM 승인 후 상세 기획 착수)

---

## 담당 서비스

| 담당자 | 서비스 | 주요 기능 |
|--------|--------|----------|
| BE-01 | API Gateway, Eureka Server | 라우팅, 서비스 디스커버리, 로드밸런싱 |
| BE-02 | Auth Service, User Service | JWT 인증, 7단계 권한, 조직도 |
| BE-03 | Product Service, Inventory Service | 품목 UUID, FIFO 재고관리 |
| BE-04 | Slip Service | 전표 CRUD, 번호 체계, 수정이력 추적 |
| BE-05 | Accounting Service, Partner Service | 회계, 세금계산서, 거래처 원장 |
| BE-06 | Groupware, Notification, Dashboard | 그룹웨어, 알림, 대시보드 |
| BE-07 | Logging Service | 전체 감사로그, Elasticsearch |
| QA-BE-01/02 | 전체 백엔드 | API 테스트, 통합 테스트 |

---

## 개발 순서 (Phase별)

### Phase 1 (4주): BE-01, BE-02, BE-07
- Docker 환경 + Eureka + Gateway
- 인증/권한 서비스
- 로깅 서비스 기본

### Phase 2 (6주): BE-03
- 품목 서비스 (UUID, 태그, 스펙)
- 재고/창고 서비스 (FIFO, UUID 추적)

### Phase 3 (6주): BE-04
- 전표 서비스 전체
- 전표 번호 체계 + 수정이력

### Phase 4 (4주): BE-05
- 회계 서비스
- 거래처 서비스 + 원장

### Phase 5 (4주): BE-06
- 그룹웨어, 알림, 대시보드

---

*상세 API 명세 및 함수 문서는 개발 진행 시 `api_docs/`, `function_docs/`에 작성*

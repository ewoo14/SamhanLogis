---
name: estimate-auth-dc-key-decisions
description: 2026-06-10 개발책임자 결정 — P0-B 전표발행 인증=X-Internal-Token, DC 통합키=partnerCode(=사업자번호 '-' 제외 동일값)
metadata:
  type: project
---

2026-06-10 개발책임자 확정 (GAS 정합성 에픽 결정 ②③ 해소):

1. **P0-B 전표발행 인증모델 = X-Internal-Token**: 웹 estimate-app(server-to-server) → slip-service `/api/v1/slips/from-estimate` 도달은 내부 토큰 헤더 검증. permitAll 금지, 로그인 헤더 포워딩 채택 안 함. P0-A snapshots permitAll 도 후속 동일 하드닝 검토 대상.
2. **DC설정 통합키**: **partnerCode = 사업자번호에서 '-' 를 제외한 값과 동일** — 별도 bizno↔partnerCode 매핑 불요. 레거시 bizno(숫자만) 키 = 우리 partnerCode 그대로 조회 가능.

**Why**: 무인증 노출 없이 레거시 노션 서비스계정 패턴을 대체 + 거래처 키 이원화 제거.
**How to apply**: P0-B 구현 시 slip-service 에 X-Internal-Token 필터(env secret) + estimate-app slip-bridge 헤더 주입. #29 DC설정 이식 시 dc-config 키 = partnerCode(=bizno digits), 레거시 13컬럼 수용. 관련 [[project-sheets-to-db-full-migration]], [[feedback_enforcement_real_http_test]] (토큰 게이트 실 HTTP 회귀 테스트 의무).

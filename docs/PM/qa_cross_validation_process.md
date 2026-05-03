# QA 교차 검증 프로세스

> **작성일**: 2026-05-03  |  **버전**: v1.0  |  **승인**: PM

---

## 1. 목적

마이크로서비스 간 연동 품질을 보장하기 위해, 각 서비스팀의 QA가 **연관 서비스 팀의 기능을 교차 검증**한다.

---

## 2. 교차 검증 매핑

| 팀 | QA | 교차 검증 대상 팀 | 검증 초점 |
|----|-----|-----------------|----------|
| Team-Infra | QA-00 | Team-Auth, Team-Log | 게이트웨이 라우팅, 서비스 디스커버리 |
| Team-Auth | QA-01 | Team-Slip, Team-GrpW | 인증 토큰 전파, 권한 체크 |
| Team-Product | QA-02 | Team-Inventory | 품목 UUID 연동, 데이터 정합성 |
| Team-Inventory | QA-03 | Team-Product, Team-Slip | 재고 변동, FIFO 검증 |
| Team-Slip | QA-04 | Team-Inventory, Team-Acct | 전표→재고 반영, 전표→회계 연동 |
| Team-Acct | QA-05 | Team-Slip, Team-Partner | 입출금-전표 매핑, 거래처 원장 |
| Team-Partner | QA-06 | Team-Acct, Team-Slip | 거래처 주문→전표 생성 |
| Team-GrpW | QA-07 | Team-Auth, Team-Noti | 전자결재 권한, 알림 연동 |
| Team-Noti | QA-08 | Team-GrpW | WebSocket/푸시 전달 |
| Team-Log | QA-09 | Team-Dash | 감사로그 수집→대시보드 표시 |
| Team-Dash | QA-10 | Team-Log | 통계 데이터 정확성 |
| Team-Migrate | QA-11 | Team-Inventory, Team-Slip | 마이그레이션 데이터 정합성 |

---

## 3. 검증 절차

```
[1] 내부 QA 완료
    │
    ▼
[2] 내부 QA 보고서 작성 (스크린샷 필수)
    │
    ▼
[3] 교차 QA 팀에 검증 요청
    │   (대상 팀 QA에게 테스트 환경 + API 문서 전달)
    │
    ▼
[4] 교차 QA 수행
    │   · 연동 API 호출 테스트
    │   · 데이터 정합성 검증
    │   · UI 통합 흐름 테스트
    │   · 스크린샷 촬영 (필수)
    │
    ▼
[5] 교차 QA 보고서 작성
    │   (docs/{팀명}/qa_reports/{기능명}_cross_qa_{교차팀명}.md)
    │
    ▼
[6] 이슈 발견 시
    │   · 대상 팀 팀장에게 이슈 전달
    │   · GitHub Issue 생성 (label: cross-qa)
    │   · 수정 후 재검증
    │
    ▼
[7] 교차 QA PASS → 개발 완료 처리
```

---

## 4. 교차 QA 수행 시점

| 시점 | 범위 |
|------|------|
| **기능 단위 교차 QA** | 각 기능 개발 완료 후, 연관 서비스 QA가 해당 기능 검증 |
| **Phase 단위 통합 교차 QA** | Phase 완료 전, 해당 Phase의 모든 팀 QA가 전체 연동 검증 |
| **릴리스 전 최종 교차 QA** | main 머지 전 전체 서비스 통합 검증 |

---

## 5. 필수 산출물

| 산출물 | 템플릿 | 비고 |
|--------|--------|------|
| 교차 QA 보고서 | `docs/templates/cross_qa_report_template.md` | 스크린샷 필수 |
| 이슈 티켓 | GitHub Issue (label: `cross-qa`) | 이슈 발견 시 |

---

## 6. 규칙

1. **스크린샷 필수**: 모든 교차 QA 보고서에 최소 1장 이상의 스크린샷 첨부
2. **48시간 내 완료**: 교차 QA 요청 접수 후 48시간 이내 보고서 제출
3. **FAIL 시 블로킹**: 교차 QA FAIL인 기능은 develop 머지 차단
4. **재검증**: 이슈 수정 후 반드시 재검증 수행, 재검증 결과도 보고서에 추가

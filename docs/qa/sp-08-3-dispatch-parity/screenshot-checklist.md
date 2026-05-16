# SP-08-3 배차 legacy GAS parity QA 캡처 체크리스트

> Windows 전용 스크립트 (System.Drawing GDI+ 기반). Linux/macOS CI 비실행, 로컬 Windows 에서만 재생성.
> 생성 스크립트: `scripts/generate-sp-08-3-dispatch-parity-screenshots.ps1`
> 산출 위치: `docs/qa/sp-08-3-dispatch-parity/screenshots/`
> 현 PNG 는 영문 라벨 + 일부 텍스트 폭 초과. SP-08-3-2 진입 시 한국어 라벨 + 폭 조정 컴포넌트 실 캡처로 교체.

| 파일 | §4.1 시나리오 매핑 | caption / 검증 의도 |
|---|---|---|
| `01-six-endpoint-matrix.png` | #1~#6 전체 | 6개 legacy GAS 화면 × 기존 endpoint × 신규 history endpoint × programType 매트릭스 |
| `02-arologis-history-seat.png` | #1 가배차, #2 지방가배차, #3 미배차, #4 운송사 비교 | SP-08-3-2 arologis 4 화면의 `dispatch_save_history` 자리와 row index 기반 testid |
| `03-slip-cleanup-history-seat.png` | #5 전표정리 | SP-08-3-3 전표정리 `slip_cleanup_save_history` 자리와 명시 저장 흐름 |
| `04-dispatch-sms-preview-send.png` | #6 배차문자 | SP-08-3-4 배차문자 preview 저장과 `SEND_AUDIT` append 흐름 |
| `05-uuid-notion-zero-scan.png` | #1~#6 공통 보안/회귀 가드 | UUID literal / Notion runtime / secret-like marker zero scan |
| `06-sp-08-2-pattern-consistency.png` | #1~#6 공통 UI 패턴 | SP-08-2 DPS 2-Tab history 패턴 재사용 기준 |

## PNG ↔ §4.1 1:1 대체 매트릭스

| §4.1 # | 화면 | 대체 PNG | caption |
|---|---|---|---|
| 1 | 가배차분류 | `02-arologis-history-seat.png` | arologis `PRE_CLASSIFY` history 자리 |
| 2 | 지방가배차분류 | `02-arologis-history-seat.png` | arologis `REGIONAL` 토글 격리 |
| 3 | 미배차 | `02-arologis-history-seat.png` | arologis `UNASSIGNED` history 자리 |
| 4 | 운송사 비교 | `02-arologis-history-seat.png` | arologis `RECONCILE` 업로드 결과 저장 자리 |
| 5 | 전표정리 | `03-slip-cleanup-history-seat.png` | slip `SLIP_CLEANUP` 명시 저장 흐름 |
| 6 | 배차문자 | `04-dispatch-sms-preview-send.png` | notification `DISPATCH_SMS` preview + `SEND_AUDIT` |

## 완료 기준

- PNG 6장 정확 생성: `01-six-endpoint-matrix.png` / `02-arologis-history-seat.png` / `03-slip-cleanup-history-seat.png` / `04-dispatch-sms-preview-send.png` / `05-uuid-notion-zero-scan.png` / `06-sp-08-2-pattern-consistency.png`.
- 모든 PNG는 1280×900.
- 파일 크기 0 byte 없음.
- PR 본문에는 최종 commit SHA 기준 raw URL로 최소 1장 이상 인라인 첨부.

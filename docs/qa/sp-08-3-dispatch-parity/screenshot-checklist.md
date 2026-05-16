# SP-08-3 배차 legacy GAS parity QA 캡처 체크리스트

> 생성 스크립트: `scripts/generate-sp-08-3-dispatch-parity-screenshots.ps1`  
> 산출 위치: `docs/qa/sp-08-3-dispatch-parity/screenshots/`

| 파일 | 검증 의도 |
|---|---|
| `01-six-endpoint-matrix.png` | §4.1 6개 legacy GAS 화면 × 기존 endpoint × 신규 history endpoint × programType 매트릭스 |
| `02-arologis-history-seat.png` | SP-08-3-2 arologis 4 화면의 `dispatch_save_history` 자리와 row index 기반 testid |
| `03-slip-cleanup-history-seat.png` | SP-08-3-3 전표정리 `slip_cleanup_save_history` 자리와 명시 저장 흐름 |
| `04-dispatch-sms-preview-send.png` | SP-08-3-4 배차문자 preview 저장과 `SEND_AUDIT` append 흐름 |
| `05-uuid-notion-zero-scan.png` | UUID literal / Notion runtime / secret-like marker zero scan |
| `06-sp-08-2-pattern-consistency.png` | SP-08-2 DPS 2-Tab history 패턴 재사용 기준 |

## 완료 기준

- PNG 5장 이상 생성.
- 모든 PNG는 1280×900.
- 파일 크기 0 byte 없음.
- PR 본문에는 최종 commit SHA 기준 raw URL로 최소 1장 이상 인라인 첨부.

# SP-08-3-4 배차문자 저장내역 스크린샷 체크리스트

| PNG | 시나리오 | Caption |
|---|---|---|
| `01-dispatch-sms-run-restored.png` | 실행 탭 진입 시 최신 `AUTO_LATEST` 미리보기 복원 | 이전 미리보기 복원 배너와 작성자 마스킹 확인 |
| `02-dispatch-sms-preview-auto.png` | 배차문자 미리보기 실행 후 자동 저장 | 미리보기 결과가 `AUTO_LATEST` 저장내역으로 연결되는지 확인 |
| `03-dispatch-sms-manual-save-dialog.png` | 운영자 명시 저장 주제 입력 | `MANUAL_NAMED` 주제 필수, 저장 중 닫기 방지 가드 확인 |
| `04-dispatch-sms-send-confirm.png` | 실 발송 전 확인 | warning 토큰 버튼과 이중 확인 흐름 확인 |
| `05-dispatch-sms-send-audit.png` | 실 발송 후 발송 감사 저장 | `SEND_AUDIT` append-only 저장과 latest 제외 확인 |
| `06-dispatch-sms-history-filter.png` | 저장내역 mode select 기본값 | 기본값 `명시 저장만`, 자동/발송 감사/전체 필터 진입 확인 |
| `07-dispatch-sms-restore-mask.png` | 저장내역 row 복원 | 내부 UUID 비노출, 작성자 `사용자` 마스킹, 복원 배너 확인 |

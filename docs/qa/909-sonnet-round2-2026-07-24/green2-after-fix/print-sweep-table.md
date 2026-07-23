| 요소 | 분류 | 인쇄 미디어 표시 | 레이아웃 밀어냄 | 비고 |
|---|---|---|---|---|
| PushPermissionDeniedToast | 토스트 | X(정상) | X(정상) | position=fixed · no-print 적용됨 · 대조군1p=실험군1p |
| Modal(recommend, design-system 공용 — ds-modal-backdrop 표적) | 모달 | X(정상) | X(정상) | backdrop display=none · 대조군1p=실험군1p · global.css(desktop 전용) [data-testid='ds-modal-backdrop']{display:none} 적용 — design-system 미수정 |
| app-version-minor-banner | 배너 | X(정상) | X(정상) | position=fixed · no-print 적용됨 · 대조군1p=실험군1p |
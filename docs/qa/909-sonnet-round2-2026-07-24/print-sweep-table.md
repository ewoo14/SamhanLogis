| 요소 | 분류 | 인쇄 미디어 표시(기대) | 레이아웃/페이지수 영향 | 비고 |
|---|---|---|---|---|
| 사이드바 | 사이드바/헤더/오버레이 | 숨김(기대:숨김) X(정상) | X(정상) | display=none |
| 헤더 | 사이드바/헤더/오버레이 | 숨김(기대:숨김) X(정상) | X(정상) | display=none |
| 드로어 백드롭 | 사이드바/헤더/오버레이 | 숨김(기대:숨김) X(정상) | X(정상) | display=none |
| PushPermissionDeniedToast | 토스트 | 숨김(기대:숨김) X(정상) | X(정상) | position=fixed · no-print 적용됨 · 대조군1p=실험군1p |
| Modal(recommend, design-system 공용 — ds-modal-backdrop 표적) | 모달 | 숨김(기대:숨김) X(정상) | X(정상) | backdrop display=none · 대조군1p=실험군1p · :has([data-testid='app-version-recommend-modal']) 로 표적(PM 반증 후 정정 — 블랭킷 아님) · SlipDetailModal 등 문서 미리보기 모달은 U-3 로 별도 확인, 인쇄 보존됨 · design-system 미수정 |
| app-version-minor-banner | 배너 | 숨김(기대:숨김) X(정상) | X(정상) | position=fixed · no-print 적용됨 · 대조군1p=실험군1p |
| SlipDetailModal(배차보드 전표 미리보기 — DispatchDocument 실제 인쇄 문서 포함) | 모달(문서 미리보기) | 표시됨(기대:표시) X(정상) | X(정상) | backdrop display=flex(의도적으로 안 숨김) · .dispatch-page 표시=true · PDF 1p — U-3: 인쇄 대상 보존 확인(:has() 표적이 이 모달과 매치되지 않음) |
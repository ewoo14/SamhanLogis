# SP-10-2 인성데이타 퀵프로그램 — 알림톡 발송 결과 row UX

**슬라이스**: SP-10-2 인성데이타 퀵프로그램 vendor 통합  
**작성일**: 2026-05-19  
**Designer**: UI/UX Designer agent  
**인용**: `docs/planning/2026-05-19_sp-10-2-insung-quick-program.md` §3 FE-3  
**FE 인용 컴포넌트**: `clients/arologis-desktop/src/renderer/routes/dispatches/DispatchDetailPage.tsx` 갱신 (FE-3)

---

## 1. 알림톡 row 배치 — DispatchDetailPage vehicle row 하단

```
DispatchDetailPage — vehicle row + 알림톡 row 레이아웃
─────────────────────────────────────────────────────────────────────
[ 차량 1 ]   1.5t  서울 → 광주 (정차 3)     [VehicleMatchStatusBadge: ASSIGNED]
             ── 정차 1 ─ 거래처A / 서울 강남구 ...
             ── 정차 2 ─ ...
             ── 정차 3 ─ ...
             ┌──────────────────────────────────────────────────────┐
             │ 알림 발송 결과                                          │  ← 섹션 라벨 (12px, neutral-500)
             │ [인성 알림톡] 성공  14:32  010-XXXX-1234  [✓]         │
             │ [Aligo SMS]  성공  14:32  010-XXXX-1234  [✓]         │
             └──────────────────────────────────────────────────────┘

[ 차량 2 ]   1t    서울 → 부산 (정차 2)     [VehicleMatchStatusBadge: PENDING]
             ...
─────────────────────────────────────────────────────────────────────
```

- 알림톡 row 섹션은 vehicle row 아래 `padding-left: 24px` 들여쓰기 (정차 list 와 시각 계층 동일)
- 섹션 라벨 "알림 발송 결과": `--font-size-xs` (12px), `--color-neutral-500`, `--font-weight-medium`
- 개별 row 높이: `--row-h` (40px) — 기존 design-system row 높이 token 준수

---

## 2. 3가지 발송 상태 row

### 2-1. 성공 (초록 체크)

```
┌─────────────────────────────────────────────────────────────────────┐
│ [인성 알림톡]  [✓ 발송 성공]  2026-05-19 14:32  010-XXXX-1234        │
│  badge        status chip    timestamp         masked phone          │
└─────────────────────────────────────────────────────────────────────┘
```

| 요소 | 토큰 / 값 | 비고 |
|---|---|---|
| `[인성 알림톡]` 채널 뱃지 | bg `--color-insung-50` / text `--color-insung-text` / border `--color-insung-200` | pill shape, 11px 700 |
| `[✓ 발송 성공]` status chip | bg `--color-success-50` / text `--color-success-700` / icon `CheckCircle2` `--color-success-500` | 13px |
| timestamp | `--color-neutral-500` `--font-size-xs` | HH:mm (당일) / YYYY-MM-DD HH:mm (타일) |
| 수신자 번호 | `--color-neutral-600` `--font-size-xs` `--font-family-mono` | 마스킹 형식 §4 참조 |
| row 배경 | `--color-neutral-0` (white) | hover: `--surface-hover` (#F4F6F8) |

### 2-2. 실패 (빨간 X + 사유)

```
┌─────────────────────────────────────────────────────────────────────┐
│ [인성 알림톡]  [✗ 발송 실패]  2026-05-19 14:33  010-XXXX-1234        │
│                사유: 수신자 번호 오류 (E_INVALID_PHONE)               │  ← 사유 서브텍스트
└─────────────────────────────────────────────────────────────────────┘
```

| 요소 | 토큰 / 값 | 비고 |
|---|---|---|
| `[✗ 발송 실패]` status chip | bg `--color-danger-50` (#FFF1F1) / text `--color-danger-700` (#991B1B) / icon `XCircle` `--color-danger-500` | 13px |
| 사유 서브텍스트 | `--color-danger-600` `--font-size-xs` | API 반환 오류 코드 그대로 표시 |
| row 배경 | `--color-danger-50` (#FFF1F1) tint | 성공 row 와 시각 구분 강조 |
| 재발송 버튼 (선택) | `--color-brand-500` text button | "재발송" — 운영자 요청 시 W10-3 에서 추가 가능 |

사유 표시 정책:
- BE 반환 오류 코드 (`errorCode`) 그대로 노출 허용 (admin 화면 — 운영자 대상)
- 단, API 인증 정보/키 관련 오류(`INSUNG_QUICK_NOT_CONFIGURED` 등)는 "설정 오류 — 관리자 문의" 로 치환

### 2-3. 지연 (노랑 시계)

```
┌─────────────────────────────────────────────────────────────────────┐
│ [Aligo SMS]    [⏱ 발송 지연]  2026-05-19 14:32  010-XXXX-1234       │
│                응답 대기 중 (최대 30초 후 자동 재시도)                 │
└─────────────────────────────────────────────────────────────────────┘
```

| 요소 | 토큰 / 값 | 비고 |
|---|---|---|
| `[Aligo SMS]` 채널 뱃지 | bg `--color-aligo-50` / text `--color-aligo-text` / border `--color-aligo-200` | SP-09-2 패턴 일관 |
| `[⏱ 발송 지연]` status chip | bg `--color-warning-50` / text `--color-warning-700` / icon `Clock` `--color-warning-500` | 13px |
| 서브텍스트 | `--color-warning-700` `--font-size-xs` | "응답 대기 중 (최대 30초 후 자동 재시도)" |
| row 배경 | `--color-warning-50` (#FEF6E7) tint | 주의 상태 강조 |

---

## 3. channel 라벨 목록

| channel 키 | 라벨 표기 | 뱃지 토큰 |
|---|---|---|
| `insung-talk` | **인성 알림톡** | `--color-insung-*` (SP-10-2 신규) |
| `aligo` | **Aligo SMS** | `--color-aligo-*` (SP-09-2 기존) |

- `samhan.arologis.notify.dispatch-channel=insung-talk` → "인성 알림톡" row 표시
- `samhan.arologis.notify.invite-channel=aligo` → "Aligo SMS" row 표시
- 두 channel 모두 표시 가능 (배차 단계 + 기사 invite 분리 — §7 도메인 매트릭스 일관)

---

## 4. 수신자 휴대번호 마스킹 규칙

형식: `010-XXXX-{마지막 4자리}`

예시:
- 원본: `01012345678` → 표시: `010-XXXX-5678`
- 원본: `010-1234-5678` → 표시: `010-XXXX-5678`
- 11자리 미만 번호: `***-XXXX-{마지막 4자리}` (비표준 번호 fallback)

마스킹 처리:
- **FE 단에서 처리** (BE 응답에 원본 번호 포함 가능, FE `maskPhone()` util 적용)
- UUID 비공개 원칙 준수 (feedback_uuid_no_user_visibility.md) — 개인정보 동일 원칙 확장 적용
- 로그/감사 목적으로 원본 번호는 BE 에만 보존

---

## 5. row 레이아웃 CSS 구조 가이드 (FE-3)

```
.notification-result-section
  └── .notification-result-row (× n)
        ├── .channel-badge          [인성 알림톡] / [Aligo SMS]
        ├── .status-chip            [✓ 발송 성공] / [✗ 발송 실패] / [⏱ 발송 지연]
        ├── .timestamp              14:32
        └── .masked-phone           010-XXXX-1234
```

레이아웃:
```
display: flex;
align-items: center;
gap: var(--space-2);   /* 8px */
padding: var(--space-1) var(--space-2);  /* 4px 8px */
min-height: var(--row-h);  /* 40px */
border-bottom: 1px solid var(--color-neutral-100);
```

---

## 6. QA 매핑 가드

| 발송 상태 | QA Playwright case | 검증 요소 |
|---|---|---|
| 인성 알림톡 성공 | `QA-3` `insung-notify-channel-separation.spec.ts` | channel 라벨 "인성 알림톡", `[✓ 발송 성공]` chip, `--color-success-50` bg, 마스킹 번호 패턴 `010-XXXX-\d{4}` |
| Aligo SMS 성공 | `QA-3` `insung-notify-channel-separation.spec.ts` | channel 라벨 "Aligo SMS", `--color-aligo-50` bg |
| 실패 row (사유 표시) | `QA-3` `insung-notify-channel-separation.spec.ts` | `[✗ 발송 실패]` chip, 사유 서브텍스트 non-empty, `--color-danger-50` row bg |
| 지연 row | `QA-3` `insung-notify-channel-separation.spec.ts` | `[⏱ 발송 지연]` chip, `--color-warning-50` row bg |

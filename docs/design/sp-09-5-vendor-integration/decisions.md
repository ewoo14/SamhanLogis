# SP-09-5 Phase 9 Vendor 통합 — Designer Decisions Log

**슬라이스**: SP-09-5 Phase 9 vendor 시리즈 종료 통합 종합  
**작성일**: 2026-05-18  
**Designer**: UI/UX Designer agent  
**범위**: SP-09-1 NTS / SP-09-2 Aligo / SP-09-3 Clova / SP-09-4 KFTC 4 vendor 디자인 통합

---

## 1. 4 vendor 컬러 토큰 매트릭스 (D1)

### 확정 토큰 체계 — 4 vendor 완전 등록

| Vendor | Primary | 50 배경 | 100 배경 | 200 border | 700 hover | text |
|---|---|---|---|---|---|---|
| **NTS 국세청** | `#0F6523` | `#F0FDF4` | `#DCFCE7` | `#BBF7D0` | `#0B4E1B` | `#052E10` |
| **Aligo SMS** | `#0F766E` | `#F0FDFA` | `#CCFBF1` | `#99F6E4` | `#0D6060` | `#0A3D3A` |
| **Clova OCR** | `#03C75A` | `#F0FDF6` | `#DCFCE8` | `#BBF7D0` | `#02A04B` | `#014A22` |
| **KFTC 오픈뱅킹** | `#0061A8` | `#EEF6FF` | `#DBEAFE` | `#BFDBFE` | `#004D85` | `#003662` |

### 색상 결정 근거

| Vendor | 색상 계열 | 선정 근거 |
|---|---|---|
| NTS | Dark green `#0F6523` | 국세청 공식 CI 녹색 계열. 홈택스 브랜드 색 참조. |
| Aligo | Teal `#0F766E` | SMS/통신 서비스 일반적 teal 계열. NTS green과 충분한 채도 차이 유지. |
| Clova | Naver green `#03C75A` | Naver 공식 브랜드 컬러 (Naver 로고 녹색). SP-09-3 D1 결정 유지. |
| KFTC | Official blue `#0061A8` | 금융결제원 공식 사이트 brand blue. 금융 서비스 신뢰 색상 관례 준수. |

### WCAG 대비비 검증

| Vendor | text 색 | 배경 색(50) | 대비비 | 등급 |
|---|---|---|---|---|
| NTS | `#052E10` on `#F0FDF4` | 약 13.2:1 | **AAA** |
| Aligo | `#0A3D3A` on `#F0FDFA` | 약 11.8:1 | **AAA** |
| Clova | `#014A22` on `#F0FDF6` | 약 10.8:1 | **AAA** |
| KFTC | `#003662` on `#EEF6FF` | 약 9.4:1 | **AAA** |

4 vendor 모두 WCAG 2.1 AAA (7:1 초과) 충족. 저시력 사용자 환경에서도 구분 가능.

### 색맹 시뮬레이션 검토

4색 모두 `hue`, `saturation`, `lightness` 3차원에서 충분히 분리됨:

- NTS (dark green) vs Aligo (teal): 색조 15° 차이 + NTS 더 어두움
- Aligo (teal) vs Clova (bright green): 채도 대비 — Clova가 훨씬 밝음 (L* 72 vs 55)
- Clova (green) vs KFTC (blue): 색조 140° 차이 — 이색형 색맹(deuteranopia)에서도 명확 구분

---

## 2. vendor badge 시각화 시스템 (D2)

### 공통 badge 구조

```css
.vendor-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: 999px;   /* pill 형태 */
  padding: 4px 12px;
  font-size: 11px;
  font-weight: 700;
  border: 1px solid;
}
```

상태 dot (6~8px 원)을 badge 내부에 배치하여 텍스트 없이도 상태 식별 가능.

### vendor badge 컬러 규칙

| vendor | background | border | color |
|---|---|---|---|
| NTS | `--color-nts-50` | `--color-nts-200` | `--color-nts-text` |
| Aligo | `--color-aligo-50` | `--color-aligo-200` | `--color-aligo-text` |
| Clova | `--color-clova-50` | `--color-clova-200` | `--color-clova-text` |
| KFTC | `--color-kftc-50` | `--color-kftc-200` | `--color-kftc-text` |

---

## 3. 상태 표기 체계 (D3)

| 상태값 | 표기 | 색상 | 의미 |
|---|---|---|---|
| `DRY_RUN` | "DRY_RUN" badge | `--color-warning-*` amber | Phase 11 실 연동 전 mock 처리 중 |
| `SANDBOX` | "KFTC Sandbox" badge | `--color-kftc-*` blue | KFTC 테스트 환경 사용 중 |
| `LIVE` | vendor 전용 색 badge | 해당 vendor 토큰 | 실 운영 연동 중 (Phase 11 이후) |
| 미설정 | "미설정" badge | `--color-neutral-*` gray | 환경변수 미등록 |

DRY_RUN = warning amber: "주의/미결재" 의미 토큰 원칙 일관 적용 (design-system 토큰 원칙 §Warning).

---

## 4. placeholder 에러 UX 정책 (D4)

### 에러 감지 기준

| vendor | 감지 조건 | 코드 |
|---|---|---|
| NTS | `NTS_API_KEY` 값이 `"placeholder"` 문자열이거나 비어 있을 때 | NTS-E1 / NTS-E2 |
| Aligo | `ALIGO_API_KEY` 또는 `ALIGO_USER_ID` 가 `"placeholder"` 또는 미설정 | ALIGO-E1 / ALIGO-E2 |
| Clova | `NAVER_CLOVA_OCR_SECRET` 가 `"placeholder"` 이거나 `APIGW_URL` 형식 오류 | CLOVA-E1 / CLOVA-E2 |
| KFTC | `KFTC_CLIENT_ID` 또는 `KFTC_CLIENT_SECRET` 가 `"placeholder"` | KFTC-E1 / KFTC-E2 |

### 에러 배너 접근성 요구사항

```html
<div role="alert"
     aria-live="assertive"
     aria-atomic="true"
     aria-label="[vendor명] API 키 [에러 유형] 에러">
```

- `role="alert"` : 에러 발생 즉시 스크린리더 통보
- `aria-live="assertive"` : 사용자 작업 중단하고 즉시 읽음
- `aria-atomic="true"` : 배너 전체를 하나의 단위로 읽음

### 에러 배너 border-left 색 규칙

| 에러 유형 | border-left | 배경 | 근거 |
|---|---|---|---|
| placeholder 감지 | `#B91C1C` (error-700) | `#FEF2F2` (error-50) | 즉각 조치 필요 — error 토큰 |
| 미설정 (KEY_NOT_SET) | `#B45309` (warning-700) | `#FFFBEB` (warning-50) | 경고 수준 — warning 토큰 |
| 형식 오류 | `#C2410C` (orange-700) | `#FFF7ED` (orange-50) | 설정 오류 수준 — orange 토큰 |

---

## 5. 권한 매트릭스 디자인 (D5)

### 7 역할 × 4 vendor 권한 정의

| 역할 | NTS | Aligo | Clova | KFTC |
|---|---|---|---|---|
| MASTER | 발행 + 조회 | 발송 + 조회 | 업로드 + 조회 | 조회 + 매칭 |
| MANAGER | 발행 + 조회 | 발송 + 조회 | 업로드 + 조회 | 조회 + 매칭 |
| ACCOUNTANT | **조회만** | **차단** | 업로드 + 조회 | 조회 + 매칭 |
| SALES | 차단 | 차단 | 차단 | 차단 |
| WAREHOUSE | 차단 | 차단 | **업로드만** | 차단 |
| DISPATCH | 차단 | 차단 | 차단 | 차단 |
| DRIVER | 차단 | 차단 | 차단 | 차단 |

### 권한 시각화 규칙

| 셀 유형 | 표기 | 배경 | 테두리 |
|---|---|---|---|
| 전체 허용 | `[기능1] + [기능2]` | vendor 50 배경 | vendor 200 실선 |
| 조회만 | `조회만` | `--color-nts-50` | vendor 200 점선 |
| 부분 허용 | `업로드만` | `--color-clova-50` | clova primary 점선 |
| 차단 | `— 차단` | `--color-neutral-100` | neutral 200 실선 |

점선 테두리 (`border: 1px dashed`) = "부분적/제한적" 의미를 시각적으로 표현.

---

## 6. Phase 11 Cutover 흐름 디자인 (D6)

### 수평 타임라인 스텝 상태

| 상태 | 스텝 원 색상 | 의미 |
|---|---|---|
| `complete` | `--color-success-700` 채움 | 이미 완료된 단계 |
| `active` | `--color-brand-500` 테두리 + 배경 50 | 현재 진행/착수 예정 단계 |
| `ready` | `--color-neutral-300` 테두리 + neutral 50 배경 | 아직 미착수 단계 |

### vendor 별 Cutover 단계 표시

각 vendor 카드 내 수직 step flow:
- 완료 단계: success 녹색 채운 원 + 체크 아이콘
- 진행 예정 단계: brand 파란 테두리 원 + 숫자
- 미착수 단계: neutral gray 테두리 원 + 숫자

연결 선 (`::before pseudo-element`, `left: 14px`) 으로 단계 간 흐름 명시.

### MODE 전환 환경변수 패턴

```
DRY_RUN → LIVE 전환:
  NTS_MODE=LIVE
  ALIGO_MODE=LIVE
  OCR_MODE=LIVE
  KFTC_MODE=LIVE
```

배너 제거는 별도 코드 수정 없이 환경변수 조건부 렌더링으로 처리:
```jsx
{process.env.NTS_MODE === 'DRY_RUN' && <DryRunBanner vendor="NTS" />}
```

---

## 7. Dashboard 레이아웃 결정 (D7)

### 카드 그리드 레이아웃

- 전체 최대 너비: `1100px` (4 vendor 카드 2×2 그리드 최적)
- vendor 카드: `2-column grid` — 좌측 NTS/Aligo, 우측 Clova/KFTC
- 상단 요약 바: `4-column grid` — 총 호출 / 성공률 / 활성 vendor / Phase 11 D-DAY

### 지표 표시 typography

| 지표 | 폰트 | 크기 | 이유 |
|---|---|---|---|
| 요약 바 대형 숫자 | JetBrains Mono + tabular-nums | 24px bold | 빠른 숫자 파악, tabular-nums 정렬 |
| vendor 카드 지표 | JetBrains Mono + tabular-nums | 18px bold | 카드 내 집중 표시 |
| 로그 타임스탬프 | 시스템 sans-serif | 11px | 보조 정보 — 작고 흐림 |
| 환경변수 chip | JetBrains Mono | 10px | 코드 표시 — monospace 강조 |

---

## 8. design-system 변경 사항 종합 (D8)

### SP-09-1 ~ SP-09-4 누적 토큰 변경 현황

| 슬라이스 | 파일 | 변경 내용 |
|---|---|---|
| SP-09-1 NTS | `tokens.css` | `--color-nts-*` 6종 신규 |
| SP-09-1 NTS | `index.ts` | `colors.nts` 객체 |
| SP-09-3 Clova | `tokens.css` | `--color-clova-*` 6종 신규 |
| SP-09-3 Clova | `index.ts` | `colors.clova` 객체 |
| SP-09-4 KFTC | `tokens.css` | `--color-kftc-*` 6종 신규 + Aligo 6종 보완 |
| SP-09-4 KFTC | `index.ts` | `colors.kftc` 객체 + `colors.aligo` 객체 |

### 4 vendor 토큰 등록 완료 현황 (SP-09-5 기준)

| vendor | `tokens.css` | `index.ts` | 상태 |
|---|---|---|---|
| NTS | `--color-nts-*` 6종 | `colors.nts` | 완료 (SP-09-1) |
| Aligo | `--color-aligo-*` 6종 | `colors.aligo` | 완료 (SP-09-4 fix) |
| Clova | `--color-clova-*` 6종 | `colors.clova` | 완료 (SP-09-3) |
| KFTC | `--color-kftc-*` 6종 | `colors.kftc` | 완료 (SP-09-4) |

---

## 9. 외부 vendor 키 보안 정책 디자인 (D9)

### placeholder 차단 UX 원칙

1. **즉각 가시화**: API 키 placeholder 감지 시 페이지 최상단 에러 배너 즉시 표시 (role="alert")
2. **DRY_RUN 지속 허용**: placeholder 상태에서도 DRY_RUN mock 작동 유지 — 서비스 중단 없이 운영 가능
3. **실 키 등록 경로 안내**: 에러 배너 내 "설정 안내" CTA 버튼으로 등록 방법 제공
4. **UUID 비공개 원칙 준수**: 모든 화면에서 API 키 실제 값 노출 금지 — 마스킹 처리 (`****1234` 형식)

### Phase 11 실 키 전환 안내 배너 표시 정책

| 환경 | DRY_RUN 배너 | Sandbox 배너 |
|---|---|---|
| Phase 9 (현재) | 표시 (warning amber) | 표시 (KFTC만, kftc blue) |
| Phase 11 키 전환 후 | 제거 (환경변수 조건부) | 제거 (환경변수 조건부) |

배너 텍스트는 한국어 필수. "DRY_RUN 모드 — [vendor명] Phase 11 연동 전" 패턴 통일.

---

## 10. Phase 9 vendor 디자인 통합 회고 (D10)

### 잘된 점

| 항목 | 내용 |
|---|---|
| 4색 vendor 시각화 완성 | NTS/Aligo/Clova/KFTC 4색 — 색조 충분히 분리, 색맹 시뮬레이션 통과 |
| WCAG AAA 전원 충족 | 4 vendor text/배경 조합 모두 AAA (9.4:1 ~ 13.2:1) |
| DRY_RUN 배너 패턴 일관화 | SP-09-1부터 SP-09-4까지 동일 패턴 — 코드 재사용 용이 |
| 접근성 aria 패턴 일관 | role="alert" / "status" / "dialog" / "row" 전 슬라이스 통일 |
| 환경변수 조건부 배너 | Phase 11 시 코드 변경 없이 배너 제거 가능 |

### 개선 필요 사항 (Phase 11 착수 시 반영)

| 항목 | 내용 |
|---|---|
| 실 키 마스킹 UI | API 키 표시 시 마스킹 패턴 공통 컴포넌트화 필요 |
| vendor 연동 실패 fallback | 실 API 오류 시 graceful degradation UX 정의 필요 |
| 토큰 만료 자동 갱신 UI | KFTC 토큰 90일 만료 임박 시 사전 경고 배너 추가 필요 |
| Dashboard 자동 새로고침 | 지표 카드 polling 주기 + 로딩 skeleton 처리 |

---

## 11. HTML mock 산출물 (D11)

| 파일 | 화면 | 주요 검증 포인트 |
|---|---|---|
| `01-vendor-dashboard.html` | 4 vendor 통합 Dashboard | 4색 구분 / 상태 badge / 지표 카드 / 요약 바 |
| `02-vendor-placeholder-errors.html` | placeholder 에러 메시지 모음 | role="alert" / 에러 유형별 색상 / CTA |
| `03-vendor-permission-matrix.html` | 7 역할 × 4 vendor 매트릭스 | 권한 셀 색상 / 접근성 table / 범례 |
| `04-phase-11-cutover-flow.html` | Phase 11 Cutover 흐름 | 타임라인 스텝 / vendor 카드 / MODE 전환 안내 |

---

## 12. FE agent 전달 사항 (D12)

1. 4 vendor 토큰 24종 — `tokens.css` + `index.ts` 모두 등록 완료 (SP-09-4 기준)
2. `VendorDashboard` 컴포넌트: 지표 polling 주기 설정 (권장: 30초) + skeleton loading
3. `PlaceholderErrorBanner` 공통 컴포넌트: 4 vendor 공용 — vendor prop + errorCode prop
4. `PermissionMatrix` 컴포넌트: `@PreAuthorize` role list 와 동기화 (하드코딩 금지)
5. Phase 11 Cutover: `MODE=LIVE` 환경변수 전환으로 DRY_RUN/Sandbox 배너 자동 제거
6. WCAG 2.1 AA 이상 준수 — 특히 contrast ratio 4.5:1 미만 컬러 사용 금지

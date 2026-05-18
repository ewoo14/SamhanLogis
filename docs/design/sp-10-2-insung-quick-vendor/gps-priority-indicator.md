# SP-10-2 인성데이타 퀵프로그램 — GPS 하이브리드 우선순위 표시

**슬라이스**: SP-10-2 인성데이타 퀵프로그램 vendor 통합  
**작성일**: 2026-05-19  
**Designer**: UI/UX Designer agent  
**인용**: `docs/planning/2026-05-19_sp-10-2-insung-quick-program.md` §7 `samhan.arologis.gps.priority`  
**FE 인용 컴포넌트**: `clients/arologis-desktop/src/renderer/components/InsungLbsPanel.tsx` (FE-2 신규 산출)

---

## 1. GPS source 우선순위 정의

| 순위 | source 키 | 한국어 라벨 | 설명 |
|---|---|---|---|
| 1 | `EXTERNAL_INSUNG_LBS` | **인성 LBS** | 인성데이타 퀵프로그램 vendor LBS 위치 (가장 정확, 실시간) |
| 2 | `APP_GPS_ACTIVE` | **앱 GPS (활성)** | mobile-staff 앱 포그라운드 GPS |
| 3 | `APP_GPS_BACKGROUND` | **앱 GPS (백그라운드)** | mobile-staff 앱 백그라운드 GPS (배터리 절약) |
| 4 | `MANUAL` | **수동 입력** | 관리자/기사 수동 위치 입력 |

우선순위 적용 규칙 (`samhan.arologis.gps.priority=insung-lbs,app-gps,manual` comma-list 순서):
- 1순위 source 가 `stale` (60초 초과) 이면 2순위로 자동 fallback
- MANUAL 은 fallback 없음 (최하위 단일 입력)

---

## 2. GPS 우선순위 패널 ASCII mock

```
InsungLbsPanel — DispatchDetailPage vehicle row 우측 패널
─────────────────────────────────────────────────────────────
  GPS 위치 소스
  ─────────────────────────────────────────────────────────
  [1] 인성 LBS          ●  37.5665, 126.9780   14:32:18  ← 활성 (bold + brand 색)
  [2] 앱 GPS (활성)     ○  37.5662, 126.9775   14:32:05  ← muted
  [3] 앱 GPS (백그라운드) ○  37.5660, 126.9772   14:30:01  ← muted (stale 경고 가능)
  [4] 수동 입력          ○  —                    —         ← muted (미입력)
  ─────────────────────────────────────────────────────────
  활성 소스: 인성 LBS | 마지막 수신: 14:32:18 (2초 전)
─────────────────────────────────────────────────────────────
```

패널 위치: vehicle row 아래, `VehicleMatchStatusBadge` = ASSIGNED 또는 DELIVERED 상태일 때만 표시  
패널 배경: `--surface-subtle` (#F4F6F8)  
패널 border: `1px solid var(--color-neutral-200)`, `--radius-md` (4px)  
패널 padding: `--space-3` (12px)

---

## 3. 활성/비활성 source row 시각 규칙

### 3-1. 활성 source (current active)

| 요소 | 토큰 / 값 | 비고 |
|---|---|---|
| 순위 숫자 `[1]` | `--color-brand-700` `--font-weight-bold` `--font-size-sm` | bold 강조 |
| source 라벨 | `--color-brand-700` `--font-weight-semibold` `--font-size-sm` | "인성 LBS" |
| 활성 dot `●` | `--color-success-500` (#10b981) | 6px 원, CSS `border-radius: 50%` |
| 좌표 | `--color-neutral-700` `--font-family-mono` `--font-size-xs` | tabular-nums |
| timestamp | `--color-neutral-600` `--font-size-xs` | HH:mm:ss |
| row 배경 | `--color-brand-50` + `border-left: 3px solid var(--color-brand-500)` | 활성 row 강조 |

### 3-2. 비활성 source (muted)

| 요소 | 토큰 / 값 | 비고 |
|---|---|---|
| 순위 숫자 `[2]~[4]` | `--color-neutral-400` `--font-weight-regular` `--font-size-sm` | muted |
| source 라벨 | `--color-neutral-400` `--font-weight-regular` `--font-size-sm` | 앱 GPS (활성) |
| 비활성 dot `○` | `--color-neutral-300` | 6px 빈 원 (border only) |
| 좌표 | `--color-neutral-400` `--font-family-mono` `--font-size-xs` | muted |
| timestamp | `--color-neutral-300` `--font-size-xs` | muted |
| row 배경 | `--color-neutral-0` (white) | 강조 없음 |

### 3-3. stale source (60초 초과 미수신)

| 조건 | 시각 변화 | 토큰 |
|---|---|---|
| stale threshold = 60초 | timestamp 색상 → `--color-warning-500` + `⚠` 아이콘 | `--color-warning-500` |
| stale 아이콘 | `AlertCircle` (Lucide) 14px | `--color-warning-400` |
| stale 서브텍스트 | "최근 수신 N초 전 (데이터 오래됨)" | `--color-warning-700` `--font-size-xs` |

stale 판정 기준: `현재시각 - lastReceivedAt > 60,000ms`  
BE: `samhan.arologis.gps.priority` list 에서 stale source 는 자동 skip → 다음 순위 활성화

---

## 4. 활성 source 요약 footer

패널 하단 footer row:

```
활성 소스: [인성 LBS]  |  마지막 수신: 14:32:18 (2초 전)
```

| 요소 | 토큰 / 값 |
|---|---|
| "활성 소스:" 라벨 | `--color-neutral-500` `--font-size-xs` |
| source 이름 | `--color-brand-700` `--font-weight-semibold` `--font-size-xs` |
| "|" 구분자 | `--color-neutral-300` |
| "마지막 수신:" 라벨 | `--color-neutral-500` `--font-size-xs` |
| timestamp | `--color-neutral-700` `--font-family-mono` `--font-size-xs` |
| "(N초 전)" 경과 | `--color-neutral-400` `--font-size-xs` | 실시간 갱신 (1초 interval) |

---

## 5. source 별 아이콘

| source | Lucide 아이콘 | 크기 | 색상 |
|---|---|---|---|
| `EXTERNAL_INSUNG_LBS` | `Satellite` | 14px | 활성: `--color-brand-500` / muted: `--color-neutral-300` |
| `APP_GPS_ACTIVE` | `Navigation` | 14px | 활성: `--color-brand-500` / muted: `--color-neutral-300` |
| `APP_GPS_BACKGROUND` | `NavigationOff` | 14px | 활성: `--color-brand-400` / muted: `--color-neutral-300` |
| `MANUAL` | `MapPin` | 14px | 활성: `--color-brand-400` / muted: `--color-neutral-300` |

---

## 6. stale fallback 전이 시각화

fallback 발생 시 패널 내 트랜지션:

```
1순위 (stale 60초 초과) → 경고 표시 → 2순위 활성화
  └── 1순위 row: timestamp ⚠ 경고 색 → 비활성 row 전환 (0.28s ease)
  └── 2순위 row: muted → 활성 row 전환 (0.28s ease, --duration-slow)
  └── footer 요약: source 이름 변경 (인성 LBS → 앱 GPS (활성))
```

CSS transition: `transition: background-color var(--duration-slow), color var(--duration-slow)`

---

## 7. 패널 표시 조건 (FE-2)

| 조건 | 표시 여부 |
|---|---|
| Vehicle.status = PENDING | 비표시 (기사 미배정, GPS 無) |
| Vehicle.status = MATCHING | 비표시 (매칭 진행 중, GPS 아직 無) |
| Vehicle.status = ASSIGNED | 표시 (기사 배정 완료, LBS 수신 시작) |
| Vehicle.status = DELIVERED | 표시 (완료 후에도 최종 위치 보존 표시) |
| `DriverLocation` 응답 empty | 표시 + "위치 정보 없음" 메시지 (`--color-neutral-400`) |

---

## 8. QA 매핑 가드

| GPS 시나리오 | QA Playwright case | 검증 요소 |
|---|---|---|
| INSUNG_LBS 활성, APP_GPS 수신 | `QA-4` `insung-gps-priority.spec.ts` | `[1] 인성 LBS` row bold + `--color-brand-50` bg, `[2] 앱 GPS` row muted |
| APP_GPS 활성 (insung-lbs stale) | `QA-4` `insung-gps-priority.spec.ts` | `[1]` timestamp `⚠` 경고, `[2]` row 활성 전환, footer "앱 GPS (활성)" |
| MANUAL 활성 (모든 GPS stale) | `QA-4` `insung-gps-priority.spec.ts` | `[4] 수동 입력` row 활성, `MapPin` 아이콘 `--color-brand-400` |
| `DriverLocation` empty | `QA-4` `insung-gps-priority.spec.ts` | "위치 정보 없음" 텍스트 표시, 패널 표시 유지 |

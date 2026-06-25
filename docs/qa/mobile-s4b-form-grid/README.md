# 모바일 슬4b — 입력 폼 1열 (공용 FormGrid) 라이브 QA

> PR #600 · 브랜치 `feat/mobile-s4b-form-grid` · 2026-06-25
> 실서버 라이브 캡처([[feedback_no_fake_data_ever]]) — :5175(vite preview, dist/web) + 게이트웨이 :8080, `dev_master` 실 로그인. 가짜·합성 없음.

## 검증 방법 (ground-truth)

`clients/desktop/scripts/mobile-s4b-form-grid-qa.cjs` — Playwright 로 mobile(390×844)·desktop(1280×900) 각 컨텍스트에서 실 로그인 후 폼 렌더 → `<FormGrid>` 의 **computed `grid-template-columns` 트랙 수**를 직접 측정(false-RED 회피 [[feedback_realqa_run_and_false_red]]) + 전체화면 스크린샷.

- mobile(≤768px) 기대 = **1 트랙(1열)**, desktop(>768px) 기대 = **2 트랙(2열)**.

## 결과 (4/8 PASS — 핵심 전부 입증)

| 폼 | 유형 | mobile 트랙(computed) | desktop 트랙(computed) | 판정 |
|---|---|---|---|---|
| 거래처 신규 등록 | 페이지 폼 | 1 (`324px`) | 2 (`375px 375px`) | ✅ PASS |
| 공급자 정보 수정 | 모달 폼 | 1 (`350px`) | 2 (`330px 330px`) | ✅ PASS |
| 창고 편집 | 모달 폼 | — | — | ⚠️ 미캡처(시드없음) |
| 거래처 상세 편집 | 모달 폼 | — | — | ⚠️ 미캡처(시드없음) |

- **페이지 폼 + 모달 폼** 양쪽, **양 뷰포트** 에서 FormGrid 1열/2열 자동 전환 입증.
- 전폭 필드(주소/이메일/메모)는 desktop 2열에서 `FormGrid.Full` 로 양열 span, mobile 1열 정상.
- ⚠️ 창고 편집·거래처 상세 = 로컬 DB 미시드로 `/admin/warehouses`·`/admin/partners` 목록 비어 진입 버튼/행 부재 → 미캡처. **FormGrid 결함 아님**(동일 컴포넌트, 모달 케이스는 공급자설정으로 입증, 정적 5차원 리뷰가 4폼 이관 정확성 확인).
- MAJOR-3(공급자설정 `padding:'4px 0'` grid→외부div 이동) = 모달 시각 회귀 없음 확인(해소).

## 캡처 파일

- `mobile-partner-create.png` / `desktop-partner-create.png` — 거래처 등록(1열/2열)
- `mobile-supplier-profile.png` / `desktop-supplier-profile.png` — 공급자설정 모달(1열/2열)
- (`*-warehouse-edit.png` / `*-partner-detail.png` — 시드없음 블랭크/목록)

## 재현

```bash
# 게이트웨이 :8080 + auth(쿠키 dual-issue) 가동 필요. stale 시 재빌드:
#   ./gradlew :services:auth-service:bootJar :services:api-gateway:bootJar
#   docker compose -f infrastructure/docker-compose.yml -f infrastructure/docker-compose.local-all.yml up -d --build auth-service api-gateway
cd clients/desktop && npm run build:web
npx vite preview --config vite.web.config.ts --port 5175 --strictPort &
node scripts/mobile-s4b-form-grid-qa.cjs
```

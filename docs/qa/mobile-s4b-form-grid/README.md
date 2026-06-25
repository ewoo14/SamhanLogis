# 모바일 슬4b — 입력 폼 1열 (공용 FormGrid) 라이브 QA

> PR #600 · 브랜치 `feat/mobile-s4b-form-grid` · 2026-06-25
> 실서버 라이브 캡처([[feedback_no_fake_data_ever]]) — :5175(vite preview, dist/web) + 게이트웨이 :8080, `dev_master` 실 로그인. 가짜·합성 없음.

## 검증 방법 (ground-truth)

`clients/desktop/scripts/mobile-s4b-form-grid-qa.cjs` — Playwright 로 mobile(390×844)·desktop(1280×900) 각 컨텍스트에서 실 로그인 후 폼 렌더 → `<FormGrid>` 의 **computed `grid-template-columns` 트랙 수**를 직접 측정(false-RED 회피 [[feedback_realqa_run_and_false_red]]) + 전체화면 스크린샷.

- mobile(≤768px) 기대 = **1 트랙(1열)**, desktop(>768px) 기대 = **2 트랙(2열)**.

## 결과 (6/8 PASS — 페이지 폼 + 모달 폼 2종, 양 뷰포트 입증)

| 폼 | 유형 | mobile 트랙(computed) | desktop 트랙(computed) | 판정 |
|---|---|---|---|---|
| 거래처 신규 등록 | 페이지 폼 | 1 (`324px`) | 2 (`375px 375px`) | ✅ PASS |
| 거래처 상세 편집 | 모달 폼(편집모드) | 1 (`324px`) | 2 (`319px 319px`) | ✅ PASS |
| 공급자 정보 수정 | 모달 폼 | 1 (`350px`) | 2 (`330px 330px`) | ✅ PASS |
| 창고 편집 | 모달 폼 | — | — | ⚠️ 미캡처(부서게이트 403, 슬4b 무관) |

- **페이지 폼 + 모달 폼(편집)** 양쪽, **양 뷰포트**에서 FormGrid 1열/2열 자동 전환 입증(거래처 등록·거래처 상세 편집·공급자 설정 **3폼**).
- 전폭 필드(주소/이메일/메모)는 desktop 2열에서 `FormGrid.Full` 로 양열 span, mobile 1열 정상.
- ⚠️ **창고 편집 = 미캡처(슬4b 코드 무관)**: `/admin/warehouses` 가 인사 부서 게이트(@RequireDepartment)로 **"대표실 부서 소속 + MASTER"** 만 허용 → dev_master(MASTER이나 대표실 미소속) **403** (실 스샷 `*-warehouse-edit.png` = 403 화면). EditWarehouseModal 의 FormGrid 이관은 정적 5차원 리뷰로 정확성 확인 + FormGrid 반응형은 동형 모달 2종(거래처 상세·공급자)으로 입증. 캡처하려면 대표실 부서 소속 계정 필요([[feedback_qa_docker_real_test]] "실연동 불가 시 캡처 불가+사유 정직 보고, 가짜 생성 금지").
- MAJOR-3(공급자설정 `padding:'4px 0'` grid→외부div 이동) = 모달 시각 회귀 없음 확인(해소).

## 캡처 파일

- `mobile-partner-create.png` / `desktop-partner-create.png` — 거래처 등록 페이지(1열/2열)
- `mobile-partner-detail.png` / `desktop-partner-detail.png` — 거래처 상세 편집 모달(1열/2열)
- `mobile-supplier-profile.png` / `desktop-supplier-profile.png` — 공급자설정 모달(1열/2열)
- `*-warehouse-edit.png` — 403 화면(부서게이트, 슬4b 무관)

## 재현

```bash
# 게이트웨이 :8080 + auth(쿠키 dual-issue) 가동 필요. stale 시 재빌드:
#   ./gradlew :services:auth-service:bootJar :services:api-gateway:bootJar
#   docker compose -f infrastructure/docker-compose.yml -f infrastructure/docker-compose.local-all.yml up -d --build auth-service api-gateway
cd clients/desktop && npm run build:web
npx vite preview --config vite.web.config.ts --port 5175 --strictPort &
node scripts/mobile-s4b-form-grid-qa.cjs
```

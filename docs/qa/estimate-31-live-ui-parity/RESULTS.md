# #31 종합견적서 라이브 UI 정합 — 실 QA 결과

- 일시: 2026-06-10 / branch `feat/31-estimate-live-ui-parity`
- 방법: estimate-app 을 **전부 실 환경**(실 Google Sheet SA key·실 MS 스택·실 Naver/Juso 키·실 user/dc-config/slip 서비스)으로 기동 후 Playwright 실 UI 캡처(`scripts/qa-capture-31.mjs`). 가짜 데이터·mock 0 — 캡처 4장 전부 실서버 렌더.

## UI 이식 — 라이브(06-09) diff 34 hunk → index.ejs

- `patch -F3` 전 hunk **무거부 적용**(offset만), index.ejs 19,181줄 = 라이브 19,182줄 정합.
- 잔차 472줄 전수 분류 = 기성 포팅 델타뿐(EJS 데이터 바인딩 11곳·RPC shim·폰트 인라인) — 라이브 내용 누락 0.
- 신규 심볼 전수 sweep: `runNaverLocalSearch`/`applyAddrToTarget`/`applyCustomerDiscounts`/`loadSnapshotByCustomer`/`getCurrentSlipSnapshot` 가드 포함 전부 존재. addrDock 중복 id 2개 = 라이브 동일(정합).

## 실 UI 캡처 (4장, `docs/qa/estimate-31-live-ui-parity/*.png`)

| 캡처 | 실증 |
|---|---|
| `01-auth-gate-pass.png` | **접속 게이트 통과** — `USER_AUTH.authorized=true`, 환영명 `[DEV-SEED] 개발마스터`(실 user-service by-email). 자동 로그아웃 **04:59:56**(라이브 3→5시간 변경 반영) |
| `02-addr-dock-results.png` | **네이버 주소 검색 dock** — 실 Naver 지역검색 결과 3건(도로명/지번 카드), 행 클릭 → `addrBase`에 '서울특별시 서초구 마방로2길 9 4층 삼한공조시스템' 반영 |
| `03-snapshot-by-customer.png` | **거래처명 조회 행**("※ 날짜 무관 최근 30건") — '삼한' 검색 → 실 저장건 `삼한공조(주) 강남지점` + 복원 버튼, 타 사용자 저장분 격리 확인 |
| `04-dc-autoapply.png` | **거래처 DC 자동적용** — 실 거래처 7,053건 중 **dc 부착 225건**, '주식회사 중앙유통' 선택 → `home_rate` 45→**48** 자동 반영 |

## 서버측 실 검증

- **주소검색**(실 외부 API): `searchNaverAddress('삼한공조')` → ok, 4건(local) / `'송파대로 28길 32'` → juso 1건(올림피아오피스텔). 키 미설정 시 graceful.
- **DC 벌크**: `GET /internal/partner-dc-configs` → **225건**(실 시드), `1588802571` → 0.48/100/CEIL.
- **by-customer**: 저장 201(한글 무결) → contains '삼한' hit → 타 userEmail 0건 격리.
- **by-email 게이트**: 200(`[DEV-SEED] 개발마스터`)/404(미등록)/403(무토큰) 3종.
- **갭 적발·해소**: 기존 `checkUserAuth` 가 JWT 계약(`/auth/me`)과 불일치 → 실 스택에서 **상시 미승인·페이지 차단 회귀**였음(실 QA가 적발). user-service `GET /internal/users/by-email` 신설로 해소.

## 테스트

- estimate-app jest **63/63 PASS**(주소 파서 5종·DC 벌크 맵·dc 부착·by-customer·checkUserAuth 신규).
- slip-service IT +1(by-customer contains/격리), user-service·dc-config-service 테스트 green. QA 잔여물 정리 완료(DELETE 2).

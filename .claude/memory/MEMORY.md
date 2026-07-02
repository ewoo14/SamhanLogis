# 🚨 워크플로우 규율 (매 작업 최우선 — 상세는 각 토픽파일)
- [🚨 표준 워크플로우 유일 진실원](feedback_canonical_workflow.md) — Opus 기획+조기PR → Codex 개발+게시 → (Opus 5-agent[FE/BE/Design/DevOps/QA·QA=Docker라이브QA+단계별스샷]+fix+게시 ↔ Codex 5-agent+fix+게시) 0수렴까지 → PM 종합(머지전) → CI green → 머지. 🚫순차(병렬금지)·단축금지·라운드 즉시게시·fix후 재리뷰·미준수 소급보완·매단계 ScheduleWakeup
- [🚨 리뷰 5-agent 필수·단축금지·순차](feedback_review_5agent_no_shortcut_strict.md) — 매 리뷰=5차원 전부(Design N/A금지)·수렴/재검도 full·Opus 완료+게시 후에만 Codex(병렬금지)·실행=게시 1:1 (2026-07-02 #699 회고)
- [🚨 라이브QA 매 라운드 GUI 스샷](feedback_live_qa_every_round_screenshots.md) — Docker 실서버+실 GUI 스크린샷(단계별) 매 리뷰 라운드마다. 끝1회·SSE/API 텍스트로 GUI스샷 대체 금지. dev_master=dev_p05_pass! (2026-07-02)
- [🚨 PM 직접구현 금지](feedback_pm_no_direct_implementation.md) — 구현=Codex, PM=기획·리뷰·commit대행·머지만. infra오류도 PM직접구현 대체 금지 (2026-07-02)
- [🚨 가짜 데이터·목업 영구 배제](feedback_no_fake_data_ever.md) — 실데이터·실서버·실화면·실측정만. QA스샷=실캡처만(합성/fixture 금지). 불가 시 정직 보고
- [🚨 도구 호출은 실제 invocation](feedback_emit_real_tool_calls.md) — 도구 호출을 텍스트로 적으면 미실행. 진짜 함수 호출+결과 확인. ScheduleWakeup 단독발행 시 실수 잦음
- [야간/장시간 ScheduleWakeup 재자각](feedback_autonomous_loop_schedulewakeup.md) — 매 단계(1~2묶음) 완료 후 다음 단계 예약·재자각·턴종료(연속 mega턴 금지). 부재/활성 무관
- [PR OPEN(≠DRAFT)](feedback_pr_open_not_draft.md) — 조기PR 포함 draft 금지, --draft 쓰지말것 (2026-07-02)
- [PM 자율 머지 위임](feedback_pm_auto_merge_authority.md) — 게이트(0수렴·CI green·mock gate·라이브QA) 충족 시 PM 자율 머지. main 직접 docs/memory push는 별개 가드
- [PM 권한코드 전권 자율](feedback_pm_permission_autonomy.md) — 권한 코드는 PM 머지까지 자율. 워크플로우 엄격+자가지적. 신규 업무규칙/정책만 개발책임자 확인
- [무결성도메인 정책 선확인](feedback_integrity_domain_policy_preconfirm.md) — 회계원장·감사·권한 편집가부 정책은 착수 전 개발책임자 확인 (2026-07-02)
- [개발책임자 결정은 PR에 누적 기록](feedback_post_devlead_decisions_to_pr.md) — 결정·지시·정정을 그때그때 "📌 개발책임자 결정 기록" 코멘트로. 채팅에만 두지말것
- [PM-Codex 진행 검증·10분 보고](feedback_pm_codex_progress_verification.md) — Codex 디스패치마다 산출물 즉시검증+주기 상태보고, 침묵금지 ([[feedback_pm_10min_status_report]])

# 커밋/PR/문서 규약
- [한국어 의무 — 커밋/PR/Issue/보고](feedback_korean_commits.md) — git commit·PR·Issue+대면 보고/대화/설명 한국어(prefix·trailer만 예외)
- [PR 스샷 인라인=커밋 SHA 고정 URL](feedback_pr_screenshot_sha_pinned_urls.md) — 브랜치경로+push직후 게시=camo 하양 캐시("모두 하얀 화면"). full SHA 경로+curl 200, 하양이면 PATCH로 URL 치환 (2026-07-02 #700)
- [PR 제목 [FEAT]/[FIX] 대괄호+대문자](feedback_pr_title_caps_bracket.md)
- [권한 표기 풀네임](feedback_role_naming_full.md) — MASTER/MANAGER 풀네임, 약어 금지
- [전표 용어 — 슬립 금지](feedback_jeonpyo_not_slip.md) — 한글 "전표"(슬립 금지), 영문 slipId는 별개
- [코멘트 용어 — 협업 코멘트 금지](feedback_comment_not_collab_comment.md) — 라벨 "코멘트", 영문 CollabComment 유지
- [UUID 사용자 비공개](feedback_uuid_no_user_visibility.md) — 화면 UUID 금지, 비즈니스 식별자만
- [문서 동기화 의무](feedback_continuous_docs_sync.md) — 매 PR에 README+ROADMAP+DECISIONS+각 README+dev-report, 별도 docs PR 금지
- [overview.html 동기화](feedback_samhan_public_overview_sync.md) — docs/samhan-public-overview.html 항시 동기화
- [함수 문서화 3-layer](feedback_function_documentation.md) — 한국어 Javadoc+springdoc+dev-reports 누적
- [Issue 자동 close](feedback_issue_close_after_pr.md) — PR에 `연관 Issue: #N`, 머지/close 후 즉시 close
- [GitGuardian PM 자동 처리](feedback_gitguardian_false_positive.md) — PM 자동 판정 후 머지
- [Monitor 자동 사용](feedback_monitor_no_permission.md) — CI watch 허락없이 즉시

# 개발환경/빌드 함정
- [Dev Environment](project_dev_environment.md) · [Build Conventions](project_build_conventions.md) — JDK17/Gradle/Docker, BaseEntity 7 audit+Soft Delete only
- [Korean Path JDK Trap](feedback_korean_path_jdk.md) — 한글경로 gradle test 실패→assemble
- [gradlew 실행권한](feedback_gradlew_exec_bit.md) — `git update-index --chmod=+x gradlew`
- [PowerShell UTF-8 트랩](feedback_powershell_utf8_writes.md) — body-file=Write/Edit/heredoc만, Set-Content 금지
- [Bash 커밋=−F 파일](feedback_bash_commit_message_file.md) — @'...'@ here-string 금지, Write→git commit -F
- [desktop 타입검증=npm run typecheck](feedback_desktop_typecheck_command.md)
- [Playwright 로컬 버전 skew](feedback_playwright_local_version_skew.md) — node_modules/.bin 직접·desktop cwd
- [rename file: junction 함정](feedback_rename_filedep_junction.md) — 루트 rename 시 design-system junction 깨짐→npm install
- [Testcontainers Windows Docker](feedback_testcontainers_windows_docker.md) — npipe skip 가능, DOCKER_HOST tcp 우회
- [로컬 스택+데스크톱 실QA 함정](project_local_stack_qa_gotchas.md) — launch=jar만 빌드(이미지 stale→`up -d --build <svc>`)·게이트웨이 격차·react-query invalidate stale
- [standalone-boot 실QA](feedback_standalone_boot_real_qa.md) — Windows IT skip 시 jar standalone+docker PG

# QA/테스트 규율
- [QA Docker 실서버 의무](feedback_qa_docker_real_test.md) — 실서버 테스트, code read PASS 금지, 미가용시 P2+CI fetch
- [실서버 점검=실사용자 UI 캡처](feedback_real_server_check_screenshot.md) — API JSON 아닌 실 데스크톱 화면(:8080·dev_master·mock OFF)
- [야간=라이브 Docker 캡처 미루지말것](feedback_overnight_live_capture.md) — 재빌드해서라도 라이브 캡처, CI IT 대체 금지
- [변경 모듈 전체 test 후 push](feedback_changed_module_full_test_before_push.md) — 타깃만 실행 push 금지
- [CI 테스트 필터 allowlist false-green](feedback_ci_test_filter_false_green.md) — ci.yml `--tests` allowlist 누락 패키지 미실행. 신규 패키지 등재 필수
- [stacked PR CI false-green](feedback_stacked_pr_ci_false_green.md) — base=feat/… BE 미트리거, base 머지 후 base=main 재생성
- [RestClient 계약테스트 false-green](feedback_restclient_contract_test_false_green.md) — 다운스트림 선검증, @MockBean 우회 금지, 4체크
- [권한 enforcement 실HTTP 회귀](feedback_enforcement_real_http_test.md) — @MockBean mock 시 false-green, MockRestServiceServer/실HTTP
- [IT 외부 RestClient @MockBean 의무](feedback_it_mockbean_external_clients.md) — 누락시 Eureka 비활성 500
- [PM 통합 풀빌드 가드](feedback_pm_integration_build_check.md) — 팀별 PR 전 BE+QA 컴파일·IT·의미정렬
- [결함 fix 계열 전수 sweep](feedback_defect_family_sweep_fix.md) — 지적 1건=동일패턴 전수 grep
- [마이그 fresh Postgres probe](feedback_migration_fresh_postgres_probe.md) — Windows skip 가림, DROP/CREATE+psql ON_ERROR_STOP
- [적용된 Flyway 마이그 불변](feedback_applied_migration_immutable.md) — 주석조차 수정금지(checksum), 신규 V만
- [enum 확장=CHECK 제약 마이그](feedback_enum_expansion_check_constraint.md)
- [self-invocation @Transactional 우회](feedback_self_invocation_transactional_bypass.md) — this.method 프록시우회, @Lazy self, HTTP 실경로 검증
- [catch DIV 후 같은 tx 재조회=aborted](feedback_aborted_tx_after_div_catch.md) — REQUIRES_NEW 격리 or catch제거
- [JPA JOIN FETCH 카르테시안 dedup](feedback_jpa_joinfetch_cartesian_dedup.md) — 다행 컬렉션 fetch 중복, id-distinct+다행 IT시드
- [MockMvc getContentAsString charset](feedback_mockmvc_getcontentasstring_charset.md) — 인자없으면 ISO-8859-1 깨짐, UTF_8 명시
- [X-User-Name charset+FilterRegistrationBean MockMvc](feedback_x_user_name_header_charset_mockmvc.md)
- [real-qa 실행법+스펙 false-RED](feedback_realqa_run_and_false_red.md) — mock off+:8080+config(webServer 없음), DragHandle 글리프 false-RED
- [real-qa 프록시 글롭+resourceType](feedback_realqa_proxy_glob_resourcetype.md) — 백엔드만 좁게+xhr/fetch, /collab/stream abort, networkidle 금지
- [real-qa 디렉토리 -real-qa 접미사](project_dispatch_on_inspect_epic.md) — 누락시 CI mock잡 미제외→ECONNREFUSED
- [정찰 grep false-negative](feedback_recon_grep_false_negative.md) — grep 0매치≠기능부재, 실 파일/라우트로 검증

# Codex
- [Codex MCP 서버 사용](feedback_codex_plugin_setup.md) — mcp__codex__codex, sandbox workspace-write, 5 agents 병렬
- [Codex 디스패치=Claude commit 대행+approval never](feedback_codex_sandbox_git.md) — Codex git 금지(파일만), approval-policy never, model 생략+effort high
- [Codex 모델 자동 전환](feedback_codex_model_auto_switch.md) — 기본 spark+medium, 보안/migration/race 등 gpt-5.5 high
- [Codex 권한 새 세션부터](feedback_codex_permission_new_session.md) — allow 추가는 새 세션부터, 진행중 무리한 재시도 금지
- [Codex MCP 세션 한정 한계](feedback_codex_mcp_session_limit.md) — -32000 후 새 세션·codex exec·Agent 대체
- [codex config.toml NUL 손상](feedback_codex_config_nul_corruption.md) — 최소 config+model="gpt-5.5"
- [codex exec 백그라운드 stdin hang](feedback_codex_exec_stdin_hang.md) — </dev/null 필수
- [detached codex 안정화 후 판단](feedback_codex_detached_write_settle.md) — git status 빈것≠미수행, 폴링+diff
- [agent origin/main 동기화](feedback_agent_origin_main_sync.md) — background agent 시작직후 git fetch+log 검증

# 프로젝트 컨텍스트
- [User Role](user_role.md) · [사용자 호칭](feedback_user_title.md) — 개발책임자, "대표"=김미선만
- [Project Overview](project_overview.md) — 14 service MSA, Spring Boot 3/Java 17, PG service-per-DB
- [Phase 10 arologis / Phase 11 AWS](project_arologis_phase10.md) · [Phase 11 AWS](project_phase11_aws.md) — 월₩405K, IaC #660, 실이식 수동18항목 대기
- [아로로지스 독립분리](project_arologis_independent.md) · [명칭](feedback_arologis_name.md) · [자율권한](feedback_arologis_extract_autopilot.md)
- [Samhan Public 명칭](feedback_samhan_public_name.md) · [Domain Strategy](project_domain_strategy.md)
- [Korean Audit Standard](project_korean_accounting.md) — 표준 계정과목 코드 시드
- [SP-08 legacy GAS parity](project_sp_08_legacy_gas_parity.md) — 전메뉴 GAS 동등, tools/legacy-gas/, #434
- [옵션C 폐기—외부4종 DB 치환](project_sheets_to_db_full_migration.md) · [전산=이카운트 대체·GAS=export원](project_replaces_ecount_gas_was_exporter.md)
- [이카운트 네이티브 편입](project_ecount_native_fold.md) · [이카운트 품목 신원규칙](project_ecount_product_identity_rule.md)
- [외부연동 딥리서치](project_external_integration_research.md) — 전자세금계산서 ASP 권고(바로빌), 법인계좌 리서치
- [KST 전역 표준화](project_kst_timezone_standard.md) — #479 dev, Phase11 prod cutover 후속
- [메뉴 5대분류+품목 노출구분](project_item_exposure_and_menu_5cat.md) — 판매/구매/회계/그룹웨어/인사+배차·창고, usageScope+displayOrder

# 도메인 결정/에픽 상태
- [주문 상태 모델](project_partner_order_status_model.md) — 진행중DRAFT/완료CONFIRMED/보류ON_HOLD(#324)
- [주문→출고전표 전환](project_order_slip_conversion.md) · [전표/주문번호=슬래시 YYYY/MM/DD-N](feedback_slip_order_number_format.md)
- [시리얼 인스턴스 재고](project_serial_inventory_model.md) · [재고조회 모달 2.6d](project_inventory_lookup_modal_2_6d.md) ✅
- [seeder product UUID 3-DB 정합](project_seed_product_uuid_catalog.md) · [lookup 3종 시드](project_lookup_seed_source.md) #425
- [출고전표 양식 1:1+전자서명](project_slip_shipout_print_form.md) · [공급자·은행계좌 회계설정](project_company_config_menu.md)
- [판매전표 명칭](project_sales_slip_naming.md) — 출고 SLIP_OUTBOUND=판매전표, 동적 결재라인 #560~565(그룹웨어 완료)
- [P0-B 인증·DC키 결정](project_estimate_auth_dc_key_decisions.md) — X-Internal-Token, partnerCode=bizno digits
- [종합견적서=estimate-app ~95%](project_quotation_estimate_app_state.md) — G1/G2 DB전환 해소
- [estimate-app 사양 소스](project_estimate_spec_data_sources.md) — 사양맵=시트, 성능 합성금지
- [기초품목↔견적품목 분리 ✅](project_basic_vs_estimate_item_separation.md) — #496 완결, 멀티가격#19 MOOT
- [품목 등록/관리 고도화](project_product_master_registration.md) — 3구분·세트구성품 자동완성·상품/비상품
- [에픽#18 다중노출+구성품정렬 ✅](../../docs/dev-reports/2026-06-17-product-set-component-reorder.md) — #494/#495
- [수식 빌더 에픽 ✅](project_formula_builder_epic.md) — #499~506, 개발책임자 완료선언
- [§7 전역 협업 에픽 ✅6문서](project_global_collab_epic.md) — slip·회계·주문·견적·배차·그룹웨어 collab+presence 완결(#480/#545/#546)
- [미리보기 표준화](project_print_preview_standardization.md) — 전표양식/견적GAS/결재 PrintLayout, #481~484
- [A2 명시 결재 enforcement](project_approval_enforcement_epic.md) — 출고#556·입고#558·주문#559, 회계/견적/배차/그룹웨어=신규설계 필요
- [검수완료→배차발송 ✅](project_dispatch_on_inspect_epic.md) — #590~593, external_carrier·SMS·인쇄. 다중생성자 부팅실패·real-qa 접미사 교훈
- [회계 G/H 도메인 결정](project_accounting_gh_decisions.md) — 받을어음+수금계획, H=BankTransaction CSV MVP→KFTC
- [회계 보고서 표시 규약](feedback_accounting_report_display_conventions.md) — 음수 '-X'빨강, 0='—', 코드 prefix 금지
- [회계 원장 수정금지·입금보고서 에픽](project_accounting_ledger_edit_policy.md) — Journal 수정금지(역분개), CashReceipt 입금보고서 편집대상, #697 폐기 (2026-07-02)
- [arologis-desktop 백오피스 ✅](project_arologis_desktop_backoffice.md) — 인사/간이회계/권한, #433
- [모바일 에픽② 슬1 Foundation ✅](../../docs/handoff/CURRENT-WORK.md) — #596 Dual-mode 인증
- [플랫폼 분기=빌드타임 플래그](feedback_platform_branch_build_time_flag.md) — VITE_PLATFORM, mock gate 검증
- [모바일 슬3 DataTable 카드화 ✅](project_mobile_s3_datatable_card.md) #598 · [슬4a Modal 풀스크린 ✅](project_mobile_s4a_modal_fullscreen.md) #599
- [반응형 Drawer 오프스크린 a11y](feedback_responsive_drawer_offscreen_a11y.md) — visibility:hidden+delay

# FE/UI 규약
- [인쇄 양식 반복 정정](feedback_print_design_iteration.md) — 단번완성 금지, mock→캡처→CSS 3~5회
- [다중 추가 입력=칩](feedback_chip_ui_multi_input.md) — TagChip+AsyncAutocomplete, 품목라인 제외
- [FE canAccess page-code=BE @RequirePermission 일치](feedback_fe_canaccess_pagecode_be_match.md)
- [FE 가드 제거=전체 mock suite](feedback_fe_guard_removal_contract_tests.md)
- [권한그룹 C2 widening=Option A](feedback_pgc_c2_widening_option_a.md) — seed 진실원
- [FE 옵션 타입=BE DTO 정확일치](feedback_fe_option_type_matches_be_dto.md) — boolean vs String silent no-op
- [in-process mock 3원칙+page.route no-op](feedback_inprocess_mock_principles.md)
- [사양 sync=실DB 전수 분포검사](feedback_spec_sync_full_db_distribution_check.md) — 카테고리별 0-사양 query, 연속 sync 금지
- [@PreAuthorize 마이그 교훈](feedback_preauth_migration_lessons.md) — @RequireDepartment opt-in, 계약변경 차원만 실HTTP
- [identity 헤더 인가 안티패턴](feedback_identity_header_authz_antipattern.md) — 게이트웨이 단일권위, downstream fail-CLOSED

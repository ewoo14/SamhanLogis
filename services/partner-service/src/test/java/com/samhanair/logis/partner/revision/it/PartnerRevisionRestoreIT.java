package com.samhanair.logis.partner.revision.it;

import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.hamcrest.Matchers.notNullValue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.partner.PartnerServiceApplication;
import com.samhanair.logis.partner.domain.Partner;
import com.samhanair.logis.partner.it.AbstractPostgresIT;
import com.samhanair.logis.partner.repository.PartnerRepository;
import com.samhanair.logis.partner.revision.repository.PartnerRevisionRepository;
import com.samhanair.logis.partner.tab.dto.PartnerContactRequest;
import com.samhanair.logis.partner.tab.dto.PartnerFullRequest;
import com.samhanair.logis.partner.tab.dto.PartnerPriceDiscountRequest;
import com.samhanair.logis.partner.tab.dto.PartnerShippingAddressRequest;
import com.samhanair.logis.partner.tab.repository.PartnerContactRepository;
import com.samhanair.logis.partner.tab.repository.PartnerPriceDiscountRepository;
import com.samhanair.logis.partner.tab.repository.PartnerShippingAddressRepository;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/**
 * 거래처 버전이력/복원 Testcontainers 통합 테스트 — 권한 재편 Phase 2.3 Task 5.
 *
 * <p>실 DB (Flyway {@code partner_revisions} + JSONB 스냅샷) 기준으로 Task 2~4 산출
 * (자동 캡처 / 타임라인 changeSummary / point-in-time 복원 / REST 권한 게이트) 을 종단 검증한다.
 * {@link AbstractPostgresIT} 의 싱글턴 postgres:16-alpine 컨테이너 + Docker 미가용 시 skip 패턴을 상속한다.
 *
 * <p>대상 endpoint (Task 4 — {@code PartnerRevisionController}, base {@code /api/v1/partners/{partnerCode}}):
 * <ul>
 *   <li>{@code GET  /revisions} — {@code partners.4tab.edit} VIEW. 최신(revisionNo 내림차순) 우선
 *       타임라인 + 직전 대비 changeSummary. {@code actorId} JSON 미노출 (UUID 비공개 가드).</li>
 *   <li>{@code POST /revisions/{revisionNo}/restore} — {@code partners.4tab.edit} RESTORE.
 *       헤더 X-User-Id/X-User-Name/X-User-Color. 거래종료(TERMINATED) 거래처 복원 차단 (409 CONFLICT).</li>
 * </ul>
 *
 * <p>거래처 seed 방식: 캡처가 일어나는 실 서비스 경로(MockMvc)를 그대로 사용한다 —
 * {@code POST /api/v1/partners/full} (CREATE 캡처 rev1), {@code PATCH /api/v1/partners/{code}/full}
 * (헤더+자식 전량교체 → EDIT 캡처 rev2). 거래처 4탭 자식(배송지/담당자)은 full 요청의 리스트 크기로
 * 추가/제거를 모사한다 (리스트 크기 증가=추가, 0건 리스트=전량 제거). TERMINATED 상태는 전이 endpoint 가
 * 없어 {@link PartnerRepository} 로 직접 {@link Partner#terminate()} + saveAndFlush 한다.
 *
 * <p>모든 인증 요청에 유효 {@code X-User-Id}(UUID) + 적절 {@code X-User-Role} 헤더를 부여한다
 * (account 모드 {@link PermissionAction} 게이트 + role MASTER bypass 검증). 복원/수정에는
 * {@code X-User-Name} 도 부여한다 (actorName 추적).
 *
 * <p>partner-service 는 외부 RestClient 호출이 없으므로 ({@code feedback_it_mockbean_external_clients}
 * 가드 대상 client 없음) {@link DynamicPermissionClient} 만 {@code @MockBean} 으로 격리한다. partner 의
 * {@link AbstractPostgresIT} 에는 slip 과 달리 공통 {@code DynamicPermissionClient} {@code @MockBean} 이
 * 없으므로 본 IT 가 직접 선언한다. 기본 allow, 403/bypass 케이스는 요청 직전 명시 stub.
 *
 * <p>{@code com.samhanair.logis.slip.estimate.it.EstimateRevisionRestoreIT} 미러 (estimate→partner,
 * estimateId(UUID path)→partnerCode(path), line→4탭 자식).
 */
@SpringBootTest(classes = PartnerServiceApplication.class)
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class PartnerRevisionRestoreIT extends AbstractPostgresIT {

    private static final String USER_ID_HEADER = "X-User-Id";
    private static final String USER_NAME_HEADER = "X-User-Name";
    private static final String ROLE_HEADER = "X-User-Role";
    /** 거래처 버전이력/복원 권한 page (PartnerRevisionController @RequirePermission). */
    private static final String PARTNERS_EDIT_PAGE = "partners.4tab.edit";

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;

    @Autowired private PartnerRepository partnerRepository;
    @Autowired private PartnerRevisionRepository revisionRepository;
    @Autowired private PartnerPriceDiscountRepository priceDiscountRepository;
    @Autowired private PartnerShippingAddressRepository shippingAddressRepository;
    @Autowired private PartnerContactRepository contactRepository;

    /**
     * account 모드 권한 client — 기본 allow stub. partner {@link AbstractPostgresIT} 공통 bean 부재로
     * 본 IT 가 직접 선언한다 (slip 측과 다른 점).
     */
    @MockBean private DynamicPermissionClient dynamicPermissionClient;

    @BeforeEach
    void setUp() {
        // 기본 allow — account 모드 check + role 모드 canView/canEdit 모두 통과 (deny 케이스는 요청 직전 명시 override)
        lenient().when(dynamicPermissionClient.check(
                        any(UUID.class), anyString(), any(PermissionAction.class)))
                .thenReturn(true);
        lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);

        // 테스트 간 격리 — 자식 → revision → 거래처 순으로 정리 (Partner4TabControllerIT cleanup 미러 + revision 추가)
        contactRepository.deleteAll();
        shippingAddressRepository.deleteAll();
        priceDiscountRepository.deleteAll();
        revisionRepository.deleteAll();
        partnerRepository.deleteAll();
    }

    // =========================================================================
    // 시나리오 1 — 캡처 + 타임라인 (CREATE/EDIT, 최신 우선, changeSummary, actorId 미노출)
    // =========================================================================

    @Test
    @DisplayName("타임라인: 생성(CREATE rev1) + 자식 추가 수정(EDIT rev2) → 최신 우선 2건, childAdded>=1, actorId 미노출")
    void timeline_afterCreateAndUpdate_listsRevisionsLatestFirstWithoutActorId() throws Exception {
        // 배송지1·담당자1·단가할인 포함 거래처 생성 → CREATE revision 1 자동 캡처
        String code = "P-REV-T1";
        registerPartner(code, 1, 1);

        // 배송지2·담당자2 로 전량교체 수정 → EDIT revision 2 (직전 rev1 대비 자식 추가)
        updatePartner(code, 2, 2, "타임라인 검증 수정");

        MvcResult result = mockMvc.perform(get("/api/v1/partners/{code}/revisions", code)
                        .header(USER_ID_HEADER, UUID.randomUUID().toString())
                        .header(USER_NAME_HEADER, "감사자")
                        .header(ROLE_HEADER, "MANAGER"))
                .andExpect(status().isOk())
                // 최신 우선 — [0]=rev2 EDIT, [1]=rev1 CREATE
                .andExpect(jsonPath("$.data[0].revisionNo").value(2))
                .andExpect(jsonPath("$.data[0].revisionType").value("EDIT"))
                .andExpect(jsonPath("$.data[1].revisionNo").value(1))
                .andExpect(jsonPath("$.data[1].revisionType").value("CREATE"))
                // rev2 는 직전(rev1) 대비 자식 1건 이상 추가
                .andExpect(jsonPath("$.data[0].changeSummary.childAdded")
                        .value(greaterThanOrEqualTo(1)))
                .andExpect(jsonPath("$.data[0].partnerCode").value(code))
                .andExpect(jsonPath("$.data[0].actorName").value(notNullValue()))
                .andReturn();

        // UUID 비공개 가드 — 응답 본문 어디에도 actorId 키가 없어야 함
        String body = result.getResponse().getContentAsString();
        Assertions.assertThat(body).doesNotContain("actorId");
        JsonNode data = objectMapper.readTree(body).get("data");
        Assertions.assertThat(data).hasSizeGreaterThanOrEqualTo(2);
        Assertions.assertThat(data.get(0).has("actorId")).isFalse();
    }

    // =========================================================================
    // 시나리오 2 — 복원 (자식 집합이 대상 revision 시점으로 회귀 + 신규 RESTORE revision)
    // =========================================================================

    @Test
    @DisplayName("복원: rev1(배송지1) 시점으로 복원 → 자식 회귀 + 신규 RESTORE rev3(source=1)")
    void restore_toRevision1_revertsChildrenAndCreatesRestoreRevision() throws Exception {
        String code = "P-REV-T2";
        // rev1 = 배송지1·담당자1
        registerPartner(code, 1, 1);
        int addrAtRev1 = shippingAddrCount(getFull(code));
        Assertions.assertThat(addrAtRev1).isEqualTo(1);

        // 배송지2·담당자2 로 수정 → rev2
        updatePartner(code, 2, 2, "복원 전 수정");
        Assertions.assertThat(shippingAddrCount(getFull(code))).isEqualTo(2);

        // revision 1 시점으로 복원 → 200, 배송지가 rev1(=1건) 로 회귀
        mockMvc.perform(post("/api/v1/partners/{code}/revisions/{rev}/restore", code, 1)
                        .header(USER_ID_HEADER, UUID.randomUUID().toString())
                        .header(USER_NAME_HEADER, "복원자")
                        .header(ROLE_HEADER, "MANAGER"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.basic.partnerCode").value(code))
                .andExpect(jsonPath("$.data.shippingAddresses.length()").value(addrAtRev1));

        // 복원도 신규 RESTORE revision (sourceRevisionNo=1) 으로 추적 — 타임라인 최신 항목이 RESTORE rev3
        mockMvc.perform(get("/api/v1/partners/{code}/revisions", code)
                        .header(USER_ID_HEADER, UUID.randomUUID().toString())
                        .header(ROLE_HEADER, "MANAGER"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].revisionNo").value(3))
                .andExpect(jsonPath("$.data[0].revisionType").value("RESTORE"))
                .andExpect(jsonPath("$.data[0].sourceRevisionNo").value(1));
    }

    // =========================================================================
    // 시나리오 3 — 자식 제거 후 이전 revision 복원 시 자식 복구
    // =========================================================================

    @Test
    @DisplayName("복원: 자식 전량 제거(배송지2·담당자2 → 0·0) 후 rev1 복원 → 제거 자식 복구")
    void restore_afterChildRemoval_recoversRemovedChildren() throws Exception {
        String code = "P-REV-T3";
        // rev1 = 배송지2·담당자2
        registerPartner(code, 2, 2);
        Assertions.assertThat(shippingAddrCount(getFull(code))).isEqualTo(2);
        Assertions.assertThat(contactCount(getFull(code))).isEqualTo(2);

        // 배송지0·담당자0 으로 수정 → rev2 (자식 전량 제거 모사)
        updatePartner(code, 0, 0, "자식 제거 수정");
        Assertions.assertThat(shippingAddrCount(getFull(code))).isEqualTo(0);
        Assertions.assertThat(contactCount(getFull(code))).isEqualTo(0);

        // revision 1 복원 → 제거된 배송지/담당자 복구 (2·2)
        mockMvc.perform(post("/api/v1/partners/{code}/revisions/{rev}/restore", code, 1)
                        .header(USER_ID_HEADER, UUID.randomUUID().toString())
                        .header(USER_NAME_HEADER, "복원자")
                        .header(ROLE_HEADER, "MANAGER"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.shippingAddresses.length()").value(2))
                .andExpect(jsonPath("$.data.contacts.length()").value(2));
    }

    // =========================================================================
    // 시나리오 4 — 거래종료(TERMINATED) 거래처 복원 차단 (409 CONFLICT)
    // =========================================================================

    @Test
    @DisplayName("복원 차단: TERMINATED 거래처 복원 시도 → 409 CONFLICT (requireEditable 가드)")
    void restore_whenPartnerTerminated_returnsConflict() throws Exception {
        String code = "P-REV-T4";
        registerPartner(code, 1, 1);

        // 전이 endpoint 가 없어 repository 로 직접 TERMINATED 전이 (EDITABLE 가드 발동 경로)
        Partner partner = partnerRepository.findByPartnerCode(code).orElseThrow();
        partner.terminate();
        partnerRepository.saveAndFlush(partner);

        mockMvc.perform(post("/api/v1/partners/{code}/revisions/{rev}/restore", code, 1)
                        .header(USER_ID_HEADER, UUID.randomUUID().toString())
                        .header(USER_NAME_HEADER, "복원자")
                        .header(ROLE_HEADER, "MANAGER"))
                .andExpect(status().isConflict());
    }

    // =========================================================================
    // 시나리오 5/6 — RESTORE 권한 (deny → 403, MASTER bypass → 200)
    // =========================================================================

    @Test
    @DisplayName("권한: RESTORE deny + 비-MASTER → 403")
    void restore_whenPermissionDenied_nonMaster_returns403() throws Exception {
        String code = "P-REV-T5";
        registerPartner(code, 1, 1);

        // account 모드 RESTORE 권한 명시 deny + 비-MASTER 역할 → PermissionAspect 가 403
        when(dynamicPermissionClient.check(
                        any(UUID.class), eq(PARTNERS_EDIT_PAGE), eq(PermissionAction.RESTORE)))
                .thenReturn(false);

        mockMvc.perform(post("/api/v1/partners/{code}/revisions/{rev}/restore", code, 1)
                        .header(USER_ID_HEADER, UUID.randomUUID().toString())
                        .header(USER_NAME_HEADER, "권한없음")
                        .header(ROLE_HEADER, "STAFF"))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("권한: RESTORE deny 이어도 MASTER 역할 → aspect bypass 200")
    void restore_whenPermissionDenied_masterRole_bypassesAndReturns200() throws Exception {
        String code = "P-REV-T6";
        registerPartner(code, 1, 1);

        // RESTORE deny stub 이어도 MASTER 역할은 aspect bypass → 200
        when(dynamicPermissionClient.check(
                        any(UUID.class), eq(PARTNERS_EDIT_PAGE), eq(PermissionAction.RESTORE)))
                .thenReturn(false);

        mockMvc.perform(post("/api/v1/partners/{code}/revisions/{rev}/restore", code, 1)
                        .header(USER_ID_HEADER, UUID.randomUUID().toString())
                        .header(USER_NAME_HEADER, "마스터")
                        .header(ROLE_HEADER, "MASTER"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.basic.partnerCode").value(code));
    }

    // =========================================================================
    // 헬퍼 — 거래처 seed (MockMvc 실 경로) + 4탭 조회 + 자식 카운트
    // =========================================================================

    /**
     * {@code addrCount} 개 배송지 + {@code contactCount} 개 담당자 + 단가/할인 정책을 가진 거래처를
     * {@code POST /api/v1/partners/full} 로 등록한다. 등록 직후 CREATE revision 1 이 자동 캡처된다.
     */
    private void registerPartner(String code, int addrCount, int contactCount) throws Exception {
        PartnerFullRequest req = new PartnerFullRequest(
                code, bizNo(code), "(주)" + code,
                new PartnerPriceDiscountRequest(new BigDecimal("5.00"), 30, "기본 정책"),
                buildAddresses(addrCount),
                buildContacts(contactCount));

        mockMvc.perform(post("/api/v1/partners/full")
                        .header(USER_ID_HEADER, UUID.randomUUID().toString())
                        .header(USER_NAME_HEADER, "등록자")
                        .header(ROLE_HEADER, "MANAGER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isCreated());
    }

    /**
     * 거래처 4탭 전량교체 수정 — {@code PATCH /api/v1/partners/{code}/full}. 배송지/담당자 리스트 크기로
     * 추가/제거를 모사한다 (0건 = 전량 제거). 수정 성공 직후 EDIT revision 1건이 누적된다.
     */
    private void updatePartner(String code, int addrCount, int contactCount, String name)
            throws Exception {
        PartnerFullRequest req = new PartnerFullRequest(
                code, bizNo(code), "(주)" + name,
                new PartnerPriceDiscountRequest(new BigDecimal("5.00"), 30, "기본 정책"),
                buildAddresses(addrCount),
                buildContacts(contactCount));

        mockMvc.perform(patch("/api/v1/partners/{code}/full", code)
                        .header(USER_ID_HEADER, UUID.randomUUID().toString())
                        .header(USER_NAME_HEADER, "수정자")
                        .header(ROLE_HEADER, "MANAGER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isOk());
    }

    /** {@code count} 개 배송지 요청 — alias 고유 (changeSummary alias 매칭 키). */
    private List<PartnerShippingAddressRequest> buildAddresses(int count) {
        java.util.List<PartnerShippingAddressRequest> list = new java.util.ArrayList<>();
        for (int i = 0; i < count; i++) {
            list.add(new PartnerShippingAddressRequest(
                    "배송지" + i, "1234" + i, "서울 강남구 테헤란로 " + i,
                    "02-1000-000" + i, "수신자" + i, i == 0, "배송 메모 " + i));
        }
        return list;
    }

    /** {@code count} 개 담당자 요청 — contactName 고유 (changeSummary contactName 매칭 키). */
    private List<PartnerContactRequest> buildContacts(int count) {
        java.util.List<PartnerContactRequest> list = new java.util.ArrayList<>();
        for (int i = 0; i < count; i++) {
            list.add(new PartnerContactRequest(
                    "담당자" + i, "직책" + i, "010-2000-000" + i,
                    "contact" + i + "@example.com", i == 0, "담당 메모 " + i));
        }
        return list;
    }

    /** 거래처 4탭 전체 응답 JSON 의 {@code $.data} 노드 반환 ({@code GET /full}). */
    private JsonNode getFull(String code) throws Exception {
        MvcResult result = mockMvc.perform(get("/api/v1/partners/{code}/full", code)
                        .header(USER_ID_HEADER, UUID.randomUUID().toString())
                        .header(ROLE_HEADER, "MANAGER"))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString()).get("data");
    }

    private int shippingAddrCount(JsonNode full) {
        return full.get("shippingAddresses").size();
    }

    private int contactCount(JsonNode full) {
        return full.get("contacts").size();
    }

    /** 거래처 코드별 결정적 사업자번호 (중복 방지용 hash 기반 10자리). */
    private String bizNo(String code) {
        int h = Math.abs(code.hashCode()) % 1000000000;
        String digits = String.format("%09d", h);
        return digits.substring(0, 3) + "-" + digits.substring(3, 5) + "-" + digits.substring(5);
    }
}

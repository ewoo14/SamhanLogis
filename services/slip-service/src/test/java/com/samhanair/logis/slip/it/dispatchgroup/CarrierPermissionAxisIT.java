package com.samhanair.logis.slip.it.dispatchgroup;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.slip.SlipServiceApplication;
import com.samhanair.logis.slip.dto.dispatchgroup.DispatchGroupRequests;
import com.samhanair.logis.slip.it.AbstractPostgresIT;
import com.samhanair.logis.slip.service.dispatchgroup.DispatchGroupService;
import java.time.LocalDate;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * S10 운송사 권한 축 회귀 테스트.
 *
 * <p>인사 마스터 경로와 배차 조회 alias를 분리해 hr.carriers CRUD 보호와
 * dispatch.board 운송사 조회·배차그룹 지정 권한을 동시에 고정한다.
 */
@SpringBootTest(classes = SlipServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
@WithMockUser(username = "dispatch-user", authorities = {"ROLE_DISPATCH"})
class CarrierPermissionAxisIT extends AbstractPostgresIT {

    private static final String ACCOUNT_ID = "10000000-0000-0000-0000-000000001039";
    private static final String DISPATCH_ROLE = "DISPATCH";
    private static final String HR_PAGE = "hr.carriers";
    private static final String DISPATCH_PAGE = "dispatch.board";

    @Autowired private MockMvc mvc;
    @Autowired private DispatchGroupService dispatchGroupService;

    @Test
    void A1_without_hr_carriers_cannot_register_update_or_delete() throws Exception {
        deny(HR_PAGE);

        mvc.perform(post("/admin/carriers")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"code\":\"NO-HR\",\"name\":\"차단 운송사\",\"isArologis\":false}")
                        .headers(headers()))
                .andExpect(status().isForbidden());
        mvc.perform(patch("/admin/carriers/AROLOGIS")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"차단\",\"isActive\":false}")
                        .headers(headers()))
                .andExpect(status().isForbidden());
        mvc.perform(delete("/admin/carriers/AROLOGIS")
                        .headers(headers()))
                .andExpect(status().isForbidden());
    }

    @Test
    void A2_without_hr_carriers_cannot_enter_hr_carrier_list() throws Exception {
        deny(HR_PAGE);

        mvc.perform(get("/admin/carriers")
                        .headers(headers()))
                .andExpect(status().isForbidden());
    }

    @Test
    void A3_without_both_permissions_cannot_lookup_carriers() throws Exception {
        deny(HR_PAGE);
        deny(DISPATCH_PAGE);

        mvc.perform(get("/admin/carriers/dispatch-lookup")
                        .headers(headers()))
                .andExpect(status().isForbidden());
    }

    @Test
    void B1_dispatch_board_view_can_lookup_carrier_list_and_detail_without_hr() throws Exception {
        deny(HR_PAGE);
        allow(DISPATCH_PAGE);

        mvc.perform(get("/admin/carriers/dispatch-lookup")
                        .headers(headers()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].code").value("AROLOGIS"));
        mvc.perform(get("/admin/carriers/dispatch-lookup/AROLOGIS")
                        .headers(headers()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.code").value("AROLOGIS"));
    }

    @Test
    void B2_dispatch_board_view_can_assign_carrier_without_hr() throws Exception {
        deny(HR_PAGE);
        allow(DISPATCH_PAGE);
        String groupNo = "S10-PERM-" + UUID.randomUUID();
        createGroup(groupNo);

        mvc.perform(put("/admin/dispatch-groups/{groupNo}/carrier/AROLOGIS", groupNo)
                        .headers(headers()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.carrierCode").value("AROLOGIS"));
    }

    @Test
    void all_four_permission_combinations_keep_read_and_change_boundaries() throws Exception {
        // 권한 없음: 인사 master와 배차 lookup/지정 모두 차단.
        deny(HR_PAGE);
        deny(DISPATCH_PAGE);
        String noneGroup = "S10-NONE-" + UUID.randomUUID();
        createGroup(noneGroup);
        mvc.perform(get("/admin/carriers").headers(headers())).andExpect(status().isForbidden());
        mvc.perform(get("/admin/carriers/dispatch-lookup").headers(headers())).andExpect(status().isForbidden());
        mvc.perform(post("/admin/carriers")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(carrierBody("S10-NONE"))
                        .headers(headers()))
                .andExpect(status().isForbidden());
        mvc.perform(put("/admin/dispatch-groups/{groupNo}/carrier/AROLOGIS", noneGroup)
                        .headers(headers()))
                .andExpect(status().isForbidden());

        // 인사 master만: 인사 조회/변경은 허용하고 배차 lookup/지정은 차단.
        allow(HR_PAGE);
        deny(DISPATCH_PAGE);
        String hrOnlyGroup = "S10-HR-" + UUID.randomUUID();
        createGroup(hrOnlyGroup);
        mvc.perform(get("/admin/carriers").headers(headers())).andExpect(status().isOk());
        mvc.perform(get("/admin/carriers/dispatch-lookup").headers(headers())).andExpect(status().isForbidden());
        mvc.perform(post("/admin/carriers")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(carrierBody("S10-HR"))
                        .headers(headers()))
                .andExpect(status().isOk());
        mvc.perform(put("/admin/dispatch-groups/{groupNo}/carrier/AROLOGIS", hrOnlyGroup)
                        .headers(headers()))
                .andExpect(status().isForbidden());

        // 배차 board만: 배차 lookup/지정은 허용하고 인사 master 조회/변경은 차단.
        deny(HR_PAGE);
        allow(DISPATCH_PAGE);
        String dispatchOnlyGroup = "S10-DISPATCH-" + UUID.randomUUID();
        createGroup(dispatchOnlyGroup);
        mvc.perform(get("/admin/carriers").headers(headers())).andExpect(status().isForbidden());
        mvc.perform(get("/admin/carriers/dispatch-lookup").headers(headers())).andExpect(status().isOk());
        mvc.perform(post("/admin/carriers")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(carrierBody("S10-DISPATCH"))
                        .headers(headers()))
                .andExpect(status().isForbidden());
        mvc.perform(put("/admin/dispatch-groups/{groupNo}/carrier/AROLOGIS", dispatchOnlyGroup)
                        .headers(headers()))
                .andExpect(status().isOk());

        // 두 권한 모두: 두 조회 축과 양쪽 변경 경로가 허용.
        allow(HR_PAGE);
        allow(DISPATCH_PAGE);
        String bothGroup = "S10-BOTH-" + UUID.randomUUID();
        createGroup(bothGroup);
        mvc.perform(get("/admin/carriers").headers(headers())).andExpect(status().isOk());
        mvc.perform(get("/admin/carriers/dispatch-lookup").headers(headers())).andExpect(status().isOk());
        mvc.perform(post("/admin/carriers")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(carrierBody("S10-BOTH"))
                        .headers(headers()))
                .andExpect(status().isOk());
        mvc.perform(put("/admin/dispatch-groups/{groupNo}/carrier/AROLOGIS", bothGroup)
                        .headers(headers()))
                .andExpect(status().isOk());
    }

    private org.springframework.http.HttpHeaders headers() {
        org.springframework.http.HttpHeaders headers = new org.springframework.http.HttpHeaders();
        headers.set("X-User-Id", ACCOUNT_ID);
        headers.set("X-User-Role", DISPATCH_ROLE);
        return headers;
    }

    private void deny(String page) {
        when(dynamicPermissionClient.check(
                eq(UUID.fromString(ACCOUNT_ID)), eq(page), any(PermissionAction.class)))
                .thenReturn(false);
    }

    private void allow(String page) {
        when(dynamicPermissionClient.check(
                eq(UUID.fromString(ACCOUNT_ID)), eq(page), any(PermissionAction.class)))
                .thenReturn(true);
    }

    private void createGroup(String groupNo) {
        dispatchGroupService.create(new DispatchGroupRequests.Create(
                groupNo, LocalDate.of(2026, 8, 5), "1톤 테스트", null));
    }

    private String carrierBody(String code) {
        return "{\"code\":\"" + code + "\",\"name\":\"테스트 운송사\",\"isArologis\":false}";
    }
}

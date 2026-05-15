package com.samhanair.logis.slip.attachment.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.slip.attachment.domain.SlipAttachmentType;
import com.samhanair.logis.slip.attachment.service.SlipAttachmentService;
import com.samhanair.logis.slip.attachment.web.dto.SlipPhotoAuditResponse;
import com.samhanair.logis.slip.config.HeaderAuthenticationFilter;
import java.lang.reflect.Method;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.mapping.JpaMetamodelMappingContext;
import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.test.web.servlet.MockMvc;

/**
 * 관리자 사진 감사 endpoint MVC 테스트.
 *
 * <p>{@link HeaderAuthenticationFilter} 와 {@code @PreAuthorize} 를 함께 통과시켜 허용 role,
 * 차단 role, UUID-free JSON 응답 계약을 고정한다.
 */
@WebMvcTest(controllers = SlipPhotoAuditAdminController.class)
@Import(SlipPhotoAuditAdminControllerTest.TestSecurityConfig.class)
class SlipPhotoAuditAdminControllerTest {

    @MockBean
    private SlipAttachmentService attachmentService;

    @MockBean
    private JpaMetamodelMappingContext jpaMetamodelMappingContext;

    private final MockMvc mockMvc;

    @Autowired
    SlipPhotoAuditAdminControllerTest(MockMvc mockMvc) {
        this.mockMvc = mockMvc;
    }

    @Test
    void listPhotoAudit_warehouseRole_forwardsFiltersAndSerializesWithoutInternalIds()
            throws Exception {
        LocalDate from = LocalDate.of(2026, 5, 1);
        LocalDate to = LocalDate.of(2026, 5, 16);
        String rawUploader = "11111111-1111-7111-a111-111111111111";
        SlipPhotoAuditResponse row = new SlipPhotoAuditResponse(
                "2026/05/16-001",
                LocalDate.of(2026, 5, 16),
                "삼한상사",
                SlipAttachmentType.DELIVERY,
                "delivery.jpg",
                1024L,
                "image/jpeg",
                true,
                LocalDateTime.of(2026, 5, 16, 9, 30),
                rawUploader,
                LocalDateTime.of(2026, 5, 16, 10, 0));
        Page<SlipPhotoAuditResponse> page = new PageImpl<>(
                List.of(row),
                org.springframework.data.domain.PageRequest.of(0, 1),
                1);
        given(attachmentService.listPhotoAudit(
                eq(SlipAttachmentType.DELIVERY),
                eq(from),
                eq(to),
                eq("2026/05"),
                org.mockito.ArgumentMatchers.any(Pageable.class)))
                .willReturn(page);

        String json = mockMvc.perform(get("/slips/admin/photo-audit")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "WAREHOUSE")
                        .queryParam("type", "DELIVERY")
                        .queryParam("from", "2026-05-01")
                        .queryParam("to", "2026-05-16")
                        .queryParam("slipNo", "2026/05")
                        .queryParam("page", "2")
                        .queryParam("size", "150")
                        .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.content[0].slipNo").value("2026/05/16-001"))
                .andExpect(jsonPath("$.data.content[0].hasGps").value(true))
                .andExpect(jsonPath("$.data.content[0].uploadedBy").value("업로더 확인 필요"))
                .andReturn()
                .getResponse()
                .getContentAsString();

        ArgumentCaptor<Pageable> pageableCaptor = ArgumentCaptor.forClass(Pageable.class);
        verify(attachmentService).listPhotoAudit(
                eq(SlipAttachmentType.DELIVERY),
                eq(from),
                eq(to),
                eq("2026/05"),
                pageableCaptor.capture());
        Pageable pageable = pageableCaptor.getValue();
        assertThat(pageable.getPageNumber()).isEqualTo(2);
        assertThat(pageable.getPageSize()).isEqualTo(100);
        Sort.Order uploadSort = pageable.getSort().getOrderFor("uploadedAt");
        assertThat(uploadSort).isNotNull();
        assertThat(uploadSort.getDirection()).isEqualTo(Sort.Direction.DESC);

        assertThat(json).doesNotContain("attachmentId");
        assertThat(json).doesNotContain("slipId");
        assertThat(json).doesNotContain("downloadUrl");
        assertThat(json).doesNotContain("storage.example");
        assertThat(json).doesNotContain(rawUploader);
    }

    @Test
    void listPhotoAudit_salesRole_returns403() throws Exception {
        mockMvc.perform(get("/slips/admin/photo-audit")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES")
                        .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isForbidden());
    }

    @Test
    void listPhotoAudit_missingAuthentication_returns403() throws Exception {
        mockMvc.perform(get("/slips/admin/photo-audit")
                        .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isForbidden());
    }

    @Test
    void listPhotoAudit_declaresWarehouseManagerMasterGuard() throws Exception {
        Method method = SlipPhotoAuditAdminController.class.getMethod(
                "list",
                SlipAttachmentType.class,
                LocalDate.class,
                LocalDate.class,
                String.class,
                int.class,
                int.class);

        PreAuthorize annotation = method.getAnnotation(PreAuthorize.class);

        assertThat(annotation).isNotNull();
        assertThat(annotation.value()).isEqualTo("hasAnyRole('WAREHOUSE','MANAGER','MASTER')");
        assertThat(annotation.value()).doesNotContain("SALES");
    }

    @TestConfiguration
    @EnableMethodSecurity
    static class TestSecurityConfig {

        @Bean
        SecurityFilterChain testSecurityFilterChain(HttpSecurity http) throws Exception {
            http
                    .csrf(AbstractHttpConfigurer::disable)
                    .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                    .authorizeHttpRequests(auth -> auth.anyRequest().authenticated())
                    .addFilterBefore(new HeaderAuthenticationFilter(), UsernamePasswordAuthenticationFilter.class);
            return http.build();
        }
    }
}

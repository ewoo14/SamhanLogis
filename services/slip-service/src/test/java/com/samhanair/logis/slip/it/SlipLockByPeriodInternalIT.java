package com.samhanair.logis.slip.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.slip.SlipServiceApplication;
import com.samhanair.logis.slip.client.ArologisDispatchClient;
import com.samhanair.logis.slip.client.InventoryClient;
import com.samhanair.logis.slip.client.PartnerInternalClient;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.client.UserInternalClient;
import com.samhanair.logis.slip.client.WarehouseInternalClient;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipStatus;
import com.samhanair.logis.slip.repository.SlipRepository;
import jakarta.persistence.EntityManager;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * 월마감용 기간 잠금 internal endpoint IT.
 *
 * <p>{@code /internal/**} 경로에서 {@code InternalTokenFilter} 가 X-Internal-Token 을 인증하고,
 * controller 는 사용자 권한(@RequirePermission) 없이 ROLE_MASTER 내부 호출로만 기간 잠금을 수행한다.
 */
@SpringBootTest(classes = SlipServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class SlipLockByPeriodInternalIT extends AbstractPostgresIT {

    private static final String INTERNAL_TOKEN = "test-internal-token";
    private static final String URL = "/internal/slips/lock-by-period";

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private SlipRepository slipRepository;
    @Autowired private EntityManager entityManager;

    @MockBean private InventoryClient inventoryClient;
    @MockBean private ProductClient productClient;
    @MockBean private UserInternalClient userInternalClient;
    @MockBean private WarehouseInternalClient warehouseInternalClient;
    @MockBean private PartnerInternalClient partnerInternalClient;
    @MockBean private ArologisDispatchClient arologisDispatchClient;

    @BeforeEach
    void stubExternalClients() {
        Mockito.lenient().when(userInternalClient.resolveFullName(Mockito.any()))
                .thenReturn(Optional.empty());
    }

    @Test
    void missingInternalToken_returns403_beforeController() throws Exception {
        mockMvc.perform(post(URL)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "startDate", "2026-05-01",
                                "endDate", "2026-05-31"))))
                .andExpect(status().isForbidden());
    }

    @Test
    void invalidInternalToken_returns401_beforeController() throws Exception {
        mockMvc.perform(post(URL)
                        .header("X-Internal-Token", "wrong-token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "startDate", "2026-05-01",
                                "endDate", "2026-05-31"))))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void validInternalToken_locksConfirmedSlipsInPeriod() throws Exception {
        Slip inPeriod = createConfirmedOutbound("LOCK-OK-" + System.nanoTime(),
                LocalDate.of(2026, 5, 15));
        Slip outsidePeriod = createConfirmedOutbound("LOCK-OUT-" + System.nanoTime(),
                LocalDate.of(2026, 6, 1));

        mockMvc.perform(post(URL)
                        .header("X-Internal-Token", INTERNAL_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "startDate", "2026-05-01",
                                "endDate", "2026-05-31"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.startDate").value("2026-05-01"))
                .andExpect(jsonPath("$.data.endDate").value("2026-05-31"))
                .andExpect(jsonPath("$.data.status").value("CONFIRMED"))
                .andExpect(jsonPath("$.data.lockedCount").value(1));

        entityManager.flush();
        entityManager.clear();

        Slip locked = slipRepository.findById(inPeriod.getId()).orElseThrow();
        Slip untouched = slipRepository.findById(outsidePeriod.getId()).orElseThrow();
        assertThat(locked.getStatus()).isEqualTo(SlipStatus.CONFIRMED);
        assertThat(locked.getLockFlag()).isTrue();
        assertThat(untouched.getLockFlag()).isFalse();
    }

    @Test
    void publicLockByPeriodEndpoint_isRemoved() throws Exception {
        var result = mockMvc.perform(post("/slips/lock-by-period")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "startDate", "2026-05-01",
                                "endDate", "2026-05-31"))))
                .andReturn();

        assertThat(result.getHandler()).isNull();
        assertThat(result.getResponse().getStatus()).isBetween(400, 599);
    }

    private Slip createConfirmedOutbound(String partnerCode, LocalDate slipDate) {
        Slip slip = Slip.createOutbound(
                slipDate.toString().replace("-", "/") + "-" + Math.floorMod(System.nanoTime(), 100000),
                slipDate,
                1,
                UUID.randomUUID(),
                UUID.randomUUID(),
                UUID.randomUUID(),
                "마감테스트거래처",
                null,
                "마감 테스트",
                "tester");
        slip.updateSalesHeader("마감테스트거래처", partnerCode, null, null, null, null, null, null, null);

        Slip saved = slipRepository.saveAndFlush(slip);
        entityManager.flush();
        entityManager.createQuery(
                        "UPDATE Slip s SET s.status = :status, s.confirmedAt = :confirmedAt WHERE s.id = :id")
                .setParameter("status", SlipStatus.CONFIRMED)
                .setParameter("confirmedAt", LocalDateTime.of(slipDate, LocalTime.NOON))
                .setParameter("id", saved.getId())
                .executeUpdate();
        entityManager.flush();
        entityManager.refresh(saved);
        return saved;
    }
}

package com.samhanair.logis.dcconfig.it;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.dcconfig.DcConfigServiceApplication;
import com.samhanair.logis.dcconfig.domain.DcConfig;
import com.samhanair.logis.dcconfig.domain.DcConfigSource;
import com.samhanair.logis.dcconfig.domain.Partner;
import com.samhanair.logis.dcconfig.domain.PartnerGroup;
import com.samhanair.logis.dcconfig.domain.UnitRoundMode;
import com.samhanair.logis.dcconfig.repository.DcConfigRepository;
import com.samhanair.logis.dcconfig.repository.PartnerRepository;
import java.math.BigDecimal;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * DC 노출 5겹 가드 의 5번째 — X-Internal-Token 검증.
 *
 * <p>토큰 누락 → 401, 정상 토큰 → 200 + DC 필드 노출 (internal 응답).
 */
@SpringBootTest(classes = DcConfigServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class InternalDcConfigControllerIT extends AbstractPostgresIT {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private PartnerRepository partnerRepository;

    @Autowired
    private DcConfigRepository dcConfigRepository;

    private String partnerCode;

    @BeforeEach
    void setUp() {
        partnerCode = "P-INT-" + UUID.randomUUID().toString().substring(0, 8);
        Partner partner = partnerRepository.save(Partner.create(
                partnerCode, "9876543210", "내부 테스트 거래처", "부산시 해운대구",
                "051-000-0000", "김담당", PartnerGroup.WHOLESALE,
                new BigDecimal("50000000"), null));

        DcConfig config = DcConfig.create(partner, DcConfigSource.LEGACY_CSV);
        config.changeRates(new BigDecimal("0.0500"), new BigDecimal("0.0800"));
        config.changeShowIHose(false);
        config.changeOptionAmounts(
                new BigDecimal("10000"), new BigDecimal("20000"), null, null, null, null);
        config.changeRounding(1000, UnitRoundMode.FLOOR);
        dcConfigRepository.save(config);
    }

    @Test
    void internalPartner_missingToken_returns401() throws Exception {
        mockMvc.perform(get("/internal/partners/" + partnerCode))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void internalPartner_wrongToken_returns401() throws Exception {
        mockMvc.perform(get("/internal/partners/" + partnerCode)
                        .header("X-Internal-Token", "wrong-token"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void internalPartner_correctToken_returnsPartnerWithDc() throws Exception {
        mockMvc.perform(get("/internal/partners/" + partnerCode)
                        .header("X-Internal-Token", "test-internal-token"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.partnerCode").value(partnerCode))
                .andExpect(jsonPath("$.data.name").value("내부 테스트 거래처"))
                .andExpect(jsonPath("$.data.bizNo").value("9876543210"))
                .andExpect(jsonPath("$.data.partnerGroup").value("WHOLESALE"))
                .andExpect(jsonPath("$.data.dcConfig.homeDiscountRate").value(0.05))
                .andExpect(jsonPath("$.data.dcConfig.commercialDiscountRate").value(0.08))
                .andExpect(jsonPath("$.data.dcConfig.unitRoundMode").value("FLOOR"));
    }

    @Test
    void internalDcConfig_missingToken_returns401() throws Exception {
        mockMvc.perform(get("/internal/partner-dc-configs/" + partnerCode))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void internalDcConfig_correctToken_returnsDc() throws Exception {
        mockMvc.perform(get("/internal/partner-dc-configs/" + partnerCode)
                        .header("X-Internal-Token", "test-internal-token"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.partnerCode").value(partnerCode))
                .andExpect(jsonPath("$.data.homeDiscountRate").value(0.05))
                .andExpect(jsonPath("$.data.discount360Amount").value(10000))
                .andExpect(jsonPath("$.data.unitRoundMode").value("FLOOR"));
    }

    @Test
    void internalDcConfig_unknownPartner_returns404() throws Exception {
        mockMvc.perform(get("/internal/partner-dc-configs/UNKNOWN-PARTNER")
                        .header("X-Internal-Token", "test-internal-token"))
                .andExpect(status().isNotFound());
    }
}

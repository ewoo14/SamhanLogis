package com.samhanair.logis.dcconfig.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.dcconfig.DcConfigServiceApplication;
import com.samhanair.logis.dcconfig.domain.DcConfig;
import com.samhanair.logis.dcconfig.domain.DcConfigSource;
import com.samhanair.logis.dcconfig.domain.Partner;
import com.samhanair.logis.dcconfig.domain.PartnerGroup;
import com.samhanair.logis.dcconfig.domain.UnitRoundMode;
import com.samhanair.logis.dcconfig.repository.DcConfigRepository;
import com.samhanair.logis.dcconfig.repository.PartnerRepository;
import java.math.BigDecimal;
import java.util.Iterator;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/**
 * DC 노출 5겹 가드 의 4번째 (QA assertion) 핵심 IT.
 *
 * <p>외부 응답 페이로드를 캡처하여 DC 관련 키가 자체 부재함을 assert.
 * 즉, controller 코드가 잘못 변경되어도 본 IT 가 fail 함으로써 회귀 방지.
 */
@SpringBootTest(classes = DcConfigServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class PartnerPublicControllerIT extends AbstractPostgresIT {

    /** 응답 어떠한 위치에도 절대 노출되면 안 되는 DC 관련 키. */
    private static final List<String> FORBIDDEN_DC_KEYS = List.of(
            "homeDiscountRate",
            "commercialDiscountRate",
            "discount360Amount",
            "discount4WayAmount",
            "discount1WayAmount",
            "discountStandAmount",
            "discountDeluxeAmount",
            "discountFirstGradeAmount",
            "unitRoundTo",
            "unitRoundMode",
            "showIHose",
            "dcConfig",
            "creditLimit",
            "bizNo"
    );

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private PartnerRepository partnerRepository;

    @Autowired
    private DcConfigRepository dcConfigRepository;

    private String partnerCode;

    @BeforeEach
    void setUp() {
        partnerCode = "P-PUB-" + UUID.randomUUID().toString().substring(0, 8);
        Partner partner = partnerRepository.save(Partner.create(
                partnerCode, "1234567890", "테스트 거래처", "서울시 강남구",
                "02-000-0000", "홍길동", PartnerGroup.DEALER_1ST,
                new BigDecimal("100000000"), "IT 시드"));

        // DC 설정도 생성 — public 응답에 DC 가 누출되는지 assert 하기 위함.
        DcConfig config = DcConfig.create(partner, DcConfigSource.LEGACY_CSV);
        config.changeRates(new BigDecimal("0.0700"), new BigDecimal("0.1000"));
        config.changeShowIHose(true);
        config.changeOptionAmounts(
                new BigDecimal("50000"), new BigDecimal("60000"), new BigDecimal("40000"),
                new BigDecimal("30000"), new BigDecimal("20000"), new BigDecimal("10000"));
        config.changeRounding(1000, UnitRoundMode.ROUND);
        dcConfigRepository.save(config);
    }

    @Test
    void publicResponse_doesNotLeakAnyDcField() throws Exception {
        MvcResult result = mockMvc.perform(get("/partners/" + partnerCode)
                .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MASTER"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.partnerCode").value(partnerCode))
                .andExpect(jsonPath("$.data.name").value("테스트 거래처"))
                .andReturn();

        String body = result.getResponse().getContentAsString();

        // DC 5겹 가드 의 4번째 — 응답 트리 어디에도 DC/credit/biz_no 키가 없어야 한다.
        JsonNode root = objectMapper.readTree(body);
        for (String forbidden : FORBIDDEN_DC_KEYS) {
            assertThat(containsKey(root, forbidden))
                    .as("public partner 응답에 금지된 키 '%s' 가 노출되었습니다 — DC 5겹 가드 위반!\n응답: %s",
                            forbidden, body)
                    .isFalse();
        }
    }

    @Test
    void publicResponse_returns404_whenPartnerMissing() throws Exception {
        mockMvc.perform(get("/partners/NON-EXISTENT-PARTNER")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isNotFound());
    }

    @Test
    void publicResponse_unauthenticated_returns403() throws Exception {
        mockMvc.perform(get("/partners/" + partnerCode))
                .andExpect(status().isForbidden());
    }

    private static boolean containsKey(JsonNode node, String key) {
        if (node == null) return false;
        if (node.isObject()) {
            Iterator<String> it = node.fieldNames();
            while (it.hasNext()) {
                String name = it.next();
                if (name.equals(key)) return true;
                if (containsKey(node.get(name), key)) return true;
            }
        } else if (node.isArray()) {
            for (JsonNode child : node) {
                if (containsKey(child, key)) return true;
            }
        }
        return false;
    }
}

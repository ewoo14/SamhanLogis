package com.samhanair.logis.product.it;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.product.domain.BranchPipeLookup;
import com.samhanair.logis.product.domain.MaterialPrice;
import com.samhanair.logis.product.domain.OduRecommendationLookup;
import com.samhanair.logis.product.domain.OduRecommendationLookup.RecommendationType;
import com.samhanair.logis.product.repository.BranchPipeLookupRepository;
import com.samhanair.logis.product.repository.MaterialPriceRepository;
import com.samhanair.logis.product.repository.OduRecommendationLookupRepository;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
import java.math.BigDecimal;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/** 견적/주문 라인 입력 lookup 3종 GET endpoint IT. */
@SpringBootTest
@AutoConfigureMockMvc
@DirtiesContext
@Transactional
class ProductLookupControllerIT extends AbstractPostgresIT {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private MaterialPriceRepository materialPriceRepository;

    @Autowired
    private OduRecommendationLookupRepository oduRecommendationLookupRepository;

    @Autowired
    private BranchPipeLookupRepository branchPipeLookupRepository;

    @MockBean
    private DynamicPermissionClient dynamicPermissionClient;

    @BeforeEach
    void setUpPermission() {
        lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.check(
                        any(UUID.class), anyString(), any(PermissionAction.class)))
                .thenReturn(true);
    }

    @Test
    void materialPrices_returnsAllSortedByNumericSuffixAndExcludesSoftDeletedRows() throws Exception {
        MaterialPrice d10 = MaterialPrice.seed("D10", "D10 자재", new BigDecimal("10000.00"),
                "옵션10", "=D10");
        MaterialPrice d2 = MaterialPrice.seed("D2", "D2 자재", new BigDecimal("2000.00"),
                "옵션2", "=D2");
        MaterialPrice deleted = MaterialPrice.seed("D3", "삭제 자재", new BigDecimal("3000.00"),
                "삭제", "=D3");
        deleted.markDeleted("test-it");
        materialPriceRepository.save(d10);
        materialPriceRepository.save(d2);
        materialPriceRepository.save(deleted);
        materialPriceRepository.flush();

        mockMvc.perform(withActor(get("/api/v1/material-prices")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].materialKey").value("D2"))
                .andExpect(jsonPath("$[0].name").value("D2 자재"))
                .andExpect(jsonPath("$[0].optionLabel").value("옵션2"))
                .andExpect(jsonPath("$[0].id").doesNotExist())
                .andExpect(jsonPath("$[0].computedFormula").doesNotExist())
                .andExpect(jsonPath("$[1].materialKey").value("D10"))
                .andExpect(jsonPath("$[?(@.materialKey == 'D3')]").doesNotExist());
    }

    @Test
    void oduRecommendations_returnsSortedRowsAndSupportsOptionalTypeFilter() throws Exception {
        OduRecommendationLookup home = OduRecommendationLookup.seed(
                RecommendationType.HOME_MULTI, new BigDecimal("6.00"), 2, "5HP");
        OduRecommendationLookup multiLow = OduRecommendationLookup.seed(
                RecommendationType.MULTI_HEATING_COOLING, new BigDecimal("3.00"), null, "3HP");
        OduRecommendationLookup multiHigh = OduRecommendationLookup.seed(
                RecommendationType.MULTI_HEATING_COOLING, new BigDecimal("7.00"), null, "7HP");
        OduRecommendationLookup deleted = OduRecommendationLookup.seed(
                RecommendationType.HOME_MULTI, new BigDecimal("2.00"), 1, "2HP");
        deleted.markDeleted("test-it");
        oduRecommendationLookupRepository.save(home);
        oduRecommendationLookupRepository.save(multiHigh);
        oduRecommendationLookupRepository.save(multiLow);
        oduRecommendationLookupRepository.save(deleted);
        oduRecommendationLookupRepository.flush();

        mockMvc.perform(withActor(get("/api/v1/odu-recommendations")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].recommendationType").value("HOME_MULTI"))
                .andExpect(jsonPath("$[0].indoorCapacity").value(6.0))
                .andExpect(jsonPath("$[1].recommendationType").value("MULTI_HEATING_COOLING"))
                .andExpect(jsonPath("$[1].indoorCapacity").value(3.0))
                .andExpect(jsonPath("$[2].indoorCapacity").value(7.0))
                .andExpect(jsonPath("$[?(@.outdoorHp == '2HP')]").doesNotExist());

        mockMvc.perform(withActor(get("/api/v1/odu-recommendations")
                        .param("type", "MULTI_HEATING_COOLING")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].recommendationType").value("MULTI_HEATING_COOLING"))
                .andExpect(jsonPath("$[0].indoorCapacity").value(3.0))
                .andExpect(jsonPath("$[1].indoorCapacity").value(7.0))
                .andExpect(jsonPath("$[?(@.recommendationType == 'HOME_MULTI')]").doesNotExist());
    }

    @Test
    void branchPipes_returnsSortedRowsAndSupportsOptionalBranchCodeFilter() throws Exception {
        BranchPipeLookup branch2512 = BranchPipeLookup.seed("2512", "25/12", 2);
        BranchPipeLookup branch1509 = BranchPipeLookup.seed("1509", "15/09", 1);
        BranchPipeLookup deleted = BranchPipeLookup.seed("9999", "삭제", 9);
        deleted.markDeleted("test-it");
        branchPipeLookupRepository.save(branch2512);
        branchPipeLookupRepository.save(branch1509);
        branchPipeLookupRepository.save(deleted);
        branchPipeLookupRepository.flush();

        mockMvc.perform(withActor(get("/api/v1/branch-pipes")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].branchCode").value("1509"))
                .andExpect(jsonPath("$[0].description").value("15/09"))
                .andExpect(jsonPath("$[0].summaryQty").value(1))
                .andExpect(jsonPath("$[0].id").doesNotExist())
                .andExpect(jsonPath("$[1].branchCode").value("2512"))
                .andExpect(jsonPath("$[?(@.branchCode == '9999')]").doesNotExist());

        mockMvc.perform(withActor(get("/api/v1/branch-pipes").param("branchCode", "2512")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].branchCode").value("2512"))
                .andExpect(jsonPath("$[1]").doesNotExist());
    }

    private static org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder withActor(
            org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder request) {
        return request
                .header("X-User-Id", UUID.randomUUID().toString())
                .header("X-User-Role", "SALES");
    }
}

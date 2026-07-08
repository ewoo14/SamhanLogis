package com.samhanair.logis.partnerorder.it;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.partnerorder.PartnerOrderServiceApplication;
import com.samhanair.logis.partnerorder.client.DcConfigClient;
import com.samhanair.logis.partnerorder.client.EstimateCategory;
import com.samhanair.logis.partnerorder.client.InventoryClient;
import com.samhanair.logis.partnerorder.client.PartnerAuthClient;
import com.samhanair.logis.partnerorder.client.ProductClient;
import com.samhanair.logis.partnerorder.client.SlipServiceClient;
import com.samhanair.logis.partnerorder.client.UsageScope;
import com.samhanair.logis.partnerorder.service.BootstrapService;
import com.samhanair.logis.partnerorder.web.dto.BootstrapResponse;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;

/**
 * 17종 bootstrap 캐시 응답 + DC 9키 제거 가드 검증.
 *
 * <p>5 외부 client (DcConfig/Product/Inventory/Slip/PartnerAuth) 는 {@code @MockBean} 으로
 * 격리 — 메모리 가드 ({@code feedback_it_mockbean_external_clients}) — Eureka 비활성 환경에서도
 * Spring Context 부팅 통과.
 */
@SpringBootTest(classes = PartnerOrderServiceApplication.class)
class PartnerOrderBootstrapIT extends AbstractPostgresIT {

    @Autowired
    private BootstrapService bootstrapService;

    @MockBean
    private DcConfigClient dcConfigClient;

    @MockBean
    private ProductClient productClient;

    @MockBean
    private InventoryClient inventoryClient;

    @MockBean
    private SlipServiceClient slipServiceClient;

    @MockBean
    private PartnerAuthClient partnerAuthClient;

    @BeforeEach
    void setUp() {
        // 모든 외부 client mock — confirm 흐름 외에는 호출되지 않음
        Mockito.lenient().when(dcConfigClient.calculatePrices(Mockito.anyString(), Mockito.anyList()))
                .thenReturn(Map.of());
        Mockito.lenient().when(productClient.lookup(Mockito.anyList()))
                .thenReturn(List.of());
        Mockito.lenient().when(slipServiceClient.publishFromPartnerOrder(
                        Mockito.anyMap(), Mockito.anyString()))
                .thenReturn(SlipServiceClient.PublishResult.published("STUB-SLIP"));
        // hasProductData 는 실 catalog 존재로만 트리거되어야 한다(BootstrapService 회귀 fix —
        // priceChangeSchedule 단독 존재는 hasProductData 판정에서 제외). 이 IT 는 product_db
        // 변환 경로로 17번째 키(priceChangeSchedule)가 정상 통과하는지 검증하는 것이 목적이므로,
        // 최소 1개 catalog 행을 스텁해 hasProductData=true 를 realistic 하게 성립시킨다.
        Mockito.lenient().when(estimateCatalogClient.catalog(
                        Mockito.any(EstimateCategory.class), Mockito.any(UsageScope.class)))
                .thenReturn(List.of(Map.of("modelCode", "HM-TEST", "name", "부트스트랩 IT 테스트 실내기")));
        Mockito.lenient().when(estimateCatalogClient.priceBaseline())
                .thenReturn(List.of());
        Mockito.lenient().when(estimateCatalogClient.priceChangeSchedule())
                .thenReturn(Map.of("homemulti", LocalDate.of(2026, 4, 1)));
    }

    @Test
    void bootstrap_17_keys_seeded_and_dc_secrets_stripped_from_config() {
        BootstrapResponse response = bootstrapService.fetch();
        Map<String, Object> payloads = response.payloads();

        // 17개 키 모두 존재 + 순서 보존
        assertThat(payloads.keySet()).containsExactlyElementsOf(BootstrapService.CACHE_KEYS);
        assertThat(payloads.get("priceChangeSchedule"))
                .isEqualTo(Map.of("homemulti", LocalDate.of(2026, 4, 1)));

        // config 키는 DC 9키 미포함 (BootstrapService 가 strip)
        Object cfg = payloads.get("config");
        assertThat(cfg).isInstanceOf(Map.class);
        @SuppressWarnings("unchecked")
        Map<String, Object> configMap = (Map<String, Object>) cfg;
        for (String secretKey : BootstrapService.DC_SECRET_KEYS) {
            assertThat(configMap).doesNotContainKey(secretKey);
        }

        // V2 시드의 vatRate 는 노출됨
        assertThat(configMap).containsKey("vatRate");
    }
}

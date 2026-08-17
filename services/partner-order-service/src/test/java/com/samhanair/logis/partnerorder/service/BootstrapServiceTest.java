package com.samhanair.logis.partnerorder.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.partnerorder.client.EstimateCatalogClient;
import com.samhanair.logis.partnerorder.client.EstimateCategory;
import com.samhanair.logis.partnerorder.client.GoogleSheetsClient;
import com.samhanair.logis.partnerorder.client.GoogleSheetsClient.ValueRenderMode;
import com.samhanair.logis.partnerorder.client.UsageScope;
import com.samhanair.logis.partnerorder.domain.BootstrapCacheConfig;
import com.samhanair.logis.partnerorder.repository.BootstrapCacheConfigRepository;
import com.samhanair.logis.partnerorder.web.dto.BootstrapResponse;
import java.io.IOException;
import java.math.BigDecimal;
import java.lang.reflect.Field;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;

/**
 * BootstrapService 단위 테스트 — PR-D Part 1 시트 prefetch + V2 seed fallback 2 시나리오.
 *
 * <p>시나리오:
 * <ul>
 *   <li>prefetch_시트성공 — sheet read 결과가 V2 seed 보다 우선 (sheetCache 적용)</li>
 *   <li>prefetch_시트실패 — sheet read 예외 → V2 seed payload 그대로 반환 (graceful fallback)</li>
 * </ul>
 */
@ExtendWith({MockitoExtension.class, OutputCaptureExtension.class})
class BootstrapServiceTest {

    @Mock
    private BootstrapCacheConfigRepository cacheRepository;

    @Mock
    private GoogleSheetsClient sheetsClient;

    @Mock
    private EstimateCatalogClient estimateCatalogClient;

    private final ObjectMapper objectMapper = new ObjectMapper();

    private BootstrapService bootstrapService;

    @BeforeEach
    void setUp() throws Exception {
        bootstrapService = new BootstrapService(
                cacheRepository, objectMapper, sheetsClient, estimateCatalogClient);
        // @Value 주입 우회 (Reflection)
        setField("bootstrapSheetId", "test-sheet-id");
        setField("sheetPrefetchEnabled", true);
        setField("rangeMap", Map.of(
                "homemulti", "홈멀티!A1:Z",
                "homeInc", "홈멀티_단가인상!A1:Z"));
        lenient().when(estimateCatalogClient.catalog(any(EstimateCategory.class), any(UsageScope.class)))
                .thenReturn(List.of());
        lenient().when(estimateCatalogClient.components(any(EstimateCategory.class)))
                .thenReturn(List.of());
        lenient().when(estimateCatalogClient.materialPrices())
                .thenReturn(List.of());
        lenient().when(estimateCatalogClient.priceBaseline())
                .thenReturn(List.of());
        lenient().when(estimateCatalogClient.priceChangeSchedule())
                .thenReturn(Map.of());
    }

    private void setField(String name, Object value) throws Exception {
        Field f = BootstrapService.class.getDeclaredField(name);
        f.setAccessible(true);
        f.set(bootstrapService, value);
    }

    @Test
    void prefetch는_시트설정과_무관하게_DB와_seed만_사용한다() throws Exception {
        // given — 시트 read mock이 있어도 runtime에서는 호출하지 않는다.
        List<List<Object>> baseRows = List.of(
                List.of("Hi-Multi 4-Way", "AJ040RXH4BC1", "1,500,000"));
        List<List<Object>> increaseRows = List.of(
                List.of("Hi-Multi 4-Way", "AJ040RXH4BC1", "1,611,115"));
        lenient().when(sheetsClient.readSheet(eq("test-sheet-id"), eq("홈멀티!A1:Z"), eq(ValueRenderMode.FORMATTED)))
                .thenReturn(baseRows);
        lenient().when(sheetsClient.readSheet(eq("test-sheet-id"), eq("홈멀티_단가인상!A1:Z"), eq(ValueRenderMode.FORMATTED)))
                .thenReturn(increaseRows);
        // config 는 credential-bearing sheet 를 읽지 않고 V2 seed fallback 만 사용한다.
        when(cacheRepository.findAllByOrderByCacheKeyAsc()).thenReturn(List.of(
                makeCacheRow("homemulti", "[]"),
                makeCacheRow("homeInc", "[]"),
                makeCacheRow("config", "{\"vatRate\":0.1,\"homeDiscount\":0.45,\"deliveryDays\":3}")));

        // when — 부팅 prefetch + fetch
        bootstrapService.prefetch();
        BootstrapResponse response = bootstrapService.fetch();

        // then — DB catalog가 없으므로 seed fallback + DC 9키 strip
        assertThat(response.payloads().get("homemulti")).isEqualTo(List.of());
        assertThat(response.payloads().get("homeInc")).isEqualTo(List.of());
        @SuppressWarnings("unchecked")
        Map<String, Object> configMap = (Map<String, Object>) response.payloads().get("config");
        assertThat(configMap).containsKey("vatRate").containsKey("deliveryDays");
        assertThat(configMap).doesNotContainKey("homeDiscount");
        verify(sheetsClient, never()).readSheet(anyString(), anyString(), any(ValueRenderMode.class));
        // 매핑 없는 키는 V2 seed 가 없으므로 빈 객체 (legacy graceful)
        assertThat(response.payloads().get("singleParts")).isEqualTo(List.of());
    }

    @Test
    void prefetch_시트read_실패시_V2_seed_fallback() throws Exception {
        // given — 시트 read 모두 실패 (Service Account JSON 부재 시뮬레이션)
        lenient().when(sheetsClient.readSheet(anyString(), anyString(), any(ValueRenderMode.class)))
                .thenThrow(new IOException("Service Account JSON 키가 존재하지 않습니다"));
        // V2 seed 보유: homemulti 1건 + config DC 9키 포함
        String configJson = "{\"vatRate\":0.1,\"homeDiscount\":0.45,\"deliveryDays\":3}";
        when(cacheRepository.findAllByOrderByCacheKeyAsc()).thenReturn(List.of(
                makeCacheRow("homemulti", "[[\"seed-row\"]]"),
                makeCacheRow("config", configJson)));

        // when — 부팅 prefetch (실패 catch + log) + fetch (V2 seed fallback)
        bootstrapService.prefetch();
        BootstrapResponse response = bootstrapService.fetch();

        // then — V2 seed payload 가 그대로 반환되며, config 의 DC 9키 strip 가드는 정상 동작
        assertThat(response.payloads().get("homemulti")).isEqualTo(List.of(List.of("seed-row")));
        @SuppressWarnings("unchecked")
        Map<String, Object> configMap = (Map<String, Object>) response.payloads().get("config");
        assertThat(configMap).containsKey("vatRate").containsKey("deliveryDays");
        assertThat(configMap).doesNotContainKey("homeDiscount");
        // 모든 bootstrap 키가 존재한다 (없는 키는 빈 객체/배열).
        assertThat(response.payloads().keySet()).containsExactlyElementsOf(BootstrapService.CACHE_KEYS);
        assertThat(BootstrapService.CACHE_KEYS).contains("commPartsInc");
    }

    @Test
    void fetch_productCatalog와_seed가_없어도_key별_default_shape를_보존한다() throws Exception {
        // given — product_db catalog 가 비어 hasProductData=false 이고, V2 seed row 도 없는
        // 신규 키 fallback 경로. map 계약 키가 [] 로 내려가면 FE 의 [model]/[key] 접근 계약이 흔들린다.
        setField("sheetPrefetchEnabled", false);
        when(cacheRepository.findAllByOrderByCacheKeyAsc()).thenReturn(List.of());

        // when
        BootstrapResponse response = bootstrapService.fetch();

        // then — row-list 계약 키는 [] 유지
        assertThat(response.payloads().get("homemulti")).isEqualTo(List.of());
        assertThat(response.payloads().get("commercialParts")).isEqualTo(List.of());

        // then — map/object 계약 키는 {} 유지
        assertThat(response.payloads().get("commPartsInc")).isEqualTo(Map.of());
        assertThat(response.payloads().get("homeInc")).isEqualTo(Map.of());
        assertThat(response.payloads().get("singleMatPrices")).isEqualTo(Map.of());
        assertThat(response.payloads().get("specDetailMap")).isEqualTo(Map.of());
        assertThat(response.payloads().get("priceChangeSchedule")).isEqualTo(Map.of());
        assertThat(response.payloads().get("logoData")).isEqualTo("");
    }

    @Test
    void prefetch_비활성토글이면_시트read_미발생() throws Exception {
        // given
        setField("sheetPrefetchEnabled", false);

        // when
        bootstrapService.prefetch();

        // then
        verify(sheetsClient, never()).readSheet(anyString(), anyString(), any(ValueRenderMode.class));
    }

    @Test
    void 시트_설정이_활성이고_환경변수가_주입되어도_시트에_연결하지_않고_DB_카탈로그를_유지한다() throws Exception {
        when(estimateCatalogClient.catalog(EstimateCategory.HOME_MULTI, UsageScope.PARTNER_ORDER))
                .thenReturn(List.of(catalogRow("AR 실내기", "AR06D1150HZS", "EA", "148000", "370000",
                        "실내기", "세트", "", false, null, null, false, null, null, null)));
        when(cacheRepository.findAllByOrderByCacheKeyAsc()).thenReturn(List.of());

        bootstrapService.prefetch();
        BootstrapResponse response = bootstrapService.fetch();

        verify(sheetsClient, never()).readSheet(anyString(), anyString(), any(ValueRenderMode.class));
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> catalog = (List<Map<String, Object>>) response.payloads().get("homemulti");
        assertThat(catalog).hasSize(1);
        assertThat(catalog.get(0)).containsEntry("model", "AR06D1150HZS");
        assertThat(catalog.get(0)).containsEntry("price", new BigDecimal("148000"));
    }

    @Test
    void fetch_한카테고리_실패시_정상카테고리는_보존하고_실패카테고리를_로그에_남긴다(
            CapturedOutput output) throws Exception {
        setField("sheetPrefetchEnabled", false);
        when(estimateCatalogClient.catalog(EstimateCategory.HOME_MULTI, UsageScope.PARTNER_ORDER))
                .thenThrow(new RuntimeException("HOME catalog unavailable"));
        when(estimateCatalogClient.catalog(EstimateCategory.COMMERCIAL_MULTI, UsageScope.PARTNER_ORDER))
                .thenReturn(List.of(catalogRow("상업 실외기", "CM-OK", "EA", "100", "200",
                        "실외기", "표준", "", false, null, null, false, null, null, null)));
        when(cacheRepository.findAllByOrderByCacheKeyAsc()).thenReturn(List.of());

        BootstrapResponse response = bootstrapService.fetch();

        assertThat(response.payloads().get("commercialMulti")).isNotEqualTo(List.of());
        assertThat(response.payloads().get("homemulti")).isEqualTo(List.of());
        assertThat(output.getOut()).contains("HOME_MULTI");
    }

    @Test
    void fetch_productDb_catalog를_legacy_bootstrap_shape로_변환한다() throws Exception {
        // given — product_db 행은 주문서 legacy key shape 로 변환되어야 한다.
        setField("sheetPrefetchEnabled", false);
        when(estimateCatalogClient.catalog(EstimateCategory.HOME_MULTI, UsageScope.PARTNER_ORDER))
                .thenReturn(List.of(catalogRow(
                        "홈 실내기", "HM-1", "EA", "123000", "456000",
                        "실내기", "4WAY", "소형", true, null, "12.5", false,
                        "홈 비고", "홈 규격", "7.2"),
                        catalogRow(
                                "홈 null 가격", "HM-NULL", "EA", "123000", null,
                                "실내기", "4WAY", "소형", true, null, null, false,
                                null, null, null)));
        when(estimateCatalogClient.catalog(EstimateCategory.COMMERCIAL_MULTI, UsageScope.PARTNER_ORDER))
                .thenReturn(List.of(catalogRow(
                        "상업 실외기", "CM-1", "EA", "222000", "333000",
                        "실외기", "표준형", "", true, null, "7", false,
                        "상업 비고", "상업 규격", "11.0"),
                        catalogRow(
                                "상업 0원", "CM-ZERO", "EA", "222000", "0",
                                "실외기", "표준형", "", true, null, null, false,
                                null, null, null)));
        when(estimateCatalogClient.catalog(EstimateCategory.SINGLE_SET, UsageScope.PARTNER_ORDER))
                .thenReturn(List.of(catalogRow(
                        "싱글 세트", "SS-1", "SET", "1000000", "1200000",
                        "4w", "premium", null, false, "D7", null, false,
                        "싱글 비고", "싱글 규격", null),
                        catalogRow(
                                "싱글 0원", "SS-ZERO", "SET", "0", "1200000",
                                "4w", "premium", null, false, "D7", null, false,
                                null, null, null)));
        when(estimateCatalogClient.catalog(EstimateCategory.LEGACY, UsageScope.PARTNER_ORDER))
                .thenReturn(List.of(catalogRow(
                        "구형 스탠드", "OLD-1", "EA", "800000", "1600000",
                        null, null, null, false, null, null, true,
                        "구형 비고", "구형 규격", null)));
        when(estimateCatalogClient.components(EstimateCategory.SINGLE_SET))
                .thenReturn(List.of(componentRow(
                        "SS-1", "PANEL-1", "싱글 판넬", "EA",
                        "55000", "66000", "PANEL", "기본", true, "2", "판넬 규격"),
                        componentRow(
                                "SS-1", "PANEL-NULL", "싱글 null 판넬", "EA",
                                null, "66000", "PANEL", "선택", false, "판넬 규격")));
        when(estimateCatalogClient.components(EstimateCategory.COMMERCIAL_MULTI))
                .thenReturn(List.of(componentRow(
                        "CM-1", "COMM-PART-1", "상업 구성품", "EA",
                        "77000", "88000", "OUTDOOR", "선택", false, "3", "상업 구성 규격"),
                        componentRow(
                                "CM-1", "COMM-PART-2", "상업 구성품2", "EA",
                                "80000", "90000", "OUTDOOR", "선택", false, "상업 구성 규격2")));
        when(estimateCatalogClient.materialPrices())
                .thenReturn(List.of(
                        Map.of("name", "D7", "price", new BigDecimal("43000")),
                        Map.of("name", "D8", "price", new BigDecimal("51000"))));
        when(estimateCatalogClient.priceBaseline())
                .thenReturn(List.of(
                        baselineRow("HM-1", "HOME_MULTI", "440000", "111000"),
                        baselineRow("CM-1", "COMMERCIAL_MULTI", "320000", "222000"),
                        baselineRow("SS-1", "SINGLE_SET", "1100000", "900000"),
                        baselineRow("PANEL-1", "SINGLE_SET", "65000", "50000"),
                        baselineRow("COMM-PART-1", null, null, "76000"),
                        baselineRow("COMM-PART-2", null, "82000", "99999")));
        when(estimateCatalogClient.priceChangeSchedule())
                .thenReturn(Map.of(
                        "homemulti", LocalDate.of(2026, 4, 1),
                        "singleSets", LocalDate.of(2026, 4, 1),
                        "commercialMulti", LocalDate.of(2026, 5, 1)));
        when(cacheRepository.findAllByOrderByCacheKeyAsc()).thenReturn(List.of(
                makeCacheRow("config", "{\"vatRate\":0.1,\"homeDiscount\":0.45}")));

        // when
        BootstrapResponse response = bootstrapService.fetch();
        Map<String, Object> payloads = response.payloads();

        // then — 홈/상업 멀티는 납품가=price, 출고가=list, 변동DC/useK2와 한글 고정DC 키 보존.
        @SuppressWarnings("unchecked")
        Map<String, Object> home = ((List<Map<String, Object>>) payloads.get("homemulti")).get(0);
        assertThat(home).containsEntry("name", "홈 실내기")
                .containsEntry("model", "HM-1")
                .containsEntry("unit", "EA")
                .containsEntry("price", new BigDecimal("123000"))
                .containsEntry("list", new BigDecimal("456000"))
                .containsEntry("useK2", true)
                .containsEntry("고정DC", new BigDecimal("12.5"))
                .containsEntry("capacity", "7.2")
                .containsEntry("spec", "홈 규격")
                .containsEntry("catL", "실내기")
                .containsEntry("catM", "4WAY")
                .containsEntry("catS", "소형")
                .containsEntry("disp", "홈 실내기")
                .containsEntry("note", "홈 비고");

        // then — 싱글 세트는 납품가를 price/priceRaw/priceRight 에 반복하고 matKey 를 보존.
        @SuppressWarnings("unchecked")
        Map<String, Object> single = ((List<Map<String, Object>>) payloads.get("singleSets")).get(0);
        assertThat(single).containsEntry("name", "싱글 세트")
                .containsEntry("model", "SS-1")
                .containsEntry("price", new BigDecimal("1000000"))
                .containsEntry("priceRaw", new BigDecimal("1000000"))
                .containsEntry("priceRight", new BigDecimal("1000000"))
                .containsEntry("matKey", "D7")
                .containsEntry("catL", "4w")
                .containsEntry("catM", "premium")
                .containsEntry("note", "싱글 비고")
                .containsKey("id");

        // then — 구형은 price/sheetPrice 의미가 반대다: price=출고가, sheetPrice=납품가.
        @SuppressWarnings("unchecked")
        Map<String, Object> old = ((List<Map<String, Object>>) payloads.get("oldProducts")).get(0);
        assertThat(old).containsEntry("name", "구형 스탠드")
                .containsEntry("model", "OLD-1")
                .containsEntry("price", new BigDecimal("1600000"))
                .containsEntry("sheetPrice", new BigDecimal("800000"))
                .containsEntry("isDisc", true)
                .containsEntry("remarks", "구형 비고")
                .containsEntry("spec", "구형 규격");

        // then — 구성품 가격은 싱글=납품가, 상업=출고가 우선.
        @SuppressWarnings("unchecked")
        Map<String, Object> singlePart = ((List<Map<String, Object>>) payloads.get("singleParts")).get(0);
        assertThat(singlePart).containsEntry("setModel", "SS-1")
                .containsEntry("model", "PANEL-1")
                .containsEntry("name", "싱글 판넬")
                .containsEntry("price", new BigDecimal("55000"))
                .containsEntry("qty", new BigDecimal("2"))
                .containsEntry("kind", "PANEL")
                .containsEntry("isDefault", true)
                .containsEntry("feat", "기본")
                .containsEntry("spec", "판넬 규격");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> commercialParts = (List<Map<String, Object>>) payloads.get("commercialParts");
        Map<String, Object> commercialPart = commercialParts.get(0);
        assertThat(commercialPart)
                .containsEntry("price", new BigDecimal("88000"))
                .containsEntry("qty", new BigDecimal("3"));
        assertThat(commercialParts.get(1))
                .containsEntry("qty", BigDecimal.ONE);

        // then — 자재가격/단가인상은 배열이 아니라 legacy 객체맵이다.
        // 모델 B: base catalog 는 인상 후를 유지하고, INC 맵은 price-baseline(인상 전) 값이다.
        // baseline 이 없는 모델은 INC 에 넣지 않아 FE 가 base(후)를 유지하게 한다.
        assertThat(payloads.get("singleMatPrices"))
                .isEqualTo(Map.of("D7", new BigDecimal("43000"), "D8", new BigDecimal("51000")));
        assertThat(payloads.get("homeInc")).isEqualTo(Map.of("HM-1", new BigDecimal("440000")));
        assertThat(payloads.get("commInc")).isEqualTo(Map.of("CM-1", new BigDecimal("320000")));
        assertThat(payloads.get("singleInc")).isEqualTo(Map.of("SS-1", new BigDecimal("900000")));
        assertThat(payloads.get("singlePartsInc")).isEqualTo(Map.of("PANEL-1", new BigDecimal("50000")));
        // commPartsInc: firstDecimal(출고가 우선·납품가 fallback). COMM-PART-1=출고가 null→납품가 76000,
        // COMM-PART-2=출고가 82000 채택(납품가 99999 아님) — 출고가 우선순위 잠금(M-be1).
        assertThat(payloads.get("commPartsInc")).isEqualTo(Map.of(
                "COMM-PART-1", new BigDecimal("76000"),
                "COMM-PART-2", new BigDecimal("82000")));
        assertThat(payloads.get("priceChangeSchedule")).isEqualTo(Map.of(
                "homemulti", LocalDate.of(2026, 4, 1),
                "singleSets", LocalDate.of(2026, 4, 1),
                "commercialMulti", LocalDate.of(2026, 5, 1)));
        verify(estimateCatalogClient).priceBaseline();
        verify(estimateCatalogClient).priceChangeSchedule();

        @SuppressWarnings("unchecked")
        Map<String, Object> configMap = (Map<String, Object>) payloads.get("config");
        assertThat(configMap).containsKey("vatRate").doesNotContainKey("homeDiscount");
    }

    @Test
    void fetch_catalog가_모두_비어있고_priceChangeSchedule만_존재해도_product_db_변환을_사용하지_않는다() throws Exception {
        // given — 관리자가 스케줄만 선(先)세팅하고 상품 catalog 는 아직 비어있는 상태(현실적 시나리오:
        // product-service 카탈로그 등록 전에 단가변동 스케줄부터 구성). 시트도 비활성화해 V2 seed
        // fallback 경로만 검증한다.
        setField("sheetPrefetchEnabled", false);
        when(estimateCatalogClient.priceChangeSchedule())
                .thenReturn(Map.of("homemulti", LocalDate.of(2026, 4, 1)));
        when(cacheRepository.findAllByOrderByCacheKeyAsc()).thenReturn(List.of(
                makeCacheRow("homemulti", "[[\"seed-row\"]]")));

        // when
        bootstrapService.prefetch();
        BootstrapResponse response = bootstrapService.fetch();

        // then — hasProductData 가 schedule 존재만으로 true 오판되면 productCatalogCache 에
        // homemulti=[] 가 캐싱되어 seed 값을 영구 override 했을 것이다. 회귀 fix 후에는 seed 값 유지.
        assertThat(response.payloads().get("homemulti")).isEqualTo(List.of(List.of("seed-row")));
    }

    @Test
    void fetch_catalog가_모두_비어있고_priceBaseline만_존재해도_product_db_변환을_사용하지_않는다() throws Exception {
        // given — priceChangeSchedule 과 동일 결함 패턴: 구형/폐기 모델의 historical baseline 행만
        // 남아있고 실 catalog 는 비어있는 경우도 hasProductData 를 오판시키지 않아야 한다.
        setField("sheetPrefetchEnabled", false);
        when(estimateCatalogClient.priceBaseline())
                .thenReturn(List.of(baselineRow("OLD-1", "LEGACY", "100000", "90000")));
        when(cacheRepository.findAllByOrderByCacheKeyAsc()).thenReturn(List.of(
                makeCacheRow("homemulti", "[[\"seed-row\"]]")));

        // when
        bootstrapService.prefetch();
        BootstrapResponse response = bootstrapService.fetch();

        // then
        assertThat(response.payloads().get("homemulti")).isEqualTo(List.of(List.of("seed-row")));
    }

    @Test
    void fetch_priceChangeSchedule_예외발생시에도_catalog_7종_payload는_보존된다() throws Exception {
        // given — BE-2 (#688 S3 R1 리뷰): priceChangeSchedule() 이 실패해도 이미 조회에 성공한
        // catalog 7종(homemulti~materialPrices)은 loadProductCatalogPayloadsSafely() 의 catch-all
        // 에 휩쓸려 Map.of() 로 폐기되지 않고, priceChangeSchedule 만 빈 Map 으로 fallback 해야 한다.
        // (fix 전에는 이 예외가 loadProductCatalogPayloads() 밖으로 전파되어 catalog 7종까지
        // 통째로 사라졌다 — hasProductData 오판 버그(#688)와 동형의 회귀.)
        setField("sheetPrefetchEnabled", false);
        when(estimateCatalogClient.catalog(EstimateCategory.HOME_MULTI, UsageScope.PARTNER_ORDER))
                .thenReturn(List.of(catalogRow(
                        "홈 실내기", "HM-1", "EA", "123000", "456000",
                        "실내기", "4WAY", "소형", true, null, null, false,
                        null, null, null)));
        when(estimateCatalogClient.priceChangeSchedule())
                .thenThrow(new RuntimeException("product-service price-change-schedule 5xx"));
        when(cacheRepository.findAllByOrderByCacheKeyAsc()).thenReturn(List.of());

        // when
        BootstrapResponse response = bootstrapService.fetch();

        // then — homemulti catalog 는 정상 변환되어 그대로 반환되고 (Map.of() 로 폐기되지 않음),
        // priceChangeSchedule 만 빈 Map 으로 fallback 한다.
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> home = (List<Map<String, Object>>) response.payloads().get("homemulti");
        assertThat(home).hasSize(1);
        assertThat(home.get(0)).containsEntry("model", "HM-1");
        assertThat(response.payloads().get("priceChangeSchedule")).isEqualTo(Map.of());
    }

    @Test
    void fetch_priceBaseline_가격이_0또는_null이면_incPriceMap에서_제외된다() throws Exception {
        // given — QA-4: baseline row 자체는 존재하나 releasePrice/deliveryPrice 가 0 또는 null 인
        // 경우 incPriceMap 의 price<=0 guard(BootstrapService.incPriceMap 내부)로 제외되어야 한다.
        // homeInc 는 releasePrice, singleInc 는 deliveryPrice 를 priceKey 로 사용하므로 두 키 모두
        // 0/null 조합을 검증한다.
        setField("sheetPrefetchEnabled", false);
        when(estimateCatalogClient.catalog(EstimateCategory.HOME_MULTI, UsageScope.PARTNER_ORDER))
                .thenReturn(List.of(
                        catalogRow("0원 베이스라인", "HM-ZERO-BASE", "EA", "100000", "200000",
                                "실내기", "4WAY", "소형", true, null, null, false,
                                null, null, null),
                        catalogRow("null 베이스라인", "HM-NULL-BASE", "EA", "100000", "200000",
                                "실내기", "4WAY", "소형", true, null, null, false,
                                null, null, null)));
        when(estimateCatalogClient.catalog(EstimateCategory.SINGLE_SET, UsageScope.PARTNER_ORDER))
                .thenReturn(List.of(catalogRow(
                        "싱글 0원 베이스라인", "SS-ZERO-BASE", "SET", "1000000", "1200000",
                        "4w", "premium", null, false, "D7", null, false,
                        null, null, null)));
        when(estimateCatalogClient.priceBaseline())
                .thenReturn(List.of(
                        baselineRow("HM-ZERO-BASE", "HOME_MULTI", "0", "90000"),
                        baselineRow("HM-NULL-BASE", "HOME_MULTI", null, "90000"),
                        baselineRow("SS-ZERO-BASE", "SINGLE_SET", "1100000", "0")));
        when(cacheRepository.findAllByOrderByCacheKeyAsc()).thenReturn(List.of());

        // when
        BootstrapResponse response = bootstrapService.fetch();

        // then — releasePrice(homeInc) / deliveryPrice(singleInc) 모두 0 또는 null 이면 제외되어
        // 두 INC 맵 모두 빈 상태로 반환된다.
        assertThat(response.payloads().get("homeInc")).isEqualTo(Map.of());
        assertThat(response.payloads().get("singleInc")).isEqualTo(Map.of());
    }

    @Test
    void fetch_commercialPartsInc는_baseline_결측시_빈맵으로_반환된다() throws Exception {
        // given — 상업 구성품 catalog 는 존재하지만 price-baseline 이 비어 있으면 FE 가 base(후)로
        // fallthrough 하도록 commPartsInc 에 값을 넣지 않아야 한다.
        setField("sheetPrefetchEnabled", false);
        when(estimateCatalogClient.components(EstimateCategory.COMMERCIAL_MULTI))
                .thenReturn(List.of(componentRow(
                        "CM-1", "COMM-PART-MISSING", "상업 구성품 baseline 없음", "EA",
                        "77000", "88000", "OUTDOOR", "선택", false, "상업 구성 규격")));
        when(cacheRepository.findAllByOrderByCacheKeyAsc()).thenReturn(List.of());

        // when
        BootstrapResponse response = bootstrapService.fetch();

        // then
        assertThat(response.payloads().get("commPartsInc")).isEqualTo(Map.of());
    }

    @Test
    void fetch_구성품_defaultQty_소수는_orderApp_payload에서_정수화하고_warn을_남긴다(
            CapturedOutput output) throws Exception {
        // given — order-app payload qty 는 정수 계약(FE parseInt/regex 소비)이므로 소수 defaultQty 는
        // payload 생성 경계에서 정수화해야 한다. BundleExpander 도메인 로직은 이 변환 경로를 타지 않는다.
        setField("sheetPrefetchEnabled", false);
        when(estimateCatalogClient.components(EstimateCategory.COMMERCIAL_MULTI))
                .thenReturn(List.of(componentRow(
                        "CM-DECIMAL", "COMM-PART-DECIMAL", "상업 소수 구성품", "EA",
                        "77000", "88000", "OUTDOOR", "선택", false, "2.50", "상업 소수 규격")));
        when(cacheRepository.findAllByOrderByCacheKeyAsc()).thenReturn(List.of());

        // when
        BootstrapResponse response = bootstrapService.fetch();

        // then
        @SuppressWarnings("unchecked")
        Map<String, Object> commercialPart = ((List<Map<String, Object>>) response.payloads()
                .get("commercialParts")).get(0);
        assertThat(commercialPart).containsEntry("qty", new BigDecimal("3"));
        assertThat(output).contains("[BootstrapService] 구성품 defaultQty 소수 감지(order-app 정수화)")
                .contains("setModel=CM-DECIMAL")
                .contains("model=COMM-PART-DECIMAL")
                .contains("defaultQty=2.50");
    }

    private BootstrapCacheConfig makeCacheRow(String key, String json) {
        return BootstrapCacheConfig.of(key, json);
    }

    private static Map<String, Object> catalogRow(
            String name,
            String modelCode,
            String unit,
            String deliveryPrice,
            String releasePrice,
            String catL,
            String catM,
            String catS,
            Boolean hasVariableDiscount,
            String materialKey,
            String fixedDiscountRate,
            Boolean legacyDiscountFlag,
            String remark,
            String specText,
            String capacity) {
        Map<String, Object> row = new java.util.LinkedHashMap<>();
        row.put("name", name);
        row.put("modelCode", modelCode);
        row.put("unit", unit);
        row.put("deliveryPrice", bd(deliveryPrice));
        row.put("releasePrice", bd(releasePrice));
        row.put("catL", catL);
        row.put("catM", catM);
        row.put("catS", catS);
        row.put("hasVariableDiscount", hasVariableDiscount);
        row.put("materialKey", materialKey);
        row.put("fixedDiscountRate", bd(fixedDiscountRate));
        row.put("legacyDiscountFlag", legacyDiscountFlag);
        row.put("remark", remark);
        row.put("specText", specText);
        row.put("capacity", capacity);
        return row;
    }

    private static Map<String, Object> componentRow(
            String setModelCode,
            String componentModelCode,
            String name,
            String unit,
            String deliveryPrice,
            String releasePrice,
            String kind,
            String variant,
            Boolean isDefault,
            String specText) {
        return componentRow(setModelCode, componentModelCode, name, unit, deliveryPrice, releasePrice,
                kind, variant, isDefault, null, specText);
    }

    private static Map<String, Object> componentRow(
            String setModelCode,
            String componentModelCode,
            String name,
            String unit,
            String deliveryPrice,
            String releasePrice,
            String kind,
            String variant,
            Boolean isDefault,
            String defaultQty,
            String specText) {
        Map<String, Object> row = new java.util.LinkedHashMap<>();
        row.put("setModelCode", setModelCode);
        row.put("componentModelCode", componentModelCode);
        row.put("name", name);
        row.put("unit", unit);
        row.put("deliveryPrice", bd(deliveryPrice));
        row.put("releasePrice", bd(releasePrice));
        row.put("kind", kind);
        row.put("variant", variant);
        row.put("isDefault", isDefault);
        row.put("defaultQty", bd(defaultQty));
        row.put("specText", specText);
        return row;
    }

    private static Map<String, Object> baselineRow(
            String modelCode,
            String estimateCategory,
            String releasePrice,
            String deliveryPrice) {
        Map<String, Object> row = new java.util.LinkedHashMap<>();
        row.put("modelCode", modelCode);
        row.put("estimateCategory", estimateCategory);
        row.put("releasePrice", bd(releasePrice));
        row.put("deliveryPrice", bd(deliveryPrice));
        return row;
    }

    private static BigDecimal bd(String value) {
        return value == null ? null : new BigDecimal(value);
    }
}

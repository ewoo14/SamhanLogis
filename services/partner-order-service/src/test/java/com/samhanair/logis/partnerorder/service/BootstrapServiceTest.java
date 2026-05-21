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
import com.samhanair.logis.partnerorder.client.GoogleSheetsClient;
import com.samhanair.logis.partnerorder.client.GoogleSheetsClient.ValueRenderMode;
import com.samhanair.logis.partnerorder.domain.BootstrapCacheConfig;
import com.samhanair.logis.partnerorder.repository.BootstrapCacheConfigRepository;
import com.samhanair.logis.partnerorder.web.dto.BootstrapResponse;
import java.io.IOException;
import java.lang.reflect.Field;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * BootstrapService 단위 테스트 — PR-D Part 1 시트 prefetch + V2 seed fallback 2 시나리오.
 *
 * <p>시나리오:
 * <ul>
 *   <li>prefetch_시트성공 — sheet read 결과가 V2 seed 보다 우선 (sheetCache 적용)</li>
 *   <li>prefetch_시트실패 — sheet read 예외 → V2 seed payload 그대로 반환 (graceful fallback)</li>
 * </ul>
 */
@ExtendWith(MockitoExtension.class)
class BootstrapServiceTest {

    @Mock
    private BootstrapCacheConfigRepository cacheRepository;

    @Mock
    private GoogleSheetsClient sheetsClient;

    private final ObjectMapper objectMapper = new ObjectMapper();

    private BootstrapService bootstrapService;

    @BeforeEach
    void setUp() throws Exception {
        bootstrapService = new BootstrapService(cacheRepository, objectMapper, sheetsClient);
        // @Value 주입 우회 (Reflection)
        setField("bootstrapSheetId", "test-sheet-id");
        setField("sheetPrefetchEnabled", true);
        setField("rangeMap", Map.of(
                "homemulti", "홈멀티!A1:Z",
                "homeInc", "홈멀티_단가인상!A1:Z"));
    }

    private void setField(String name, Object value) throws Exception {
        Field f = BootstrapService.class.getDeclaredField(name);
        f.setAccessible(true);
        f.set(bootstrapService, value);
    }

    @Test
    void prefetch_시트read_성공시_GAS와_동일하게_base와_단가인상_source가_seed보다_우선하고_config는_seed_fallback() throws Exception {
        // given — 시트 read 성공: 주문서 base payload + 단가인상 helper map
        List<List<Object>> baseRows = List.of(
                List.of("Hi-Multi 4-Way", "AJ040RXH4BC1", "1,500,000"));
        List<List<Object>> increaseRows = List.of(
                List.of("Hi-Multi 4-Way", "AJ040RXH4BC1", "1,611,115"));
        when(sheetsClient.readSheet(eq("test-sheet-id"), eq("홈멀티!A1:Z"), eq(ValueRenderMode.FORMATTED)))
                .thenReturn(baseRows);
        when(sheetsClient.readSheet(eq("test-sheet-id"), eq("홈멀티_단가인상!A1:Z"), eq(ValueRenderMode.FORMATTED)))
                .thenReturn(increaseRows);
        // config 는 credential-bearing sheet 를 읽지 않고 V2 seed fallback 만 사용한다.
        when(cacheRepository.findAllByOrderByCacheKeyAsc()).thenReturn(List.of(
                makeCacheRow("homemulti", "[]"),
                makeCacheRow("homeInc", "[]"),
                makeCacheRow("config", "{\"vatRate\":0.1,\"homeDiscount\":0.45,\"deliveryDays\":3}")));

        // when — 부팅 prefetch + fetch
        bootstrapService.prefetch();
        BootstrapResponse response = bootstrapService.fetch();

        // then — 제품 source 는 시트 row, config 는 seed fallback + DC 9키 strip
        assertThat(response.payloads().get("homemulti")).isEqualTo(baseRows);
        assertThat(response.payloads().get("homeInc")).isEqualTo(increaseRows);
        @SuppressWarnings("unchecked")
        Map<String, Object> configMap = (Map<String, Object>) response.payloads().get("config");
        assertThat(configMap).containsKey("vatRate").containsKey("deliveryDays");
        assertThat(configMap).doesNotContainKey("homeDiscount");
        verify(sheetsClient, never()).readSheet(eq("test-sheet-id"), eq("설정!A1:Z"), any(ValueRenderMode.class));
        verify(sheetsClient, never()).readSheet(eq("test-sheet-id"), eq("전표생성폼!A1:Z"), any(ValueRenderMode.class));
        verify(sheetsClient, never()).readSheet(eq("test-sheet-id"), eq("전표업로드목록!A1:Z"), any(ValueRenderMode.class));
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
        // 16 키 모두 존재 (없는 키는 빈 객체/배열)
        assertThat(response.payloads().keySet()).containsExactlyElementsOf(BootstrapService.CACHE_KEYS);
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

    private BootstrapCacheConfig makeCacheRow(String key, String json) {
        return BootstrapCacheConfig.of(key, json);
    }
}

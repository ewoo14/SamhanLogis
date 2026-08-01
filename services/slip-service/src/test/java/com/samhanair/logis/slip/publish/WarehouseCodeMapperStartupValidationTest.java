package com.samhanair.logis.slip.publish;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import com.samhanair.logis.slip.client.WarehouseInternalClient;
import org.junit.jupiter.api.Test;

/** 창고 코드 매핑이 전표 서비스 기동 전에 검증되는지 확인한다. */
class WarehouseCodeMapperStartupValidationTest {

    @Test
    void 실재하지_않는_창고_UUID는_창고코드를_알리는_기동_실패가_되어야_한다() {
        WarehouseCodeMapper mapper = new WarehouseCodeMapper();
        mapper.setWarehouseCodeMap(Map.of(
                "00003", "00000000-0000-0000-0000-000000000099"));
        mapper.setWarehouseInternalClient(mock(WarehouseInternalClient.class));
        mapper.setWarehouseValidationEnabled(true);
        when(mapper.getWarehouseInternalClient().findWarehouseById(
                java.util.UUID.fromString("00000000-0000-0000-0000-000000000099")))
                .thenReturn(WarehouseInternalClient.WarehouseLookup.notFound());

        assertThatThrownBy(mapper::logEffectiveMap)
                .hasMessageContaining("00003")
                .hasMessageNotContaining("00000000-0000-0000-0000-000000000099");
    }

    @Test
    void 치환되지_않은_placeholder도_UUID를_노출하지_않고_기동_실패한다() {
        WarehouseCodeMapper mapper = mapperWith(Map.of("00003", "${WAREHOUSE_UUID_HQ}"));

        assertThatThrownBy(mapper::logEffectiveMap)
                .hasMessageContaining("00003")
                .hasMessageNotContaining("${WAREHOUSE_UUID_HQ}");
    }

    @Test
    void 활성_창고의_UUID와_코드가_모두_일치하면_기동이_성공한다() {
        WarehouseCodeMapper mapper = mapperWith(Map.of(
                "00003", "00000000-0000-0000-0000-000000000001"));
        when(mapper.getWarehouseInternalClient().findWarehouseById(
                java.util.UUID.fromString("00000000-0000-0000-0000-000000000001")))
                .thenReturn(WarehouseInternalClient.WarehouseLookup.found(
                        new WarehouseInternalClient.WarehouseSummary(
                                java.util.UUID.fromString("00000000-0000-0000-0000-000000000001"), "HQ-001")));
        when(mapper.getWarehouseInternalClient().findWarehouseByCode("00003"))
                .thenReturn(Optional.of(new WarehouseInternalClient.WarehouseSummary(
                        java.util.UUID.fromString("00000000-0000-0000-0000-000000000001"), "00003")));

        assertThatCode(mapper::logEffectiveMap).doesNotThrowAnyException();
        verify(mapper.getWarehouseInternalClient()).findWarehouseByCode("00003");
    }

    @Test
    void 창고_서비스_일시_장애는_기동을_막지_않는다() {
        WarehouseCodeMapper mapper = mapperWith(Map.of(
                "00003", "00000000-0000-0000-0000-000000000001"));
        when(mapper.getWarehouseInternalClient().findWarehouseById(
                java.util.UUID.fromString("00000000-0000-0000-0000-000000000001")))
                .thenReturn(WarehouseInternalClient.WarehouseLookup.unavailable());

        assertThatCode(mapper::logEffectiveMap).doesNotThrowAnyException();
    }

    @Test
    void UUID가_명백히_미실재하면_기동을_막는다() {
        WarehouseCodeMapper mapper = mapperWith(Map.of(
                "00003", "00000000-0000-0000-0000-000000000001"));
        when(mapper.getWarehouseInternalClient().findWarehouseById(
                java.util.UUID.fromString("00000000-0000-0000-0000-000000000001")))
                .thenReturn(WarehouseInternalClient.WarehouseLookup.notFound());

        assertThatThrownBy(mapper::logEffectiveMap)
                .hasMessageContaining("00003")
                .hasMessageNotContaining("00000000-0000-0000-0000-000000000001");
    }

    @Test
    void 정상_창고라도_UUID와_창고코드가_뒤바뀌면_기동을_막는다() {
        UUID configuredId = UUID.fromString("00000000-0000-0000-0000-000000000001");
        UUID codeResolvedId = UUID.fromString("00000000-0000-0000-0000-000000000002");
        WarehouseCodeMapper mapper = mapperWith(Map.of("00003", configuredId.toString()));
        when(mapper.getWarehouseInternalClient().findWarehouseById(configuredId))
                .thenReturn(WarehouseInternalClient.WarehouseLookup.found(
                        new WarehouseInternalClient.WarehouseSummary(configuredId, "HQ-001")));
        when(mapper.getWarehouseInternalClient().findWarehouseByCode("00003"))
                .thenReturn(Optional.of(new WarehouseInternalClient.WarehouseSummary(codeResolvedId, "00003")));

        assertThatThrownBy(mapper::logEffectiveMap)
                .hasMessageContaining("00003")
                .hasMessageNotContaining(configuredId.toString())
                .hasMessageNotContaining(codeResolvedId.toString());
    }

    @Test
    void 기동_당시_UNAVAILABLE_매핑은_후속_재검증으로_확인된다() {
        UUID configuredId = UUID.fromString("00000000-0000-0000-0000-000000000001");
        WarehouseCodeMapper mapper = mapperWith(Map.of("00003", configuredId.toString()));
        WarehouseInternalClient client = mapper.getWarehouseInternalClient();
        when(client.findWarehouseById(configuredId))
                .thenReturn(WarehouseInternalClient.WarehouseLookup.unavailable())
                .thenReturn(WarehouseInternalClient.WarehouseLookup.found(
                        new WarehouseInternalClient.WarehouseSummary(configuredId, "00003")));
        when(client.findWarehouseByCode("00003"))
                .thenReturn(Optional.of(new WarehouseInternalClient.WarehouseSummary(configuredId, "00003")));

        assertThatCode(mapper::logEffectiveMap).doesNotThrowAnyException();
        assertThatCode(mapper::revalidateUnavailableWarehouses).doesNotThrowAnyException();
        verify(client, org.mockito.Mockito.times(2)).findWarehouseById(configuredId);
    }

    private static WarehouseCodeMapper mapperWith(Map<String, String> mapping) {
        WarehouseCodeMapper mapper = new WarehouseCodeMapper();
        mapper.setWarehouseCodeMap(mapping);
        mapper.setWarehouseInternalClient(mock(WarehouseInternalClient.class));
        mapper.setWarehouseValidationEnabled(true);
        return mapper;
    }
}

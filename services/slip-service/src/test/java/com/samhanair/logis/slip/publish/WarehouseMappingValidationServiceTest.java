package com.samhanair.logis.slip.publish;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.samhanair.logis.slip.client.WarehouseInternalClient;
import java.time.Duration;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.core.task.TaskExecutor;

/** staging alias 원본과 정적 consumer map의 검증 상태를 고정한다. */
class WarehouseMappingValidationServiceTest {

    private static final UUID HQ = UUID.fromString("11111111-1111-1111-1111-000000000001");
    private static final UUID HUB = UUID.fromString("11111111-1111-1111-1111-000000000002");

    private WarehouseCodeMapper mapper;
    private WarehouseInternalClient client;
    private WarehouseMappingValidationService service;

    @BeforeEach
    void setUp() {
        mapper = new WarehouseCodeMapper();
        mapper.setMappingMode("STRICT");
        mapper.setWarehouseCodeMap(Map.of("00003", HQ.toString(), "2", HUB.toString()));
        client = mock(WarehouseInternalClient.class);
        ApplicationEventPublisher publisher = mock(ApplicationEventPublisher.class);
        TaskExecutor directExecutor = Runnable::run;
        service = new WarehouseMappingValidationService(mapper, client, directExecutor, publisher);
    }

    @Test
    void 권위_alias가_네_코드를_각자의_UUID로_반환하면_VERIFIED되고_발행이_허용된다() {
        when(client.findEcountWarehouseAliases(Set.of("00003", "2")))
                .thenReturn(Map.of(
                        "00003", new WarehouseInternalClient.EcountWarehouseAlias("00003", HQ),
                        "2", new WarehouseInternalClient.EcountWarehouseAlias("2", HUB)));

        service.validateNow();

        assertThat(mapper.validationStatus("00003")).isEqualTo(WarehouseMappingStatus.VERIFIED);
        assertThat(mapper.validationStatus("2")).isEqualTo(WarehouseMappingStatus.VERIFIED);
        assertThat(mapper.resolve("00003")).isEqualTo(HQ);
        assertThat(mapper.resolve("2")).isEqualTo(HUB);
    }

    @Test
    void UUID가_뒤바뀌면_행의_존재와_무관하게_MISMATCH로_발행을_차단한다() {
        when(client.findEcountWarehouseAliases(Set.of("00003", "2")))
                .thenReturn(Map.of(
                        "00003", new WarehouseInternalClient.EcountWarehouseAlias("00003", HUB),
                        "2", new WarehouseInternalClient.EcountWarehouseAlias("2", HQ)));

        service.validateNow();

        assertThat(mapper.validationStatus("00003")).isEqualTo(WarehouseMappingStatus.MISMATCH);
        assertThatThrownBy(() -> mapper.resolve("00003"))
                .hasMessageContaining("MISMATCH");
    }

    @Test
    void 권위_alias에_코드가_없으면_NOT_FOUND이고_일시_조회실패는_UNAVAILABLE로_남는다() {
        when(client.findEcountWarehouseAliases(Set.of("00003", "2")))
                .thenReturn(Map.of("00003", new WarehouseInternalClient.EcountWarehouseAlias("00003", HQ)));
        service.validateNow();
        assertThat(mapper.validationStatus("2")).isEqualTo(WarehouseMappingStatus.NOT_FOUND);

        when(client.findEcountWarehouseAliases(Set.of("00003", "2")))
                .thenThrow(new WarehouseInternalClient.WarehouseAliasUnavailableException("timeout", null));
        service.validateNow();
        assertThat(mapper.validationStatus("00003")).isEqualTo(WarehouseMappingStatus.UNAVAILABLE);
        assertThat(mapper.validationStatus("00003"))
                .isNotEqualTo(WarehouseMappingStatus.NOT_FOUND);
    }

    @Test
    void DEV_SUBSTITUTE를_명시하면_외부_조회_없이_정상_매핑을_사용한다() {
        mapper.setMappingMode("DEV_SUBSTITUTE");

        service.validateNow();

        assertThat(mapper.validationStatus("00003"))
                .isEqualTo(WarehouseMappingStatus.DEV_SUBSTITUTE);
        assertThat(mapper.resolve("00003")).isEqualTo(HQ);
        verifyNoInteractions(client);
    }

    @Test
    void STRICT에서_값을_비워도_권위_alias_UUID를_발견해_발행을_허용한다() {
        mapper.setWarehouseCodeMap(Map.of("00003", "", "2", ""));
        when(client.findEcountWarehouseAliases(Set.of("00003", "2")))
                .thenReturn(Map.of(
                        "00003", new WarehouseInternalClient.EcountWarehouseAlias("00003", HQ),
                        "2", new WarehouseInternalClient.EcountWarehouseAlias("2", HUB)));

        service.validateNow();

        assertThat(mapper.resolve("00003")).isEqualTo(HQ);
        assertThat(mapper.resolve("2")).isEqualTo(HUB);
    }

    @Test
    void 잘못된_정적_UUID는_권위_alias가_있어도_INVALID_CONFIGURATION으로_차단한다() {
        mapper.setWarehouseCodeMap(Map.of("00003", "${WAREHOUSE_UUID_ECOUNT_00003}"));
        when(client.findEcountWarehouseAliases(Set.of("00003")))
                .thenReturn(Map.of(
                        "00003", new WarehouseInternalClient.EcountWarehouseAlias("00003", HQ)));

        service.validateNow();

        assertThat(mapper.validationStatus("00003"))
                .isEqualTo(WarehouseMappingStatus.INVALID_CONFIGURATION);
        assertThatThrownBy(() -> mapper.resolve("00003"))
                .hasMessageContaining("INVALID_CONFIGURATION");
    }

    @Test
    void 느린_외부_조회는_검증_worker를_막지만_기동_ready_호출은_즉시_반환한다() throws Exception {
        CountDownLatch entered = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        TaskExecutor asynchronousExecutor = command -> {
            Thread worker = new Thread(command, "warehouse-validation-test");
            worker.start();
        };
        service = new WarehouseMappingValidationService(
                mapper, client, asynchronousExecutor, mock(ApplicationEventPublisher.class));
        when(client.findEcountWarehouseAliases(Set.of("00003", "2"))).thenAnswer(invocation -> {
            entered.countDown();
            assertThat(release.await(5, TimeUnit.SECONDS)).isTrue();
            return new HashMap<>();
        });

        long started = System.nanoTime();
        service.scheduleValidation();
        long elapsedMillis = Duration.ofNanos(System.nanoTime() - started).toMillis();

        assertThat(entered.await(2, TimeUnit.SECONDS)).isTrue();
        assertThat(elapsedMillis).isLessThan(500L);
        release.countDown();
    }
}

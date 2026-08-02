package com.samhanair.logis.slip.service;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.when;

import com.samhanair.logis.slip.client.WarehouseInternalClient;
import com.samhanair.logis.slip.repository.SlipRepository;
import java.util.UUID;
import java.util.stream.Stream;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.core.task.TaskExecutor;

/** inventory 보강 실패가 이미 발행된 전표를 되돌리지 않는지 검증한다. */
@ExtendWith(MockitoExtension.class)
class WarehouseCodeSnapshotServiceTest {

    @Mock private WarehouseInternalClient warehouseInternalClient;
    @Mock private SlipRepository slipRepository;
    @Mock private TransactionTemplate transactionTemplate;
    @Mock private TaskExecutor taskExecutor;

    @ParameterizedTest(name = "inventory {0} 장애는 UNKNOWN 보강 생략으로 흡수된다")
    @MethodSource("inventoryFailures")
    void snapshot_inventoryFailure_doesNotPropagate(String mode, RuntimeException failure) {
        UUID slipId = UUID.randomUUID();
        UUID warehouseId = UUID.randomUUID();
        when(warehouseInternalClient.findWarehouseCode(warehouseId)).thenThrow(failure);

        WarehouseCodeSnapshotService service = new WarehouseCodeSnapshotService(
                warehouseInternalClient, slipRepository, transactionTemplate, taskExecutor);
        doAnswer(invocation -> {
            ((Runnable) invocation.getArgument(0)).run();
            return null;
        }).when(taskExecutor).execute(any(Runnable.class));

        assertThatCode(() -> service.scheduleAfterCommit(slipId, warehouseId))
                .doesNotThrowAnyException();
        verifyNoInteractions(slipRepository, transactionTemplate);
    }

    private static Stream<Arguments> inventoryFailures() {
        return Stream.of(
                Arguments.of("404", new IllegalStateException("HTTP 404")),
                Arguments.of("403", new IllegalStateException("HTTP 403")),
                Arguments.of("5xx", new IllegalStateException("HTTP 503")),
                Arguments.of("timeout", new IllegalStateException("timeout")),
                Arguments.of("network", new IllegalStateException("network")));
    }
}

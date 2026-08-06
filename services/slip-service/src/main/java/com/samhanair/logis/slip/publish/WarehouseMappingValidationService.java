package com.samhanair.logis.slip.publish;

import com.samhanair.logis.slip.client.WarehouseInternalClient;
import com.samhanair.logis.slip.client.WarehouseInternalClient.EcountWarehouseAlias;
import com.samhanair.logis.slip.client.WarehouseInternalClient.WarehouseAliasUnavailableException;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicBoolean;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.boot.availability.AvailabilityChangeEvent;
import org.springframework.boot.availability.ReadinessState;
import org.springframework.context.event.EventListener;
import org.springframework.core.task.TaskExecutor;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/** 기동 후 eCount alias 권위 원본을 비동기로 검증하고 readiness를 갱신한다. */
@Service
@Slf4j
public class WarehouseMappingValidationService {

    private final WarehouseCodeMapper mapper;
    private final WarehouseInternalClient warehouseInternalClient;
    private final TaskExecutor taskExecutor;
    private final ApplicationEventPublisher eventPublisher;
    private final AtomicBoolean validationRunning = new AtomicBoolean();

    public WarehouseMappingValidationService(
            WarehouseCodeMapper mapper,
            WarehouseInternalClient warehouseInternalClient,
            @Qualifier("applicationTaskExecutor") TaskExecutor taskExecutor,
            ApplicationEventPublisher eventPublisher) {
        this.mapper = mapper;
        this.warehouseInternalClient = warehouseInternalClient;
        this.taskExecutor = taskExecutor;
        this.eventPublisher = eventPublisher;
    }

    /** Ready 시점에도 검증을 보장하되, 무지연 scheduler가 먼저 시작한 작업과 중복하지 않는다. */
    @EventListener(ApplicationReadyEvent.class)
    public void onApplicationReady(ApplicationReadyEvent ignored) {
        scheduleValidation();
    }

    /** 외부 서비스가 늦게 기동하거나 일시 장애여도 다음 주기에 재검증한다. */
    @Scheduled(fixedDelayString = "${app.publish.validation-interval-ms:300000}")
    public void scheduleValidation() {
        if (mapper.mode().orElse(null) == WarehouseMappingMode.DEV_SUBSTITUTE) {
            applyDevSubstitute();
            return;
        }
        if (!validationRunning.compareAndSet(false, true)) {
            return;
        }
        publishReadiness(ReadinessState.REFUSING_TRAFFIC);
        try {
            taskExecutor.execute(() -> {
                try {
                    validateNow();
                } finally {
                    validationRunning.set(false);
                    reconcileReadiness();
                }
            });
        } catch (RuntimeException ex) {
            validationRunning.set(false);
            markUnavailable(ex);
            log.warn("warehouse alias validation executor 거부: {}", ex.getMessage());
        }
    }

    /** 테스트와 운영 재검증 작업이 공유하는 동기 판정 본체. 외부 호출은 worker에서만 한다. */
    void validateNow() {
        if (mapper.mode().orElse(null) == WarehouseMappingMode.DEV_SUBSTITUTE) {
            applyDevSubstitute();
            return;
        }
        if (mapper.mode().orElse(null) != WarehouseMappingMode.STRICT) {
            mapper.configuredWarehouseCodes().forEach(code ->
                    mapper.markStatus(code, WarehouseMappingStatus.INVALID_CONFIGURATION));
            publishReadiness(ReadinessState.REFUSING_TRAFFIC);
            return;
        }

        Set<String> codes = mapper.requiredWarehouseCodes();
        if (codes.isEmpty()) {
            publishReadiness(ReadinessState.REFUSING_TRAFFIC);
            return;
        }
        try {
            Map<String, EcountWarehouseAlias> aliases =
                    warehouseInternalClient.findEcountWarehouseAliases(codes);
            for (String code : codes) {
                if (!mapper.configuredWarehouseCodes().contains(code)) {
                    mapper.markStatus(code, WarehouseMappingStatus.INVALID_CONFIGURATION);
                    continue;
                }
                if (mapper.hasConfiguredValue(code) && mapper.configuredUuid(code).isEmpty()) {
                    mapper.markStatus(code, WarehouseMappingStatus.INVALID_CONFIGURATION);
                    continue;
                }
                EcountWarehouseAlias alias = aliases.get(code);
                if (alias == null) {
                    mapper.markStatus(code, WarehouseMappingStatus.NOT_FOUND);
                    continue;
                }
                var configured = mapper.configuredUuid(code);
                if (configured.isPresent() && !configured.get().equals(alias.warehouseId())) {
                    mapper.markStatus(code, WarehouseMappingStatus.MISMATCH);
                    continue;
                }
                // 설정값이 비어 있으면 staging alias UUID를 런타임 consumer map으로 채운다.
                mapper.markVerified(code, alias.warehouseId());
            }
        } catch (WarehouseAliasUnavailableException ex) {
            markUnavailable(ex);
        } catch (RuntimeException ex) {
            // 계약/네트워크 예외는 alias 부재로 축약하지 않는다.
            markUnavailable(ex);
        }
        publishReadiness(allVerified(codes)
                ? ReadinessState.ACCEPTING_TRAFFIC
                : ReadinessState.REFUSING_TRAFFIC);
    }

    /**
     * Spring Boot는 ApplicationReadyEvent listener가 끝난 뒤 기본 ACCEPTING_TRAFFIC을
     * 발행한다. 검증이 그보다 먼저 실패하거나 아직 진행 중이면 그 전이를 즉시 되돌려
     * validator의 fail-closed 결과가 actuator와 발행 경로에 계속 반영되게 한다.
     */
    @EventListener(AvailabilityChangeEvent.class)
    public void onAvailabilityChange(AvailabilityChangeEvent<?> event) {
        if (event.getState() == ReadinessState.ACCEPTING_TRAFFIC && !readinessAllowed()) {
            publishReadiness(ReadinessState.REFUSING_TRAFFIC);
        }
    }

    private void applyDevSubstitute() {
        mapper.configuredWarehouseCodes().forEach(code ->
                mapper.markStatus(code, WarehouseMappingStatus.DEV_SUBSTITUTE));
        publishReadiness(ReadinessState.ACCEPTING_TRAFFIC);
    }

    private void markUnavailable(RuntimeException failure) {
        mapper.configuredWarehouseCodes().forEach(code ->
                mapper.markStatus(code, WarehouseMappingStatus.UNAVAILABLE));
        publishReadiness(ReadinessState.REFUSING_TRAFFIC);
        log.warn("warehouse alias validation unavailable; retry 예정 reason={}", failure.getMessage());
    }

    private boolean allVerified(Set<String> codes) {
        return !codes.isEmpty() && codes.stream()
                .allMatch(code -> mapper.validationStatus(code) == WarehouseMappingStatus.VERIFIED);
    }

    private boolean readinessAllowed() {
        if (mapper.mode().orElse(null) == WarehouseMappingMode.DEV_SUBSTITUTE) {
            return true;
        }
        return !validationRunning.get()
                && mapper.mode().orElse(null) == WarehouseMappingMode.STRICT
                && allVerified(mapper.requiredWarehouseCodes());
    }

    private void reconcileReadiness() {
        publishReadiness(readinessAllowed()
                ? ReadinessState.ACCEPTING_TRAFFIC
                : ReadinessState.REFUSING_TRAFFIC);
    }

    private void publishReadiness(ReadinessState state) {
        eventPublisher.publishEvent(new AvailabilityChangeEvent<>(this, state));
    }
}

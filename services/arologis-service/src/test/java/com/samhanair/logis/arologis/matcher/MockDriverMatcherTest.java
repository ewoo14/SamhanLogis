package com.samhanair.logis.arologis.matcher;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.samhanair.logis.arologis.domain.Driver;
import com.samhanair.logis.arologis.domain.DriverSource;
import com.samhanair.logis.arologis.domain.MatchSource;
import com.samhanair.logis.arologis.domain.Vehicle;
import com.samhanair.logis.arologis.domain.VehicleTonnage;
import com.samhanair.logis.arologis.repository.DriverRepository;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * MockDriverMatcher 단위 테스트 — Phase 10 W10-1.
 *
 * <p>3 case — 정상 매칭 / 기존 driver 재사용 / vehicle null 시 fail-soft.
 */
class MockDriverMatcherTest {

    @Test
    @DisplayName("정상 매칭 — 새 mock driver 생성 후 반환")
    void match_creates_new_mock_driver_when_absent() {
        DriverRepository repo = mock(DriverRepository.class);
        Driver mock = Driver.of(MockDriverMatcher.MOCK_DRIVER_CODE,
                MockDriverMatcher.MOCK_DRIVER_PHONE, "1톤", DriverSource.INTERNAL, false, null);
        when(repo.findByDriverCode(eq(MockDriverMatcher.MOCK_DRIVER_CODE)))
                .thenReturn(Optional.empty());
        when(repo.save(any(Driver.class))).thenReturn(mock);

        MockDriverMatcher matcher = new MockDriverMatcher(repo);
        Vehicle vehicle = Vehicle.of(UUID.randomUUID(), 1, VehicleTonnage.TONNAGE_1, "테스트");

        DriverMatchResult result = matcher.match(vehicle, List.of());
        assertThat(result.driver()).isPresent();
        assertThat(result.driver().get().getDriverCode()).isEqualTo(MockDriverMatcher.MOCK_DRIVER_CODE);
        assertThat(result.driver().get().getVehiclePlateNumber()).isNull();
        assertThat(result.source()).isEqualTo(MatchSource.INTERNAL_APP);
        assertThat(result.externalRefId()).startsWith("MOCK-");
    }

    @Test
    @DisplayName("기존 mock driver 가 있으면 그대로 재사용")
    void match_reuses_existing_mock_driver() {
        DriverRepository repo = mock(DriverRepository.class);
        Driver existing = Driver.of(MockDriverMatcher.MOCK_DRIVER_CODE,
                MockDriverMatcher.MOCK_DRIVER_PHONE, "1톤", DriverSource.INTERNAL, false, null);
        when(repo.findByDriverCode(eq(MockDriverMatcher.MOCK_DRIVER_CODE)))
                .thenReturn(Optional.of(existing));

        MockDriverMatcher matcher = new MockDriverMatcher(repo);
        Vehicle vehicle = Vehicle.of(UUID.randomUUID(), 2, VehicleTonnage.TONNAGE_1, null);

        DriverMatchResult result = matcher.match(vehicle, List.of());
        assertThat(result.driver()).isPresent();
        assertThat(result.driver().get()).isSameAs(existing);
    }

    @Test
    @DisplayName("vehicle null 시 fail-soft empty 반환")
    void match_returns_empty_when_vehicle_null() {
        DriverRepository repo = mock(DriverRepository.class);
        lenient().when(repo.findByDriverCode(any())).thenReturn(Optional.empty());

        MockDriverMatcher matcher = new MockDriverMatcher(repo);
        DriverMatchResult result = matcher.match(null, List.of());
        assertThat(result.driver()).isEmpty();
        assertThat(result.source()).isEqualTo(MatchSource.INTERNAL_APP);
    }
}

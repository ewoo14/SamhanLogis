package com.samhanair.logis.user.presence;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.atLeast;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.user.domain.Employee;
import com.samhanair.logis.user.repository.EmployeeRepository;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import java.util.ArrayList;
import java.util.List;

@ExtendWith(MockitoExtension.class)
class MessengerPresenceServiceTest {
    @Mock EmployeeRepository employees;
    @Mock MessengerPresenceRepository presences;
    private MessengerPresenceService service;
    private final List<SseEmitter> emitters = new ArrayList<>();

    @BeforeEach
    void setUp() { service = new MessengerPresenceService(employees, presences, new ObjectMapper(), () -> { var emitter = org.mockito.Mockito.mock(SseEmitter.class); emitters.add(emitter); return emitter; }); }

    @Test
    void statusChangeIsBroadcastToAnotherUsersStream() throws java.io.IOException {
        UUID first = UUID.randomUUID();
        UUID second = UUID.randomUUID();
        Employee firstEmployee = org.mockito.Mockito.mock(Employee.class);
        Employee secondEmployee = org.mockito.Mockito.mock(Employee.class);
        when(firstEmployee.getEcountCode()).thenReturn("E1");
        when(secondEmployee.getEcountCode()).thenReturn("E2");
        when(employees.findById(first)).thenReturn(Optional.of(firstEmployee));
        when(employees.findById(second)).thenReturn(Optional.of(secondEmployee));
        when(presences.findByEmployeeId(first)).thenReturn(Optional.of(MessengerPresence.create(first)));
        when(presences.findByEmployeeId(second)).thenReturn(Optional.of(MessengerPresence.create(second)));
        when(presences.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        service.stream(first);
        SseEmitter otherUserStream = service.stream(second);
        service.setStatus(first, PresenceStatus.IN_MEETING);

        verify(otherUserStream, atLeast(2)).send(any(SseEmitter.SseEventBuilder.class));
    }

    @Test
    void closingLastStreamPublishesOfflineInsteadOfLeavingZombieConnection() {
        UUID employeeId = UUID.randomUUID();
        Employee employee = org.mockito.Mockito.mock(Employee.class);
        when(employee.getEcountCode()).thenReturn("E1");
        when(employees.findById(employeeId)).thenReturn(Optional.of(employee));
        when(presences.findByEmployeeId(employeeId)).thenReturn(Optional.of(MessengerPresence.create(employeeId)));
        when(presences.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        SseEmitter emitter = service.stream(employeeId);
        service.closeStream(employeeId, emitter);

        verify(presences, atLeast(2)).save(any(MessengerPresence.class));
    }

    @Test
    void leavingOneOfTwoSessionsKeepsEmployeeOnline() {
        UUID employeeId = UUID.randomUUID();
        Employee employee = org.mockito.Mockito.mock(Employee.class);
        when(employee.getEcountCode()).thenReturn("E1");
        when(employees.findById(employeeId)).thenReturn(Optional.of(employee));
        var presence = MessengerPresence.create(employeeId);
        when(presences.findByEmployeeId(employeeId)).thenReturn(Optional.of(presence));
        when(presences.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        service.join(employeeId, "desktop-a");
        service.join(employeeId, "desktop-b");
        service.leave(employeeId, "desktop-a");

        org.assertj.core.api.Assertions.assertThat(presence.getStatus()).isEqualTo(PresenceStatus.AVAILABLE);
    }
}

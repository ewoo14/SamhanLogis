package com.samhanair.logis.user.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.security.Role;
import com.samhanair.logis.shared.audit.contract.AuditEnums.AuditAction;
import com.samhanair.logis.shared.audit.contract.AuditEventV2;
import com.samhanair.logis.shared.audit.contract.AuditTopology;
import com.samhanair.logis.shared.audit.publisher.AuditPublisher;
import com.samhanair.logis.user.domain.Employee;
import com.samhanair.logis.user.repository.EmployeeRepository;
import com.samhanair.logis.user.repository.RoleChangeHistoryRepository;
import com.samhanair.logis.user.service.EmployeeProvisioningService;
import com.samhanair.logis.user.service.EmployeeSignatureHandoffService;
import com.samhanair.logis.user.service.EmployeeSignatureService;
import com.samhanair.logis.user.web.dto.AdminUserRoleChangeRequest;
import com.samhanair.logis.user.web.dto.EmployeeResponse;
import java.time.LocalDate;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.rabbit.connection.CachingConnectionFactory;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.amqp.support.converter.Jackson2JsonMessageConverter;
import org.testcontainers.containers.RabbitMQContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

@Testcontainers
class AdminUserCentralAuditRoundTripIT {
    @Container
    static final RabbitMQContainer RABBIT = new RabbitMQContainer("rabbitmq:3.13-management-alpine");

    @Test
    void roleChangeRouteDeliversEventToCentralRabbitPipeline() {
        CachingConnectionFactory connectionFactory = new CachingConnectionFactory(
                RABBIT.getHost(), RABBIT.getAmqpPort());
        RabbitTemplate template = new RabbitTemplate(connectionFactory);
        template.setMessageConverter(new Jackson2JsonMessageConverter());
        String queue = "user-s2b-it-" + System.nanoTime();
        template.execute(channel -> {
            channel.exchangeDeclare(AuditTopology.EXCHANGE, "topic", true);
            channel.queueDeclare(queue, false, true, true, null);
            channel.queueBind(queue, AuditTopology.EXCHANGE, "audit.#");
            return null;
        });

        EmployeeProvisioningService service = mock(EmployeeProvisioningService.class);
        EmployeeResponse response = new EmployeeResponse(
                UUID.randomUUID(), "user01", "Kim", "Staff", Role.MANAGER,
                UUID.randomUUID(), "Sales", false, LocalDate.of(2026, 1, 1), null, null, null);
        UUID employeeId = response.id();
        when(service.updateRole(any(), any(), any(), any())).thenReturn(response);
        AuditPublisher publisher = new AuditPublisher(template, new SimpleMeterRegistry(), true);
        AdminUserController controller = new AdminUserController(
                service, mock(EmployeeRepository.class), mock(RoleChangeHistoryRepository.class),
                mock(EmployeeSignatureService.class), mock(EmployeeSignatureHandoffService.class),
                publisher);

        controller.updateRole(employeeId, new AdminUserRoleChangeRequest(Role.MANAGER, "promotion"), "actor-id");

        Object received = template.receiveAndConvert(queue, 10_000L);
        assertThat(received).isInstanceOf(AuditEventV2.class);
        AuditEventV2 event = (AuditEventV2) received;
        assertThat(event.serviceName()).isEqualTo("user-service");
        assertThat(event.action()).isEqualTo(AuditAction.A_CHANGE);
        assertThat(event.routeTemplate()).isEqualTo("/api/v1/admin/users/{id}/role");
        assertThat(event.resourceId()).isEqualTo(employeeId.toString());
        publisher.close();
        connectionFactory.destroy();
    }
}

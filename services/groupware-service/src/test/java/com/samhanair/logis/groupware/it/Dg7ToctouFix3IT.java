package com.samhanair.logis.groupware.it;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.groupware.GroupwareServiceApplication;
import com.samhanair.logis.groupware.client.UserClient;
import com.samhanair.logis.groupware.domain.ApprovalAttachmentType;
import com.samhanair.logis.groupware.dto.ApprovalAttachmentRequest;
import com.samhanair.logis.groupware.dto.ApprovalLineCreateRequest;
import com.samhanair.logis.groupware.policy.SettlementApprovalReferencePolicy;
import com.samhanair.logis.groupware.service.ApprovalLineService;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import jakarta.validation.Validator;
import java.lang.reflect.Method;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.aop.support.AopUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.transaction.interceptor.TransactionAttributeSource;

/** D-G7 TF-4 RED-A — 원자 생성 경로의 lease 예산 계약을 실 PostgreSQL/Flyway에서 고정한다. */
@SpringBootTest(classes = GroupwareServiceApplication.class)
class Dg7ToctouFix3IT extends AbstractPostgresIT {

    private static final int ACTIVE_CLAIM_LEASE_SECONDS = 300;
    private static final int EXPECTED_CREATE_TIMEOUT_SECONDS = 120;
    private static final int MAX_ATOMIC_REFERENCES =
            SettlementApprovalReferencePolicy.MAX_ATOMIC_REFERENCES;

    @Autowired private ApprovalLineService approvalLineService;
    @Autowired private TransactionAttributeSource transactionAttributeSource;
    @Autowired private Validator validator;

    @MockBean private UserClient userClient;
    @MockBean private DynamicPermissionClient dynamicPermissionClient;

    @Test
    void atomicCreate_transactionTimeoutIsFiniteAndShorterThanActiveClaimLease() throws Exception {
        Method method = ApprovalLineService.class.getMethod(
                "createWithActor", ApprovalLineCreateRequest.class, UUID.class);

        var attribute = transactionAttributeSource.getTransactionAttribute(
                method, AopUtils.getTargetClass(approvalLineService));

        assertThat(attribute).isNotNull();
        assertThat(attribute.getTimeout()).isEqualTo(EXPECTED_CREATE_TIMEOUT_SECONDS);
        assertThat(attribute.getTimeout()).isLessThan(ACTIVE_CLAIM_LEASE_SECONDS);
    }

    @Test
    void atomicCreate_rejectsReferencesBeyondTheLeaseBudget() {
        var request = new ApprovalLineCreateRequest(
                UUID.randomUUID(), "D-G7 TF-4", null, List.of(UUID.randomUUID()), null, null,
                java.util.stream.IntStream.range(0, MAX_ATOMIC_REFERENCES + 1)
                        .mapToObj(index -> new ApprovalAttachmentRequest(
                                ApprovalAttachmentType.SLIP_REF, "참조 " + index, index,
                                "2026/08/11-" + index, "SALES_COMMISSION_SETTLEMENT",
                                null, null, null, null, null, null))
                        .toList());

        assertThat(validator.validate(request))
                .as("원자 생성 references 상한은 ACTIVE lease 시간 예산과 함께 검증되어야 한다")
                .isNotEmpty();
    }
}

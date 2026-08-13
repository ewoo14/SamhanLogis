package com.samhanair.logis.accounting.it;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.accounting.AccountingServiceApplication;
import com.samhanair.logis.accounting.client.ETaxClient;
import com.samhanair.logis.accounting.client.KftcClient;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.domain.SalesCommissionSettlementApprovalClaimStatus;
import com.samhanair.logis.accounting.repository.SalesCommissionSettlementApprovalClaimRepository;
import com.samhanair.logis.accounting.service.SalesCommissionSettlementApprovalClaimService;
import com.samhanair.logis.accounting.service.SalesCommissionSettlementService;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import jakarta.persistence.EntityManager;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.jdbc.core.JdbcTemplate;

/** D-G7 TF-1 RED-A1 — V1~V100/PostgreSQL/JPA 왕복에서 renew token을 검증한다. */
@SpringBootTest(classes = AccountingServiceApplication.class)
class SalesCommissionSettlementApprovalClaimIT extends AbstractPostgresIT {

    private static final LocalDate SETTLEMENT_DATE = LocalDate.of(2099, 12, 27);
    private static final String DOCUMENT_NO = "2099/12/27-1";

    @Autowired private SalesCommissionSettlementService settlementService;
    @Autowired private SalesCommissionSettlementApprovalClaimService claimService;
    @Autowired private SalesCommissionSettlementApprovalClaimRepository claimRepository;
    @Autowired private EntityManager entityManager;
    @Autowired private JdbcTemplate jdbcTemplate;

    @MockBean private ETaxClient eTaxClient;
    @MockBean private KftcClient kftcClient;
    @MockBean private PartnerLookupClient partnerLookupClient;
    @MockBean(classes = DynamicPermissionClient.class)
    private DynamicPermissionClient dynamicPermissionClient;

    @BeforeEach
    void cleanFixtures() {
        jdbcTemplate.update("DELETE FROM sales_commission_settlement_approval_claims");
        jdbcTemplate.update("DELETE FROM sales_commission_settlements WHERE settlement_date = ?", SETTLEMENT_DATE);
        jdbcTemplate.update("DELETE FROM sales_commission_settlement_number_sequences WHERE settlement_date = ?",
                SETTLEMENT_DATE);
        entityManager.clear();
    }

    @Test
    void releasedClaim_canBeReservedAgainAndActivatedWithReturnedToken() {
        var settlement = settlementService.confirm(settlementService.createDraft(SETTLEMENT_DATE).getId());
        UUID approvalId = UUID.randomUUID();

        var first = claimService.reserve(DOCUMENT_NO, approvalId);
        UUID firstToken = first.getClaimToken();
        claimService.activate(firstToken);
        claimService.release(firstToken);
        entityManager.clear();

        var renewed = claimService.reserve(DOCUMENT_NO, approvalId);
        UUID renewedToken = renewed.getClaimToken();

        assertThat(renewedToken).isNotEqualTo(firstToken);
        assertThat(claimRepository.findByClaimToken(renewedToken)).get()
                .extracting(claim -> claim.getStatus())
                .isEqualTo(SalesCommissionSettlementApprovalClaimStatus.RESERVED);

        claimService.activate(renewedToken);
        entityManager.clear();

        assertThat(claimRepository.findByClaimToken(renewedToken)).get()
                .extracting(claim -> claim.getStatus())
                .isEqualTo(SalesCommissionSettlementApprovalClaimStatus.ACTIVE);
        assertThat(claimRepository.findByClaimToken(firstToken)).isEmpty();
        assertThat(settlement.getDocumentNo()).isEqualTo(DOCUMENT_NO);
    }

    @Test
    void expiredClaim_canBeRenewedAndActivatedWithTheNewPersistedToken() {
        settlementService.confirm(settlementService.createDraft(SETTLEMENT_DATE).getId());
        UUID approvalId = UUID.randomUUID();

        var first = claimService.reserve(DOCUMENT_NO, approvalId);
        claimService.activate(first.getClaimToken());
        var persisted = claimRepository.findByClaimToken(first.getClaimToken()).orElseThrow();
        persisted.expire(LocalDateTime.of(2099, 12, 27, 0, 10));
        claimRepository.saveAndFlush(persisted);
        entityManager.clear();

        var renewed = claimService.reserve(DOCUMENT_NO, approvalId);
        claimService.activate(renewed.getClaimToken());

        assertThat(renewed.getClaimToken()).isNotEqualTo(first.getClaimToken());
        assertThat(claimRepository.findByClaimToken(renewed.getClaimToken())).get()
                .extracting(claim -> claim.getStatus())
                .isEqualTo(SalesCommissionSettlementApprovalClaimStatus.ACTIVE);
    }

    @Test
    void releasingOneSettlementReference_doesNotReleaseAnotherInFlightReference() {
        var firstSettlement = settlementService.confirm(
                settlementService.createDraft(SETTLEMENT_DATE).getId());
        var secondSettlement = settlementService.confirm(
                settlementService.createDraft(SETTLEMENT_DATE).getId());
        UUID approvalId = UUID.randomUUID();

        var firstClaim = claimService.reserve(firstSettlement.getDocumentNo(), approvalId);
        claimService.activate(firstClaim.getClaimToken());
        var secondClaim = claimService.reserve(secondSettlement.getDocumentNo(), approvalId);
        claimService.activate(secondClaim.getClaimToken());

        claimService.releaseByApprovalReference(approvalId, firstSettlement.getDocumentNo());
        entityManager.clear();

        assertThat(claimRepository.findByClaimToken(firstClaim.getClaimToken())).get()
                .extracting(claim -> claim.getStatus())
                .isEqualTo(SalesCommissionSettlementApprovalClaimStatus.RELEASED);
        assertThat(claimRepository.findByClaimToken(secondClaim.getClaimToken())).get()
                .extracting(claim -> claim.getStatus())
                .isEqualTo(SalesCommissionSettlementApprovalClaimStatus.ACTIVE);
    }

    @Test
    void concurrentReserveForSamePair_hasOneOwnerAndNeverSharesAToken() throws Exception {
        var settlement = settlementService.confirm(
                settlementService.createDraft(SETTLEMENT_DATE).getId());
        UUID approvalId = UUID.randomUUID();
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService executor = Executors.newFixedThreadPool(2);
        List<Callable<Object>> tasks = List.of(
                () -> reserveAfterBarrier(settlement.getDocumentNo(), approvalId, ready, start),
                () -> reserveAfterBarrier(settlement.getDocumentNo(), approvalId, ready, start));

        try {
            List<Future<Object>> futures = tasks.stream().map(executor::submit).toList();
            assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
            start.countDown();

            List<Object> outcomes = new ArrayList<>();
            for (Future<Object> future : futures) {
                outcomes.add(future.get(15, TimeUnit.SECONDS));
            }
            assertThat(outcomes.stream().filter(result -> result instanceof UUID).count()).isEqualTo(1);
            assertThat(outcomes.stream().filter(result -> result instanceof BusinessException).count()).isEqualTo(1);
        } finally {
            executor.shutdownNow();
        }

        assertThat(claimRepository.findAll()).hasSize(1);
    }

    private Object reserveAfterBarrier(String documentNo, UUID approvalId,
                                       CountDownLatch ready, CountDownLatch start) {
        ready.countDown();
        try {
            if (!start.await(5, TimeUnit.SECONDS)) {
                throw new IllegalStateException("reserve barrier timeout");
            }
            return claimService.reserve(documentNo, approvalId).getClaimToken();
        } catch (BusinessException ex) {
            return ex;
        } catch (Exception ex) {
            throw new IllegalStateException(ex);
        }
    }
}

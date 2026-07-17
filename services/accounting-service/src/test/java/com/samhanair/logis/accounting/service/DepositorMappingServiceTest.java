package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.accounting.audit.repository.AccountingAuditLogRepository;
import com.samhanair.logis.accounting.audit.service.AccountingAuditLogService;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.PartnerSummary;
import com.samhanair.logis.accounting.domain.BankDepositorPartnerMapping;
import com.samhanair.logis.accounting.domain.BankTxnSource;
import com.samhanair.logis.accounting.domain.BankTxnType;
import com.samhanair.logis.accounting.repository.BankDepositorPartnerMappingRepository;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/** 매핑 resolver의 입금 전용·stale·학습 권한 경계를 검증한다. */
@ExtendWith(MockitoExtension.class)
class DepositorMappingServiceTest {

    @Mock private BankDepositorPartnerMappingRepository mappingRepository;
    @Mock private PartnerLookupClient partnerLookupClient;
    @Mock private com.samhanair.logis.security.permission.DynamicPermissionClient dynamicPermissionClient;
    @Mock private AccountingAuditLogService auditLogService;
    @Mock private AccountingAuditLogRepository auditLogRepository;
    @InjectMocks private DepositorMappingService service;

    @Test
    @DisplayName("입금만 매핑을 읽고 카드는 resolver에서 제외한다")
    void resolvesDepositsOnly() {
        UUID mappingId = UUID.randomUUID();
        UUID partnerId = UUID.randomUUID();
        BankDepositorPartnerMapping mapping = BankDepositorPartnerMapping.create("Acme", partnerId);
        PartnerSummary partner = new PartnerSummary(partnerId, "P-001", "Acme", null, null);
        when(mappingRepository.findByNormalizedNameAndIsDeletedFalse("ACME"))
                .thenReturn(Optional.of(mapping));
        when(partnerLookupClient.findByPartnerId(partnerId)).thenReturn(Optional.of(partner));

        DepositorMappingService.MappingResolution resolved = service.resolveDeposit(
                " acme ", BankTxnType.DEPOSIT, BankTxnSource.CODEF_BANK);
        DepositorMappingService.MappingResolution card = service.resolveDeposit(
                " acme ", BankTxnType.DEPOSIT, BankTxnSource.CODEF_CARD);

        assertThat(resolved.isMatched()).isTrue();
        assertThat(resolved.partner().partnerCode()).isEqualTo("P-001");
        assertThat(card.kind()).isEqualTo(DepositorMappingService.ResolutionKind.NONE);
        verify(partnerLookupClient).findByPartnerId(partnerId);
        verify(mappingRepository, never()).upsertActive(any(), any(), any(), any());
    }

    @Test
    @DisplayName("stale target는 stale 결과로 반환해 partnerCode 폴백을 막는다")
    void returnsStaleWithoutFallback() {
        UUID partnerId = UUID.randomUUID();
        BankDepositorPartnerMapping mapping = BankDepositorPartnerMapping.create("Acme", partnerId);
        when(mappingRepository.findByNormalizedNameAndIsDeletedFalse("ACME"))
                .thenReturn(Optional.of(mapping));
        when(partnerLookupClient.findByPartnerId(partnerId)).thenReturn(Optional.empty());

        DepositorMappingService.MappingResolution resolution = service.resolveDeposit(
                "Acme", BankTxnType.DEPOSIT, BankTxnSource.CODEF_BANK);

        assertThat(resolution.isStale()).isTrue();
    }

    @Test
    @DisplayName("매핑 UPDATE 권한이 없으면 수동 매칭이 학습 upsert를 하지 않는다")
    void doesNotLearnWithoutUpdatePermission() {
        UUID actorId = UUID.randomUUID();
        PartnerSummary partner = new PartnerSummary(UUID.randomUUID(), "P-001", "Acme", null, null);
        when(dynamicPermissionClient.check(actorId, DepositorMappingService.PAGE_CODE,
                com.samhanair.logis.security.permission.PermissionAction.UPDATE)).thenReturn(false);

        service.learnMappingIfPermitted("Acme", partner, actorId, "사용자");

        verify(mappingRepository, never()).upsertActive(any(), any(), any(), any());
    }

    @Test
    @DisplayName("매핑 UPDATE 권한이 있으면 수동 매칭에서만 원자 upsert 학습을 수행한다")
    void learnsWithUpdatePermission() {
        UUID actorId = UUID.randomUUID();
        PartnerSummary partner = new PartnerSummary(UUID.randomUUID(), "P-001", "Acme", null, null);
        when(dynamicPermissionClient.check(actorId, DepositorMappingService.PAGE_CODE,
                com.samhanair.logis.security.permission.PermissionAction.UPDATE)).thenReturn(true);
        BankDepositorPartnerMapping saved = BankDepositorPartnerMapping.create("Acme", partner.partnerId());
        when(mappingRepository.findByNormalizedNameAndIsDeletedFalse("ACME"))
                .thenReturn(Optional.empty(), Optional.of(saved));

        service.learnMappingIfPermitted(" Acme ", partner, actorId, "사용자");

        verify(mappingRepository).upsertActive("Acme", "ACME", partner.partnerId(), actorId.toString());
    }
}

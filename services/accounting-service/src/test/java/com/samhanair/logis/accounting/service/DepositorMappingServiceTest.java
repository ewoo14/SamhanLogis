package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.samhanair.logis.accounting.audit.domain.AccountingAuditLog;
import com.samhanair.logis.accounting.audit.repository.AccountingAuditLogRepository;
import com.samhanair.logis.accounting.audit.service.AccountingAuditLogService;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.PartnerSummary;
import com.samhanair.logis.accounting.domain.BankDepositorPartnerMapping;
import com.samhanair.logis.accounting.domain.BankTxnSource;
import com.samhanair.logis.accounting.domain.BankTxnType;
import com.samhanair.logis.accounting.repository.BankDepositorPartnerMappingRepository;
import com.samhanair.logis.accounting.web.dto.BankDepositorPartnerMappingHistoryResponse;
import com.samhanair.logis.accounting.web.dto.BankDepositorPartnerMappingRequest;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;

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
    @DisplayName("SUSPENDED/TERMINATED 거래처는 stale로 취급해 자동 적용을 막는다")
    void returnsStaleWhenPartnerNotActive() {
        UUID partnerId = UUID.randomUUID();
        BankDepositorPartnerMapping mapping = BankDepositorPartnerMapping.create("Acme", partnerId);
        when(mappingRepository.findByNormalizedNameAndIsDeletedFalse("ACME"))
                .thenReturn(Optional.of(mapping));
        when(partnerLookupClient.findByPartnerId(partnerId)).thenReturn(Optional.of(
                new PartnerSummary(partnerId, "P-001", "Acme", null, null, null, "SUSPENDED")));

        DepositorMappingService.MappingResolution suspended = service.resolveDeposit(
                "Acme", BankTxnType.DEPOSIT, BankTxnSource.CODEF_BANK);

        when(partnerLookupClient.findByPartnerId(partnerId)).thenReturn(Optional.of(
                new PartnerSummary(partnerId, "P-001", "Acme", null, null, null, "TERMINATED")));
        DepositorMappingService.MappingResolution terminated = service.resolveDeposit(
                "Acme", BankTxnType.DEPOSIT, BankTxnSource.CODEF_BANK);

        when(partnerLookupClient.findByPartnerId(partnerId)).thenReturn(Optional.of(
                new PartnerSummary(partnerId, "P-001", "Acme", null, null, null, "ACTIVE")));
        DepositorMappingService.MappingResolution active = service.resolveDeposit(
                "Acme", BankTxnType.DEPOSIT, BankTxnSource.CODEF_BANK);

        assertThat(suspended.isStale()).isTrue();
        assertThat(terminated.isStale()).isTrue();
        assertThat(active.isMatched()).isTrue();
    }

    @Test
    @DisplayName("update rename 경합의 DataIntegrityViolation은 409 CONFLICT로 변환한다")
    void updateRenameRaceReturnsConflict() {
        UUID actorId = UUID.randomUUID();
        UUID partnerId = UUID.randomUUID();
        BankDepositorPartnerMapping mapping = BankDepositorPartnerMapping.create("Acme", partnerId);
        when(mappingRepository.findByNormalizedNameAndIsDeletedFalse("ACME"))
                .thenReturn(Optional.of(mapping));
        when(mappingRepository.findByNormalizedNameAndIsDeletedFalse("OTHER"))
                .thenReturn(Optional.empty());
        when(partnerLookupClient.findByPartnerCode("P-002")).thenReturn(Optional.of(
                new PartnerSummary(partnerId, "P-002", "Other", null, null)));
        when(partnerLookupClient.findByPartnerId(partnerId)).thenReturn(Optional.of(
                new PartnerSummary(partnerId, "P-001", "Acme", null, null)));
        when(mappingRepository.saveAndFlush(any()))
                .thenThrow(new DataIntegrityViolationException("uq_bank_depositor_mapping_normalized_active"));

        assertThatThrownBy(() -> service.update("ACME",
                new BankDepositorPartnerMappingRequest("Other", "P-002", null), actorId, "사용자"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.CONFLICT));
    }

    @Test
    @DisplayName("deposit-mapping DELETE 권한이 없으면 deleteByIdIfPermitted가 403으로 거부한다")
    void deleteByIdIfPermittedFailsClosedWithoutPermission() {
        UUID mappingId = UUID.randomUUID();
        UUID actorId = UUID.randomUUID();
        when(dynamicPermissionClient.check(actorId, DepositorMappingService.PAGE_CODE,
                com.samhanair.logis.security.permission.PermissionAction.DELETE)).thenReturn(false);

        assertThatThrownBy(() -> service.deleteByIdIfPermitted(mappingId, actorId, "사용자", "ADMIN_DELETE"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.FORBIDDEN));
        assertThatThrownBy(() -> service.deleteByIdIfPermitted(mappingId, null, "SYSTEM", "ADMIN_DELETE"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.FORBIDDEN));
        verifyNoInteractions(mappingRepository);
    }

    @Test
    @DisplayName("deposit-mapping DELETE 권한이 있으면 deleteByIdIfPermitted가 soft delete를 수행한다")
    void deleteByIdIfPermittedDeletesWithPermission() {
        UUID actorId = UUID.randomUUID();
        UUID partnerId = UUID.randomUUID();
        UUID mappingId = UUID.randomUUID();
        BankDepositorPartnerMapping mapping = BankDepositorPartnerMapping.create("Acme", partnerId);
        when(dynamicPermissionClient.check(actorId, DepositorMappingService.PAGE_CODE,
                com.samhanair.logis.security.permission.PermissionAction.DELETE)).thenReturn(true);
        when(mappingRepository.findById(mappingId)).thenReturn(Optional.of(mapping));
        when(mappingRepository.findByNormalizedNameAndIsDeletedFalse("ACME"))
                .thenReturn(Optional.of(mapping));
        when(partnerLookupClient.findByPartnerId(partnerId)).thenReturn(Optional.empty());
        when(mappingRepository.saveAndFlush(any())).thenReturn(mapping);

        service.deleteByIdIfPermitted(mappingId, actorId, "사용자", "ADMIN_DELETE");

        assertThat(mapping.getIsDeleted()).isTrue();
        verify(mappingRepository).saveAndFlush(mapping);

        // mappingId 가 null 이면 삭제 대상이 없어 권한 검증 없이 조용히 반환한다.
        service.deleteByIdIfPermitted(null, actorId, "사용자", "ADMIN_DELETE");
    }

    @Test
    @DisplayName("이력 조회는 매핑 entityId 기준 전 필드 행을 revisionNo와 함께 반환한다")
    void historyReturnsAllFieldRowsByEntityId() {
        UUID entityId = UUID.randomUUID();
        UUID renamedEntityId = UUID.randomUUID();
        UUID actorId = UUID.randomUUID();
        when(mappingRepository.findIdsByNormalizedNameIncludingDeleted("ACME"))
                .thenReturn(List.of(entityId));
        when(auditLogRepository.findMappingEntityIdsByNormalizedName("ACME"))
                .thenReturn(List.of(renamedEntityId));
        when(auditLogRepository.findMappingHistoryByEntityIds(any()))
                .thenReturn(List.of(
                        AccountingAuditLog.record(entityId, 2, actorId, "사용자", null,
                                "mapping.partnerCode", "P-001", "P-002"),
                        AccountingAuditLog.record(entityId, 2, actorId, "사용자", null,
                                "mapping.reason", null, "ADMIN_UPDATE"),
                        AccountingAuditLog.record(entityId, 1, actorId, "사용자", null,
                                "mapping.normalizedName", null, "ACME")));

        List<BankDepositorPartnerMappingHistoryResponse> history = service.history("acme");

        assertThat(history).hasSize(3);
        assertThat(history.get(0).fieldName()).isEqualTo("mapping.partnerCode");
        assertThat(history.get(0).oldValue()).isEqualTo("P-001");
        assertThat(history.get(0).newValue()).isEqualTo("P-002");
        assertThat(history.get(0).revisionNo()).isEqualTo(2);
        assertThat(history.get(1).fieldName()).isEqualTo("mapping.reason");
        verify(auditLogRepository).findMappingHistoryByEntityIds(
                org.mockito.ArgumentMatchers.argThat(ids ->
                        ids.contains(entityId) && ids.contains(renamedEntityId)));
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
    @DisplayName("정규화 팽창(120자 초과) 학습 실패는 내부에서 격리되어 던지지 않고 학습만 생략한다")
    void learnSkipsSilentlyWhenNormalizationExpandsOverLimit() {
        UUID actorId = UUID.randomUUID();
        PartnerSummary partner = new PartnerSummary(UUID.randomUUID(), "P-001", "Acme", null, null);
        when(dynamicPermissionClient.check(actorId, DepositorMappingService.PAGE_CODE,
                com.samhanair.logis.security.permission.PermissionAction.UPDATE)).thenReturn(true);

        // 'ß'는 Locale.ROOT 대문자화에서 'SS'로 팽창 — raw 100자 → 정규화 200자 > 120.
        service.learnMappingIfPermitted("ß".repeat(100), partner, actorId, "사용자");

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

package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
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
import java.time.LocalDateTime;
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
        verify(mappingRepository, never()).upsertActive(any(), any(), any(), any(), any());
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
        when(mappingRepository.saveAndFlush(any()))
                .thenThrow(new DataIntegrityViolationException("uq_bank_depositor_mapping_normalized_active"));

        assertThatThrownBy(() -> service.update("ACME",
                new BankDepositorPartnerMappingRequest("Other", "P-002", null), actorId, "사용자"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.CONFLICT));
        // #810 R3-CODEX (S3-L1): rename 2-key lock 은 Java 문자열 정렬이 아니라
        // 공용 정렬 획득 쿼리(lock_id 오름차순) 1회 호출로 잠근다.
        verify(mappingRepository, times(1)).acquireNormalizedNameAdvisoryLocks("ACME", "OTHER");
    }

    @Test
    @DisplayName("#810 R3-CODEX: deleteById는 lock 직후 키 재확인으로 동시 rename을 409로 거부한다")
    void deleteByIdRejectsConcurrentRenameWithConflict() {
        UUID mappingId = UUID.randomUUID();
        // 첫 조회는 ACME, lock 획득 직후 재조회는 RENAMED — lock 대기 중 rename 커밋 시나리오.
        when(mappingRepository.findNormalizedNameById(mappingId)).thenReturn("ACME", "RENAMED");

        assertThatThrownBy(() -> service.deleteById(mappingId, UUID.randomUUID(), "사용자", "ADMIN_DELETE"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.CONFLICT));

        // 잘못된(rename 이전 키 기준) entity 를 로드해 덮어쓰지 않는다 — 전체 tx rollback 대상.
        verify(mappingRepository, never()).findById(any());
        verify(mappingRepository, never()).saveAndFlush(any());
        // 옛 키 lock 보유 상태에서 새 키 lock 을 추가 획득(rename 경로와 순서 역전 데드락)하지 않는다.
        verify(mappingRepository, times(1)).acquireNormalizedNameAdvisoryLock("ACME");
        verify(mappingRepository, never()).acquireNormalizedNameAdvisoryLock("RENAMED");
    }

    @Test
    @DisplayName("#810 R3-CODEX: deleteById는 lock 후 키가 그대로면 정상 soft delete를 진행한다")
    void deleteByIdProceedsWhenKeyStableAfterLock() {
        UUID mappingId = UUID.randomUUID();
        BankDepositorPartnerMapping mapping = BankDepositorPartnerMapping.create(
                "Acme", UUID.randomUUID(), "P-001");
        when(mappingRepository.findNormalizedNameById(mappingId)).thenReturn("ACME", "ACME");
        when(mappingRepository.findById(mappingId)).thenReturn(Optional.of(mapping));
        when(mappingRepository.saveAndFlush(mapping)).thenReturn(mapping);

        service.deleteById(mappingId, UUID.randomUUID(), "사용자", "ADMIN_DELETE");

        assertThat(mapping.getIsDeleted()).isTrue();
        verify(mappingRepository).saveAndFlush(mapping);
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
        when(mappingRepository.saveAndFlush(any())).thenReturn(mapping);

        service.deleteByIdIfPermitted(mappingId, actorId, "사용자", "ADMIN_DELETE");

        assertThat(mapping.getIsDeleted()).isTrue();
        verify(mappingRepository).saveAndFlush(mapping);

        // mappingId 가 null 이면 삭제 대상이 없어 권한 검증 없이 조용히 반환한다.
        service.deleteByIdIfPermitted(null, actorId, "사용자", "ADMIN_DELETE");
    }

    @Test
    @DisplayName("SYSTEM MASTER는 내부 deposit-mapping DELETE 권한 조회 없이 exact entity를 삭제한다")
    void systemMasterDeletesWithoutDynamicPermission() {
        UUID mappingId = UUID.randomUUID();
        UUID partnerId = UUID.randomUUID();
        BankDepositorPartnerMapping mapping = BankDepositorPartnerMapping.create("Acme", partnerId, "P-001");
        when(mappingRepository.findById(mappingId)).thenReturn(Optional.of(mapping));
        when(mappingRepository.saveAndFlush(mapping)).thenReturn(mapping);

        service.deleteByIdIfPermitted(mappingId, UUID.randomUUID(), "MASTER", "ADMIN_DELETE", true);

        verify(dynamicPermissionClient, never()).check(any(), any(), any());
        verify(mappingRepository).saveAndFlush(mapping);
        assertThat(mapping.getIsDeleted()).isTrue();
    }

    @Test
    @DisplayName("이력 조회는 매핑 entityId 기준 전 필드 행을 revisionNo와 함께 반환한다")
    void historyReturnsAllFieldRowsByEntityId() {
        UUID entityId = UUID.randomUUID();
        UUID renamedEntityId = UUID.randomUUID();
        UUID actorId = UUID.randomUUID();
        // #832 W1 fix: 명시적 changedAt(생성 rev1=base, 수정 rev2=base+5분)으로 실제 시간축
        // (생성이 oldest)을 결정적으로 모델링한다 — now() 3연속 호출의 시계 해상도에 파생 ordinal 이
        // 흔들리는 nondeterminism 을 제거해 아래 행-값 바인딩 단언이 항상 같은 결과를 갖게 한다.
        LocalDateTime base = LocalDateTime.of(2026, 7, 20, 9, 0);
        when(mappingRepository.findIdsByNormalizedNameIncludingDeleted("ACME"))
                .thenReturn(List.of(entityId));
        when(auditLogRepository.findMappingEntityIdsByNormalizedName("ACME"))
                .thenReturn(List.of(renamedEntityId));
        when(auditLogRepository.findMappingHistoryByEntityIds(any()))
                .thenReturn(List.of(
                        AccountingAuditLog.record(entityId, 2, actorId, "사용자", null,
                                "mapping.partnerCode", "P-001", "P-002", base.plusMinutes(5)),
                        AccountingAuditLog.record(entityId, 2, actorId, "사용자", null,
                                "mapping.reason", null, "ADMIN_UPDATE", base.plusMinutes(5)),
                        AccountingAuditLog.record(entityId, 1, actorId, "사용자", null,
                                "mapping.normalizedName", null, "ACME", base)));

        List<BankDepositorPartnerMappingHistoryResponse> history = service.history("acme");

        assertThat(history).hasSize(3);
        assertThat(history.get(0).fieldName()).isEqualTo("mapping.partnerCode");
        assertThat(history.get(0).oldValue()).isEqualTo("P-001");
        assertThat(history.get(0).newValue()).isEqualTo("P-002");
        assertThat(history.get(0).revisionNo()).isEqualTo(2);
        // #832 W1 fix: list.toString().contains(varargs)는 각 substring 을 독립 매칭해 방향이
        // 뒤집혀도 GREEN — 레코드 accessor 로 행-값을 바인딩한다. get(0)=최신(rev2) partnerCode 행,
        // 수정 작업이므로 operationOrdinal 2, 단일 세대라 generation 1.
        assertThat(history.get(0).operationOrdinal()).isEqualTo(2);
        assertThat(history.get(0).generation()).isEqualTo(1);
        // rev1(normalizedName 생성)은 oldest 작업 → operationOrdinal 1·generation 1.
        assertThat(history)
                .filteredOn(h -> h.revisionNo() == 1)
                .hasSize(1)
                .allSatisfy(h -> {
                    assertThat(h.operationOrdinal()).isEqualTo(1);
                    assertThat(h.generation()).isEqualTo(1);
                });
        assertThat(history.get(1).fieldName()).isEqualTo("mapping.reason");
        // #810 R3-CODEX (S4-M3, 계약 pin): 행마다 유일·안정한 opaque entryKey — 같은
        // revisionNo(2) 를 공유하는 두 행도 서로 다른 key 를 가져 FE React key 충돌이 없다.
        // 32자 hex(SHA-256 절단) — UUID 형식이 아니며 원문 UUID 를 노출하지 않는다.
        assertThat(history)
                .extracting(BankDepositorPartnerMappingHistoryResponse::entryKey)
                .doesNotContainNull()
                .allMatch(key -> key.matches("[0-9a-f]{32}"))
                .doesNotHaveDuplicates();
        verify(auditLogRepository).findMappingHistoryByEntityIds(
                org.mockito.ArgumentMatchers.argThat(ids ->
                        ids.contains(entityId) && ids.contains(renamedEntityId)));
    }

    @Test
    @DisplayName("history는 레거시 분산 시각 행도 entityId·revisionNo 작업 하나로 묶는다")
    void historyGroupsLegacyRowsByEntityAndRevision() {
        UUID entityId = UUID.fromString("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
        UUID actorId = UUID.randomUUID();
        LocalDateTime base = LocalDateTime.of(2026, 7, 20, 9, 0);
        when(mappingRepository.findIdsByNormalizedNameIncludingDeleted("ACME")).thenReturn(List.of(entityId));
        when(auditLogRepository.findMappingEntityIdsByNormalizedName("ACME")).thenReturn(List.of());
        when(auditLogRepository.findMappingHistoryByEntityIds(any())).thenReturn(List.of(
                AccountingAuditLog.record(entityId, 2, actorId, "사용자", null,
                        "mapping.reason", null, "UPDATE", base.plusMinutes(2)),
                AccountingAuditLog.record(entityId, 2, actorId, "사용자", null,
                        "mapping.partnerCode", "P-001", "P-002", base.plusMinutes(1)),
                AccountingAuditLog.record(entityId, 1, actorId, "사용자", null,
                        "mapping.rawName", null, "Acme", base)));

        List<BankDepositorPartnerMappingHistoryResponse> history = service.history("ACME");

        assertThat(history).hasSize(3);
        // #832 W1 fix: substring contains("operationOrdinal=2")는 =20/=25 도 매치하고 오분할을
        // 놓친다 — 정확 정수 단언으로 교체. 같은 (entityId, revisionNo=2)의 두 필드행
        // (reason@+2, partnerCode@+1)은 changedAt 이 분산돼도 하나의 작업으로 묶여 동일
        // operationOrdinal(2)을 공유한다. 오분할되면 한 행이 ordinal 3 을 받아 containsOnly(2)가 깨진다.
        assertThat(history)
                .filteredOn(h -> h.revisionNo() == 2)
                .hasSize(2)
                .extracting(BankDepositorPartnerMappingHistoryResponse::operationOrdinal)
                .containsOnly(2);
        // rev1(rawName@base)은 oldest 작업 → operationOrdinal 1.
        assertThat(history)
                .filteredOn(h -> h.revisionNo() == 1)
                .hasSize(1)
                .extracting(BankDepositorPartnerMappingHistoryResponse::operationOrdinal)
                .containsOnly(1);
    }

    @Test
    @DisplayName("동시각 세대는 entityId asc로 결정하고 반복 조회에도 파생 순서가 안정적이다")
    void historyUsesStableGenerationTieBreak() {
        UUID firstEntity = UUID.fromString("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
        UUID secondEntity = UUID.fromString("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
        UUID actorId = UUID.randomUUID();
        LocalDateTime changedAt = LocalDateTime.of(2026, 7, 20, 10, 0);
        when(mappingRepository.findIdsByNormalizedNameIncludingDeleted("ACME"))
                .thenReturn(List.of(secondEntity, firstEntity));
        when(auditLogRepository.findMappingEntityIdsByNormalizedName("ACME"))
                .thenReturn(List.of());
        when(auditLogRepository.findMappingHistoryByEntityIds(any())).thenReturn(List.of(
                AccountingAuditLog.record(secondEntity, 1, actorId, "사용자", null,
                        "mapping.partnerCode", null, "SECOND", changedAt),
                AccountingAuditLog.record(firstEntity, 1, actorId, "사용자", null,
                        "mapping.partnerCode", null, "FIRST", changedAt)));

        List<BankDepositorPartnerMappingHistoryResponse> first = service.history("ACME");
        List<BankDepositorPartnerMappingHistoryResponse> second = service.history("ACME");

        // #832 W1 fix: toString().contains(varargs)는 substring 을 독립 매칭해 tiebreak 방향
        // (FIRST↔SECOND 의 ordinal/generation)을 뒤집어도 GREEN — 레코드 accessor 로 행-값을
        // 바인딩해 방향을 실제로 고정한다. 동시각이므로 세대는 entityId(UUID.toString) asc 로 결정되어
        // firstEntity(aaaa…)=1세대, secondEntity(bbbb…)=2세대이고, ordinal 도 동시각 tie 를
        // generation asc 로 깨 1·2 로 채번한다. 방향을 뒤집으면 아래 단언이 RED 가 된다.
        assertThat(first)
                .filteredOn(h -> "FIRST".equals(h.newValue()))
                .hasSize(1)
                .allSatisfy(h -> {
                    assertThat(h.operationOrdinal()).isEqualTo(1);
                    assertThat(h.generation()).isEqualTo(1);
                });
        assertThat(first)
                .filteredOn(h -> "SECOND".equals(h.newValue()))
                .hasSize(1)
                .allSatisfy(h -> {
                    assertThat(h.operationOrdinal()).isEqualTo(2);
                    assertThat(h.generation()).isEqualTo(2);
                });
        // 반복 조회에도 파생 순서·값이 동일(결정적)하다.
        assertThat(second.toString()).isEqualTo(first.toString());
    }

    @Test
    @DisplayName("매핑 UPDATE 권한이 없으면 수동 매칭이 학습 upsert를 하지 않는다")
    void doesNotLearnWithoutUpdatePermission() {
        UUID actorId = UUID.randomUUID();
        PartnerSummary partner = new PartnerSummary(UUID.randomUUID(), "P-001", "Acme", null, null);
        when(dynamicPermissionClient.check(actorId, DepositorMappingService.PAGE_CODE,
                com.samhanair.logis.security.permission.PermissionAction.UPDATE)).thenReturn(false);

        service.learnMappingIfPermitted("Acme", partner, actorId, "사용자");

        verify(mappingRepository, never()).upsertActive(any(), any(), any(), any(), any());
    }

    @Test
    @DisplayName("SYSTEM MASTER 수동 매칭 학습은 내부 UPDATE 권한 조회 없이 upsert한다")
    void systemMasterLearnsWithoutDynamicPermission() {
        UUID actorId = UUID.randomUUID();
        PartnerSummary partner = new PartnerSummary(UUID.randomUUID(), "P-001", "Acme", null, null);
        BankDepositorPartnerMapping saved = BankDepositorPartnerMapping.create("Acme", partner.partnerId(), "P-001");
        when(mappingRepository.findByNormalizedNameAndIsDeletedFalse("ACME"))
                .thenReturn(Optional.empty(), Optional.of(saved));

        service.learnMappingIfPermitted("Acme", partner, actorId, "MASTER", true);

        verify(dynamicPermissionClient, never()).check(any(), any(), any());
        verify(mappingRepository).upsertActive("Acme", "ACME", partner.partnerId(), "P-001", actorId.toString());
    }

    @Test
    @DisplayName("partner lookup UNAVAILABLE은 stale가 아니라 재시도 대상 결과로 반환한다")
    void returnsUnavailableWhenPartnerLookupUnavailable() {
        UUID partnerId = UUID.randomUUID();
        BankDepositorPartnerMapping mapping = BankDepositorPartnerMapping.create("Acme", partnerId, "P-001");
        when(mappingRepository.findByNormalizedNameAndIsDeletedFalse("ACME"))
                .thenReturn(Optional.of(mapping));
        when(partnerLookupClient.findByPartnerIdResult(partnerId))
                .thenReturn(PartnerLookupClient.LookupResult.unavailable());

        DepositorMappingService.MappingResolution resolution = service.resolveDeposit(
                "Acme", BankTxnType.DEPOSIT, BankTxnSource.CODEF_BANK);

        assertThat(resolution.isUnavailable()).isTrue();
        assertThat(resolution.isStale()).isFalse();
    }

    @Test
    @DisplayName("#810 R3: 관리 조회의 lookup UNAVAILABLE은 stale로 붕괴하지 않고 UNAVAILABLE로 구분 표기한다")
    void getMarksUnavailableTargetDistinctFromStale() {
        UUID partnerId = UUID.randomUUID();
        BankDepositorPartnerMapping mapping = BankDepositorPartnerMapping.create("Acme", partnerId, "P-001");
        when(mappingRepository.findByNormalizedNameAndIsDeletedFalse("ACME"))
                .thenReturn(Optional.of(mapping));
        when(partnerLookupClient.findByPartnerIdResult(partnerId))
                .thenReturn(PartnerLookupClient.LookupResult.unavailable());

        var unavailable = service.get("acme");

        assertThat(unavailable.targetStatus()).isEqualTo("UNAVAILABLE");
        assertThat(unavailable.staleTarget()).isFalse();
        assertThat(unavailable.partnerCode()).isEqualTo("P-001");
        assertThat(unavailable.partnerName()).isNull();

        // 대조: 진짜 미존재(NOT_FOUND)는 기존 계약대로 stale 로 표기한다.
        when(partnerLookupClient.findByPartnerIdResult(partnerId))
                .thenReturn(PartnerLookupClient.LookupResult.notFound());

        var stale = service.get("acme");

        assertThat(stale.staleTarget()).isTrue();
        assertThat(stale.targetStatus()).isNull();
        assertThat(stale.partnerCode()).isEqualTo("P-001");
    }

    @Test
    @DisplayName("stale mapping 삭제 audit은 저장된 partnerCode snapshot을 보존한다")
    void deleteAuditPreservesPartnerCodeSnapshot() {
        UUID mappingId = UUID.randomUUID();
        BankDepositorPartnerMapping mapping = BankDepositorPartnerMapping.create(
                "Acme", UUID.randomUUID(), "P-001");
        when(mappingRepository.findById(mappingId)).thenReturn(Optional.of(mapping));
        when(mappingRepository.saveAndFlush(mapping)).thenReturn(mapping);

        service.deleteById(mappingId, UUID.randomUUID(), "사용자", "ADMIN_DELETE");

        verify(auditLogService).recordBatch(any(), any(), any(), any(),
                org.mockito.ArgumentMatchers.argThat(changes -> changes.stream()
                        .anyMatch(change -> change.fieldName().equals("mapping.partnerCode")
                                && "P-001".equals(change.oldValue())
                                && change.newValue() == null)));
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

        verify(mappingRepository, never()).upsertActive(any(), any(), any(), any(), any());
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

        verify(mappingRepository).upsertActive("Acme", "ACME", partner.partnerId(), "P-001", actorId.toString());
    }
}

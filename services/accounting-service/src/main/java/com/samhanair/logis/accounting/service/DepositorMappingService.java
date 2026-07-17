package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.audit.domain.AccountingAuditLog;
import com.samhanair.logis.accounting.audit.repository.AccountingAuditLogRepository;
import com.samhanair.logis.accounting.audit.service.AccountingAuditLogService;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.PartnerSummary;
import com.samhanair.logis.accounting.domain.BankDepositorPartnerMapping;
import com.samhanair.logis.accounting.domain.BankTxnSource;
import com.samhanair.logis.accounting.domain.BankTxnType;
import com.samhanair.logis.accounting.repository.BankDepositorPartnerMappingRepository;
import com.samhanair.logis.accounting.util.DepositorNameNormalizer;
import com.samhanair.logis.accounting.web.dto.BankDepositorPartnerMappingHistoryResponse;
import com.samhanair.logis.accounting.web.dto.BankDepositorPartnerMappingRequest;
import com.samhanair.logis.accounting.web.dto.BankDepositorPartnerMappingResponse;
import com.samhanair.logis.shared.realtime.audit.ChangeEntry;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 입금자명 매핑 CRUD·학습·입금 전용 자동 적용 서비스.
 *
 * <p>자동 resolver는 읽기 전용이며, 매핑을 학습하는 유일한 경로는 수동 매칭과 관리 CRUD다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional
public class DepositorMappingService {

    /** 관리 매핑 page-code. */
    public static final String PAGE_CODE = "accounting.deposit-mapping";
    private static final UUID SYSTEM_ACTOR = new UUID(0L, 0L);

    private final BankDepositorPartnerMappingRepository mappingRepository;
    private final PartnerLookupClient partnerLookupClient;
    private final DynamicPermissionClient dynamicPermissionClient;
    private final AccountingAuditLogService auditLogService;
    private final AccountingAuditLogRepository auditLogRepository;

    /** 활성 매핑 목록을 business-key 응답으로 반환한다. */
    @Transactional(readOnly = true)
    public List<BankDepositorPartnerMappingResponse> list() {
        return mappingRepository.findAllByIsDeletedFalse(Sort.by(Sort.Order.asc("normalizedName"))).stream()
                .map(this::toResponse)
                .toList();
    }

    /** normalizedName 기준 단건 매핑을 반환한다. */
    @Transactional(readOnly = true)
    public BankDepositorPartnerMappingResponse get(String normalizedName) {
        return toResponse(findActive(normalizedName));
    }

    /** 매핑을 생성하고 거래처 코드의 외부 master 존재를 검증한다. */
    public BankDepositorPartnerMappingResponse create(BankDepositorPartnerMappingRequest request,
                                                      UUID actorId, String actorName) {
        validateRequest(request);
        String normalized = normalizeRequired(request.rawName());
        if (mappingRepository.findByNormalizedNameAndIsDeletedFalse(normalized).isPresent()) {
            throw new BusinessException(ErrorCode.CONFLICT, "이미 등록된 입금자명 매핑입니다: " + normalized);
        }
        PartnerSummary partner = resolvePartner(request.partnerCode());
        BankDepositorPartnerMapping mapping = BankDepositorPartnerMapping.create(
                request.rawName(), partner.partnerId());
        try {
            BankDepositorPartnerMapping saved = mappingRepository.saveAndFlush(mapping);
            recordMappingAudit(saved, null, null, null, saved.getRawName(), saved.getNormalizedName(),
                    partner.partnerCode(), actorId, actorName, reason(request.reason(), "ADMIN_CREATE"));
            return toResponse(saved, partner);
        } catch (DataIntegrityViolationException ex) {
            throw new BusinessException(ErrorCode.CONFLICT, "동일한 입금자명 매핑이 동시에 등록되었습니다.", ex);
        }
    }

    /** business key로 매핑을 수정한다. key rename 충돌은 409로 거부한다. */
    public BankDepositorPartnerMappingResponse update(String oldNormalizedName,
                                                      BankDepositorPartnerMappingRequest request,
                                                      UUID actorId, String actorName) {
        validateRequest(request);
        BankDepositorPartnerMapping mapping = findActive(oldNormalizedName);
        String newNormalized = normalizeRequired(request.rawName());
        if (!newNormalized.equals(mapping.getNormalizedName())
                && mappingRepository.findByNormalizedNameAndIsDeletedFalse(newNormalized).isPresent()) {
            throw new BusinessException(ErrorCode.CONFLICT, "변경할 입금자명 매핑 키가 이미 존재합니다: " + newNormalized);
        }
        PartnerSummary partner = resolvePartner(request.partnerCode());
        String oldRaw = mapping.getRawName();
        String oldKey = mapping.getNormalizedName();
        UUID oldPartnerId = mapping.getPartnerId();
        String oldPartnerCode = partnerLookupClient.findByPartnerId(oldPartnerId)
                .map(PartnerSummary::partnerCode).orElse(null);
        mapping.updateMapping(request.rawName(), partner.partnerId());
        BankDepositorPartnerMapping saved;
        try {
            saved = mappingRepository.saveAndFlush(mapping);
        } catch (DataIntegrityViolationException ex) {
            // rename 경합: 사전 존재 검사 이후 같은 키가 동시에 생성되면 partial unique 가 flush 에서 거부한다.
            throw new BusinessException(ErrorCode.CONFLICT, "변경할 입금자명 매핑 키가 동시에 등록되었습니다.", ex);
        }
        recordMappingAudit(saved, oldRaw, oldKey, oldPartnerCode, saved.getRawName(), saved.getNormalizedName(),
                partner.partnerCode(), actorId, actorName, reason(request.reason(), "ADMIN_UPDATE"));
        return toResponse(saved, partner);
    }

    /** business key로 매핑을 soft delete한다. */
    public void delete(String normalizedName, UUID actorId, String actorName, String reason) {
        BankDepositorPartnerMapping mapping = findActive(normalizedName);
        String oldPartnerCode = partnerLookupClient.findByPartnerId(mapping.getPartnerId())
                .map(PartnerSummary::partnerCode).orElse(null);
        mapping.delete(storageActor(actorId, actorName));
        mappingRepository.saveAndFlush(mapping);
        recordMappingAudit(mapping, mapping.getRawName(), mapping.getNormalizedName(), oldPartnerCode,
                null, mapping.getNormalizedName(), null, actorId, actorName, reason(reason, "ADMIN_DELETE"));
    }

    /** 거래의 matchedMappingId로 매핑을 soft delete한다. UUID는 endpoint에 노출하지 않는다. */
    public void deleteById(UUID mappingId, UUID actorId, String actorName, String reason) {
        if (mappingId == null) {
            return;
        }
        mappingRepository.findById(mappingId).ifPresent(mapping ->
                delete(mapping.getNormalizedName(), actorId, actorName, reason));
    }

    /**
     * deposit-mapping:DELETE 계정 권한을 검증한 뒤 매핑을 soft delete한다 — #810 적대검증 R1 (L2-H1/L2-M1).
     *
     * <p>거래 해제와 결합된 "매핑도 삭제" 경로는 {@code bank-matching:UPDATE}(컨트롤러 게이트)에 더해
     * 본 메서드의 {@code deposit-mapping:DELETE} 검증을 모두 통과해야 한다.
     * {@link #learnMappingIfPermitted}와 같은 fail-closed 정책이되, 삭제는 조용히 생략하지 않고
     * 403(FORBIDDEN)으로 거부해 호출 트랜잭션 전체(거래 해제 포함)를 롤백시킨다.
     *
     * @param mappingId 삭제할 매핑 내부 UUID (null이면 삭제 대상 없음 — 권한 검증 없이 반환)
     * @param actorId   실행자 UUID (null이면 fail-closed 403)
     * @param actorName 실행자 표시명
     * @param reason    감사 사유
     * @throws BusinessException FORBIDDEN — deposit-mapping:DELETE 권한 미보유 시
     */
    public void deleteByIdIfPermitted(UUID mappingId, UUID actorId, String actorName, String reason) {
        if (mappingId == null) {
            return;
        }
        if (actorId == null || !dynamicPermissionClient.check(actorId, PAGE_CODE, PermissionAction.DELETE)) {
            throw new BusinessException(ErrorCode.FORBIDDEN,
                    "입금자명 매핑 삭제 권한(deposit-mapping:DELETE)이 없습니다.");
        }
        deleteById(mappingId, actorId, actorName, reason);
    }

    /**
     * 매핑 변경 이력을 정규화 business key로 조회한다 — #810 적대검증 R1 (L4-H2/L6-H1).
     *
     * <p>key → 매핑 entity(soft-deleted 포함) → entityId → 해당 entityId의 <b>전 필드</b> audit 행으로
     * 조회한다. rename 후에도 entityId가 같아 이전 키 시절 이력이 절단되지 않고,
     * partnerCode/rawName/사유 필드 행도 함께 반환된다. 과거 키로만 남은(rename으로 현재 키가 바뀐)
     * 매핑은 감사행의 normalizedName old/new 등장 여부로 보충 수집한다.
     */
    @Transactional(readOnly = true)
    public List<BankDepositorPartnerMappingHistoryResponse> history(String normalizedName) {
        String key = normalizeRequired(normalizedName);
        java.util.LinkedHashSet<UUID> entityIds = new java.util.LinkedHashSet<>(
                mappingRepository.findIdsByNormalizedNameIncludingDeleted(key));
        entityIds.addAll(auditLogRepository.findMappingEntityIdsByNormalizedName(key));
        if (entityIds.isEmpty()) {
            return List.of();
        }
        return auditLogRepository.findMappingHistoryByEntityIds(entityIds).stream()
                .map(this::toHistory)
                .toList();
    }

    /**
     * 수동 지정 경로에서만 호출하는 학습 upsert.
     *
     * <p>deposit-mapping:UPDATE 계정 권한이 없으면 transaction match만 남기고 조용히 반환한다.
     *
     * <p>#810 적대검증 R1 (L6-M4): 정규화 검증 실패(예: 'ß'→'SS' 팽창으로 120자 초과)는 SQL 실행 전이므로
     * 본 메서드 내부에서 격리해 학습만 생략한다 — 참여 트랜잭션이 rollback-only 로 마킹되지 않아
     * 수동 매칭 커밋이 유지된다(결정 ③). SQL 레벨 오류는 같은 트랜잭션이 이미 오염(aborted)되므로
     * 무마하지 않고 그대로 전파한다(feedback_aborted_tx_after_div_catch).
     */
    public void learnMappingIfPermitted(String rawName, PartnerSummary partner,
                                        UUID actorId, String actorName) {
        if (rawName == null || rawName.isBlank() || partner == null || partner.partnerId() == null
                || actorId == null || !dynamicPermissionClient.check(actorId, PAGE_CODE, PermissionAction.UPDATE)) {
            return;
        }
        String normalized;
        try {
            normalized = normalizeRequired(rawName);
        } catch (BusinessException ex) {
            log.warn("입금자명 매핑 학습 생략(정규화 검증 실패; 수동 매칭은 유지) — msg={}", ex.getMessage());
            return;
        }
        BankDepositorPartnerMapping old = mappingRepository
                .findByNormalizedNameAndIsDeletedFalse(normalized).orElse(null);
        String oldRaw = old == null ? null : old.getRawName();
        String oldKey = old == null ? null : old.getNormalizedName();
        String oldPartnerCode = old == null ? null : partnerLookupClient.findByPartnerId(old.getPartnerId())
                .map(PartnerSummary::partnerCode).orElse(null);
        String storageActor = storageActor(actorId, actorName);
        mappingRepository.upsertActive(rawName.trim(), normalized, partner.partnerId(), storageActor);
        BankDepositorPartnerMapping saved = mappingRepository
                .findByNormalizedNameAndIsDeletedFalse(normalized)
                .orElseThrow(() -> new BusinessException(ErrorCode.CONFLICT, "입금자명 매핑 학습에 실패했습니다."));
        recordMappingAudit(saved, oldRaw, oldKey, oldPartnerCode, saved.getRawName(), saved.getNormalizedName(),
                partner.partnerCode(), actorId, actorName, "MANUAL_MATCH");
    }

    /** 입금 전용 자동 resolver. import/KFTC 경로에서는 이 메서드가 DB를 변경하지 않는다. */
    @Transactional(readOnly = true)
    public MappingResolution resolveDeposit(String rawName, BankTxnType txnType, BankTxnSource source) {
        if (txnType != BankTxnType.DEPOSIT || !isDepositSource(source) || rawName == null || rawName.isBlank()) {
            return MappingResolution.none();
        }
        String normalized = DepositorNameNormalizer.normalize(rawName);
        BankDepositorPartnerMapping mapping = mappingRepository
                .findByNormalizedNameAndIsDeletedFalse(normalized).orElse(null);
        if (mapping == null) {
            return MappingResolution.none();
        }
        PartnerSummary partner = partnerLookupClient.findByPartnerId(mapping.getPartnerId()).orElse(null);
        if (partner == null || partner.partnerId() == null || !mapping.getPartnerId().equals(partner.partnerId())) {
            log.warn("입금자명 매핑 target stale — normalizedName={} partnerId={}",
                    mapping.getNormalizedName(), mapping.getPartnerId());
            return MappingResolution.stale(mapping);
        }
        if (!partner.isActiveStatus()) {
            // #810 적대검증 R1 (L4-H1): SUSPENDED/TERMINATED 거래처는 spec §F대로
            // 코드정확일치 폴백 없이 stale(미매칭+경고)로 취급한다.
            log.warn("입금자명 매핑 거래처 비활성 — normalizedName={} partnerCode={} status={}",
                    mapping.getNormalizedName(), partner.partnerCode(), partner.status());
            return MappingResolution.stale(mapping);
        }
        return MappingResolution.matched(mapping, partner);
    }

    /**
     * 입금자명 매핑 학습/자동 적용이 허용되는 입금성 source 인지 판정한다.
     *
     * <p>{@code CODEF_CARD}/{@code CODEF_LOAN} 등 비입금성 source 는 spec §C에 따라
     * 학습·자동 적용 대상에서 제외한다. 수동 매칭의 학습 게이트가 재사용할 수 있도록 공개한다.
     */
    public boolean isDepositSource(BankTxnSource source) {
        return source == BankTxnSource.CSV_IMPORT
                || source == BankTxnSource.CODEF_BANK
                || source == BankTxnSource.KFTC;
    }

    private BankDepositorPartnerMapping findActive(String normalizedName) {
        String key = normalizeRequired(normalizedName);
        return mappingRepository.findByNormalizedNameAndIsDeletedFalse(key)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "입금자명 매핑을 찾을 수 없습니다: " + key));
    }

    private PartnerSummary resolvePartner(String partnerCode) {
        if (partnerCode == null || partnerCode.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "partnerCode 는 필수입니다.");
        }
        return partnerLookupClient.findByPartnerCode(partnerCode.trim())
                .filter(partner -> partner.partnerId() != null)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "등록된 거래처를 찾을 수 없습니다: " + partnerCode.trim()));
    }

    private void validateRequest(BankDepositorPartnerMappingRequest request) {
        if (request == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "요청 본문은 필수입니다.");
        }
    }

    private String normalizeRequired(String rawName) {
        String normalized = DepositorNameNormalizer.normalize(rawName);
        if (normalized == null || normalized.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "입금자명은 공백만 사용할 수 없습니다.");
        }
        if (normalized.length() > 120) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "정규화된 입금자명은 120자 이하여야 합니다.");
        }
        return normalized;
    }

    private BankDepositorPartnerMappingResponse toResponse(BankDepositorPartnerMapping mapping) {
        PartnerSummary partner = partnerLookupClient.findByPartnerId(mapping.getPartnerId()).orElse(null);
        return toResponse(mapping, partner);
    }

    private BankDepositorPartnerMappingResponse toResponse(BankDepositorPartnerMapping mapping,
                                                            PartnerSummary partner) {
        return BankDepositorPartnerMappingResponse.of(mapping, partner);
    }

    private BankDepositorPartnerMappingHistoryResponse toHistory(AccountingAuditLog log) {
        String actor = log.getActorName() != null && log.getActorName().matches("[0-9a-fA-F-]{36}")
                ? "사용자" : log.getActorName();
        return new BankDepositorPartnerMappingHistoryResponse(
                log.getFieldName(), log.getOldValue(), log.getNewValue(), actor, log.getChangedAt(),
                log.getRevisionNo());
    }

    private void recordMappingAudit(BankDepositorPartnerMapping mapping,
                                    String oldRaw, String oldNormalized, String oldPartnerCode,
                                    String newRaw, String newNormalized, String newPartnerCode,
                                    UUID actorId, String actorName, String reason) {
        UUID safeActor = actorId == null ? SYSTEM_ACTOR : actorId;
        String safeActorName = actorName == null || actorName.isBlank() ? "SYSTEM" : actorName;
        // #810 적대검증 R1: partner lookup 실패(stale 거래처) 시 partnerCode old/new 가 둘 다 null 이 되어
        // audit validator 가 400 으로 거부 → stale 매핑일수록 삭제가 필요한데 삭제가 막히는 결함.
        // 양쪽 null 엔트리는 의미가 없으므로 제외한다(reason 엔트리가 항상 남아 batch 는 비지 않는다).
        List<ChangeEntry> changes = java.util.stream.Stream.of(
                        new ChangeEntry("mapping.rawName", oldRaw, newRaw),
                        new ChangeEntry("mapping.normalizedName", oldNormalized, newNormalized),
                        new ChangeEntry("mapping.partnerCode", oldPartnerCode, newPartnerCode),
                        new ChangeEntry("mapping.reason", null, reason))
                .filter(change -> change.oldValue() != null || change.newValue() != null)
                .toList();
        auditLogService.recordBatch(mapping.getId(), safeActor, safeActorName, null, changes);
    }

    private static String reason(String reason, String defaultReason) {
        return reason == null || reason.isBlank() ? defaultReason : reason.trim();
    }

    private static String storageActor(UUID actorId, String actorName) {
        return actorId == null ? (actorName == null || actorName.isBlank() ? "SYSTEM" : actorName) : actorId.toString();
    }

    /** resolver 결과와 stale 여부를 구분해 partnerCode 폴백 오배정을 막는다. */
    public record MappingResolution(ResolutionKind kind,
                                    BankDepositorPartnerMapping mapping,
                                    PartnerSummary partner) {
        public static MappingResolution none() {
            return new MappingResolution(ResolutionKind.NONE, null, null);
        }

        public static MappingResolution stale(BankDepositorPartnerMapping mapping) {
            return new MappingResolution(ResolutionKind.STALE, mapping, null);
        }

        public static MappingResolution matched(BankDepositorPartnerMapping mapping, PartnerSummary partner) {
            return new MappingResolution(ResolutionKind.MATCHED, mapping, partner);
        }

        public boolean isMatched() {
            return kind == ResolutionKind.MATCHED;
        }

        public boolean isStale() {
            return kind == ResolutionKind.STALE;
        }
    }

    /** 입금 매핑 resolver 결과 종류. */
    public enum ResolutionKind {
        /** 매핑이 없다. */
        NONE,
        /** 매핑은 있으나 거래처 master가 stale이다. */
        STALE,
        /** 활성 거래처까지 hydration된 매칭이다. */
        MATCHED
    }
}

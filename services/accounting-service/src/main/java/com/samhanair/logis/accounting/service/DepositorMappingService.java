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
        BankDepositorPartnerMapping saved = mappingRepository.saveAndFlush(mapping);
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

    /** 매핑 변경 이력을 정규화 business key로 조회한다. */
    @Transactional(readOnly = true)
    public List<BankDepositorPartnerMappingHistoryResponse> history(String normalizedName) {
        String key = normalizeRequired(normalizedName);
        return auditLogRepository.findMappingHistoryByNormalizedName(key).stream()
                .map(this::toHistory)
                .toList();
    }

    /**
     * 수동 지정 경로에서만 호출하는 학습 upsert.
     *
     * <p>deposit-mapping:UPDATE 계정 권한이 없으면 transaction match만 남기고 조용히 반환한다.
     */
    public void learnMappingIfPermitted(String rawName, PartnerSummary partner,
                                        UUID actorId, String actorName) {
        if (rawName == null || rawName.isBlank() || partner == null || partner.partnerId() == null
                || actorId == null || !dynamicPermissionClient.check(actorId, PAGE_CODE, PermissionAction.UPDATE)) {
            return;
        }
        String normalized = normalizeRequired(rawName);
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
        return MappingResolution.matched(mapping, partner);
    }

    private boolean isDepositSource(BankTxnSource source) {
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
                log.getFieldName(), log.getOldValue(), log.getNewValue(), actor, log.getChangedAt());
    }

    private void recordMappingAudit(BankDepositorPartnerMapping mapping,
                                    String oldRaw, String oldNormalized, String oldPartnerCode,
                                    String newRaw, String newNormalized, String newPartnerCode,
                                    UUID actorId, String actorName, String reason) {
        UUID safeActor = actorId == null ? SYSTEM_ACTOR : actorId;
        String safeActorName = actorName == null || actorName.isBlank() ? "SYSTEM" : actorName;
        auditLogService.recordBatch(mapping.getId(), safeActor, safeActorName, null,
                List.of(
                        new ChangeEntry("mapping.rawName", oldRaw, newRaw),
                        new ChangeEntry("mapping.normalizedName", oldNormalized, newNormalized),
                        new ChangeEntry("mapping.partnerCode", oldPartnerCode, newPartnerCode),
                        new ChangeEntry("mapping.reason", null, reason)
                ));
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

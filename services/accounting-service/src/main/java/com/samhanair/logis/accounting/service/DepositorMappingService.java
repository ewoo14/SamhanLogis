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
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
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
        return create(request, actorId, actorName, false);
    }

    /** 관리 endpoint에서도 MASTER 헤더의 호출 주체를 감사 경계까지 전달한다. */
    public BankDepositorPartnerMappingResponse create(BankDepositorPartnerMappingRequest request,
                                                      UUID actorId, String actorName, boolean isSystemMaster) {
        actorName = effectiveActorName(actorName, isSystemMaster);
        validateRequest(request);
        String normalized = normalizeRequired(request.rawName());
        // #810 적대검증 R3 (L3-L1): learn/update 와 동일한 normalized key advisory lock 으로
        // create/update/delete 간 동시 변경(lost-update)을 직렬화한다. 존재 검사도 lock 이후 수행.
        mappingRepository.acquireNormalizedNameAdvisoryLock(normalized);
        if (mappingRepository.findByNormalizedNameAndIsDeletedFalse(normalized).isPresent()) {
            throw new BusinessException(ErrorCode.CONFLICT, "이미 등록된 입금자명 매핑입니다: " + normalized);
        }
        PartnerSummary partner = resolvePartner(request.partnerCode());
        BankDepositorPartnerMapping mapping = BankDepositorPartnerMapping.create(
                request.rawName(), partner.partnerId(), partner.partnerCode());
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
        return update(oldNormalizedName, request, actorId, actorName, false);
    }

    /** 관리 endpoint에서도 MASTER 헤더의 호출 주체를 감사 경계까지 전달한다. */
    public BankDepositorPartnerMappingResponse update(String oldNormalizedName,
                                                      BankDepositorPartnerMappingRequest request,
                                                      UUID actorId, String actorName, boolean isSystemMaster) {
        actorName = effectiveActorName(actorName, isSystemMaster);
        validateRequest(request);
        String oldKey = normalizeRequired(oldNormalizedName);
        String newNormalized = normalizeRequired(request.rawName());
        // rename은 양쪽 business key를 잠가 P1→P2/P3 감사 누락과 deadlock을 함께 막는다.
        // #810 R3-CODEX (S3-L1): Java 문자열 정렬은 해시 충돌 시 실제 lock 자원 순서와 어긋나
        // 데드락을 유발했다 — 공용 SQL 이 lock_id(64bit hashtextextended) 오름차순으로 획득한다.
        mappingRepository.acquireNormalizedNameAdvisoryLocks(oldKey, newNormalized);
        // lock 획득 뒤 현재 상태를 다시 읽어 TOCTOU와 감사 누락을 막는다.
        BankDepositorPartnerMapping mapping = findActive(oldKey);
        if (!newNormalized.equals(mapping.getNormalizedName())
                && mappingRepository.findByNormalizedNameAndIsDeletedFalse(newNormalized).isPresent()) {
            throw new BusinessException(ErrorCode.CONFLICT, "변경할 입금자명 매핑 키가 이미 존재합니다: " + newNormalized);
        }
        PartnerSummary partner = resolvePartner(request.partnerCode());
        String oldRaw = mapping.getRawName();
        oldKey = mapping.getNormalizedName();
        String oldPartnerCode = mapping.getPartnerCodeSnapshot();
        mapping.updateMapping(request.rawName(), partner.partnerId(), partner.partnerCode());
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
        delete(normalizedName, actorId, actorName, reason, false);
    }

    /** 관리 endpoint에서도 MASTER 헤더의 호출 주체를 감사 경계까지 전달한다. */
    public void delete(String normalizedName, UUID actorId, String actorName, String reason,
                       boolean isSystemMaster) {
        actorName = effectiveActorName(actorName, isSystemMaster);
        // #810 적대검증 R3 (L3-L1): update/learn 과 동일 key lock — 동시 update+delete lost-update 방지.
        // lock 획득 이후 현재 상태를 읽는다(TOCTOU 방지).
        String key = normalizeRequired(normalizedName);
        mappingRepository.acquireNormalizedNameAdvisoryLock(key);
        BankDepositorPartnerMapping mapping = findActive(key);
        String oldPartnerCode = mapping.getPartnerCodeSnapshot();
        mapping.delete(storageActor(actorId, actorName));
        mappingRepository.saveAndFlush(mapping);
        recordMappingAudit(mapping, mapping.getRawName(), mapping.getNormalizedName(), oldPartnerCode,
                null, mapping.getNormalizedName(), null, actorId, actorName, reason(reason, "ADMIN_DELETE"));
    }

    /**
     * 거래의 matchedMappingId로 매핑을 soft delete한다. UUID는 endpoint에 노출하지 않는다.
     *
     * <p>#810 적대검증 R3 (L3-L1): update/learn 과 동일한 normalized key advisory lock 으로
     * 직렬화한다. 엔티티 로드 <b>이전에</b> 현재 키를 native scalar 로 읽어 잠근 뒤 로드한다.
     *
     * <p>#810 R3-CODEX (S3-M1): 첫 scalar 읽기와 lock 획득 사이에 동시 rename 이 커밋되면
     * "옛 키"를 잠근 채 새 키의 entity 를 덮어쓸 수 있다 — lock 직후 scalar 를 <b>재조회</b>해
     * 키가 달라졌으면 409(CONFLICT)로 전체 트랜잭션을 rollback 시킨다(호출자 재시도).
     * 옛 키 lock 을 보유한 채 새 키 lock 을 추가 획득하면 rename(정렬 획득) 경로와
     * lock 순서가 역전되어 데드락이 되므로 재획득은 하지 않는다.
     */
    public void deleteById(UUID mappingId, UUID actorId, String actorName, String reason) {
        if (mappingId == null) {
            return;
        }
        String currentKey = mappingRepository.findNormalizedNameById(mappingId);
        if (currentKey != null) {
            mappingRepository.acquireNormalizedNameAdvisoryLock(currentKey);
            String recheckKey = mappingRepository.findNormalizedNameById(mappingId);
            if (!currentKey.equals(recheckKey)) {
                throw new BusinessException(ErrorCode.CONFLICT,
                        "입금자명 매핑 키가 동시에 변경되었습니다. 다시 시도해 주세요.");
            }
        }
        mappingRepository.findById(mappingId).ifPresent(mapping -> {
            String oldPartnerCode = mapping.getPartnerCodeSnapshot();
            mapping.delete(storageActor(actorId, actorName));
            mappingRepository.saveAndFlush(mapping);
            recordMappingAudit(mapping, mapping.getRawName(), mapping.getNormalizedName(), oldPartnerCode,
                    null, mapping.getNormalizedName(), null, actorId, actorName, reason(reason, "ADMIN_DELETE"));
        });
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
        deleteByIdIfPermitted(mappingId, actorId, actorName, reason, false);
    }

    /** MASTER 헤더가 검증된 내부 호출은 동적 permission 행 없이도 허용한다. */
    public void deleteByIdIfPermitted(UUID mappingId, UUID actorId, String actorName, String reason,
                                      boolean isSystemMaster) {
        if (mappingId == null) {
            return;
        }
        if (!isSystemMaster && (actorId == null
                || !dynamicPermissionClient.check(actorId, PAGE_CODE, PermissionAction.DELETE))) {
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
        List<AccountingAuditLog> logs = auditLogRepository.findMappingHistoryByEntityIds(entityIds);
        HistoryDerivation derivation = deriveHistoryMetadata(logs);
        return logs.stream()
                .map(log -> toHistory(log,
                        derivation.operationOrdinalByKey().get(new HistoryOperationKey(log.getEntityId(), log.getRevisionNo())),
                        derivation.generationByEntity().get(log.getEntityId())))
                // #832 R2: 작업 단위가 항상 연속되도록 ordinal DESC 정렬. Stream sorted는 ordered
                // source에서 stable하므로 같은 작업 내부의 repository total-order는 보존된다.
                .sorted(Comparator.comparingInt(BankDepositorPartnerMappingHistoryResponse::operationOrdinal)
                        .reversed())
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
        learnMappingIfPermitted(rawName, partner, actorId, actorName, false);
    }

    /** 수동 매칭 학습의 내부 게이트. SYSTEM MASTER는 전역 권한으로 우회한다. */
    public void learnMappingIfPermitted(String rawName, PartnerSummary partner,
                                        UUID actorId, String actorName, boolean isSystemMaster) {
        if (rawName == null || rawName.isBlank() || partner == null || partner.partnerId() == null
                || (!isSystemMaster && (actorId == null
                || !dynamicPermissionClient.check(actorId, PAGE_CODE, PermissionAction.UPDATE)))) {
            return;
        }
        String normalized;
        try {
            normalized = normalizeRequired(rawName);
        } catch (BusinessException ex) {
            log.warn("입금자명 매핑 학습 생략(정규화 검증 실패; 수동 매칭은 유지) — msg={}", ex.getMessage());
            return;
        }
        mappingRepository.acquireNormalizedNameAdvisoryLock(normalized);
        BankDepositorPartnerMapping old = mappingRepository
                .findByNormalizedNameAndIsDeletedFalse(normalized).orElse(null);
        String oldRaw = old == null ? null : old.getRawName();
        String oldKey = old == null ? null : old.getNormalizedName();
        String oldPartnerCode = old == null ? null : old.getPartnerCodeSnapshot();
        String storageActor = storageActor(actorId, actorName);
        mappingRepository.upsertActive(rawName.trim(), normalized, partner.partnerId(), partner.partnerCode(), storageActor);
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
        PartnerLookupClient.LookupResult lookup = lookupByPartnerId(mapping.getPartnerId());
        if (lookup.isUnavailable()) {
            return MappingResolution.unavailable(mapping);
        }
        PartnerSummary partner = lookup.isFound() ? lookup.partner() : null;
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
        PartnerLookupClient.LookupResult lookup = lookupByPartnerCode(partnerCode.trim());
        if (lookup.isUnavailable()) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "거래처 조회가 일시적으로 unavailable 상태입니다. 재시도해 주세요.");
        }
        return lookup.isFound() && lookup.partner().partnerId() != null ? lookup.partner()
                : throwNotFound(partnerCode);
    }

    private PartnerSummary throwNotFound(String partnerCode) {
        throw new BusinessException(ErrorCode.NOT_FOUND, "등록된 거래처를 찾을 수 없습니다: " + partnerCode.trim());
    }

    private PartnerLookupClient.LookupResult lookupByPartnerId(UUID partnerId) {
        PartnerLookupClient.LookupResult result = partnerLookupClient.findByPartnerIdResult(partnerId);
        if (result != null) return result;
        return partnerLookupClient.findByPartnerId(partnerId)
                .map(PartnerLookupClient.LookupResult::found)
                .orElseGet(PartnerLookupClient.LookupResult::notFound);
    }

    private PartnerLookupClient.LookupResult lookupByPartnerCode(String partnerCode) {
        PartnerLookupClient.LookupResult result = partnerLookupClient.findByPartnerCodeResult(partnerCode);
        if (result != null) return result;
        return partnerLookupClient.findByPartnerCode(partnerCode)
                .map(PartnerLookupClient.LookupResult::found)
                .orElseGet(PartnerLookupClient.LookupResult::notFound);
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

    /**
     * 관리 목록/단건 응답 변환 — #810 적대검증 R3 (L5-L1).
     *
     * <p>거래처 조회가 일시 장애(UNAVAILABLE)면 stale(삭제/비활성)로 붕괴시키지 않고
     * {@code targetStatus="UNAVAILABLE"}·{@code staleTarget=false} 로 구분 표기한다(계약 pin).
     * NOT_FOUND/비활성은 기존대로 {@code staleTarget=true} 를 유지한다.
     */
    private BankDepositorPartnerMappingResponse toResponse(BankDepositorPartnerMapping mapping) {
        PartnerLookupClient.LookupResult lookup = lookupByPartnerId(mapping.getPartnerId());
        if (lookup.isUnavailable()) {
            return BankDepositorPartnerMappingResponse.unavailable(mapping);
        }
        return toResponse(mapping, lookup.isFound() ? lookup.partner() : null);
    }

    private BankDepositorPartnerMappingResponse toResponse(BankDepositorPartnerMapping mapping,
                                                            PartnerSummary partner) {
        return BankDepositorPartnerMappingResponse.of(mapping, partner);
    }

    private BankDepositorPartnerMappingHistoryResponse toHistory(AccountingAuditLog log,
                                                                 int operationOrdinal,
                                                                 int generation) {
        String actor = log.getActorName() != null && log.getActorName().matches("[0-9a-fA-F-]{36}")
                ? "사용자" : log.getActorName();
        return new BankDepositorPartnerMappingHistoryResponse(
                historyEntryKey(log), log.getFieldName(), log.getOldValue(), log.getNewValue(),
                actor, log.getChangedAt(), log.getRevisionNo(), operationOrdinal, generation);
    }

    /**
     * 이력 조회 범위의 표시용 작업 순번과 세대를 파생한다.
     *
     * <p>작업 식별자는 entityId·revisionNo 이며, 레거시 데이터에서 같은 revision의 필드별
     * changedAt 이 분산되어도 그룹의 최소 시각 하나로 처리한다. ordinal은 oldest-first로
     * 채번하고, #832 R2 에서는 FE 작업 그룹이 시간 교차로 분리되지 않도록 응답을
     * operationOrdinal DESC 로 stable 정렬한다. 같은 작업 내부는 repository total-order를 유지한다.
     */
    private static HistoryDerivation deriveHistoryMetadata(List<AccountingAuditLog> logs) {
        Map<UUID, java.time.LocalDateTime> firstSeenByEntity = new LinkedHashMap<>();
        Map<HistoryOperationKey, java.time.LocalDateTime> operationTimeByKey = new LinkedHashMap<>();
        for (AccountingAuditLog log : logs) {
            firstSeenByEntity.merge(log.getEntityId(), log.getChangedAt(),
                    (left, right) -> left.compareTo(right) <= 0 ? left : right);
            HistoryOperationKey key = new HistoryOperationKey(log.getEntityId(), log.getRevisionNo());
            operationTimeByKey.merge(key, log.getChangedAt(),
                    (left, right) -> left.compareTo(right) <= 0 ? left : right);
        }

        List<UUID> generationOrder = firstSeenByEntity.entrySet().stream()
                .sorted(Map.Entry.<UUID, java.time.LocalDateTime>comparingByValue()
                        .thenComparing(Map.Entry::getKey, Comparator.comparing(UUID::toString)))
                .map(Map.Entry::getKey)
                .toList();
        Map<UUID, Integer> generationByEntity = new LinkedHashMap<>();
        for (int index = 0; index < generationOrder.size(); index++) {
            generationByEntity.put(generationOrder.get(index), index + 1);
        }

        List<HistoryOperationKey> operationOrder = operationTimeByKey.keySet().stream()
                .sorted(Comparator
                        .comparing((HistoryOperationKey key) -> operationTimeByKey.get(key))
                        .thenComparing(key -> generationByEntity.get(key.entityId()))
                        .thenComparingInt(HistoryOperationKey::revisionNo)
                        .thenComparing(key -> key.entityId().toString()))
                .toList();
        Map<HistoryOperationKey, Integer> operationOrdinalByKey = new LinkedHashMap<>();
        for (int index = 0; index < operationOrder.size(); index++) {
            operationOrdinalByKey.put(operationOrder.get(index), index + 1);
        }
        return new HistoryDerivation(operationOrdinalByKey, generationByEntity);
    }

    private record HistoryOperationKey(UUID entityId, int revisionNo) {
    }

    private record HistoryDerivation(Map<HistoryOperationKey, Integer> operationOrdinalByKey,
                                     Map<UUID, Integer> generationByEntity) {
    }

    /**
     * 이력 행의 opaque entryKey 생성 — #810 R3-CODEX (S4-M3, 계약 pin).
     *
     * <p>entityId·revisionNo·fieldName 에 audit 행 id 를 더한 조합의 SHA-256 hex 32자 절단.
     * 행 id 가 유일성을(같은 revision·field 동률에도 충돌 없음), 해시가 opaque 성을 보장한다
     * — UUID 원문은 노출되지 않고 역산도 불가(feedback_uuid_no_user_visibility 준수).
     * 입력이 모두 불변(영속 후 변경 없음)이라 같은 행은 재조회에도 항상 같은 key 를 갖는다
     * (FE React key 안정성).
     */
    private static String historyEntryKey(AccountingAuditLog log) {
        String material = String.join("|",
                String.valueOf(log.getEntityId()),
                String.valueOf(log.getRevisionNo()),
                String.valueOf(log.getFieldName()),
                String.valueOf(log.getId()));
        try {
            java.security.MessageDigest digest = java.security.MessageDigest.getInstance("SHA-256");
            byte[] bytes = digest.digest(material.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(32);
            for (int i = 0; i < 16; i++) {
                sb.append(String.format(java.util.Locale.ROOT, "%02x", bytes[i]));
            }
            return sb.toString();
        } catch (java.security.NoSuchAlgorithmException ex) {
            // JDK 필수 알고리즘 — 발생 불가 경로.
            throw new IllegalStateException("SHA-256 misconfigured", ex);
        }
    }

    private void recordMappingAudit(BankDepositorPartnerMapping mapping,
                                    String oldRaw, String oldNormalized, String oldPartnerCode,
                                    String newRaw, String newNormalized, String newPartnerCode,
                                    UUID actorId, String actorName, String reason) {
        UUID safeActor = actorId == null ? SYSTEM_ACTOR : actorId;
        String safeActorName = safeActor.equals(SYSTEM_ACTOR)
                ? "SYSTEM"
                : com.samhanair.logis.common.security.ActorDisplayName.resolve(safeActor.toString(), actorName);
        // #810 적대검증 R1: partner lookup 실패(stale 거래처) 시 partnerCode old/new 가 둘 다 null 이 되어
        // audit validator 가 400 으로 거부 → stale 매핑일수록 삭제가 필요한데 삭제가 막히는 결함.
        // 양쪽 null 엔트리는 의미가 없으므로 제외한다(reason 엔트리가 항상 남아 batch 는 비지 않는다).
        List<ChangeEntry> changes = java.util.stream.Stream.of(
                        new ChangeEntry("mapping.rawName", oldRaw, newRaw),
                        new ChangeEntry("mapping.normalizedName", oldNormalized, newNormalized),
                        new ChangeEntry("mapping.partnerCode", oldPartnerCode, newPartnerCode),
                        new ChangeEntry("mapping.reason", null, reason))
                .filter(change -> "mapping.reason".equals(change.fieldName())
                        || !java.util.Objects.equals(change.oldValue(), change.newValue()))
                .toList();
        auditLogService.recordBatch(mapping.getId(), safeActor, safeActorName, null, changes);
    }

    private static String reason(String reason, String defaultReason) {
        return reason == null || reason.isBlank() ? defaultReason : reason.trim();
    }

    private static String storageActor(UUID actorId, String actorName) {
        return actorId == null ? (actorName == null || actorName.isBlank() ? "SYSTEM" : actorName) : actorId.toString();
    }

    private static String effectiveActorName(String actorName, boolean isSystemMaster) {
        return isSystemMaster ? "SYSTEM MASTER" : actorName;
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

        public static MappingResolution unavailable(BankDepositorPartnerMapping mapping) {
            return new MappingResolution(ResolutionKind.UNAVAILABLE, mapping, null);
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

        public boolean isUnavailable() {
            return kind == ResolutionKind.UNAVAILABLE;
        }
    }

    /** 입금 매핑 resolver 결과 종류. */
    public enum ResolutionKind {
        /** 매핑이 없다. */
        NONE,
        /** 매핑은 있으나 거래처 master가 stale이다. */
        STALE,
        /** 외부 master를 조회할 수 없어 재시도가 필요한 상태. */
        UNAVAILABLE,
        /** 활성 거래처까지 hydration된 매칭이다. */
        MATCHED
    }
}

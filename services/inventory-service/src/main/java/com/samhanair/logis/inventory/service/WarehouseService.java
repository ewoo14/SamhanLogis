package com.samhanair.logis.inventory.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.common.security.ActorDisplayName;
import com.samhanair.logis.inventory.domain.Warehouse;
import com.samhanair.logis.inventory.domain.WarehouseType;
import com.samhanair.logis.inventory.realtime.domain.InventoryAuditLog;
import com.samhanair.logis.inventory.realtime.service.InventoryAuditLogRecorder;
import com.samhanair.logis.inventory.repository.WarehouseRepository;
import com.samhanair.logis.inventory.web.dto.AdminWarehouseListResponse;
import com.samhanair.logis.inventory.web.dto.CreateWarehouseRequest;
import com.samhanair.logis.inventory.web.dto.UpdateWarehouseRequest;
import com.samhanair.logis.inventory.web.dto.WarehouseResponse;
import com.samhanair.logis.shared.realtime.audit.ChangeEntry;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 창고 마스터 CRUD + soft-delete + audit overlay 기록 (PR-H4b 인프라 활용).
 *
 * <p>update / delete 시점에 {@link InventoryAuditLogRecorder} 호출 → 필드별 변경 1행 INSERT
 * + SSE broadcast. 감사 실패는 graceful fallback (도메인 로직 진행 우선).
 */
@Slf4j
@Service
@Transactional
@RequiredArgsConstructor
public class WarehouseService {

    private final WarehouseRepository warehouseRepository;
    /** 4b 후속 — 창고 변경 이력 audit overlay 기록 / 조회. */
    private final InventoryAuditLogRecorder auditLogRecorder;

    /**
     * 활성 창고 전체를 displayOrder ASC 로 반환한다 (soft-deleted 제외).
     *
     * @return 응답 DTO 리스트 (없으면 빈 리스트)
     */
    @Transactional(readOnly = true)
    public List<WarehouseResponse> listAll() {
        return warehouseRepository.findAllByIsDeletedFalseOrderByDisplayOrderAsc().stream()
                .map(WarehouseResponse::from)
                .toList();
    }

    /**
     * 창고 admin 검색 — Phase 10 P0-5.
     *
     * <p>q (code / name / address LIKE) + 페이지네이션. q 가 null/blank 시 미적용.
     * 활성 창고만 ({@code @SQLRestriction("is_deleted = false")}) 자동 필터.
     *
     * @param q 검색어 (옵션)
     * @param pageable 페이지 / 정렬
     * @return AdminWarehouseListResponse — items / total / page / size
     */
    @Transactional(readOnly = true)
    public AdminWarehouseListResponse searchAdmin(String q, Pageable pageable) {
        String normalized = (q == null || q.isBlank()) ? null : escapeLikeLiteral(q.trim());
        return AdminWarehouseListResponse.from(
                warehouseRepository.searchAdmin(normalized, pageable));
    }

    private static String escapeLikeLiteral(String value) {
        return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }


    /**
     * 단건 조회.
     *
     * @param id 창고 UUID
     * @return 응답 DTO
     * @throws BusinessException(NOT_FOUND) 창고 미발견
     */
    @Transactional(readOnly = true)
    public WarehouseResponse getOne(UUID id) {
        return WarehouseResponse.from(loadOrThrow(id));
    }

    /** 자동 생성 code 의 charset — 헷갈리는 글자 0/1/O/I/L 제외. */
    private static final String CODE_CHARSET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

    /** 자동 생성 code 의 random 부분 길이 (총 길이 = "WH-" prefix + 6자 = 9자). */
    private static final int CODE_RANDOM_LEN = 6;

    /** 충돌 시 재시도 한도. CHARSET^6 = 30^6 ≈ 7.3억 — 5회 안에서 거의 확정. */
    private static final int CODE_RETRY_LIMIT = 5;

    private static final SecureRandom CODE_RANDOM = new SecureRandom();

    /**
     * 새 창고를 생성한다. code 중복 검증 → 영속화. displayOrder 가 null 이면 0 으로 기본화.
     *
     * <p>1a — {@code req.code()} 가 null/빈 문자열이면 시스템이 자동 생성 ({@code WH-XXXXXX} 패턴).
     * 명시적으로 채워서 들어오면 그 값 사용 + 충돌 시 CONFLICT 에러. 자동 생성 시에는 충돌 발견 시
     * 최대 {@link #CODE_RETRY_LIMIT}회 재시도 후 INTERNAL_ERROR.
     *
     * @param req CreateWarehouseRequest (code optional / name/type/address/displayOrder/description)
     * @return 생성된 창고 응답
     * @throws BusinessException(CONFLICT) 사용자가 명시한 code 가 이미 존재할 때
     * @throws BusinessException(INTERNAL_ERROR) 자동 생성 재시도 한도 초과 (사실상 발생 X)
     */
    public WarehouseResponse create(CreateWarehouseRequest req) {
        String code = (req.code() == null || req.code().isBlank())
                ? generateUniqueCode()
                : req.code().trim();
        if (req.code() != null && !req.code().isBlank()
                && warehouseRepository.existsByCodeAndIsDeletedFalse(code)) {
            throw new BusinessException(ErrorCode.CONFLICT, "이미 사용 중인 창고 코드입니다: " + code);
        }
        int order = req.displayOrder() == null ? 0 : req.displayOrder();
        Warehouse saved = warehouseRepository.save(Warehouse.create(
                code, req.name(), req.type(), req.address(), order, req.description()));
        return WarehouseResponse.from(saved);
    }

    /** {@code WH-XXXXXX} 패턴의 무중복 code 자동 생성. 재시도 한도 초과 시 INTERNAL_ERROR. */
    private String generateUniqueCode() {
        for (int attempt = 0; attempt < CODE_RETRY_LIMIT; attempt++) {
            StringBuilder sb = new StringBuilder("WH-");
            for (int i = 0; i < CODE_RANDOM_LEN; i++) {
                sb.append(CODE_CHARSET.charAt(CODE_RANDOM.nextInt(CODE_CHARSET.length())));
            }
            String candidate = sb.toString();
            if (!warehouseRepository.existsByCodeAndIsDeletedFalse(candidate)) {
                return candidate;
            }
        }
        throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                "창고 코드 자동 생성 재시도 한도 (" + CODE_RETRY_LIMIT + "회) 초과");
    }

    /**
     * 부분 수정 — null 이 아닌 필드만 적용 (PATCH 시맨틱). code 변경은 미지원.
     *
     * <p>변경 필드별로 ChangeEntry 를 모아 단일 audit revision 으로 기록 (Slip/DcConfig
     * audit 패턴과 동일). audit 실패는 도메인 로직 진행을 막지 않는다 (graceful fallback).
     *
     * @param id 창고 UUID
     * @param req UpdateWarehouseRequest (name/type/address/displayOrder/description, 모두 null 가능)
     * @param callerId 수정자 user-id ('X-User-Id' 헤더 — null/blank 시 system sentinel)
     * @param callerName 수정자 표시명 ('X-User-Name' 헤더 — URL decode 후 전달)
     * @return 갱신된 창고 응답
     * @throws BusinessException(NOT_FOUND) 창고 미발견
     */
    public WarehouseResponse update(UUID id, UpdateWarehouseRequest req,
                                    String callerId, String callerName) {
        Warehouse w = loadOrThrow(id);
        List<ChangeEntry> changes = new ArrayList<>();
        if (req.name() != null && !Objects.equals(req.name(), w.getName())) {
            changes.add(new ChangeEntry("name", w.getName(), req.name()));
            w.rename(req.name());
        }
        if (req.type() != null) {
            WarehouseType prev = w.getType();
            if (!Objects.equals(prev, req.type())) {
                changes.add(new ChangeEntry("type", prev == null ? null : prev.name(), req.type().name()));
                w.changeType(req.type());
            }
        }
        if (req.address() != null && !Objects.equals(req.address(), w.getAddress())) {
            changes.add(new ChangeEntry("address", w.getAddress(), req.address()));
            w.changeAddress(req.address());
        }
        if (req.displayOrder() != null && !Objects.equals(req.displayOrder(), w.getDisplayOrder())) {
            changes.add(new ChangeEntry("displayOrder",
                    String.valueOf(w.getDisplayOrder()), String.valueOf(req.displayOrder())));
            w.changeDisplayOrder(req.displayOrder());
        }
        if (req.description() != null && !Objects.equals(req.description(), w.getDescription())) {
            changes.add(new ChangeEntry("description", w.getDescription(), req.description()));
            w.editDescription(req.description());
        }
        recordAuditSafe(id, callerId, callerName, changes);
        return WarehouseResponse.from(w);
    }

    /** 기존 호출 호환 — 표시명 미공급 시 UUID를 actorName으로 복사하지 않는다. */
    public WarehouseResponse update(UUID id, UpdateWarehouseRequest req, String callerId) {
        return update(id, req, callerId, null);
    }

    /**
     * 후방 호환 — callerId 미공급 시 system sentinel 사용. 신규 호출자는
     * {@link #update(UUID, UpdateWarehouseRequest, String)} 사용.
     */
    public WarehouseResponse update(UUID id, UpdateWarehouseRequest req) {
        return update(id, req, null);
    }

    /**
     * Soft delete — 실제 row 는 보존하고 is_deleted=true 로 마킹 (BaseEntity.markDeleted 위임).
     * 삭제 자체도 audit overlay 1행 기록 (fieldName="isDeleted", "false" → "true").
     *
     * @param id 창고 UUID
     * @param callerId 삭제자 user-id (null 이면 "system")
     * @param callerName 삭제자 표시명 ('X-User-Name' 헤더 — URL decode 후 전달)
     * @throws BusinessException(NOT_FOUND) 창고 미발견
     */
    public void delete(UUID id, String callerId, String callerName) {
        Warehouse w = loadOrThrow(id);
        w.markDeleted(callerId == null ? "system" : callerId);
        recordAuditSafe(id, callerId, callerName,
                List.of(new ChangeEntry("isDeleted", "false", "true")));
    }

    /** 기존 호출 호환 — 표시명 미공급 시 UUID를 actorName으로 복사하지 않는다. */
    public void delete(UUID id, String callerId) {
        delete(id, callerId, null);
    }

    /**
     * 비활성화된 창고를 복구한다 — is_deleted=true → false. native query 로 deleted row 를
     * 직접 로드한 뒤 {@link com.samhanair.logis.common.entity.BaseEntity#markRestored} 호출.
     *
     * <p>code 충돌 검증: 동일 code 의 다른 활성 창고가 있으면 CONFLICT (1a 자동 생성 코드의
     * 재사용/충돌 가드와 정합).
     *
     * <p>복구 자체는 audit overlay 1행 기록 (fieldName="isDeleted", "true" → "false").
     *
     * @param id 창고 UUID
     * @param callerId 복구자 user-id ('X-User-Id' 헤더 — null/blank 시 system sentinel)
     * @param callerName 복구자 표시명 ('X-User-Name' 헤더 — URL decode 후 전달)
     * @return 복구된 창고 응답
     * @throws BusinessException(NOT_FOUND) 비활성화된 창고 미발견
     * @throws BusinessException(CONFLICT) 동일 code 의 활성 창고가 이미 존재
     */
    public WarehouseResponse restore(UUID id, String callerId, String callerName) {
        Warehouse w = warehouseRepository.findDeletedById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "비활성화된 창고를 찾을 수 없습니다"));
        if (warehouseRepository.existsByCodeAndIsDeletedFalse(w.getCode())) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "동일 코드의 활성 창고가 이미 존재합니다: " + w.getCode());
        }
        w.markRestored();
        recordAuditSafe(id, callerId, callerName,
                List.of(new ChangeEntry("isDeleted", "true", "false")));
        return WarehouseResponse.from(w);
    }

    /** 기존 호출 호환 — 표시명 미공급 시 UUID를 actorName으로 복사하지 않는다. */
    public WarehouseResponse restore(UUID id, String callerId) {
        return restore(id, callerId, null);
    }

    /**
     * 비활성화된 창고 목록 — 복구 admin 화면용. modified_at desc 정렬.
     *
     * <p>native query 로 {@code @SQLRestriction} 우회. 일반 list/검색과는 별개 채널.
     */
    @Transactional(readOnly = true)
    public List<WarehouseResponse> listDeleted() {
        return warehouseRepository.findAllDeleted().stream()
                .map(WarehouseResponse::from)
                .toList();
    }

    /**
     * 4b 후속 — 창고 변경 이력 timeline 조회. 최신 revision 우선.
     */
    @Transactional(readOnly = true)
    public List<InventoryAuditLog> listAuditLogs(UUID id) {
        loadOrThrow(id); // 404 검증 — 미존재 창고의 audit 조회 차단
        return auditLogRecorder.listByEntity(id);
    }

    /**
     * 특정 revision 의 audit log 를 되돌린다 (undo). targetRevisionNo 의 각 ChangeEntry 에서
     * {@code oldValue} 값을 entity 에 다시 적용 + revert 자체를 신규 revision 으로 audit 기록.
     *
     * <p>지원 필드: {@code name / type / address / displayOrder / description}.
     * {@code isDeleted} 필드의 revert 는 미지원 — 활성/비활성화 토글은 별도 endpoint 사용
     * (POST {@code /restore} / DELETE).
     *
     * @throws BusinessException(NOT_FOUND) 창고 또는 해당 revision 미존재
     * @throws BusinessException(INVALID_INPUT) targetRevisionNo &lt; 1 또는 isDeleted revert 시도
     */
    public WarehouseResponse revertToRevision(UUID id, int targetRevisionNo,
                                              String callerId, String callerName) {
        if (targetRevisionNo < 1) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "targetRevisionNo 는 1 이상이어야 합니다: " + targetRevisionNo);
        }
        Warehouse w = loadOrThrow(id);
        List<InventoryAuditLog> targetRows = auditLogRecorder.listByEntity(id).stream()
                .filter(row -> row.getRevisionNo() == targetRevisionNo)
                .toList();
        if (targetRows.isEmpty()) {
            throw new BusinessException(ErrorCode.NOT_FOUND,
                    "해당 revision 의 audit log 가 없습니다: revisionNo=" + targetRevisionNo);
        }

        List<ChangeEntry> revertedChanges = new ArrayList<>(targetRows.size());
        for (InventoryAuditLog row : targetRows) {
            String fieldName = row.getFieldName();
            String restoreTo = row.getOldValue();
            String currentValue = readWarehouseField(w, fieldName);
            applyWarehouseField(w, fieldName, restoreTo);
            revertedChanges.add(new ChangeEntry(fieldName, currentValue, restoreTo));
        }
        recordAuditSafe(id, callerId, callerName, revertedChanges);
        return WarehouseResponse.from(w);
    }

    /** 기존 호출 호환 — 표시명 미공급 시 UUID를 actorName으로 복사하지 않는다. */
    public WarehouseResponse revertToRevision(UUID id, int targetRevisionNo, String callerId) {
        return revertToRevision(id, targetRevisionNo, callerId, null);
    }

    private static String readWarehouseField(Warehouse w, String fieldName) {
        return switch (fieldName) {
            case "name" -> w.getName();
            case "type" -> w.getType() == null ? null : w.getType().name();
            case "address" -> w.getAddress();
            case "displayOrder" -> String.valueOf(w.getDisplayOrder());
            case "description" -> w.getDescription();
            case "isDeleted" -> String.valueOf(Boolean.TRUE.equals(w.getIsDeleted()));
            default -> throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "지원하지 않는 필드의 revert 요청: " + fieldName);
        };
    }

    private static void applyWarehouseField(Warehouse w, String fieldName, String newValue) {
        switch (fieldName) {
            case "name" -> {
                if (newValue == null || newValue.isBlank()) {
                    throw new BusinessException(ErrorCode.INVALID_INPUT,
                            "복원 대상 name 값이 비어있습니다");
                }
                w.rename(newValue);
            }
            case "type" -> {
                if (newValue == null) {
                    throw new BusinessException(ErrorCode.INVALID_INPUT,
                            "복원 대상 type 값이 null 입니다");
                }
                try {
                    w.changeType(WarehouseType.valueOf(newValue));
                } catch (IllegalArgumentException ex) {
                    throw new BusinessException(ErrorCode.INVALID_INPUT,
                            "잘못된 WarehouseType 값: " + newValue);
                }
            }
            case "address" -> w.changeAddress(newValue);
            case "displayOrder" -> {
                try {
                    w.changeDisplayOrder(Integer.parseInt(newValue));
                } catch (NumberFormatException ex) {
                    throw new BusinessException(ErrorCode.INVALID_INPUT,
                            "displayOrder 형식 오류: " + newValue);
                }
            }
            case "description" -> w.editDescription(newValue);
            case "isDeleted" -> throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "isDeleted revert 는 미지원입니다 — POST /restore 또는 DELETE 를 사용하세요");
            default -> throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "지원하지 않는 필드의 revert 요청: " + fieldName);
        }
    }

    /** ChangeEntry 가 비어있으면 no-op. audit 실패는 graceful fallback (도메인 진행). */
    private void recordAuditSafe(UUID warehouseId, String callerId,
                                 String callerName, List<ChangeEntry> changes) {
        if (changes == null || changes.isEmpty()) {
            return;
        }
        UUID actorId = parseCallerUuid(callerId);
        String actorName = resolveActorName(actorId, callerName);
        try {
            auditLogRecorder.recordBatch(warehouseId, actorId, actorName, null, changes);
        } catch (RuntimeException ex) {
            log.warn("[warehouse-audit] audit 기록 실패 — warehouseId={} cause={}",
                    warehouseId, ex.getMessage());
        }
    }

    /** system sentinel은 system으로, 이름이 없는 호출자는 감사 계약용 fallback으로 기록한다.
     * 그 외 actor 이름은 표시 층에서 처리할 수 있도록 입력 원문을 그대로 보존한다. */
    private static String resolveActorName(UUID actorId, String callerName) {
        return ActorDisplayName.resolve(actorId.toString(), callerName);
    }

    /** X-User-Id 헤더가 UUID 형식이면 그대로, 아니면 system sentinel (0/0). */
    private static UUID parseCallerUuid(String callerId) {
        if (callerId == null || callerId.isBlank()) {
            return new UUID(0L, 0L);
        }
        try {
            return UUID.fromString(callerId.trim());
        } catch (IllegalArgumentException ignored) {
            return new UUID(0L, 0L);
        }
    }

    Warehouse loadOrThrow(UUID id) {
        return warehouseRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "창고를 찾을 수 없습니다"));
    }
}

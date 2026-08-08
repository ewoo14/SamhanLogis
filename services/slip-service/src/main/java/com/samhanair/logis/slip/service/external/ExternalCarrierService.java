package com.samhanair.logis.slip.service.external;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.domain.external.ExternalCarrier;
import com.samhanair.logis.slip.dto.external.CreateExternalCarrierRequest;
import com.samhanair.logis.slip.dto.external.ExternalCarrierResponse;
import com.samhanair.logis.slip.dto.external.UpdateExternalCarrierRequest;
import com.samhanair.logis.slip.repository.external.ExternalCarrierRepository;
import java.util.Objects;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 외부기사/배송사 마스터 CRUD 서비스. */
@Service
@Transactional
@RequiredArgsConstructor
public class ExternalCarrierService {

    private final ExternalCarrierRepository repository;

    /** 관리자 검색 목록. q 는 name/phone LIKE 로 적용한다. */
    @Transactional(readOnly = true)
    public Page<ExternalCarrierResponse> search(String q, Pageable pageable) {
        String normalized = normalizeLikeNullable(q);
        return repository.searchAdmin(normalized, pageable).map(ExternalCarrierResponse::from);
    }

    /** 단건 조회. */
    @Transactional(readOnly = true)
    public ExternalCarrierResponse getOne(UUID id) {
        return ExternalCarrierResponse.from(loadOrThrow(id));
    }

    /** 신규 등록. active 요청값이 false 면 생성 직후 비활성화한다. */
    public ExternalCarrierResponse create(CreateExternalCarrierRequest req) {
        String phone = normalizeRequired(req.phone());
        if (repository.existsByPhoneAndIsDeletedFalse(phone)) {
            throw duplicatePhone(phone);
        }
        ExternalCarrier carrier = ExternalCarrier.create(
                normalizeRequired(req.name()),
                phone,
                normalizeNullable(req.email()),
                normalizeNullable(req.defaultVehicleType()),
                normalizeNullable(req.memo()));
        if (Boolean.FALSE.equals(req.active())) {
            carrier.deactivate();
        }
        try {
            ExternalCarrier saved = repository.save(carrier);
            repository.flush();
            return ExternalCarrierResponse.from(saved);
        } catch (DataIntegrityViolationException ex) {
            throw duplicatePhone(phone);
        }
    }

    /** 부분 수정. phone 변경 시 활성 중복을 재검증한다. */
    public ExternalCarrierResponse update(UUID id, UpdateExternalCarrierRequest req) {
        ExternalCarrier carrier = loadOrThrow(id);
        String nextPhone = normalizeNullable(req.phone());
        if (nextPhone != null
                && !Objects.equals(nextPhone, carrier.getPhone())
                && repository.existsByPhoneAndIsDeletedFalse(nextPhone)) {
            throw duplicatePhone(nextPhone);
        }
        // 선택 필드(email/defaultVehicleType/memo)는 raw 로 전달해 엔티티가 PATCH 시맨틱
        // (null=미변경, ""=클리어)을 적용하게 한다. name/phone 은 필수라 blank 면 미변경.
        carrier.update(
                normalizeNullable(req.name()),
                nextPhone,
                req.email(),
                req.defaultVehicleType(),
                req.memo(),
                req.active());
        flushOr409(nextPhone == null ? carrier.getPhone() : nextPhone);
        return ExternalCarrierResponse.from(carrier);
    }

    /** soft-delete 처리. */
    public void delete(UUID id, String callerId) {
        ExternalCarrier carrier = loadOrThrow(id);
        carrier.markDeleted(callerOrSystem(callerId));
    }

    /** soft-delete row 를 복구한다. 동일 전화번호 활성 row 가 있으면 복구를 거부한다. */
    public ExternalCarrierResponse restore(UUID id) {
        ExternalCarrier carrier = repository.findDeletedById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "비활성화된 외부기사/배송사를 찾을 수 없습니다"));
        if (repository.existsByPhoneAndIsDeletedFalse(carrier.getPhone())) {
            throw duplicatePhone(carrier.getPhone());
        }
        carrier.markRestored();
        flushOr409(carrier.getPhone());
        return ExternalCarrierResponse.from(carrier);
    }

    /**
     * 영속 컨텍스트를 flush 해 phone 부분 unique index 위반(동시성 race)을 즉시 감지하고
     * create 와 동일하게 409 로 변환한다. 검증-flush 사이 race 의 최종 방어선.
     *
     * @param phone 충돌 메시지에 노출할 전화번호
     */
    private void flushOr409(String phone) {
        try {
            repository.flush();
        } catch (DataIntegrityViolationException ex) {
            throw duplicatePhone(phone);
        }
    }

    private ExternalCarrier loadOrThrow(UUID id) {
        return repository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "외부기사/배송사를 찾을 수 없습니다"));
    }

    private static BusinessException duplicatePhone(String phone) {
        return new BusinessException(ErrorCode.CONFLICT,
                "이미 사용 중인 외부기사/배송사 전화번호입니다: " + phone);
    }

    private static String normalizeRequired(String raw) {
        return raw == null ? null : raw.trim();
    }

    private static String normalizeNullable(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        return raw.trim();
    }

    private static String normalizeLikeNullable(String raw) {
        String normalized = normalizeNullable(raw);
        return normalized == null ? null : escapeLikeLiteral(normalized);
    }

    private static String escapeLikeLiteral(String value) {
        return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }

    private static String callerOrSystem(String callerId) {
        return (callerId == null || callerId.isBlank()) ? "system" : callerId;
    }
}

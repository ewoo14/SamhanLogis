package com.samhanair.logis.slip.service.dispatchgroup;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.domain.dispatchgroup.Carrier;
import com.samhanair.logis.slip.domain.dispatchgroup.TransferStatus;
import com.samhanair.logis.slip.dto.dispatchgroup.CarrierRequests;
import com.samhanair.logis.slip.dto.dispatchgroup.CarrierResponse;
import com.samhanair.logis.slip.repository.dispatchgroup.CarrierRepository;
import com.samhanair.logis.slip.repository.dispatchgroup.DispatchGroupRepository;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class CarrierService {
    private final CarrierRepository repository;
    private final DispatchGroupRepository groupRepository;

    @Transactional(readOnly = true)
    public List<CarrierResponse> list() { return repository.findAllByOrderByNameAsc().stream().map(CarrierResponse::from).toList(); }

    @Transactional
    public CarrierResponse create(CarrierRequests.Create request) {
        if (repository.existsByCodeIgnoreCaseAndIsDeletedFalse(request.code()))
            throw new BusinessException(ErrorCode.CONFLICT, "이미 사용 중인 운송사 코드입니다.");
        return CarrierResponse.from(repository.save(Carrier.create(request.code(), request.name(), request.isArologis(), null)));
    }

    @Transactional
    public CarrierResponse update(String code, CarrierRequests.Update request) {
        Carrier carrier = load(code);
        if (groupRepository.existsByCarrierIdAndTransferStatusInAndIsDeletedFalse(
                carrier.getId(), Set.of(TransferStatus.SENT, TransferStatus.PENDING))) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "전송 완료 또는 결과 확인 중인 배차 그룹의 운송사는 변경할 수 없습니다.");
        }
        if (request.code() != null && !request.code().equalsIgnoreCase(carrier.getCode())
                && repository.existsByCodeIgnoreCaseAndIsDeletedFalse(request.code()))
            throw new BusinessException(ErrorCode.CONFLICT, "이미 사용 중인 운송사 코드입니다.");
        carrier.update(request.code(), request.name(), request.isArologis() == null ? carrier.isArologis() : request.isArologis(), carrier.getPartnerId());
        if (Boolean.FALSE.equals(request.isActive())) carrier.deactivate();
        if (Boolean.TRUE.equals(request.isActive())) carrier.activate();
        return CarrierResponse.from(carrier);
    }

    @Transactional
    public void delete(String code, String actor) {
        Carrier carrier = load(code);
        if (groupRepository.existsByCarrierIdAndIsDeletedFalse(carrier.getId()))
            throw new BusinessException(ErrorCode.CONFLICT, "배차 그룹에 지정된 운송사는 삭제할 수 없습니다. 비활성화만 가능합니다.");
        carrier.markDeleted(actor == null ? "system" : actor);
    }

    public CarrierResponse get(String code) { return CarrierResponse.from(load(code)); }

    public Carrier load(String code) { return repository.findByCodeIgnoreCaseAndIsDeletedFalse(code)
            .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "운송사를 찾을 수 없습니다.")); }

    /** 그룹의 구조적 carrier_id 조인을 위한 내부 전용 활성 조회. 외부 계약에는 노출하지 않는다. */
    public Carrier loadInternal(UUID id) { return repository.findByIdAndIsDeletedFalse(id)
            .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "운송사를 찾을 수 없습니다.")); }
}

package com.samhanair.logis.slip.service.dispatchgroup;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.domain.dispatchgroup.Carrier;
import com.samhanair.logis.slip.dto.dispatchgroup.CarrierRequests;
import com.samhanair.logis.slip.dto.dispatchgroup.CarrierResponse;
import com.samhanair.logis.slip.repository.dispatchgroup.CarrierRepository;
import com.samhanair.logis.slip.repository.dispatchgroup.DispatchGroupRepository;
import java.util.List;
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
        return CarrierResponse.from(repository.save(Carrier.create(request.code(), request.name(), request.isArologis(), request.partnerId())));
    }

    @Transactional
    public CarrierResponse update(UUID id, CarrierRequests.Update request) {
        Carrier carrier = load(id);
        if (request.code() != null && !request.code().equalsIgnoreCase(carrier.getCode())
                && repository.existsByCodeIgnoreCaseAndIsDeletedFalse(request.code()))
            throw new BusinessException(ErrorCode.CONFLICT, "이미 사용 중인 운송사 코드입니다.");
        carrier.update(request.code(), request.name(), request.isArologis() == null ? carrier.isArologis() : request.isArologis(), request.partnerId());
        if (Boolean.FALSE.equals(request.isActive())) carrier.deactivate();
        if (Boolean.TRUE.equals(request.isActive())) carrier.activate();
        return CarrierResponse.from(carrier);
    }

    @Transactional
    public void delete(UUID id, String actor) {
        if (groupRepository.existsByCarrierIdAndIsDeletedFalse(id))
            throw new BusinessException(ErrorCode.CONFLICT, "배차 그룹에 지정된 운송사는 삭제할 수 없습니다. 비활성화만 가능합니다.");
        load(id).markDeleted(actor == null ? "system" : actor);
    }

    public Carrier load(UUID id) { return repository.findByIdAndIsDeletedFalse(id)
            .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "운송사를 찾을 수 없습니다.")); }
}

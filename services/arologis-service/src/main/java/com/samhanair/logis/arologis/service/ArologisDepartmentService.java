package com.samhanair.logis.arologis.service;

import com.samhanair.logis.arologis.domain.ArologisDepartment;
import com.samhanair.logis.arologis.repository.ArologisDepartmentRepository;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 아로로지스 부서 관리 서비스. */
@Service
@RequiredArgsConstructor
@Transactional
public class ArologisDepartmentService {

    private final ArologisDepartmentRepository departmentRepository;

    /** 부서 목록 조회. */
    @Transactional(readOnly = true)
    public List<DepartmentView> list() {
        return departmentRepository.findAllByIsDeletedFalseOrderByDisplayOrderAscCodeAsc().stream()
                .map(DepartmentView::from)
                .toList();
    }

    /** 신규 부서 생성. */
    public DepartmentView create(CreateDepartmentCommand command) {
        if (departmentRepository.existsByCodeAndIsDeletedFalse(command.code())) {
            throw new BusinessException(ErrorCode.CONFLICT, "이미 사용 중인 부서 코드입니다.");
        }
        ArologisDepartment department = departmentRepository.save(
                ArologisDepartment.create(command.code(), command.name(), command.displayOrder()));
        return DepartmentView.from(department);
    }

    /** 부서 표시 정보 수정. */
    public DepartmentView update(String code, UpdateDepartmentCommand command) {
        ArologisDepartment department = findActive(code);
        department.update(command.name(), command.displayOrder());
        return DepartmentView.from(department);
    }

    /** 부서 soft-delete. */
    public void delete(String code, String actor) {
        findActive(code).markDeleted(actorOrSystem(actor));
    }

    private ArologisDepartment findActive(String code) {
        return departmentRepository.findByCodeAndIsDeletedFalse(code)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "부서를 찾을 수 없습니다."));
    }

    private static String actorOrSystem(String actor) {
        return actor == null || actor.isBlank() ? "system" : actor;
    }

    /** 부서 생성 command. */
    public record CreateDepartmentCommand(String code, String name, int displayOrder) {
    }

    /** 부서 수정 command. */
    public record UpdateDepartmentCommand(String name, int displayOrder) {
    }

    /** UUID 없는 부서 응답. */
    public record DepartmentView(String code, String name, int displayOrder) {
        public static DepartmentView from(ArologisDepartment department) {
            return new DepartmentView(department.getCode(), department.getName(), department.getDisplayOrder());
        }
    }
}

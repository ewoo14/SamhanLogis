package com.samhanair.logis.user.service;

import com.samhanair.logis.user.domain.Employee;
import com.samhanair.logis.user.domain.EmployeeAccountLink;
import com.samhanair.logis.user.domain.LinkStatus;
import com.samhanair.logis.user.repository.EmployeeAccountLinkRepository;
import com.samhanair.logis.user.repository.EmployeeRepository;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 직원 계정 연결을 미리 계획하고 검증된 계획만 적용하는 수리 서비스. */
@Service
@RequiredArgsConstructor
public class EmployeeAccountLinkReconciliationService {

    private static final SecureRandom RANDOM = new SecureRandom();
    private final EmployeeRepository employeeRepository;
    private final EmployeeAccountLinkRepository linkRepository;

    /** auth-service에서 취득한 후보의 계정 식별자와 두 표시값. UUID는 응답에 노출하지 않는다. */
    public record AccountCandidate(UUID accountId, String fullName, String loginId) {}

    /** 사용자에게 표시할 연결 예정 항목. 계정 UUID는 의도적으로 포함하지 않는다. */
    public record PlannedItem(String employeeName, String employeeLoginId, String matchReason) {}

    public record Preview(String planKey, List<PlannedItem> items) {}

    /** 정확히 일치하는 활성 직원만 계획으로 저장한다. 직원 account_id는 이 단계에서 바꾸지 않는다. */
    @Transactional
    public Preview preview(List<AccountCandidate> candidates) {
        List<String> loginIds = candidates.stream().map(AccountCandidate::loginId).distinct().toList();
        List<Employee> employees = employeeRepository.findAllActiveByLoginIds(loginIds);
        List<EmployeeAccountLink> plans = new ArrayList<>();
        String planKey = newPlanKey();

        for (AccountCandidate candidate : candidates) {
            long candidateCount = candidates.stream()
                    .filter(other -> Objects.equals(other.fullName(), candidate.fullName())
                            && Objects.equals(other.loginId(), candidate.loginId()))
                    .count();
            if (candidateCount != 1) {
                continue;
            }
            List<Employee> matches = employees.stream()
                    .filter(employee -> Objects.equals(employee.getLoginId(), candidate.loginId()))
                    .filter(employee -> Objects.equals(employee.getFullName(), candidate.fullName()))
                    .toList();
            if (matches.size() != 1) {
                continue;
            }
            Employee employee = matches.get(0);
            // 현재 계약상 id == account_id 인 행은 이미 정상이다. 후보가 잘못 제출되어도 보호한다.
            if (Objects.equals(employee.getId(), employee.getAccountId())
                    || Objects.equals(employee.getAccountId(), candidate.accountId())) {
                continue;
            }
            plans.add(new EmployeeAccountLink(employee, planKey, employee.getAccountId(),
                    candidate.accountId(), "full_name exact; login_id exact"));
        }
        linkRepository.saveAll(plans);
        return new Preview(planKey, plans.stream()
                .map(plan -> new PlannedItem(plan.getEmployeeName(), plan.getEmployeeLoginId(), plan.getMatchReason()))
                .toList());
    }

    /** 미리 저장된 계획을 다시 검증한 뒤 직원 도메인 메서드로 연결한다. */
    @Transactional
    public void apply(String planKey) {
        List<EmployeeAccountLink> plans = linkRepository.findByPlanKeyAndStatus(planKey, LinkStatus.PLANNED);
        for (EmployeeAccountLink plan : plans) {
            Employee employee = employeeRepository.findById(plan.getEmployeeId())
                    .orElseThrow(() -> new IllegalStateException("계획 대상 직원이 없어 연결을 중단합니다"));
            if (!Objects.equals(employee.getAccountId(), plan.getOldAccountId())
                    || !Objects.equals(employee.getFullName(), plan.getEmployeeName())
                    || !Objects.equals(employee.getLoginId(), plan.getEmployeeLoginId())) {
                throw new IllegalStateException("미리보기 이후 직원 정보가 변경되어 연결을 중단합니다");
            }
            employee.linkToAccount(plan.getTargetAccountId());
            plan.markApplied();
        }
        linkRepository.saveAll(plans);
    }

    private String newPlanKey() {
        byte[] bytes = new byte[18];
        RANDOM.nextBytes(bytes);
        StringBuilder result = new StringBuilder("EAL-");
        for (byte value : bytes) {
            result.append(String.format("%02x", value));
        }
        return result.toString();
    }
}

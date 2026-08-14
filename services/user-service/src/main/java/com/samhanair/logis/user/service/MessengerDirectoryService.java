package com.samhanair.logis.user.service;

import com.samhanair.logis.user.domain.Employee;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;

/** 메신저 직원 목록의 정본 정렬 규칙을 한 곳에서 관리한다. */
@Service
public class MessengerDirectoryService {

    /** 직급 순서가 바뀌면 이 표만 수정한다. 직무·미등록 직급은 마지막으로 보낸다. */
    public static final Map<String, Integer> JOB_TITLE_ORDER = Map.of(
            "대표", 0, "전무", 1, "이사", 2, "부장", 3,
            "차장", 4, "과장", 5, "주임", 6, "사원", 7);

    public List<Employee> sort(List<Employee> employees) {
        return employees.stream()
                .sorted(Comparator.comparingInt((Employee employee) ->
                                JOB_TITLE_ORDER.getOrDefault(employee.getPosition(), Integer.MAX_VALUE)))
                .toList();
    }

    /** 퇴사 및 auth 계정 비활성 직원을 메신저 directory에서 제외한다. */
    public List<Employee> activeOnly(List<Employee> employees, Set<UUID> enabledAccountIds) {
        return sort(employees).stream()
                .filter(employee -> employee.getTerminationDate() == null)
                .filter(employee -> enabledAccountIds.contains(employee.getId()))
                .toList();
    }
}

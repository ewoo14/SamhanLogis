package com.samhanair.logis.user.seed;

import com.samhanair.logis.common.security.Role;
import com.samhanair.logis.user.domain.Employee;
import com.samhanair.logis.user.repository.EmployeeRepository;
import com.samhanair.logis.user.service.EmployeeProvisioningService;
import com.samhanair.logis.user.web.dto.CreateEmployeeRequest;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * Seeds the 16 real Samhan Logis employees on first boot when {@code app.user.seed-org=true}.
 * Uses the canonical default password from {@code QA_MASTER_PASSWORD} (CEO-confirmed Q1) — employees
 * change it on first login. Idempotent: skips any loginId that already exists.
 */
@Component
@ConditionalOnProperty(value = "app.user.seed-org", havingValue = "true")
public class OrgChartSeeder implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(OrgChartSeeder.class);

    private static final String DEFAULT_PASSWORD = requirePassword();

    private static String requirePassword() {
        String password = System.getenv("QA_MASTER_PASSWORD");
        if (password == null || password.isBlank()) {
            throw new IllegalStateException("QA_MASTER_PASSWORD 환경변수가 필요합니다.");
        }
        return password;
    }
    /*
     * post-W5 종합 fix (BE-3, D-P9-21) — Employee.DEFAULT_HIRE_DATE 인용 (DRY 정합).
     * 기존 별도 LocalDate.of(2026,1,1) 상수 중복 제거 — Employee domain 의 의도 주석을 단일 출처로.
     */

    private static final UUID DEPT_EXEC       = UUID.fromString("00000000-0000-0000-0000-000000000001");
    private static final UUID DEPT_SALES_1    = UUID.fromString("00000000-0000-0000-0000-000000000002");
    private static final UUID DEPT_SALES_2    = UUID.fromString("00000000-0000-0000-0000-000000000003");
    private static final UUID DEPT_SALES_3    = UUID.fromString("00000000-0000-0000-0000-000000000004");
    private static final UUID DEPT_ACCOUNTING = UUID.fromString("00000000-0000-0000-0000-000000000005");

    private final EmployeeRepository employeeRepository;
    private final EmployeeProvisioningService provisioningService;

    public OrgChartSeeder(EmployeeRepository employeeRepository,
                          EmployeeProvisioningService provisioningService) {
        this.employeeRepository = employeeRepository;
        this.provisioningService = provisioningService;
    }

    @Override
    public void run(String... args) {
        List<SeedRow> rows = List.of(
                new SeedRow(DEPT_EXEC,       "김미선",   "kimmiseon",     "대표",   Role.MASTER,     false),
                new SeedRow(DEPT_EXEC,       "장영구",   "janyeonggu",    "전무",   Role.MANAGER,    false),
                new SeedRow(DEPT_SALES_1,    "오병승",   "obyeongseung",  "이사",   Role.SALES,      true),
                new SeedRow(DEPT_SALES_1,    "홍지수",   "hongjisu",      "사원",   Role.SALES,      false),
                new SeedRow(DEPT_SALES_2,    "김기철",   "kimgicheol",    "부장",   Role.SALES,      true),
                new SeedRow(DEPT_SALES_2,    "심미광",   "simmigwang",    "과장",   Role.SALES,      false),
                new SeedRow(DEPT_SALES_2,    "정민국",   "jeongminguk",   "사원",   Role.SALES,      false),
                new SeedRow(DEPT_SALES_2,    "이지용",   "leejiyong",     "사원",   Role.SALES,      false),
                new SeedRow(DEPT_SALES_3,    "견진성",   "gyeonjinseong", "차장",   Role.SALES,      true),
                new SeedRow(DEPT_SALES_3,    "박은우",   "parkeunwoo",    "주임",   Role.DEVELOPER,  false),
                new SeedRow(DEPT_SALES_3,    "신현민",   "sinhyeonmin",   "사원",   Role.SALES,      false),
                new SeedRow(DEPT_ACCOUNTING, "이성미",   "leeseongmi",    "사원",   Role.ACCOUNTANT, true),
                new SeedRow(DEPT_ACCOUNTING, "허유진",   "heoyujin",      "사원",   Role.ACCOUNTANT, false),
                new SeedRow(DEPT_ACCOUNTING, "라해람",   "rahaeram",      "사원",   Role.ACCOUNTANT, false),
                new SeedRow(DEPT_ACCOUNTING, "김은지",   "kimeunji",      "사원",   Role.ACCOUNTANT, false),
                new SeedRow(DEPT_ACCOUNTING, "박지수",   "parkjisu",      "사원",   Role.ACCOUNTANT, false));

        int created = 0;
        for (SeedRow row : rows) {
            if (employeeRepository.existsByLoginId(row.loginId())) {
                log.debug("Skipping seed (already present): {}", row.loginId());
                continue;
            }
            try {
                provisioningService.create(new CreateEmployeeRequest(
                        row.loginId(),
                        DEFAULT_PASSWORD,
                        row.fullName(),
                        row.position(),
                        row.role(),
                        row.departmentId(),
                        row.teamLead(),
                        Employee.DEFAULT_HIRE_DATE,
                        null,
                        null), null);
                created++;
            } catch (RuntimeException ex) {
                log.error("Failed to seed employee {}: {}", row.loginId(), ex.getMessage());
            }
        }
        log.info("OrgChartSeeder created {} employees (skipped {})", created, rows.size() - created);
    }

    private record SeedRow(
            UUID departmentId,
            String fullName,
            String loginId,
            String position,
            Role role,
            boolean teamLead) {
    }
}

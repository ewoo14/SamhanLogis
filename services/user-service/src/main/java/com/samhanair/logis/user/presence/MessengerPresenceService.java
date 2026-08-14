package com.samhanair.logis.user.presence;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.user.domain.Employee;
import com.samhanair.logis.user.repository.EmployeeRepository;
import com.samhanair.logis.user.web.dto.MessengerEmployeeResponse;
import com.samhanair.logis.user.web.dto.MessengerPresenceResponse;
import java.io.IOException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Supplier;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@Service
public class MessengerPresenceService {
    private final EmployeeRepository employees;
    private final MessengerPresenceRepository presences;
    private final ObjectMapper objectMapper;
    private final Supplier<SseEmitter> emitterFactory;
    private final Map<UUID, Set<SseEmitter>> streams = new ConcurrentHashMap<>();
    private final Map<UUID, Set<String>> sessions = new ConcurrentHashMap<>();

    @Autowired
    public MessengerPresenceService(EmployeeRepository employees, MessengerPresenceRepository presences, ObjectMapper objectMapper) {
        this(employees, presences, objectMapper, () -> new SseEmitter(0L));
    }

    MessengerPresenceService(EmployeeRepository employees, MessengerPresenceRepository presences, ObjectMapper objectMapper,
                             Supplier<SseEmitter> emitterFactory) {
        this.employees = employees;
        this.presences = presences;
        this.objectMapper = objectMapper;
        this.emitterFactory = emitterFactory;
    }

    @Transactional
    public void setStatus(UUID employeeId, PresenceStatus next) {
        requireEmployee(employeeId);
        var current = presences.findByEmployeeId(employeeId).orElseGet(() -> presences.save(MessengerPresence.create(employeeId)));
        if (next == PresenceStatus.OFFLINE || next == PresenceStatus.AVAILABLE || next == PresenceStatus.AWAY
                || next == PresenceStatus.ABSENT || next == PresenceStatus.IN_MEETING || next == PresenceStatus.ON_CALL) {
            current.setManualStatus(next);
            presences.save(current);
            publish(employeeId, next);
        }
    }

    @Transactional
    public void connect(UUID employeeId) {
        requireEmployee(employeeId);
        var current = presences.findByEmployeeId(employeeId).orElseGet(() -> presences.save(MessengerPresence.create(employeeId)));
        if (current.getStatus() == PresenceStatus.OFFLINE) {
            current.setAutomaticStatus(PresenceStatus.AVAILABLE, Instant.now());
            presences.save(current);
            publish(employeeId, PresenceStatus.AVAILABLE);
        }
    }

    @Transactional
    public void join(UUID employeeId, String sessionId) {
        if (sessionId == null || sessionId.isBlank()) throw new BusinessException(ErrorCode.INVALID_INPUT, "sessionId는 필수입니다");
        connect(employeeId);
        sessions.computeIfAbsent(employeeId, ignored -> ConcurrentHashMap.newKeySet()).add(sessionId.trim());
        touchActivity(employeeId);
    }

    @Transactional
    public void touchActivity(UUID employeeId) {
        var current = presences.findByEmployeeId(employeeId).orElse(null);
        if (current == null || current.getStatus() == PresenceStatus.IN_MEETING
                || current.getStatus() == PresenceStatus.ON_CALL || current.getStatus() == PresenceStatus.OFFLINE) return;
        var previous = current.getStatus();
        current.setAutomaticStatus(PresenceStatus.AVAILABLE, Instant.now());
        presences.save(current);
        if (previous != PresenceStatus.AVAILABLE) publish(employeeId, PresenceStatus.AVAILABLE);
    }

    @Transactional
    public void leave(UUID employeeId, String sessionId) {
        var activeSessions = sessions.get(employeeId);
        if (activeSessions != null) {
            activeSessions.remove(sessionId);
            if (activeSessions.isEmpty()) sessions.remove(employeeId, activeSessions);
        }
        disconnectIfUnused(employeeId);
    }

    @Transactional(readOnly = true)
    public MessengerEmployeeResponse me(UUID employeeId) {
        var employee = requireEmployee(employeeId);
        var status = presences.findByEmployeeId(employeeId).map(MessengerPresence::getStatus).orElse(PresenceStatus.OFFLINE);
        return new MessengerEmployeeResponse(employee.getEcountCode(), employee.getFullName(), employee.getPosition(),
                employee.getDepartment().getName(), employee.getDepartment().getDisplayOrder(), employee.getHireDate(), status);
    }

    @Transactional(readOnly = true)
    public List<MessengerEmployeeResponse> directory() {
        var result = new ArrayList<MessengerEmployeeResponse>();
        var states = presences.findAllByEmployeeIdIn(employees.findAll().stream().map(Employee::getId).toList())
                .stream().collect(java.util.stream.Collectors.toMap(MessengerPresence::getEmployeeId, p -> p.getStatus()));
        employees.findAll().stream()
                .sorted(Comparator.comparing((Employee e) -> e.getDepartment().getDisplayOrder())
                        .thenComparingInt(e -> rank(e.getPosition()))
                        .thenComparing(Employee::getHireDate, Comparator.nullsLast(Comparator.naturalOrder()))
                        .thenComparing(Employee::getFullName))
                .forEach(e -> result.add(new MessengerEmployeeResponse(e.getEcountCode(), e.getFullName(), e.getPosition(),
                        e.getDepartment().getName(), e.getDepartment().getDisplayOrder(), e.getHireDate(),
                        states.getOrDefault(e.getId(), PresenceStatus.OFFLINE))));
        return result;
    }

    public SseEmitter stream(UUID employeeId) {
        connect(employeeId);
        var emitter = emitterFactory.get();
        streams.computeIfAbsent(employeeId, ignored -> ConcurrentHashMap.newKeySet()).add(emitter);
        emitter.onCompletion(() -> closeStream(employeeId, emitter));
        emitter.onTimeout(() -> closeStream(employeeId, emitter));
        emitter.onError(ignored -> closeStream(employeeId, emitter));
        try { emitter.send(SseEmitter.event().name("connected").data(Map.of("ok", true))); }
        catch (IOException ignored) { closeStream(employeeId, emitter); }
        return emitter;
    }

    @Scheduled(fixedDelay = 60_000)
    @Transactional
    public void applyIdleTransitions() {
        Instant now = Instant.now();
        presences.findAll().forEach(current -> {
            var next = PresenceStatusPolicy.automaticStatus(current.getStatus(), current.getLastActivityAt(), now);
            if (next != current.getStatus()) {
                current.setAutomaticStatus(next, current.getLastActivityAt());
                presences.save(current);
                publish(current.getEmployeeId(), next);
            }
        });
    }

    void closeStream(UUID employeeId, SseEmitter emitter) {
        var active = streams.get(employeeId);
        if (active != null) active.remove(emitter);
        disconnectIfUnused(employeeId);
    }

    private void disconnectIfUnused(UUID employeeId) {
        if (!sessions.getOrDefault(employeeId, Set.of()).isEmpty()) return;
        if (!streams.getOrDefault(employeeId, Set.of()).isEmpty()) return;
        var current = presences.findByEmployeeId(employeeId).orElse(null);
        if (current != null && current.getStatus() != PresenceStatus.OFFLINE) {
            current.setAutomaticStatus(PresenceStatus.OFFLINE, Instant.now());
            presences.save(current);
            publish(employeeId, PresenceStatus.OFFLINE);
        }
    }

    private void publish(UUID employeeId, PresenceStatus status) {
        var employee = employees.findById(employeeId).orElse(null);
        if (employee == null) return;
        var event = new MessengerPresenceResponse(employee.getEcountCode(), status, status.label());
        streams.forEach((owner, set) -> set.forEach(emitter -> {
            try { emitter.send(SseEmitter.event().name("presence").data(event, org.springframework.http.MediaType.APPLICATION_JSON)); }
            catch (IOException ignored) { closeStream(owner, emitter); }
        }));
    }

    private Employee requireEmployee(UUID employeeId) {
        return employees.findById(employeeId).orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "직원을 찾을 수 없습니다"));
    }

    private static int rank(String title) {
        return List.of("대표", "사장", "이사", "부장", "차장", "과장", "대리", "사원").indexOf(title) < 0 ? 100
                : List.of("대표", "사장", "이사", "부장", "차장", "과장", "대리", "사원").indexOf(title);
    }
}

import React, {
  useContext,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, Input } from "@samhan/design-system";
import {
  Link,
  Route,
  Routes,
  UNSAFE_LocationContext,
  useNavigate,
  useParams,
} from "react-router-dom";
import {
  askClaude,
  claudeErrorMessage,
  createClaudeSession,
  listClaudeSessions,
  type ClaudeSession,
} from "./claude/claude-api";
import * as chatApi from "./api/chat-api";
import * as presenceApi from "./api/presence-api";
import * as mainApi from "./api/chatApi";
import type { Employee, PresenceStatus } from "./api/chat-api";

declare global {
  interface Window {
    internalChatShell?: {
      appName: string;
      onWillQuit: (listener: () => void) => () => void;
    };
  }
}

const presenceLabels: Record<PresenceStatus, string> = {
  AVAILABLE: "접속",
  AWAY: "자리비움",
  ABSENT: "부재중",
  IN_MEETING: "회의중",
  ON_CALL: "통화중",
  OFFLINE: "오프라인",
};
const presenceSession = `desktop-${Date.now()}`;
const statusOrder: PresenceStatus[] = [
  "AVAILABLE",
  "AWAY",
  "ABSENT",
  "IN_MEETING",
  "ON_CALL",
  "OFFLINE",
];
const jobRank: Record<string, number> = {
  대표: 0,
  사장: 1,
  이사: 2,
  부장: 3,
  차장: 4,
  과장: 5,
  대리: 6,
  사원: 7,
};
function Presence({
  employee,
}: {
  employee: Pick<Employee, "name" | "presenceStatus">;
}) {
  return (
    <span
      className={`presence presence-${employee.presenceStatus.toLowerCase()}`}
      aria-label={`${employee.name} 상태: ${presenceLabels[employee.presenceStatus]}`}
    />
  );
}
function ProfileStatus({
  employee,
  onChange,
}: {
  employee: Employee;
  onChange: (status: PresenceStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="profile-row profile-status-control">
      <button
        type="button"
        className="profile-status-button"
        aria-label={`${employee.name} 상태 변경`}
        onClick={() => setOpen((v) => !v)}
      >
        <Presence employee={employee} />
        <strong>{employee.name}</strong>
        <span>{employee.jobTitle}</span>
      </button>
      {open ? (
        <div className="presence-menu" role="menu" aria-label="내 상태 변경">
          {statusOrder.map((status) => (
            <button
              key={status}
              type="button"
              role="menuitem"
              onClick={() => {
                onChange(status);
                setOpen(false);
              }}
            >
              <span className={`presence presence-${status.toLowerCase()}`} />
              {presenceLabels[status]}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
function sortedGroups(directory: Employee[]) {
  const groups = new Map<string, Employee[]>();
  for (const employee of directory)
    groups.set(employee.departmentName, [
      ...(groups.get(employee.departmentName) ?? []),
      employee,
    ]);
  return [...groups.entries()]
    .sort(
      ([, a], [, b]) =>
        (a[0]?.departmentOrder ?? 0) - (b[0]?.departmentOrder ?? 0),
    )
    .map(
      ([name, employees]) =>
        [
          name,
          employees.sort(
            (a, b) =>
              (jobRank[a.jobTitle] ?? 99) - (jobRank[b.jobTitle] ?? 99) ||
              (a.hireDate ?? "").localeCompare(b.hireDate ?? "") ||
              a.name.localeCompare(b.name, "ko"),
          ),
        ] as const,
    );
}
function formatRoomTime(value?: string | null) {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(new Date(value));
  const period = parts.find((part) => part.type === "dayPeriod")?.value === "AM" ? "오전" : "오후";
  const hour = parts.find((part) => part.type === "hour")?.value ?? "";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "";
  return `${period} ${hour}:${minute}`;
}
function MessengerPage({ mode }: { mode: "individual" | "group" }) {
  const client = useQueryClient();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Employee[]>([]);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const me = useQuery({ queryKey: ["me"], queryFn: chatApi.fetchMe });
  const directory = useQuery({
    queryKey: ["directory"],
    queryFn: chatApi.fetchDirectory,
  });
  const rooms = useQuery({
    queryKey: ["rooms", mode],
    queryFn: mode === "group" ? chatApi.fetchGroups : chatApi.fetchRooms,
  });
  const messages = useQuery({
    queryKey: ["messages", roomCode],
    queryFn: () => chatApi.fetchMessages(roomCode!),
    enabled: Boolean(roomCode),
  });
  const create = useMutation({
    mutationFn: (code: string) => chatApi.createDirectRoom(code),
    onSuccess: (room) => {
      setRoomCode(room.roomCode);
      void client.invalidateQueries({ queryKey: ["rooms"] });
    },
  });
  const createGroup = useMutation({
    mutationFn: () =>
      chatApi.createGroupRoom(
        selected.map((e) => e.employeeCode!).filter(Boolean),
      ),
    onSuccess: (room) => {
      setRoomCode(room.roomCode);
      setSelected([]);
    },
  });
  const send = useMutation({
    mutationFn: () => chatApi.sendMessage(roomCode!, body.trim()),
    onSuccess: () => {
      setBody("");
      void client.invalidateQueries({ queryKey: ["messages", roomCode] });
    },
  });
  const update = useMutation({
    mutationFn: presenceApi.updatePresence,
    onSuccess: (_, status) =>
      client.setQueryData<Employee>(["me"], (old) =>
        old ? { ...old, presenceStatus: status } : old,
      ),
  });
  const filtered = (directory.data ?? []).filter(
    (e) =>
      !query.trim() || `${e.name} ${e.departmentName}`.includes(query.trim()),
  );
  const grouped = useMemo(() => sortedGroups(filtered), [filtered]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (roomCode && body.trim()) send.mutate();
  };
  return (
    <main className="messenger-app" data-testid="messenger-app">
      {me.data ? (
        <ProfileStatus employee={me.data} onChange={(s) => update.mutate(s)} />
      ) : null}
      <Card as="section" padding={0} shadow="none" variant="plain">
        <div className="messenger-grid">
          <aside className="conversation-sidebar">
            <div className="sidebar-title">
              <h2>{mode === "individual" ? "개별 대화" : "그룹 대화"}</h2>
              {mode === "group" ? (
                <Button
                  size="sm"
                  onClick={() => createGroup.mutate()}
                  disabled={!selected.length}
                >
                  새 그룹
                </Button>
              ) : null}
            </div>
            <Input
              aria-label="직원 검색"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="이름 또는 부서 검색"
            />
            {mode === "individual" ? (
              <ul
                aria-label="직원 목록"
                className="conversation-list grouped-directory"
              >
                {grouped.map(([group, employees]) => (
                  <li key={group} className="directory-group">
                    <h3>{group}</h3>
                    {employees.map((employee) => (
                      <button
                        type="button"
                        className="conversation"
                        key={employee.employeeCode ?? employee.name}
                        onClick={() =>
                          employee.employeeCode &&
                          create.mutate(employee.employeeCode)
                        }
                      >
                        <Presence employee={employee} />
                        <span>
                          <strong>{employee.name}</strong>
                          <small>{employee.jobTitle}</small>
                        </span>
                      </button>
                    ))}
                  </li>
                ))}
              </ul>
            ) : (
              <>
              <ul aria-label="group rooms" className="conversation-list group-room-list">
                {(rooms.data ?? []).map((room) => (
                  <li key={room.roomCode}>
                    <button type="button" className="conversation group-room" onClick={() => setRoomCode(room.roomCode)}>
                      <span className="room-avatar" aria-hidden="true">{(room.roomName ?? room.partnerName ?? "그룹").slice(0, 1)}</span>
                      <strong>{room.roomName ?? room.partnerName ?? room.roomCode}</strong>
                      <small>{room.lastMessage ?? ""}</small>
                      {room.memberCount ? <b>{room.memberCount}</b> : null}
                      {room.lastMessageAt ? <time>{formatRoomTime(room.lastMessageAt)}</time> : null}
                    </button>
                  </li>
                ))}
              </ul>
              <div className="directory-list">
                {filtered.map((employee) => (
                  <button
                    type="button"
                    key={employee.employeeCode ?? employee.name}
                    onClick={() =>
                      setSelected((old) =>
                        old.some(
                          (e) => e.employeeCode === employee.employeeCode,
                        )
                          ? old.filter(
                              (e) => e.employeeCode !== employee.employeeCode,
                            )
                          : [...old, employee],
                      )
                    }
                  >
                    <Presence employee={employee} />
                    {employee.name}
                    <small>{employee.departmentName}</small>
                  </button>
                ))}
              </div>
              </>
            )}
          </aside>
          <section className="conversation-pane" aria-label="대화">
            <header className="conversation-header">
              <h2>{roomCode ? "대화" : "대화를 선택하세요"}</h2>
            </header>
            <div className="message-scroll">
              <ul aria-label="대화 내용" className="message-list">
                {(messages.data ?? []).map((m) => (
                  <li
                    key={`${m.sequence}-${m.sentAt}`}
                    className={m.mine ? "mine" : ""}
                  >
                    <span className="message-author">
                      {m.mine ? "나" : (m.senderName ?? "알 수 없는 발신자")}
                    </span>
                    <p>{m.body}</p>
                  </li>
                ))}
              </ul>
            </div>
            {roomCode ? (
              <form className="composer" onSubmit={submit}>
                <textarea
                  aria-label="메시지 본문"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                />
                <Button type="submit" disabled={!body.trim()}>
                  보내기
                </Button>
              </form>
            ) : null}
          </section>
        </div>
      </Card>
    </main>
  );
}
function ClaudePage() {
  const client = useQueryClient();
  const [active, setActive] = useState<ClaudeSession | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const sessions = useQuery({
    queryKey: ["claude-sessions"],
    queryFn: () => listClaudeSessions(),
  });
  const create = useMutation({
    mutationFn: () => createClaudeSession(),
    onSuccess: (s) => {
      setActive(s);
      void client.invalidateQueries({ queryKey: ["claude-sessions"] });
    },
  });
  const ask = useMutation({
    mutationFn: () =>
      askClaude(question.trim(), { sessionCode: active!.sessionCode }),
    onSuccess: (v) => {
      setAnswer(v);
      setQuestion("");
    },
    onError: (e) => setError(claudeErrorMessage(e)),
  });
  return (
    <main className="claude-app" data-testid="claude-app">
      <header className="claude-topbar">
        <div>
          <span className="eyebrow">축 0 권한 보호</span>
          <h2>클로드</h2>
        </div>
        <Button onClick={() => create.mutate()}>새 세션</Button>
      </header>
      <aside className="session-list">
        {(sessions.data ?? []).map((s) => (
          <button
            type="button"
            key={s.sessionCode}
            onClick={() => setActive(s)}
          >
            {s.title}
          </button>
        ))}
      </aside>
      {active ? (
        <>
          <h3>{active.title}</h3>
          {answer ? <p>{answer}</p> : null}
          <form
            className="composer"
            onSubmit={(e) => {
              e.preventDefault();
              if (question.trim()) ask.mutate();
            }}
          >
            <textarea
              aria-label="클로드 질문"
              value={question}
              onChange={(e) => {
                setError("");
                setQuestion(e.target.value);
              }}
            />
            <Button type="submit">질문 보내기</Button>
          </form>
        </>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
    </main>
  );
}
function V2App() {
  const client = useQueryClient();
  const [page, setPage] = useState<"individual" | "group" | "claude">(
    "individual",
  );
  useEffect(() => {
    void chatApi.joinPresence(presenceSession);
    const leave = () => { void chatApi.leavePresence(presenceSession); };
    const removeQuitListener = window.internalChatShell?.onWillQuit(leave);
    const unsubscribe = presenceApi.subscribePresence((event) => {
      if (event.employeeCode) {
        client.setQueryData<Employee[]>(["directory"], (old) =>
          old?.map((employee) => employee.employeeCode === event.employeeCode
            ? { ...employee, presenceStatus: event.presenceStatus }
            : employee),
        );
      } else {
        client.setQueryData<Employee>(["me"], (old) =>
          old ? { ...old, presenceStatus: event.presenceStatus } : old,
        );
      }
    });
    return () => {
      removeQuitListener?.();
      unsubscribe();
      leave();
    };
  }, [client]);
  return (
    <div className="app-shell">
      <header className="messenger-brand" aria-label="앱 이름">삼한 메신저</header>
      <nav className="page-chips" aria-label="메신저 페이지 전환">
        <button className={`page-chip${page === "individual" ? " active" : ""}`} type="button" aria-current={page === "individual" ? "page" : undefined} onClick={() => setPage("individual")}>
          개별
        </button>
        <button className={`page-chip${page === "group" ? " active" : ""}`} type="button" aria-current={page === "group" ? "page" : undefined} onClick={() => setPage("group")}>
          그룹별
        </button>
        <button className={`page-chip${page === "claude" ? " active" : ""}`} type="button" aria-current={page === "claude" ? "page" : undefined} onClick={() => setPage("claude")}>
          클로드
        </button>
      </nav>
      {page === "claude" ? <ClaudePage /> : <MessengerPage mode={page} />}
    </div>
  );
}

function MainPresence({
  employee,
}: {
  employee: Pick<mainApi.MessengerEmployee, "name" | "presenceStatus">;
}) {
  const labels: Record<string, string> = {
    AVAILABLE: "접속",
    AWAY: "자리비움",
    ABSENT: "부재중",
    IN_MEETING: "회의중",
    ON_CALL: "통화중",
    OFFLINE: "오프라인",
  };
  return (
    <span
      className={`presence presence-${employee.presenceStatus.toLowerCase()}`}
      aria-label={`${employee.name} 상태: ${labels[employee.presenceStatus]}`}
    />
  );
}
function MainRooms() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"individual" | "group">("individual");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<mainApi.MessengerEmployee | null>(
    null,
  );
  const me = useQuery({
    queryKey: ["messenger", "me"],
    queryFn: mainApi.fetchMessengerMe,
  });
  const directory = useQuery({
    queryKey: ["messenger", "directory"],
    queryFn: mainApi.fetchMessengerDirectory,
  });
  const rooms = useQuery({
    queryKey: ["chat", "rooms"],
    queryFn: mainApi.fetchChatRooms,
  });
  const groups = useQuery({
    queryKey: ["chat", "groups"],
    queryFn: mainApi.fetchGroupChatRooms,
    enabled: true,
  });
  const create = useMutation({
    mutationFn: () =>
      mainApi.createDirectChatRoomByEmployeeCode(selected!.employeeCode!),
    onSuccess: (r) => navigate(encodeURIComponent(r.roomCode)),
  });
  const filtered = (directory.data ?? []).filter(
    (e) =>
      !query.trim() ||
      e.name.includes(query.trim()) ||
      e.departmentName.includes(query.trim()),
  );
  if (mode === "group" && !groups.data)
    return <main className="chat-layout"><p>그룹 대화를 불러오는 중입니다.</p></main>;
  if (mode === "group")
    return (
      <main className="chat-layout" data-testid="group-chat-rooms-page">
        <header className="chat-header">
          <h1>채팅</h1>
          <div>
            <Button onClick={() => setMode("individual")}>개별</Button>
            <Button onClick={() => undefined}>검색</Button>
          </div>
        </header>
        <Card>
          <ul aria-label="그룹 채팅방 목록" className="room-list">
            {(groups.data ?? []).map((g) => (
              <li key={g.roomCode}>
                <Link to={encodeURIComponent(g.roomCode)}>
                  {g.roomName ?? g.participants.map((p) => p.name).join(", ")}
                  {g.unreadCount ? <strong>{g.unreadCount}</strong> : null}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </main>
    );
  return (
    <main className="chat-layout" data-testid="chat-rooms-page">
      <header className="chat-header">
        <h1>채팅</h1>
        <div>
          <Button onClick={() => setMode("individual")}>개별</Button>
          <Button onClick={() => setMode("group")}>그룹별</Button>
          <Button
            onClick={() =>
              document.getElementById("chat-new-conversation")?.focus()
            }
          >
            새 대화
          </Button>
        </div>
      </header>
      <Card>
        <div className="messenger-me" aria-label="내 정보">
          {me.data ? (
            <>
              <MainPresence employee={me.data} />
              <strong>{me.data.name}</strong>
            </>
          ) : null}
        </div>
        <ul aria-label="직원 목록" className="employee-list">
          {(directory.data ?? []).map((e) => (
            <li key={e.employeeCode ?? e.name}>
              <button
                type="button"
                className="employee"
                onClick={() =>
                  e.employeeCode &&
                  mainApi.createDirectChatRoomByEmployeeCode(e.employeeCode)
                }
              >
                <MainPresence employee={e} />
                <strong>{e.name}</strong>
                <span>{e.jobTitle}</span>
                <small>{e.departmentName}</small>
              </button>
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <section aria-label="새 대화" id="chat-new-conversation" tabIndex={-1}>
          <Input
            aria-label="대화 상대 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {filtered.map((e) => (
            <button
              className="recipient"
              type="button"
              key={e.employeeCode ?? e.name}
              onClick={() => setSelected(e)}
            >
              <MainPresence employee={e} />
              {e.name} · {e.departmentName}
            </button>
          ))}
          {selected ? (
            <div className="selected-recipient">
              <span>{selected.name}</span>
              <Button onClick={() => create.mutate()}>대화 시작</Button>
            </div>
          ) : null}
        </section>
      </Card>
      <Card>
        <ul aria-label="채팅방 목록" className="room-list">
          {(rooms.data ?? []).map((r) => (
            <li key={r.roomCode}>
              <Link to={encodeURIComponent(r.roomCode)}>
                {r.partnerName ?? r.roomName ?? "채팅방"}
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </main>
  );
}
function MainRoom() {
  const { roomCode = "" } = useParams<{ roomCode: string }>();
  const client = useQueryClient();
  const [body, setBody] = useState("");
  const messages = useQuery({
    queryKey: ["chat", roomCode, "messages"],
    queryFn: () => mainApi.fetchChatMessages(roomCode),
  });
  const send = useMutation({
    mutationFn: () => mainApi.sendChatMessage(roomCode, body.trim()),
    onSuccess: () => {
      setBody("");
      void client.invalidateQueries({
        queryKey: ["chat", roomCode, "messages"],
      });
    },
  });
  return (
    <main className="chat-layout" data-testid="chat-room-page">
      <h1>채팅</h1>
      <Card>
        <ul aria-label="대화 내용" className="message-list">
          {(messages.data ?? []).map((m) => (
            <li key={`${m.sequence}-${m.sentAt}`}>
              <p>{m.body}</p>
            </li>
          ))}
        </ul>
      </Card>
      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          if (body.trim()) send.mutate();
        }}
      >
        <textarea
          aria-label="메시지 본문"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <Button type="submit">보내기</Button>
      </form>
    </main>
  );
}
function RoutedMainApp() {
  useEffect(() => {
    void mainApi.joinMessengerPresence(presenceSession);
    return () => {
      void mainApi.leaveMessengerPresence(presenceSession);
    };
  }, []);
  return (
    <Routes>
      <Route index element={<MainRooms />} />
      <Route path=":roomCode" element={<MainRoom />} />
    </Routes>
  );
}
export function ChatApp() {
  const location = useContext(UNSAFE_LocationContext);
  return location ? <RoutedMainApp /> : <V2App />;
}

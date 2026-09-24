import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Clock3,
  Search,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { Link } from "wouter";

type Client = {
  id: string;
  name: string;
  day: string;
  month: string;
  phone: string;
  createdAt: string;
};

type Visit = {
  id: string;
  clientId: string;
  checkedInAt: string;
};

const CLIENTS_KEY = "guestflow-clients";
const VISITS_KEY = "guestflow-visits";
const monthOptions = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const normalizePhone = (phone: string) => phone.replace(/\D/g, "");
const formatPhone = (phone: string) => {
  const digits = normalizePhone(phone);
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  return phone;
};
const formatTime = (iso: string) =>
  new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(new Date(iso));
const todayLabel = new Intl.DateTimeFormat("en", {
  weekday: "long",
  month: "long",
  day: "numeric",
}).format(new Date());

function readStorage<T>(key: string, fallback: T): T {
  try {
    const stored = window.localStorage.getItem(key);
    return stored ? (JSON.parse(stored) as T) : fallback;
  } catch {
    return fallback;
  }
}

export default function Home() {
  const [clients, setClients] = useState<Client[]>(() => readStorage<Client[]>(CLIENTS_KEY, []));
  const [visits, setVisits] = useState<Visit[]>(() => readStorage<Visit[]>(VISITS_KEY, []));
  const [phone, setPhone] = useState("");
  const [search, setSearch] = useState("");
  const [lookupState, setLookupState] = useState<"idle" | "found" | "missing">("idle");
  const [activeClient, setActiveClient] = useState<Client | null>(null);
  const [showRegistration, setShowRegistration] = useState(false);
  const [notice, setNotice] = useState<{ title: string; detail: string } | null>(null);
  const [registration, setRegistration] = useState({ name: "", day: "", month: "", phone: "" });
  const registrationRef = useRef<HTMLDivElement>(null);

  useEffect(() => window.localStorage.setItem(CLIENTS_KEY, JSON.stringify(clients)), [clients]);
  useEffect(() => window.localStorage.setItem(VISITS_KEY, JSON.stringify(visits)), [visits]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const todayVisits = useMemo(() => {
    const today = new Date().toDateString();
    return visits.filter((visit) => new Date(visit.checkedInAt).toDateString() === today);
  }, [visits]);

  const activity = useMemo(() => {
    const query = search.trim().toLowerCase();
    return [...visits]
      .sort((a, b) => +new Date(b.checkedInAt) - +new Date(a.checkedInAt))
      .map((visit) => ({ visit, client: clients.find((client) => client.id === visit.clientId) }))
      .filter(({ client }) => client && (!query || client.name.toLowerCase().includes(query) || client.phone.includes(query)))
      .slice(0, 8);
  }, [clients, visits, search]);

  const findClient = () => {
    const normalized = normalizePhone(phone);
    if (normalized.length < 7) {
      setLookupState("missing");
      setActiveClient(null);
      return;
    }
    const client = clients.find((item) => normalizePhone(item.phone) === normalized);
    if (client) {
      setActiveClient(client);
      setLookupState("found");
    } else {
      setActiveClient(null);
      setLookupState("missing");
    }
  };

  const checkIn = (client: Client) => {
    const visit: Visit = { id: crypto.randomUUID(), clientId: client.id, checkedInAt: new Date().toISOString() };
    setVisits((current) => [visit, ...current]);
    setNotice({ title: `${client.name} is checked in`, detail: "Their visit has been added to today’s register." });
    setPhone("");
    setLookupState("idle");
    setActiveClient(null);
  };

  const openRegistration = () => {
    setRegistration((current) => ({ ...current, phone: phone || current.phone }));
    setShowRegistration(true);
    window.setTimeout(() => registrationRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 30);
  };

  const registerClient = (event: React.FormEvent) => {
    event.preventDefault();
    const normalized = normalizePhone(registration.phone);
    if (!registration.name.trim() || !registration.day || !registration.month || normalized.length < 7) return;
    const existing = clients.find((client) => normalizePhone(client.phone) === normalized);
    const client = existing ?? {
      id: crypto.randomUUID(),
      name: registration.name.trim(),
      day: registration.day,
      month: registration.month,
      phone: registration.phone,
      createdAt: new Date().toISOString(),
    };
    if (!existing) setClients((current) => [client, ...current]);
    const visit: Visit = { id: crypto.randomUUID(), clientId: client.id, checkedInAt: new Date().toISOString() };
    setVisits((current) => [visit, ...current]);
    setNotice({ title: existing ? `${client.name} is checked in` : "New client registered", detail: "They have also been signed in for today." });
    setRegistration({ name: "", day: "", month: "", phone: "" });
    setShowRegistration(false);
  };

  return (
    <main className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark"><Sparkles size={18} strokeWidth={2.5} /></div>
          <div><div className="brand-name">guestflow</div><div className="brand-caption">your welcome desk, simplified</div></div>
        </div>
        <div className="topbar-meta"><span className="live-dot" /> <span>Front desk is open</span><span className="meta-divider" /> <span>{todayLabel}</span><Link className="client-link" href="/welcome">Client screen ↗</Link></div>
      </header>

      <section className="hero container">
        <div>
          <p className="eyebrow">DIGITAL REGISTRATION BOOK <span>•</span> TODAY</p>
          <h1>Good morning.<br /><em>Ready when they are.</em></h1>
          <p className="hero-copy">Check in a returning client in seconds, or add a new client to your register without the paper chase.</p>
        </div>
        <div className="stat-strip">
          <div className="stat-card"><span className="stat-icon mint"><Check size={17} /></span><div><strong>{todayVisits.length}</strong><span>checked in today</span></div></div>
          <div className="stat-card"><span className="stat-icon peach"><Users size={17} /></span><div><strong>{clients.length}</strong><span>registered clients</span></div></div>
        </div>
      </section>

      <section className="workspace container">
        <div className="primary-column">
          <div className="panel checkin-panel">
            <div className="panel-heading"><div><span className="section-kicker">RETURNING CLIENT</span><h2>Find their visit</h2></div><div className="step-badge">01 <span>/</span> 02</div></div>
            <p className="panel-description">Enter the phone number from their client record to sign them in.</p>
            <div className="phone-entry">
              <label htmlFor="phone">Phone number</label>
              <div className={`phone-input-wrap ${lookupState}`}><Search size={22} /><input id="phone" inputMode="tel" autoComplete="tel" placeholder="(555) 000-0000" value={phone} onChange={(event) => { setPhone(event.target.value); setLookupState("idle"); }} onKeyDown={(event) => event.key === "Enter" && findClient()} /><button className="clear-button" type="button" aria-label="Clear phone number" onClick={() => { setPhone(""); setLookupState("idle"); }}>{phone && <X size={18} />}</button></div>
              <button className="primary-button full" type="button" onClick={findClient}><span>Check phone number</span><ArrowRight size={18} /></button>
            </div>
            {lookupState === "found" && activeClient && <div className="result-card found-card"><div className="avatar avatar-coral">{activeClient.name.split(" ").map((word) => word[0]).join("").slice(0, 2)}</div><div className="result-copy"><span className="result-label"><span className="result-dot" /> Client found</span><strong>{activeClient.name}</strong><span>{formatPhone(activeClient.phone)} <span className="middot">•</span> {activeClient.day} {activeClient.month}</span></div><button className="checkin-button" type="button" onClick={() => checkIn(activeClient)}><Check size={17} /> Sign in</button></div>}
            {lookupState === "missing" && <div className="result-card missing-card"><div className="missing-icon"><UserPlus size={19} /></div><div className="result-copy"><span className="result-label warm">No record yet</span><strong>Let’s add them to the book.</strong><span>You can register their name, birthday and phone.</span></div><button className="text-button" type="button" onClick={openRegistration}>Register <ArrowRight size={16} /></button></div>}
          </div>

          <div className="tip-card"><div className="tip-icon"><ShieldCheck size={19} /></div><div><strong>Privacy, by default</strong><p>Only the details needed for a quick welcome are collected. Birth year is intentionally left out.</p></div></div>
        </div>

        <div className="secondary-column" ref={registrationRef}>
          <div className={`panel registration-panel ${showRegistration ? "is-open" : ""}`}>
            <div className="panel-heading"><div><span className="section-kicker coral">NEW CLIENT</span><h2>Start a new record</h2></div><div className="step-badge coral-badge">02 <span>/</span> 02</div></div>
            <p className="panel-description">A few details now makes every next visit feel effortless.</p>
            <form onSubmit={registerClient} className="registration-form">
              <div className="field full-field"><label htmlFor="name">Full name</label><input id="name" placeholder="e.g. Jordan Lee" value={registration.name} onChange={(event) => setRegistration({ ...registration, name: event.target.value })} required /></div>
              <div className="field-group"><div className="field"><label htmlFor="day">Birthday · day</label><div className="select-wrap"><select id="day" value={registration.day} onChange={(event) => setRegistration({ ...registration, day: event.target.value })} required><option value="">Day</option>{Array.from({ length: 31 }, (_, index) => <option key={index + 1} value={String(index + 1)}>{index + 1}</option>)}</select><ChevronDown size={17} /></div></div><div className="field"><label htmlFor="month">Month</label><div className="select-wrap"><select id="month" value={registration.month} onChange={(event) => setRegistration({ ...registration, month: event.target.value })} required><option value="">Month</option>{monthOptions.map((month) => <option key={month} value={month}>{month}</option>)}</select><ChevronDown size={17} /></div></div></div>
              <div className="field full-field"><label htmlFor="new-phone">Phone number</label><input id="new-phone" inputMode="tel" placeholder="(555) 000-0000" value={registration.phone} onChange={(event) => setRegistration({ ...registration, phone: event.target.value })} required /></div>
              <button className="primary-button coral-button full" type="submit"><UserPlus size={18} /><span>Register & sign in</span><ArrowRight size={18} /></button>
              <p className="form-note">By continuing, you confirm this client has agreed to be added to the register.</p>
            </form>
          </div>
        </div>
      </section>

      <section className="activity-section container"><div className="activity-heading"><div><span className="section-kicker">LIVE REGISTER</span><h2>Today’s activity <span className="activity-count">{todayVisits.length}</span></h2></div><div className="activity-search"><Search size={17} /><input placeholder="Search by name or phone" value={search} onChange={(event) => setSearch(event.target.value)} /></div></div><div className="activity-list">{activity.length > 0 ? activity.map(({ visit, client }) => client && <div className="activity-row" key={visit.id}><div className="avatar avatar-lilac">{client.name.split(" ").map((word) => word[0]).join("").slice(0, 2)}</div><div className="activity-person"><strong>{client.name}</strong><span>{formatPhone(client.phone)}</span></div><div className="activity-birthday"><span>Birthday</span><strong>{client.day} {client.month}</strong></div><div className="activity-time"><Clock3 size={16} /> {formatTime(visit.checkedInAt)}</div><span className="signed-pill"><Check size={13} /> Signed in</span></div>) : <div className="empty-activity"><div className="empty-icon"><Clock3 size={20} /></div><div><strong>No visits recorded yet today</strong><span>Check in your first client above and their visit will appear here.</span></div></div>}</div></section>

      <footer className="footer container"><span>guestflow <i>•</i> a calmer way to welcome people</span><span>Tablet mode <span className="toggle-on"><span /></span></span></footer>
      {notice && <div className="toast"><div className="toast-check"><Check size={17} /></div><div><strong>{notice.title}</strong><span>{notice.detail}</span></div><button type="button" aria-label="Dismiss notification" onClick={() => setNotice(null)}><X size={16} /></button></div>}
    </main>
  );
}

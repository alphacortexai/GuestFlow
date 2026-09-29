import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePageVisibility } from "@/hooks/usePageVisibility";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Copy,
  Clock3,
  LogOut,
  Search,
  Sparkles,
  UserPlus,
  X,
} from "lucide-react";
import { Link } from "wouter";
import { checkIn as apiCheckIn, checkOut as apiCheckOut, createClient as apiCreateClient, getBranches, getSummary, SpaGymApiError, SpaGymBranch, SpaGymVisit, lookupClient as apiLookupClient } from "@/lib/spaGymApi";

type Client = {
  id: string;
  name: string;
  day: string;
  month: string;
  phone: string;
  createdAt: string;
  birthDay?: number | null;
  birthMonth?: number | null;
};

type Visit = SpaGymVisit;

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

const normalizePhone = (phone: string) => {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) return digits.slice(2);
  if (digits.startsWith("0")) return `256${digits.slice(1)}`;
  return digits;
};
const isValidPhone = (phone: string) => /^256\d{9}$/.test(normalizePhone(phone));
const formatPhone = (phone: string) => {
  const digits = normalizePhone(phone);
  if (digits.length === 12 && digits.startsWith("256")) return `+256 ${digits.slice(3, 6)} ${digits.slice(6, 9)} ${digits.slice(9)}`;
  return phone;
};
const formatTime = (iso: string) =>
  new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(new Date(iso));
const isSameDay = (first: Date, second = new Date()) => first.toDateString() === second.toDateString();
const isCheckedOut = (visit: Visit) => Boolean(visit.checkedOutAt);
const todayLabel = new Intl.DateTimeFormat("en", {
  weekday: "long",
  month: "long",
  day: "numeric",
}).format(new Date());

type HomeProps = { onLogout: () => void };

export default function Home({ onLogout }: HomeProps) {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [visitCount, setVisitCount] = useState(0);
  const [branches, setBranches] = useState<SpaGymBranch[]>([]);
  const [branchId, setBranchId] = useState(() => new URLSearchParams(window.location.search).get("branchId") || "");
  const [branchError, setBranchError] = useState("");
  const [integrationError, setIntegrationError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [search, setSearch] = useState("");
  const [lookupState, setLookupState] = useState<"idle" | "found" | "missing">("idle");
  const [activeClient, setActiveClient] = useState<Client | null>(null);
  const [showRegistration, setShowRegistration] = useState(false);
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<"today" | "returning" | "branches" | "client">("today");
  const [notice, setNotice] = useState<{ title: string; detail: string } | null>(null);
  const activeBranchName = branches.find((branch) => branch.id === branchId)?.name || "All branches";

  const isVisible = usePageVisibility();

  const [registration, setRegistration] = useState({ name: "", day: "", month: "", phone: "" });
  const [registrationPhoneError, setRegistrationPhoneError] = useState("");
  const registrationRef = useRef<HTMLDivElement>(null);

  const refreshDashboard = useCallback(async () => {
    try {
      const summary = await getSummary(branchId || undefined, true);
      setVisitCount(summary.visitCount);
      setVisits(summary.visits || []);
      setIntegrationError("");
    } catch (error) {
      setIntegrationError(error instanceof Error ? error.message : "Unable to reach SpaGym.");
    }
  }, [branchId]);

  useEffect(() => {
    getBranches(true)
      .then((items) => {
        setBranches(items);
        setBranchError("");
        setBranchId((current) => current && items.some((branch) => branch.id === current) ? current : items.length === 1 ? items[0].id : "");
      })
      .catch((error) => setBranchError(error instanceof Error ? error.message : "Could not load SpaGym branches."));
  }, []);

  useEffect(() => {
    refreshDashboard();
    const interval = window.setInterval(() => {
      if (!isVisible) return;
      refreshDashboard();
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [refreshDashboard, isVisible]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const activity = useMemo(() => {
    const query = search.trim().toLowerCase();
    return [...visits]
      .sort((a, b) => +new Date(b.checkedInAt) - +new Date(a.checkedInAt))
      .map((visit) => ({ visit, client: visit }))
      .filter(({ client }) => !query || client.clientName.toLowerCase().includes(query) || client.phoneNumber.includes(query))
      .slice(0, 8);
  }, [visits, search]);

  const branchWelcomeUrl = (selectedId: string) => {
    const url = new URL("/welcome", window.location.origin);
    url.searchParams.set("branchId", selectedId);
    return url.toString();
  };
  const copyBranchLink = async (branch: SpaGymBranch) => {
    try {
      await navigator.clipboard.writeText(branchWelcomeUrl(branch.id));
      setNotice({ title: `${branch.name} link copied`, detail: "Share this link with clients for this branch." });
    } catch {
      setNotice({ title: "Could not copy link", detail: branchWelcomeUrl(branch.id) });
    }
  };

  const findClient = async () => {
    if (!isValidPhone(phone)) {
      setPhoneError("Enter a valid number, e.g. +256 7XX XXX XXX.");
      setLookupState("idle");
      setActiveClient(null);
      return;
    }
    setPhoneError("");
    setIsSubmitting(true);
    try {
      const result = await apiLookupClient(phone, true);
      setActiveClient({
        id: result.id,
        name: result.name,
        phone: result.phoneNumber || result.phone,
        day: result.day,
        month: result.month,
        birthDay: result.birthDay,
        birthMonth: result.birthMonth,
        createdAt: result.createdAt || "",
      });
      setLookupState("found");
    } catch (error) {
      if (error instanceof SpaGymApiError && error.status === 404) {
        setActiveClient(null);
        setLookupState("missing");
      } else {
        setNotice({ title: "SpaGym is unavailable", detail: error instanceof Error ? error.message : "Please try again." });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const checkIn = async (client: Client) => {
    setIsSubmitting(true);
    try {
      const result = await apiCheckIn(client.phone, client.id, true);
      setNotice(result.alreadyCheckedIn
        ? { title: `${client.name} is already checked in`, detail: "This client already has a visit recorded for today." }
        : { title: `${client.name} is checked in`, detail: "Their visit has been added to SpaGym’s shared register." });
      await refreshDashboard();
      setPhone("");
      setLookupState("idle");
      setActiveClient(null);
    } catch (error) {
      setNotice({ title: "Check-in failed", detail: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const checkOut = async (visit: Visit, clientName: string) => {
    if (isCheckedOut(visit)) return;
    try {
      await apiCheckOut(visit.id, true);
      await refreshDashboard();
      setNotice({ title: `${clientName} is checked out`, detail: "Their departure has been saved to SpaGym’s shared register." });
    } catch (error) {
      setNotice({ title: "Check-out failed", detail: error instanceof Error ? error.message : "Please try again." });
    }
  };

  const openRegistration = () => {
    setRegistration((current) => ({ ...current, phone: phone || current.phone }));
    setShowRegistration(true);
    setActiveWorkspaceTab("client");
    window.setTimeout(() => registrationRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 30);
  };

  const registerClient = async (event: React.FormEvent) => {
    event.preventDefault();
    if (branches.length > 1 && !branchId) {
      setNotice({ title: "Choose a branch first", detail: "Select the correct branch above so the client is saved in the right SpaGym branch." });
      return;
    }
    if (!isValidPhone(registration.phone)) {
      setRegistrationPhoneError("Enter a valid number, e.g. +256 7XX XXX XXX.");
      return;
    }
    setRegistrationPhoneError("");
    if (!registration.name.trim() || !registration.day || !registration.month) return;
    setIsSubmitting(true);
    let savedClientName = "";
    try {
      const result = await apiCreateClient({ name: registration.name.trim(), phone: registration.phone, day: registration.day, month: registration.month, branchId: branchId || undefined }, true);
      savedClientName = result.client.name;
      const signIn = await apiCheckIn(registration.phone, result.client.id, true);
      await refreshDashboard();
      setNotice(signIn.alreadyCheckedIn
        ? { title: `${result.client.name} is already checked in`, detail: "This client already has a visit recorded for today." }
        : result.created
          ? { title: "New client registered", detail: `The profile and visit are saved in SpaGym under ${branchId ? activeBranchName : "the default branch"}.` }
          : { title: `${result.client.name} already exists`, detail: `No duplicate profile was created. Their profile and visit remain under ${result.client.branch || "an unassigned branch"}.` });
      setRegistration({ name: "", day: "", month: "", phone: "" });
      setShowRegistration(false);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Please try again.";
      setNotice(savedClientName
        ? { title: `${savedClientName} was saved`, detail: `The SpaGym profile exists, but today's check-in did not finish: ${detail}` }
        : { title: "Registration failed", detail });
    } finally {
      setIsSubmitting(false);
    }
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
        <div className="topbar-meta"><span className="live-dot" /> <span>Front desk is open</span><span className="meta-divider" /> <span>{todayLabel}</span><Link className="client-link" href={branchId ? `/welcome?branchId=${encodeURIComponent(branchId)}` : "/welcome"}>Client screen ↗</Link><button className="logout-button" type="button" onClick={onLogout}><LogOut size={14} /> Log out</button></div>
      </header>

      <nav className="workspace-tabs container" aria-label="GuestFlow workspace sections">
        <button type="button" className={activeWorkspaceTab === "today" ? "is-active" : ""} onClick={() => setActiveWorkspaceTab("today")} aria-selected={activeWorkspaceTab === "today"}>Today's activity</button>
        <button type="button" className={activeWorkspaceTab === "returning" ? "is-active" : ""} onClick={() => setActiveWorkspaceTab("returning")} aria-selected={activeWorkspaceTab === "returning"}>Returning client</button>
        <button type="button" className={activeWorkspaceTab === "branches" ? "is-active" : ""} onClick={() => setActiveWorkspaceTab("branches")} aria-selected={activeWorkspaceTab === "branches"}>Branch management</button>
        <button type="button" className={activeWorkspaceTab === "client" ? "is-active" : ""} onClick={() => { setActiveWorkspaceTab("client"); setShowRegistration(true); }}>Client registration</button>
      </nav>

      {integrationError && <div role="alert" className="container mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">SpaGym is not connected: {integrationError}. Client and visit data are not being stored on this device.</div>}

      {activeWorkspaceTab === "branches" && <section className="branch-admin container" aria-labelledby="branch-admin-title">
        <div className="branch-admin-heading">
          <div><span className="section-kicker">BRANCH MANAGEMENT</span><h2 id="branch-admin-title">Branch links &amp; register</h2><p>Choose a branch to filter today’s activity and create branch-specific client check-in links.</p></div>
          <label className="branch-filter"><span>View branch</span><select value={branchId} onChange={(event) => setBranchId(event.target.value)}><option value="">All branches</option>{branches.map((branch) => <option value={branch.id} key={branch.id}>{branch.name}</option>)}</select></label>
        </div>
        {branchError ? <div className="branch-error" role="alert">Could not load branch links from SpaGym. Deploy the updated SpaGym integration API and check the GuestFlow connection. ({branchError})</div> : branches.length === 0 ? <div className="branch-empty">No SpaGym branches were returned. Add branches in SpaGym, then refresh this page.</div> : <div className="branch-link-grid">{branches.map((branch) => <article className={`branch-link-card ${branch.id === branchId ? "is-selected" : ""}`} key={branch.id}><div><span className="branch-link-label">CLIENT CHECK-IN</span><h3>{branch.name}</h3><a href={branchWelcomeUrl(branch.id)} target="_blank" rel="noreferrer">Open kiosk screen <ArrowRight size={14} /></a></div><button type="button" onClick={() => copyBranchLink(branch)} aria-label={`Copy ${branch.name} client link`}><Copy size={15} /><span>Copy link</span></button></article>)}</div>}
        <p className="branch-filter-note">Showing: <strong>{activeBranchName}</strong>. New client records and visits created from a branch link are tagged to that branch.</p>
      </section>}

      <section className="workspace container">
        <div className="primary-column">
          <div className={`panel checkin-panel ${activeWorkspaceTab === "returning" ? "is-visible" : "is-hidden"}`}>
            <div className="panel-heading"><div><span className="section-kicker">RETURNING CLIENT</span><h2>Find their visit</h2></div><div className="step-badge">01 <span>/</span> 02</div></div>
            <p className="panel-description">Enter the phone number from their client record to sign them in.</p>
            <div className="phone-entry">
              <label htmlFor="phone">Phone number</label>
              <div className={`phone-input-wrap ${lookupState} ${phoneError ? "has-error" : ""}`}><Search size={22} /><input id="phone" type="tel" inputMode="tel" autoComplete="tel" pattern="(?:\+?256|0)[0-9\s()-]{9,14}" aria-invalid={Boolean(phoneError)} aria-describedby={phoneError ? "phone-error" : undefined} placeholder="+256 7XX XXX XXX" value={phone} onChange={(event) => { setPhone(event.target.value); setPhoneError(""); setLookupState("idle"); }} onKeyDown={(event) => event.key === "Enter" && findClient()} /><button className="clear-button" type="button" aria-label="Clear phone number" onClick={() => { setPhone(""); setPhoneError(""); setLookupState("idle"); }}>{phone && <X size={18} />}</button></div>
              {phoneError && <p id="phone-error" className="phone-error" role="alert">{phoneError}</p>}
              <button className="primary-button full" type="button" onClick={findClient} disabled={isSubmitting}><span>{isSubmitting ? "Checking…" : "Check phone number"}</span><ArrowRight size={18} /></button>
            </div>
            {lookupState === "found" && activeClient && <div className="result-card found-card"><div className="avatar avatar-coral">{activeClient.name.split(" ").map((word) => word[0]).join("").slice(0, 2)}</div><div className="result-copy"><span className="result-label"><span className="result-dot" /> Client found</span><strong>{activeClient.name}</strong><span>{formatPhone(activeClient.phone)} <span className="middot">•</span> {activeClient.day} {activeClient.month}</span></div><button className="checkin-button" type="button" onClick={() => checkIn(activeClient)} disabled={isSubmitting}><Check size={17} /> {isSubmitting ? "Saving…" : "Sign in"}</button></div>}
            {lookupState === "missing" && <div className="result-card missing-card"><div className="missing-icon"><UserPlus size={19} /></div><div className="result-copy"><strong>Phone No. Not Found</strong><span>Register &amp; Check In Now in 10 Secs</span></div><button className="text-button" type="button" onClick={openRegistration}>Register <ArrowRight size={16} /></button></div>}
          </div>

        </div>

        <div className="secondary-column" ref={registrationRef}>
          <div className={`panel registration-panel ${showRegistration && activeWorkspaceTab === "client" ? "is-open" : ""}`}>
            <div className="panel-heading"><div><span className="section-kicker coral">NEW CLIENT</span><h2>Start a new record</h2></div><div className="step-badge coral-badge">02 <span>/</span> 02</div></div>
            <p className="panel-description">A few details now makes every next visit feel effortless. {branchId ? `This record will be assigned to ${activeBranchName}.` : branches.length > 1 ? "Select a branch above before registering a new client." : ""}</p>
            <form onSubmit={registerClient} className="registration-form">
              <div className="field full-field"><label htmlFor="name">Full name</label><input id="name" placeholder="e.g. Jordan Lee" value={registration.name} onChange={(event) => setRegistration({ ...registration, name: event.target.value })} required /></div>
              <div className="field-group"><div className="field"><label htmlFor="day">Birthday · day</label><div className="select-wrap"><select id="day" value={registration.day} onChange={(event) => setRegistration({ ...registration, day: event.target.value })} required><option value="">Day</option>{Array.from({ length: 31 }, (_, index) => <option key={index + 1} value={String(index + 1)}>{index + 1}</option>)}</select><ChevronDown size={17} /></div></div><div className="field"><label htmlFor="month">Month</label><div className="select-wrap"><select id="month" value={registration.month} onChange={(event) => setRegistration({ ...registration, month: event.target.value })} required><option value="">Month</option>{monthOptions.map((month) => <option key={month} value={month}>{month}</option>)}</select><ChevronDown size={17} /></div></div></div>
              <div className="field full-field"><label htmlFor="new-phone">Phone number</label><input id="new-phone" type="tel" inputMode="tel" pattern="(?:\+?256|0)[0-9\s()-]{9,14}" aria-invalid={Boolean(registrationPhoneError)} aria-describedby={registrationPhoneError ? "new-phone-error" : undefined} placeholder="+256 7XX XXX XXX" value={registration.phone} onChange={(event) => { setRegistration({ ...registration, phone: event.target.value }); setRegistrationPhoneError(""); }} required />{registrationPhoneError && <p id="new-phone-error" className="phone-error" role="alert">{registrationPhoneError}</p>}</div>
              <button className="primary-button coral-button full" type="submit" disabled={isSubmitting}><UserPlus size={18} /><span>{isSubmitting ? "Saving…" : "Register & sign in"}</span><ArrowRight size={18} /></button>
              <p className="form-note">By continuing, you confirm this client has agreed to be added to the register.</p>
            </form>
          </div>
        </div>
      </section>

      {activeWorkspaceTab === "today" && <section className="activity-section container"><div className="activity-heading"><div><span className="section-kicker">LIVE REGISTER</span><h2>Today’s activity <span className="activity-count">{visitCount}</span></h2><p className="register-hint">Visits check out when staff records it or after 12 hours; clients can then sign in again.</p></div><div className="activity-search"><Search size={17} /><input placeholder="Search name or phone" value={search} onChange={(event) => setSearch(event.target.value)} /></div></div><div className="activity-list">{activity.length > 0 ? activity.map(({ visit }) => { const newToday = isSameDay(new Date(visit.clientCreatedAt || visit.checkedInAt)); const checkedOut = isCheckedOut(visit); return <div className={`activity-row ${checkedOut ? "checked-out-row" : ""}`} key={visit.id}><div className="avatar avatar-lilac">{visit.clientName.split(" ").map((word) => word[0]).join("").slice(0, 2)}</div><div className="activity-person"><strong>{visit.clientName}</strong><span>{formatPhone(visit.phoneNumber)}</span></div><div className="activity-birthday"><span>Birthday</span><strong>{visit.birthDay} {monthOptions[(visit.birthMonth || 1) - 1]}</strong></div><div className="activity-time"><Clock3 size={16} /> {formatTime(visit.checkedInAt)}</div><span className={`signed-pill ${newToday ? "new-today-pill" : ""} ${checkedOut ? "checked-out-pill" : ""}`}><Check size={13} /> {checkedOut ? "Checked out" : newToday ? "New today" : "Returning"}</span>{!checkedOut && <button className="checkout-button" type="button" onClick={() => checkOut(visit, visit.clientName)}><LogOut size={14} /> Check out</button>}</div>; }) : <div className="empty-activity"><div className="empty-icon"><Clock3 size={20} /></div><div><strong>{integrationError ? "SpaGym register is unavailable" : "No visits recorded yet today"}</strong><span>{integrationError ? "Reconnect to SpaGym to view the shared activity register." : "Check in your first client above and their visit will appear here."}</span></div></div>}</div></section>}

      <footer className="footer container"><span>guestflow <i>•</i> a calmer way to welcome people</span><span>Tablet mode <span className="toggle-on"><span /></span></span></footer>
      {notice && <div className="toast"><div className="toast-check"><Check size={17} /></div><div><strong>{notice.title}</strong><span>{notice.detail}</span></div><button type="button" aria-label="Dismiss notification" onClick={() => setNotice(null)}><X size={16} /></button></div>}
    </main>
  );
}

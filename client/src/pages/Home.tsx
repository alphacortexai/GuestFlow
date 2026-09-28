import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Building2,
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
const formatPhone = (phone: string) => {
  const digits = normalizePhone(phone);
  if (digits.length === 12 && digits.startsWith("256")) return `+256 ${digits.slice(3, 6)} ${digits.slice(6, 9)} ${digits.slice(9)}`;
  return phone;
};
const formatTime = (iso: string) =>
  new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(new Date(iso));
const isSameDay = (first: Date, second = new Date()) => first.toDateString() === second.toDateString();
const isCheckedOut = (visit: Visit) => Boolean(visit.checkedOutAt);
const getTimeGreeting = (date = new Date()) => {
  const hour = date.getHours();
  if (hour < 12) return "Good morning.";
  if (hour < 18) return "Good afternoon.";
  return "Good evening.";
};
const todayLabel = new Intl.DateTimeFormat("en", {
  weekday: "long",
  month: "long",
  day: "numeric",
}).format(new Date());

export default function Home() {
  const [timeGreeting, setTimeGreeting] = useState(() => getTimeGreeting());
  const [visits, setVisits] = useState<Visit[]>([]);
  const [clientCount, setClientCount] = useState<number | null>(null);
  const [visitCount, setVisitCount] = useState(0);
  const [branches, setBranches] = useState<SpaGymBranch[]>([]);
  const [branchId, setBranchId] = useState(() => new URLSearchParams(window.location.search).get("branchId") || "");
  const [branchError, setBranchError] = useState("");
  const [integrationError, setIntegrationError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [phone, setPhone] = useState("");
  const [search, setSearch] = useState("");
  const [lookupState, setLookupState] = useState<"idle" | "found" | "missing">("idle");
  const [activeClient, setActiveClient] = useState<Client | null>(null);
  const [activeAdminTab, setActiveAdminTab] = useState<"today" | "branches" | "registration">("today");
  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [notice, setNotice] = useState<{ title: string; detail: string } | null>(null);
  const activeBranchName = branches.find((branch) => branch.id === branchId)?.name || "All branches";

  useEffect(() => {
    const refreshGreeting = () => setTimeGreeting(getTimeGreeting());
    const interval = window.setInterval(refreshGreeting, 60_000);
    return () => window.clearInterval(interval);
  }, []);
  const [registration, setRegistration] = useState({ name: "", day: "", month: "", phone: "" });
  const refreshDashboard = useCallback(async () => {
    try {
      const summary = await getSummary(branchId || undefined);
      const clients = Number(summary.clientCount);
      setClientCount(Number.isFinite(clients) ? clients : null);
      setVisitCount(Number(summary.visitCount) || 0);
      setVisits(summary.visits || []);
      setIntegrationError("");
    } catch (error) {
      setIntegrationError(error instanceof Error ? error.message : "Unable to reach SpaGym.");
    }
  }, [branchId]);

  useEffect(() => {
    getBranches()
      .then((response) => {
        const items = Array.isArray(response) ? response : [];
        setBranches(items);
        setBranchError(Array.isArray(response) ? "" : "SpaGym returned an invalid branch list.");
        setBranchId((current) => current && items.some((branch) => branch.id === current) ? current : items.length === 1 ? items[0].id : "");
      })
      .catch((error) => setBranchError(error instanceof Error ? error.message : "Could not load SpaGym branches."));
  }, []);

  useEffect(() => {
    refreshDashboard();
    const interval = window.setInterval(refreshDashboard, 30_000);
    return () => window.clearInterval(interval);
  }, [refreshDashboard]);
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
    const normalized = normalizePhone(phone);
    if (normalized.length < 7) {
      setLookupState("missing");
      setActiveClient(null);
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await apiLookupClient(phone);
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
      const result = await apiCheckIn(client.phone, client.id);
      setNotice(result.alreadyCheckedIn
        ? { title: `${client.name} is already checked in`, detail: "This client already has a visit recorded for today." }
        : { title: `${client.name} is checked in`, detail: "Their visit has been added to SpaGym’s shared register." });
      await refreshDashboard();
      setPhone("");
      setLookupState("idle");
      setActiveClient(null);
      setShowCheckInModal(false);
    } catch (error) {
      setNotice({ title: "Check-in failed", detail: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const checkOut = async (visit: Visit, clientName: string) => {
    if (isCheckedOut(visit)) return;
    try {
      await apiCheckOut(visit.id);
      await refreshDashboard();
      setNotice({ title: `${clientName} is checked out`, detail: "Their departure has been saved to SpaGym’s shared register." });
    } catch (error) {
      setNotice({ title: "Check-out failed", detail: error instanceof Error ? error.message : "Please try again." });
    }
  };

  const openRegistration = () => {
    setRegistration((current) => ({ ...current, phone: phone || current.phone }));
    setShowCheckInModal(false);
    setActiveAdminTab("registration");
  };

  const registerClient = async (event: React.FormEvent) => {
    event.preventDefault();
    if (branches.length > 1 && !branchId) {
      setNotice({ title: "Choose a branch first", detail: "Select the correct branch above so the client is saved in the right SpaGym branch." });
      return;
    }
    const normalized = normalizePhone(registration.phone);
    if (!registration.name.trim() || !registration.day || !registration.month || normalized.length < 7) return;
    setIsSubmitting(true);
    let savedClientName = "";
    try {
      const result = await apiCreateClient({ name: registration.name.trim(), phone: registration.phone, day: registration.day, month: registration.month, branchId: branchId || undefined });
      savedClientName = result.client.name;
      const signIn = await apiCheckIn(registration.phone, result.client.id);
      await refreshDashboard();
      setNotice(signIn.alreadyCheckedIn
        ? { title: `${result.client.name} is already checked in`, detail: "This client already has a visit recorded for today." }
        : result.created
          ? { title: "New client registered", detail: `The profile and visit are saved in SpaGym under ${branchId ? activeBranchName : "the default branch"}.` }
          : { title: `${result.client.name} already exists`, detail: `No duplicate profile was created. Their profile and visit remain under ${result.client.branch || "an unassigned branch"}.` });
      setRegistration({ name: "", day: "", month: "", phone: "" });
      setActiveAdminTab("today");
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
        <div className="topbar-meta"><span className="live-dot" /> <span>Front desk is open</span><span className="meta-divider" /> <span>{todayLabel}</span><Link className="client-link" href={branchId ? `/welcome?branchId=${encodeURIComponent(branchId)}` : "/welcome"}>Client screen ↗</Link></div>
      </header>

      {integrationError && <div role="alert" className="container mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">SpaGym is not connected: {integrationError}. Client and visit data are not being stored on this device.</div>}

      <section className="hero container">
        <div className="hero-welcome">
          <p className="eyebrow">DIGITAL REGISTRATION BOOK <span>•</span> TODAY</p>
          <h1>{timeGreeting}<br /><em>Ready when they are.</em></h1>
          <p className="hero-copy">Your welcome desk is ready. Keep today’s check-ins in view, and open the tools only when you need them.</p>
        </div>
        <div className="hero-today-card"><span className="hero-date-label">TODAY</span><strong>{todayLabel}</strong><span className="hero-visit-count"><span className="live-dot" /> {visitCount} {visitCount === 1 ? "visit" : "visits"}</span></div>
      </section>

      <nav className="admin-tabs container" role="tablist" aria-label="GuestFlow admin sections">
        <button id="tab-today" className={`admin-tab ${activeAdminTab === "today" ? "is-active" : ""}`} type="button" role="tab" aria-selected={activeAdminTab === "today"} aria-controls="panel-today" onClick={() => setActiveAdminTab("today")}><Clock3 size={17} /><span>Today</span><span className="admin-tab-count">{visitCount}</span></button>
        <button id="tab-branches" className={`admin-tab ${activeAdminTab === "branches" ? "is-active" : ""}`} type="button" role="tab" aria-selected={activeAdminTab === "branches"} aria-controls="panel-branches" onClick={() => setActiveAdminTab("branches")}><Building2 size={17} /><span>Branch management</span></button>
        <button id="tab-registration" className={`admin-tab ${activeAdminTab === "registration" ? "is-active" : ""}`} type="button" role="tab" aria-selected={activeAdminTab === "registration"} aria-controls="panel-registration" onClick={() => setActiveAdminTab("registration")}><UserPlus size={17} /><span>Client registration</span></button>
      </nav>

      {activeAdminTab === "branches" && <section className="branch-admin container" id="panel-branches" role="tabpanel" aria-labelledby="tab-branches">
        <div className="branch-admin-heading">
          <div><span className="section-kicker">BRANCH MANAGEMENT</span><h2>Branch links &amp; register</h2><p>Choose a branch to see its client and visit totals, then copy its new-client check-in link.</p></div>
          <label className="branch-filter"><span>View activity for</span><select value={branchId} onChange={(event) => setBranchId(event.target.value)}><option value="">All branches</option>{branches.map((branch) => <option value={branch.id} key={branch.id}>{branch.name}</option>)}</select></label>
        </div>
        <div className="branch-stats"><article><span>CLIENTS · {activeBranchName.toUpperCase()}</span><strong>{clientCount ?? "—"}</strong></article><article><span>VISITS TODAY · {activeBranchName.toUpperCase()}</span><strong>{visitCount}</strong></article></div>
        {branchError ? <div className="branch-error" role="alert">Could not load branch links from SpaGym. Check the GuestFlow connection. ({branchError})</div> : branches.length === 0 ? <div className="branch-empty">No SpaGym branches were returned. Add branches in SpaGym, then refresh this page.</div> : <div className="branch-link-grid">{branches.map((branch) => <article className={`branch-link-card ${branch.id === branchId ? "is-selected" : ""}`} key={branch.id}><div><span className="branch-link-label">NEW CLIENT LINK</span><h3>{branch.name}</h3><a href={branchWelcomeUrl(branch.id)} target="_blank" rel="noreferrer">Open kiosk screen <ArrowRight size={14} /></a></div><button type="button" onClick={() => copyBranchLink(branch)} aria-label={`Copy ${branch.name} client link`}><Copy size={15} /><span>Copy link</span></button></article>)}</div>}
        <p className="branch-filter-note">Activity filter: <strong>{activeBranchName}</strong>. A branch link assigns this branch only to new client profiles; existing client check-ins keep their saved branch.</p>
      </section>}

      {activeAdminTab === "registration" && <section className="registration-view container" id="panel-registration" role="tabpanel" aria-labelledby="tab-registration">
        <div className="registration-view-intro"><span className="section-kicker coral">CLIENT REGISTRATION</span><h2>Add a client</h2><p>Create a new profile in SpaGym and check them in to their saved branch.</p></div>
        <div className="panel registration-panel is-open">
          <div className="panel-heading"><div><span className="section-kicker coral">NEW CLIENT</span><h2>Client details</h2></div><div className="step-badge coral-badge">NEW <span>•</span> PROFILE</div></div>
          <p className="panel-description">A few details now make every next visit effortless. {branchId ? `This new record will be assigned to ${activeBranchName}.` : branches.length > 1 ? "Select the branch for this new client below." : ""}</p>
          {branches.length > 1 && <label className="registration-branch-select"><span>Assign new client to</span><select value={branchId} onChange={(event) => setBranchId(event.target.value)} required><option value="">Choose a branch</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>}
          <form onSubmit={registerClient} className="registration-form">
            <div className="field full-field"><label htmlFor="name">Full name</label><input id="name" placeholder="e.g. Jordan Lee" value={registration.name} onChange={(event) => setRegistration({ ...registration, name: event.target.value })} required /></div>
            <div className="field-group"><div className="field"><label htmlFor="day">Birthday · day</label><div className="select-wrap"><select id="day" value={registration.day} onChange={(event) => setRegistration({ ...registration, day: event.target.value })} required><option value="">Day</option>{Array.from({ length: 31 }, (_, index) => <option key={index + 1} value={String(index + 1)}>{index + 1}</option>)}</select><ChevronDown size={17} /></div></div><div className="field"><label htmlFor="month">Month</label><div className="select-wrap"><select id="month" value={registration.month} onChange={(event) => setRegistration({ ...registration, month: event.target.value })} required><option value="">Month</option>{monthOptions.map((month) => <option key={month} value={month}>{month}</option>)}</select><ChevronDown size={17} /></div></div></div>
            <div className="field full-field"><label htmlFor="new-phone">Phone number</label><input id="new-phone" inputMode="tel" placeholder="+256 7XX XXX XXX" value={registration.phone} onChange={(event) => setRegistration({ ...registration, phone: event.target.value })} required /></div>
            <button className="primary-button coral-button full" type="submit" disabled={isSubmitting || (branches.length > 1 && !branchId)}><UserPlus size={18} /><span>{isSubmitting ? "Saving…" : "Register & sign in"}</span><ArrowRight size={18} /></button>
            <p className="form-note">By continuing, you confirm this client has agreed to be added to the register.</p>
          </form>
        </div>
      </section>}

      {activeAdminTab === "today" && <section className="activity-section container" id="panel-today" role="tabpanel" aria-labelledby="tab-today">
        <div className="activity-heading">
          <div><span className="section-kicker">LIVE REGISTER · {activeBranchName.toUpperCase()}</span><h2>Today’s activity <span className="activity-count">{visitCount}</span></h2><p className="register-hint">Visits check out when staff records it or after 12 hours.</p></div>
          <div className="activity-controls"><label className="activity-search"><Search size={17} /><input aria-label="Search today's activity" placeholder="Search name or phone" value={search} onChange={(event) => setSearch(event.target.value)} /></label><button className="activity-action" type="button" onClick={() => setShowCheckInModal(true)}><Search size={16} /><span>Check in returning client</span></button><button className="activity-action activity-action-primary" type="button" onClick={() => setActiveAdminTab("registration")}><UserPlus size={16} /><span>New client</span></button></div>
        </div>
        <div className="activity-list">{activity.length > 0 ? activity.map(({ visit }) => { const newToday = isSameDay(new Date(visit.clientCreatedAt || visit.checkedInAt)); const checkedOut = isCheckedOut(visit); return <div className={`activity-row ${checkedOut ? "checked-out-row" : ""}`} key={visit.id}><div className="avatar avatar-lilac">{visit.clientName.split(" ").map((word) => word[0]).join("").slice(0, 2)}</div><div className="activity-person"><strong>{visit.clientName}</strong><span>{formatPhone(visit.phoneNumber)}</span></div><div className="activity-birthday"><span>Birthday</span><strong>{visit.birthDay} {monthOptions[(visit.birthMonth || 1) - 1]}</strong></div><div className="activity-time"><Clock3 size={16} /> {formatTime(visit.checkedInAt)}</div><span className={`signed-pill ${newToday ? "new-today-pill" : ""} ${checkedOut ? "checked-out-pill" : ""}`}><Check size={13} /> {checkedOut ? "Checked out" : newToday ? "New today" : "Returning"}</span>{!checkedOut && <button className="checkout-button" type="button" onClick={() => checkOut(visit, visit.clientName)}><LogOut size={14} /> Check out</button>}</div>; }) : <div className="empty-activity"><div className="empty-icon"><Clock3 size={20} /></div><div><strong>{integrationError ? "SpaGym register is unavailable" : search ? "No matching visits" : "No visits recorded yet today"}</strong><span>{integrationError ? "Reconnect to SpaGym to view the shared activity register." : search ? "Try another name or phone number." : "Check in your first client and their visit will appear here."}</span></div></div>}</div>
      </section>}

      {showCheckInModal && <div className="checkin-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowCheckInModal(false); }}>
        <section className="checkin-dialog" role="dialog" aria-modal="true" aria-labelledby="checkin-dialog-title">
          <button className="dialog-close" type="button" aria-label="Close check-in dialog" onClick={() => setShowCheckInModal(false)}><X size={19} /></button>
          <div className="panel-heading"><div><span className="section-kicker">RETURNING CLIENT</span><h2 id="checkin-dialog-title">Find their visit</h2></div><div className="step-badge">CHECK IN</div></div>
          <p className="panel-description">Enter the phone number on their client record.</p>
          <div className="phone-entry"><label htmlFor="phone">Phone number</label><div className={`phone-input-wrap ${lookupState}`}><Search size={22} /><input id="phone" autoFocus inputMode="tel" autoComplete="tel" placeholder="+256 7XX XXX XXX" value={phone} onChange={(event) => { setPhone(event.target.value); setLookupState("idle"); }} onKeyDown={(event) => event.key === "Enter" && findClient()} /><button className="clear-button" type="button" aria-label="Clear phone number" onClick={() => { setPhone(""); setLookupState("idle"); }}>{phone && <X size={18} />}</button></div><button className="primary-button full" type="button" onClick={findClient} disabled={isSubmitting}><span>{isSubmitting ? "Checking…" : "Find client"}</span><ArrowRight size={18} /></button></div>
          {lookupState === "found" && activeClient && <div className="result-card found-card"><div className="avatar avatar-coral">{activeClient.name.split(" ").map((word) => word[0]).join("").slice(0, 2)}</div><div className="result-copy"><span className="result-label"><span className="result-dot" /> Client found</span><strong>{activeClient.name}</strong><span>{formatPhone(activeClient.phone)} <span className="middot">•</span> {activeClient.day} {activeClient.month}</span></div><button className="checkin-button" type="button" onClick={() => checkIn(activeClient)} disabled={isSubmitting}><Check size={17} /> {isSubmitting ? "Saving…" : "Sign in"}</button></div>}
          {lookupState === "missing" && <div className="result-card missing-card"><div className="missing-icon"><UserPlus size={19} /></div><div className="result-copy"><span className="result-label warm">No record found</span><strong>New here? Create their record.</strong><span>Name, birthday and phone — just the essentials.</span></div><button className="text-button" type="button" onClick={openRegistration}>Create record <ArrowRight size={16} /></button></div>}
        </section>
      </div>}

      <footer className="footer container"><span>guestflow <i>•</i> a calmer way to welcome people</span><span>Designed for the front desk · tablet friendly</span></footer>
      {notice && <div className="toast"><div className="toast-check"><Check size={17} /></div><div><strong>{notice.title}</strong><span>{notice.detail}</span></div><button type="button" aria-label="Dismiss notification" onClick={() => setNotice(null)}><X size={16} /></button></div>}
    </main>
  );
}

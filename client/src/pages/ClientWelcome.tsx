import { useEffect, useState } from "react";
import { ArrowRight, Check, ChevronDown, Phone, RotateCcw, Sparkles, UserPlus } from "lucide-react";

type Client = { id: string; name: string; day: string; month: string; phone: string; createdAt?: string };
type Visit = { id: string; clientId: string; checkedInAt: string };

const CLIENTS_KEY = "guestflow-clients";
const VISITS_KEY = "guestflow-visits";
const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const normalizePhone = (phone: string) => phone.replace(/\D/g, "");

function readStorage<T>(key: string, fallback: T): T {
  try {
    const stored = window.localStorage.getItem(key);
    return stored ? (JSON.parse(stored) as T) : fallback;
  } catch {
    return fallback;
  }
}

export default function ClientWelcome() {
  const [mode, setMode] = useState<"check-in" | "register">("check-in");
  const [phone, setPhone] = useState("");
  const [registration, setRegistration] = useState({ name: "", day: "", month: "", phone: "" });
  const [state, setState] = useState<"idle" | "success" | "not-found">("idle");
  const [clientName, setClientName] = useState("");

  useEffect(() => {
    document.title = "Welcome · GuestFlow";
    return () => { document.title = "GuestFlow · Digital Registration Book"; };
  }, []);

  const saveVisit = (client: Client) => {
    const visits = readStorage<Visit[]>(VISITS_KEY, []);
    const visit: Visit = { id: crypto.randomUUID(), clientId: client.id, checkedInAt: new Date().toISOString() };
    window.localStorage.setItem(VISITS_KEY, JSON.stringify([visit, ...visits]));
    setClientName(client.name);
    setState("success");
  };

  const checkIn = (event: React.FormEvent) => {
    event.preventDefault();
    const digits = normalizePhone(phone);
    if (digits.length < 7) return;
    const clients = readStorage<Client[]>(CLIENTS_KEY, []);
    const client = clients.find((item) => normalizePhone(item.phone) === digits);
    if (!client) { setState("not-found"); return; }
    saveVisit(client);
  };

  const register = (event: React.FormEvent) => {
    event.preventDefault();
    const digits = normalizePhone(registration.phone);
    if (!registration.name.trim() || !registration.day || !registration.month || digits.length < 7) return;
    const clients = readStorage<Client[]>(CLIENTS_KEY, []);
    const existing = clients.find((item) => normalizePhone(item.phone) === digits);
    const client = existing ?? { id: crypto.randomUUID(), name: registration.name.trim(), day: registration.day, month: registration.month, phone: registration.phone, createdAt: new Date().toISOString() };
    if (!existing) window.localStorage.setItem(CLIENTS_KEY, JSON.stringify([client, ...clients]));
    saveVisit(client);
  };

  const reset = () => { setPhone(""); setRegistration({ name: "", day: "", month: "", phone: "" }); setClientName(""); setState("idle"); };
  const switchMode = (nextMode: "check-in" | "register") => { setMode(nextMode); setState("idle"); };

  return (
    <main className="client-screen">
      <div className="client-orb client-orb-one" />
      <div className="client-orb client-orb-two" />
      <div className="client-brand"><span className="brand-mark"><Sparkles size={17} /></span><span>guestflow</span></div>
      <section className={`client-card ${mode === "register" ? "client-card-register" : ""}`}>
        {state === "success" ? (
          <div className="client-success">
            <div className="success-mark"><Check size={29} /></div>
            <span className="client-eyebrow">YOU’RE ALL SET</span>
            <h1>Welcome, <em>{clientName.split(" ")[0]}.</em></h1>
            <p>Your visit has been recorded. Please take a seat and we’ll be with you shortly.</p>
            <button className="client-secondary-button" type="button" onClick={reset}><RotateCcw size={16} /> Check in another person</button>
          </div>
        ) : (
          <>
            <div className="client-icon">{mode === "check-in" ? <Phone size={23} /> : <UserPlus size={23} />}</div>
            <span className="client-eyebrow">{mode === "check-in" ? "WELCOME IN" : "FIRST VISIT"}</span>
            <h1>{mode === "check-in" ? <>Let us know<br /><em>you’re here.</em></> : <>Let’s get you<br /><em>registered.</em></>}</h1>
            <p>{mode === "check-in" ? "Enter your phone number below to check in. It only takes a moment." : "Just a few details so we can welcome you properly."}</p>
            {mode === "check-in" ? (
              <form onSubmit={checkIn} className="client-form">
                <label htmlFor="client-phone">Phone number</label>
                <input id="client-phone" inputMode="tel" autoComplete="tel" autoFocus placeholder="(555) 000-0000" value={phone} onChange={(event) => { setPhone(event.target.value); setState("idle"); }} />
                <button className="client-primary-button" type="submit"><span>Check in</span><ArrowRight size={18} /></button>
              </form>
            ) : (
              <form onSubmit={register} className="client-form client-registration-form">
                <label htmlFor="client-name">Full name</label>
                <input id="client-name" autoFocus placeholder="e.g. Jordan Lee" value={registration.name} onChange={(event) => setRegistration({ ...registration, name: event.target.value })} required />
                <div className="client-field-row"><div><label htmlFor="client-day">Birthday · day</label><div className="client-select"><select id="client-day" value={registration.day} onChange={(event) => setRegistration({ ...registration, day: event.target.value })} required><option value="">Day</option>{Array.from({ length: 31 }, (_, index) => <option key={index + 1} value={String(index + 1)}>{index + 1}</option>)}</select><ChevronDown size={15} /></div></div><div><label htmlFor="client-month">Month</label><div className="client-select"><select id="client-month" value={registration.month} onChange={(event) => setRegistration({ ...registration, month: event.target.value })} required><option value="">Month</option>{months.map((month) => <option key={month} value={month}>{month}</option>)}</select><ChevronDown size={15} /></div></div></div>
                <label htmlFor="client-new-phone">Phone number</label>
                <input id="client-new-phone" inputMode="tel" autoComplete="tel" placeholder="(555) 000-0000" value={registration.phone} onChange={(event) => setRegistration({ ...registration, phone: event.target.value })} required />
                <button className="client-primary-button" type="submit"><span>Register & check in</span><ArrowRight size={18} /></button>
              </form>
            )}
            {state === "not-found" && <div className="client-not-found"><strong>We couldn’t find that number.</strong><span>Please check it and try again, or choose “New here?” below.</span></div>}
            <div className="client-switch">{mode === "check-in" ? <>New here? <button type="button" onClick={() => switchMode("register")}>Register as a new client</button></> : <>Already registered? <button type="button" onClick={() => switchMode("check-in")}>Check in by phone</button></>}</div>
            <div className="client-privacy">Your details are used only for your client record.</div>
          </>
        )}
      </section>
      <div className="client-footer">A simple welcome, made easier.</div>
    </main>
  );
}

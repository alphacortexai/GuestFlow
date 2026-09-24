import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Check, ChevronDown, Phone, RotateCcw, Sparkles, UserPlus } from "lucide-react";

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
  const [mode, setMode] = useState<"start" | "check-in" | "register" | "success">("start");
  const [registerStep, setRegisterStep] = useState(1);
  const [phone, setPhone] = useState("");
  const [registration, setRegistration] = useState({ name: "", day: "", month: "", phone: "" });
  const [notFound, setNotFound] = useState(false);
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
    setMode("success");
  };

  const checkIn = (event: React.FormEvent) => {
    event.preventDefault();
    const digits = normalizePhone(phone);
    if (digits.length < 7) return;
    const client = readStorage<Client[]>(CLIENTS_KEY, []).find((item) => normalizePhone(item.phone) === digits);
    if (!client) { setNotFound(true); return; }
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

  const reset = () => { setMode("start"); setRegisterStep(1); setPhone(""); setRegistration({ name: "", day: "", month: "", phone: "" }); setNotFound(false); setClientName(""); };
  const beginCheckIn = () => { setMode("check-in"); setNotFound(false); };
  const beginRegister = () => { setMode("register"); setRegisterStep(1); };
  const goBack = () => {
    if (mode === "register" && registerStep > 1) setRegisterStep((step) => step - 1);
    else setMode("start");
  };

  const registrationNext = (event: React.FormEvent) => {
    event.preventDefault();
    if (registerStep === 1 && registration.name.trim()) setRegisterStep(2);
    else if (registerStep === 2 && registration.day && registration.month) setRegisterStep(3);
    else if (registerStep === 3) register(event);
  };

  return (
    <main className="client-screen">
      <div className="client-orb client-orb-one" />
      <div className="client-orb client-orb-two" />
      <div className="client-brand"><span className="brand-mark"><Sparkles size={17} /></span><span>guestflow</span></div>
      <section className={`client-card ${mode === "register" ? "client-card-register" : ""} ${mode === "start" ? "client-card-start" : ""}`}>
        {mode === "success" ? (
          <div className="client-success">
            <div className="success-mark"><Check size={29} /></div>
            <span className="client-eyebrow">YOU’RE ALL SET</span>
            <h1>Welcome, <em>{clientName.split(" ")[0]}.</em></h1>
            <p>Your visit has been recorded. Please take a seat and we’ll be with you shortly.</p>
            <button className="client-secondary-button" type="button" onClick={reset}><RotateCcw size={16} /> Check in another person</button>
          </div>
        ) : mode === "start" ? (
          <div className="client-start">
            <div className="client-icon"><Sparkles size={23} /></div>
            <span className="client-eyebrow">WELCOME IN</span>
            <h1>How can we<br /><em>welcome you?</em></h1>
            <p>Choose an option to get started. We’ll only ask for what we need.</p>
            <div className="client-choice-list">
              <button className="client-choice" type="button" onClick={beginCheckIn}><span className="choice-icon"><Phone size={19} /></span><span><strong>I’m already registered</strong><small>Check in with my phone number</small></span><ArrowRight size={17} /></button>
              <button className="client-choice" type="button" onClick={beginRegister}><span className="choice-icon coral-choice"><UserPlus size={19} /></span><span><strong>I’m new here</strong><small>Create a client record in a few steps</small></span><ArrowRight size={17} /></button>
            </div>
          </div>
        ) : mode === "check-in" ? (
          <div className="client-flow-step">
            <button className="client-back" type="button" onClick={goBack}><ArrowLeft size={15} /> Back</button>
            <div className="client-icon"><Phone size={23} /></div>
            <span className="client-eyebrow">RETURNING CLIENT</span>
            <h1>Let us know<br /><em>you’re here.</em></h1>
            <p>Enter your phone number to check in. It only takes a moment.</p>
            <form onSubmit={checkIn} className="client-form">
              <label htmlFor="client-phone">Phone number</label>
              <input id="client-phone" inputMode="tel" autoComplete="tel" autoFocus placeholder="(555) 000-0000" value={phone} onChange={(event) => { setPhone(event.target.value); setNotFound(false); }} />
              <button className="client-primary-button" type="submit"><span>Check in</span><ArrowRight size={18} /></button>
            </form>
            {notFound && <div className="client-not-found"><strong>We couldn’t find that number.</strong><span>Please check it and try again, or go back to register as a new client.</span></div>}
            <div className="client-privacy">Your number is used only to find your client record.</div>
          </div>
        ) : (
          <div className="client-flow-step">
            <div className="client-step-header"><button className="client-back" type="button" onClick={goBack}><ArrowLeft size={15} /> Back</button><span className="client-progress">{registerStep} <i>/</i> 3</span></div>
            <div className="client-progress-bar"><span style={{ width: `${(registerStep / 3) * 100}%` }} /></div>
            <div className="client-icon"><UserPlus size={23} /></div>
            <span className="client-eyebrow">NEW CLIENT</span>
            <h1>{registerStep === 1 ? <>What’s your<br /><em>name?</em></> : registerStep === 2 ? <>When’s your<br /><em>birthday?</em></> : <>What’s your<br /><em>phone number?</em></>}</h1>
            <p>{registerStep === 1 ? "Let’s start with the basics." : registerStep === 2 ? "Day and month only — no birth year needed." : "We’ll use this to make your next visit quick."}</p>
            <form onSubmit={registrationNext} className="client-form client-registration-form">
              {registerStep === 1 && <><label htmlFor="client-name">Full name</label><input id="client-name" autoFocus placeholder="e.g. Jordan Lee" value={registration.name} onChange={(event) => setRegistration({ ...registration, name: event.target.value })} required /></>}
              {registerStep === 2 && <div className="client-field-row"><div><label htmlFor="client-day">Birthday · day</label><div className="client-select"><select id="client-day" autoFocus value={registration.day} onChange={(event) => setRegistration({ ...registration, day: event.target.value })} required><option value="">Day</option>{Array.from({ length: 31 }, (_, index) => <option key={index + 1} value={String(index + 1)}>{index + 1}</option>)}</select><ChevronDown size={15} /></div></div><div><label htmlFor="client-month">Month</label><div className="client-select"><select id="client-month" value={registration.month} onChange={(event) => setRegistration({ ...registration, month: event.target.value })} required><option value="">Month</option>{months.map((month) => <option key={month} value={month}>{month}</option>)}</select><ChevronDown size={15} /></div></div></div>}
              {registerStep === 3 && <><label htmlFor="client-new-phone">Phone number</label><input id="client-new-phone" inputMode="tel" autoComplete="tel" autoFocus placeholder="(555) 000-0000" value={registration.phone} onChange={(event) => setRegistration({ ...registration, phone: event.target.value })} required /></>}
              <button className="client-primary-button" type="submit"><span>{registerStep === 3 ? "Register & check in" : "Continue"}</span><ArrowRight size={18} /></button>
            </form>
            <div className="client-privacy">Your details are used only for your client record.</div>
          </div>
        )}
      </section>
      <div className="client-footer">A simple welcome, made easier.</div>
    </main>
  );
}

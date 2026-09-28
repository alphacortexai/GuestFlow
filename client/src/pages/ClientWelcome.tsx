import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, CalendarDays, Check, ChevronLeft, ChevronRight, Sparkles, UserPlus } from "lucide-react";
import { checkIn as apiCheckIn, createClient as apiCreateClient, getBranches, SpaGymApiError } from "@/lib/spaGymApi";
const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const weekdayNames = ["S", "M", "T", "W", "T", "F", "S"];
const normalizePhone = (phone: string) => {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) return digits.slice(2);
  if (digits.startsWith("0")) return `256${digits.slice(1)}`;
  return digits;
};
const isValidPhone = (phone: string) => /^256\d{9}$/.test(normalizePhone(phone));
const getClientGreeting = (date = new Date()) => {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
};
export default function ClientWelcome() {
  const branchId = useMemo(() => new URLSearchParams(window.location.search).get("branchId") || "", []);
  const [branchName, setBranchName] = useState("");
  const [mode, setMode] = useState<"check-in" | "register" | "success">("check-in");
  const [registerStep, setRegisterStep] = useState(1);
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [registration, setRegistration] = useState({ name: "", day: "", month: "", phone: "" });
  const [registrationPhoneError, setRegistrationPhoneError] = useState("");
  const [calendarMonth, setCalendarMonth] = useState(() => new Date().getMonth());
  const [calendarView, setCalendarView] = useState<"month" | "day">("month");
  const [notFound, setNotFound] = useState(false);
  const [clientName, setClientName] = useState("");
  const [alreadyCheckedIn, setAlreadyCheckedIn] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [requestError, setRequestError] = useState("");
  const [profileSaved, setProfileSaved] = useState(false);
  const clientGreeting = getClientGreeting();

  const currentYear = new Date().getFullYear();
  const daysInMonth = new Date(currentYear, calendarMonth + 1, 0).getDate();
  const firstWeekday = new Date(currentYear, calendarMonth, 1).getDay();
  const calendarDays = useMemo(() => Array.from({ length: firstWeekday + daysInMonth }, (_, index) => index < firstWeekday ? null : index - firstWeekday + 1), [firstWeekday, daysInMonth]);

  useEffect(() => {
    document.title = "Digital Registration Book · GuestFlow";
    return () => { document.title = "GuestFlow · Digital Registration Book"; };
  }, []);

  useEffect(() => {
    if (!branchId) return;
    getBranches()
      .then((items) => setBranchName(items.find((branch) => branch.id === branchId)?.name || ""))
      .catch(() => setBranchName(""));
  }, [branchId]);

  useEffect(() => {
    if (mode !== "success") return;
    const timer = window.setTimeout(() => {
      setMode("check-in"); setRegisterStep(1); setPhone(""); setPhoneError("");
      setRegistration({ name: "", day: "", month: "", phone: "" });
      setRegistrationPhoneError(""); setNotFound(false); setClientName(""); setAlreadyCheckedIn(false); setRequestError(""); setProfileSaved(false);
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [mode]);

  const checkIn = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isValidPhone(phone)) {
      setPhoneError("Enter a valid number, e.g. +256 7XX XXX XXX.");
      return;
    }
    setPhoneError("");
    setIsSubmitting(true);
    setRequestError("");
    setProfileSaved(false);
    try {
      const result = await apiCheckIn(phone);
      setClientName(result.client.name);
      setAlreadyCheckedIn(result.alreadyCheckedIn);
      setNotFound(false);
      setMode("success");
    } catch (error) {
      if (error instanceof SpaGymApiError && error.status === 404) setNotFound(true);
      else setRequestError(error instanceof Error ? error.message : "Could not reach SpaGym. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const register = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isValidPhone(registration.phone)) {
      setRegistrationPhoneError("Enter a valid number, e.g. +256 7XX XXX XXX.");
      return;
    }
    setRegistrationPhoneError("");
    if (!registration.name.trim() || !registration.day || !registration.month) return;
    setIsSubmitting(true);
    setRequestError("");
    setProfileSaved(false);
    let savedClientName = "";
    try {
      const result = await apiCreateClient({ name: registration.name.trim(), day: registration.day, month: registration.month, phone: registration.phone, branchId: branchId || undefined });
      savedClientName = result.client.name;
      const signIn = await apiCheckIn(registration.phone, result.client.id);
      setClientName(signIn.client.name || result.client.name);
      setAlreadyCheckedIn(signIn.alreadyCheckedIn);
      setNotFound(false);
      setMode("success");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Please try again.";
      setProfileSaved(Boolean(savedClientName));
      setRequestError(savedClientName
        ? `Your profile was saved in SpaGym, but check-in did not finish: ${detail} Please ask the front desk to check you in.`
        : `Could not save your details: ${detail}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const reset = () => { setMode("check-in"); setRegisterStep(1); setPhone(""); setPhoneError(""); setRegistration({ name: "", day: "", month: "", phone: "" }); setRegistrationPhoneError(""); setNotFound(false); setClientName(""); setAlreadyCheckedIn(false); setProfileSaved(false); };
  const goBack = () => { if (mode === "register" && registerStep > 1) setRegisterStep((step) => step - 1); else setMode("check-in"); };
  const chooseDate = (day: number) => setRegistration((current) => ({ ...current, day: String(day), month: monthNames[calendarMonth] }));
  const chooseMonth = (month: number) => { setCalendarMonth(month); setCalendarView("day"); };
  const registrationNext = (event: React.FormEvent) => {
    event.preventDefault();
    if (registerStep === 1 && registration.name.trim()) setRegisterStep(2);
    else if (registerStep === 2 && registration.day && registration.month) setRegisterStep(3);
    else if (registerStep === 3) register(event);
  };

  return (
    <main className="client-screen">
      <div className="client-orb client-orb-one" /><div className="client-orb client-orb-two" />
      <div className="client-brand"><span className="brand-mark"><Sparkles size={16} /></span><span>guestflow</span>{branchName && <span className="client-branch-name">{branchName}</span>}</div>
      <section className={`client-card ${mode === "register" ? "client-card-register" : ""}`}>
        {requestError && mode !== "success" && <div role="alert" className="client-not-found"><strong>{profileSaved ? "Your profile is saved" : "SpaGym couldn’t complete that step"}</strong><span>{requestError}</span></div>}
        {mode === "success" ? (
          <div className="client-success"><div className="success-mark"><Check size={28} /></div><span className="client-eyebrow">{alreadyCheckedIn ? "ALREADY CHECKED IN" : "YOU’RE ALL SET"}</span><h1>{alreadyCheckedIn ? <>You’re already<br /><em>checked in.</em></> : <>Welcome, <em>{clientName.split(" ")[0]}.</em></>}</h1><p>{alreadyCheckedIn ? "This visit was already recorded today. Please take a seat and we’ll be with you shortly." : "Your visit has been recorded. Please take a seat and we’ll be with you shortly."}</p></div>
        ) : mode === "check-in" ? (
          <div className="client-flow-step"><div className="client-welcome-copy"><span className="client-greeting">{clientGreeting}</span><span className="client-location">Welcome to <strong>{branchName || "GuestFlow"}</strong></span></div><h1>Digital<br /><em>Registration Book</em></h1><p className="client-intro">Please enter your phone number below so we know you’re here.</p><form onSubmit={checkIn} className="client-form"><label htmlFor="client-phone">Phone number</label><input id="client-phone" type="tel" inputMode="tel" autoComplete="tel" autoFocus pattern="(?:\+?256|0)[0-9\s()-]{9,14}" aria-invalid={Boolean(phoneError)} aria-describedby={phoneError ? "client-phone-error" : undefined} placeholder="+256 7XX XXX XXX" value={phone} onChange={(event) => { setPhone(event.target.value); setPhoneError(""); setNotFound(false); setRequestError(""); }} /><button className="client-primary-button" type="submit" disabled={isSubmitting}><span>{isSubmitting ? "Checking in…" : "Please check in"}</span><ArrowRight size={17} /></button>{phoneError && <p id="client-phone-error" className="phone-validation" role="alert">{phoneError}</p>}</form>{notFound && <div className="client-not-found not-found-card"><button className="client-register-button" type="button" onClick={() => { setRegistration((current) => ({ ...current, phone })); setMode("register"); setRegisterStep(1); setRequestError(""); }}><span>Phone No. not found! Register Here.</span><ArrowRight size={17} /></button></div>}</div>
        ) : (
          <div className="client-flow-step"><div className="client-step-header"><button className="client-back" type="button" onClick={goBack}><ArrowLeft size={14} /> Back</button><span className="client-progress">{registerStep} <i>/</i> 3</span></div><div className="client-progress-bar"><span style={{ width: `${(registerStep / 3) * 100}%` }} /></div><h1>{registerStep === 1 ? <>What’s your<br /><em>name?</em></> : registerStep === 2 ? <>When’s your<br /><em>birthday?</em></> : <>What’s your<br /><em>phone number?</em></>}</h1><p>{registerStep === 1 ? "Let’s start with the basics." : registerStep === 2 ? "Choose a month, then select a day." : "We’ll use this to make your next visit quick."}</p><form onSubmit={registrationNext} className="client-form client-registration-form">{registerStep === 1 && <><label htmlFor="client-name">Full name</label><input id="client-name" autoFocus placeholder="e.g. Jordan Lee" value={registration.name} onChange={(event) => setRegistration({ ...registration, name: event.target.value })} required /></>}{registerStep === 2 && <div className="apple-calendar">{calendarView === "month" ? <><div className="calendar-picker-heading"><CalendarDays size={15} /><strong>Select a month</strong></div><div className="month-grid">{monthNames.map((month, index) => <button type="button" key={month} className={registration.month === month ? "selected-month" : ""} onClick={() => chooseMonth(index)}>{month.slice(0, 3)}</button>)}</div></> : <><div className="calendar-toolbar"><button type="button" aria-label="Choose another month" onClick={() => setCalendarView("month")}><ChevronLeft size={17} /></button><strong>{monthNames[calendarMonth]}</strong><button type="button" aria-label="Next month" onClick={() => setCalendarMonth((month) => Math.min(11, month + 1))} disabled={calendarMonth === 11}><ChevronRight size={17} /></button></div><div className="calendar-weekdays">{weekdayNames.map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}</div><div className="calendar-grid">{calendarDays.map((day, index) => day ? <button type="button" key={day} className={registration.day === String(day) && registration.month === monthNames[calendarMonth] ? "selected-day" : ""} onClick={() => chooseDate(day)}>{day}</button> : <span key={`blank-${index}`} />)}</div><div className="calendar-selection"><CalendarDays size={15} /><span>{registration.day && registration.month ? `${registration.day} ${registration.month}` : "Select your birthday"}</span></div></>}</div>}{registerStep === 3 && <><label htmlFor="client-new-phone">Phone number</label><input id="client-new-phone" type="tel" inputMode="tel" autoComplete="tel" autoFocus pattern="(?:\+?256|0)[0-9\s()-]{9,14}" aria-invalid={Boolean(registrationPhoneError)} aria-describedby={registrationPhoneError ? "client-new-phone-error" : undefined} placeholder="+256 7XX XXX XXX" value={registration.phone} onChange={(event) => { setRegistration({ ...registration, phone: event.target.value }); setRegistrationPhoneError(""); setRequestError(""); }} required /></>}{registrationPhoneError && <p id="client-new-phone-error" className="phone-validation" role="alert">{registrationPhoneError}</p>}<button className="client-primary-button" type="submit" disabled={isSubmitting}><span>{isSubmitting ? "Saving…" : registerStep === 3 ? "Register & check in" : "Continue"}</span><ArrowRight size={17} /></button></form><div className="client-privacy">Your details are used only for your client record.</div></div>
        )}
      </section>
      <div className="client-footer">A simple welcome, made easier.</div>
    </main>
  );
}

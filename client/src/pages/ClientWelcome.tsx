import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Sparkles, UserPlus } from "lucide-react";
import BirthdayCalendar from "@/components/BirthdayCalendar";
import { checkIn as apiCheckIn, createClient as apiCreateClient, getBranches, SpaGymApiError } from "@/lib/spaGymApi";
const normalizePhone = (phone: string) => {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) return digits.slice(2);
  if (digits.startsWith("0")) return `256${digits.slice(1)}`;
  return digits;
};
export default function ClientWelcome() {
  const branchId = useMemo(() => new URLSearchParams(window.location.search).get("branchId") || "", []);
  const [branchName, setBranchName] = useState("");
  const [mode, setMode] = useState<"check-in" | "register" | "success">("check-in");
  const [registerStep, setRegisterStep] = useState(1);
  const [phone, setPhone] = useState("");
  const [registration, setRegistration] = useState({ name: "", day: "", month: "", phone: "" });
  const [notFound, setNotFound] = useState(false);
  const [clientName, setClientName] = useState("");
  const [alreadyCheckedIn, setAlreadyCheckedIn] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [requestError, setRequestError] = useState("");
  const [profileSaved, setProfileSaved] = useState(false);

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
      setMode("check-in"); setRegisterStep(1); setPhone("");
      setRegistration({ name: "", day: "", month: "", phone: "" });
      setNotFound(false); setClientName(""); setAlreadyCheckedIn(false); setRequestError(""); setProfileSaved(false);
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [mode]);

  const checkIn = async (event: React.FormEvent) => {
    event.preventDefault();
    const digits = normalizePhone(phone);
    if (digits.length < 7) return;
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
    const digits = normalizePhone(registration.phone);
    if (!registration.name.trim() || !registration.day || !registration.month || digits.length < 7) return;
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

  const reset = () => { setMode("check-in"); setRegisterStep(1); setPhone(""); setRegistration({ name: "", day: "", month: "", phone: "" }); setNotFound(false); setClientName(""); setAlreadyCheckedIn(false); setProfileSaved(false); };
  const goBack = () => { if (mode === "register" && registerStep > 1) setRegisterStep((step) => step - 1); else setMode("check-in"); };
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
          <div className="client-flow-step"><h1>Digital<br /><em>Registration Book</em></h1><p>Please enter your phone number below so we know you’re here.</p><form onSubmit={checkIn} className="client-form"><label htmlFor="client-phone">Phone number</label><input id="client-phone" inputMode="tel" autoComplete="tel" autoFocus placeholder="+256 7XX XXX XXX" value={phone} onChange={(event) => { setPhone(event.target.value); setNotFound(false); setRequestError(""); }} /><button className="client-primary-button" type="submit" disabled={isSubmitting}><span>{isSubmitting ? "Checking in…" : "Please check in"}</span><ArrowRight size={17} /></button></form>{notFound && <div className="client-not-found"><div className="not-found-icon"><UserPlus size={18} /></div><div className="not-found-copy"><strong>We don’t see you yet</strong><span>New to Soothing Spa? Create your client record in a few quick steps.</span></div><button className="client-register-button" type="button" onClick={() => { setRegistration((current) => ({ ...current, phone })); setMode("register"); setRegisterStep(1); setRequestError(""); }}><span>Register as a new client</span><ArrowRight size={15} /></button></div>}<div className="client-privacy">Your number is used only to find your SpaGym client record.</div></div>
        ) : (
          <div className="client-flow-step"><div className="client-step-header"><button className="client-back" type="button" onClick={goBack}><ArrowLeft size={14} /> Back</button><span className="client-progress">{registerStep} <i>/</i> 3</span></div><div className="client-progress-bar"><span style={{ width: `${(registerStep / 3) * 100}%` }} /></div><div className="client-icon"><UserPlus size={21} /></div><span className="client-eyebrow">NEW CLIENT</span><h1>{registerStep === 1 ? <>What’s your<br /><em>name?</em></> : registerStep === 2 ? <>When’s your<br /><em>birthday?</em></> : <>What’s your<br /><em>phone number?</em></>}</h1><p>{registerStep === 1 ? "Let’s start with the basics." : registerStep === 2 ? "Choose a birthday month and day." : "We’ll use this to make your next visit quick."}</p><form onSubmit={registrationNext} className="client-form client-registration-form">{registerStep === 1 && <><label htmlFor="client-name">Full name</label><input id="client-name" autoFocus placeholder="e.g. Jordan Lee" value={registration.name} onChange={(event) => setRegistration({ ...registration, name: event.target.value })} required /></>}{registerStep === 2 && <BirthdayCalendar month={registration.month} day={registration.day} onChange={(month, day) => setRegistration((current) => ({ ...current, month, day }))} />}{registerStep === 3 && <><label htmlFor="client-new-phone">Phone number</label><input id="client-new-phone" inputMode="tel" autoComplete="tel" autoFocus placeholder="+256 7XX XXX XXX" value={registration.phone} onChange={(event) => { setRegistration({ ...registration, phone: event.target.value }); setRequestError(""); }} required /></>}<button className="client-primary-button" type="submit" disabled={isSubmitting}><span>{isSubmitting ? "Saving…" : registerStep === 3 ? "Register & check in" : "Continue"}</span><ArrowRight size={17} /></button></form><div className="client-privacy">Your details are used only for your client record.</div></div>
        )}
      </section>
      <div className="client-footer">A simple welcome, made easier.</div>
    </main>
  );
}

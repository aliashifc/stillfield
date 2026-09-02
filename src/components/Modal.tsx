import { useState, useEffect, useRef } from 'react';

/* ── Config ───────────────────────────────────────────────────────────────
   FORM_ENDPOINT is the deployed Google Apps Script web app URL — it ends in
   /exec. See scripts/apps-script.gs for the script itself and how to deploy
   it. None of these are secrets: the endpoint has to be public for the
   browser to POST to it, so it lives in the source rather than a .env.
   While FORM_ENDPOINT is empty the form shows its error state and offers the
   mailto fallback — it never pretends to have sent anything.            */
const FORM_ENDPOINT = 'https://script.google.com/macros/s/AKfycbzUMDDbVXUxvZ6fYRJSNb8gFnp5h8vxCI3VNc8eZkKVzoQ56KXGQXjy9UTK8fWYM6ng/exec';
const CONTACT_EMAIL = 'ashif.ali@stillfield.co.uk';
/* Trailing slash on purpose: Astro serves the page at /privacy/ and 301s
   /privacy to it, so linking without it costs every visitor a redirect. */
const PRIVACY_URL = '/privacy/';

/* Reason for getting in touch. His mockup had these as ten checkboxes; a
   single dropdown carries the same information without ten boxes of chrome. */
const INTENDED_USE = [
  'For my own use at home',
  'Office / Workplace',
  'Condo / Residential',
  'Hotel / Spa',
  'Hospital / Clinic',
  'Retail',
  'Event / Conference',
  'Press enquiry',
  'Interested in investing',
  'Other',
];

type Status = 'idle' | 'sending' | 'sent' | 'error';

export default function Modal() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [errors, setErrors] = useState<Record<string, boolean>>({});

  const firstFieldRef = useRef<HTMLInputElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  /* who had focus before we opened, so it can be handed back on close */
  const returnFocusRef = useRef<HTMLElement | null>(null);
  /* bots fill forms instantly; humans do not */
  const openedAtRef = useRef(0);

  useEffect(() => {
    const triggers = document.querySelectorAll('[data-cta]');
    const handler = (e: Event) => {
      returnFocusRef.current = (e.currentTarget as HTMLElement) ?? null;
      openedAtRef.current = Date.now();
      setOpen(true);
      setStatus('idle');
      setErrors({});
    };
    triggers.forEach(t => t.addEventListener('click', handler));
    return () => triggers.forEach(t => t.removeEventListener('click', handler));
  }, []);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
      setTimeout(() => firstFieldRef.current?.focus(), 340);
    } else {
      document.body.style.overflow = '';
      returnFocusRef.current?.focus();
    }
  }, [open]);

  /* Escape to close, and keep Tab inside the dialog while it is open —
     aria-modal alone does not stop focus walking out to the page behind. */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); return; }
      if (e.key !== 'Tab' || !panelRef.current) return;

      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])'
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (status === 'sending') return;

    const form = e.currentTarget;
    const fd = new FormData(form);
    const value = (k: string) => String(fd.get(k) ?? '').trim();

    /* honeypot: a real person never sees this field, so anything in it is a bot.
       Report success so the bot has nothing to learn from, and send nothing. */
    if (value('website')) { setStatus('sent'); return; }
    if (Date.now() - openedAtRef.current < 3000) {
      /* Silent to the sender, but say so in the console — otherwise a quick
         autofill during testing looks like a success that never sent. */
      console.warn('[stillfield] submitted within 3s of opening — treated as a bot, nothing sent');
      setStatus('sent');
      return;
    }

    const required = ['email', 'firstName', 'lastName', 'jobTitle', 'company', 'intendedUse'];
    const missing: Record<string, boolean> = {};
    required.forEach(k => { if (!value(k)) missing[k] = true; });
    if (value('email') && !/^\S+@\S+\.\S+$/.test(value('email'))) missing.email = true;

    setErrors(missing);
    if (Object.keys(missing).length) {
      form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      return;
    }

    if (!FORM_ENDPOINT) {
      console.error('[stillfield] FORM_ENDPOINT is not set — see src/components/Modal.tsx');
      setStatus('error');
      return;
    }

    setStatus('sending');
    try {
      const res = await fetch(FORM_ENDPOINT, {
        method: 'POST',
        /* text/plain keeps this a "simple" request, so the browser skips the
           CORS preflight that Apps Script web apps do not answer. The script
           JSON.parse()s the body itself. */
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          email: value('email'),
          firstName: value('firstName'),
          lastName: value('lastName'),
          phone: value('phone'),
          jobTitle: value('jobTitle'),
          company: value('company'),
          intendedUse: value('intendedUse'),
          comments: value('comments'),
          marketingOptIn: fd.get('marketingOptIn') === 'on',
          page: window.location.href,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      /* Apps Script answers 200 even when the script itself refused the
         enquiry — a rejection arrives as 200 with {"ok":false}. So the body,
         not the status, is the verdict. If the body can't be read or isn't
         JSON, trust the 200 rather than tell someone their enquiry failed
         when it may well have been filed. */
      const body = await res.text().catch(() => '');
      let accepted: unknown;
      try { accepted = JSON.parse(body).ok; } catch { /* not JSON — trust the 200 */ }
      if (accepted === false) throw new Error(`rejected: ${body}`);
      setStatus('sent');
    } catch (err) {
      console.error('[stillfield] enquiry failed to send', err);
      setStatus('error');
    }
  };

  const handleBackdrop = (e: React.MouseEvent) => {
    if (e.target === backdropRef.current) setOpen(false);
  };

  if (!open) return null;

  const invalid = (k: string) => (errors[k] ? { 'aria-invalid': true as const } : {});
  const sending = status === 'sending';

  return (
    <div
      ref={backdropRef}
      className="modal-backdrop open"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modalTitle"
      onClick={handleBackdrop}
    >
      <div className="modal" ref={panelRef}>
        <button className="modal-close" onClick={() => setOpen(false)} aria-label="Close">&times;</button>

        {status !== 'sent' && (
          <>
            <div className="kicker">— Register interest —</div>
            <h2 id="modalTitle">Be first to the quiet.</h2>
            <p className="modal-sub">Tell us where Stillfield belongs. We'll be in touch as pods become available for partners.</p>

            <form className="form" onSubmit={handleSubmit} noValidate>
              {/* honeypot — off-screen, skipped by keyboard, ignored by autofill */}
              <div className="hp" aria-hidden="true">
                <label htmlFor="f-website">Website</label>
                <input id="f-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
              </div>

              <div className="field-row">
                <div className="field">
                  <label htmlFor="f-first">First name</label>
                  <input ref={firstFieldRef} id="f-first" name="firstName" type="text" placeholder="Esme" autoComplete="given-name" {...invalid('firstName')} />
                </div>
                <div className="field">
                  <label htmlFor="f-last">Last name</label>
                  <input id="f-last" name="lastName" type="text" placeholder="Hartwell" autoComplete="family-name" {...invalid('lastName')} />
                </div>
              </div>

              <div className="field-row">
                <div className="field">
                  <label htmlFor="f-email">Email</label>
                  <input id="f-email" name="email" type="email" placeholder="you@domain.com" autoComplete="email" {...invalid('email')} />
                </div>
                <div className="field">
                  <label htmlFor="f-phone">Phone <span className="opt">(optional)</span></label>
                  <input id="f-phone" name="phone" type="tel" placeholder="+44 …" autoComplete="tel" />
                </div>
              </div>

              <div className="field-row">
                <div className="field">
                  <label htmlFor="f-company">Company</label>
                  <input id="f-company" name="company" type="text" placeholder="Where it would live" autoComplete="organization" {...invalid('company')} />
                </div>
                <div className="field">
                  <label htmlFor="f-role">Job title</label>
                  <input id="f-role" name="jobTitle" type="text" placeholder="Operations Director" autoComplete="organization-title" {...invalid('jobTitle')} />
                </div>
              </div>

              <div className="field">
                <label htmlFor="f-use">Reason for getting in touch</label>
                <select id="f-use" name="intendedUse" defaultValue="" {...invalid('intendedUse')}>
                  <option value="" disabled>Select one…</option>
                  {INTENDED_USE.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>

              <div className="field">
                <label htmlFor="f-note">Anything else? <span className="opt">(optional)</span></label>
                <textarea id="f-note" name="comments" placeholder="Timing, number of pods, questions…" />
              </div>

              <label className="check">
                <input type="checkbox" name="marketingOptIn" />
                <span>Send me occasional product and industry news. No lists, no spam.</span>
              </label>

              {Object.keys(errors).length > 0 && (
                <p className="form-msg" role="alert">Please complete the highlighted fields.</p>
              )}
              {status === 'error' && (
                <p className="form-msg" role="alert">
                  That didn't send. Please email us at{' '}
                  <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> and we'll pick it up.
                </p>
              )}

              <button type="submit" className="modal-submit" disabled={sending}>
                {sending ? 'Sending…' : <>Register interest <span aria-hidden="true">→</span></>}
              </button>

              <p className="modal-foot">
                <a href={PRIVACY_URL} target="_blank" rel="noopener">How we use your details</a>
              </p>
            </form>
          </>
        )}

        {status === 'sent' && (
          <div className="modal-success" role="status">
            <div className="success-mark" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.3">
                <path d="M4 10.5l4 4 8-9"/>
              </svg>
            </div>
            <h3>Noted, with thanks.</h3>
            <p>We've got your details. We'll reach out personally as Stillfield pods open to partners.</p>
          </div>
        )}
      </div>
    </div>
  );
}

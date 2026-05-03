import { useState } from 'react';
import type { Profile } from '../profile';
import { hasMeaningfulProfile } from '../profile';

interface LandingProps {
  onStart: () => void;
  starting: boolean;
  mediaError: 'denied' | 'in-use' | 'unavailable' | null;
  onDismissError: () => void;
  onEditProfile: () => void;
  profile: Profile | null;
}

export function Landing({ onStart, starting, mediaError, onDismissError, onEditProfile, profile }: LandingProps) {
  if (mediaError) {
    const copy = {
      denied: {
        title: 'Camera & mic blocked',
        body: "Click the camera icon in your browser's address bar, allow access, then try again."
      },
      'in-use': {
        title: 'Camera is busy',
        body: 'Another tab or app is using your camera. Close it (Zoom, another tab, etc.) and try again.'
      },
      unavailable: {
        title: "Couldn't reach your camera",
        body: 'Make sure a camera and microphone are connected, then try again.'
      }
    }[mediaError];
    return (
      <div className="error-screen">
        <div className="error-card">
          <div className="error-icon">📵</div>
          <h2>{copy.title}</h2>
          <p>{copy.body}</p>
          <button className="cta-primary" onClick={() => { onDismissError(); onStart(); }}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="landing">
      <Nav onStart={onStart} starting={starting} onEditProfile={onEditProfile} profile={profile} />
      <Hero onStart={onStart} starting={starting} onEditProfile={onEditProfile} hasProfile={hasMeaningfulProfile(profile)} />
      <HowItWorks />
      <WhyGlimpse />
      <Safety />
      <FAQ />
      <FinalCTA onStart={onStart} starting={starting} />
      <Footer />
    </div>
  );
}

function Nav({ onStart, starting, onEditProfile, profile }: {
  onStart: () => void;
  starting: boolean;
  onEditProfile: () => void;
  profile: Profile | null;
}) {
  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const profileLabel = hasMeaningfulProfile(profile) ? 'Edit profile' : 'Create profile';
  return (
    <nav className="landing-nav">
      <div className="landing-nav-inner">
        <a className="landing-logo" href="#top">
          <span className="landing-logo-mark">👀</span>
          <span className="landing-logo-text">Glimpse</span>
        </a>
        <div className="landing-nav-links">
          <button onClick={() => scrollTo('how')}>How it works</button>
          <button onClick={() => scrollTo('why')}>Why</button>
          <button onClick={() => scrollTo('safety')}>Safety</button>
          <button onClick={() => scrollTo('faq')}>FAQ</button>
        </div>
        <button className="nav-profile" onClick={onEditProfile}>
          {profile?.photo ? (
            <img className="nav-profile-pic" src={profile.photo} alt="profile" />
          ) : (
            <span className="nav-profile-icon">👤</span>
          )}
          <span className="nav-profile-label">{profileLabel}</span>
        </button>
        <button className="cta-pill" onClick={onStart} disabled={starting}>
          {starting ? 'Starting…' : 'Start'}
        </button>
      </div>
    </nav>
  );
}

function Hero({ onStart, starting, onEditProfile, hasProfile }: {
  onStart: () => void;
  starting: boolean;
  onEditProfile: () => void;
  hasProfile: boolean;
}) {
  return (
    <section id="top" className="hero">
      <div className="hero-glow" aria-hidden />
      <div className="hero-inner">
        <div className="hero-badge">No account. No filter. Just face-to-face.</div>
        <h1 className="hero-title">
          <span>Skip the bio.</span>
          <span className="hero-title-accent">Start with eye contact.</span>
        </h1>
        <p className="hero-sub">
          Two minutes. One real face. The chemistry meter reads the vibe. If you both swipe right, you exchange profiles and keep talking.
        </p>
        <div className="hero-ctas">
          <button className="cta-primary cta-large" onClick={onStart} disabled={starting}>
            {starting ? 'Starting your camera…' : 'Find a match'}
            <span className="cta-arrow">→</span>
          </button>
          <button className="cta-secondary" onClick={onEditProfile}>
            {hasProfile ? 'Edit your profile' : 'Create your profile'}
          </button>
        </div>
        <div className="hero-trust">
          <span>🔒 No account required</span>
          <span className="hero-trust-dot">•</span>
          <span>📵 Nothing stored on a server</span>
          <span className="hero-trust-dot">•</span>
          <span>⚡ Instant matches</span>
        </div>
      </div>
      <HeroVisual />
    </section>
  );
}

function HeroVisual() {
  return (
    <div className="hero-visual" aria-hidden>
      <div className="hero-phone">
        <div className="hero-phone-screen">
          <div className="hero-mock-topbar">
            <span className="hero-mock-brand">Glimpse</span>
            <span className="hero-mock-chemistry">💘 78%</span>
            <span className="hero-mock-timer">1:24</span>
          </div>
          <div className="hero-mock-stage">
            <div className="hero-mock-remote" />
            <div className="hero-mock-local" />
          </div>
          <div className="hero-mock-controls">
            <span className="hero-mock-btn hero-mock-nope">✕</span>
            <span className="hero-mock-btn hero-mock-like">♥</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function HowItWorks() {
  const steps = [
    { n: '01', icon: '🎥', title: 'Tap to match', body: 'One click. Camera turns on, queue finds someone in seconds. No signup, no waiting.' },
    { n: '02', icon: '⏱️', title: 'Two minutes together', body: 'No swiping yet. No skipping. Just a real face on camera. The chemistry meter reads your conversation in real time.' },
    { n: '03', icon: '💞', title: 'Both right = match', body: 'When the timer ends and you both swipe right, you swap profiles, keep talking, and trade contact. Anything less, you move on.' }
  ];
  return (
    <section id="how" className="section section-how">
      <div className="section-inner">
        <div className="section-eyebrow">How it works</div>
        <h2 className="section-title">Three minutes from curious to matched.</h2>
        <div className="step-grid">
          {steps.map(s => (
            <div className="step-card" key={s.n}>
              <div className="step-icon">{s.icon}</div>
              <div className="step-num">{s.n}</div>
              <div className="step-title">{s.title}</div>
              <div className="step-body">{s.body}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function WhyGlimpse() {
  const points = [
    {
      icon: '👁',
      title: 'See them, not their highlight reel',
      body: 'Photos lie. Bios are theater. A face on camera is the truth.'
    },
    {
      icon: '⏳',
      title: 'A timer that builds chemistry',
      body: 'Two minutes is too short to fake a personality and too long to coast. You show up or you don\'t.'
    },
    {
      icon: '💬',
      title: 'Sentiment-aware vibe meter',
      body: 'A real-time read of the conversation tells you both whether the spark is real.'
    },
    {
      icon: '🔥',
      title: 'No profile to maintain',
      body: 'No prompts to write, no photos to curate. Just show up and be yourself.'
    }
  ];
  return (
    <section id="why" className="section section-why">
      <div className="section-inner">
        <div className="section-eyebrow">Why Glimpse</div>
        <h2 className="section-title">
          Dating apps made you a salesperson. <span className="accent">Glimpse makes you a person.</span>
        </h2>
        <div className="why-grid">
          {points.map((p, i) => (
            <div className="why-card" key={i}>
              <div className="why-icon">{p.icon}</div>
              <div className="why-title">{p.title}</div>
              <div className="why-body">{p.body}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Safety() {
  const items = [
    { icon: '🚫', title: 'No history stored', body: 'Conversations are peer-to-peer. Nothing is recorded, saved, or sold.' },
    { icon: '🆔', title: 'No account, no email', body: 'Show up, match, leave. No data trail.' },
    { icon: '🚩', title: 'One-tap reporting', body: 'See something off? Report ends the session immediately and flags the user.' },
    { icon: '🔐', title: 'Encrypted in transit', body: 'WebRTC end-to-end. Only you and your match see the call.' }
  ];
  return (
    <section id="safety" className="section section-safety">
      <div className="section-inner">
        <div className="section-eyebrow">Safety & privacy</div>
        <h2 className="section-title">Built private by default.</h2>
        <div className="safety-grid">
          {items.map((it, i) => (
            <div className="safety-card" key={i}>
              <div className="safety-icon">{it.icon}</div>
              <div className="safety-text">
                <div className="safety-title">{it.title}</div>
                <div className="safety-body">{it.body}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FAQ() {
  const items = [
    {
      q: 'Do I need to make an account?',
      a: 'No. There are no logins, profiles, or signups. You hit the button, your camera turns on, and you\'re in the queue. Done.'
    },
    {
      q: "Why a 2-minute timer?",
      a: "Long enough to feel a real moment, short enough that no one's wasting a Saturday. The timer is also why both people stay present — they can't just bail at the first awkward second."
    },
    {
      q: 'Do I need a profile?',
      a: "No — matching works without one. But if you want the person you matched with to actually know who you are, make a quick profile (name, photo, bio). It's stored on your device, never on a server, and only sent to people you both swipe right on."
    },
    {
      q: 'What is the chemistry score?',
      a: 'A live read of your conversation\'s sentiment as you chat. It\'s a vibe meter, not a verdict — meant to give you a pulse on how the conversation is landing.'
    },
    {
      q: 'What happens after we match?',
      a: 'You stay on the call as long as you want. There\'s also a contact-exchange step so you can keep talking after.'
    },
    {
      q: 'Is this safe?',
      a: 'Calls are encrypted peer-to-peer (WebRTC). Nothing is recorded server-side. There\'s a one-tap report button if anyone behaves badly. We log the report and end the session immediately.'
    },
    {
      q: "What if I don't want to match with someone?",
      a: 'Hit Next any time, or swipe left after the timer ends. Either disconnects and finds you a new match in seconds.'
    }
  ];
  return (
    <section id="faq" className="section section-faq">
      <div className="section-inner">
        <div className="section-eyebrow">Questions</div>
        <h2 className="section-title">Everything you'd want to know.</h2>
        <div className="faq-list">
          {items.map((it, i) => (
            <FAQItem key={i} q={it.q} a={it.a} />
          ))}
        </div>
      </div>
    </section>
  );
}

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <button
      type="button"
      className={`faq-item ${open ? 'faq-open' : ''}`}
      onClick={() => setOpen(o => !o)}
    >
      <div className="faq-q">
        <span>{q}</span>
        <span className="faq-toggle">{open ? '−' : '+'}</span>
      </div>
      {open && <div className="faq-a">{a}</div>}
    </button>
  );
}

function FinalCTA({ onStart, starting }: { onStart: () => void; starting: boolean }) {
  return (
    <section className="section section-final">
      <div className="final-card">
        <div className="final-glow" aria-hidden />
        <h2 className="final-title">Your next match is online right now.</h2>
        <p className="final-sub">Two minutes of your time. The worst case is you meet someone weird. The best case is you don't.</p>
        <button className="cta-primary cta-large" onClick={onStart} disabled={starting}>
          {starting ? 'Starting your camera…' : 'Find a match'}
          <span className="cta-arrow">→</span>
        </button>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="landing-footer">
      <div className="landing-footer-inner">
        <div className="landing-footer-brand">
          <span className="landing-logo-mark">👀</span>
          <span className="landing-logo-text">Glimpse</span>
        </div>
        <div className="landing-footer-tag">60 seconds. One glimpse. No filter.</div>
        <div className="landing-footer-meta">© {new Date().getFullYear()} Glimpse · glimpse.dating</div>
      </div>
    </footer>
  );
}

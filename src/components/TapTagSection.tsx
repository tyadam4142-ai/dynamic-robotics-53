import React, { useState, useEffect } from 'react';
import { Zap, Smartphone, Check, ExternalLink, RotateCw, Upload, Image as ImageIcon, Wifi } from 'lucide-react';
import confetti from 'canvas-confetti';
import { Reveal } from './Fx';
import { asset } from '../lib/asset';

type Plan = 'card' | 'sticker';

const PLANS: Record<Plan, { name: string; price: number; note: string; perks: string[] }> = {
  card: {
    name: 'Hard Top Card',
    price: 753,
    note: 'Wallet-size, dual-sided custom print',
    perks: ['Dual-sided custom artwork', 'Gold-foil DR53 finish', 'Works on any phone, no app'],
  },
  sticker: {
    name: 'Sticker',
    price: 553,
    note: 'Stick on phone case, counter or shop glass',
    perks: ['Waterproof adhesive disc', 'Custom link setup', 'Sun & weather resistant'],
  },
};

const FRONT = 'assets/projects/tap-tag-front.jpg';
const BACK = 'assets/projects/tap-tag-back.jpg';

export const TapTagSection: React.FC = () => {
  const [isFlipped, setIsFlipped] = useState(false);
  const [frontImage, setFrontImage] = useState<string>(asset(FRONT));
  const [backImage, setBackImage] = useState<string>(asset(BACK));
  const [activeSimulator, setActiveSimulator] = useState(false);
  const [plan, setPlan] = useState<Plan>('card');

  const playTapAudio = () => {
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.06, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } catch {
      /* audio unavailable */
    }
  };

  const triggerTapSimulation = () => {
    setActiveSimulator(true);
    playTapAudio();
    confetti({ particleCount: 70, spread: 75, origin: { y: 0.6 }, colors: ['#f1ca62', '#c99a2e', '#ffffff'] });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const t = e.target as HTMLElement;
      if (t && ['INPUT', 'TEXTAREA'].includes(t.tagName)) return;
      setIsFlipped((p) => !p);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const upload = (setter: (u: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setter(URL.createObjectURL(file));
  };

  const chosen = PLANS[plan];
  const waLink = `https://wa.me/918149916052?text=${encodeURIComponent(`Hi Adam, I want to order the Tap Tag ${chosen.name} for ₹${chosen.price}.`)}`;

  return (
    <section className="relative w-full py-16 lg:py-24 overflow-hidden border-t border-[rgba(241,202,98,0.2)]" id="taptag">
      <div className="absolute inset-0 bg-radial-vignette opacity-80 pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[350px] bg-[#c99a2e]/10 blur-[130px] rounded-full pointer-events-none animate-pulse-glow" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        <Reveal className="text-center max-w-3xl mx-auto space-y-3">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#f1ca62]/10 border border-[#f1ca62]/35 text-xs font-mono text-[#f1ca62] uppercase tracking-wider">
            <Zap className="w-3.5 h-3.5 fill-[#f1ca62]" />
            Instant Tap Technology
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white">
            Design Your <span className="text-gradient-animated">Tap Tag</span>
          </h2>
          <p className="text-zinc-300 text-sm sm:text-base leading-relaxed">
            One tap on any smartphone shares your website, WhatsApp, catalog or contact card. <strong>No app needed.</strong> Preview both sides, upload your own artwork and pick your Tap Tag.
          </p>
        </Reveal>

        <Reveal delay={0.1}>
          <div className="max-w-5xl mx-auto p-6 sm:p-8 rounded-3xl bg-gradient-to-b from-[#08182d] via-[#050e1c] to-[#02060d] border border-[rgba(241,202,98,0.35)] shadow-[0_20px_70px_rgba(0,0,0,0.85)] glow-pulse relative overflow-hidden">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              {/* Left: 3D card */}
              <div className="lg:col-span-7 flex flex-col items-center justify-center space-y-5">
                <div className="flex items-center justify-between w-full max-w-[440px] px-2 text-xs font-mono">
                  <span className="text-[#f1ca62] flex items-center gap-1.5 font-bold">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                    Showing: {isFlipped ? 'Backside' : 'Front Side'}
                  </span>
                  <span className="text-zinc-400 text-[11px]">Tap the card to flip</span>
                </div>

                <div className="relative w-full max-w-[440px]">
                  {/* NFC ripples behind the card */}
                  <div className="absolute inset-0 pointer-events-none">
                    <span className="nfc-ripple" />
                    <span className="nfc-ripple" style={{ animationDelay: '1.4s' }} />
                  </div>
                  <div
                    className="relative w-full aspect-[1.586/1] cursor-pointer animate-float"
                    style={{ perspective: '1200px' }}
                    onClick={() => setIsFlipped((f) => !f)}
                  >
                    <div
                      className="relative w-full h-full rounded-2xl transition-transform duration-700 shadow-2xl"
                      style={{ transformStyle: 'preserve-3d', transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}
                    >
                      {[{ src: frontImage, label: 'Front Side', flip: false }, { src: backImage, label: 'Backside', flip: true }].map((side) => (
                        <div
                          key={side.label}
                          className="absolute inset-0 rounded-2xl overflow-hidden border-2 border-[#f1ca62] shadow-[0_0_40px_rgba(201,154,46,0.35)] bg-black"
                          style={{ backfaceVisibility: 'hidden', transform: side.flip ? 'rotateY(180deg)' : undefined }}
                        >
                          <img src={side.src} alt={`DR53 Tap Tag ${side.label}`} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent pointer-events-none" />
                          <span className="absolute top-3 right-3 px-2 py-0.5 rounded-full bg-black/80 border border-[#f1ca62] text-[10px] font-mono text-[#f1ca62] uppercase tracking-wider">
                            {side.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
                  <button onClick={() => setIsFlipped((f) => !f)} className="btn-shimmer px-4 py-2 rounded-xl bg-[#f1ca62] text-black font-bold text-xs uppercase tracking-wider hover:bg-white flex items-center gap-1.5 shadow-md transition-all">
                    <RotateCw className="w-3.5 h-3.5" />
                    <span>{isFlipped ? 'Flip to Front' : 'Flip to Back'}</span>
                  </button>
                  <button onClick={triggerTapSimulation} className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#25d366] to-[#128c4a] text-black font-bold text-xs uppercase tracking-wider hover:shadow-lg hover:scale-105 flex items-center gap-1.5 transition-all">
                    <Smartphone className="w-3.5 h-3.5 fill-black" />
                    <span>Test Touch to Phone</span>
                  </button>
                  <button
                    onClick={() => { setFrontImage(asset(FRONT)); setBackImage(asset(BACK)); }}
                    className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-zinc-400 hover:text-white text-xs font-mono transition-colors"
                  >
                    Reset Design
                  </button>
                </div>
              </div>

              {/* Right: pricing + upload, all in the design panel */}
              <div className="lg:col-span-5 space-y-4">
                <div className="p-4 rounded-2xl bg-black/60 border border-[rgba(241,202,98,0.25)] space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-white/10">
                    <span className="text-xs font-mono font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                      <Wifi className="w-3.5 h-3.5 text-[#f1ca62]" />
                      Choose Your Tap Tag
                    </span>
                    <span className="text-[10px] font-mono text-[#f1ca62]">One-time price</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {(Object.keys(PLANS) as Plan[]).map((key) => {
                      const p = PLANS[key];
                      const on = plan === key;
                      return (
                        <button
                          key={key}
                          onClick={() => setPlan(key)}
                          className={`relative p-3.5 rounded-xl text-left border-2 transition-all duration-300 hover:-translate-y-1 ${on ? 'border-[#f1ca62] bg-[#f1ca62]/10 shadow-[0_0_25px_rgba(241,202,98,0.3)]' : 'border-white/10 bg-white/5 hover:border-[#f1ca62]/50'}`}
                        >
                          {on && <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-[#f1ca62] text-black flex items-center justify-center anim-pop"><Check className="w-3 h-3" /></span>}
                          <span className="block text-[11px] font-mono text-zinc-400 uppercase tracking-wider">{p.name}</span>
                          <span className="block text-3xl font-bold font-mono text-[#f1ca62] mt-1">₹{p.price}</span>
                        </button>
                      );
                    })}
                  </div>

                  <div key={plan} className="anim-pop space-y-1.5">
                    <p className="text-[11px] text-zinc-300">{chosen.note}</p>
                    {chosen.perks.map((perk) => (
                      <div key={perk} className="flex items-center gap-2 text-xs text-zinc-300">
                        <Check className="w-3.5 h-3.5 text-[#f1ca62] shrink-0" />
                        <span>{perk}</span>
                      </div>
                    ))}
                  </div>

                  <a href={waLink} target="_blank" rel="noopener noreferrer" className="btn-shimmer w-full py-3 rounded-xl bg-gradient-to-r from-[#25d366] to-[#128c4a] text-black font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-[0_0_25px_rgba(37,211,102,0.4)] hover:scale-[1.02] transition-all">
                    <span>Order {chosen.name} · ₹{chosen.price}</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>

                <div className="p-4 rounded-2xl bg-black/60 border border-[rgba(241,202,98,0.25)] space-y-3">
                  <span className="text-xs font-mono font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                    <Upload className="w-3.5 h-3.5 text-[#f1ca62]" />
                    Upload Your Design
                  </span>
                  {[{ label: 'Front side', set: setFrontImage }, { label: 'Backside', set: setBackImage }].map((u) => (
                    <label key={u.label} className="flex items-center gap-2 p-2.5 rounded-xl border border-white/15 bg-white/5 hover:border-[#f1ca62] cursor-pointer transition-colors text-xs text-zinc-300">
                      <ImageIcon className="w-4 h-4 text-[#f1ca62] shrink-0" />
                      <span className="truncate">Choose {u.label} image…</span>
                      <input type="file" accept="image/*" onChange={upload(u.set)} className="hidden" />
                    </label>
                  ))}
                  <div className="text-[10px] font-mono text-zinc-500">Card size: CR80 (85.6mm × 54mm).</div>
                </div>

                {activeSimulator && (
                  <div className="anim-pop p-3.5 rounded-xl bg-gradient-to-r from-[#0c2038] to-[#071324] border border-[#f1ca62] shadow-[0_0_25px_rgba(241,202,98,0.25)] space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-mono">
                      <div className="flex items-center gap-1.5 text-[#f1ca62] font-bold">
                        <Zap className="w-3.5 h-3.5 fill-[#f1ca62]" />
                        <span>INSTANT TAP DETECTED</span>
                      </div>
                      <span className="text-zinc-400">Just now</span>
                    </div>
                    <p className="text-xs font-bold text-white">Dynamic Robotics 53 — Adam Bhaimia</p>
                    <a href="https://wa.me/918149916052?text=Hi%20Adam%2C%20I%20tested%20your%20DR53%20Tap%20Tag!" target="_blank" rel="noopener noreferrer" className="inline-flex px-3 py-1.5 rounded-lg bg-[#25d366] text-black font-bold text-[11px] font-mono items-center gap-1 hover:scale-105 transition-transform">
                      <span>Open WhatsApp Chat</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
};

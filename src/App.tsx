import React, { useState } from 'react';
import { 
  Bot, Hand, Eye, Cpu, Sparkles, Trash2, BatteryCharging, Zap, Globe, 
  MessageSquare, ExternalLink, Menu, X, ArrowUpRight, ShieldCheck, 
  Layers, MapPin, Award, CheckCircle2, ChevronRight
} from 'lucide-react';
import { SplashScreen } from './components/SplashScreen';
import { BrandLogo } from './components/BrandLogo';
import { DigitalAdScreen } from './components/DigitalAdScreen';
import { WebsiteConfigurator } from './components/WebsiteConfigurator';
import { TapTagSection } from './components/TapTagSection';
import { T53Section } from './components/T53Section';
import { Chatbot } from './components/Chatbot';
import { PRODUCTS } from './data/products';
import { Reveal, Tilt, ScrollProgress, CursorGlow } from './components/Fx';

// Official WhatsApp Vector Icon
const WhatsAppIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor">
    <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.84 9.84 0 0 0 12.04 2m.01 1.67c4.54 0 8.24 3.7 8.24 8.24 0 2.2-.86 4.27-2.42 5.82a8.19 8.19 0 0 1-5.83 2.42c-1.46 0-2.89-.39-4.14-1.13l-.3-.18-3.08.81.82-3-.19-.31c-.81-1.3-1.24-2.81-1.24-4.37 0-4.54 3.7-8.24 8.24-8.24m4.52 11.23c-.25-.13-1.47-.72-1.7-.81-.23-.08-.39-.13-.56.13-.17.25-.66.81-.81.98-.15.17-.3.19-.55.06-.25-.13-1.05-.39-2-1.23-.74-.66-1.24-1.47-1.39-1.72-.15-.25-.02-.38.11-.51.11-.11.25-.29.37-.44.13-.15.17-.25.25-.42.08-.17.04-.31-.02-.44-.06-.13-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43h-.48c-.17 0-.44.06-.67.31-.23.25-.88.86-.88 2.1 0 1.24.9 2.44 1.03 2.61.13.17 1.76 2.68 4.26 3.76.6.26 1.06.41 1.42.53.6.19 1.15.16 1.58.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.15-1.18-.07-.1-.23-.17-.48-.3z"/>
  </svg>
);

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'robotics' | 'hardware' | 'web'>('all');
  const [showWebsiteModal, setShowWebsiteModal] = useState(false);

  const filteredProducts = activeTab === 'all' 
    ? PRODUCTS 
    : PRODUCTS.filter(p => {
        if (activeTab === 'robotics') return ['robotics', 'wearable', 'mechatronics', 'ai'].includes(p.category);
        if (activeTab === 'hardware') return ['electronics', 'hardware', 'taptag'].includes(p.category);
        if (activeTab === 'web') return p.category === 'web';
        return true;
      });

  return (
    <div className="min-h-screen bg-[#030711] text-[#f5f7fb] selection:bg-[#c99a2e] selection:text-black relative">
      
      {/* Splash Screen on Initial Load with Exact Logo */}
      {showSplash && <SplashScreen onComplete={() => setShowSplash(false)} />}

      <ScrollProgress />
      <CursorGlow />
      <div className="orb top-20 -left-20 w-[420px] h-[420px] bg-[#c99a2e]/15" />
      <div className="orb bottom-10 -right-20 w-[480px] h-[480px] bg-[#1d4ed8]/10" style={{ animationDelay: '-6s' }} />

      {/* Background Ambience Layers */}
      <div className="fixed inset-0 bg-tech-grid opacity-35 pointer-events-none -z-10" />
      <div className="fixed top-0 left-1/4 w-[600px] h-[500px] bg-[#c99a2e]/10 blur-[140px] rounded-full pointer-events-none -z-10" />
      <div className="fixed bottom-0 right-1/4 w-[600px] h-[500px] bg-[#0c2038]/60 blur-[160px] rounded-full pointer-events-none -z-10" />

      {/* Navigation Header */}
      <header className="sticky top-0 z-40 w-full border-b border-[rgba(241,202,98,0.2)] bg-[#030711]/90 backdrop-blur-xl transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between gap-4">
          
          {/* Official DR53 Exact Logo */}
          <a href="#" className="flex items-center gap-3 group">
            <BrandLogo className="w-12 h-12" />
            <div>
              <div className="font-bold text-lg tracking-tight text-white flex items-center gap-1.5">
                Dynamic Robotics <span className="text-[#f1ca62]">53</span>
              </div>
              <span className="text-[10px] font-mono text-zinc-400 block -mt-1 tracking-wider uppercase">
                Studio · Pune, India
              </span>
            </div>
          </a>

          {/* Desktop Navigation Links */}
          <nav className="hidden lg:flex items-center gap-6 text-xs font-mono tracking-wider uppercase text-zinc-400">
            <a href="#billboard" className="hover:text-[#f1ca62] transition-colors">Ad Screen</a>
            <a href="#projects" className="hover:text-[#f1ca62] transition-colors">Builds (7)</a>
            <a href="#taptag" className="hover:text-[#f1ca62] text-[#f1ca62] font-semibold transition-colors flex items-center gap-1">
              <span>Tap Tag</span>
              <span className="w-1.5 h-1.5 rounded-full bg-[#f1ca62] animate-ping" />
            </a>
            <a href="#t53" className="dr53-nav-t53">
              <span>T53</span>
              <span className="dr53-nav-badge">NEW</span>
            </a>
            {/* Direct Instant Launcher for Website Studio (No Need to Scroll Down!) */}
            <button 
              onClick={() => setShowWebsiteModal(true)}
              className="px-3 py-1.5 rounded-lg bg-[#f1ca62]/10 hover:bg-[#f1ca62] text-[#f1ca62] hover:text-black border border-[#f1ca62]/40 font-semibold transition-all flex items-center gap-1"
            >
              <span>Build Your Website</span>
              <Sparkles className="w-3 h-3" />
            </button>
            <a href="#services" className="hover:text-[#f1ca62] transition-colors">Services</a>
            <a href="#milestones" className="hover:text-[#f1ca62] transition-colors">Milestones</a>
            <a href="#contact" className="hover:text-[#f1ca62] transition-colors">Contact</a>
          </nav>

          {/* Action WhatsApp Button (ZIP button removed from public site) */}
          <div className="hidden sm:flex items-center gap-3">
            <a
              href="https://wa.me/918149916052?text=Hi%20Adam%2C%20I%20want%20to%20start%20a%20project%20with%20DR53."
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-r from-[#25d366] to-[#128c4a] text-black font-bold text-xs uppercase tracking-wider hover:shadow-[0_0_25px_rgba(37,211,102,0.5)] hover:scale-105 active:scale-95 transition-all"
            >
              <WhatsAppIcon className="w-4 h-4 fill-black" />
              <span>WhatsApp Direct</span>
            </a>
          </div>

          {/* Mobile Menu Trigger */}
          <div className="flex items-center gap-2 lg:hidden">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-zinc-300 hover:text-white"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>

        </div>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-b border-white/10 bg-[#06101f]/98 backdrop-blur-2xl px-6 py-6 space-y-4">
            <div className="flex flex-col space-y-3 font-mono text-sm tracking-wider uppercase text-zinc-300">
              <a 
                href="#billboard" 
                onClick={() => setMobileMenuOpen(false)}
                className="py-2 border-b border-white/5 hover:text-[#f1ca62]"
              >
                01. Digital Ad Screen
              </a>
              <a 
                href="#projects" 
                onClick={() => setMobileMenuOpen(false)}
                className="py-2 border-b border-white/5 hover:text-[#f1ca62]"
              >
                02. Hardware Builds
              </a>
              <a 
                href="#taptag" 
                onClick={() => setMobileMenuOpen(false)}
                className="py-2 border-b border-white/5 text-[#f1ca62] font-bold"
              >
                03. Tap Tag
              </a>
              <a 
                href="#t53" 
                onClick={() => setMobileMenuOpen(false)}
                className="py-2 border-b border-white/5 text-white font-bold flex items-center justify-between"
              >
                <span>04. T53 · Telecom 53</span>
                <span className="text-[9px] font-mono text-black bg-[#f1ca62] px-2 py-0.5 rounded-full">NEW</span>
              </a>
              <button 
                onClick={() => { setMobileMenuOpen(false); setShowWebsiteModal(true); }}
                className="py-2 border-b border-white/5 text-left text-[#f1ca62] font-bold flex items-center justify-between"
              >
                <span>05. Build Your Website</span>
                <Sparkles className="w-4 h-4" />
              </button>
              <a 
                href="#services" 
                onClick={() => setMobileMenuOpen(false)}
                className="py-2 border-b border-white/5 hover:text-[#f1ca62]"
              >
                06. Engineering Services
              </a>
              <a 
                href="#milestones" 
                onClick={() => setMobileMenuOpen(false)}
                className="py-2 border-b border-white/5 hover:text-[#f1ca62]"
              >
                07. Milestones (BIEA/WSC)
              </a>
              <a 
                href="#contact" 
                onClick={() => setMobileMenuOpen(false)}
                className="py-2 hover:text-[#f1ca62]"
              >
                08. Contact & Visit
              </a>
            </div>

            <div className="pt-4 flex flex-col gap-3">
              <a
                href="https://wa.me/918149916052?text=Hi%20Adam%2C%20I%20want%20to%20start%20a%20project%20with%20DR53."
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-3 rounded-full bg-[#25d366] text-black font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg"
              >
                <WhatsAppIcon className="w-4 h-4 fill-black" />
                <span>Chat with Adam on WhatsApp</span>
              </a>
            </div>
          </div>
        )}
      </header>

      {/* HERO SECTION */}
      <section className="relative pt-12 pb-16 lg:pt-16 lg:pb-24 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            
            {/* Left Column: Headlines & Actions */}
            <div className="lg:col-span-7 space-y-6">
              
              {/* Kicker badge */}
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#f1ca62]/10 border border-[#f1ca62]/35 text-xs font-mono text-[#f1ca62] tracking-wider uppercase">
                <span className="w-2 h-2 rounded-full bg-[#f1ca62] animate-ping" />
                <span>Engineering Studio / Pune / India · Adam Bhaimia</span>
              </div>

              {/* Main Headline */}
              <h1 className="text-4xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-white uppercase leading-[1.05]">
                Building <br className="hidden sm:inline" />
                <span className="text-gradient-animated">
                  Intelligent Machines
                </span>
                <br />
                &amp; Digital Systems.
              </h1>

              {/* Subtitle */}
              <p className="text-zinc-300 text-base sm:text-lg max-w-xl leading-relaxed">
                Physical robotics, embedded electronics, AI vision systems, Tap Tag touchless cards, and custom business websites engineered in Pune.
              </p>

              {/* Hero Quick CTAs (Direct launcher for Website Studio included!) */}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <a
                  href="#projects"
                  className="btn-shimmer px-6 py-3.5 rounded-full bg-gradient-to-r from-[#c99a2e] to-[#f1ca62] text-black font-bold text-xs uppercase tracking-wider shadow-[0_0_30px_rgba(201,154,46,0.35)] hover:shadow-[0_0_45px_rgba(201,154,46,0.5)] hover:scale-105 active:scale-95 transition-all"
                >
                  Explore Hardware Builds ↗
                </a>

                {/* Instant Launcher for Website Studio (No Need to Scroll Down!) */}
                <button
                  onClick={() => setShowWebsiteModal(true)}
                  className="btn-shimmer px-6 py-3.5 rounded-full bg-[#f1ca62] text-black font-bold text-xs uppercase tracking-wider shadow-[0_0_25px_rgba(241,202,98,0.35)] hover:bg-white hover:scale-105 transition-all flex items-center gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Build Your Website (from ₹5,300)</span>
                </button>

                <a
                  href="#taptag"
                  className="px-5 py-3.5 rounded-full bg-black/60 hover:bg-[#f1ca62]/10 text-[#f1ca62] border border-[#f1ca62]/30 font-mono text-xs uppercase tracking-wider transition-all"
                >
                  Tap Tag (from ₹553)
                </a>
                <a
                  href="#t53"
                  className="px-5 py-3.5 rounded-full bg-[#f1ca62]/10 hover:bg-[#f1ca62] hover:text-black text-[#f1ca62] border border-[#f1ca62]/35 font-mono text-xs uppercase tracking-wider transition-all"
                >
                  T53 for Families →
                </a>
              </div>

              {/* Quick Proof Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-6 border-t border-white/10">
                <div className="space-y-1">
                  <div className="text-xl sm:text-2xl font-bold font-mono text-[#f1ca62]">7+ Builds</div>
                  <div className="text-xs text-zinc-400 font-mono uppercase">Working Hardware</div>
                </div>
                <div className="space-y-1">
                  <div className="text-xl sm:text-2xl font-bold font-mono text-[#f1ca62]">BIEA 2026</div>
                  <div className="text-xs text-zinc-400 font-mono uppercase">A-Zero Milestone</div>
                </div>
                <div className="space-y-1">
                  <div className="text-xl sm:text-2xl font-bold font-mono text-[#f1ca62]">₹5,300</div>
                  <div className="text-xs text-zinc-400 font-mono uppercase">Website Launch</div>
                </div>
                <div className="space-y-1">
                  <div className="text-xl sm:text-2xl font-bold font-mono text-[#f1ca62]">1:1 Founder</div>
                  <div className="text-xs text-zinc-400 font-mono uppercase">Direct WhatsApp</div>
                </div>
              </div>

            </div>

            {/* Right Column: Hero Visual with Real Logo & Scanning Orbit */}
            <div className="lg:col-span-5 flex items-center justify-center">
              <div className="relative p-7 sm:p-8 rounded-3xl bg-gradient-to-br from-[#0c1c30] via-[#06101f] to-black border border-[rgba(241,202,98,0.35)] shadow-[0_20px_70px_rgba(0,0,0,0.85),0_0_50px_rgba(201,154,46,0.18)] max-w-sm w-full relative overflow-hidden group">
                
                {/* Laser scan line */}
                <div className="absolute inset-0 pointer-events-none overflow-hidden">
                  <div className="w-full h-1 bg-[#f1ca62] opacity-50 animate-scan" />
                </div>

                {/* Orbit ring */}
                <div className="absolute -inset-10 rounded-full border border-dashed border-[#f1ca62]/20 animate-spin-slow pointer-events-none" />

                {/* Top Telemetry */}
                <div className="flex items-center justify-between text-[11px] font-mono pb-4 mb-4 border-b border-white/10">
                  <span className="text-zinc-400">DR53 / Core System</span>
                  <span className="text-emerald-400 font-bold flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                    ONLINE
                  </span>
                </div>

                {/* Central Official Logo Presentation */}
                <div className="relative py-4 flex flex-col items-center text-center">
                  <div className="w-28 h-28 animate-float rounded-2xl overflow-hidden border-2 border-[#f1ca62] shadow-[0_0_35px_rgba(241,202,98,0.4)] mb-3 group-hover:scale-105 transition-transform duration-500">
                    <BrandLogo className="w-full h-full" />
                  </div>
                  <span className="text-lg font-bold text-white tracking-wide">
                    Dynamic Robotics <b className="text-[#f1ca62]">53</b>
                  </span>
                  <span className="text-xs font-mono text-zinc-400 mt-0.5">
                    Adam Bhaimia · Pune, India
                  </span>
                </div>

                {/* Readouts */}
                <div className="space-y-2 pt-4 border-t border-white/10 text-xs font-mono">
                  <div className="flex justify-between items-center py-1">
                    <span className="text-zinc-400">01 · Autonomous Robotics</span>
                    <span className="text-emerald-400 font-bold">READY</span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-zinc-400">02 · AI Vision Inspection</span>
                    <span className="text-emerald-400 font-bold">READY</span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-zinc-400">03 · Tap Tag Device</span>
                    <span className="text-[#f1ca62] font-bold">ACTIVE</span>
                  </div>
                </div>

              </div>
            </div>

          </div>

        </div>
      </section>

      {/* QUICK START — FRIENDLY LAUNCHER */}
      <section className="dr53-quickstart-wrap" aria-label="Quick start options">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          <div className="dr53-quickstart-card">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
              <div>
                <div className="inline-flex items-center gap-2 text-[10px] sm:text-xs font-mono uppercase tracking-[0.18em] text-[#f1ca62]">
                  <Sparkles className="w-3.5 h-3.5" />
                  Start here
                </div>
                <h2 className="mt-1 text-xl sm:text-2xl font-bold text-white">What are you looking to build?</h2>
                <p className="mt-1 text-sm text-zinc-300">Jump straight to the part of DR53 that matches your idea.</p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 w-full lg:w-auto lg:min-w-[860px]">
                <a href="#projects" className="dr53-quick-action">
                  <Cpu className="w-4 h-4" />
                  <span>Robot / Hardware</span>
                  <ArrowUpRight className="w-3.5 h-3.5 ml-auto opacity-60" />
                </a>
                <a href="#services" className="dr53-quick-action">
                  <Eye className="w-4 h-4" />
                  <span>AI Vision</span>
                  <ArrowUpRight className="w-3.5 h-3.5 ml-auto opacity-60" />
                </a>
                <a href="#taptag" className="dr53-quick-action">
                  <Zap className="w-4 h-4" />
                  <span>Tap Tag</span>
                  <ArrowUpRight className="w-3.5 h-3.5 ml-auto opacity-60" />
                </a>
                <a href="#t53" className="dr53-quick-action dr53-quick-t53">
                  <ShieldCheck className="w-4 h-4" />
                  <span>T53 for Families</span>
                  <ArrowUpRight className="w-3.5 h-3.5 ml-auto opacity-60" />
                </a>
                <button onClick={() => setShowWebsiteModal(true)} className="dr53-quick-action text-left">
                  <Globe className="w-4 h-4" />
                  <span>Build Your Website</span>
                  <ArrowUpRight className="w-3.5 h-3.5 ml-auto opacity-60" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* T53 — FAMILY PHONE PLATFORM */}
      <T53Section />

      {/* LIVE PRODUCT TICKER */}
      <div className="border-y border-[rgba(241,202,98,0.2)] bg-black/50 py-3 overflow-hidden">
        <div className="marquee-track font-mono text-xs uppercase tracking-[0.25em] text-[#f1ca62]">
          {[0, 1].map((k) => (
            <div key={k} className="flex items-center shrink-0">
              {['Autonomous Robotics', 'AI Vision', 'Tap Tag ₹553 / ₹753', 'E-Adapter', 'Talking Glove', 'Custom Websites', 'Embedded Systems', 'Made in Pune'].map((t) => (
                <span key={t + k} className="px-6 flex items-center gap-6">{t}<span className="w-1.5 h-1.5 rounded-full bg-[#f1ca62]/60" /></span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* CHANGING AD SCREEN (With Actual Photographs & Telemetry) */}
      <section className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16 lg:pb-24" id="billboard">
        <DigitalAdScreen />
      </section>

      {/* FEATURED BUILDS PORTFOLIO SECTION (With Actual Photographs) */}
      <section className="relative py-16 lg:py-24 border-t border-[rgba(241,202,98,0.18)]" id="projects">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <span className="text-xs font-mono text-[#f1ca62] uppercase tracking-wider block mb-2">
                Engineering Builds &amp; Products
              </span>
              <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
                Real Hardware. <span className="text-[#f1ca62]">Real Systems.</span>
              </h2>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-black/60 border border-white/10 text-xs font-mono">
              <button
                onClick={() => setActiveTab('all')}
                className={`px-3 py-1.5 rounded-lg transition-all ${activeTab === 'all' ? 'bg-[#f1ca62] text-black font-bold' : 'text-zinc-400 hover:text-white'}`}
              >
                All (7)
              </button>
              <button
                onClick={() => setActiveTab('robotics')}
                className={`px-3 py-1.5 rounded-lg transition-all ${activeTab === 'robotics' ? 'bg-[#f1ca62] text-black font-bold' : 'text-zinc-400 hover:text-white'}`}
              >
                Robotics &amp; AI
              </button>
              <button
                onClick={() => setActiveTab('hardware')}
                className={`px-3 py-1.5 rounded-lg transition-all ${activeTab === 'hardware' ? 'bg-[#f1ca62] text-black font-bold' : 'text-zinc-400 hover:text-white'}`}
              >
                Electronics &amp; Devices
              </button>
            </div>
          </div>

          {/* Products Grid with Real Photos */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredProducts.map((product, idx) => (
              <Reveal key={product.id} delay={(idx % 3) * 0.08}>
              <Tilt className="h-full">
              <div
                className="h-full group relative rounded-2xl bg-gradient-to-b from-[#08172b]/80 to-[#040b15] border border-[rgba(241,202,98,0.2)] hover:border-[#f1ca62] shadow-xl hover:shadow-[0_20px_50px_rgba(0,0,0,0.8),0_0_40px_rgba(201,154,46,0.15)] transition-all duration-300 flex flex-col justify-between overflow-hidden"
              >
                {/* Visual Header with Real Image */}
                <div className="relative aspect-video w-full overflow-hidden bg-black">
                  <img 
                    src={product.image} 
                    alt={product.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 filter brightness-95"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#08172b] via-transparent to-black/40" />

                  <span className="absolute top-3 left-3 px-2.5 py-0.5 rounded-full bg-black/70 backdrop-blur-md border border-[rgba(241,202,98,0.4)] text-[10px] font-mono text-[#f1ca62] uppercase tracking-wider">
                    {product.tag}
                  </span>

                  {product.price && (
                    <span className="absolute top-3 right-3 px-2.5 py-0.5 rounded-full bg-emerald-500/20 backdrop-blur-md border border-emerald-400 text-xs font-mono font-bold text-emerald-300 shadow-md">
                      {product.price}
                    </span>
                  )}
                </div>

                <div className="p-6 space-y-3.5">
                  <h3 className="text-xl font-bold text-white group-hover:text-[#f1ca62] transition-colors leading-tight">
                    {product.name}
                  </h3>

                  <p className="text-xs text-zinc-300 leading-relaxed">
                    {product.description}
                  </p>

                  {/* Highlights list */}
                  <div className="space-y-1.5 pt-1">
                    {product.features.slice(0, 3).map((feat, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs text-zinc-400">
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#f1ca62] shrink-0" />
                        <span className="truncate">{feat}</span>
                      </div>
                    ))}
                  </div>

                  {/* Highlight Stat Pill */}
                  <div className="p-2.5 rounded-lg bg-black/50 border border-white/10 font-mono text-xs flex justify-between">
                    <span className="text-zinc-500">{product.highlightStat.label}:</span>
                    <span className="text-[#f1ca62] font-bold">{product.highlightStat.value}</span>
                  </div>
                </div>

                {/* Bottom CTA */}
                <div className="p-6 pt-0">
                  <a
                    href={`https://wa.me/918149916052?text=${encodeURIComponent(product.orderWaText)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-2.5 rounded-xl bg-white/5 hover:bg-[#f1ca62] text-zinc-300 hover:text-black border border-white/10 font-mono text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all font-semibold"
                  >
                    <span>{product.price ? `Order (${product.price})` : 'Discuss this Build'}</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
              </Tilt>
              </Reveal>
            ))}
          </div>

        </div>
      </section>

      {/* TAP TAG SECTION (3D Flipper with Dual Upload) */}
      <TapTagSection />

      {/* DEDICATED INSTANT WEBSITE STUDIO MODAL (No Need to Scroll Down!) */}
      {showWebsiteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-xl p-4 sm:p-6 overflow-y-auto animate-fade-in">
          <div className="relative w-full max-w-6xl rounded-3xl bg-[#030711] border border-[rgba(241,202,98,0.4)] shadow-[0_0_80px_rgba(0,0,0,0.9),0_0_50px_rgba(201,154,46,0.2)] p-6 sm:p-8 my-auto overflow-hidden">
            
            {/* Modal Close Button */}
            <button
              onClick={() => setShowWebsiteModal(false)}
              className="absolute top-5 right-5 z-20 p-2.5 rounded-full bg-white/10 hover:bg-[#f1ca62] text-white hover:text-black transition-colors"
            >
              <X className="w-5 h-5 stroke-[2.5]" />
            </button>

            {/* Configurator Component Inside */}
            <div className="pt-2">
              <WebsiteConfigurator />
            </div>
          </div>
        </div>
      )}

      {/* ENGINEERING SERVICES SECTION */}
      <section className="relative py-16 lg:py-24 border-t border-[rgba(241,202,98,0.18)]" id="services">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          
          <div className="text-center max-w-3xl mx-auto space-y-3">
            <span className="text-xs font-mono text-[#f1ca62] uppercase tracking-wider block">
              Core Capabilities
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
              Engineering Services &amp; <span className="text-[#f1ca62]">Custom R&amp;D</span>
            </h2>
            <p className="text-zinc-400 text-sm leading-relaxed">
              From circuit design to autonomous navigation and high-conversion web development, DR53 works with founders, students, and businesses to engineer real-world systems.
            </p>
          </div>

          <Reveal><div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 rounded-2xl bg-[#06101f] border border-[rgba(241,202,98,0.2)] space-y-3 hover:border-[#f1ca62] transition-colors">
              <div className="w-10 h-10 rounded-xl bg-[#f1ca62]/10 border border-[#f1ca62]/30 flex items-center justify-center text-[#f1ca62]">
                <Bot className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-white">Robotics &amp; Mechanisms</h3>
              <p className="text-xs text-zinc-300 leading-relaxed">
                Autonomous mobile rovers, multi-link articulated servo robotic arms, obstacle radar avoidance, and high-torque motor actuation.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-[#06101f] border border-[rgba(241,202,98,0.2)] space-y-3 hover:border-[#f1ca62] transition-colors">
              <div className="w-10 h-10 rounded-xl bg-[#f1ca62]/10 border border-[#f1ca62]/30 flex items-center justify-center text-[#f1ca62]">
                <Eye className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-white">AI &amp; Computer Vision</h3>
              <p className="text-xs text-zinc-300 leading-relaxed">
                Applied edge neural networks on Raspberry Pi 5 &amp; Coral TPU. Worker safety inspection (helmets, vests) and automated conveyor sorting.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-[#06101f] border border-[rgba(241,202,98,0.2)] space-y-3 hover:border-[#f1ca62] transition-colors">
              <div className="w-10 h-10 rounded-xl bg-[#f1ca62]/10 border border-[#f1ca62]/30 flex items-center justify-center text-[#f1ca62]">
                <Globe className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-white">Custom Business Websites</h3>
              <p className="text-xs text-zinc-300 leading-relaxed">
                High-performance dark aesthetic websites tailored for clothing, industrial, and retail brands with instant WhatsApp order &amp; lead capture.
              </p>
            </div>
          </div></Reveal>

        </div>
      </section>

      {/* RECENT MILESTONES & ACHIEVEMENTS */}
      <section className="relative py-16 lg:py-24 border-t border-[rgba(241,202,98,0.18)]" id="milestones">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          
          <div className="text-center max-w-3xl mx-auto space-y-3">
            <span className="text-xs font-mono text-[#f1ca62] uppercase tracking-wider block">
              Proven Track Record
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
              Built. Competed. <span className="text-[#f1ca62]">Kept Moving.</span>
            </h2>
            <p className="text-zinc-400 text-sm">
              Competitions and research milestones achieved by Adam Bhaimia and the DR53 team.
            </p>
          </div>

          <Reveal><div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Milestone 1 */}
            <div className="p-6 rounded-2xl bg-gradient-to-b from-[#081524] to-[#040a12] border border-[rgba(241,202,98,0.25)] space-y-3 relative overflow-hidden">
              <span className="text-xs font-mono text-[#f1ca62] font-semibold">01 · BIEA 2026</span>
              <h3 className="text-xl font-bold text-white">AgriSort Innovators</h3>
              <p className="text-xs text-zinc-300 leading-relaxed">
                Developed and presented <strong>A-Zero</strong>, an autonomous zero-handling food supply chain concept integrating robotics, computer vision, and IoT logistics.
              </p>
              <div className="pt-2 text-[11px] font-mono text-zinc-500 border-t border-white/5">
                Raspberry Pi 5 · Camera Module 3 · AI Vision · Sensors
              </div>
            </div>

            {/* Milestone 2 */}
            <div className="p-6 rounded-2xl bg-gradient-to-b from-[#081524] to-[#040a12] border border-[rgba(241,202,98,0.25)] space-y-3 relative overflow-hidden">
              <span className="text-xs font-mono text-[#f1ca62] font-semibold">02 · WSC 2026</span>
              <h3 className="text-xl font-bold text-white">World Scholar&apos;s Cup</h3>
              <p className="text-xs text-zinc-300 leading-relaxed">
                Competed with the AgriSort team and secured debate victories during the rigorous global round journey.
              </p>
              <div className="pt-2 text-[11px] font-mono text-zinc-500 border-t border-white/5">
                Debate · Collaborative Writing · Scholar&apos;s Bowl
              </div>
            </div>

            {/* Milestone 3 */}
            <div className="p-6 rounded-2xl bg-gradient-to-b from-[#081524] to-[#040a12] border border-[rgba(241,202,98,0.25)] space-y-3 relative overflow-hidden">
              <span className="text-xs font-mono text-[#f1ca62] font-semibold">03 · FTC 2026–27</span>
              <h3 className="text-xl font-bold text-white">Software + Robotics</h3>
              <p className="text-xs text-zinc-300 leading-relaxed">
                Built technical portfolio spanning Java, embedded robotics, and mecanum-drive autonomous control algorithms for First Tech Challenge.
              </p>
              <div className="pt-2 text-[11px] font-mono text-zinc-500 border-t border-white/5">
                Java · FTC · Mecanum Actuation · Autonomous Logic
              </div>
            </div>

          </div></Reveal>

        </div>
      </section>

      {/* CONTACT & DIRECT WHATSAPP ACTION BAND */}
      <section className="relative py-20 lg:py-28 border-t border-[rgba(241,202,98,0.2)] bg-gradient-to-b from-[#030711] via-[#06101f] to-[#030711]" id="contact">
        <div className="max-w-4xl mx-auto px-4 text-center space-y-6">
          <span className="text-xs font-mono text-[#f1ca62] uppercase tracking-wider block">
            Direct Founder Access
          </span>
          <h2 className="text-3xl sm:text-5xl font-bold text-white tracking-tight">
            Have an idea? Let&apos;s turn it into <br className="hidden sm:inline" />
            <span className="text-[#f1ca62]">something real.</span>
          </h2>
          <p className="text-zinc-400 text-sm sm:text-base max-w-xl mx-auto leading-relaxed">
            Tell DR53 what you want to build. Get a direct technical answer from Adam Bhaimia in Pune — no sales funnel, no middleman.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
            <a
              href="https://wa.me/918149916052?text=Hi%20Adam%2C%20I%20have%20a%20project%20idea%20for%20DR53."
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2.5 px-8 py-4 rounded-full bg-gradient-to-r from-[#25d366] to-[#128c4a] text-black font-bold text-sm uppercase tracking-wider shadow-[0_0_35px_rgba(37,211,102,0.45)] hover:shadow-[0_0_50px_rgba(37,211,102,0.65)] hover:scale-105 active:scale-95 transition-all"
            >
              <WhatsAppIcon className="w-5 h-5 fill-black" />
              <span>Message Adam on WhatsApp (+91 81499 16052)</span>
            </a>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-white/10 bg-[#02050b] py-12 text-xs font-mono text-zinc-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <BrandLogo className="w-9 h-9" />
            <div>
              <span className="text-white font-bold text-sm font-sans block">Dynamic Robotics 53</span>
              <span>Founded by Adam Bhaimia · Pune, Maharashtra, India</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-6 text-zinc-400">
            <a href="#billboard" className="hover:text-white">Ad Screen</a>
            <a href="#projects" className="hover:text-white">Builds</a>
            <a href="#taptag" className="hover:text-white">Tap Tag</a>
            <a href="#t53" className="text-[#f1ca62] hover:text-white">T53</a>
            <button onClick={() => setShowWebsiteModal(true)} className="hover:text-[#f1ca62] text-left">
              Website Studio
            </button>
            <a href="#milestones" className="hover:text-white">Milestones</a>
            <a href="https://wa.me/918149916052" target="_blank" rel="noopener noreferrer" className="text-[#25d366] hover:underline flex items-center gap-1">
              <WhatsAppIcon className="w-3.5 h-3.5 fill-[#25d366]" />
              <span>WhatsApp</span>
            </a>
          </div>

          <div>
            © 2026 DR53. All rights reserved.
          </div>
        </div>
      </footer>

      {/* WORKING AI CONCIERGE CHATBOT */}
      <Chatbot />

      {/* FLOATING WHATSAPP BUTTON (With Real WhatsApp Icon) */}
      <a
        href="https://wa.me/918149916052"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-6 right-5 sm:right-6 z-50 p-4 rounded-full bg-gradient-to-r from-[#25d366] to-[#128c4a] text-black shadow-[0_0_30px_rgba(37,211,102,0.55)] hover:shadow-[0_0_45px_rgba(37,211,102,0.8)] hover:scale-110 active:scale-95 transition-all"
        title="Chat on WhatsApp with Adam Bhaimia"
        aria-label="Chat on WhatsApp"
      >
        <WhatsAppIcon className="w-6 h-6 fill-black" />
      </a>

    </div>
  );
}

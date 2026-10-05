import React, { useState, useEffect } from 'react';
import { 
  Bot, Hand, Eye, Cpu, Sparkles, Trash2, BatteryCharging, Zap, Globe, 
  ChevronLeft, ChevronRight, Play, Pause, ExternalLink, ShieldCheck, 
  Activity, Radio, Volume2, VolumeX, Maximize2, Minimize2, Image as ImageIcon
} from 'lucide-react';
import { PRODUCTS } from '../data/products';

export const DigitalAdScreen: React.FC = () => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [viewMode, setViewMode] = useState<'ad' | 'specs' | 'telemetry'>('ad');
  const [isExpanded, setIsExpanded] = useState(false);
  const [progress, setProgress] = useState(0);
  const [imgError, setImgError] = useState(false);

  const currentProduct = PRODUCTS[currentIndex];

  // Sound effects helper using Web Audio API
  const playBeep = (freq = 880, type: OscillatorType = 'sine', duration = 0.08) => {
    if (!soundEnabled || typeof window === 'undefined') return;
    try {
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.04, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch {
      // AudioContext unavailable
    }
  };

  const nextSlide = () => {
    setCurrentIndex((prev) => (prev + 1) % PRODUCTS.length);
    setProgress(0);
    setImgError(false);
    playBeep(980, 'triangle', 0.05);
  };

  const prevSlide = () => {
    setCurrentIndex((prev) => (prev - 1 + PRODUCTS.length) % PRODUCTS.length);
    setProgress(0);
    setImgError(false);
    playBeep(740, 'triangle', 0.05);
  };

  const selectSlide = (index: number) => {
    setCurrentIndex(index);
    setProgress(0);
    setImgError(false);
    playBeep(880, 'sine', 0.04);
  };

  // Auto-play interval with progress bar
  useEffect(() => {
    if (!isPlaying) return;

    const intervalTime = 5500; // 5.5s per slide
    const stepTime = 50;
    const totalSteps = intervalTime / stepTime;

    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          setCurrentIndex((idx) => (idx + 1) % PRODUCTS.length);
          setImgError(false);
          return 0;
        }
        return prev + (100 / totalSteps);
      });
    }, stepTime);

    return () => clearInterval(timer);
  }, [isPlaying, currentIndex]);

  return (
    <div className={`relative w-full rounded-2xl border border-[rgba(241,202,98,0.3)] bg-gradient-to-b from-[#08172b]/95 via-[#06101f]/95 to-[#030711]/98 shadow-[0_20px_70px_rgba(0,0,0,0.8),0_0_50px_rgba(201,154,46,0.15)] overflow-hidden transition-all duration-500 ${isExpanded ? 'p-6 lg:p-10' : 'p-4 sm:p-6 lg:p-8'}`}>
      
      {/* Laser Scanline & Grid Effect */}
      <div className="absolute inset-0 bg-tech-grid opacity-30 pointer-events-none" />
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="w-full h-1 bg-gradient-to-r from-transparent via-[#f1ca62] to-transparent opacity-40 animate-scan" />
      </div>

      {/* Futuristic Corner HUD Brackets */}
      <div className="absolute top-2 left-2 w-4 h-4 border-t-2 border-l-2 border-[#f1ca62]/70 pointer-events-none" />
      <div className="absolute top-2 right-2 w-4 h-4 border-t-2 border-r-2 border-[#f1ca62]/70 pointer-events-none" />
      <div className="absolute bottom-2 left-2 w-4 h-4 border-b-2 border-l-2 border-[#f1ca62]/70 pointer-events-none" />
      <div className="absolute bottom-2 right-2 w-4 h-4 border-b-2 border-r-2 border-[#f1ca62]/70 pointer-events-none" />

      {/* Top Telemetry Header Bar */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 pb-4 mb-4 border-b border-[rgba(241,202,98,0.18)]">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-2.5 py-1 rounded bg-black/60 border border-[rgba(241,202,98,0.3)] text-xs font-mono text-[#f1ca62]">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="tracking-wider uppercase font-semibold">DR53 DIGITAL BILLBOARD</span>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-mono text-zinc-400">
            <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            LIVE PRODUCT SHOWCASE
          </span>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {/* View mode switcher */}
          <div className="flex bg-black/50 p-1 rounded-lg border border-[rgba(241,202,98,0.2)] text-xs font-mono">
            <button
              onClick={() => { setViewMode('ad'); playBeep(600); }}
              className={`px-2.5 py-1 rounded transition-all ${viewMode === 'ad' ? 'bg-[#f1ca62] text-black font-bold shadow-sm' : 'text-zinc-400 hover:text-white'}`}
            >
              Ad Screen
            </button>
            <button
              onClick={() => { setViewMode('specs'); playBeep(700); }}
              className={`px-2.5 py-1 rounded transition-all ${viewMode === 'specs' ? 'bg-[#f1ca62] text-black font-bold shadow-sm' : 'text-zinc-400 hover:text-white'}`}
            >
              Hardware Specs
            </button>
            <button
              onClick={() => { setViewMode('telemetry'); playBeep(800); }}
              className={`px-2.5 py-1 rounded transition-all ${viewMode === 'telemetry' ? 'bg-[#f1ca62] text-black font-bold shadow-sm' : 'text-zinc-400 hover:text-white'}`}
            >
              Telemetry
            </button>
          </div>

          {/* Sound Toggle */}
          <button 
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-1.5 rounded-lg bg-black/40 border border-[rgba(241,202,98,0.2)] text-zinc-400 hover:text-[#f1ca62] transition-colors"
            title={soundEnabled ? 'Mute sound' : 'Enable sound'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-[#f1ca62]" /> : <VolumeX className="w-4 h-4" />}
          </button>

          {/* Expand toggle */}
          <button 
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 rounded-lg bg-black/40 border border-[rgba(241,202,98,0.2)] text-zinc-400 hover:text-[#f1ca62] transition-colors hidden sm:block"
            title={isExpanded ? 'Compact view' : 'Expand screen'}
          >
            {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Main Screen Body */}
      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center min-h-[380px]">
        
        {/* Left Column: Real Product Photograph & Visual Display */}
        <div className="lg:col-span-5 flex flex-col items-center justify-center p-4 rounded-xl bg-gradient-to-br from-black/90 via-[#06101f]/95 to-black/90 border border-[rgba(241,202,98,0.3)] relative overflow-hidden group">
          
          {/* Subtle Radar Ring in Background */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
            <div className="w-72 h-72 rounded-full border border-dashed border-[#f1ca62] animate-spin-slow" />
          </div>

          {/* Product Badges */}
          <div className="absolute top-3 left-3 z-20 flex flex-wrap gap-1.5">
            {currentProduct.badge && (
              <span className="px-2.5 py-0.5 rounded-full bg-black/70 backdrop-blur-md border border-[#f1ca62] text-[10px] font-mono text-[#f1ca62] uppercase tracking-wider flex items-center gap-1 shadow-md">
                <Sparkles className="w-2.5 h-2.5 animate-spin" />
                {currentProduct.badge}
              </span>
            )}
          </div>

          {currentProduct.price && (
            <div className="absolute top-3 right-3 z-20 px-3 py-1 rounded-full bg-emerald-500/20 backdrop-blur-md border border-emerald-400 text-xs font-mono font-bold text-emerald-300 shadow-lg">
              {currentProduct.price}
            </div>
          )}

          {/* ACTUAL PHOTOGRAPH DISPLAY */}
          <div className="relative w-full aspect-video sm:aspect-square max-h-[300px] rounded-xl overflow-hidden border border-[rgba(241,202,98,0.35)] shadow-2xl bg-black">
            {!imgError ? (
              <img 
                src={currentProduct.image} 
                alt={currentProduct.name}
                onError={() => setImgError(true)}
                className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-700 filter brightness-95 contrast-105"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center bg-[#071324] text-zinc-400 p-4">
                <ImageIcon className="w-12 h-12 text-[#f1ca62] mb-2" />
                <span className="font-mono text-xs">{currentProduct.name}</span>
              </div>
            )}

            {/* Sweep light effect */}
            <div className="absolute inset-0 bg-gradient-to-tr from-black/50 via-transparent to-transparent pointer-events-none" />
            <div className="absolute inset-0 border border-white/10 rounded-xl pointer-events-none" />
          </div>

          {/* Highlight Key Metric Bar */}
          <div className="w-full flex items-center justify-between px-4 py-2 mt-3 rounded-lg bg-black/70 border border-white/10 font-mono text-xs">
            <span className="text-zinc-400">{currentProduct.highlightStat.label}:</span>
            <span className="font-bold text-[#f1ca62] tracking-wide">{currentProduct.highlightStat.value}</span>
          </div>
        </div>

        {/* Right Column: Dynamic Ad Screen Copy & Spec Readouts */}
        <div className="lg:col-span-7 flex flex-col justify-between h-full space-y-4">
          
          <div>
            {/* Tag & Category */}
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2 py-0.5 rounded bg-[#f1ca62]/10 text-[11px] font-mono text-[#f1ca62] border border-[#f1ca62]/30 uppercase tracking-wider">
                {currentProduct.tag}
              </span>
              <span className="text-xs font-mono text-zinc-500 uppercase tracking-widest">PUNE LAB BUILD</span>
            </div>

            {/* Title */}
            <h3 className="text-2xl sm:text-3xl font-bold text-white tracking-tight leading-tight">
              {currentProduct.name}
            </h3>

            {/* Tagline */}
            <p className="text-sm font-medium text-[#f1ca62] mt-1 tracking-wide">
              {currentProduct.tagline}
            </p>
          </div>

          {/* Conditional Content based on viewMode */}
          {viewMode === 'ad' && (
            <div className="space-y-4">
              <p className="text-zinc-300 text-sm leading-relaxed">
                {currentProduct.description}
              </p>

              {/* Feature Highlights Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                {currentProduct.features.map((feat, idx) => (
                  <div key={idx} className="flex items-center gap-2 p-2 rounded bg-black/40 border border-white/5 text-xs text-zinc-300">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>{feat}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {viewMode === 'specs' && (
            <div className="space-y-3">
              <div className="text-xs font-mono text-zinc-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-[#f1ca62]" />
                Technical Specification Blueprint:
              </div>
              <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1">
                {currentProduct.specs.map((spec, idx) => (
                  <div key={idx} className="flex items-start gap-2.5 p-2 rounded bg-black/50 border border-[rgba(241,202,98,0.15)] text-xs font-mono text-zinc-200">
                    <span className="text-[#f1ca62] font-bold">0{idx + 1}.</span>
                    <span>{spec}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {viewMode === 'telemetry' && (
            <div className="space-y-3">
              <div className="text-xs font-mono text-zinc-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-emerald-400" />
                Live Status & Telemetry Readouts:
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <div className="p-2.5 rounded bg-black/50 border border-white/10 font-mono">
                  <div className="text-[10px] text-zinc-400 uppercase">System Status</div>
                  <div className="text-xs font-bold text-emerald-400">OPERATIONAL</div>
                </div>
                <div className="p-2.5 rounded bg-black/50 border border-white/10 font-mono">
                  <div className="text-[10px] text-zinc-400 uppercase">Engineering Lab</div>
                  <div className="text-xs font-bold text-[#f1ca62]">Pune, MH, IN</div>
                </div>
                <div className="p-2.5 rounded bg-black/50 border border-white/10 font-mono">
                  <div className="text-[10px] text-zinc-400 uppercase">Architecture</div>
                  <div className="text-xs font-bold text-white">DR53 Core v2.4</div>
                </div>
                <div className="p-2.5 rounded bg-black/50 border border-white/10 font-mono">
                  <div className="text-[10px] text-zinc-400 uppercase">Lead Engineer</div>
                  <div className="text-xs font-bold text-white">Adam Bhaimia</div>
                </div>
                <div className="p-2.5 rounded bg-black/50 border border-white/10 font-mono">
                  <div className="text-[10px] text-zinc-400 uppercase">Direct Access</div>
                  <div className="text-xs font-bold text-emerald-400">1:1 WhatsApp</div>
                </div>
                <div className="p-2.5 rounded bg-black/50 border border-white/10 font-mono">
                  <div className="text-[10px] text-zinc-400 uppercase">Build Delivery</div>
                  <div className="text-xs font-bold text-[#f1ca62]">Custom Scoped</div>
                </div>
              </div>
            </div>
          )}

          {/* Action CTAs */}
          <div className="pt-2 flex flex-wrap items-center gap-3">
            <a 
              href={`https://wa.me/918149916052?text=${encodeURIComponent(currentProduct.orderWaText)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-r from-[#25d366] to-[#128c4a] text-black font-bold text-xs uppercase tracking-wider hover:shadow-[0_0_25px_rgba(37,211,102,0.45)] hover:scale-105 active:scale-95 transition-all"
            >
              <span>{currentProduct.price ? `Order Now (${currentProduct.price})` : 'Inquire on WhatsApp'}</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>

            {currentProduct.id === 'custom-website' ? (
              <a
                href="#website-builder"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-[#f1ca62]/10 border border-[#f1ca62] text-[#f1ca62] font-mono text-xs uppercase tracking-wider hover:bg-[#f1ca62] hover:text-black transition-all"
              >
                <span>Launch Live Builder</span>
                <span className="font-bold">→</span>
              </a>
            ) : currentProduct.id === 'tap-tag' ? (
              <a
                href="#taptag"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-[#f1ca62]/10 border border-[#f1ca62] text-[#f1ca62] font-mono text-xs uppercase tracking-wider hover:bg-[#f1ca62] hover:text-black transition-all"
              >
                <span>View Tap Tag Device</span>
                <span className="font-bold">→</span>
              </a>
            ) : (
              <a
                href="#projects"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/5 border border-white/10 text-zinc-300 font-mono text-xs uppercase tracking-wider hover:border-[#f1ca62] hover:text-white transition-all"
              >
                <span>Full Build Details</span>
                <span className="font-bold">↗</span>
              </a>
            )}
          </div>

        </div>

      </div>

      {/* Auto-Play Progress Bar */}
      <div className="relative z-10 w-full h-1 bg-white/10 rounded-full overflow-hidden mt-6">
        <div 
          className="h-full bg-gradient-to-r from-[#c99a2e] via-[#f1ca62] to-white transition-all duration-75"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Navigation Thumbnails & Slide Selector Bar */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 mt-4 pt-4 border-t border-[rgba(241,202,98,0.15)]">
        
        {/* Play / Pause & Prev / Next */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setIsPlaying(!isPlaying); playBeep(500); }}
            className="p-2 rounded-lg bg-black/60 border border-[rgba(241,202,98,0.25)] text-zinc-300 hover:text-[#f1ca62] transition-colors"
            title={isPlaying ? 'Pause slideshow' : 'Resume slideshow'}
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current" />}
          </button>
          
          <button
            onClick={prevSlide}
            className="p-2 rounded-lg bg-black/60 border border-[rgba(241,202,98,0.25)] text-zinc-300 hover:text-[#f1ca62] transition-colors"
            title="Previous product"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <span className="font-mono text-xs text-[#f1ca62] px-1 font-semibold">
            {String(currentIndex + 1).padStart(2, '0')} / {String(PRODUCTS.length).padStart(2, '0')}
          </span>

          <button
            onClick={nextSlide}
            className="p-2 rounded-lg bg-black/60 border border-[rgba(241,202,98,0.25)] text-zinc-300 hover:text-[#f1ca62] transition-colors"
            title="Next product"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Thumbnail Selector Dots / Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto max-w-full pb-1">
          {PRODUCTS.map((p, idx) => (
            <button
              key={p.id}
              onClick={() => selectSlide(idx)}
              className={`px-2.5 py-1 rounded text-[11px] font-mono whitespace-nowrap transition-all ${
                currentIndex === idx 
                  ? 'bg-[#f1ca62] text-black font-bold shadow-[0_0_12px_rgba(241,202,98,0.4)]' 
                  : 'bg-black/50 text-zinc-400 border border-white/5 hover:border-[rgba(241,202,98,0.3)] hover:text-white'
              }`}
            >
              0{idx + 1}
            </button>
          ))}
        </div>

      </div>

    </div>
  );
};

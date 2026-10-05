import React, { useState, useMemo } from 'react';
import { 
  Factory, Shirt, Cpu, Utensils, Stethoscope, Building2, 
  ShoppingBag, Briefcase, Check, Plus, Globe, Sparkles, 
  Smartphone, Monitor, Tablet, MessageSquare, ExternalLink, 
  ArrowRight, ShieldCheck, HelpCircle, CheckCircle2, ChevronDown, Pipette
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { BUSINESS_CATEGORIES, BusinessCategory } from '../data/products';

interface Addon {
  id: string;
  name: string;
  price: number;
  description: string;
}

const ADDONS: Addon[] = [
  { id: 'extra_page', name: 'Extra Custom Page (+1)', price: 700, description: 'Additional dedicated page (e.g. About, Portfolio, FAQ)' },
  { id: 'contact_form', name: 'Lead Capture & RFQ Form', price: 800, description: 'Direct email & WhatsApp lead notification engine' },
  { id: 'gallery', name: 'Interactive Showcase Gallery', price: 900, description: 'High-res image lightbox, lookbook or machine photo slider' },
  { id: 'wa_cart', name: 'Direct WhatsApp Order Cart', price: 700, description: 'Customers can click items to build a live cart & order on WhatsApp' },
  { id: 'seo_pack', name: 'Technical SEO & Social Share', price: 1000, description: 'Meta tags, OpenGraph cards, Google search indexing setup' },
  { id: 'domain_dns', name: 'Domain & DNS Setup Assistance', price: 800, description: 'Full guidance purchasing & binding your custom .com / .in domain' },
  { id: 'custom_ui', name: 'Custom Cinematic UI / Animations', price: 1000, description: 'Tailored 3D tilt cards, dark aesthetic, sound fx, custom branding' },
  { id: 'cms_admin', name: 'Simple Content Admin System', price: 1000, description: 'Easy panel to edit text, prices, or product photos yourself' },
];

const PACKAGES = [
  {
    id: 'starter',
    name: 'Starter',
    price: 5300,
    idealFor: 'Small local businesses, single products, landing pages',
    pages: 'Up to 2 pages',
    features: [
      'Responsive dark high-tech design',
      'Mobile-first performance',
      'Direct WhatsApp click-to-chat button',
      'Free hosting setup on ultra-fast CDN'
    ]
  },
  {
    id: 'professional',
    name: 'Professional',
    price: 7500,
    isPopular: true,
    idealFor: 'Growing companies, boutiques, factories & studios',
    pages: 'Up to 5 pages',
    features: [
      'Everything in Starter',
      'Up to 5 custom designed pages',
      'Interactive product catalog or lookbook',
      'Basic SEO & Google Maps integration',
      'Lead capture form with notifications'
    ]
  },
  {
    id: 'business',
    name: 'Enterprise / Business',
    price: 10000,
    idealFor: 'Established brands, multi-category catalogs & exporters',
    pages: 'Up to 8 pages',
    features: [
      'Everything in Professional',
      'Up to 8 bespoke pages',
      'Advanced interactive components',
      'Priority 48-hour development turnaround',
      'Full brand asset integration & logo polishing',
      '30 days direct maintenance support'
    ]
  }
];

const PRESET_PALETTES = [
  { id: 'gold', name: 'DR53 Gold', color: '#f1ca62' },
  { id: 'emerald', name: 'Neon Emerald', color: '#10b981' },
  { id: 'cobalt', name: 'Electric Cyan', color: '#06b6d4' },
  { id: 'crimson', name: 'Cyber Crimson', color: '#f43f5e' },
  { id: 'purple', name: 'Matrix Violet', color: '#a855f7' },
  { id: 'platinum', name: 'Pure Platinum', color: '#e2e8f0' }
];

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  Factory,
  Shirt,
  Cpu,
  Utensils,
  Stethoscope,
  Building2,
  ShoppingBag,
  Briefcase
};

export const WebsiteConfigurator: React.FC = () => {
  const [selectedCategory, setSelectedCategory] = useState<string>('industrial');
  const [selectedPackage, setSelectedPackage] = useState<string>('professional');
  const [selectedAddons, setSelectedAddons] = useState<string[]>(['contact_form', 'seo_pack']);
  const [customColor, setCustomColor] = useState<string>('#f1ca62');
  const [customColorName, setCustomColorName] = useState<string>('DR53 Gold');
  const [devicePreview, setDevicePreview] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [domainStatus, setDomainStatus] = useState<string>('need_new');
  const [domainName, setDomainName] = useState<string>('');
  const [businessName, setBusinessName] = useState<string>('');
  const [customNotes, setCustomNotes] = useState<string>('');
  const [faqOpen, setFaqOpen] = useState(false);
  const [domainChecked, setDomainChecked] = useState(false);

  // Active Category Details
  const activeCategory = useMemo(() => {
    return BUSINESS_CATEGORIES.find(c => c.id === selectedCategory) || BUSINESS_CATEGORIES[0];
  }, [selectedCategory]);

  const activePackage = useMemo(() => {
    return PACKAGES.find(p => p.id === selectedPackage) || PACKAGES[1];
  }, [selectedPackage]);

  // Calculate Total
  const calculation = useMemo(() => {
    const basePrice = activePackage.price;
    const addonsTotal = selectedAddons.reduce((sum, addonId) => {
      const addon = ADDONS.find(a => a.id === addonId);
      return sum + (addon ? addon.price : 0);
    }, 0);

    const total = basePrice + addonsTotal;
    return {
      basePrice,
      addonsTotal,
      total,
      addonsList: selectedAddons.map(id => ADDONS.find(a => a.id === id)!).filter(Boolean)
    };
  }, [activePackage, selectedAddons]);

  const toggleAddon = (id: string) => {
    setSelectedAddons(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleDomainCheck = () => {
    if (!domainName.trim()) return;
    setDomainChecked(true);
  };

  const handleSendWhatsAppQuote = () => {
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 }
    });

    const categoryText = activeCategory.name;
    const pkgText = `${activePackage.name} (₹${activePackage.price.toLocaleString('en-IN')})`;
    const addonsText = calculation.addonsList.length > 0 
      ? calculation.addonsList.map(a => `• ${a.name} (+₹${a.price})`).join('\n')
      : '• None';

    const message = `*NEW WEBSITE CONFIGURATION — DR53*\n\n` +
      `*Business Category:* ${categoryText}\n` +
      `*Business / Brand Name:* ${businessName.trim() || 'Not specified yet'}\n` +
      `*Selected Package:* ${pkgText}\n` +
      `*Custom Brand Color:* ${customColor} (${customColorName || 'Custom'})\n\n` +
      `*Selected Add-ons:*\n${addonsText}\n\n` +
      `*Domain Status:* ${domainStatus}\n` +
      `*Preferred Domain:* ${domainName.trim() || 'Need recommendations'}\n` +
      `*Custom Project Notes:* ${customNotes.trim() || 'Standard business requirements'}\n\n` +
      `*Estimated Total:* ₹${calculation.total.toLocaleString('en-IN')}\n\n` +
      `Hi Adam, I configured this website on DR53 with my custom brand color (${customColor}). Let's get started!`;

    const encoded = encodeURIComponent(message);
    window.open(`https://wa.me/918149916052?text=${encoded}`, '_blank');
  };

  return (
    <div className="w-full space-y-8" id="website-builder">
      
      {/* Intro Header */}
      <div className="text-center max-w-3xl mx-auto space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#f1ca62]/10 border border-[#f1ca62]/30 text-xs font-mono text-[#f1ca62] uppercase tracking-wider">
          <Sparkles className="w-3.5 h-3.5" />
          Interactive Studio Configurator
        </div>
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white">
          Design Your <span className="text-[#f1ca62]">Business Website</span>
        </h2>
        <p className="text-zinc-400 text-sm sm:text-base leading-relaxed">
          Select your industry, choose your custom brand color, and watch the live preview adapt instantly.
        </p>
      </div>

      {/* Main Configurator Container */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left Column: Configuration Controls */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* STEP 1: Select Business Category */}
          <div className="p-5 sm:p-6 rounded-2xl bg-[#06101f]/90 border border-[rgba(241,202,98,0.25)] shadow-xl relative overflow-hidden">
            <div className="flex items-center justify-between mb-3 pb-2.5 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <span className="px-2 py-0.5 rounded bg-[#f1ca62] text-black font-mono font-bold text-xs">
                  STEP 01
                </span>
                <h3 className="text-base sm:text-lg font-bold text-white">Select Business Category</h3>
              </div>
              <span className="text-xs font-mono text-zinc-400">Industry Tailored</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {BUSINESS_CATEGORIES.map(category => {
                const IconComponent = CATEGORY_ICONS[category.icon] || Factory;
                const isSelected = selectedCategory === category.id;
                return (
                  <button
                    key={category.id}
                    onClick={() => setSelectedCategory(category.id)}
                    className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all duration-200 group ${
                      isSelected 
                        ? 'bg-gradient-to-b from-[#0a1f38] to-[#040c16] border-[#f1ca62] shadow-[0_0_15px_rgba(241,202,98,0.25)] text-white scale-[1.02]' 
                        : 'bg-black/40 border-white/10 text-zinc-400 hover:border-white/20 hover:text-zinc-200'
                    }`}
                  >
                    <div className={`p-2 rounded-lg mb-1.5 transition-colors ${isSelected ? 'bg-[#f1ca62] text-black' : 'bg-white/5 text-zinc-300 group-hover:text-[#f1ca62]'}`}>
                      <IconComponent className="w-4 h-4" />
                    </div>
                    <span className="text-[11px] font-bold leading-tight">{category.name}</span>
                  </button>
                );
              })}
            </div>

            {/* Selected Category Highlight Banner */}
            <div className="mt-3.5 p-3 rounded-xl bg-black/60 border border-[rgba(241,202,98,0.2)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
              <div>
                <span className="text-[#f1ca62] font-bold text-xs">{activeCategory.name}</span>
                <p className="text-zinc-400 text-[11px]">{activeCategory.description}</p>
              </div>
            </div>
          </div>

          {/* STEP 2: Custom Color Dropper & Palette Selector (Requested Feature!) */}
          <div className="p-5 sm:p-6 rounded-2xl bg-[#06101f]/90 border border-[rgba(241,202,98,0.25)] shadow-xl relative overflow-hidden space-y-4">
            <div className="flex items-center justify-between pb-2.5 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <span className="px-2 py-0.5 rounded bg-[#f1ca62] text-black font-mono font-bold text-xs">
                  STEP 02
                </span>
                <h3 className="text-base sm:text-lg font-bold text-white">Pick Your Custom Brand Color</h3>
              </div>
              <span className="text-xs font-mono text-zinc-400 flex items-center gap-1">
                <Pipette className="w-3.5 h-3.5 text-[#f1ca62]" />
                Live Dropper
              </span>
            </div>

            <p className="text-xs text-zinc-300">
              Pick from popular palettes, use the color dropper, or type any color code/name. Your live preview screen updates instantly!
            </p>

            {/* Quick Palettes */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {PRESET_PALETTES.map(p => (
                <button
                  key={p.id}
                  onClick={() => { setCustomColor(p.color); setCustomColorName(p.name); }}
                  className={`p-2 rounded-xl border flex flex-col items-center gap-1 transition-all ${
                    customColor.toLowerCase() === p.color.toLowerCase() 
                      ? 'border-white bg-white/10 scale-105 shadow-md' 
                      : 'border-white/10 bg-black/40 hover:border-white/30'
                  }`}
                >
                  <span className="w-5 h-5 rounded-full shadow-inner" style={{ backgroundColor: p.color }} />
                  <span className="text-[10px] font-mono text-zinc-300 truncate max-w-full">{p.name}</span>
                </button>
              ))}
            </div>

            {/* Color Dropper + Custom Type Input */}
            <div className="p-3.5 rounded-xl bg-black/60 border border-white/10 flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-xs font-mono text-zinc-400 flex items-center gap-1.5">
                  <Pipette className="w-3.5 h-3.5 text-[#f1ca62]" />
                  Color Dropper:
                </label>
                <div className="relative flex items-center">
                  <input 
                    type="color"
                    value={customColor}
                    onChange={(e) => { setCustomColor(e.target.value); setCustomColorName(e.target.value); }}
                    className="w-9 h-9 rounded-lg cursor-pointer bg-transparent border-0 p-0"
                    title="Click to open color dropper"
                  />
                  <span className="ml-2 font-mono text-xs font-bold" style={{ color: customColor }}>
                    {customColor.toUpperCase()}
                  </span>
                </div>
              </div>

              <div className="flex-1 min-w-[200px] flex items-center gap-2">
                <input
                  type="text"
                  value={customColorName}
                  onChange={(e) => {
                    setCustomColorName(e.target.value);
                    if (e.target.value.startsWith('#') && e.target.value.length >= 4) {
                      setCustomColor(e.target.value);
                    }
                  }}
                  placeholder="Or type color: e.g. #FF5733, Neon Lime"
                  className="w-full px-3 py-1.5 rounded-lg bg-white/5 border border-white/15 text-white text-xs font-mono placeholder:text-zinc-600 focus:outline-none focus:border-[#f1ca62]"
                />
              </div>
            </div>
          </div>

          {/* STEP 3: Base Package Selection */}
          <div className="p-5 sm:p-6 rounded-2xl bg-[#06101f]/90 border border-[rgba(241,202,98,0.25)] shadow-xl relative overflow-hidden">
            <div className="flex items-center justify-between mb-3 pb-2.5 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <span className="px-2 py-0.5 rounded bg-[#f1ca62] text-black font-mono font-bold text-xs">
                  STEP 03
                </span>
                <h3 className="text-base sm:text-lg font-bold text-white">Select Base Package</h3>
              </div>
              <span className="text-xs font-mono text-emerald-400 font-semibold">From ₹5,300</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              {PACKAGES.map(pkg => {
                const isSelected = selectedPackage === pkg.id;
                return (
                  <div
                    key={pkg.id}
                    onClick={() => setSelectedPackage(pkg.id)}
                    className={`relative cursor-pointer p-4 rounded-xl border flex flex-col justify-between transition-all duration-200 ${
                      isSelected 
                        ? 'bg-gradient-to-b from-[#0a1f38] to-[#040c16] border-[#f1ca62] shadow-[0_0_15px_rgba(241,202,98,0.2)] scale-[1.02]' 
                        : 'bg-black/40 border-white/10 hover:border-white/20'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-white font-mono uppercase">{pkg.name}</span>
                        {isSelected && (
                          <div className="w-4 h-4 rounded-full bg-[#f1ca62] text-black flex items-center justify-center">
                            <Check className="w-3 h-3 stroke-[3]" />
                          </div>
                        )}
                      </div>

                      <div className="text-xl font-bold font-mono text-[#f1ca62] my-1">
                        ₹{pkg.price.toLocaleString('en-IN')}
                      </div>

                      <div className="text-[10px] font-mono text-zinc-400 mb-2 pb-1.5 border-b border-white/5">
                        {pkg.pages}
                      </div>

                      <p className="text-[11px] text-zinc-300 mb-2 leading-tight">{pkg.idealFor}</p>

                      <ul className="space-y-1 text-[10px] text-zinc-400">
                        {pkg.features.map((feat, i) => (
                          <li key={i} className="flex items-start gap-1">
                            <Check className="w-2.5 h-2.5 text-[#f1ca62] shrink-0 mt-0.5" />
                            <span>{feat}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* STEP 4: Select Add-on Features */}
          <div className="p-5 sm:p-6 rounded-2xl bg-[#06101f]/90 border border-[rgba(241,202,98,0.25)] shadow-xl relative overflow-hidden">
            <div className="flex items-center justify-between mb-3 pb-2.5 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <span className="px-2 py-0.5 rounded bg-[#f1ca62] text-black font-mono font-bold text-xs">
                  STEP 04
                </span>
                <h3 className="text-base sm:text-lg font-bold text-white">Select Add-on Features</h3>
              </div>
              <span className="text-xs font-mono text-[#f1ca62]">Itemized Additions</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {ADDONS.map(addon => {
                const isSelected = selectedAddons.includes(addon.id);
                return (
                  <div
                    key={addon.id}
                    onClick={() => toggleAddon(addon.id)}
                    className={`cursor-pointer p-3 rounded-xl border flex items-start justify-between gap-2.5 transition-all ${
                      isSelected 
                        ? 'bg-[#0a1e35] border-[#f1ca62] text-white shadow-sm' 
                        : 'bg-black/40 border-white/10 text-zinc-300 hover:border-white/20'
                    }`}
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <div className={`w-3.5 h-3.5 rounded flex items-center justify-center shrink-0 border ${isSelected ? 'bg-[#f1ca62] border-[#f1ca62] text-black' : 'border-white/30'}`}>
                          {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                        </div>
                        <span className="text-xs font-bold text-white">{addon.name}</span>
                      </div>
                      <p className="text-[10px] text-zinc-400 pl-5 leading-tight">{addon.description}</p>
                    </div>

                    <span className="text-[11px] font-mono font-bold text-[#f1ca62] shrink-0">
                      +₹{addon.price.toLocaleString('en-IN')}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* STEP 5: Business Name, Domain & Notes */}
          <div className="p-5 sm:p-6 rounded-2xl bg-[#06101f]/90 border border-[rgba(241,202,98,0.25)] shadow-xl relative overflow-hidden space-y-4">
            <div className="flex items-center justify-between pb-2.5 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <span className="px-2 py-0.5 rounded bg-[#f1ca62] text-black font-mono font-bold text-xs">
                  STEP 05
                </span>
                <h3 className="text-base sm:text-lg font-bold text-white">Project Details &amp; Domain</h3>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-mono text-zinc-400 uppercase tracking-wider block mb-1">
                  Your Business / Company Name:
                </label>
                <input
                  type="text"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="e.g. Apex Industrial / Velvet Apparel"
                  className="w-full px-3 py-2 rounded-xl bg-black/60 border border-white/15 text-white text-xs focus:outline-none focus:border-[#f1ca62]"
                />
              </div>

              <div>
                <label className="text-xs font-mono text-zinc-400 uppercase tracking-wider block mb-1">
                  Do you already own a domain?
                </label>
                <select
                  value={domainStatus}
                  onChange={(e) => setDomainStatus(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-black/60 border border-white/15 text-white text-xs focus:outline-none focus:border-[#f1ca62]"
                >
                  <option value="need_new">No, I need a new domain (.com / .in)</option>
                  <option value="own_domain">Yes, I already own my domain</option>
                  <option value="need_guidance">I need help choosing a good name</option>
                </select>
              </div>
            </div>

            {/* Domain Checker Box */}
            <div>
              <label className="text-xs font-mono text-zinc-400 uppercase tracking-wider block mb-1">
                Preferred Domain (e.g. yourbusiness.com):
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={domainName}
                  onChange={(e) => { setDomainName(e.target.value); setDomainChecked(false); }}
                  placeholder="yourbusiness.com"
                  className="flex-1 px-3 py-2 rounded-xl bg-black/60 border border-white/15 text-white text-xs font-mono focus:outline-none focus:border-[#f1ca62]"
                />
                <button
                  type="button"
                  onClick={handleDomainCheck}
                  className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-[#f1ca62] hover:text-black border border-white/15 text-xs font-mono text-white transition-colors"
                >
                  Verify
                </button>
              </div>

              {domainChecked && (
                <div className="mt-2 p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>Domain verified for WhatsApp enquiry. DR53 will confirm registration rates.</span>
                </div>
              )}
            </div>

            {/* Project Notes */}
            <div>
              <label className="text-xs font-mono text-zinc-400 uppercase tracking-wider block mb-1">
                Project Specifics or Custom Feature Notes:
              </label>
              <textarea
                value={customNotes}
                onChange={(e) => setCustomNotes(e.target.value)}
                rows={2}
                placeholder="Mention lookbook styles, machinery models, products, or custom integrations..."
                className="w-full px-3 py-2 rounded-xl bg-black/60 border border-white/15 text-white text-xs focus:outline-none focus:border-[#f1ca62]"
              />
            </div>
          </div>

        </div>

        {/* Right Column: Live Screen Device Mockup & Instant Itemized Quote */}
        <div className="lg:col-span-5 space-y-6 lg:sticky lg:top-24">
          
          {/* Real-time Interactive Device Mockup */}
          <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-b from-[#0a1b32] to-[#040914] border border-[rgba(241,202,98,0.35)] shadow-2xl relative overflow-hidden">
            
            <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-white/10">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                  Live Custom Screen
                </span>
              </div>

              {/* Device Mockup Switcher */}
              <div className="flex items-center bg-black/60 p-1 rounded-lg border border-white/10 gap-1">
                <button
                  onClick={() => setDevicePreview('desktop')}
                  className={`p-1 rounded ${devicePreview === 'desktop' ? 'bg-[#f1ca62] text-black' : 'text-zinc-400 hover:text-white'}`}
                  title="Desktop View"
                >
                  <Monitor className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setDevicePreview('tablet')}
                  className={`p-1 rounded ${devicePreview === 'tablet' ? 'bg-[#f1ca62] text-black' : 'text-zinc-400 hover:text-white'}`}
                  title="Tablet View"
                >
                  <Tablet className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setDevicePreview('mobile')}
                  className={`p-1 rounded ${devicePreview === 'mobile' ? 'bg-[#f1ca62] text-black' : 'text-zinc-400 hover:text-white'}`}
                  title="Mobile View"
                >
                  <Smartphone className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Rendered Mockup Container */}
            <div className="flex justify-center items-center py-1">
              <div 
                className={`transition-all duration-300 rounded-xl overflow-hidden border border-white/20 shadow-2xl bg-[#030711] ${
                  devicePreview === 'mobile' 
                    ? 'w-[230px] min-h-[300px]' 
                    : devicePreview === 'tablet' 
                    ? 'w-[310px] min-h-[300px]' 
                    : 'w-full min-h-[290px]'
                }`}
              >
                {/* Mockup Browser Top Bar */}
                <div className="px-3 py-1 bg-[#081220] border-b border-white/10 flex items-center justify-between text-[9px] font-mono text-zinc-400">
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500/80" />
                    <span className="w-1.5 h-1.5 rounded-full bg-yellow-500/80" />
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500/80" />
                  </div>
                  <span className="truncate max-w-[130px] text-zinc-500">
                    https://{domainName.trim() || 'yourbrand.com'}
                  </span>
                  <span className="text-[#f1ca62] font-bold">DR53</span>
                </div>

                {/* Mockup Page Content */}
                <div className="p-3.5 space-y-2.5 bg-[#030711]">
                  
                  {/* Mock Navbar */}
                  <div className="flex items-center justify-between pb-1.5 border-b border-white/10">
                    <span className="font-bold text-xs" style={{ color: customColor }}>
                      {businessName.trim() || activeCategory.name.split(' ')[0]}
                    </span>
                    <span className="text-[9px] px-2 py-0.5 rounded-full bg-white/10 font-mono text-zinc-300">
                      WhatsApp Live
                    </span>
                  </div>

                  {/* Mock Hero Banner with Custom Color Accent */}
                  <div className="p-3 rounded-lg border border-white/10 space-y-1" style={{ background: 'rgba(255,255,255,0.02)' }}>
                    <span className="text-[8px] font-mono uppercase tracking-wider block" style={{ color: customColor }}>
                      {activeCategory.name}
                    </span>
                    <h4 className="text-xs font-bold text-white leading-tight">
                      {businessName.trim() || activeCategory.name} Official Platform
                    </h4>
                    <p className="text-[9px] text-zinc-400 leading-snug">
                      {activeCategory.bannerSubtitle}
                    </p>
                    <div className="pt-1 flex items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded text-[8px] font-bold text-black shadow-sm" style={{ backgroundColor: customColor }}>
                        Explore Catalog
                      </span>
                      <span className="px-2 py-0.5 rounded text-[8px] border border-white/20 text-white">
                        Contact Us
                      </span>
                    </div>
                  </div>

                  {/* Mock Category Features */}
                  <div className="grid grid-cols-2 gap-1 pt-0.5">
                    {activeCategory.recommendedFeatures.slice(0, 4).map((f, i) => (
                      <div key={i} className="p-1 rounded bg-black/40 border border-white/5 text-[8px] text-zinc-300 flex items-center gap-1">
                        <Check className="w-2.5 h-2.5" style={{ color: customColor }} />
                        <span className="truncate">{f}</span>
                      </div>
                    ))}
                  </div>

                  <div className="pt-1 border-t border-white/5 flex items-center justify-between text-[8px] text-zinc-500 font-mono">
                    <span>Engineered by DR53</span>
                    <span className="text-emerald-400">WhatsApp Leads Ready</span>
                  </div>

                </div>

              </div>
            </div>

            <div className="text-center pt-2 text-[11px] font-mono text-zinc-400">
              Active Color: <strong style={{ color: customColor }}>{customColor.toUpperCase()} ({customColorName})</strong>
            </div>

          </div>

          {/* Real-time Itemized Quote Summary */}
          <div className="p-5 sm:p-6 rounded-2xl bg-gradient-to-b from-[#08172b] to-[#040b15] border border-[rgba(241,202,98,0.4)] shadow-2xl relative space-y-4">
            
            <div className="flex items-center justify-between pb-3 border-b border-[rgba(241,202,98,0.2)]">
              <div>
                <h4 className="text-base font-bold text-white">Live Estimate Summary</h4>
                <span className="text-[11px] font-mono text-[#f1ca62]">Real-time Calculation</span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-zinc-400 font-mono uppercase block">Estimated Total</span>
                <span className="text-2xl font-bold font-mono text-[#f1ca62]">
                  ₹{calculation.total.toLocaleString('en-IN')}
                </span>
              </div>
            </div>

            {/* Line Items */}
            <div className="space-y-1.5 text-xs font-mono">
              <div className="flex justify-between text-zinc-300">
                <span>Core Package ({activePackage.name}):</span>
                <span className="text-white font-bold">₹{calculation.basePrice.toLocaleString('en-IN')}</span>
              </div>

              <div className="flex justify-between text-zinc-300">
                <span>Business Category:</span>
                <span className="text-[#f1ca62]">{activeCategory.name}</span>
              </div>

              <div className="flex justify-between text-zinc-300">
                <span>Custom Brand Color:</span>
                <span style={{ color: customColor }} className="font-bold">{customColor.toUpperCase()}</span>
              </div>

              {calculation.addonsList.length > 0 && (
                <div className="pt-2 border-t border-white/5 space-y-1">
                  <span className="text-[10px] text-zinc-400 block uppercase">Selected Add-ons ({calculation.addonsList.length}):</span>
                  {calculation.addonsList.map(a => (
                    <div key={a.id} className="flex justify-between text-zinc-400 text-[11px]">
                      <span className="truncate pr-2">+ {a.name}</span>
                      <span className="text-zinc-200">₹{a.price.toLocaleString('en-IN')}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="pt-2 border-t border-white/10 flex justify-between items-center text-sm font-bold">
                <span className="text-white">Total Project Scope:</span>
                <span className="text-xl font-mono text-[#f1ca62]">
                  ₹{calculation.total.toLocaleString('en-IN')}
                </span>
              </div>
            </div>

            {/* WhatsApp Direct Action Button with Official WhatsApp Icon */}
            <button
              onClick={handleSendWhatsAppQuote}
              className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-[#25d366] to-[#128c4a] text-black font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-[0_0_25px_rgba(37,211,102,0.4)] hover:shadow-[0_0_35px_rgba(37,211,102,0.6)] hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-black"><path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.84 9.84 0 0 0 12.04 2m.01 1.67c4.54 0 8.24 3.7 8.24 8.24 0 2.2-.86 4.27-2.42 5.82a8.19 8.19 0 0 1-5.83 2.42c-1.46 0-2.89-.39-4.14-1.13l-.3-.18-3.08.81.82-3-.19-.31c-.81-1.3-1.24-2.81-1.24-4.37 0-4.54 3.7-8.24 8.24-8.24m4.52 11.23c-.25-.13-1.47-.72-1.7-.81-.23-.08-.39-.13-.56.13-.17.25-.66.81-.81.98-.15.17-.3.19-.55.06-.25-.13-1.05-.39-2-1.23-.74-.66-1.24-1.47-1.39-1.72-.15-.25-.02-.38.11-.51.11-.11.25-.29.37-.44.13-.15.17-.25.25-.42.08-.17.04-.31-.02-.44-.06-.13-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43h-.48c-.17 0-.44.06-.67.31-.23.25-.88.86-.88 2.1 0 1.24.9 2.44 1.03 2.61.13.17 1.76 2.68 4.26 3.76.6.26 1.06.41 1.42.53.6.19 1.15.16 1.58.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.15-1.18-.07-.1-.23-.17-.48-.3z"/></svg>
              <span>Send Specification to Adam</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>

            <p className="text-[10px] text-zinc-400 text-center leading-tight">
              Pre-formats your selected category, custom brand color, and pricing into a ready-to-send WhatsApp message to founder Adam Bhaimia in Pune.
            </p>

          </div>

        </div>

      </div>

    </div>
  );
};

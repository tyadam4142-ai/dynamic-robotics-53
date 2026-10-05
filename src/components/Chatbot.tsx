import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, Send, X, Bot, Sparkles, Volume2, VolumeX, ExternalLink, RefreshCw } from 'lucide-react';
import { PRODUCTS, BUSINESS_CATEGORIES } from '../data/products';

interface Message {
  id: string;
  sender: 'bot' | 'user';
  text: string;
  timestamp: string;
  actions?: { label: string; action: () => void; isWa?: boolean; waText?: string }[];
}

const QUICK_PROMPTS = [
  'What are your 7 hardware builds?',
  'How much does a website cost?',
  'I have a clothing brand',
  'Tell me about Tap Tag smart cards',
  'What is the E-Adapter power bank?',
  'How can I visit your lab in Pune?'
];

export const Chatbot: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [unreadCount, setUnreadCount] = useState(1);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      sender: 'bot',
      text: 'Greetings! I am the DR53 Engineering Concierge. I can help you with hardware builds (robotics, AI vision, gesture glove), Tap Tag smart cards, or configuring your custom business website.',
      timestamp: 'Online'
    }
  ]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
      setUnreadCount(0);
    }
  }, [isOpen, messages, isTyping]);

  const playChime = () => {
    if (!soundEnabled || typeof window === 'undefined') return;
    try {
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(659.25, ctx.currentTime);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.04, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    } catch {
      // Audio unavailable
    }
  };

  const getBotResponse = (query: string): { text: string; waText?: string } => {
    const q = query.toLowerCase().trim();

    // 1. Founder & Background
    if (q.includes('adam') || q.includes('founder') || q.includes('who are you') || q.includes('who made') || q.includes('dr53') || q.includes('dynamic robotics')) {
      return {
        text: 'Dynamic Robotics 53 (DR53) is an engineering studio founded by Adam Bhaimia in Pune, Maharashtra, India. We engineer physical robotics prototypes, AI computer vision inspection systems, embedded electronics, Tap Tag touchless cards, and high-performance custom business websites.',
        waText: 'Hi Adam, I want to learn more about DR53 and your engineering services.'
      };
    }

    // 2. Hardware Builds Overview
    if (q.includes('build') || q.includes('projects') || q.includes('hardware') || q.includes('portfolio') || q.includes('what do you build')) {
      return {
        text: 'DR53 has 7 core hardware engineering builds:\n1. Autonomous Robotics (ESP32 LiDAR rover)\n2. Talking Gesture Glove (sign-to-speech assistive glove)\n3. AI & Computer Vision (PPE helmet/person detection & sorting)\n4. Embedded Electronics Systems (ESP32/Arduino circuitry)\n5. Servo Articulated Robotic Hand (PCA9685 PWM multi-joint fingers)\n6. Trash Collecting Rover (solar assisted vacuum cleanup)\n7. E-Adapter Power Bank (IPS306 solar + manual hand crank emergency charger — ₹2,553)',
        waText: 'Hi Adam, I want to discuss your hardware engineering builds.'
      };
    }

    // 3. E-Adapter Power Bank
    if (q.includes('e-adapter') || q.includes('adapter') || q.includes('crank') || q.includes('solar charger') || q.includes('power bank')) {
      return {
        text: 'The E-Adapter is our tactical emergency power bank (IPS306 Power / Solar / Crank). It features a 10,000mAh high-density cell, a top solar absorption panel, and a folding mechanical hand-crank dynamo so you can generate emergency power anywhere off the grid. Price is ₹2,553 with direct courier dispatch from Pune.',
        waText: 'Hi Adam, I want to purchase the E-Adapter Power Bank for ₹2553.'
      };
    }

    // 4. Tap Tag Cards (Zero NFC mention as requested)
    if (q.includes('tap tag') || q.includes('tap card') || q.includes('business card') || q.includes('touchless') || q.includes('smart card')) {
      return {
        text: 'DR53 Tap Tag is our secret instant-touch smart profile card! Simply tap it against any iPhone or Android phone, and it immediately transmits your website, WhatsApp, catalog, Google reviews, or digital contact card. Zero app needed on the client\'s phone!\n• Sticker Smart Tag: ₹553\n• Hot Top Card: ₹753\n• Executive Matte Edition: ₹1,553',
        waText: 'Hi Adam, I want to order the DR53 Tap Tag Smart Card.'
      };
    }

    // 5. Website Pricing & Packages
    if (q.includes('price') || q.includes('cost') || q.includes('how much') || q.includes('package') || q.includes('pricing') || q.includes('website')) {
      return {
        text: 'DR53 crafts high-performance custom business websites with instant WhatsApp lead generation:\n• Starter Package: ₹5,300 (Up to 2 pages, mobile responsive, dark aesthetic)\n• Professional Package: ₹7,500 (Up to 5 pages, catalog/lookbook, SEO, lead form)\n• Enterprise / Business: ₹10,000 (Up to 8 pages, priority 48h build, custom interactive features)\nUse our interactive website builder below to select add-ons and calculate your live quote!',
        waText: 'Hi Adam, I would like a quote for a custom business website.'
      };
    }

    // 6. Clothing / Fashion Category
    if (q.includes('clothing') || q.includes('fashion') || q.includes('apparel') || q.includes('boutique') || q.includes('brand')) {
      return {
        text: 'For Clothing & Fashion brands, we recommend our Professional Package (₹7,500) paired with the Interactive Lookbook Gallery (+₹900) and Direct WhatsApp Order Cart (+₹700). Your customers can browse your seasonal collection, view fabric details, and order directly on WhatsApp without high e-commerce commission cuts!',
        waText: 'Hi Adam, I want a website designed for my Clothing / Fashion brand.'
      };
    }

    // 7. Industrial / Manufacturing Category
    if (q.includes('industrial') || q.includes('factory') || q.includes('machinery') || q.includes('manufacturing') || q.includes('fabricat')) {
      return {
        text: 'For Industrial & Manufacturing companies, we recommend our Professional (₹7,500) or Enterprise Package (₹10,000) with a Technical Specification Matrix, PDF Spec Sheet downloads, and a Direct Request for Quote (RFQ) Form (+₹800). This helps you win high-value B2B and export contracts.',
        waText: 'Hi Adam, I need an industrial manufacturing website designed.'
      };
    }

    // 8. Location & Visiting Lab
    if (q.includes('location') || q.includes('where') || q.includes('pune') || q.includes('visit') || q.includes('address') || q.includes('meet')) {
      return {
        text: 'Dynamic Robotics 53 is based in Pune, Maharashtra, India. In-person hardware demonstrations and project consultations happen directly with founder Adam Bhaimia. Message Adam on WhatsApp (+91 81499 16052) to book a lab visit.',
        waText: 'Hi Adam, I would like to schedule a visit to the DR53 lab in Pune.'
      };
    }

    // 9. Achievements & Milestones
    if (q.includes('achievement') || q.includes('award') || q.includes('biea') || q.includes('wsc') || q.includes('scholar') || q.includes('ftc')) {
      return {
        text: 'Recent milestones by Adam Bhaimia & DR53:\n• BIEA 2026: Presented A-Zero autonomous zero-handling food supply chain concept (Raspberry Pi 5 + AI vision + sensor logistics)\n• WSC 2026: World Scholar\'s Cup debate round victory\n• FTC 2026–27: Active Java + mecanum-drive robotics competitive system',
        waText: 'Hi Adam, congratulations on the BIEA and WSC milestones! Let\'s connect.'
      };
    }

    // 10. Assistive Glove & AI Vision
    if (q.includes('glove') || q.includes('vision') || q.includes('opencv') || q.includes('camera') || q.includes('sign language')) {
      return {
        text: 'Our Talking Gesture Glove translates flex sensor finger movements and MPU6050 orientation into speech audio. Our AI Vision system runs edge detection on Raspberry Pi 5 for industrial worker safety (detecting helmets & vests with 98% accuracy) and conveyor sorting.',
        waText: 'Hi Adam, I am very interested in your AI Vision & Assistive Glove builds.'
      };
    }

    // Default intelligent fallback
    return {
      text: `I'd love to help you with that! I can provide technical blueprints on our 7 hardware builds, calculate an exact website quote for your industry (${BUSINESS_CATEGORIES.map(c => c.name.split(' ')[0]).join(', ')}), or set up a Tap Tag smart card order. You can also chat directly with Adam on WhatsApp at +91 81499 16052.`,
      waText: `Hi Adam, I have a question regarding: "${query}"`
    };
  };

  const handleSend = (textToSend?: string) => {
    const query = textToSend || input;
    if (!query.trim()) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      sender: 'user',
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    // Natural bot response delay
    setTimeout(() => {
      const response = getBotResponse(query);
      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'bot',
        text: response.text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        actions: response.waText ? [
          {
            label: 'Discuss with Adam on WhatsApp ↗',
            action: () => {},
            isWa: true,
            waText: response.waText
          }
        ] : undefined
      };

      setMessages((prev) => [...prev, botMsg]);
      setIsTyping(false);
      playChime();
    }, 600);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      {/* Floating Chat Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-24 right-5 sm:right-6 z-50 p-3.5 rounded-full bg-gradient-to-r from-[#c99a2e] to-[#f1ca62] text-black shadow-[0_0_30px_rgba(201,154,46,0.45)] hover:shadow-[0_0_45px_rgba(201,154,46,0.6)] hover:scale-105 active:scale-95 transition-all group"
        aria-label="Open DR53 Concierge"
      >
        <div className="relative">
          {isOpen ? <X className="w-6 h-6 stroke-[2.5]" /> : <MessageSquare className="w-6 h-6 fill-black" />}
          {!isOpen && unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-[#030711] animate-ping" />
          )}
        </div>
      </button>

      {/* Chat Window Panel */}
      {isOpen && (
        <div className="fixed bottom-40 right-4 sm:right-6 z-50 w-[92vw] sm:w-[400px] h-[520px] max-h-[80vh] flex flex-col rounded-3xl bg-gradient-to-b from-[#09182d] via-[#050f1d] to-[#030811] border border-[rgba(241,202,98,0.35)] shadow-[0_25px_70px_rgba(0,0,0,0.85),0_0_50px_rgba(201,154,46,0.2)] overflow-hidden anim-pop">
          
          {/* Header */}
          <div className="px-5 py-4 bg-black/60 border-b border-[rgba(241,202,98,0.2)] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-9 h-9 rounded-xl bg-[#f1ca62] text-black font-mono font-bold flex items-center justify-center text-xs shadow-md">
                  DR53
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-black" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                  DR53 Concierge
                  <Sparkles className="w-3.5 h-3.5 text-[#f1ca62]" />
                </h4>
                <span className="text-[11px] font-mono text-emerald-400">System Online · Direct Access</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setSoundEnabled(!soundEnabled)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white"
                title={soundEnabled ? 'Mute' : 'Enable audio'}
              >
                {soundEnabled ? <Volume2 className="w-4 h-4 text-[#f1ca62]" /> : <VolumeX className="w-4 h-4" />}
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages Feed */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3.5 text-xs">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl p-3.5 leading-relaxed whitespace-pre-line ${
                    msg.sender === 'user'
                      ? 'bg-gradient-to-r from-[#c99a2e] to-[#f1ca62] text-black font-medium shadow-md'
                      : 'bg-black/60 border border-[rgba(241,202,98,0.2)] text-zinc-200 shadow-sm'
                  }`}
                >
                  {msg.text}

                  {msg.actions && msg.actions.length > 0 && (
                    <div className="mt-3 pt-2.5 border-t border-white/10 space-y-1.5">
                      {msg.actions.map((act, idx) => (
                        <a
                          key={idx}
                          href={act.isWa ? `https://wa.me/918149916052?text=${encodeURIComponent(act.waText || '')}` : undefined}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500 text-emerald-300 hover:text-black border border-emerald-500/30 text-[11px] font-mono font-bold transition-all"
                        >
                          <span>{act.label}</span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
                <span className="text-[9px] font-mono text-zinc-500 mt-1 px-1">
                  {msg.timestamp}
                </span>
              </div>
            ))}

            {isTyping && (
              <div className="flex items-center gap-1.5 p-3 rounded-2xl bg-black/60 border border-white/10 w-fit text-zinc-400">
                <span className="w-1.5 h-1.5 rounded-full bg-[#f1ca62] animate-bounce" />
                <span className="w-1.5 h-1.5 rounded-full bg-[#f1ca62] animate-bounce [animation-delay:0.15s]" />
                <span className="w-1.5 h-1.5 rounded-full bg-[#f1ca62] animate-bounce [animation-delay:0.3s]" />
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick Prompts Carousel */}
          <div className="px-3 py-2 bg-black/40 border-t border-white/5 flex gap-1.5 overflow-x-auto text-[10px] font-mono no-scrollbar">
            {QUICK_PROMPTS.map((prompt, i) => (
              <button
                key={i}
                onClick={() => handleSend(prompt)}
                className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-zinc-300 hover:border-[#f1ca62] hover:text-[#f1ca62] whitespace-nowrap transition-colors"
              >
                {prompt}
              </button>
            ))}
          </div>

          {/* Input Bar */}
          <div className="p-3 bg-black/70 border-t border-white/10 flex items-center gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about builds, website pricing, tap tag..."
              className="flex-1 px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/15 text-white text-xs placeholder:text-zinc-500 focus:outline-none focus:border-[#f1ca62]"
            />
            <button
              onClick={() => handleSend()}
              disabled={!input.trim()}
              className="p-2.5 rounded-xl bg-[#f1ca62] text-black disabled:opacity-40 hover:bg-white transition-all shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>

        </div>
      )}
    </>
  );
};

import React from 'react';
import {
  ArrowUpRight,
  CheckCircle2,
  Download,
  LockKeyhole,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';

const T53_DOWNLOAD_URL = 'https://t53.dynamicrobotics53.com/download/';

export const T53Section: React.FC = () => {
  return (
    <section
      id="t53"
      className="relative py-16 lg:py-24 border-y border-[rgba(241,202,98,0.18)] overflow-hidden"
      aria-labelledby="t53-title"
    >
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_15%_35%,rgba(241,202,98,0.10),transparent_28%),radial-gradient(circle_at_90%_70%,rgba(56,189,248,0.08),transparent_25%)]" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          <div className="lg:col-span-7 space-y-6">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#f1ca62]/10 border border-[#f1ca62]/30 text-[#f1ca62] text-[10px] sm:text-xs font-mono uppercase tracking-[0.18em]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#f1ca62]" />
                T53 · Telecom 53
              </span>
              <span className="px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-zinc-400 text-[10px] sm:text-xs font-mono uppercase tracking-[0.14em]">
                New from DR53
              </span>
            </div>

            <div>
              <h2 id="t53-title" className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white leading-tight">
                A simpler phone <span className="text-[#f1ca62]">for your child.</span>
              </h2>
              <p className="mt-4 max-w-2xl text-sm sm:text-base text-zinc-300 leading-relaxed">
                T53 is DR53&apos;s family-focused phone platform: a cleaner way for children to stay connected while parents keep the important controls in one place.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                {
                  icon: ShieldCheck,
                  title: 'Safety first',
                  text: 'Built around clear, responsible family controls.',
                },
                {
                  icon: LockKeyhole,
                  title: 'Parent control',
                  text: 'Simple controls without digging through menus.',
                },
                {
                  icon: Smartphone,
                  title: 'Made for phones',
                  text: 'A focused experience instead of a cluttered device.',
                },
              ].map((item, index) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.title}
                    className="t53-mini-card"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="t53-mini-icon">
                        <Icon className="w-4 h-4" />
                      </div>
                      <span className="text-[10px] font-mono uppercase tracking-wider text-[#f1ca62]">0{index + 1}</span>
                    </div>
                    <h3 className="mt-3 text-sm font-bold text-white">{item.title}</h3>
                    <p className="mt-1.5 text-xs leading-relaxed text-zinc-400">{item.text}</p>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <a
                href={T53_DOWNLOAD_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-shimmer inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-[#c99a2e] to-[#f1ca62] text-black font-bold text-xs uppercase tracking-wider shadow-[0_0_28px_rgba(201,154,46,0.3)] hover:shadow-[0_0_40px_rgba(241,202,98,0.45)] hover:scale-[1.02] transition-all"
              >
                <Download className="w-4 h-4" />
                Download for Android
                <ArrowUpRight className="w-3.5 h-3.5" />
              </a>
              <a
                href="https://t53.dynamicrobotics53.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-[#f1ca62]/40 text-zinc-200 font-semibold text-xs uppercase tracking-wider transition-all"
              >
                Explore T53
                <ArrowUpRight className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          <div className="lg:col-span-5">
            <div className="t53-product-card">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="t53-logo-mark" aria-hidden="true">
                    <div className="t53-logo-screen">T53</div>
                  </div>
                  <div>
                    <div className="text-base font-bold text-white">T53</div>
                    <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Telecom 53</div>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-400/10 border border-emerald-400/25 text-[10px] font-mono text-emerald-300 uppercase tracking-wider">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
                  Android ready
                </span>
              </div>

              <div className="mt-6 space-y-3">
                <div className="t53-platform-card t53-platform-active">
                  <div className="flex items-center gap-3">
                    <div className="t53-platform-icon">A</div>
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-white">Android</div>
                      <div className="text-[11px] text-zinc-400">Android APK · direct download</div>
                    </div>
                  </div>
                  <a
                    href={T53_DOWNLOAD_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#f1ca62] text-black text-[10px] font-bold uppercase tracking-wider hover:bg-white transition-colors"
                  >
                    Get T53
                    <ArrowUpRight className="w-3 h-3" />
                  </a>
                </div>

                <div className="t53-platform-card opacity-75">
                  <div className="flex items-center gap-3">
                    <div className="t53-platform-icon t53-platform-icon-muted"></div>
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-white">iOS</div>
                      <div className="text-[11px] text-zinc-400">Apple version is being prepared</div>
                    </div>
                  </div>
                  <span className="shrink-0 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400">
                    Coming soon
                  </span>
                </div>
              </div>

              <div className="mt-5 pt-5 border-t border-white/10 grid grid-cols-2 gap-3 text-[10px] font-mono uppercase tracking-wider">
                <div className="flex items-center gap-2 text-zinc-400">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#f1ca62]" />
                  Parent-focused
                </div>
                <div className="flex items-center gap-2 text-zinc-400">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#f1ca62]" />
                  Privacy-minded
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-[#f1ca62]/15 bg-[#f1ca62]/5 px-3.5 py-3 text-[11px] leading-relaxed text-zinc-400">
                T53 is designed to keep the experience focused: no hidden microphone, camera recording, or private-message scraping.
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

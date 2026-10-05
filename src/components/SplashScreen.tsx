import React, { useState, useEffect } from 'react';
import { BrandLogo } from './BrandLogo';
import { asset } from '../lib/asset';

export const SplashScreen: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
  const [phase, setPhase] = useState(0);
  const [isExiting, setIsExiting] = useState(false);

  const phases = [
    'Robotics · AI Vision · Embedded Systems',
    'Calibrating Core Sensor Arrays...',
    'Loading Tap Tag Transceivers...',
    'Dynamic Robotics 53 Core Online'
  ];

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 500);
    const t2 = setTimeout(() => setPhase(2), 1200);
    const t3 = setTimeout(() => setPhase(3), 1900);
    const t4 = setTimeout(() => {
      setIsExiting(true);
      setTimeout(onComplete, 600);
    }, 2600);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, [onComplete]);

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center bg-[#030711] overflow-hidden transition-all duration-700 ${isExiting ? 'opacity-0 scale-105 pointer-events-none' : 'opacity-100'}`}>
      
      {/* Background Ambience */}
      <div 
        className="absolute inset-0 bg-cover bg-center opacity-30 filter blur-sm scale-110"
        style={{ backgroundImage: `url('${asset('assets/logo.png')}')` }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-[#030711] via-[#030711]/90 to-[#030711]/80" />
      
      {/* Futuristic Orbiting Rings */}
      <div className="absolute w-[400px] h-[400px] rounded-full border border-dashed border-[#f1ca62]/30 animate-spin-slow pointer-events-none" />
      <div className="absolute w-[500px] h-[500px] rounded-full border border-dashed border-[#f1ca62]/15 animate-spin-reverse pointer-events-none" />

      {/* Center Core Display */}
      <div className="relative z-10 flex flex-col items-center text-center px-6 max-w-md animate-fade-in">
        
        {/* Animated Logo Container with Glow */}
        <div className="relative mb-6">
          <div className="absolute -inset-3 rounded-full bg-gradient-to-r from-[#c99a2e]/50 via-[#f1ca62]/60 to-[#c99a2e]/50 blur-xl animate-pulse" />
          <div className="relative w-32 h-32 sm:w-36 sm:h-36 rounded-2xl overflow-hidden border-2 border-[#f1ca62] shadow-[0_0_50px_rgba(241,202,98,0.5)] bg-black">
            <BrandLogo className="w-full h-full rounded-2xl" />
          </div>
        </div>

        {/* Title */}
        <h1 className="text-3xl sm:text-4xl font-bold font-sans text-white tracking-tight">
          Dynamic Robotics <span className="text-[#f1ca62]">53</span>
        </h1>

        <div className="mt-2 text-xs sm:text-sm font-mono text-[#f1ca62] tracking-wider min-h-[20px]">
          {phases[phase]}
        </div>

        {/* Progress Bar */}
        <div className="w-56 h-1.5 bg-white/10 rounded-full overflow-hidden mt-6 relative">
          <div 
            className="h-full bg-gradient-to-r from-[#c99a2e] via-[#f1ca62] to-white rounded-full transition-all duration-500 ease-out"
            style={{ width: `${(phase + 1) * 25}%` }}
          />
        </div>

        {/* Founder Tag */}
        <span className="text-[11px] font-mono text-zinc-500 mt-4 tracking-widest uppercase">
          Founded by Adam Bhaimia · Pune, India
        </span>

        {/* Quick Skip button */}
        <button
          onClick={() => {
            setIsExiting(true);
            setTimeout(onComplete, 300);
          }}
          className="mt-6 text-[10px] font-mono text-zinc-500 hover:text-white uppercase tracking-wider underline transition-colors"
        >
          Skip Intro →
        </button>

      </div>

    </div>
  );
};

import React from 'react';
import { asset } from '../lib/asset';

interface BrandLogoProps {
  className?: string;
  href?: string;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({ className = 'w-12 h-12', href = '#' }) => (
  <a
    href={href}
    className={`relative rounded-xl overflow-hidden border border-[#f1ca62]/50 shadow-[0_0_15px_rgba(201,154,46,0.25)] bg-[#050e1c] flex-shrink-0 flex items-center justify-center transition-transform hover:scale-105 group ${className}`}
    title="Dynamic Robotics 53"
  >
    <img
      src={asset('assets/logo.png')}
      alt="Dynamic Robotics 53 Logo"
      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
    />
  </a>
);

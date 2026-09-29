import React from 'react';
import { MapPin, ArrowUp } from 'lucide-react';

interface FooterProps {
  onOpenRetailerModal: () => void;
  onOpenLocationModal: () => void;
  onNavigateToAdmin?: () => void;
}

export const Footer: React.FC<FooterProps> = ({ onOpenRetailerModal, onOpenLocationModal, onNavigateToAdmin }) => {
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <footer className="bg-[#07080B] border-t border-white/10 pt-20 pb-14 px-6 sm:px-8 text-slate-400 text-xs selection:bg-white selection:text-black">
      <div className="max-w-6xl mx-auto space-y-16">
        
        {/* Top Grid */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10">
          
          {/* Brand Col */}
          <div className="md:col-span-6 space-y-4 text-left">
            <span className="text-xl font-black text-white font-['Outfit'] block">
              zooner<span className="text-slate-500">.</span>
            </span>
            
            <p className="text-slate-300 text-sm max-w-sm leading-relaxed font-normal">
              The local product discovery platform connecting shoppers with real in-store stock across physical retailers.
            </p>

            <button
              onClick={onOpenLocationModal}
              className="inline-flex items-center gap-2 text-xs text-slate-300 hover:text-white border border-slate-800 hover:border-slate-700 px-3.5 py-1.5 rounded-full transition-all cursor-pointer"
            >
              <MapPin className="h-3.5 w-3.5 text-emerald-400" />
              <span>Active in <strong className="text-white">Coimbatore</strong> & expanding</span>
            </button>
          </div>

          {/* Nav Links */}
          <div className="md:col-span-3 text-left space-y-3">
            <span className="font-bold text-white text-sm block">Navigation</span>
            <ul className="space-y-2.5 text-slate-300 font-medium">
              <li>
                <a href="#" className="hover:text-white transition-colors">Home</a>
              </li>
              <li>
                <a href="#how-it-works" className="hover:text-white transition-colors">How It Works</a>
              </li>
              <li>
                <a href="#stores" className="hover:text-white transition-colors">Stores</a>
              </li>
              {onNavigateToAdmin && (
                <li>
                  <button
                    onClick={onNavigateToAdmin}
                    className="hover:text-white transition-colors cursor-pointer text-left text-slate-400 hover:text-purple-400"
                  >
                    Admin Portal
                  </button>
                </li>
              )}
            </ul>
          </div>

          {/* Merchants */}
          <div className="md:col-span-3 text-left space-y-3">
            <span className="font-bold text-white text-sm block">For Retailers</span>
            <ul className="space-y-2.5 text-slate-300 font-medium">
              <li>
                <button 
                  onClick={onOpenRetailerModal}
                  className="hover:text-white transition-colors cursor-pointer text-left"
                >
                  Register Store
                </button>
              </li>
              <li>
                <button 
                  onClick={onOpenRetailerModal}
                  className="hover:text-white transition-colors cursor-pointer text-left"
                >
                  Merchant Portal
                </button>
              </li>
            </ul>
          </div>

        </div>

        {/* Bottom Copyright & Back to Top */}
        <div className="pt-8 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
          <div>
            © {new Date().getFullYear()} Zooner Technologies Inc. All rights reserved.
          </div>

          <div className="flex items-center gap-6">
            <button 
              onClick={scrollToTop}
              className="flex items-center gap-1.5 text-slate-300 hover:text-white transition-colors cursor-pointer font-medium"
            >
              <span>Back to top</span>
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

      </div>
    </footer>
  );
};

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, ArrowRight, CheckCircle2, Loader2, Sparkles, MapPin, Store, User } from 'lucide-react';
import { joinWaitlist } from '../services/api';
import type { LocationArea } from '../types';

interface WaitlistSectionProps {
  currentLocation?: LocationArea;
}

export const WaitlistSection: React.FC<WaitlistSectionProps> = ({ currentLocation }) => {
  const [email, setEmail] = useState('');
  const [city, setCity] = useState(currentLocation?.city || 'Coimbatore');
  const [userType, setUserType] = useState<'Shopper' | 'Retailer'>('Shopper');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | null; message: string }>({
    type: null,
    message: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes('@')) {
      setStatus({ type: 'error', message: 'Please enter a valid email address.' });
      return;
    }

    setLoading(true);
    setStatus({ type: null, message: '' });

    try {
      const res = await joinWaitlist({
        email: email.trim(),
        city: city.trim() || 'Coimbatore',
        userType
      });

      if (res.success) {
        setStatus({
          type: 'success',
          message: res.message || "You're on the early access waitlist! We'll notify you as soon as we launch."
        });
        setEmail('');
      } else {
        setStatus({
          type: 'error',
          message: res.message || 'Failed to join waitlist. Please try again.'
        });
      }
    } catch {
      setStatus({
        type: 'error',
        message: 'Something went wrong. Please check your connection and try again.'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <section id="waitlist" className="relative py-24 sm:py-32 px-6 sm:px-8 bg-[#0B0E14] text-white border-t border-white/10 overflow-hidden">
      {/* Ambient background glow */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[28rem] w-[42rem] rounded-full bg-gradient-to-tr from-[#7C5CFF]/15 via-[#20D99A]/10 to-transparent blur-[120px]" />

      <div className="relative mx-auto max-w-4xl text-center space-y-8 z-10">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.6 }}
          className="space-y-4"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-[#7C5CFF]/30 bg-[#7C5CFF]/10 px-4 py-1.5 text-xs font-bold text-[#A894FF]">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Early Access · City Expansion</span>
          </div>

          <h2
            className="font-['Outfit'] font-black tracking-tight text-white leading-[0.95]"
            style={{ fontSize: 'clamp(2.4rem, 6vw, 4.4rem)' }}
          >
            Be first when Zooner <br />
            <span className="bg-gradient-to-r from-[#8247ff] via-[#4968f5] to-[#20D99A] bg-clip-text text-transparent">
              launches in your neighborhood.
            </span>
          </h2>

          <p className="mx-auto max-w-xl text-base sm:text-lg text-slate-400 leading-relaxed pt-1">
            Join thousands of shoppers and local store owners getting priority invitations, zero-commission retail onboarding, and early beta access.
          </p>
        </motion.div>

        {/* Waitlist Form Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 20 }}
          whileInView={{ opacity: 1, scale: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.65, delay: 0.1 }}
          className="mx-auto max-w-xl rounded-3xl border border-white/15 bg-white/[0.04] p-6 sm:p-8 backdrop-blur-xl shadow-2xl shadow-black/40"
        >
          {/* User Type Toggle */}
          <div className="flex items-center justify-center gap-2 p-1 rounded-2xl bg-white/[0.06] border border-white/10 mb-6 max-w-xs mx-auto">
            <button
              type="button"
              onClick={() => setUserType('Shopper')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold transition-all ${
                userType === 'Shopper'
                  ? 'bg-white text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <User className="h-3.5 w-3.5" />
              <span>I'm a Shopper</span>
            </button>
            <button
              type="button"
              onClick={() => setUserType('Retailer')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold transition-all ${
                userType === 'Retailer'
                  ? 'bg-emerald-400 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Store className="h-3.5 w-3.5" />
              <span>I'm a Retailer</span>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 text-left">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input
                  type="email"
                  required
                  placeholder="Enter your email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-2xl border border-white/15 bg-black/40 pl-11 pr-4 py-3.5 text-sm text-white placeholder-slate-500 focus:border-[#7C5CFF] focus:outline-none focus:ring-2 focus:ring-[#7C5CFF]/30 transition-all"
                />
              </div>

              <div className="relative sm:w-44">
                <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-400" />
                <input
                  type="text"
                  placeholder="City"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full rounded-2xl border border-white/15 bg-black/40 pl-9 pr-3 py-3.5 text-sm text-white placeholder-slate-500 focus:border-[#7C5CFF] focus:outline-none focus:ring-2 focus:ring-[#7C5CFF]/30 transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#4968f5] to-[#7944ed] hover:brightness-110 py-4 px-6 text-sm font-bold text-white shadow-lg shadow-[#7257ff]/25 transition-all cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Joining priority waitlist...</span>
                </>
              ) : (
                <>
                  <span>Join Early Access Waitlist</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          {/* Feedback message */}
          <AnimatePresence mode="wait">
            {status.type && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className={`mt-4 flex items-start gap-2.5 p-3.5 rounded-2xl text-xs font-medium ${
                  status.type === 'success'
                    ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
                    : 'bg-red-500/15 border border-red-500/30 text-red-300'
                }`}
              >
                {status.type === 'success' && <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />}
                <span>{status.message}</span>
              </motion.div>
            )}
          </AnimatePresence>

          <p className="mt-4 text-center text-[11px] text-slate-500">
            No spam, ever. Unsubscribe anytime with 1 click.
          </p>
        </motion.div>
      </div>
    </section>
  );
};

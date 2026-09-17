import React, { useEffect, useState } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { Apple, CheckCircle2, MapPin, Play } from 'lucide-react';
import { TheIdea } from '../components/TheIdea';
import { TheProblem } from '../components/TheProblem';
import { LocalDiscovery } from '../components/LocalDiscovery';
import { FinalCTA } from '../components/FinalCTA';
import { Footer } from '../components/Footer';
import { ProductJourney } from '../components/ProductJourney';
import { RetailerCallout } from '../components/RetailerCallout';
import { WaitlistSection } from '../components/WaitlistSection';
import { WaitlistPopupModal } from '../components/WaitlistPopupModal';
import type { LocationArea } from '../types';

interface PublicLandingPageProps { currentLocation: LocationArea; onOpenLocationModal: () => void; onLaunchCustomerApp: () => void; onNavigateToVendor: () => void; }

export const PublicLandingPage: React.FC<PublicLandingPageProps> = ({ currentLocation, onOpenLocationModal, onLaunchCustomerApp, onNavigateToVendor }) => {
  const [seconds, setSeconds] = useState(1787);
  const pointerX = useMotionValue(0); const pointerY = useMotionValue(0);
  const rotateX = useSpring(useTransform(pointerY, [-300, 300], [4, -4]), { stiffness: 180, damping: 24 });
  const rotateY = useSpring(useTransform(pointerX, [-300, 300], [-4, 4]), { stiffness: 180, damping: 24 });
  useEffect(() => { const interval = window.setInterval(() => setSeconds(value => value > 0 ? value - 1 : 1800), 1000); return () => clearInterval(interval); }, []);
  const mins = String(Math.floor(seconds / 60)).padStart(2, '0'); const secs = String(seconds % 60).padStart(2, '0');

  return <div className="flex min-h-screen flex-col bg-[#08090C] font-sans text-[#F7F7F8]">
    <section onMouseMove={event => { const rect = event.currentTarget.getBoundingClientRect(); pointerX.set(event.clientX - rect.left - rect.width / 2); pointerY.set(event.clientY - rect.top - rect.height / 2); }} onMouseLeave={() => { pointerX.set(0); pointerY.set(0); }} className="relative isolate min-h-[840px] overflow-hidden bg-[#fbfcff] px-6 pb-16 pt-32 text-[#0b1020] sm:px-8 lg:min-h-screen lg:pt-28">
      <div className="pointer-events-none absolute -left-40 top-24 h-[34rem] w-[34rem] rounded-full bg-cyan-200/20 blur-[100px]" />
      <div className="pointer-events-none absolute right-[4%] top-[22%] h-[38rem] w-[38rem] rounded-full bg-gradient-to-br from-[#d8d1ff] via-[#edf1ff] to-[#d9f5ff] opacity-90" />
      <div className="relative mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[.95fr_1.05fr] lg:gap-6">
        <div className="relative z-10 pt-8 lg:pt-0">
          <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-xs font-bold uppercase tracking-[0.35em] text-[#6e7485]">Search · Verify · Walk in</motion.p>
          <motion.h1 initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .08, duration: .75 }} className="mt-6 font-['Outfit'] text-[clamp(3.6rem,7.4vw,7.2rem)] font-black leading-[.88] tracking-[-.07em]">Real stock.<br /><span className="bg-gradient-to-r from-[#315bd4] to-[#8247ff] bg-clip-text text-transparent">Nearby.</span></motion.h1>
          <motion.p initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .18, duration: .65 }} className="mt-8 max-w-xl text-lg leading-relaxed text-[#5d6475] sm:text-xl">Find products on nearby physical shelves, know they are actually available, then reserve them for 30 minutes and walk in today.</motion.p>
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .28, duration: .6 }} className="mt-10 flex flex-wrap gap-3">
            <motion.button whileHover={{ y: -2 }} whileTap={{ scale: .97 }} onClick={onLaunchCustomerApp} className="flex min-w-[190px] items-center gap-3 rounded-full bg-[#0d1221] px-6 py-3.5 text-left text-white shadow-xl shadow-slate-900/15"><Play className="h-7 w-7 fill-[#7C5CFF] text-[#7C5CFF]" /><span className="leading-tight"><span className="block text-[10px] font-medium text-slate-300">Discover products with</span><span className="text-lg font-bold">Zooner App</span></span></motion.button>
            <motion.button whileHover={{ y: -2 }} whileTap={{ scale: .97 }} onClick={onLaunchCustomerApp} className="flex min-w-[190px] items-center gap-3 rounded-full border border-slate-200 bg-white/60 px-6 py-3.5 text-left shadow-sm"><Apple className="h-8 w-8 fill-[#0d1221]" /><span className="leading-tight"><span className="block text-[10px] font-medium text-[#6e7485]">Available on</span><span className="text-lg font-bold">iOS & Android</span></span></motion.button>
          </motion.div>
          <button onClick={onOpenLocationModal} className="mt-24 flex items-center gap-3 text-sm font-medium text-[#747b8b] transition-colors hover:text-[#0b1020]"><span className="h-px w-11 bg-[#798195]" /><MapPin className="h-4 w-4 text-[#6e55ee]" /> Searching around {currentLocation.name}</button>
        </div>
        <motion.div initial={{ opacity: 0, scale: .94, y: 30 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: .9, ease: [0.16, 1, .3, 1] }} style={{ rotateX, rotateY, perspective: 1400 }} className="relative z-10 mx-auto flex min-h-[560px] w-full max-w-[570px] items-center justify-center lg:min-h-[690px]">
          <div className="absolute h-[390px] w-[390px] rounded-full border border-white/80 bg-white/30 shadow-[0_0_90px_rgba(113,99,245,.15)] sm:h-[510px] sm:w-[510px]" /><div className="absolute h-[250px] w-[250px] rounded-full border border-[#7C5CFF]/10 sm:h-[340px] sm:w-[340px]" />
          <div className="relative w-[270px] rotate-[7deg] rounded-[3rem] border-[7px] border-[#17191e] bg-[#0d0f14] p-1.5 shadow-[18px_30px_35px_rgba(20,26,46,.3)] sm:w-[330px]"><div className="min-h-[535px] overflow-hidden rounded-[2.45rem] bg-white px-5 py-4 sm:min-h-[630px]"><div className="flex items-center justify-between px-1 text-[10px] font-bold text-slate-800"><span>9:41</span><div className="h-5 w-20 rounded-full bg-black" /><span>5G</span></div><div className="mt-6 text-center font-['Outfit'] text-2xl font-black tracking-tight">zooner<span className="text-[#7257ff]">.</span></div><div className="mt-8"><p className="text-[11px] font-semibold text-slate-400">Find nearby</p><h2 className="mt-1 text-2xl font-black leading-none tracking-tight text-[#101421]">Sony WH-<br /><span className="text-[#6d50f5]">1000XM5</span></h2></div><button onClick={onOpenLocationModal} className="mt-6 flex w-full items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-left text-[11px] font-semibold text-slate-600"><MapPin className="h-3.5 w-3.5 text-[#6d50f5]" /> {currentLocation.name}<span className="ml-auto text-slate-400">18 stores</span></button><div className="mt-5 space-y-3"><div className="rounded-2xl border border-[#dcd7ff] bg-[#f9f8ff] p-3"><div className="flex justify-between"><div><div className="flex items-center gap-1 text-sm font-bold"><span>Croma</span><CheckCircle2 className="h-3.5 w-3.5 text-[#20a979]" /></div><p className="mt-1 text-[11px] text-slate-500">Avinashi Road · 450 m</p></div><span className="text-[11px] font-bold text-[#1d9f72]">In stock</span></div><div className="mt-3 flex items-center justify-between"><span className="font-bold text-slate-900">₹26,990</span><span className="rounded-full bg-[#20D99A]/15 px-2 py-1 text-[10px] font-bold text-[#168963]">Hold 30 min</span></div></div><div className="rounded-2xl border border-slate-100 p-3"><div className="flex justify-between text-sm font-bold"><span>Reliance Digital</span><span className="text-[#1d9f72]">2 available</span></div><p className="mt-1 text-[11px] text-slate-500">DB Road · 750 m · ₹26,990</p></div></div><div className="mt-5 rounded-xl bg-[#101421] px-3 py-2.5 text-center text-xs font-bold text-white">Verified shelf inventory</div></div></div>
          <div className="absolute bottom-8 left-0 rounded-2xl border border-white/80 bg-white/80 p-3 shadow-lg backdrop-blur"><p className="text-[10px] font-semibold text-slate-400">HOLD PASS</p><p className="mt-1 text-sm font-bold text-[#0e1321]">Reserved · <span className="tabular-nums text-[#1d9f72]">{mins}:{secs}</span></p></div>
        </motion.div>
      </div>
    </section>
    <ProductJourney /><TheIdea /><TheProblem />
    <LocalDiscovery currentLocation={currentLocation} onOpenLocationModal={onOpenLocationModal} onNavigateToVendor={onNavigateToVendor} />
    <RetailerCallout onOpenRetailerModal={onNavigateToVendor} onNavigateToVendor={onNavigateToVendor} />
    <WaitlistSection currentLocation={currentLocation} />
    <FinalCTA onOpenRetailerModal={onNavigateToVendor} onSearchClick={onLaunchCustomerApp} />
    <Footer onOpenRetailerModal={onNavigateToVendor} onOpenLocationModal={onOpenLocationModal} />
    <WaitlistPopupModal currentLocation={currentLocation} />
  </div>;
};

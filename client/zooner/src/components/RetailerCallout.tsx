import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ArrowRight, 
  CheckCircle2, 
  Store, 
  ChevronDown
} from 'lucide-react';
import { fetchCategories, searchProducts } from '../services/api';
import type { ProductSearchResult, CategoryDto } from '../types';

interface RetailerCalloutProps {
  onOpenRetailerModal: () => void;
  onNavigateToVendor: () => void;
}

export const RetailerCallout: React.FC<RetailerCalloutProps> = ({
  onOpenRetailerModal,
  onNavigateToVendor,
}) => {
  const [activeTab, setActiveTab] = useState<'radar' | 'inventory' | 'holds'>('radar');
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [catalogProducts, setCatalogProducts] = useState<ProductSearchResult[]>([]);
  const [catalogCategories, setCatalogCategories] = useState<CategoryDto[]>([]);

  useEffect(() => {
    let isMounted = true;
    Promise.all([fetchCategories(), searchProducts()])
      .then(([cats, prods]) => {
        if (!isMounted) return;
        if (cats) setCatalogCategories(cats);
        if (prods) setCatalogProducts(prods);
      })
      .catch((err) => {
        console.error('RetailerCallout live data fetch error:', err);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const faqs = [
    {
      q: 'Do I have to handle home delivery or courier logistics?',
      a: 'No! Zooner is designed specifically to drive high-intent shoppers directly through your physical storefront. Customers discover your in-stock shelf items online, check availability, and walk into your store to pay directly at your counter.'
    },
    {
      q: 'Does Zooner charge commission on my in-store walk-in sales?',
      a: 'Zero commission. You keep 100% of all in-store walk-in revenue. No hidden delivery fees, no percentage cuts, and no delayed settlement cycles.'
    },
    {
      q: 'How long does it take to list our store and inventory?',
      a: 'Under 10 minutes. You can register your store with your phone number, match canonical products from our global catalog, or toggle in-stock items with one tap on your mobile phone.'
    },
    {
      q: 'How does the Live Demand Radar alert system work?',
      a: 'When a shopper within your 2 km radius searches for an item or size you stock, you receive an instant alert on your phone. Simply tap "In Stock & Hold for 30 Mins" to secure the customer visit.'
    },
    {
      q: 'Can one person use Zooner as both a shopper and a store owner?',
      a: 'Yes! Zooner uses a single unified account. You can discover products from other stores as a customer and seamlessly switch to Merchant OS to manage your own store with 1 tap.'
    }
  ];

  return (
    <section id="retailers" className="relative py-24 sm:py-32 px-6 sm:px-8 bg-[#07080B] text-white border-t border-white/10">
      <div className="max-w-6xl mx-auto space-y-24 relative z-10 text-left">
        
        {/* ── PART 1: CORE EDITORIAL PROPOSITION ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-20 items-start">
          {/* Left: Editorial Heading */}
          <div className="lg:col-span-6 space-y-8">
            <motion.span 
              initial={{ opacity: 0, x: -10 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.6 }}
              className="text-xs font-mono uppercase tracking-widest text-emerald-400 font-bold block"
            >
              Merchant OS · For Store Owners
            </motion.span>

            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="space-y-4"
            >
              <h2 
                className="font-['Outfit'] font-black tracking-tight text-white leading-[0.98]"
                style={{ fontSize: 'clamp(2.4rem, 5vw, 3.8rem)' }}
              >
                Turn online searchers <br />
                into walk-in customers.
              </h2>

              <p className="text-slate-400 text-base sm:text-lg leading-relaxed pt-1">
                Shoppers within 2 km of your store are searching on their phones for items already sitting on your physical shelves. Zooner routes them directly to your checkout counter.
              </p>
            </motion.div>

            <ul className="space-y-4 text-sm sm:text-base text-slate-300">
              <li className="flex items-start gap-3">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-1" />
                <span><strong className="text-white font-semibold">Zero hardware or POS setup</strong> — manage everything from your phone</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-1" />
                <span><strong className="text-white font-semibold">Direct counter payment</strong> — customer pays directly at your physical register</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-1" />
                <span><strong className="text-white font-semibold">0% commission on walk-ins</strong> — keep 100% of your retail margin</span>
              </li>
            </ul>

            <motion.div 
              initial={{ opacity: 0, y: 15 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="pt-2 flex flex-wrap items-center gap-4"
            >
              <motion.button
                onClick={onOpenRetailerModal}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className="inline-flex items-center gap-2.5 px-8 py-4 rounded-full bg-white text-slate-950 font-bold text-sm hover:bg-slate-200 transition-all cursor-pointer shadow-lg shadow-white/5"
              >
                <Store className="h-4 w-4 text-slate-950" />
                <span>Register Your Store</span>
                <ArrowRight className="h-4 w-4" />
              </motion.button>

              <button
                onClick={onNavigateToVendor}
                className="inline-flex items-center gap-2 px-6 py-4 rounded-full border border-white/20 hover:border-white/40 text-slate-300 hover:text-white font-bold text-sm transition-all cursor-pointer"
              >
                <span>Open Merchant OS</span>
              </button>
            </motion.div>
          </div>

          {/* Right: Key Metrics */}
          <motion.div 
            initial={{ opacity: 0, y: 25 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="lg:col-span-6 space-y-8 border-t lg:border-t-0 lg:border-l border-white/10 pt-8 lg:pt-0 lg:pl-12"
          >
            <div>
              <div 
                className="font-['Outfit'] font-black text-white leading-none tracking-tight"
                style={{ fontSize: 'clamp(3.8rem, 8vw, 6.5rem)' }}
              >
                &lt; 2 km
              </div>
              <p className="text-slate-400 text-sm sm:text-base mt-3 leading-relaxed">
                Average distance between a local customer searching on their phone and the product already in your store.
              </p>
            </div>

            <div className="border-t border-white/10" />

            <div className="space-y-6">
              <div className="flex items-start gap-4">
                <span className="text-emerald-400 font-mono font-bold text-sm shrink-0">01</span>
                <div>
                  <h4 className="font-bold text-white text-sm sm:text-base">Real-Time Demand Radar</h4>
                  <p className="text-xs sm:text-sm text-slate-400 mt-1">Get notified whenever nearby shoppers broadcast live product searches in your category.</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <span className="text-emerald-400 font-mono font-bold text-sm shrink-0">02</span>
                <div>
                  <h4 className="font-bold text-white text-sm sm:text-base">30-Minute Counter Passes</h4>
                  <p className="text-xs sm:text-sm text-slate-400 mt-1">Customers hold items with verified pass codes, preventing no-shows and driving immediate footfall.</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <span className="text-emerald-400 font-mono font-bold text-sm shrink-0">03</span>
                <div>
                  <h4 className="font-bold text-white text-sm sm:text-base">Unified Account Capability</h4>
                  <p className="text-xs sm:text-sm text-slate-400 mt-1">Shop across local stores and manage your own store catalog with a single login identity.</p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* ── PART 2: INTERACTIVE LIVE MERCHANT DASHBOARD PREVIEW ── */}
        <div className="space-y-8 pt-6 border-t border-white/10">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <span className="text-xs font-mono uppercase tracking-widest text-slate-500 font-bold">
                Live Merchant Experience
              </span>
              <h3 className="text-2xl sm:text-3xl font-bold font-['Outfit'] text-white mt-1">
                Your store's local discovery cockpit.
              </h3>
            </div>

            {/* Interactive Preview Tabs */}
            <div className="flex items-center gap-2 p-1 rounded-full bg-white/5 border border-white/10 self-start sm:self-auto">
              <button
                onClick={() => setActiveTab('radar')}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === 'radar' 
                    ? 'bg-emerald-400 text-slate-950 font-bold shadow-md shadow-emerald-400/20' 
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Live Radar
              </button>
              <button
                onClick={() => setActiveTab('inventory')}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === 'inventory' 
                    ? 'bg-emerald-400 text-slate-950 font-bold shadow-md shadow-emerald-400/20' 
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Shelf Stock
              </button>
              <button
                onClick={() => setActiveTab('holds')}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === 'holds' 
                    ? 'bg-emerald-400 text-slate-950 font-bold shadow-md shadow-emerald-400/20' 
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Active Holds
              </button>
            </div>
          </div>

          {/* Interactive Live Preview Window */}
          <div className="rounded-3xl border border-white/10 bg-[#0B0C11] p-6 sm:p-8 shadow-2xl overflow-hidden">
            {activeTab === 'radar' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-white/10 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="font-mono uppercase font-bold text-slate-300">Live Inbound Shopper Demands (Radius: 2.5 km)</span>
                  </div>
                  <span className="text-slate-500 font-mono">Auto-refreshing</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  <div className="p-4 rounded-2xl bg-zinc-900/80 border border-white/10 space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-bold text-white text-sm">
                          {catalogProducts[0]?.name || (catalogCategories[0]?.name ? `${catalogCategories[0].name} Product` : 'Verified Catalog Item')}
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">Nearby Shopper Request · 850m away · Active broadcast</div>
                      </div>
                      <span className="px-2 py-0.5 rounded bg-emerald-950 border border-emerald-800 text-[10px] font-mono text-emerald-300 font-bold">
                        HIGH MATCH
                      </span>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-white/5">
                      <span className="text-xs font-mono text-slate-300">
                        Target Budget: ₹{(catalogProducts[0]?.lowestPrice || catalogProducts[0]?.minPrice || 2499).toLocaleString('en-IN')}
                      </span>
                      <button 
                        onClick={onOpenRetailerModal}
                        className="px-3.5 py-1.5 rounded-full bg-emerald-400 text-slate-950 font-bold text-xs hover:bg-emerald-300 cursor-pointer"
                      >
                        Confirm Stock
                      </button>
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-zinc-900/80 border border-white/10 space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-bold text-white text-sm">
                          {catalogProducts[1]?.name || (catalogCategories[1]?.name ? `${catalogCategories[1].name} Variant` : 'Local Search Demand')}
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">Nearby Shopper Request · 1.2 km away · Active broadcast</div>
                      </div>
                      <span className="px-2 py-0.5 rounded bg-cyan-950 border border-cyan-800 text-[10px] font-mono text-cyan-300 font-bold">
                        IN RADIUS
                      </span>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-white/5">
                      <span className="text-xs font-mono text-slate-300">
                        Target Budget: ₹{(catalogProducts[1]?.lowestPrice || catalogProducts[1]?.minPrice || 4999).toLocaleString('en-IN')}
                      </span>
                      <button 
                        onClick={onOpenRetailerModal}
                        className="px-3.5 py-1.5 rounded-full bg-emerald-400 text-slate-950 font-bold text-xs hover:bg-emerald-300 cursor-pointer"
                      >
                        Confirm Stock
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'inventory' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-white/10 text-xs">
                  <span className="font-mono uppercase font-bold text-slate-300">In-Store Counter Inventory</span>
                  <button 
                    onClick={onOpenRetailerModal}
                    className="text-xs text-emerald-400 font-bold hover:underline cursor-pointer"
                  >
                    + Add Product Variant
                  </button>
                </div>

                <div className="divide-y divide-white/10">
                  <div className="py-3 flex items-center justify-between gap-4">
                    <div>
                      <div className="font-bold text-white text-sm">
                        {catalogProducts[0]?.name || 'Standard Catalog Item'}
                      </div>
                      <div className="text-xs text-slate-400">
                        {catalogProducts[0]?.categoryName || 'General'} · Model: {catalogProducts[0]?.modelNumber || 'STD-01'} · ₹{(catalogProducts[0]?.lowestPrice || catalogProducts[0]?.minPrice || 2499).toLocaleString('en-IN')}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="px-2.5 py-1 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800 text-xs font-mono">
                        Available on Shelf
                      </span>
                      <span className="h-2 w-2 rounded-full bg-emerald-400" />
                    </div>
                  </div>

                  <div className="py-3 flex items-center justify-between gap-4">
                    <div>
                      <div className="font-bold text-white text-sm">
                        {catalogProducts[1]?.name || 'Verified Product Model'}
                      </div>
                      <div className="text-xs text-slate-400">
                        {catalogProducts[1]?.categoryName || 'General'} · Model: {catalogProducts[1]?.modelNumber || 'STD-02'} · ₹{(catalogProducts[1]?.lowestPrice || catalogProducts[1]?.minPrice || 4999).toLocaleString('en-IN')}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="px-2.5 py-1 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800 text-xs font-mono">
                        Available on Shelf
                      </span>
                      <span className="h-2 w-2 rounded-full bg-emerald-400" />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'holds' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-white/10 text-xs">
                  <span className="font-mono uppercase font-bold text-slate-300">Active 30-Minute Counter Holds</span>
                  <span className="text-emerald-400 font-mono font-bold">Counter Reservation Ready</span>
                </div>

                <div className="p-4 rounded-2xl bg-zinc-900/80 border border-emerald-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-emerald-400 font-black text-sm">
                        PASS #ZN-{(catalogProducts[0]?.id || '4821').replace(/-/g, '').slice(0, 4).toUpperCase()}
                      </span>
                      <span className="text-xs text-slate-400">· Verified Shopper Reservation</span>
                    </div>
                    <div className="text-sm font-bold text-white">
                      {catalogProducts[0]?.name || 'Reserved Product'} · ₹{(catalogProducts[0]?.lowestPrice || catalogProducts[0]?.minPrice || 2499).toLocaleString('en-IN')}
                    </div>
                    <div className="text-xs text-slate-400">Reserved via Zooner Discover · Counter Hold Pass Active</div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="text-[10px] font-mono text-slate-500 uppercase">Expires In</div>
                      <div className="text-sm font-mono font-bold text-amber-400">18:42</div>
                    </div>
                    <button 
                      onClick={onOpenRetailerModal}
                      className="px-4 py-2 rounded-xl bg-white text-slate-950 font-bold text-xs hover:bg-slate-200 cursor-pointer"
                    >
                      Complete Sale
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── PART 3: 3-STEP RETAILER ONBOARDING ── */}
        <div className="space-y-10 pt-6 border-t border-white/10">
          <div>
            <span className="text-xs font-mono uppercase tracking-widest text-slate-500 font-bold">
              Simple 3-Step Setup
            </span>
            <h3 className="text-2xl sm:text-3xl font-bold font-['Outfit'] text-white mt-1">
              Start welcoming walk-in buyers today.
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="p-6 rounded-2xl bg-[#0B0C11] border border-white/10 space-y-3">
              <div className="font-mono text-2xl font-black text-emerald-400">01</div>
              <h4 className="font-bold text-white text-base">Claim Your Store</h4>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                Enter your physical shop name, address, and category. Takes under 2 minutes with zero paperwork.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-[#0B0C11] border border-white/10 space-y-3">
              <div className="font-mono text-2xl font-black text-emerald-400">02</div>
              <h4 className="font-bold text-white text-base">Set Live Stock</h4>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                Add products from our global verified catalog or toggle items already on your shelves.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-[#0B0C11] border border-white/10 space-y-3">
              <div className="font-mono text-2xl font-black text-emerald-400">03</div>
              <h4 className="font-bold text-white text-base">Welcome Walk-in Shoppers</h4>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                Customers arrive with 30-minute hold pass codes. Collect 100% of payment directly at your counter.
              </p>
            </div>
          </div>
        </div>

        {/* ── PART 4: FREQUENTLY ASKED QUESTIONS (FAQ) ── */}
        <div className="space-y-8 pt-6 border-t border-white/10">
          <div>
            <span className="text-xs font-mono uppercase tracking-widest text-slate-500 font-bold">
              Merchant FAQ
            </span>
            <h3 className="text-2xl sm:text-3xl font-bold font-['Outfit'] text-white mt-1">
              Everything you need to know about Zooner.
            </h3>
          </div>

          <div className="divide-y divide-white/10 border-y border-white/10">
            {faqs.map((faq, index) => {
              const isOpen = openFaq === index;
              return (
                <div key={index} className="py-5">
                  <button
                    onClick={() => setOpenFaq(isOpen ? null : index)}
                    className="w-full flex items-center justify-between text-left gap-4 cursor-pointer group"
                  >
                    <span className="font-bold text-white text-sm sm:text-base group-hover:text-emerald-400 transition-colors">
                      {faq.q}
                    </span>
                    <ChevronDown className={`h-4 w-4 text-slate-400 shrink-0 transition-transform duration-300 ${isOpen ? 'rotate-180 text-emerald-400' : ''}`} />
                  </button>

                  <AnimatePresence>
                    {isOpen && (
                      <motion.p
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.25 }}
                        className="text-xs sm:text-sm text-slate-400 mt-3 leading-relaxed"
                      >
                        {faq.a}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </section>
  );
};

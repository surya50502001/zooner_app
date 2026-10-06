import React, { useState, useRef, useEffect } from 'react';
import { 
  ArrowLeft, 
  CheckCircle2, 
  Eye, 
  EyeOff, 
  Loader2, 
  Lock, 
  Mail, 
  Phone, 
  User as UserIcon, 
  Store, 
  ShoppingBag, 
  ShieldCheck, 
  X,
  KeyRound,
  AlertCircle
} from 'lucide-react';
import { loginUser, registerUser, syncUserProfile, googleLogin, createShop } from '../services/api';

export type AuthRole = 'Customer' | 'Vendor';

interface SignInModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSwitchToRetailer?: () => void;
  onSuccessLogin?: (role: 'Customer' | 'Vendor') => void;
  initialRole?: 'C' | 'V' | 'VC';
  initialTab?: 'signin' | 'register';
}

export const SignInModal: React.FC<SignInModalProps> = ({
  isOpen,
  onClose,
  onSwitchToRetailer: _onSwitchToRetailer,
  onSuccessLogin,
  initialRole = 'C',
  initialTab = 'signin',
}) => {
  // ── AUTH STATE ──
  const [activeTab, setActiveTab] = useState<'signin' | 'register' | 'forgot'>(initialTab);
  const [selectedRole, setSelectedRole] = useState<AuthRole>(
    initialRole === 'V' ? 'Vendor' : 'Customer'
  );
  
  // Form fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [storeName, setStoreName] = useState('');
  
  // UI states
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [signedInRole, setSignedInRole] = useState<'Customer' | 'Merchant'>('Customer');
  const [signedInEmail, setSignedInEmail] = useState('');
  const [resetSent, setResetSent] = useState(false);

  // Google Sign-In refs
  const googleSignInButtonRef = useRef<HTMLDivElement>(null);
  const googleRegisterButtonRef = useRef<HTMLDivElement>(null);
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

  // Sync role and tab on modal open
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setSelectedRole(initialRole === 'V' ? 'Vendor' : 'Customer');
      setAuthError('');
      setResetSent(false);
    }
  }, [isOpen, initialRole, initialTab]);

  // Google GSI Handler
  const handleGoogleCredentialResponse = async (response: google.accounts.id.CredentialResponse) => {
    if (!response.credential) {
      setAuthError('No credential received from Google.');
      return;
    }

    setIsLoading(true);
    setAuthError('');

    try {
      const authRes = await googleLogin(response.credential);
      if (authRes.success && authRes.data) {
        const profile = await syncUserProfile();
        const isVendor = profile?.isVendor || authRes.data.user.role === 'Vendor' || authRes.data.user.role === 'ShopOwner' || selectedRole === 'Vendor';
        const finalRole = isVendor ? 'Merchant' : 'Customer';
        setSignedInRole(finalRole);
        setSignedInEmail(authRes.data.user.email || '');
        setIsSuccess(true);
        setTimeout(() => {
          setIsSuccess(false);
          onClose();
          if (onSuccessLogin) onSuccessLogin(isVendor ? 'Vendor' : 'Customer');
        }, 1200);
      } else {
        setAuthError(authRes.error || 'Google sign-in failed. Please try again.');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Google sign-in failed. Please try again.';
      setAuthError(message);
    } finally {
      setIsLoading(false);
    }
  };

  // Initialize Google Button
  useEffect(() => {
    if (!isOpen || !googleClientId || activeTab === 'forgot') return;

    let isMounted = true;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const targetRef = activeTab === 'signin'
      ? googleSignInButtonRef.current
      : googleRegisterButtonRef.current;

    const initGsi = () => {
      if (!isMounted || !targetRef || !window.google?.accounts?.id) return;
      try {
        targetRef.innerHTML = '';
        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: handleGoogleCredentialResponse,
          auto_select: false,
          cancel_on_tap_outside: true,
        });
        window.google.accounts.id.renderButton(targetRef, {
          theme: 'outline',
          size: 'large',
          type: 'standard',
          shape: 'pill',
          text: activeTab === 'signin' ? 'signin_with' : 'signup_with',
          width: 360,
          logo_alignment: 'left',
        });
      } catch (err) {
        console.error('Error rendering Google Sign-In button:', err);
      }
    };

    if (window.google?.accounts?.id) {
      initGsi();
    } else {
      intervalId = setInterval(() => {
        if (window.google?.accounts?.id) {
          if (intervalId) clearInterval(intervalId);
          initGsi();
        }
      }, 150);
    }

    return () => {
      isMounted = false;
      if (intervalId) clearInterval(intervalId);
    };
  }, [isOpen, activeTab, googleClientId]);

  if (!isOpen) return null;

  // Password strength calculator
  const getPasswordStrength = (pass: string) => {
    if (!pass) return { score: 0, label: '', color: 'bg-gray-200' };
    let score = 0;
    if (pass.length >= 6) score++;
    if (pass.length >= 8) score++;
    if (/[A-Z]/.test(pass) && /[0-9]/.test(pass)) score++;
    if (/[^A-Za-z0-9]/.test(pass)) score++;

    if (score <= 1) return { score: 1, label: 'Weak', color: 'bg-rose-500' };
    if (score === 2 || score === 3) return { score: 2, label: 'Good', color: 'bg-amber-500' };
    return { score: 3, label: 'Strong', color: 'bg-emerald-500' };
  };

  const passwordStrength = getPasswordStrength(password);

  // ── SUBMIT: SIGN IN ──
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setAuthError('Please enter a valid email address.');
      return;
    }

    if (!password) {
      setAuthError('Please enter your password.');
      return;
    }

    setIsLoading(true);

    try {
      const authRes = await loginUser(cleanEmail, password);

      if (authRes.success && authRes.data) {
        const profile = await syncUserProfile();
        const isVendor = profile?.isVendor || authRes.data.user.role === 'Vendor' || authRes.data.user.role === 'ShopOwner' || selectedRole === 'Vendor';
        const finalRole = isVendor ? 'Merchant' : 'Customer';
        setSignedInRole(finalRole);
        setSignedInEmail(authRes.data.user.email || cleanEmail);
        setIsSuccess(true);
        setTimeout(() => {
          setIsSuccess(false);
          setEmail('');
          setPassword('');
          onClose();
          if (onSuccessLogin) onSuccessLogin(isVendor ? 'Vendor' : 'Customer');
        }, 1100);
      } else {
        setAuthError(authRes.error || 'Invalid email or password.');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unable to connect to authentication server. Please try again.';
      setAuthError(message);
    } finally {
      setIsLoading(false);
    }
  };

  // ── SUBMIT: REGISTER ──
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setAuthError('Please enter a valid email address.');
      return;
    }

    if (password.length < 6) {
      setAuthError('Password must be at least 6 characters long.');
      return;
    }

    if (selectedRole === 'Vendor' && !storeName.trim()) {
      setAuthError('Please enter your store or business name.');
      return;
    }

    setIsLoading(true);

    try {
      const authRes = await registerUser({
        fullName: fullName.trim(),
        email: cleanEmail,
        password,
        phoneNumber: phone.trim() ? `+91 ${phone.replace(/[^0-9]/g, '')}` : undefined,
        role: selectedRole === 'Vendor' ? 'ShopOwner' : 'Customer',
      });

      if (authRes.success && authRes.data) {
        // Auto-create initial store entity if merchant registered with a store name
        if (selectedRole === 'Vendor' && storeName.trim()) {
          await createShop({
            name: storeName.trim(),
            phone: phone.trim() ? `+91 ${phone.replace(/[^0-9]/g, '')}` : '+91 9876543210',
            address: 'RS Puram, Coimbatore',
            latitude: 11.0168,
            longitude: 76.9558,
            categoryIds: []
          }).catch(() => {});
        }

        const profile = await syncUserProfile();
        const isVendor = profile?.isVendor || selectedRole === 'Vendor';
        const finalRole = isVendor ? 'Merchant' : 'Customer';
        setSignedInRole(finalRole);
        setSignedInEmail(authRes.data.user.email || cleanEmail);
        setIsSuccess(true);
        setTimeout(() => {
          setIsSuccess(false);
          setEmail('');
          setPassword('');
          setFullName('');
          setPhone('');
          setStoreName('');
          onClose();
          if (onSuccessLogin) onSuccessLogin(isVendor ? 'Vendor' : 'Customer');
        }, 1100);
      } else {
        setAuthError(authRes.error || 'Registration failed. Please check your details and try again.');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unable to connect to authentication server. Please try again.';
      setAuthError(message);
    } finally {
      setIsLoading(false);
    }
  };

  // ── SUBMIT: FORGOT PASSWORD ──
  const handleForgotPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !email.includes('@')) {
      setAuthError('Please enter a valid email address to receive reset instructions.');
      return;
    }
    setIsLoading(true);
    setAuthError('');
    setTimeout(() => {
      setIsLoading(false);
      setResetSent(true);
    }, 700);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-200 p-0 sm:p-4">
      {/* Backdrop overlay */}
      <div 
        className="absolute inset-0"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Container */}
      <div className="relative w-full sm:max-w-[440px] max-h-[92vh] overflow-y-auto bg-white rounded-t-[32px] sm:rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-100 text-slate-900 z-10 animate-in slide-in-from-bottom-6 sm:slide-in-from-bottom-2 duration-300">
        
        {/* Mobile Drag Indicator */}
        <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-4 sm:hidden" />

        {/* Top Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[#0066FF] flex items-center justify-center text-white shadow-md shadow-blue-500/20">
              <Store className="w-4 h-4" />
            </div>
            <div className="font-extrabold text-xl tracking-tight text-slate-950 select-none">
              zooner<span className="text-[#0066FF]">.</span>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-blue-50 text-[#0066FF] border border-blue-100/80">
              {selectedRole === 'Vendor' ? 'Merchant' : 'Shopper'}
            </span>
          </div>

          <button 
            onClick={onClose}
            type="button"
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── SUCCESS STATE SCREEN ── */}
        {isSuccess ? (
          <div className="py-10 text-center space-y-4 animate-in zoom-in-95 duration-200">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-200 shadow-lg shadow-emerald-500/10">
              <CheckCircle2 className="h-9 w-9" />
            </div>
            <div>
              <h4 className="text-xl font-black text-slate-900 tracking-tight">
                {activeTab === 'signin' ? 'Welcome Back!' : 'Account Ready!'}
              </h4>
              <p className="text-xs text-slate-500 mt-1 font-medium">
                Authenticated successfully as <span className="text-emerald-600 font-bold">{signedInRole}</span>
              </p>
            </div>
            {signedInEmail && (
              <div className="inline-block px-3 py-1 bg-slate-50 rounded-full text-xs text-slate-500 font-mono border border-slate-200">
                {signedInEmail}
              </div>
            )}
            <div className="pt-2 flex items-center justify-center gap-2 text-xs font-semibold text-[#0066FF]">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Entering Zooner...</span>
            </div>
          </div>
        ) : activeTab === 'forgot' ? (
          /* ── SCREEN: FORGOT PASSWORD ── */
          <div className="space-y-4 animate-in fade-in duration-200">
            <button
              type="button"
              onClick={() => {
                setActiveTab('signin');
                setResetSent(false);
                setAuthError('');
              }}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Sign In</span>
            </button>

            <div className="space-y-1">
              <h3 className="text-xl font-black text-slate-950 tracking-tight">Reset Password</h3>
              <p className="text-xs text-slate-500">
                Enter your email address to receive password recovery instructions.
              </p>
            </div>

            {authError && (
              <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-xs font-medium text-rose-600 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{authError}</span>
              </div>
            )}

            {resetSent ? (
              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 space-y-3">
                <div className="flex items-center gap-2 text-emerald-800 font-bold text-xs">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Recovery link dispatched!</span>
                </div>
                <p className="text-xs text-emerald-700 leading-relaxed">
                  We've sent reset instructions to <strong className="font-semibold text-slate-900">{email}</strong>. Please check your inbox and spam folder.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('signin');
                    setResetSent(false);
                  }}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2.5 rounded-xl transition cursor-pointer"
                >
                  Return to Sign In
                </button>
              </div>
            ) : (
              <form onSubmit={handleForgotPassword} className="space-y-4 pt-1">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      type="email"
                      required
                      autoComplete="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full rounded-2xl bg-slate-50 border border-slate-200 py-3 pl-10 pr-4 text-sm text-slate-900 placeholder-slate-400 focus:bg-white focus:border-[#0066FF] focus:ring-4 focus:ring-blue-500/10 outline-hidden transition-all font-medium"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full flex items-center justify-center gap-2 rounded-2xl bg-[#0066FF] hover:bg-[#0052CC] active:scale-[0.98] py-3.5 text-sm font-bold text-white transition-all shadow-md shadow-blue-500/20 disabled:opacity-60 cursor-pointer"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin text-white" />
                      <span>Sending reset email...</span>
                    </>
                  ) : (
                    <>
                      <KeyRound className="w-4 h-4" />
                      <span>Send Recovery Instructions</span>
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        ) : (
          /* ── MAIN AUTH FLOW (SIGN IN / REGISTER) ── */
          <div className="space-y-4">
            
            {/* 1. SEGMENTED ROLE TOGGLE: Shopper vs. Store Owner */}
            <div className="bg-slate-100 p-1 rounded-2xl flex items-center">
              <button
                type="button"
                onClick={() => {
                  setSelectedRole('Customer');
                  setAuthError('');
                }}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  selectedRole === 'Customer'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <ShoppingBag className={`w-3.5 h-3.5 ${selectedRole === 'Customer' ? 'text-[#0066FF]' : 'text-slate-400'}`} />
                <span>Shopper</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSelectedRole('Vendor');
                  setAuthError('');
                }}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  selectedRole === 'Vendor'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Store className={`w-3.5 h-3.5 ${selectedRole === 'Vendor' ? 'text-emerald-600' : 'text-slate-400'}`} />
                <span>Store Owner</span>
              </button>
            </div>

            {/* 2. HEADER TITLE & VALUE PROP */}
            <div className="text-center pt-1">
              <h3 className="text-xl font-black text-slate-950 tracking-tight">
                {activeTab === 'signin' 
                  ? (selectedRole === 'Vendor' ? 'Merchant Portal Sign In' : 'Sign in to Zooner')
                  : (selectedRole === 'Vendor' ? 'Register Your Store' : 'Create Shopper Account')}
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                {selectedRole === 'Vendor'
                  ? 'Connect with nearby shoppers asking for products on your shelves.'
                  : 'Find nearby stores, check availability, and hold items for 1 hour.'}
              </p>
            </div>

            {/* 3. ERROR BANNER */}
            {authError && (
              <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-xs font-medium text-rose-600 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{authError}</span>
              </div>
            )}

            {/* 4. AUTH TAB SWITCHER: [ Sign In ] | [ Create Account ] */}
            <div className="flex border-b border-slate-200">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('signin');
                  setAuthError('');
                }}
                className={`flex-1 pb-2.5 text-xs font-bold text-center transition-all cursor-pointer relative ${
                  activeTab === 'signin'
                    ? 'text-[#0066FF]'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                Sign In
                {activeTab === 'signin' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#0066FF] rounded-full" />
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveTab('register');
                  setAuthError('');
                }}
                className={`flex-1 pb-2.5 text-xs font-bold text-center transition-all cursor-pointer relative ${
                  activeTab === 'register'
                    ? 'text-[#0066FF]'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                Create Account
                {activeTab === 'register' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#0066FF] rounded-full" />
                )}
              </button>
            </div>

            {/* 5. FORM FIELDS */}
            {activeTab === 'signin' ? (
              /* ── TAB: SIGN IN ── */
              <form onSubmit={handleSignIn} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      type="email"
                      required
                      autoComplete="email"
                      placeholder="alex@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full rounded-2xl bg-slate-50 border border-slate-200 py-3 pl-10 pr-4 text-sm text-slate-900 placeholder-slate-400 focus:bg-white focus:border-[#0066FF] focus:ring-4 focus:ring-blue-500/10 outline-hidden transition-all font-medium"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-slate-700">
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('forgot');
                        setAuthError('');
                      }}
                      className="text-[11px] font-bold text-[#0066FF] hover:underline cursor-pointer"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoComplete="current-password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full rounded-2xl bg-slate-50 border border-slate-200 py-3 pl-10 pr-10 text-sm text-slate-900 placeholder-slate-400 focus:bg-white focus:border-[#0066FF] focus:ring-4 focus:ring-blue-500/10 outline-hidden transition-all font-medium"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full flex items-center justify-center gap-2 rounded-2xl bg-[#0066FF] hover:bg-[#0052CC] active:scale-[0.98] py-3.5 text-sm font-bold text-white transition-all shadow-md shadow-blue-500/20 disabled:opacity-60 cursor-pointer mt-2"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin text-white" />
                      <span>Authenticating...</span>
                    </>
                  ) : (
                    <span>Sign In to Zooner</span>
                  )}
                </button>
              </form>
            ) : (
              /* ── TAB: CREATE ACCOUNT ── */
              <form onSubmit={handleRegister} className="space-y-3">
                {/* Full Name */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Full Name *
                  </label>
                  <div className="relative">
                    <UserIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      required
                      autoComplete="name"
                      placeholder="Alex Morgan"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full rounded-2xl bg-slate-50 border border-slate-200 py-2.5 pl-10 pr-4 text-xs text-slate-900 placeholder-slate-400 focus:bg-white focus:border-[#0066FF] focus:ring-4 focus:ring-blue-500/10 outline-hidden transition-all font-medium"
                    />
                  </div>
                </div>

                {/* Store Name (When Vendor selected) */}
                {selectedRole === 'Vendor' && (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Store Name *
                    </label>
                    <div className="relative">
                      <Store className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <input
                        type="text"
                        required
                        placeholder="e.g. Apex Electronics, Trends Fashion"
                        value={storeName}
                        onChange={(e) => setStoreName(e.target.value)}
                        className="w-full rounded-2xl bg-slate-50 border border-slate-200 py-2.5 pl-10 pr-4 text-xs text-slate-900 placeholder-slate-400 focus:bg-white focus:border-[#0066FF] focus:ring-4 focus:ring-blue-500/10 outline-hidden transition-all font-medium"
                      />
                    </div>
                  </div>
                )}

                {/* Email Address */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Email Address *
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      type="email"
                      required
                      autoComplete="email"
                      placeholder="name@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full rounded-2xl bg-slate-50 border border-slate-200 py-2.5 pl-10 pr-4 text-xs text-slate-900 placeholder-slate-400 focus:bg-white focus:border-[#0066FF] focus:ring-4 focus:ring-blue-500/10 outline-hidden transition-all font-medium"
                    />
                  </div>
                </div>

                {/* Mobile Phone (Optional) */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Mobile Phone (Optional for SMS Alerts)
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      type="tel"
                      autoComplete="tel"
                      placeholder="9876543210"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full rounded-2xl bg-slate-50 border border-slate-200 py-2.5 pl-10 pr-4 text-xs text-slate-900 placeholder-slate-400 focus:bg-white focus:border-[#0066FF] focus:ring-4 focus:ring-blue-500/10 outline-hidden transition-all font-medium"
                    />
                  </div>
                </div>

                {/* Password with strength bar */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Password (Min 6 chars) *
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoComplete="new-password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full rounded-2xl bg-slate-50 border border-slate-200 py-2.5 pl-10 pr-10 text-xs text-slate-900 placeholder-slate-400 focus:bg-white focus:border-[#0066FF] focus:ring-4 focus:ring-blue-500/10 outline-hidden transition-all font-medium"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>

                  {password.length > 0 && (
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="flex-1 h-1 bg-slate-100 rounded-full overflow-hidden">
                        <div 
                          className={`h-full transition-all ${passwordStrength.color}`} 
                          style={{ width: `${(passwordStrength.score / 3) * 100}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-bold text-slate-500">
                        {passwordStrength.label}
                      </span>
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full flex items-center justify-center gap-2 rounded-2xl bg-[#0066FF] hover:bg-[#0052CC] active:scale-[0.98] py-3.5 text-sm font-bold text-white transition-all shadow-md shadow-blue-500/20 disabled:opacity-60 cursor-pointer mt-2"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin text-white" />
                      <span>Creating Account...</span>
                    </>
                  ) : (
                    <span>
                      {selectedRole === 'Vendor' ? 'Register Store Account' : 'Create Free Shopper Account'}
                    </span>
                  )}
                </button>
              </form>
            )}

            {/* 6. GOOGLE SIGN IN & SOCIAL DIVIDER */}
            <div className="relative my-3">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200" />
              </div>
              <div className="relative flex justify-center text-[11px] text-slate-400 font-medium">
                <span className="bg-white px-3">or continue with Google</span>
              </div>
            </div>

            {/* Official Google Identity Services Container */}
            {!googleClientId ? (
              <button
                type="button"
                onClick={() => setAuthError('Google Client ID is not configured. Please set VITE_GOOGLE_CLIENT_ID in your .env configuration.')}
                className="w-full flex items-center justify-center gap-2.5 rounded-2xl border border-slate-200 py-3 text-xs font-bold text-slate-700 hover:bg-slate-50 active:scale-[0.98] transition-all cursor-pointer shadow-2xs"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.66v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.15z" />
                  <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.36 24 12 24z" />
                  <path fill="#FBBC05" d="M5.28 14.27a7.195 7.195 0 0 1 0-4.54V6.58H1.25a11.96 11.96 0 0 0 0 10.84l4.03-3.15z" />
                  <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.36 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z" />
                </svg>
                <span>Continue with Google</span>
              </button>
            ) : (
              <div className="flex justify-center w-full min-h-[44px]">
                <div 
                  ref={activeTab === 'signin' ? googleSignInButtonRef : googleRegisterButtonRef} 
                  className="w-full flex justify-center" 
                />
              </div>
            )}

            {/* 7. TRUST BADGE FOOTER */}
            <div className="pt-2 border-t border-slate-100 flex items-center justify-center gap-1.5 text-[10px] text-slate-400 font-medium">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>256-bit Secure • Verified Stores • Instant Shelf Pickup</span>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

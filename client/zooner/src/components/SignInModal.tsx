import React, { useState, useRef, useEffect } from 'react';
import { ArrowLeft, CheckCircle2, Eye, EyeOff, Loader2, Lock, Mail, Phone, User as UserIcon } from 'lucide-react';
import { loginUser, registerUser, syncUserProfile, googleLogin } from '../services/api';

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
  onSwitchToRetailer,
  onSuccessLogin,
  initialRole,
  initialTab = 'signin',
}) => {
  const [activeTab, setActiveTab] = useState<'signin' | 'register'>(initialTab);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [signedInRole, setSignedInRole] = useState<'Customer' | 'Merchant'>('Customer');
  const [signedInEmail, setSignedInEmail] = useState('');

  const googleSignInButtonRef = useRef<HTMLDivElement>(null);
  const googleRegisterButtonRef = useRef<HTMLDivElement>(null);
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

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
        const isVendor = profile?.isVendor || authRes.data.user.role === 'Vendor' || authRes.data.user.role === 'ShopOwner';
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

  useEffect(() => {
    if (!isOpen || !googleClientId) return;

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
          shape: 'rectangular',
          text: activeTab === 'signin' ? 'signin_with' : 'signup_with',
          width: 350,
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

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setAuthError('Please enter a valid email address.');
      return;
    }

    setIsLoading(true);

    try {
      const authRes = await loginUser(cleanEmail, password);

      if (authRes.success && authRes.data) {
        const profile = await syncUserProfile();
        const isVendor = profile?.isVendor || authRes.data.user.role === 'Vendor' || authRes.data.user.role === 'ShopOwner';
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
        }, 1200);
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

    setIsLoading(true);

    try {
      const authRes = await registerUser({
        fullName: fullName.trim(),
        email: cleanEmail,
        password,
        phoneNumber: phone.trim() ? `+91 ${phone.replace(/[^0-9]/g, '')}` : undefined,
        role: initialRole === 'V' ? 'ShopOwner' : 'Customer',
      });

      if (authRes.success && authRes.data) {
        const profile = await syncUserProfile();
        const isVendor = profile?.isVendor || initialRole === 'V';
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
          onClose();
          if (onSuccessLogin) onSuccessLogin(isVendor ? 'Vendor' : 'Customer');
        }, 1200);
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="absolute inset-0"
        onClick={onClose}
      />

      <div className="relative w-full max-w-[400px] bg-white rounded-3xl p-6 sm:p-7 shadow-2xl border border-gray-100 text-gray-900 z-10">
        {/* Top Header Bar */}
        <div className="relative flex items-center justify-center mb-5">
          <button 
            onClick={onClose}
            type="button"
            className="absolute left-0 p-2 -ml-2 rounded-full text-gray-700 hover:text-gray-900 hover:bg-gray-100 transition-colors cursor-pointer"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="font-bold text-2xl tracking-tight text-gray-950 select-none">
            zooner<span className="text-[#7C5CFF]">.</span>
          </div>
        </div>

        {isSuccess ? (
          <div className="py-8 text-center space-y-3">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-[#20D99A] border border-emerald-200">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <h4 className="text-xl font-bold text-gray-900 font-['Inter']">
              {activeTab === 'signin' ? 'Welcome back!' : 'Account created successfully!'}
            </h4>
            <p className="text-xs text-gray-500 font-medium">
              Signed in as <span className="text-[#20D99A] font-bold">{signedInRole}</span>
            </p>
            {signedInEmail && (
              <p className="text-xs text-gray-400 font-mono">
                {signedInEmail}
              </p>
            )}
          </div>
        ) : activeTab === 'signin' ? (
          /* ── Screen: Customer Sign In ── */
          <div>
            <div className="text-center mb-5">
              <h3 className="text-xl font-bold text-gray-950 tracking-tight">Sign in to Zooner</h3>
              <p className="text-xs text-gray-500 mt-1">Reserve products and pick up in store today.</p>
            </div>

            {authError && (
              <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-medium text-red-600">
                {authError}
              </div>
            )}

            <form onSubmit={handleSignIn} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  Email address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="email"
                    required
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-xl bg-white border border-gray-200 py-2.5 pl-10 pr-4 text-sm text-gray-900 placeholder-gray-400 focus:border-[#7C5CFF] focus:ring-1 focus:ring-[#7C5CFF] outline-hidden transition-all shadow-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-xl bg-white border border-gray-200 py-2.5 pl-10 pr-10 text-sm text-gray-900 placeholder-gray-400 focus:border-[#7C5CFF] focus:ring-1 focus:ring-[#7C5CFF] outline-hidden transition-all shadow-xs"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <div className="flex justify-end mt-1.5">
                  <button
                    type="button"
                    onClick={() => alert('Password reset instructions will be sent to your email.')}
                    className="text-xs font-medium text-[#7C5CFF] hover:underline cursor-pointer"
                  >
                    Forgot password?
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#7C5CFF] hover:bg-[#6842FF] py-3 text-sm font-semibold text-white transition-all shadow-sm disabled:opacity-60 cursor-pointer mt-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-white" />
                    <span>Signing in...</span>
                  </>
                ) : (
                  <span>Sign In</span>
                )}
              </button>

              <div className="relative my-3">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200" />
                </div>
                <div className="relative flex justify-center text-xs text-gray-400">
                  <span className="bg-white px-2">or</span>
                </div>
              </div>

              {/* Official Google Identity Services Sign-In Button */}
              {!googleClientId ? (
                <button
                  type="button"
                  onClick={() => setAuthError('Google Client ID is not configured. Please set VITE_GOOGLE_CLIENT_ID in your client environment (.env).')}
                  className="w-full flex items-center justify-center gap-2.5 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all cursor-pointer shadow-xs"
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
                  <div ref={googleSignInButtonRef} className="w-full flex justify-center" />
                </div>
              )}

              <p className="text-center text-xs text-gray-500 pt-2">
                Don't have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('register');
                    setAuthError('');
                  }}
                  className="font-semibold text-[#7C5CFF] hover:underline cursor-pointer"
                >
                  Create one
                </button>
              </p>

              {onSwitchToRetailer && (
                <p className="text-center text-[11px] text-gray-400 pt-1 font-medium">
                  Own a physical store?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onSwitchToRetailer();
                    }}
                    className="text-[#7C5CFF] font-semibold hover:underline cursor-pointer"
                  >
                    Register your store →
                  </button>
                </p>
              )}
            </form>
          </div>
        ) : (
          /* ── Screen: Create Account ── */
          <div>
            <div className="text-center mb-4">
              <h3 className="text-xl font-bold text-gray-950 tracking-tight">Create your account</h3>
              <p className="text-xs text-gray-500 mt-1">Reserve products and discover local stores.</p>
            </div>

            <form onSubmit={handleRegister} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Full name
                </label>
                <div className="relative">
                  <UserIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    required
                    placeholder="Alex Morgan"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full rounded-xl bg-white border border-gray-200 py-2.5 pl-10 pr-4 text-sm text-gray-900 placeholder-gray-400 focus:border-[#7C5CFF] focus:ring-1 focus:ring-[#7C5CFF] outline-hidden transition-all shadow-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Email address
                </label>
                <div className="relative">
                  <Mail className={`absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 ${authError ? 'text-red-400' : 'text-gray-400'}`} />
                  <input
                    type="email"
                    required
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (authError) setAuthError('');
                    }}
                    className={`w-full rounded-xl bg-white border py-2.5 pl-10 pr-4 text-sm text-gray-900 placeholder-gray-400 outline-hidden transition-all shadow-xs ${
                      authError ? 'border-red-400 focus:border-red-500 focus:ring-1 focus:ring-red-400 bg-red-50/10' : 'border-gray-200 focus:border-[#7C5CFF] focus:ring-1 focus:ring-[#7C5CFF]'
                    }`}
                  />
                </div>
                {authError && (
                  <p className="text-[11px] font-medium text-red-500 mt-1 pl-1">
                    {authError}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Mobile number (optional)
                </label>
                <div className="relative">
                  <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="tel"
                    placeholder="9876543210"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full rounded-xl bg-white border border-gray-200 py-2.5 pl-10 pr-4 text-sm text-gray-900 placeholder-gray-400 focus:border-[#7C5CFF] focus:ring-1 focus:ring-[#7C5CFF] outline-hidden transition-all shadow-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-xl bg-white border border-gray-200 py-2.5 pl-10 pr-10 text-sm text-gray-900 placeholder-gray-400 focus:border-[#7C5CFF] focus:ring-1 focus:ring-[#7C5CFF] outline-hidden transition-all shadow-xs"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#7C5CFF] hover:bg-[#6842FF] py-3 text-sm font-semibold text-white transition-all shadow-sm disabled:opacity-60 cursor-pointer mt-1"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-white" />
                    <span>Creating Account...</span>
                  </>
                ) : (
                  <span>Create Account</span>
                )}
              </button>

              <div className="relative my-2.5">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200" />
                </div>
                <div className="relative flex justify-center text-xs text-gray-400">
                  <span className="bg-white px-2">or</span>
                </div>
              </div>

              {/* Official Google Identity Services Sign-Up Button */}
              {!googleClientId ? (
                <button
                  type="button"
                  onClick={() => setAuthError('Google Client ID is not configured. Please set VITE_GOOGLE_CLIENT_ID in your client environment (.env).')}
                  className="w-full flex items-center justify-center gap-2.5 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all cursor-pointer shadow-xs"
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
                  <div ref={googleRegisterButtonRef} className="w-full flex justify-center" />
                </div>
              )}

              <p className="text-center text-xs text-gray-500 pt-1.5">
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('signin');
                    setAuthError('');
                  }}
                  className="font-semibold text-[#7C5CFF] hover:underline cursor-pointer"
                >
                  Sign In
                </button>
              </p>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};

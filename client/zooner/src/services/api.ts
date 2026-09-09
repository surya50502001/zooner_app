import { Capacitor } from '@capacitor/core';
import type {
  CategoryDto,
  StoreInventoryItem,
  ProductSearchResult,
  LiveRequestSummary,
  AuthResponse,
  UserDto,
  InventoryHoldDto
} from '../types';

const isNative = Capacitor.isNativePlatform();
const isProd = import.meta.env.PROD;
let API_BASE_URL = import.meta.env.VITE_API_URL || (
  isProd ? (isNative ? 'https://zooner-app.onrender.com/api' : '/api') : (isNative ? 'http://10.0.2.2:5000/api' : 'http://localhost:5000/api')
);
if (import.meta.env.VITE_API_URL && !import.meta.env.VITE_API_URL.endsWith('/api')) {
  // If the user provided the backend domain but forgot /api, append it automatically
  API_BASE_URL = `${import.meta.env.VITE_API_URL.replace(/\/$/, '')}/api`;
}

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
  errors?: string[];
}

let isRefreshing = false;
let refreshPromise: Promise<string | null> | null = null;

export async function refreshAccessToken(): Promise<string | null> {
  const isNative = Capacitor.isNativePlatform();
  const refreshToken = isNative ? localStorage.getItem('zooner_refresh_token') : null;
  const currentToken = localStorage.getItem('zooner_token');

  // In browser, if we don't have an active or recent token session, avoid redundant refresh attempts
  if (!isNative && !currentToken) {
    return null;
  }
  if (isNative && !refreshToken) {
    return null;
  }

  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }

  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (isNative) {
        headers['X-Client-Platform'] = 'native';
      }

      const res = await fetch(`${API_BASE_URL}/Auth/refresh-token`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify(refreshToken ? { refreshToken } : {})
      });

      if (!res.ok) {
        logoutUser();
        return null;
      }

      const body: ApiResponse<AuthResponse> = await res.json();
      if (body.success && body.data) {
        localStorage.setItem('zooner_token', body.data.accessToken);
        if (isNative && body.data.refreshToken) {
          localStorage.setItem('zooner_refresh_token', body.data.refreshToken);
        } else {
          // Never store refresh token in browser localStorage; rely strictly on HttpOnly cookie
          localStorage.removeItem('zooner_refresh_token');
        }
        return body.data.accessToken;
      }

      logoutUser();
      return null;
    } catch {
      logoutUser();
      return null;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function authenticatedFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = localStorage.getItem('zooner_token');
  const headers = new Headers(options.headers || {});
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (Capacitor.isNativePlatform() && !headers.has('X-Client-Platform')) {
    headers.set('X-Client-Platform', 'native');
  }

  const fetchOptions: RequestInit = {
    ...options,
    headers,
    credentials: options.credentials || 'include'
  };

  let res = await fetch(url, fetchOptions);

  if (res.status === 401) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers.set('Authorization', `Bearer ${newToken}`);
      res = await fetch(url, { ...fetchOptions, headers });
    }
  }

  return res;
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('zooner_token');
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  if (Capacitor.isNativePlatform()) {
    headers['X-Client-Platform'] = 'native';
  }
  return headers;
}

async function parseApiResponse<T>(res: Response, defaultErrorMessage: string): Promise<ApiResponse<T>> {
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      const json = await res.json();
      if (json && typeof json === 'object') {
        if ('success' in json && typeof (json as any).success === 'boolean') {
          return json as ApiResponse<T>;
        }
        if ((json as any).errors && typeof (json as any).errors === 'object') {
          const errList: string[] = [];
          const errObj = (json as any).errors;
          for (const key of Object.keys(errObj)) {
            const val = errObj[key];
            if (Array.isArray(val)) errList.push(...val);
            else if (typeof val === 'string') errList.push(val);
          }
          return {
            success: false,
            message: errList.join('. ') || (json as any).title || defaultErrorMessage,
            data: null as any,
            errors: errList
          };
        }
        if ((json as any).title || (json as any).detail) {
          return {
            success: false,
            message: (json as any).detail || (json as any).title || defaultErrorMessage,
            data: null as any
          };
        }
        return {
          success: res.ok,
          message: res.ok ? 'Success' : defaultErrorMessage,
          data: json as T
        };
      }
    } catch {
      // JSON parse error, fall through to text handler
    }
  }

  // Handle non-JSON responses (HTML error pages, Vercel SPA fallbacks, 502/503/504 gateway errors)
  const rawText = await res.text().catch(() => '');
  const isHtml = rawText.includes('<!doctype html') || rawText.includes('<html') || contentType.includes('text/html');

  if (isHtml) {
    if (res.status === 502 || res.status === 503 || res.status === 504) {
      return {
        success: false,
        message: `Backend service is temporarily unavailable (HTTP ${res.status}). The server may be waking up, please retry in a few seconds.`,
        data: null as any
      };
    }
    if (res.status === 404 || res.ok) {
      return {
        success: false,
        message: 'Backend API endpoint not found (HTTP 404). Please ensure the backend service has deployed the latest endpoints.',
        data: null as any
      };
    }
    return {
      success: false,
      message: `Server returned HTTP ${res.status}. Please try again shortly.`,
      data: null as any
    };
  }

  const statusLabel = res.status ? `HTTP ${res.status}${res.statusText ? ` (${res.statusText})` : ''}` : '';
  return {
    success: false,
    message: rawText.trim() || (statusLabel ? `Server returned ${statusLabel}.` : defaultErrorMessage),
    data: null as any
  };
}

async function responseData<T>(response: Response): Promise<T | null> {
  if (!response.ok) return null;
  const body = await parseApiResponse<T>(response, 'Failed to process server response');
  return body.data ?? null;
}

// ── AUTHENTICATION API METHODS ──

export async function syncUserProfile(): Promise<{
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  isVendor: boolean;
  shops: ShopProfileDto[];
  loggedInAt: number;
} | null> {
  try {
    const token = localStorage.getItem('zooner_token');
    if (!token) return null;
    const user = await getCurrentUser();
    const myShops = await getMyShops();
    const isVendor = (myShops && myShops.length > 0) || (user && (user.role === 'ShopOwner' || user.role === 'Admin' || user.role === 'VC' || user.role === 'Both'));
    if (user) {
      const profile = {
        id: user.id,
        name: user.fullName,
        email: user.email,
        phone: user.phoneNumber || '',
        role: user.role,
        isVendor: Boolean(isVendor),
        shops: myShops || [],
        loggedInAt: Date.now()
      };
      localStorage.setItem('zooner_user_profile', JSON.stringify(profile));
      window.dispatchEvent(new Event('storage'));
      return profile;
    }
    return null;
  } catch {
    return null;
  }
}

export interface AuthResult {
  success: boolean;
  data?: AuthResponse;
  error?: string;
}

export async function googleLogin(credential: string): Promise<AuthResult> {
  try {
    const isNative = Capacitor.isNativePlatform();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (isNative) {
      headers['X-Client-Platform'] = 'native';
    }

    const res = await fetch(`${API_BASE_URL}/Auth/google`, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({ credential })
    });

    const body = await parseApiResponse<AuthResponse>(res, 'Google authentication failed. Please verify your credentials.');

    if (res.ok && body.success && body.data) {
      localStorage.setItem('zooner_token', body.data.accessToken);
      if (isNative && body.data.refreshToken) {
        localStorage.setItem('zooner_refresh_token', body.data.refreshToken);
      } else {
        localStorage.removeItem('zooner_refresh_token');
      }

      localStorage.setItem('zooner_user_profile', JSON.stringify({
        id: body.data.user.id,
        name: body.data.user.fullName,
        email: body.data.user.email,
        phone: body.data.user.phoneNumber || '',
        role: body.data.user.role,
        isVendor: body.data.user.role === 'ShopOwner' || body.data.user.role === 'Admin' || body.data.user.role === 'Vendor',
        shops: [],
        loggedInAt: Date.now()
      }));
      window.dispatchEvent(new Event('storage'));

      syncUserProfile();
      return { success: true, data: body.data };
    }

    return {
      success: false,
      error: body.message || 'Google authentication failed. Please verify your credentials.'
    };
  } catch (error: any) {
    console.error('Google login error:', error);
    return {
      success: false,
      error: error?.message && !error.message.includes('fetch') 
        ? error.message 
        : 'Unable to connect to authentication server. Please check your network connection.'
    };
  }
}

export async function loginUser(email: string, password: string): Promise<AuthResult> {
  try {
    const isNative = Capacitor.isNativePlatform();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (isNative) {
      headers['X-Client-Platform'] = 'native';
    }

    const res = await fetch(`${API_BASE_URL}/Auth/login`, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({ email, password })
    });

    const body = await parseApiResponse<AuthResponse>(res, 'Invalid email or password. Please try again.');

    if (res.ok && body.success && body.data) {
      localStorage.setItem('zooner_token', body.data.accessToken);
      if (isNative && body.data.refreshToken) {
        localStorage.setItem('zooner_refresh_token', body.data.refreshToken);
      } else {
        localStorage.removeItem('zooner_refresh_token');
      }
      
      localStorage.setItem('zooner_user_profile', JSON.stringify({
        id: body.data.user.id,
        name: body.data.user.fullName,
        email: body.data.user.email,
        phone: body.data.user.phoneNumber || '',
        role: body.data.user.role,
        isVendor: body.data.user.role === 'ShopOwner' || body.data.user.role === 'Admin' || body.data.user.role === 'Vendor',
        shops: [],
        loggedInAt: Date.now()
      }));
      window.dispatchEvent(new Event('storage'));

      syncUserProfile();
      return { success: true, data: body.data };
    }

    return {
      success: false,
      error: body.message || 'Invalid email or password. Please try again.'
    };
  } catch (error: any) {
    console.error('Login error:', error);
    return {
      success: false,
      error: error?.message && !error.message.includes('fetch')
        ? error.message
        : 'Unable to connect to authentication server. Please check your network connection.'
    };
  }
}

export async function registerUser(userData: {
  fullName: string;
  email: string;
  password: string;
  phoneNumber?: string;
  role?: string;
}): Promise<AuthResult> {
  try {
    const isNative = Capacitor.isNativePlatform();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (isNative) {
      headers['X-Client-Platform'] = 'native';
    }

    const res = await fetch(`${API_BASE_URL}/Auth/register`, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify(userData)
    });

    const body = await parseApiResponse<AuthResponse>(res, 'Registration failed. An account with this email may already exist.');

    if (res.ok && body.success && body.data) {
      localStorage.setItem('zooner_token', body.data.accessToken);
      if (isNative && body.data.refreshToken) {
        localStorage.setItem('zooner_refresh_token', body.data.refreshToken);
      } else {
        localStorage.removeItem('zooner_refresh_token');
      }
      localStorage.setItem('zooner_user_profile', JSON.stringify({
        id: body.data.user.id,
        name: body.data.user.fullName,
        email: body.data.user.email,
        phone: body.data.user.phoneNumber || '',
        role: body.data.user.role,
        isVendor: body.data.user.role === 'ShopOwner' || body.data.user.role === 'Admin' || body.data.user.role === 'Vendor',
        shops: [],
        loggedInAt: Date.now()
      }));
      window.dispatchEvent(new Event('storage'));

      syncUserProfile();
      return { success: true, data: body.data };
    }

    const detailedErrors = Array.isArray(body.errors) && body.errors.length > 0
      ? body.errors.join('. ')
      : body.message;

    return {
      success: false,
      error: detailedErrors || 'Registration failed. An account with this email may already exist.'
    };
  } catch (error: any) {
    console.error('Registration error:', error);
    return {
      success: false,
      error: error?.message && !error.message.includes('fetch')
        ? error.message
        : 'Unable to connect to authentication server. Please check your network connection.'
    };
  }
}

/**
 * Ensures that the customer has an active authenticated session.
 * If not signed in with a named account, it automatically initializes a seamless,
 * persistent anonymous guest shopper session in the background so that customers
 * can hold products, broadcast requests, and use all features with ZERO LOGIN PROMPTS.
 */
export async function ensureCustomerSession(): Promise<string | null> {
  const existingToken = localStorage.getItem('zooner_token');
  if (existingToken) return existingToken;

  let guestId = localStorage.getItem('zooner_guest_device_id');
  if (!guestId) {
    guestId = 'guest_' + Math.random().toString(36).substring(2, 9) + Math.random().toString(36).substring(2, 6);
    localStorage.setItem('zooner_guest_device_id', guestId);
  }

  const guestEmail = `${guestId}@guest.zooner.app`;
  const guestPassword = `ZoonerGuest_${guestId}!`;

  try {
    const regRes = await registerUser({
      fullName: 'Shopper',
      email: guestEmail,
      password: guestPassword,
      role: 'Customer'
    });
    if (regRes.success && regRes.data?.accessToken) {
      return regRes.data.accessToken;
    }
  } catch {}

  try {
    const loginRes = await loginUser(guestEmail, guestPassword);
    if (loginRes.success && loginRes.data?.accessToken) {
      return loginRes.data.accessToken;
    }
  } catch (err) {
    console.warn('Guest session initialization notice:', err);
  }

  return localStorage.getItem('zooner_token');
}

export async function getCurrentUser(): Promise<UserDto | null> {
  try {
    const res = await authenticatedFetch(`${API_BASE_URL}/Auth/me`);
    return responseData<UserDto>(res);
  } catch {
    return null;
  }
}

export function logoutUser(): void {
  const isNative = Capacitor.isNativePlatform();
  const refreshToken = isNative ? localStorage.getItem('zooner_refresh_token') : null;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (isNative) {
    headers['X-Client-Platform'] = 'native';
  }

  fetch(`${API_BASE_URL}/Auth/logout`, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify(refreshToken ? { refreshToken } : {})
  }).catch(() => {});

  localStorage.removeItem('zooner_token');
  localStorage.removeItem('zooner_refresh_token');
  localStorage.removeItem('zooner_user_profile');
  window.dispatchEvent(new Event('storage'));
}


// ── SHOPS & STORES API METHODS ──

export interface ShopProfileDto {
  id: string;
  name: string;
  phone: string;
  address: string;
  latitude: number;
  longitude: number;
  isLiveEnabled: boolean;
  isOpen: boolean;
  isCurrentlyOpen?: boolean;
  isVerified?: boolean;
  verificationStatus?: string;
  distanceKm?: number;
  categoryName?: string;
  categories?: { id: string; name: string }[];
  products?: { id: string; name: string; price: number; originalPrice?: number; inStock?: boolean; stockCount?: number; imageUrl?: string }[];
}

export async function createShop(shopData: {
  name: string;
  phone: string;
  address: string;
  latitude: number;
  longitude: number;
  categoryIds: string[];
}): Promise<ShopProfileDto | null> {
  try {
    const isGuid = (val: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
    const sanitizedData = {
      ...shopData,
      categoryIds: (shopData.categoryIds || []).filter(isGuid)
    };

    const res = await authenticatedFetch(`${API_BASE_URL}/Shops`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sanitizedData)
    });
    if (res.ok) {
      const result = await responseData<ShopProfileDto>(res);
      if (result) {
        await syncUserProfile();
        return result;
      }
    }
    const errBody = await res.json().catch(() => null);
    console.error('Create shop error response:', errBody);
    return null;
  } catch (error) {
    console.error('Failed to create shop:', error);
    return null;
  }
}

export async function getMyShops(): Promise<ShopProfileDto[]> {
  try {
    const response = await authenticatedFetch(`${API_BASE_URL}/Shops/my-shops`);
    if (response.ok) {
      const data = await responseData<ShopProfileDto[]>(response);
      if (data && Array.isArray(data)) return data;
    }
  } catch (error) {
    console.error('Failed to fetch my shops:', error);
  }
  return [];
}

export async function updateShop(shopId: string, shop: {
  name: string;
  phone: string;
  address: string;
  latitude?: number;
  longitude?: number;
}): Promise<ShopProfileDto | null> {
  try {
    const response = await authenticatedFetch(`${API_BASE_URL}/Shops/${shopId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(shop)
    });
    return responseData<ShopProfileDto>(response);
  } catch {
    return null;
  }
}

export async function setShopLiveStatus(shopId: string, isLiveEnabled: boolean): Promise<boolean> {
  try {
    const response = await authenticatedFetch(`${API_BASE_URL}/Shops/${shopId}/live-status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isLiveEnabled })
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function verifyOwnerShop(shopId: string): Promise<boolean> {
  try {
    const response = await authenticatedFetch(`${API_BASE_URL}/Shops/${shopId}/verify-owner`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function createLiveRequest(data: {
  requestText: string;
  categoryId: string;
  latitude: number;
  longitude: number;
  searchRadiusKm: number;
}): Promise<LiveRequestSummary | null> {
  try {
    const res = await authenticatedFetch(`${API_BASE_URL}/Requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      console.error('Create live request failed:', err);
      return null;
    }
    const json: ApiResponse<LiveRequestSummary> = await res.json();
    return json.data || null;
  } catch (err) {
    console.error('createLiveRequest error:', err);
    return null;
  }
}

export async function getIncomingRequests(shopId: string): Promise<LiveRequestSummary[]> {
  try {
    const response = await authenticatedFetch(`${API_BASE_URL}/Shops/${shopId}/incoming-requests`);
    return (await responseData<LiveRequestSummary[]>(response)) ?? [];
  } catch {
    return [];
  }
}

export async function respondToLiveRequest(requestId: string, shopId: string): Promise<ApiResponse<Record<string, unknown>>> {
  try {
    const response = await authenticatedFetch(`${API_BASE_URL}/Requests/${requestId}/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shopId })
    });
    return await parseApiResponse<Record<string, unknown>>(response, 'Failed to respond to request');
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || 'Network error responding to request',
      data: null as any
    };
  }
}

export async function fetchCategories(): Promise<CategoryDto[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/Categories`);
    if (!res.ok) return [];
    const json: ApiResponse<CategoryDto[]> = await res.json();
    return json.data || [];
  } catch (error) {
    console.error('Failed to fetch categories from API:', error);
    return [];
  }
}

export async function fetchShops(lat?: number, lon?: number, radiusKm?: number, category?: string): Promise<ShopProfileDto[]> {
  try {
    const params = new URLSearchParams();
    if (lat) params.append('userLat', lat.toString());
    if (lon) params.append('userLon', lon.toString());
    if (radiusKm) params.append('radiusKm', radiusKm.toString());
    if (category && category !== 'all') params.append('category', category);

    const url = `${API_BASE_URL}/Shops${params.toString() ? '?' + params.toString() : ''}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const json: ApiResponse<ShopProfileDto[]> = await res.json();
    return json.data || [];
  } catch (error) {
    console.error('Failed to fetch shops from API:', error);
    return [];
  }
}

export async function sendLiveRequest(requestData: {
  requestText: string;
  categoryId: string;
  subCategoryId?: string;
  searchRadiusKm: number;
  latitude: number;
  longitude: number;
}): Promise<LiveRequestSummary | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/Requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders()
      },
      body: JSON.stringify(requestData)
    });
    if (!res.ok) return null;
    const json: ApiResponse<LiveRequestSummary> = await res.json();
    return json.data || null;
  } catch (error) {
    console.error('Failed to send live request:', error);
    return null;
  }
}

export async function fetchTargetedAds(lat = 11.0168, lon = 76.9558, category = 'all'): Promise<Record<string, unknown>[]> {
  try {
    const params = new URLSearchParams({
      userLat: lat.toString(),
      userLon: lon.toString(),
      category: category
    });
    const res = await fetch(`${API_BASE_URL}/Advertisements/targeted?${params.toString()}`);
    if (!res.ok) return [];
    const json: ApiResponse<Record<string, unknown>[]> = await res.json();
    return json.data || [];
  } catch (error) {
    console.error('Failed to fetch targeted ads:', error);
    return [];
  }
}

// ── GLOBAL PRODUCT CATALOG API METHODS ──

export async function searchProducts(q?: string, category?: string, lat?: number, lon?: number, radiusKm?: number): Promise<ProductSearchResult[]> {
  try {
    const params = new URLSearchParams();
    if (q) params.append('q', q);
    if (category && category !== 'all') params.append('category', category);
    if (lat) params.append('userLat', lat.toString());
    if (lon) params.append('userLon', lon.toString());
    if (radiusKm) params.append('radiusKm', radiusKm.toString());

    const res = await fetch(`${API_BASE_URL}/Products/search?${params.toString()}`);
    if (!res.ok) return [];
    const json: ApiResponse<ProductSearchResult[]> = await res.json();
    return json.data || [];
  } catch (error) {
    console.error('Failed to search products:', error);
    return [];
  }
}

export async function getProductById(productId: string, lat?: number, lon?: number): Promise<ProductSearchResult | null> {
  try {
    const params = new URLSearchParams();
    if (lat) params.append('userLat', lat.toString());
    if (lon) params.append('userLon', lon.toString());

    const res = await fetch(`${API_BASE_URL}/Products/${productId}?${params.toString()}`);
    if (!res.ok) return null;
    const json: ApiResponse<ProductSearchResult> = await res.json();
    return json.data || null;
  } catch (error) {
    console.error('Failed to fetch product details:', error);
    return null;
  }
}

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  possibleDuplicateFound?: boolean;
  reason?: string;
  matchedProduct?: ProductSearchResult;
  matchingProduct?: ProductSearchResult;
}

export async function checkDuplicateProduct(gtin?: string, brandName?: string, modelNumber?: string, name?: string): Promise<DuplicateCheckResult | null> {
  try {
    const params = new URLSearchParams();
    if (gtin) params.append('gtin', gtin);
    if (brandName) params.append('brandName', brandName);
    if (modelNumber) params.append('modelNumber', modelNumber);
    if (name) params.append('name', name);

    const res = await fetch(`${API_BASE_URL}/Products/check-duplicate?${params.toString()}`);
    if (!res.ok) return null;
    const json: ApiResponse<DuplicateCheckResult> = await res.json();
    return json.data || null;
  } catch (error) {
    console.error('Failed to check duplicate product:', error);
    return null;
  }
}

export async function createGlobalProduct(productData: {
  name: string;
  brandName?: string;
  categoryId: string;
  description?: string;
  modelNumber?: string;
  gtin?: string;
  mpn?: string;
  imageUrl?: string;
  variantName?: string;
}): Promise<ProductSearchResult | null> {
  try {
    const token = localStorage.getItem('zooner_token');
    const res = await fetch(`${API_BASE_URL}/Products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(productData)
    });
    if (!res.ok) return null;
    const json: ApiResponse<ProductSearchResult> = await res.json();
    return json.data || null;
  } catch (error) {
    console.error('Failed to create global product:', error);
    return null;
  }
}

// ── STORE INVENTORY MANAGEMENT API METHODS ──

export async function getStoreInventory(storeId: string, search?: string): Promise<StoreInventoryItem[]> {
  try {
    const params = new URLSearchParams();
    if (search) params.append('search', search);

    const res = await fetch(`${API_BASE_URL}/Stores/${storeId}/Inventory?${params.toString()}`);
    if (!res.ok) return [];
    const json: ApiResponse<StoreInventoryItem[]> = await res.json();
    return json.data || [];
  } catch (error) {
    console.error('Failed to fetch store inventory:', error);
    return [];
  }
}

export async function addStoreInventory(storeId: string, item: {
  productVariantId: string;
  price: number;
  quantity: number;
  shelfLocation?: string;
  sku?: string;
}): Promise<StoreInventoryItem | null> {
  try {
    const res = await authenticatedFetch(`${API_BASE_URL}/Stores/${storeId}/Inventory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item)
    });
    if (!res.ok) return null;
    const json: ApiResponse<StoreInventoryItem> = await res.json();
    return json.data || null;
  } catch (error) {
    console.error('Failed to add store inventory:', error);
    return null;
  }
}

export async function updateStoreInventory(storeId: string, inventoryId: string, item: {
  price: number;
  quantity: number;
  shelfLocation?: string;
  isActive?: boolean;
}): Promise<StoreInventoryItem | null> {
  try {
    const res = await authenticatedFetch(`${API_BASE_URL}/Stores/${storeId}/Inventory/${inventoryId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item)
    });
    if (!res.ok) return null;
    const json: ApiResponse<StoreInventoryItem> = await res.json();
    return json.data || null;
  } catch (error) {
    console.error('Failed to update store inventory:', error);
    return null;
  }
}

export async function deleteStoreInventory(storeId: string, inventoryId: string): Promise<boolean> {
  try {
    const res = await authenticatedFetch(`${API_BASE_URL}/Stores/${storeId}/Inventory/${inventoryId}`, {
      method: 'DELETE'
    });
    return res.ok;
  } catch (error) {
    console.error('Failed to delete store inventory:', error);
    return false;
  }
}

export async function reserveInventoryHold(storeId: string, inventoryId: string, quantity = 1): Promise<{
  success: boolean;
  hold?: InventoryHoldDto;
  error?: string;
}> {
  try {
    const res = await authenticatedFetch(`${API_BASE_URL}/Stores/${storeId}/Inventory/${inventoryId}/hold`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity })
    });

    const json: ApiResponse<InventoryHoldDto> = await res.json();
    if (res.ok && json.success) {
      return { success: true, hold: json.data };
    }
    return { success: false, error: json.message || 'Failed to reserve hold' };
  } catch (error) {
    console.error('Failed to reserve inventory hold:', error);
    return { success: false, error: 'Unable to connect to server. Please try again.' };
  }
}

export async function releaseInventoryHold(storeId: string, inventoryId: string, holdId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const res = await authenticatedFetch(`${API_BASE_URL}/Stores/${storeId}/Inventory/${inventoryId}/holds/${holdId}/release`, {
      method: 'POST'
    });

    const json: ApiResponse<boolean> = await res.json();
    if (res.ok && json.success) {
      return { success: true };
    }
    return { success: false, error: json.message || 'Failed to release hold pass' };
  } catch (error) {
    console.error('Failed to release inventory hold:', error);
    return { success: false, error: 'Unable to connect to server.' };
  }
}

export async function fetchMyActiveHolds(): Promise<InventoryHoldDto[]> {
  try {
    const res = await authenticatedFetch(`${API_BASE_URL}/holds/my-holds`);
    if (!res.ok) return [];
    const json: ApiResponse<InventoryHoldDto[]> = await res.json();
    return json.data || [];
  } catch {
    return [];
  }
}

export async function becomeVendor(): Promise<{ success: boolean; data?: AuthResponse; error?: string }> {
  try {
    const isNative = Capacitor.isNativePlatform();
    const res = await authenticatedFetch(`${API_BASE_URL}/Auth/become-vendor`, {
      method: 'POST'
    });
    if (res.ok) {
      const json: ApiResponse<AuthResponse> = await res.json();
      if (json.success && json.data) {
        localStorage.setItem('zooner_token', json.data.accessToken);
        if (isNative && json.data.refreshToken) {
          localStorage.setItem('zooner_refresh_token', json.data.refreshToken);
        } else {
          localStorage.removeItem('zooner_refresh_token');
        }
        if (json.data.user) {
          localStorage.setItem('zooner_user', JSON.stringify(json.data.user));
        }
        await syncUserProfile();
        return { success: true, data: json.data };
      }
    }
  } catch (error) {
    console.warn('Backend become-vendor unavailable, applying local upgrade:', error);
  }

  // Graceful local upgrade
  try {
    const current = localStorage.getItem('zooner_user_profile');
    if (current) {
      const parsed = JSON.parse(current);
      parsed.isVendor = true;
      parsed.role = 'ShopOwner';
      localStorage.setItem('zooner_user_profile', JSON.stringify(parsed));
      window.dispatchEvent(new Event('storage'));
    }
  } catch {}

  return { success: true };
}

export interface ValidateHoldQrResponseDto {
  isValid: boolean;
  message: string;
  hold?: InventoryHoldDto;
}

export async function validateHoldQr(storeId: string, qrTokenOrCode: string): Promise<ValidateHoldQrResponseDto> {
  try {
    const res = await authenticatedFetch(`${API_BASE_URL}/stores/${storeId}/Inventory/holds/validate-qr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ qrTokenOrCode })
    });
    if (!res.ok) {
      const errJson = await res.json().catch(() => null);
      return { isValid: false, message: errJson?.message || 'Failed to validate QR code.' };
    }
    const json: ApiResponse<ValidateHoldQrResponseDto> = await res.json();
    return json.data || { isValid: false, message: json.message || 'Validation failed.' };
  } catch (err) {
    console.error('validateHoldQr error:', err);
    return { isValid: false, message: 'Network error validating QR pass.' };
  }
}

export async function collectHold(storeId: string, holdId: string): Promise<{ success: boolean; message: string; hold?: InventoryHoldDto }> {
  try {
    const res = await authenticatedFetch(`${API_BASE_URL}/stores/${storeId}/Inventory/holds/${holdId}/collect`, {
      method: 'POST'
    });
    const json: ApiResponse<InventoryHoldDto> = await res.json();
    if (res.ok && json.success && json.data) {
      return { success: true, message: json.message || 'Marked as collected successfully.', hold: json.data };
    }
    return { success: false, message: json.message || 'Failed to mark hold as collected.' };
  } catch (err) {
    console.error('collectHold error:', err);
    return { success: false, message: 'Network error marking hold as collected.' };
  }
}

// ── ADMIN PANEL API METHODS ──

export interface PendingShopDto {
  id: string;
  name: string;
  phone: string;
  address: string;
  latitude: number;
  longitude: number;
  imageUrl?: string;
  verificationStatus: string;
  isActive: boolean;
  createdAtUtc: string;
  ownerId: string;
  ownerName?: string;
  categories: { categoryId: string; name: string }[];
}

export interface AdminUserDto {
  id: string;
  fullName: string;
  email: string;
  phoneNumber?: string;
  role: string;
  isActive: boolean;
  createdAtUtc: string;
  shopsCount?: number;
}

export interface AdminSettingDto {
  key: string;
  value: string;
  description?: string;
  updatedAtUtc?: string;
}

export interface AdminAuditLogDto {
  id: string;
  adminId: string;
  adminEmail?: string;
  action: string;
  entityType: string;
  entityId?: string;
  details?: string;
  createdAtUtc: string;
}

export async function getAdminShops(status?: string, search?: string): Promise<PendingShopDto[]> {
  try {
    const params = new URLSearchParams();
    if (status && status !== 'All') params.append('status', status);
    if (search && search.trim()) params.append('search', search.trim());
    const query = params.toString() ? `?${params.toString()}` : '';
    const res = await authenticatedFetch(`${API_BASE_URL}/Admin/shops${query}`);
    if (res.ok) {
      const json: ApiResponse<PendingShopDto[]> = await res.json();
      return json.data || [];
    }
    return [];
  } catch (err) {
    console.error('getAdminShops error:', err);
    return [];
  }
}

export async function getPendingShops(): Promise<PendingShopDto[]> {
  try {
    const res = await authenticatedFetch(`${API_BASE_URL}/Admin/shops/pending`);
    if (res.ok) {
      const json: ApiResponse<PendingShopDto[]> = await res.json();
      return json.data || [];
    }
    return [];
  } catch (err) {
    console.error('getPendingShops error:', err);
    return [];
  }
}

export async function toggleAdminShopStatus(shopId: string, isActive: boolean): Promise<boolean> {
  try {
    const res = await authenticatedFetch(`${API_BASE_URL}/Admin/shops/${shopId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive })
    });
    return res.ok;
  } catch (err) {
    console.error('toggleAdminShopStatus error:', err);
    return false;
  }
}

export async function verifyShop(shopId: string, status: 'Approved' | 'Rejected', reason?: string): Promise<boolean> {
  try {
    const res = await authenticatedFetch(`${API_BASE_URL}/Admin/shops/${shopId}/verify`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, reason })
    });
    return res.ok;
  } catch (err) {
    console.error('verifyShop error:', err);
    return false;
  }
}

export async function getAdminUsers(page = 1, pageSize = 50): Promise<AdminUserDto[]> {
  try {
    const res = await authenticatedFetch(`${API_BASE_URL}/Admin/users?page=${page}&pageSize=${pageSize}`);
    if (res.ok) {
      const json: ApiResponse<AdminUserDto[]> = await res.json();
      return json.data || [];
    }
    return [];
  } catch (err) {
    console.error('getAdminUsers error:', err);
    return [];
  }
}

export async function toggleUserStatus(userId: string, isActive: boolean, reason?: string): Promise<boolean> {
  try {
    const res = await authenticatedFetch(`${API_BASE_URL}/Admin/users/${userId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive, reason })
    });
    return res.ok;
  } catch (err) {
    console.error('toggleUserStatus error:', err);
    return false;
  }
}

export async function getAdminSettings(): Promise<AdminSettingDto[]> {
  try {
    const res = await authenticatedFetch(`${API_BASE_URL}/Admin/settings`);
    if (res.ok) {
      const json: ApiResponse<AdminSettingDto[]> = await res.json();
      return json.data || [];
    }
    return [];
  } catch (err) {
    console.error('getAdminSettings error:', err);
    return [];
  }
}

export async function updateAdminSetting(key: string, value: string, description?: string): Promise<boolean> {
  try {
    const res = await authenticatedFetch(`${API_BASE_URL}/Admin/settings/${encodeURIComponent(key)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value, description })
    });
    return res.ok;
  } catch (err) {
    console.error('updateAdminSetting error:', err);
    return false;
  }
}

export async function getAdminAuditLogs(page = 1, pageSize = 50): Promise<AdminAuditLogDto[]> {
  try {
    const res = await authenticatedFetch(`${API_BASE_URL}/Admin/audit-logs?page=${page}&pageSize=${pageSize}`);
    if (res.ok) {
      const json: ApiResponse<AdminAuditLogDto[]> = await res.json();
      return json.data || [];
    }
    return [];
  } catch (err) {
    console.error('getAdminAuditLogs error:', err);
    return [];
  }
}

export async function createAdminCategory(data: { name: string; slug: string; description?: string; icon?: string; displayOrder?: number }): Promise<boolean> {
  try {
    const res = await authenticatedFetch(`${API_BASE_URL}/Admin/categories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.ok;
  } catch (err) {
    console.error('createAdminCategory error:', err);
    return false;
  }
}

export async function toggleAdminCategoryStatus(id: string, isActive: boolean): Promise<boolean> {
  try {
    const res = await authenticatedFetch(`${API_BASE_URL}/Admin/categories/${id}/status?isActive=${isActive}`, {
      method: 'PATCH'
    });
    return res.ok;
  } catch (err) {
    console.error('toggleAdminCategoryStatus error:', err);
    return false;
  }
}




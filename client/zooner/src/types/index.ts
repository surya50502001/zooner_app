export interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  originalPrice?: number;
  storeName: string;
  storeArea: string;
  distance: string;
  inStock: boolean;
  stockCount?: number;
  imageUrl: string;
  rating: number;
  reviewsCount: number;
  offerTag?: string;
  badge?: 'Trending' | 'Low Stock' | 'New Arrival' | 'Exclusive';
}

export interface Store {
  id: string;
  name: string;
  category: string;
  area: string;
  distance: string;
  rating: number;
  verified: boolean;
  openStatus: string;
  address: string;
  phone?: string;
  featuredProductsCount?: number;
  tags: string[];
  avatarUrl?: string;
  latitude?: number;
  longitude?: number;
  lat?: number;
  lng?: number;
}

export interface ProductRequestItem {
  product: string;
  size: string;
  budget: string;
  location: string;
}

export interface RetailerResponse {
  id: string;
  storeName: string;
  storeArea: string;
  distance: string;
  price: number;
  available: boolean;
  conditionNote: string;
  rating: number;
  verified: boolean;
  avatar: string;
}

export interface LocationArea {
  id: string;
  name: string;
  city: string;
  storesCount: number;
  activeRequests: number;
  lat?: number;
  lng?: number;
}

export interface UserDto {
  id: string;
  fullName: string;
  email: string;
  phoneNumber?: string;
  role: string;
  isActive: boolean;
  createdAtUtc: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  user: UserDto;
}

export interface CategoryDto {
  id: string;
  name: string;
  slug: string;
  description?: string;
  iconName?: string;
  displayOrder: number;
  isActive: boolean;
  subCategories?: SubCategoryDto[];
}

export interface SubCategoryDto {
  id: string;
  categoryId: string;
  name: string;
  slug: string;
  description?: string;
  displayOrder: number;
  isActive: boolean;
}

export interface StoreInventoryItem {
  inventoryId: string;
  storeId: string;
  storeName: string;
  storeAddress?: string;
  storePhone?: string;
  storeArea?: string;
  latitude?: number;
  longitude?: number;
  isStoreOpen: boolean;
  variantId: string;
  variantName: string;
  price: number;
  quantity: number;
  availableQuantity: number;
  shelfLocation?: string;
  sku?: string;
  updatedAtUtc: string;
  distanceKm?: number;
  isAvailable?: boolean;
}

export interface ProductVariantDto {
  id: string;
  variantName: string;
  sku?: string;
  gtin?: string;
  color?: string;
}

export interface ProductSearchResult {
  id: string;
  name: string;
  brandName?: string;
  categoryName?: string;
  modelNumber?: string;
  gtin?: string;
  mpn?: string;
  imageUrl?: string;
  description?: string;
  minPrice?: number;
  maxPrice?: number;
  lowestPrice?: number;
  highestPrice?: number;
  totalAvailableQuantity?: number;
  nearbyStoresCount?: number;
  carryingStoresCount?: number;
  carryingStores?: StoreInventoryItem[];
  variants?: ProductVariantDto[];
}

export interface RequestResponseDto {
  id: string;
  requestId: string;
  shopId: string;
  shopName: string;
  shopAddress?: string;
  distanceKm?: number;
  status: string;
  price?: number;
  message?: string;
  createdAtUtc?: string;
}

export interface LiveRequestSummary {
  id: string;
  requestText: string;
  categoryId: string;
  categoryName: string;
  subCategoryName?: string;
  latitude: number;
  longitude: number;
  searchRadiusKm: number;
  distanceToShopKm?: number;
  status: string;
  createdAtUtc: string;
  expiresAtUtc: string;
  responses?: (RetailerResponse | RequestResponseDto)[];
}

export interface ChatMessageDto {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  messageText: string;
  isRead: boolean;
  createdAtUtc: string;
}

export interface ConversationDto {
  id: string;
  liveRequestId: string;
  liveRequestText: string;
  customerId: string;
  customerName: string;
  shopId: string;
  shopName: string;
  createdAtUtc: string;
  updatedAtUtc: string;
  lastMessage?: ChatMessageDto;
  unreadCount: number;
}


export interface InventoryHoldDto {
  holdId: string;
  storeInventoryId: string;
  storeId: string;
  storeName: string;
  storeAddress: string;
  storePhone: string;
  productName: string;
  variantName: string;
  price: number;
  quantity: number;
  holdCode: string;
  qrToken?: string;
  status: string;
  expiresAtUtc: string;
  createdAtUtc: string;
}

export interface GoogleCredentialResponse {
  credential?: string;
  select_by?: string;
}

/* eslint-disable @typescript-eslint/no-namespace */
declare global {
  namespace google {
    namespace accounts {
      namespace id {
        interface CredentialResponse {
          credential?: string;
          select_by?: string;
        }
        interface GsiButtonConfiguration {
          type?: 'standard' | 'icon';
          theme?: 'outline' | 'filled_blue' | 'filled_black';
          size?: 'large' | 'medium' | 'small';
          text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
          shape?: 'rectangular' | 'pill' | 'circle' | 'square';
          logo_alignment?: 'left' | 'center';
          width?: string | number;
          locale?: string;
        }
        interface IdConfiguration {
          client_id: string;
          callback: (response: CredentialResponse) => void;
          auto_select?: boolean;
          cancel_on_tap_outside?: boolean;
        }
        function initialize(config: IdConfiguration): void;
        function renderButton(parent: HTMLElement, options: GsiButtonConfiguration): void;
        function prompt(momentListener?: (notification: unknown) => void): void;
      }
    }
  }

  interface Window {
    google?: typeof google;
  }
}




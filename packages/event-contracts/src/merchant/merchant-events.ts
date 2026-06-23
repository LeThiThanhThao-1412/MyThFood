export const MERCHANT_REGISTERED_EVENT_TYPE = 'com.mythfood.merchant.registered';
export const MENU_UPDATED_EVENT_TYPE = 'com.mythfood.merchant.menu.updated';

export interface MerchantRegisteredEventData {
  merchantId: string;
  userId: string;
  name: string;
  email: string | null;
  phone: string;
  address: string;
  status: string;
}

export interface MenuUpdatedEventData {
  merchantId: string;
  menuItemId: string;
  name: string;
  price: number;
  isAvailable: boolean;
  action: 'CREATED' | 'UPDATED' | 'DELETED' | 'TOGGLED' | 'PRICE_CHANGED';
  oldPrice?: number;
  newPrice?: number;
}
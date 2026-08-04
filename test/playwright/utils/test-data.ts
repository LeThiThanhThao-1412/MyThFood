/**
 * Test data for MyThFood E2E tests
 */

export const TEST_USERS = {
  consumer: {
    phone: '0987654321',
    password: 'Test@123',
    fullName: 'Test Consumer',
    email: 'test-consumer@mythfood.com',
  },
  merchant: {
    phone: '0987654322',
    password: 'Test@123',
    fullName: 'Test Merchant',
    email: 'test-merchant@mythfood.com',
  },
  driver: {
    phone: '0987654323',
    password: 'Test@123',
    fullName: 'Test Driver',
    email: 'test-driver@mythfood.com',
  },
  admin: {
    phone: '0987654324',
    password: 'Admin@123',
    fullName: 'Test Admin',
    email: 'test-admin@mythfood.com',
  },
} as const;

export const TEST_MERCHANT = {
  name: 'Test Restaurant',
  phone: '0281234567',
  address: '123 Nguyen Hue, District 1, HCMC',
  description: 'A test restaurant for E2E testing',
  gpsCoordinates: {
    lat: 10.7758,
    lng: 106.7044,
  },
};

export const TEST_MENU_ITEMS = [
  {
    name: 'Phở Bò',
    description: 'Traditional beef noodle soup',
    price: 50000,
    imageUrl: 'https://example.com/pho.jpg',
    isAvailable: true,
  },
  {
    name: 'Bún Chả',
    description: 'Grilled pork with noodles',
    price: 45000,
    imageUrl: 'https://example.com/buncha.jpg',
    isAvailable: true,
  },
  {
    name: 'Cơm Tấm',
    description: 'Broken rice with grilled pork',
    price: 40000,
    imageUrl: 'https://example.com/comtam.jpg',
    isAvailable: true,
  },
];

export const TEST_ADDRESS = {
  label: 'Home',
  street: '456 Le Loi, District 1',
  city: 'Ho Chi Minh City',
  district: 'District 1',
  ward: 'Ben Nghe',
  gpsCoordinates: {
    lat: 10.7761,
    lng: 106.7013,
  },
};

export const DELIVERY_ADDRESS = {
  label: 'Office',
  street: '789 Dien Bien Phu, Binh Thanh',
  city: 'Ho Chi Minh City',
  district: 'Binh Thanh',
  ward: 'Ward 25',
  gpsCoordinates: {
    lat: 10.8022,
    lng: 106.7117,
  },
};

export const API_BASE_URLS = {
  identity: 'http://localhost:3001/api',
  consumer: 'http://localhost:3002/api',
  merchant: 'http://localhost:3003/api',
  order: 'http://localhost:3004/api',
  payment: 'http://localhost:3005/api',
  driver: 'http://localhost:3006/api',
  dispatch: 'http://localhost:3007/api',
  wallet: 'http://localhost:3008/api',
  upload: 'http://localhost:3009/api',
};
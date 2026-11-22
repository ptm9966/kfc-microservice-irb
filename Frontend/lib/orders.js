const ORDERS_API_BASE_URL = process.env.NEXT_PUBLIC_ORDERS_API_URL || 'http://localhost:8081';

function getOrderToken() {
  return localStorage.getItem('token') || localStorage.getItem('id_token') || localStorage.getItem('auth_token');
}

export function hasOrderToken() {
  return Boolean(getOrderToken());
}

async function requestOrderApi(path, options = {}) {
  const token = getOrderToken();
  const response = await fetch(`${ORDERS_API_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const data = await response.json();

  if (!response.ok) {
    const message = response.status === 401
      ? 'Orders require a valid mobile/password sign-in. Please sign in again.'
      : data.message || 'Unable to reach the Orders service.';
    throw new Error(message);
  }

  return data;
}

export async function fetchOrders() {
  const orders = await requestOrderApi('/api/orders');
  if (!Array.isArray(orders)) {
    throw new Error('The Orders service returned an invalid order list.');
  }
  return orders;
}

export async function createOrder(orderDetails) {
  const response = await requestOrderApi('/api/orders', {
    method: 'POST',
    body: JSON.stringify(orderDetails),
  });

  if (!response.order?._id) {
    throw new Error('The Orders service did not return the saved order.');
  }

  return response.order;
}

export async function fetchOrderById(orderId) {
  return requestOrderApi(`/api/orders/${encodeURIComponent(orderId)}`);
}

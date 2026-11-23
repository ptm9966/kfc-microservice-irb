export const CART_API_BASE_URL = process.env.NEXT_PUBLIC_CART_API_URL || '/api/cart';

function getAuthHeaders() {
  const token = localStorage.getItem('token') || localStorage.getItem('auth_token') || localStorage.getItem('id_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function fetchCartItems() {
  const response = await fetch(CART_API_BASE_URL, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error('Unable to load cart from backend');
  }

  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

export async function removeCartItem(itemId) {
  const response = await fetch(`${CART_API_BASE_URL}/${encodeURIComponent(itemId)}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error('Unable to remove item from cart');
  }
}

export function getCartItemId(item) {
  return String(item._id || item.productId || item.id || '');
}

export async function removeCartItems(items) {
  const itemIds = items.map(getCartItemId);
  if (itemIds.some((itemId) => !itemId)) {
    throw new Error('One or more ordered items have no cart ID.');
  }

  const results = await Promise.allSettled(itemIds.map(removeCartItem));
  const remainingItems = await fetchCartItems();
  const failures = results.filter((result) => result.status === 'rejected');

  if (failures.length) {
    throw new Error(`Unable to remove ${failures.length} ordered item(s) from the bag.`);
  }

  return remainingItems;
}

export function syncCartCount(items) {
  const count = items.reduce((total, item) => total + Number(item.qty || 1), 0);
  try {
    localStorage.setItem('cartCount', String(count));
  } finally {
    window.dispatchEvent(new Event('cart-count-change'));
  }
}

export function calculateCartTotals(items) {
  const subtotal = items.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.qty || 1), 0);
  const delivery = items.length ? 1.99 : 0;
  const taxes = subtotal * 0.18;

  return {
    subtotal,
    delivery,
    taxes,
    total: subtotal + delivery + taxes,
  };
}

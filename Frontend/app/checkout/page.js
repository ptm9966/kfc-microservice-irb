'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  calculateCartTotals,
  fetchCartItems,
  getCartItemId,
  removeCartItem,
  syncCartCount,
} from '../../lib/cart';

function getProfileDeliveryInfo() {
  try {
    const savedUser = JSON.parse(localStorage.getItem('user') || '{}');
    const nameParts = String(savedUser.name || '').trim().split(/\s+/).filter(Boolean);

    return {
      firstName: savedUser.firstName || savedUser.given_name || nameParts[0] || '',
      lastName: savedUser.lastName || savedUser.family_name || nameParts.slice(1).join(' '),
      address: savedUser.address || savedUser.streetAddress || savedUser.deliveryAddress || '',
      city: savedUser.city || '',
      phone: savedUser.mobile || savedUser.phone_number || '',
    };
  } catch (error) {
    console.error('Unable to read delivery details from profile:', error);
    return { firstName: '', lastName: '', address: '', city: '', phone: '' };
  }
}

export default function CheckoutPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [removeError, setRemoveError] = useState('');
  const [removingId, setRemovingId] = useState('');
  const [deliveryInfo, setDeliveryInfo] = useState({
    firstName: '',
    lastName: '',
    address: '',
    city: '',
    phone: '',
  });
  const totals = useMemo(() => calculateCartTotals(items), [items]);

  useEffect(() => {
    setDeliveryInfo(getProfileDeliveryInfo());

    const loadCart = async () => {
      try {
        setItems(await fetchCartItems());
      } catch (fetchError) {
        console.error('Checkout cart fetch failed:', fetchError);
        setError('Unable to load your bag. Please return to your cart and try again.');
      } finally {
        setLoading(false);
      }
    };

    loadCart();
  }, []);

  const handleRemoveItem = async (item) => {
    const itemId = getCartItemId(item);
    if (!itemId) {
      setRemoveError('This item cannot be removed because it has no cart ID.');
      return;
    }

    setRemovingId(itemId);
    setRemoveError('');
    try {
      await removeCartItem(itemId);
    } catch (removeError) {
      console.error('Checkout item removal failed:', removeError);
      setRemoveError('Unable to remove this item. Please try again.');
      setRemovingId('');
      return;
    }

    const remainingItems = items.filter((cartItem) => getCartItemId(cartItem) !== itemId);
    setItems(remainingItems);
    setRemovingId('');

    try {
      syncCartCount(remainingItems);
    } catch (storageError) {
      console.error('Unable to sync cart count in browser storage:', storageError);
      setRemoveError('Item removed, but the bag count could not be updated. Refresh to sync it.');
    }
  };

  const updateDeliveryInfo = (field) => (event) => {
    setDeliveryInfo((current) => ({ ...current, [field]: event.target.value }));
  };

  return (
    <main className="page-shell">
      <h1 className="page-title">Checkout</h1>
      {loading && <p className="page-subtitle">Loading your bag...</p>}
      {!loading && error && <p className="page-subtitle" role="alert" style={{ color: '#b80020' }}>{error}</p>}
      {!loading && !error && items.length === 0 && (
        <div className="order-card">
          <p className="page-subtitle">Your bag is empty.</p>
          <Link href="/menu" className="primary-btn">Browse the menu</Link>
        </div>
      )}
      {!loading && !error && items.length > 0 && (
        <div className="checkout-grid">
          <div className="form-card">
            <h3>Delivery Information</h3>
            <p className="muted">
              Name and phone are filled from your profile. Add a delivery address if one is not saved there.
            </p>
            <div className="form-grid">
              <div className="form-row">
                <input
                  className="field"
                  placeholder="First name"
                  aria-label="First name"
                  value={deliveryInfo.firstName}
                  onChange={updateDeliveryInfo('firstName')}
                />
                <input
                  className="field"
                  placeholder="Last name"
                  aria-label="Last name"
                  value={deliveryInfo.lastName}
                  onChange={updateDeliveryInfo('lastName')}
                />
              </div>
              <input
                className="text-input"
                placeholder="Street address"
                aria-label="Street address"
                value={deliveryInfo.address}
                onChange={updateDeliveryInfo('address')}
              />
              <input
                className="text-input"
                placeholder="City"
                aria-label="City"
                value={deliveryInfo.city}
                onChange={updateDeliveryInfo('city')}
              />
              <input
                className="text-input"
                placeholder="Phone number"
                aria-label="Phone number"
                value={deliveryInfo.phone}
                onChange={updateDeliveryInfo('phone')}
              />
            </div>
          </div>

          <aside className="panel">
            <h3>Order Summary</h3>
            <div className="card-list">
              {items.map((item) => {
                const itemId = getCartItemId(item);
                return (
                  <div key={itemId || item.title} className="cart-item checkout-cart-item">
                    <span>{item.title || item.name || 'Item'} × {item.qty || 1}</span>
                    <strong>${(Number(item.price || 0) * Number(item.qty || 1)).toFixed(2)}</strong>
                    <button
                      type="button"
                      className="remove-item-btn"
                      aria-label={`Remove ${item.title || item.name || 'item'} from bag`}
                      disabled={!itemId || removingId === itemId}
                      onClick={() => handleRemoveItem(item)}
                    >
                      {removingId === itemId ? 'Removing…' : 'Remove'}
                    </button>
                  </div>
                );
              })}
            </div>
            {removeError && <p className="page-subtitle" role="alert" style={{ color: '#b80020' }}>{removeError}</p>}
            <div className="sum-row"><span>Subtotal</span><span>${totals.subtotal.toFixed(2)}</span></div>
            <div className="sum-row"><span>Delivery</span><span>${totals.delivery.toFixed(2)}</span></div>
            <div className="sum-row"><span>Taxes</span><span>${totals.taxes.toFixed(2)}</span></div>
            <div className="total-row"><span>Total</span><span>${totals.total.toFixed(2)}</span></div>
            <Link href="/payment" className="primary-btn" style={{ marginTop: 20, width: '100%' }}>Continue to Payment</Link>
          </aside>
        </div>
      )}
    </main>
  );
}

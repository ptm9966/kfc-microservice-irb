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

export default function CartPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [removeError, setRemoveError] = useState('');
  const [removingId, setRemovingId] = useState('');

  useEffect(() => {
    const fetchCart = async () => {
      try {
        setLoading(true);
        setItems(await fetchCartItems());
      } catch (err) {
        console.error('Cart fetch failed:', err);
        setError('Unable to load your cart right now.');
        setItems([]);
      } finally {
        setLoading(false);
      }
    };

    fetchCart();
  }, []);

  const totals = useMemo(() => calculateCartTotals(items), [items]);

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
      console.error('Cart item removal failed:', removeError);
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

  return (
    <main className="page-shell">
      <h1 className="page-title">Your Cart</h1>

      {loading && <p className="page-subtitle">Loading cart...</p>}
      {!loading && error && <p className="page-subtitle" style={{ color: '#b80020' }}>{error}</p>}

      {!loading && !error && (
        <div className="cart-layout">
          <div className="panel">
            {items.length === 0 ? (
              <div className="auth-card">
                <h3>Your cart is empty</h3>
                <p className="page-subtitle">Add items from the menu to begin your order.</p>
                <Link href="/menu" className="primary-btn">Browse Menu</Link>
              </div>
            ) : (
              <div className="card-list">
                {items.map((item) => (
                  <div key={getCartItemId(item) || item.title} className="cart-item checkout-cart-item">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <img
                        src={item.image || 'https://images.unsplash.com/photo-1562967916-eb82221dfb92?auto=format&fit=crop&w=400&q=80'}
                        alt={item.title || item.name || 'Cart item'}
                        style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8 }}
                      />
                      <div>
                        <strong>{item.title || item.name}</strong>
                        <div className="muted">Qty: {item.qty || 1}</div>
                      </div>
                    </div>
                    <strong>${(Number(item.price || 0) * Number(item.qty || 1)).toFixed(2)}</strong>
                    <button
                      type="button"
                      className="remove-item-btn"
                      aria-label={`Remove ${item.title || item.name || 'item'} from bag`}
                      disabled={!getCartItemId(item) || removingId === getCartItemId(item)}
                      onClick={() => handleRemoveItem(item)}
                    >
                      {removingId === getCartItemId(item) ? 'Removing…' : 'Remove'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <aside className="panel">
            <h3>Order Summary</h3>
            <div className="sum-row"><span>Subtotal</span><span>${totals.subtotal.toFixed(2)}</span></div>
            <div className="sum-row"><span>Delivery</span><span>${totals.delivery.toFixed(2)}</span></div>
            <div className="sum-row"><span>Taxes</span><span>${totals.taxes.toFixed(2)}</span></div>
            <div className="total-row"><span>Total</span><span>${totals.total.toFixed(2)}</span></div>
            {removeError && <p className="page-subtitle" role="alert" style={{ color: '#b80020' }}>{removeError}</p>}
            <Link href="/checkout" className="primary-btn" style={{ marginTop: 20, width: '100%' }}>Checkout</Link>
          </aside>
        </div>
      )}
    </main>
  );
}

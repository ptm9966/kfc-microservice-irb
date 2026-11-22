'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { calculateCartTotals, fetchCartItems, removeCartItems, syncCartCount } from '../../lib/cart';
import { createOrder } from '../../lib/orders';

export default function PaymentPage() {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [completionError, setCompletionError] = useState('');
  const [completing, setCompleting] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('card');
  const totals = useMemo(() => calculateCartTotals(items), [items]);

  useEffect(() => {
    const loadCart = async () => {
      try {
        setItems(await fetchCartItems());
      } catch (fetchError) {
        console.error('Payment cart fetch failed:', fetchError);
        setError('Unable to load your bag. Please return to your cart and try again.');
      } finally {
        setLoading(false);
      }
    };

    loadCart();
  }, []);

  const completeCheckout = async () => {
    setCompleting(true);
    setCompletionError('');
    try {
      const order = await createOrder({
        items,
        paymentMethod: { card: 'Card', upi: 'UPI', cod: 'Cash on delivery' }[paymentMethod],
        totalPrice: totals.total,
        totalItems: items.reduce((count, item) => count + Number(item.qty || 1), 0),
      });

      let cartCleanupFailed = false;
      try {
        const remainingItems = await removeCartItems(items);
        syncCartCount(remainingItems);
      } catch (cleanupError) {
        console.error('Order was placed, but cart cleanup failed:', cleanupError);
        cartCleanupFailed = true;
        try {
          syncCartCount(await fetchCartItems());
        } catch (syncError) {
          console.error('Unable to refresh the bag count after order placement:', syncError);
        }
      }

      const confirmationParams = new URLSearchParams({ orderId: order._id });
      if (cartCleanupFailed) confirmationParams.set('cartCleanupFailed', '1');
      router.replace(`/confirmation?${confirmationParams.toString()}`);
    } catch (checkoutError) {
      console.error('Checkout completion failed:', checkoutError);
      setCompletionError(`Unable to place your order. Your bag has not been cleared. ${checkoutError.message}`);
      setCompleting(false);
    }
  };

  return (
    <main className="page-shell">
      <h1 className="page-title">Payment</h1>
      {loading && <p className="page-subtitle">Loading your order...</p>}
      {!loading && error && <p className="page-subtitle" role="alert" style={{ color: '#b80020' }}>{error}</p>}
      {!loading && !error && items.length === 0 && (
        <div className="order-card">
          <p className="page-subtitle">Your bag is empty.</p>
          <Link href="/menu" className="primary-btn">Browse the menu</Link>
        </div>
      )}
      {!loading && !error && items.length > 0 && (
        <div className="payment-layout">
          <section className="panel" aria-labelledby="payment-order-summary">
            <h2 id="payment-order-summary">Order Summary</h2>
            <div className="card-list">
              {items.map((item) => (
                <div key={item._id || item.productId || item.title} className="cart-item">
                  <span>{item.title || item.name || 'Item'} × {item.qty || 1}</span>
                  <strong>${(Number(item.price || 0) * Number(item.qty || 1)).toFixed(2)}</strong>
                </div>
              ))}
            </div>
            <div className="sum-row"><span>Subtotal</span><span>${totals.subtotal.toFixed(2)}</span></div>
            <div className="sum-row"><span>Delivery</span><span>${totals.delivery.toFixed(2)}</span></div>
            <div className="sum-row"><span>Taxes</span><span>${totals.taxes.toFixed(2)}</span></div>
            <div className="total-row"><span>Total</span><span>${totals.total.toFixed(2)}</span></div>
          </section>

          <section className="panel" aria-labelledby="payment-method-heading">
            <h2 id="payment-method-heading">Payment Method</h2>
            <div className="payment-methods" role="radiogroup" aria-labelledby="payment-method-heading">
              <label className={`payment-method${paymentMethod === 'card' ? ' selected' : ''}`}>
                <input
                  type="radio"
                  name="payment-method"
                  value="card"
                  checked={paymentMethod === 'card'}
                  onChange={() => setPaymentMethod('card')}
                />
                <span><strong>Credit or debit card</strong><span className="muted">Pay securely by card</span></span>
              </label>
              <label className={`payment-method${paymentMethod === 'upi' ? ' selected' : ''}`}>
                <input
                  type="radio"
                  name="payment-method"
                  value="upi"
                  checked={paymentMethod === 'upi'}
                  onChange={() => setPaymentMethod('upi')}
                />
                <span><strong>UPI</strong><span className="muted">Pay using a UPI ID</span></span>
              </label>
              <label className={`payment-method${paymentMethod === 'cod' ? ' selected' : ''}`}>
                <input
                  type="radio"
                  name="payment-method"
                  value="cod"
                  checked={paymentMethod === 'cod'}
                  onChange={() => setPaymentMethod('cod')}
                />
                <span><strong>Cash on delivery</strong><span className="muted">Pay when your order arrives</span></span>
              </label>
            </div>

            {paymentMethod === 'card' && (
              <div className="form-grid payment-details">
                <input className="text-input" placeholder="Cardholder name" autoComplete="cc-name" />
                <input className="text-input" placeholder="Card number" inputMode="numeric" autoComplete="cc-number" />
                <div className="form-row">
                  <input className="field" placeholder="MM/YY" autoComplete="cc-exp" />
                  <input className="field" placeholder="CVV" inputMode="numeric" autoComplete="cc-csc" />
                </div>
              </div>
            )}

            {paymentMethod === 'upi' && (
              <div className="form-grid payment-details">
                <input className="text-input" placeholder="Enter UPI ID" autoComplete="off" />
              </div>
            )}

            {paymentMethod === 'cod' && (
              <p className="payment-note">Please keep the exact amount ready when your order is delivered.</p>
            )}

            <p className="payment-note">
              This demo records your order and payment method; card and UPI payments are not processed.
            </p>
            {completionError && <p className="page-subtitle" role="alert" style={{ color: '#b80020' }}>{completionError}</p>}
            <button
              type="button"
              className="primary-btn payment-continue"
              disabled={completing}
              onClick={completeCheckout}
            >
              {completing ? 'Placing order...' : 'Place Order'}
            </button>
          </section>
        </div>
      )}
    </main>
  );
}

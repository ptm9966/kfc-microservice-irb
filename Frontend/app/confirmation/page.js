'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { fetchOrderById } from '../../lib/orders';

export default function ConfirmationPage() {
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cartCleanupFailed, setCartCleanupFailed] = useState(false);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get('orderId');
    setCartCleanupFailed(params.get('cartCleanupFailed') === '1');

    if (!orderId) {
      setError('No order reference was provided. Check Your Orders for recent purchases.');
      setLoading(false);
      return () => {
        active = false;
      };
    }

    const loadOrder = async () => {
      try {
        const savedOrder = await fetchOrderById(orderId);
        if (active) setOrder(savedOrder);
      } catch (fetchError) {
        console.error('Confirmed order fetch failed:', fetchError);
        if (active) setError(fetchError.message || 'Unable to load order details.');
      } finally {
        if (active) setLoading(false);
      }
    };

    loadOrder();
    return () => {
      active = false;
    };
  }, []);

  const orderDate = order?.createdAt ? new Date(order.createdAt).toLocaleString() : '';

  return (
    <main className="page-shell">
      <div className="auth-wrap">
        <div className="auth-card">
          <h1 className="page-title" style={{ marginBottom: 12 }}>
            {loading ? 'Loading your order...' : order ? 'Order Confirmed' : 'Order details unavailable'}
          </h1>
          {loading && <p className="page-subtitle">Retrieving your saved order...</p>}
          {!loading && error && <p className="page-subtitle" role="alert">{error}</p>}
          {!loading && order && (
            <>
              <p className="page-subtitle">Your order has been placed successfully.</p>
              {cartCleanupFailed && (
                <p className="page-subtitle" role="alert" style={{ color: '#b80020' }}>
                  Your order was saved, but we could not clear your bag. Check it before placing another order.
                </p>
              )}
              <div className="order-card">
                <div className="table-row"><span>Order Number</span><strong>{order.orderNo || order._id}</strong></div>
                <div className="table-row"><span>Status</span><strong>{order.status || 'Placed'}</strong></div>
                {orderDate && <div className="table-row"><span>Placed</span><strong>{orderDate}</strong></div>}
                <div className="table-row"><span>Payment Method</span><strong>{order.paymentMethod || 'Not specified'}</strong></div>
                <div className="table-list">
                  {(Array.isArray(order.items) ? order.items : []).map((item, index) => (
                    <div className="table-row" key={item.productId || item.title || index}>
                      <span>{item.title || 'Item'} × {item.qty || 1}</span>
                      <span>${(Number(item.price || 0) * Number(item.qty || 1)).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
                <div className="total-row">
                  <span>Total</span>
                  <strong>${Number(order.totalPrice || 0).toFixed(2)}</strong>
                </div>
              </div>
            </>
          )}
          <div style={{ marginTop: 18 }}>
            <Link href="/orders" className="primary-btn">View My Orders</Link>
            {' '}
            <Link href="/" className="primary-btn">Back to Home</Link>
          </div>
        </div>
      </div>
    </main>
  );
}

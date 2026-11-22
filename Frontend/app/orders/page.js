'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { fetchOrders, hasOrderToken } from '../../lib/orders';

function formatOrderDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleString();
}

export default function OrdersPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadOrders = async () => {
      if (!hasOrderToken()) {
        setSignedIn(false);
        setLoading(false);
        return;
      }

      setSignedIn(true);
      try {
        setOrders(await fetchOrders());
      } catch (fetchError) {
        console.error('Order history request failed:', fetchError);
        setError(fetchError.message || 'Unable to load your orders right now.');
      } finally {
        setLoading(false);
      }
    };

    loadOrders();
  }, []);

  return (
    <main className="page-shell">
      <h1 className="page-title">Your Orders</h1>

      {loading && <p className="page-subtitle">Loading your orders...</p>}

      {!loading && !signedIn && (
        <div className="order-card">
          <p className="page-subtitle">Sign in to see your order history.</p>
          <Link href="/login" className="primary-btn">Sign in</Link>
        </div>
      )}

      {!loading && signedIn && error && (
        <p className="page-subtitle" role="alert" style={{ color: '#b80020' }}>{error}</p>
      )}

      {!loading && signedIn && !error && orders.length === 0 && (
        <div className="order-card">
          <p className="page-subtitle">You don&apos;t have any orders yet.</p>
          <Link href="/menu" className="primary-btn">Browse the menu</Link>
        </div>
      )}

      {!loading && signedIn && !error && orders.length > 0 && (
        <div className="order-list">
          {orders.map((order) => (
            <details className="order-card" key={order._id || order.orderNo}>
              <summary className="order-summary">
                <strong className="order-number">{order.orderNo || 'Order'}</strong>
                <span className="order-date">{formatOrderDate(order.createdAt)}</span>
                <strong className="order-price">${Number(order.totalPrice || 0).toFixed(2)}</strong>
              </summary>
              <div className="order-details">
                <div className="table-row">
                  <span>Status</span>
                  <strong>{order.status || 'Placed'}</strong>
                </div>
                <div className="table-row">
                  <span>Payment method</span>
                  <strong>{order.paymentMethod || 'Not specified'}</strong>
                </div>
                <div className="table-list">
                  {(Array.isArray(order.items) ? order.items : []).map((item, index) => (
                    <div className="table-row" key={item.productId || item.title || index}>
                      <span>{item.title || 'Item'} × {item.qty || 1}</span>
                      <span>${(Number(item.price || 0) * Number(item.qty || 1)).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </details>
          ))}
        </div>
      )}
    </main>
  );
}

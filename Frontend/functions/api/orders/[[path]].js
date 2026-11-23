import { createHttpServiceProxy } from '../../_shared/httpServiceProxy.js';

export const onRequest = createHttpServiceProxy({
  envKey: 'ORDERS_SERVICE_HTTP_URL',
  serviceName: 'Orders',
});

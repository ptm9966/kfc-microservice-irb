import { createHttpServiceProxy } from '../../_shared/httpServiceProxy.js';

export const onRequest = createHttpServiceProxy({
  envKey: 'CART_SERVICE_HTTP_URL',
  serviceName: 'Cart',
});

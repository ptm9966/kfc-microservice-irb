import { createHttpServiceProxy } from '../../_shared/httpServiceProxy.js';

export const onRequest = createHttpServiceProxy({
  envKey: 'USERS_SERVICE_HTTP_URL',
  serviceName: 'Users',
});

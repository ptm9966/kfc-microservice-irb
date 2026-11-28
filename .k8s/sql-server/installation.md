# SQL Server installation

Run these commands from the repository root with `kubectl` pointed at the
intended AKS cluster.

## Prerequisites

- The AKS cluster has the Azure Disk CSI driver (`disk.csi.azure.com`) enabled.
- You have permission to create cluster-scoped StorageClasses.
- Replace the SQL Server SA password and User JWT secret placeholders with
  strong values before applying them. Do not commit real credentials. During
  testing, the User, Orders, and Cart services use the SA password from the
  SQL Server Secret; switch them to dedicated least-privilege logins before
  production.
- The SQL Server Deployment requests 2Gi of memory and can use up to 4Gi.
  Ensure the cluster has enough node capacity before applying it.

## Fresh installation

1. Create the namespace. The User service Secret is not needed by SQL Server
   or its bootstrap Job.

   ```sh
   kubectl apply -f .k8s/namespace.yml
   ```

2. Apply the SQL Server Secret, Service, StorageClass, and PVC.

   ```sh
   kubectl apply -f .k8s/sql-server/secret.yml
   kubectl apply -f .k8s/sql-server/configmap.yml
   kubectl apply -f .k8s/sql-server/storageclass.yml
   kubectl apply -f .k8s/sql-server/persistent-volume-claim.yml
   ```

   The PVC requests 20Gi of Azure managed Standard SSD storage. The StorageClass
   uses `Retain`, so deleting the PVC does not automatically delete the disk.
   This is not a substitute for backups.

3. Start SQL Server and apply the database bootstrap resources.

   ```sh
   kubectl apply -f .k8s/sql-server/deployment.yml
   kubectl apply -f .k8s/sql-server/service.yml
   kubectl apply -f .k8s/sql-server/job.yml
   ```

4. Wait for SQL Server and the bootstrap Job to become ready.

   ```sh
   kubectl wait --for=condition=Ready pod -l app=kfc-sql-server -n domain-services-v3 --timeout=15m
   kubectl wait --for=condition=complete job/kfc-sql-server-bootstrap -n domain-services-v3 --timeout=15m
   ```

   Check the resources and bootstrap output if needed:

   ```sh
   kubectl get storageclass kfc-sql-server-storage
   kubectl get pvc,pods,services,jobs -n domain-services-v3
   kubectl logs job/kfc-sql-server-bootstrap -n domain-services-v3
   ```

5. After the Job completes, deploy the User, Orders, and Cart services. Their
   deployments connect as `sa` and create their schemas at startup. This
   shares server-administrator credentials with each service and is for
   testing only.

   Before deploying the User service, apply its Secret. It contains the
   User service's JWT signing secret, not SQL credentials:

   ```sh
   kubectl apply -f .k8s/user-service/secret.yml
   ```

   If the old per-service Secret resources already exist in the cluster,
   remove them after the service deployments have rolled out:

   ```sh
   kubectl delete secret cart-service-secrets orders-service-secrets \
     -n domain-services-v3 --ignore-not-found
   ```

## Upgrading from the previous StatefulSet

Do not run a StatefulSet and Deployment against the same SQL data volume at the
same time. Stop and remove the old StatefulSet first:

```sh
kubectl scale statefulset/kfc-sql-server --replicas=0 -n domain-services-v3
kubectl delete statefulset/kfc-sql-server -n domain-services-v3
kubectl delete service/kfc-sql-server-headless -n domain-services-v3 --ignore-not-found
```

The existing claim is named `sql-data-kfc-sql-server-0`; the Deployment reuses
that claim. If it already exists, **do not apply**
`persistent-volume-claim.yml`: a bound PVC's StorageClass cannot be changed.
Applying the new StorageClass is safe, but it only provisions new claims. For a
fresh installation, follow all steps above.

## Notes

- The bootstrap Job creates `users-database`, `orders-database`,
  `cart-database`, and an empty `products-database`. It does not create
  application logins; all three services use the SA login for testing.
- Existing `users_app`, `orders_app`, or `cart_app` logins in an already
  initialized SQL Server are not automatically dropped. They are no longer
  referenced by these manifests.
- If the bootstrap Job already exists and must be rerun, delete and recreate
  the Job because Kubernetes Jobs are immutable. Re-running is not needed just
  to switch service credentials to `sa`.
- The SQL Server image uses the Developer edition, which is for development
  and testing, not production.

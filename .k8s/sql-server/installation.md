# SQL Server installation

Run these commands from the repository root with `kubectl` pointed at the
intended AKS cluster.

## Prerequisites

- The AKS cluster has the Azure Disk CSI driver (`disk.csi.azure.com`) enabled.
- You have permission to create cluster-scoped StorageClasses.
- Replace every placeholder in the SQL Server and service Secret manifests with
  unique, strong passwords before applying them. Do not commit real credentials.
  The SQL passwords should be URL-safe because the bootstrap Job passes them
  through `sqlcmd` variables.
- Review the SQL Server container resources in `deployment.yml` before installing.
  Its current memory limit is `125Mi`, which is likely too low for SQL Server
  and may prevent the Pod from becoming Ready.

## Fresh installation

1. Create the namespace and service Secrets. The bootstrap Job needs the User,
   Orders, and Cart SQL passwords to create their database logins.

   ```sh
   kubectl apply -f .k8s/order-service/namespace.yml
   kubectl apply -f .k8s/user-service/secret.yml
   kubectl apply -f .k8s/order-service/secret.yml
   kubectl apply -f .k8s/cart-service/secret.yml
   ```

2. Apply the SQL Server Secret, Service, StorageClass, and PVC.

   ```sh
   kubectl apply -f .k8s/sql-server/secret.yml
   kubectl apply -f .k8s/sql-server/service.yml
   kubectl apply -f .k8s/sql-server/storageclass.yml
   kubectl apply -f .k8s/sql-server/persistent-volume-claim.yml
   ```

   The PVC requests 20Gi of Azure managed Standard SSD storage. The StorageClass
   uses `Retain`, so deleting the PVC does not automatically delete the disk.
   This is not a substitute for backups.

3. Start SQL Server and apply the database bootstrap resources.

   ```sh
   kubectl apply -f .k8s/sql-server/deployment.yml
   kubectl apply -f .k8s/sql-server/configmap.yml
   kubectl apply -f .k8s/sql-server/job.yml
   ```

4. Wait for SQL Server and the bootstrap Job to become ready.

   ```sh
   kubectl wait --for=condition=Ready pod -l app=kfc-sql-server -n domain-service-v3 --timeout=15m
   kubectl wait --for=condition=complete job/kfc-sql-server-bootstrap -n domain-service-v3 --timeout=15m
   ```

   Check the resources and bootstrap output if needed:

   ```sh
   kubectl get storageclass kfc-sql-server-storage
   kubectl get pvc,pods,services,jobs -n domain-service-v3
   kubectl logs job/kfc-sql-server-bootstrap -n domain-service-v3
   ```

5. After the Job completes, deploy the User, Orders, and Cart services. Their
   deployments connect to the databases and create their schemas at startup.

## Upgrading from the previous StatefulSet

Do not run a StatefulSet and Deployment against the same SQL data volume at the
same time. Stop and remove the old StatefulSet first:

```sh
kubectl scale statefulset/kfc-sql-server --replicas=0 -n domain-service-v3
kubectl delete statefulset/kfc-sql-server -n domain-service-v3
kubectl delete service/kfc-sql-server-headless -n domain-service-v3 --ignore-not-found
```

The existing claim is named `sql-data-kfc-sql-server-0`; the Deployment reuses
that claim. If it already exists, **do not apply**
`persistent-volume-claim.yml`: a bound PVC's StorageClass cannot be changed.
Applying the new StorageClass is safe, but it only provisions new claims. For a
fresh installation, follow all steps above.

## Notes

- The bootstrap Job creates `users-database`, `orders-database`,
  `cart-database`, and an empty `products-database`. It creates application
  logins only for User, Orders, and Cart.
- The SQL Server image uses the Developer edition, which is for development
  and testing, not production.

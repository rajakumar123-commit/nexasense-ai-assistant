# RBAC & Identity Seeding — System Design (v2)

## Execution Flow
The authentication system is now integrated into the `server.js` startup via the `seedAuth.mjs` utility to ensure your RBAC architecture is always defined.

1.  **Initial Connection**: `server.js` establishes a connection to PostgreSQL.
2.  **Auth Seeding**: Dynamic execution of `seedAuth()`.
3.  **Entity Resolution**:
    *   **Roles**: Pro-visions 'admin' and 'user' roles idempotently.
    *   **Permissions**: Defines granular actions like `admin:access`, `doc:upload`.
    *   **Mapping**: Links permissions to their respective roles in `role_permissions`.
4.  **Admin Provisioning**: Creates/verified the root admin account using `ADMIN_EMAIL` and `ADMIN_PASSWORD`, linking it to the newly created `role_id`.
5.  **Graceful Degeneracy**: Failures are logged as JSON but do not block the API server bind.

---

## 2. Senior Implementation Guidelines

### RBAC Schema Design
For scalability, we recommend transitioning to this normalized structure:

```sql
-- Managed Roles
CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(50) UNIQUE NOT NULL, -- e.g., 'admin', 'user', 'moderator'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Granular Permissions
CREATE TABLE permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) UNIQUE NOT NULL, -- e.g., 'doc:upload', 'user:delete'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Role-Permission Mapping
CREATE TABLE role_permissions (
  role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);
```

### Password Rotation Strategy
*   **ADMIN_FORCE_RESET**: Setting this flag to `true` allows high-security environments to rotate root credentials via CI/CD by simply updating the environment variable, triggering a re-hash at runtime.

### Docker Secrets Integration
*   The system implements the `_FILE` suffix pattern, commonly used in orchestrated environments like Swarm or Kubernetes to read sensitive data from memory-mounted filesystems instead of potentially insecure environment variables.

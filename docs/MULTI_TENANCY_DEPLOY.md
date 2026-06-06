# Multi-tenancy deploy runbook

This document walks through deploying the multi-tenant foundation introduced
in the `add_multi_tenancy_foundation` migration, and provisioning the second
organization ("1xl") on top of the existing JJF India deployment.

The changes are designed so that **JJF India keeps working unchanged** once
the migration is applied — every existing row is backfilled to organization
id=1 (slug `jjfindia`).

---

## 0. Pre-flight (do this once)

- Take a full MySQL dump of the production DB. The migration alters every
  major table; rolling back without a backup is painful.

  ```bash
  mysqldump -u <user> -p <db_name> > taskflow_pre_multi_tenant.sql
  ```

- Bump server memory if hot — the FK additions hold a metadata lock
  briefly on each table.

---

## 1. Deploy the backend code

On the server:

```bash
cd /path/to/taskflow-backend
git pull origin main
npm install                    # picks up any new deps
npx prisma generate            # regenerate the Prisma client
npx prisma migrate deploy      # apply the multi-tenancy migration
npm run build                  # compile TS
pm2 restart taskflow-api       # or systemctl restart, however you run it
```

After `prisma migrate deploy` finishes you should see one new migration
applied: `20260606120000_add_multi_tenancy_foundation`.

**Sanity check:** open the DB and run:

```sql
SELECT * FROM organizations;
-- expect 1 row: (1, 'jjfindia', 'JJF India', 'active', ...)

SELECT organization_id, COUNT(*) FROM users GROUP BY organization_id;
-- every existing user should be in org 1
```

If the counts look right, JJF India should be accessible as before — log
in with the existing super_admin credentials and confirm dashboards load.

---

## 2. Seed the second organization (1xl)

Run from the server shell. **Pick a strong password — this is the founding
admin account for that tenant.**

PowerShell:

```powershell
$env:ORG_SLUG="1xl"
$env:ORG_NAME="1XL Pvt Ltd"
$env:SUPER_ADMIN_EMAIL="admin@1xl.com"
$env:SUPER_ADMIN_PASSWORD="<strong-password-you-choose>"
$env:SUPER_ADMIN_NAME="1XL Super Admin"
npx ts-node prisma/seed.organization.ts
```

Bash:

```bash
ORG_SLUG=1xl \
ORG_NAME="1XL Pvt Ltd" \
SUPER_ADMIN_EMAIL=admin@1xl.com \
SUPER_ADMIN_PASSWORD="<strong-password-you-choose>" \
SUPER_ADMIN_NAME="1XL Super Admin" \
npx ts-node prisma/seed.organization.ts
```

Expected output:

```
[seed-org] organization ready: id=2 slug=1xl name=1XL Pvt Ltd
[seed-org] super_admin created: admin@1xl.com (in org "1xl")
[seed-org] organization_settings ready for org id=2
```

The password is NOT printed. Store it in a password manager and share with
1xl's super_admin out-of-band.

---

## 3. Deploy the frontends

Both `taskflow-super-admin` and `taskflow-employee` have been updated with
a login-screen org picker so users can log in to the right tenant before
subdomains are configured.

```bash
cd /path/to/taskflow-super-admin
git pull origin main
npm install
npm run build
pm2 restart taskflow-super-admin

cd /path/to/taskflow-employee
git pull origin main
npm install
npm run build
pm2 restart taskflow-employee
```

---

## 4. Smoke test both tenants

JJF India:
- Go to your existing super-admin URL → login screen now shows the org
  picker → pick **JJF India** → enter existing super_admin credentials →
  expect to land on the dashboard with all existing data.

1xl:
- Same URL → pick **1XL** → enter `admin@1xl.com` + the seeded password.
- Expect an empty dashboard (no departments, no users, no tasks yet) — the
  1xl super_admin starts with a clean slate.
- Create a department, add a user, assign a task — verify everything
  works just like JJF.

Cross-tenant check (the most important verification):
- While logged in as 1xl super_admin, open the URL `/users/1` (or whatever
  user id you know exists in JJF). The backend should return 404, not
  the JJF user's data.

---

## 5. Future: switch to subdomain routing

This deploy uses a login-screen dropdown to pick the org. When you're
ready to switch to per-subdomain access (`jjfindia.your-domain.com` and
`1xl.your-domain.com`):

1. Configure DNS wildcard: `*.your-domain.com → your server IP`.
2. Update reverse proxy (nginx / Caddy) to forward any subdomain to the
   frontend container, preserving the `Host` header.
3. Add a Next.js middleware that reads `headers.host`, extracts the slug,
   and pre-fills the login form / hides the org picker.
4. Update the auth flow to send `orgSlug` automatically from the host
   instead of the dropdown selection.

No backend changes are required for this transition — the API already
accepts `orgSlug` in the login request body.

---

## Rollback plan

If something blows up after the migration and you need to roll back:

1. `pm2 stop` all three apps.
2. Restore the pre-migration MySQL dump:
   ```bash
   mysql -u <user> -p <db_name> < taskflow_pre_multi_tenant.sql
   ```
3. `git checkout <previous-commit>` on each repo, then rebuild & restart.

This reverts both the schema and the application code in lock-step. If
you've already let 1xl users log in and create data, that data will be
lost — rollback is only safe before any new tenant goes live.

# TaskFlow Backend

Production-ready REST + Socket.IO backend for the TaskFlow task management system. Serves both the `taskflow-super-admin` and `taskflow-employee` frontends with role-based access control.

## Tech Stack

- **Runtime:** Node.js 18+
- **Framework:** Express.js with TypeScript
- **Database:** MySQL 8.0
- **ORM:** Prisma
- **Auth:** JWT (access + refresh tokens)
- **Real-time:** Socket.IO
- **Validation:** Zod

## Quick Start

### 1. Start MySQL (via Docker)

```bash
docker-compose up -d
# Wait for MySQL to be healthy
docker-compose ps
```

Or use your own MySQL — just update `DATABASE_URL` in `.env`.

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment

```bash
cp .env.example .env
# Edit .env if needed (defaults work with docker-compose)
```

### 4. Setup database

```bash
# Generate Prisma client
npm run prisma:generate

# Run migrations (creates tables)
npm run prisma:migrate -- --name init

# Seed with demo data
npm run prisma:seed
```

### 5. Start the server

```bash
npm run dev
# Server: http://localhost:5000
# WebSocket: ws://localhost:5000
```

## Demo Credentials

All users have password: `password`

| Role | Email |
|------|-------|
| Super Admin | `admin@taskflow.com` |
| Team Leader (Development) | `arjun@acme.com` |
| Team Leader (Content) | `priya@acme.com` |
| Team Leader (Graphic Design) | `neha@acme.com` |
| Employee (Development) | `ananya@acme.com` |
| Employee (Content) | `sneha@acme.com` |

## Folder Structure

```
taskflow-backend/
├── src/
│   ├── config/
│   │   ├── env.ts              # Environment variables
│   │   └── prisma.ts           # Prisma client singleton
│   ├── middleware/
│   │   ├── auth.ts             # JWT auth middleware
│   │   ├── roleCheck.ts        # Role-based access control
│   │   └── errorHandler.ts     # Global error handler
│   ├── modules/
│   │   ├── auth/               # Login, register, refresh, me
│   │   ├── users/              # CRUD + profile
│   │   ├── departments/        # CRUD + assign leader
│   │   ├── tasks/              # CRUD + start/complete + comments
│   │   ├── reports/            # Submit + approve/reject flow
│   │   ├── chat/               # Conversations + messages
│   │   ├── notifications/      # List + mark read
│   │   ├── activity/           # Audit log (Super Admin only)
│   │   └── analytics/          # Dashboard stats
│   ├── sockets/
│   │   └── index.ts            # Socket.IO server + event emitters
│   ├── utils/
│   │   ├── jwt.ts              # Token sign/verify
│   │   ├── password.ts         # Bcrypt hashing
│   │   ├── response.ts         # Standard JSON responses
│   │   └── asyncHandler.ts     # Controller wrapper
│   ├── app.ts                  # Express app config
│   └── index.ts                # Server entry point
├── prisma/
│   ├── schema.prisma           # Full database schema
│   └── seed.ts                 # Seed demo data
├── .env.example
├── docker-compose.yml          # MySQL container
├── package.json
└── tsconfig.json
```

## Module Pattern

Each module follows the same structure:

```
modules/<feature>/
├── <feature>.service.ts     # Business logic + Prisma queries
├── <feature>.controller.ts  # HTTP handlers + validation
└── <feature>.routes.ts      # Route definitions + middleware
```

## API Endpoints

### Auth (`/api/auth`)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/login` | - | Login with email/password |
| POST | `/refresh-token` | - | Refresh access token |
| POST | `/logout` | ✓ | Invalidate refresh token |
| GET | `/me` | ✓ | Current user info |
| POST | `/register` | Super Admin | Create new user |

### Departments (`/api/departments`)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/` | ✓ | List all departments |
| GET | `/:id` | ✓ | Department details |
| GET | `/:id/members` | ✓ | Department members |
| POST | `/` | Super Admin | Create department |
| PUT | `/:id` | Super Admin | Update department |
| DELETE | `/:id` | Super Admin | Delete department |
| PUT | `/:id/assign-leader` | Super Admin | Assign Team Leader |

### Users (`/api/users`)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/me/profile` | ✓ | My profile |
| PUT | `/me/profile` | ✓ | Update my profile |
| GET | `/` | ✓ | List users (scoped by role) |
| GET | `/:id` | ✓ | User details |
| POST | `/` | Super Admin | Create user |
| PUT | `/:id` | Super Admin | Update user |
| PUT | `/:id/status` | Super Admin | Activate/deactivate |
| DELETE | `/:id` | Super Admin | Delete user |

### Tasks (`/api/tasks`)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/` | ✓ | List tasks (scoped by role) |
| GET | `/:id` | ✓ | Task details |
| POST | `/` | TL+ | Create task |
| PUT | `/:id` | TL+ | Update task |
| DELETE | `/:id` | TL+ | Delete task |
| PUT | `/:id/start` | ✓ | Start task (assignee only) |
| PUT | `/:id/complete` | ✓ | Complete task (assignee only) |
| GET | `/:id/comments` | ✓ | List comments |
| POST | `/:id/comments` | ✓ | Add comment |
| POST | `/:id/attachments` | ✓ | Upload attachment |

### Reports (`/api/reports`)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/` | ✓ | List reports (scoped by role) |
| GET | `/:id` | ✓ | Report details |
| POST | `/` | ✓ | Submit report |
| GET | `/pending-approval` | TL | Reports awaiting TL approval |
| GET | `/approved` | Super Admin | Approved reports visible to SA |
| PUT | `/:id/approve` | TL | Approve report |
| PUT | `/:id/reject` | TL | Reject report with comment |

### Chat (`/api/conversations`)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/` | ✓ | List my conversations |
| POST | `/` | ✓ | Create conversation |
| GET | `/:id/messages` | ✓ | Get messages |
| POST | `/:id/messages` | ✓ | Send message |
| PUT | `/:id/read` | ✓ | Mark as read |

### Notifications (`/api/notifications`)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/` | ✓ | List notifications |
| GET | `/unread-count` | ✓ | Unread count |
| PUT | `/:id/read` | ✓ | Mark one as read |
| PUT | `/read-all` | ✓ | Mark all as read |

### Analytics (`/api/analytics`) — Super Admin only
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/dashboard` | Dashboard stats |
| GET | `/tasks-by-department` | Chart data |
| GET | `/top-performers` | Top employees |

### Activity Logs (`/api/activity-logs`) — Super Admin only
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Audit trail |

## Role-Based Scoping

The backend automatically enforces scoping based on the JWT role:

- **Super Admin**: Sees all data across all departments
- **Team Leader**: Sees only their department's data (users, tasks, reports)
- **Employee**: Sees only their own tasks and reports

Reports have an extra approval flow: Super Admin only sees reports where `approvalStatus = 'approved'` AND `visibleToSuperAdmin = true`.

## Socket.IO Events

Client connects with JWT token:

```js
const socket = io('http://localhost:5000', { auth: { token: accessToken } });
```

### Server emits:
- `task:assigned` — to each assignee's user room
- `task:started` / `task:completed` — to department room + super admin
- `task:commented` — to all task participants
- `report:submitted` — to TL of author's department
- `report:approved` / `report:rejected` — to report author
- `message:new` — to conversation room
- `notification:new` — to specific user

### Client emits:
- `chat:join` / `chat:leave` — manage conversation rooms
- `chat:typing` — typing indicator

## Scripts

```bash
npm run dev                   # Development server with auto-reload
npm run build                 # Compile TypeScript to dist/
npm run start                 # Run production build
npm run prisma:generate       # Generate Prisma client
npm run prisma:migrate        # Run migrations
npm run prisma:migrate:deploy # Deploy migrations (production)
npm run prisma:studio         # Open Prisma Studio (DB GUI)
npm run prisma:seed           # Seed demo data
```

## Connecting Frontends

Both frontends (`taskflow-super-admin` and `taskflow-employee`) should set:

```
NEXT_PUBLIC_API_URL=http://localhost:5000/api
NEXT_PUBLIC_SOCKET_URL=http://localhost:5000
```

In each frontend's service file, replace the mock data returns with real `api.get(...)` / `api.post(...)` calls. The endpoints are already defined in `src/constants/index.ts`.

## Security Notes

**Before deploying to production:**

1. Generate strong secrets for `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` (use `openssl rand -base64 64`)
2. Set `NODE_ENV=production` in `.env`
3. Use a managed MySQL (RDS, Aiven, etc.) — don't run Docker MySQL in production
4. Run `npm run prisma:migrate:deploy` (not `migrate:dev`) in production
5. Set up HTTPS (nginx or cloud load balancer)
6. Review CORS_ORIGINS to only allow production domains
7. Consider adding: Sentry for error tracking, Winston for logging, Redis for session/cache

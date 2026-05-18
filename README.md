# OXO Carriers Backend - Express + TypeScript + Drizzle ORM

Backend API for OXO Carriers HRIS & Payroll system built with Express, TypeScript, PostgreSQL, and Drizzle ORM.

## Tech Stack

- **Runtime**: Node.js 20+
- **Framework**: Express.js
- **Language**: TypeScript
- **Database**: PostgreSQL 16
- **ORM**: Drizzle ORM
- **Authentication**: JWT + bcrypt
- **Validation**: Zod
- **Testing**: Vitest

## Project Structure

```
src/
├── db/
│   ├── schema/              # Drizzle schema definitions
│   │   ├── users.ts         # User accounts
│   │   ├── permissions.ts   # RBAC permissions
│   │   ├── leaves.ts        # Leave management
│   │   ├── salary.ts        # Salary structures
│   │   ├── facilities.ts    # Facility bookings
│   │   ├── medical.ts       # Medical insurance
│   │   ├── consultant.ts    # Consultant submissions
│   │   ├── vendors.ts       # Vendor management
│   │   ├── vouchers.ts      # Payment vouchers
│   │   └── audit.ts         # Audit logs
│   └── index.ts             # Database connection
├── controllers/             # Request handlers
├── routes/                  # API routes
├── middleware/              # Express middleware
├── services/                # Business logic
├── utils/                   # Helper functions
├── scripts/                 # Database scripts
├── types/                   # TypeScript types
└── app.ts                   # Application entry point
```

## Prerequisites

- Node.js 20+
- pnpm 8+
- PostgreSQL 16+ (local or Docker)

## Setup

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Environment Configuration

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_password
DB_NAME=oxo_carriers

# Application
PORT=5000
NODE_ENV=development
JWT_SECRET=your-secret-key

# Email
SENDGRID_API_KEY=your_sendgrid_key
```

### 3. Database Setup

**Option A: Using Docker**
```bash
docker-compose up postgres -d
```

**Option B: Local PostgreSQL**

Install PostgreSQL and create database:
```sql
CREATE DATABASE oxo_carriers;
```

### 4. Push Schema & Seed Data

```bash
# Push schema to database
pnpm db:push

# Seed initial data (creates super admin and default values)
pnpm db:seed
```

## Development

### Start Development Server

```bash
pnpm dev
```

Server runs at `http://localhost:5000`

### Database Management

```bash
# Generate migration files
pnpm db:generate

# Push schema changes (dev)
pnpm db:push

# Run migrations (production)
pnpm db:migrate

# Open Drizzle Studio (visual editor)
pnpm db:studio
```

### Scripts

```bash
pnpm dev                 # Start dev server with hot reload
pnpm build               # Build TypeScript
pnpm start               # Run production build
pnpm test                # Run tests
pnpm test:watch          # Watch mode
pnpm test:coverage       # Coverage report
pnpm create:superadmin   # Create super admin user
pnpm test:email          # Test email configuration
```

## API Documentation

### Base URL
```
http://localhost:5000/api
```

### Authentication

Most endpoints require JWT token in Authorization header:
```
Authorization: Bearer <token>
```

### Endpoints

#### Auth
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login
- `POST /api/auth/verify-email` - Verify email
- `POST /api/auth/forgot-password` - Request password reset
- `POST /api/auth/reset-password` - Reset password

#### Users
- `GET /api/users` - List users
- `GET /api/users/:id` - Get user
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user

#### Leaves
- `GET /api/leaves` - List leave requests
- `POST /api/leaves` - Create leave request
- `PUT /api/leaves/:id` - Update leave request
- `GET /api/leaves/balance` - Get leave balance

#### Salary
- `GET /api/salary` - List salaries
- `POST /api/salary/generate` - Generate monthly salaries
- `GET /api/salary/:id/pdf` - Download salary slip

#### Facilities
- `GET /api/facilities` - List facilities
- `POST /api/facilities/book` - Book facility
- `GET /api/facilities/bookings` - List bookings

#### Medical Insurance
- `GET /api/medical-insurance` - List claims
- `POST /api/medical-insurance` - Submit claim

#### Consultant Submissions
- `GET /api/consultant-submissions` - List submissions
- `POST /api/consultant-submissions` - Create submission

## Docker

### Development
```bash
docker-compose --profile dev up
```

### Production
```bash
docker-compose --profile production up
```

## Testing

```bash
# Run all tests
pnpm test

# Watch mode
pnpm test:watch

# Coverage
pnpm test:coverage
```

## Deployment

### Build

```bash
pnpm build
```

### Environment Variables

Ensure production `.env` has:
- Secure `JWT_SECRET`
- Production database credentials
- Email service API keys
- `NODE_ENV=production`

### Run

```bash
pnpm start
```

## Troubleshooting

### Database Connection Failed

1. Check PostgreSQL is running
2. Verify credentials in `.env`
3. Test connection: `pnpm db:push`

### Port Already in Use

Change `PORT` in `.env` or kill existing process:
```bash
netstat -ano | findstr :5000
taskkill /PID <PID> /F
```

### Migration Issues

Reset database:
```bash
docker-compose down -v
docker-compose up postgres -d
pnpm db:push
pnpm db:seed
```

## Security

- JWT tokens expire in 24 hours
- Passwords hashed with bcrypt
- CORS configured for frontend origin
- Helmet.js for security headers
- Rate limiting on API endpoints
- Input validation with Zod

## License

Proprietary - OXO International FZE

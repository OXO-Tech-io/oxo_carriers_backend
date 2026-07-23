-- OXO Carriers HRIS/Payroll — full current PostgreSQL schema
-- Generated from src/db/schema/*.ts (the source of truth the backend actually
-- runs against). Safe to run as-is against a fresh or existing Google Cloud
-- SQL (PostgreSQL) instance: every statement is idempotent (IF NOT EXISTS /
-- duplicate_object-safe), so re-running it does nothing to tables that
-- already exist.
--
-- Note: drizzle/*.sql history is NOT a reliable source for this - some of
-- those files (e.g. 0002_aspiring_vulture.sql) renamed tables to a "tbl_"
-- prefix that was later abandoned in code; the schema files under
-- src/db/schema/ are what the app actually queries against today.
--
-- Schema target: all objects below are created in the "hris" schema, not
-- "public". On Google Cloud SQL the connecting role usually does not own
-- "public" (Postgres 15+ revokes CREATE on it from everyone but the owner),
-- so a role without superuser/owner rights can never grant itself rights
-- there. Creating a dedicated schema the role does own sidesteps that
-- entirely. The app already supports this: set DB_SCHEMA=hris in its env
-- and src/config/database.ts will `SET search_path TO hris, public` on
-- every connection, so the unqualified table names in src/db/schema/*.ts
-- resolve here without any code changes.

-- ============================================================
-- Schema
-- ============================================================
CREATE SCHEMA IF NOT EXISTS "hris";
SET search_path TO "hris", public;

-- ============================================================
-- Extensions
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- Enums
-- ============================================================
DO $$ BEGIN
  CREATE TYPE "user_role" AS ENUM (
    'super_admin','hr_manager','hr_executive','finance_manager',
    'finance_executive','employee','consultant','service_provider'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "access_level" AS ENUM ('read','write');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "leave_status" AS ENUM (
    'pending','team_leader_approved','hr_approved','rejected','cancelled'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "half_day_period" AS ENUM ('morning','evening');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "component_type" AS ENUM ('earning','deduction');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "salary_status" AS ENUM ('generated','paid','pending');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "facility_type" AS ENUM (
    'workstation','board_room','meeting_room','accommodation'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "booking_status" AS ENUM ('pending','confirmed','cancelled','completed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "claim_type" AS ENUM ('IN','OPD');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "claim_status" AS ENUM ('pending','approved','rejected');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "submission_status" AS ENUM ('pending','approved','rejected');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "voucher_status" AS ENUM ('pending','approved','rejected','paid');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "voucher_type" AS ENUM ('employee','vendor');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "qualification_level" AS ENUM (
    'certificate','advanced_certificate','diploma','advanced_diploma',
    'degree','postgraduate_diploma','masters','mphil','phd'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "profile_change_status" AS ENUM (
    'pending_approval','approved','rejected','returned_for_modification','cancelled'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================
-- Core: users
-- ============================================================
CREATE TABLE IF NOT EXISTS "users" (
  "id" serial PRIMARY KEY,
  "employee_id" varchar(50) UNIQUE,
  "email" varchar(100) NOT NULL UNIQUE,
  "password" varchar(255),
  "keycloak_sub" varchar(255),
  "first_name" varchar(100) NOT NULL,
  "last_name" varchar(100) NOT NULL,
  "email_verified" boolean DEFAULT false,
  "email_verification_token" varchar(255),
  "role" "user_role" NOT NULL,
  "department" varchar(100),
  "position" varchar(100),
  "hourly_rate" numeric(10,2),
  "bank_name" varchar(150),
  "account_holder_name" varchar(150),
  "account_number" varchar(80),
  "bank_branch" varchar(150),
  "company_name" varchar(200),
  "contact_number" varchar(30),
  "hire_date" date,
  "undergraduate_degree_completion_date" date,
  "manager_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "must_change_password" boolean DEFAULT false,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

-- ============================================================
-- Employee PII (encrypted at rest via pgp_sym_encrypt/pgp_sym_decrypt)
-- ============================================================
CREATE TABLE IF NOT EXISTS "tbl_employee_pii" (
  "id" serial PRIMARY KEY,
  "employee_id" varchar(50) NOT NULL UNIQUE
    REFERENCES "users"("employee_id") ON DELETE CASCADE ON UPDATE CASCADE,
  "passport_number" bytea,
  "national_id" bytea,
  "address" bytea,
  "emergency_contact_name" bytea,
  "emergency_contact_phone" bytea,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

-- ============================================================
-- Permissions
-- ============================================================
CREATE TABLE IF NOT EXISTS "user_permissions" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "permission_key" varchar(100) NOT NULL,
  "access_level" "access_level" NOT NULL DEFAULT 'read',
  "assigned_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

-- ============================================================
-- Leave management
-- ============================================================
CREATE TABLE IF NOT EXISTS "leave_types" (
  "id" serial PRIMARY KEY,
  "name" varchar(50) NOT NULL,
  "description" text,
  "max_days" integer NOT NULL,
  "is_active" boolean DEFAULT true,
  "created_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "employee_leave_balance" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "leave_type_id" integer NOT NULL REFERENCES "leave_types"("id") ON DELETE CASCADE,
  "total_days" numeric(5,2) DEFAULT 0,
  "used_days" numeric(5,2) DEFAULT 0,
  "remaining_days" numeric(5,2) DEFAULT 0,
  "year" integer NOT NULL,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "leave_requests" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "leave_type_id" integer NOT NULL REFERENCES "leave_types"("id") ON DELETE CASCADE,
  "start_date" date NOT NULL,
  "end_date" date NOT NULL,
  "total_days" numeric(5,2) NOT NULL,
  "is_half_day" boolean DEFAULT false,
  "half_day_period" "half_day_period",
  "reason" text,
  "status" "leave_status" DEFAULT 'pending',
  "team_leader_approval_date" timestamp,
  "hr_approval_date" timestamp,
  "rejection_reason" text,
  "attachment_url" varchar(500),
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "leave_calendar" (
  "id" serial PRIMARY KEY,
  "date" date NOT NULL UNIQUE,
  "name" varchar(255) NOT NULL,
  "description" text,
  "is_recurring" boolean DEFAULT false,
  "year" integer,
  "created_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

-- ============================================================
-- Salary / payroll
-- ============================================================
CREATE TABLE IF NOT EXISTS "salary_components" (
  "id" serial PRIMARY KEY,
  "name" varchar(100) NOT NULL,
  "type" "component_type" NOT NULL,
  "is_default" boolean DEFAULT false,
  "is_active" boolean DEFAULT true,
  "created_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "employee_salary_structure" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "component_id" integer NOT NULL REFERENCES "salary_components"("id") ON DELETE CASCADE,
  "amount" numeric(10,2) NOT NULL,
  "is_percentage" boolean DEFAULT false,
  "percentage_of" varchar(100),
  "effective_date" date NOT NULL,
  "end_date" date,
  "created_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "monthly_salaries" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "month_year" date NOT NULL,
  "basic_salary" numeric(10,2) NOT NULL,
  "local_salary" numeric(10,2) DEFAULT 0,
  "oxo_international_salary" numeric(10,2) DEFAULT 0,
  "total_earnings" numeric(10,2) NOT NULL,
  "total_deductions" numeric(10,2) NOT NULL,
  "net_salary" numeric(10,2) NOT NULL,
  "status" "salary_status" DEFAULT 'generated',
  "generated_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "paid_date" date,
  "pdf_url" varchar(500),
  "created_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "salary_slip_details" (
  "id" serial PRIMARY KEY,
  "salary_id" integer NOT NULL REFERENCES "monthly_salaries"("id") ON DELETE CASCADE,
  "component_id" integer NOT NULL REFERENCES "salary_components"("id") ON DELETE CASCADE,
  "amount" numeric(10,2) NOT NULL,
  "type" "component_type" NOT NULL
);

-- ============================================================
-- Facilities
-- ============================================================
CREATE TABLE IF NOT EXISTS "facilities" (
  "id" serial PRIMARY KEY,
  "name" varchar(100) NOT NULL,
  "type" "facility_type" NOT NULL,
  "description" text,
  "facilities" text,
  "capacity" integer DEFAULT 1,
  "is_active" boolean DEFAULT true,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "facility_bookings" (
  "id" serial PRIMARY KEY,
  "facility_id" integer NOT NULL REFERENCES "facilities"("id") ON DELETE CASCADE,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "start_time" timestamp NOT NULL,
  "end_time" timestamp NOT NULL,
  "purpose" text,
  "status" "booking_status" DEFAULT 'confirmed',
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

-- ============================================================
-- Medical insurance claims
-- ============================================================
CREATE TABLE IF NOT EXISTS "medical_insurance_claims" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "type" "claim_type" NOT NULL,
  "quarter" varchar(10) NOT NULL,
  "amount" numeric(12,2) NOT NULL,
  "status" "claim_status" DEFAULT 'pending',
  "supportive_document_url" varchar(500) NOT NULL,
  "relevant_document_url" varchar(500),
  "admin_comment" text,
  "reviewed_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "reviewed_at" timestamp,
  "resubmission_of" integer,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

-- ============================================================
-- Consultant work submissions
-- ============================================================
CREATE TABLE IF NOT EXISTS "consultant_work_submissions" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "project" varchar(255) NOT NULL,
  "tech" varchar(255) NOT NULL,
  "total_hours" numeric(10,2) NOT NULL,
  "comment" text,
  "log_sheet_url" varchar(500) NOT NULL,
  "status" "submission_status" DEFAULT 'pending',
  "admin_comment" text,
  "reviewed_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "reviewed_at" timestamp,
  "resubmission_of" integer,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

-- ============================================================
-- Vendors & payment vouchers
-- ============================================================
CREATE TABLE IF NOT EXISTS "vendors" (
  "id" serial PRIMARY KEY,
  "email" varchar(255) NOT NULL,
  "company_name" varchar(200) NOT NULL,
  "contact_number" varchar(30),
  "bank_name" varchar(150),
  "account_holder_name" varchar(150),
  "account_number" varchar(80),
  "bank_branch" varchar(150),
  "service_type" varchar(150),
  "notes" text,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "payment_vouchers" (
  "id" serial PRIMARY KEY,
  "voucher_type" "voucher_type" NOT NULL,
  "user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "vendor_id" integer REFERENCES "vendors"("id") ON DELETE SET NULL,
  "amount" numeric(12,2) NOT NULL,
  "description" text NOT NULL,
  "invoice_number" varchar(100),
  "invoice_date" date,
  "due_date" date,
  "status" "voucher_status" DEFAULT 'pending',
  "attachment_url" varchar(500),
  "reviewed_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "reviewed_at" timestamp,
  "paid_date" date,
  "payment_reference" varchar(200),
  "notes" text,
  "created_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

-- ============================================================
-- Audit log
-- ============================================================
CREATE TABLE IF NOT EXISTS "audit_logs" (
  "id" serial PRIMARY KEY,
  "user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "action" varchar(100) NOT NULL,
  "table_name" varchar(100),
  "record_id" integer,
  "old_values" json,
  "new_values" json,
  "ip_address" varchar(45),
  "user_agent" text,
  "created_at" timestamp DEFAULT now()
);

-- ============================================================
-- Employee education & work history (Profile Change Workflow)
-- ============================================================
CREATE TABLE IF NOT EXISTS "employee_education" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "qualification_level" "qualification_level" NOT NULL,
  "qualification_title" varchar(255) NOT NULL,
  "awarding_institution" varchar(255) NOT NULL,
  "date_awarded" date,
  "remarks" text,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "employee_work_history" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "organization" varchar(255) NOT NULL,
  "position_held" varchar(255) NOT NULL,
  "start_date" date NOT NULL,
  "end_date" date,
  "remarks" text,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "profile_change_requests" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "submitted_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "status" "profile_change_status" DEFAULT 'pending_approval',
  "changes" json NOT NULL,
  "comments" text,
  "reviewer_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "reviewer_comments" text,
  "decided_at" timestamp,
  "previous_request_id" integer,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

-- ============================================================
-- Notifications & attachments
-- ============================================================
CREATE TABLE IF NOT EXISTS "notifications" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "type" varchar(100) NOT NULL,
  "title" varchar(255) NOT NULL,
  "message" text NOT NULL,
  "payload" json,
  "link" varchar(500),
  "is_read" boolean DEFAULT false,
  "read_at" timestamp,
  "created_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "attachments" (
  "id" serial PRIMARY KEY,
  "entity_type" varchar(100) NOT NULL,
  "entity_id" integer NOT NULL,
  "file_url" varchar(500) NOT NULL,
  "file_name" varchar(255) NOT NULL,
  "mime_type" varchar(150),
  "file_size" integer,
  "uploaded_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now()
);

-- ============================================================================
-- OXO Carriers - full "hris" schema, consolidated.
--
-- Tables through the CREATE TYPE + first 51 CREATE TABLE blocks below are
-- generated straight from the app's Drizzle ORM schema (src/db/schema/*) via
-- `drizzle-kit generate` against an empty snapshot, so every column type,
-- default, and constraint reflects exactly what the running app expects.
--
-- The remaining tables (marked below) exist only as hand-written SQL in
-- drizzle/0013_add_attendance_tracking.sql and drizzle/0014_add_desktop_agent.sql
-- - they have no Drizzle model because the app doesn't read/write them yet
-- (the fuller time-tracker they belong to is unbuilt). Transcribed verbatim
-- from those migration files, schema-qualified to match the rest of this file.
--
-- All tables AND enum types live in the "hris" schema (not "public") - a
-- role that owns "hris" but lacks CREATE on "public" (the default on managed
-- Postgres since PG15) can still run this end to end.
--
-- This file drops everything it's about to create first, so it can be run
-- again from scratch at any time without manually clearing state.
-- ============================================================================

-- ============================================================================
-- Reset: drop everything below before recreating it, so this file is a
-- self-contained, re-runnable "wipe and rebuild" script. Tables drop in
-- reverse creation order (dependents before what they reference); enum
-- types drop after, since a type can't go while a column still uses it.
-- CASCADE on the table drops is a safety net, not a requirement - it should
-- never actually fire if this list and the create section below stay in
-- sync (both are generated together, see build notes at the bottom).
-- ============================================================================

DROP TABLE IF EXISTS "hris"."tbl_attendance_agent_tokens" CASCADE;
DROP TABLE IF EXISTS "hris"."tbl_attendance_agent_pairing_codes" CASCADE;
DROP TABLE IF EXISTS "hris"."tbl_employee_productivity_summary" CASCADE;
DROP TABLE IF EXISTS "hris"."tbl_employee_daily_summary" CASCADE;
DROP TABLE IF EXISTS "hris"."tbl_employee_idle_logs" CASCADE;
DROP TABLE IF EXISTS "hris"."tbl_employee_activity_logs" CASCADE;
DROP TABLE IF EXISTS "hris"."tbl_attendance_settings" CASCADE;
DROP TABLE IF EXISTS "hris"."tbl_documents" CASCADE;
DROP TABLE IF EXISTS "hris"."tbl_document_recipients" CASCADE;
DROP TABLE IF EXISTS "hris"."tbl_attendance" CASCADE;
DROP TABLE IF EXISTS "hris"."tbl_notices" CASCADE;
DROP TABLE IF EXISTS "hris"."tbl_groups" CASCADE;
DROP TABLE IF EXISTS "hris"."tbl_group_members" CASCADE;
DROP TABLE IF EXISTS "hris"."tbl_work_log_settings" CASCADE;
DROP TABLE IF EXISTS "hris"."tbl_work_logs" CASCADE;
DROP TABLE IF EXISTS "hris"."tbl_forms" CASCADE;
DROP TABLE IF EXISTS "hris"."tbl_form_theme" CASCADE;
DROP TABLE IF EXISTS "hris"."tbl_form_settings" CASCADE;
DROP TABLE IF EXISTS "hris"."tbl_form_sections" CASCADE;
DROP TABLE IF EXISTS "hris"."tbl_form_responses" CASCADE;
DROP TABLE IF EXISTS "hris"."tbl_form_response_answers" CASCADE;
DROP TABLE IF EXISTS "hris"."tbl_form_questions" CASCADE;
DROP TABLE IF EXISTS "hris"."tbl_form_question_options" CASCADE;
DROP TABLE IF EXISTS "hris"."tbl_form_logic_rules" CASCADE;
DROP TABLE IF EXISTS "hris"."tbl_form_distributions" CASCADE;
DROP TABLE IF EXISTS "hris"."tbl_events" CASCADE;
DROP TABLE IF EXISTS "hris"."tbl_event_participants" CASCADE;
DROP TABLE IF EXISTS "hris"."tbl_communications" CASCADE;
DROP TABLE IF EXISTS "hris"."tbl_communication_recipients" CASCADE;
DROP TABLE IF EXISTS "hris"."tbl_employee_notes" CASCADE;
DROP TABLE IF EXISTS "hris"."tbl_attachments" CASCADE;
DROP TABLE IF EXISTS "hris"."tbl_notifications" CASCADE;
DROP TABLE IF EXISTS "hris"."tbl_profile_change_requests" CASCADE;
DROP TABLE IF EXISTS "hris"."tbl_employee_welfare_info" CASCADE;
DROP TABLE IF EXISTS "hris"."tbl_employee_emergency_contacts" CASCADE;
DROP TABLE IF EXISTS "hris"."tbl_employee_dependents" CASCADE;
DROP TABLE IF EXISTS "hris"."tbl_employee_nominees" CASCADE;
DROP TABLE IF EXISTS "hris"."tbl_employee_work_history" CASCADE;
DROP TABLE IF EXISTS "hris"."tbl_employee_education" CASCADE;
DROP TABLE IF EXISTS "hris"."tbl_audit_logs" CASCADE;
DROP TABLE IF EXISTS "hris"."tbl_payment_vouchers" CASCADE;
DROP TABLE IF EXISTS "hris"."tbl_vendors" CASCADE;
DROP TABLE IF EXISTS "hris"."tbl_consultant_work_submissions" CASCADE;
DROP TABLE IF EXISTS "hris"."tbl_medical_insurance_claims" CASCADE;
DROP TABLE IF EXISTS "hris"."tbl_facility_bookings" CASCADE;
DROP TABLE IF EXISTS "hris"."tbl_facilities" CASCADE;
DROP TABLE IF EXISTS "hris"."tbl_salary_slip_details" CASCADE;
DROP TABLE IF EXISTS "hris"."tbl_salary_components" CASCADE;
DROP TABLE IF EXISTS "hris"."tbl_monthly_salaries" CASCADE;
DROP TABLE IF EXISTS "hris"."tbl_employee_salary_structure" CASCADE;
DROP TABLE IF EXISTS "hris"."tbl_leave_types" CASCADE;
DROP TABLE IF EXISTS "hris"."tbl_leave_requests" CASCADE;
DROP TABLE IF EXISTS "hris"."tbl_leave_calendar" CASCADE;
DROP TABLE IF EXISTS "hris"."tbl_employee_leave_balance" CASCADE;
DROP TABLE IF EXISTS "hris"."tbl_user_permissions" CASCADE;
DROP TABLE IF EXISTS "hris"."tbl_employee_pii" CASCADE;
DROP TABLE IF EXISTS "hris"."tbl_employee_type" CASCADE;
DROP TABLE IF EXISTS "hris"."tbl_employee" CASCADE;

DROP TYPE IF EXISTS "hris"."form_status";
DROP TYPE IF EXISTS "hris"."form_response_status";
DROP TYPE IF EXISTS "hris"."form_question_type";
DROP TYPE IF EXISTS "hris"."form_logic_comparator";
DROP TYPE IF EXISTS "hris"."form_logic_combinator";
DROP TYPE IF EXISTS "hris"."form_logic_action";
DROP TYPE IF EXISTS "hris"."profile_change_status";
DROP TYPE IF EXISTS "hris"."dependent_relationship";
DROP TYPE IF EXISTS "hris"."employment_type";
DROP TYPE IF EXISTS "hris"."qualification_level";
DROP TYPE IF EXISTS "hris"."voucher_type";
DROP TYPE IF EXISTS "hris"."voucher_status";
DROP TYPE IF EXISTS "hris"."submission_status";
DROP TYPE IF EXISTS "hris"."claim_type";
DROP TYPE IF EXISTS "hris"."claim_status";
DROP TYPE IF EXISTS "hris"."facility_type";
DROP TYPE IF EXISTS "hris"."booking_status";
DROP TYPE IF EXISTS "hris"."salary_status";
DROP TYPE IF EXISTS "hris"."component_type";
DROP TYPE IF EXISTS "hris"."leave_status";
DROP TYPE IF EXISTS "hris"."half_day_period";
DROP TYPE IF EXISTS "hris"."access_level";
DROP TYPE IF EXISTS "hris"."marital_status";
DROP TYPE IF EXISTS "hris"."employee_sex";
DROP TYPE IF EXISTS "hris"."user_title";
DROP TYPE IF EXISTS "hris"."user_role";
DROP TYPE IF EXISTS "hris"."employee_status";

-- ============================================================================
-- Rebuild
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS "hris";

-- Every column type reference below is unqualified (e.g. "user_role", not
-- "hris"."user_role") - this makes sure they resolve against hris rather
-- than whatever the connecting client's default search_path happens to be.
SET search_path TO hris, public;

CREATE TYPE "hris"."employee_status" AS ENUM('active', 'inactive', 'on_hold');
CREATE TYPE "hris"."user_role" AS ENUM('super_admin', 'hr_manager', 'hr_executive', 'finance_manager', 'finance_executive', 'employee', 'consultant', 'service_provider');
CREATE TYPE "hris"."user_title" AS ENUM('mr', 'ms', 'mrs', 'dr', 'prof');
CREATE TYPE "hris"."employee_sex" AS ENUM('male', 'female');
CREATE TYPE "hris"."marital_status" AS ENUM('married', 'single');
CREATE TYPE "hris"."access_level" AS ENUM('read', 'write');
CREATE TYPE "hris"."half_day_period" AS ENUM('morning', 'evening');
CREATE TYPE "hris"."leave_status" AS ENUM('pending', 'team_leader_approved', 'hr_approved', 'rejected', 'cancelled');
CREATE TYPE "hris"."component_type" AS ENUM('earning', 'deduction');
CREATE TYPE "hris"."salary_status" AS ENUM('generated', 'paid', 'pending');
CREATE TYPE "hris"."booking_status" AS ENUM('pending', 'confirmed', 'cancelled', 'completed');
CREATE TYPE "hris"."facility_type" AS ENUM('workstation', 'board_room', 'meeting_room', 'accommodation');
CREATE TYPE "hris"."claim_status" AS ENUM('pending', 'approved', 'rejected');
CREATE TYPE "hris"."claim_type" AS ENUM('IN', 'OPD');
CREATE TYPE "hris"."submission_status" AS ENUM('pending', 'approved', 'rejected');
CREATE TYPE "hris"."voucher_status" AS ENUM('pending', 'approved', 'rejected', 'paid');
CREATE TYPE "hris"."voucher_type" AS ENUM('employee', 'vendor');
CREATE TYPE "hris"."qualification_level" AS ENUM('certificate', 'advanced_certificate', 'diploma', 'advanced_diploma', 'degree', 'postgraduate_diploma', 'masters', 'mphil', 'phd');
CREATE TYPE "hris"."employment_type" AS ENUM('regular', 'intern', 'trainee');
CREATE TYPE "hris"."dependent_relationship" AS ENUM('spouse', 'child');
CREATE TYPE "hris"."profile_change_status" AS ENUM('pending_approval', 'approved', 'rejected', 'returned_for_modification', 'cancelled');
CREATE TYPE "hris"."form_logic_action" AS ENUM('show', 'hide');
CREATE TYPE "hris"."form_logic_combinator" AS ENUM('all', 'any');
CREATE TYPE "hris"."form_logic_comparator" AS ENUM('equals', 'not_equals', 'contains', 'greater_than', 'less_than', 'is_empty', 'is_not_empty');
CREATE TYPE "hris"."form_question_type" AS ENUM('short_answer', 'paragraph', 'multiple_choice', 'checkboxes', 'dropdown', 'file_upload', 'linear_scale', 'multiple_choice_grid', 'checkbox_grid', 'rating', 'date', 'time', 'datetime', 'yes_no', 'email', 'number', 'url', 'section_header', 'rich_text');
CREATE TYPE "hris"."form_response_status" AS ENUM('in_progress', 'submitted');
CREATE TYPE "hris"."form_status" AS ENUM('draft', 'published', 'archived');
CREATE TABLE IF NOT EXISTS "hris"."tbl_employee" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" varchar(50),
	"email" varchar(500) NOT NULL,
	"email_hash" varchar(64) NOT NULL,
	"keycloak_sub" varchar(255),
	"first_name" varchar(500) NOT NULL,
	"last_name" varchar(500) NOT NULL,
	"role" "user_role" NOT NULL,
	"status" "employee_status" DEFAULT 'active' NOT NULL,
	"title" "user_title",
	"employee_type_id" integer,
	"department" varchar(100),
	"position" varchar(100),
	"hourly_rate" varchar(500),
	"bank_name" varchar(500),
	"account_holder_name" varchar(500),
	"account_number" varchar(500),
	"bank_branch" varchar(500),
	"bank_branch_code" varchar(500),
	"swift_code" varchar(500),
	"company_name" varchar(500),
	"contact_number" varchar(500),
	"undergraduate_degree_completion_date" date,
	"hire_date" date,
	"manager_id" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "tbl_employee_employee_id_unique" UNIQUE("employee_id"),
	CONSTRAINT "tbl_employee_email_hash_unique" UNIQUE("email_hash")
);

CREATE TABLE IF NOT EXISTS "hris"."tbl_employee_type" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(50) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "tbl_employee_type_name_unique" UNIQUE("name")
);

CREATE TABLE IF NOT EXISTS "hris"."tbl_employee_pii" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" varchar(50) NOT NULL,
	"passport_number" "bytea",
	"national_id" "bytea",
	"address" "bytea",
	"address_line1" "bytea",
	"address_line2" "bytea",
	"city" "bytea",
	"district" "bytea",
	"blood_type" "bytea",
	"emergency_contact_name" "bytea",
	"emergency_contact_phone" "bytea",
	"emergency_contact_relationship" "bytea",
	"legal_name" "bytea",
	"initials_name" "bytea",
	"date_of_birth" date,
	"birth_place" "bytea",
	"sex" "employee_sex",
	"marital_status" "marital_status",
	"nationality" varchar(100),
	"spouse_name" "bytea",
	"mother_name" "bytea",
	"father_name" "bytea",
	"residing_address_line1" "bytea",
	"residing_address_line2" "bytea",
	"residing_city" "bytea",
	"residing_district" "bytea",
	"landline_number" "bytea",
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "tbl_employee_pii_employee_id_unique" UNIQUE("employee_id")
);

CREATE TABLE IF NOT EXISTS "hris"."tbl_user_permissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" varchar(50) NOT NULL,
	"permission_key" varchar(100) NOT NULL,
	"access_level" "access_level" DEFAULT 'read' NOT NULL,
	"assigned_by" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "hris"."tbl_employee_leave_balance" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" varchar(50) NOT NULL,
	"leave_type_id" integer NOT NULL,
	"total_days" numeric(5, 2) DEFAULT '0',
	"used_days" numeric(5, 2) DEFAULT '0',
	"remaining_days" numeric(5, 2) DEFAULT '0',
	"year" integer NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "hris"."tbl_leave_calendar" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"is_recurring" boolean DEFAULT false,
	"year" integer,
	"created_by" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "tbl_leave_calendar_date_unique" UNIQUE("date")
);

CREATE TABLE IF NOT EXISTS "hris"."tbl_leave_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" varchar(50) NOT NULL,
	"leave_type_id" integer NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"total_days" numeric(5, 2) NOT NULL,
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

CREATE TABLE IF NOT EXISTS "hris"."tbl_leave_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(50) NOT NULL,
	"description" text,
	"max_days" integer NOT NULL,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "hris"."tbl_employee_salary_structure" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" varchar(50) NOT NULL,
	"component_id" integer NOT NULL,
	"amount" varchar(500) NOT NULL,
	"is_percentage" boolean DEFAULT false,
	"percentage_of" varchar(100),
	"effective_date" date NOT NULL,
	"end_date" date,
	"created_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "hris"."tbl_monthly_salaries" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" varchar(50) NOT NULL,
	"month_year" date NOT NULL,
	"basic_salary" varchar(500) NOT NULL,
	"local_salary" varchar(500) DEFAULT '0',
	"oxo_international_salary" varchar(500) DEFAULT '0',
	"total_earnings" varchar(500) NOT NULL,
	"total_deductions" varchar(500) NOT NULL,
	"net_salary" varchar(500) NOT NULL,
	"status" "salary_status" DEFAULT 'generated',
	"generated_by" integer,
	"paid_date" date,
	"pdf_url" varchar(500),
	"created_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "hris"."tbl_salary_components" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"type" "component_type" NOT NULL,
	"is_default" boolean DEFAULT false,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "hris"."tbl_salary_slip_details" (
	"id" serial PRIMARY KEY NOT NULL,
	"salary_id" integer NOT NULL,
	"component_id" integer NOT NULL,
	"amount" varchar(500) NOT NULL,
	"type" "component_type" NOT NULL
);

CREATE TABLE IF NOT EXISTS "hris"."tbl_facilities" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"type" "facility_type" NOT NULL,
	"description" text,
	"facilities" text,
	"capacity" integer DEFAULT 1,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "hris"."tbl_facility_bookings" (
	"id" serial PRIMARY KEY NOT NULL,
	"facility_id" integer NOT NULL,
	"employee_id" varchar(50) NOT NULL,
	"start_time" timestamp NOT NULL,
	"end_time" timestamp NOT NULL,
	"purpose" text,
	"status" "booking_status" DEFAULT 'confirmed',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "hris"."tbl_medical_insurance_claims" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" varchar(50) NOT NULL,
	"type" "claim_type" NOT NULL,
	"quarter" varchar(10) NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"status" "claim_status" DEFAULT 'pending',
	"supportive_document_url" varchar(500) NOT NULL,
	"relevant_document_url" varchar(500),
	"admin_comment" text,
	"reviewed_by" integer,
	"reviewed_at" timestamp,
	"resubmission_of" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "hris"."tbl_consultant_work_submissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" varchar(50) NOT NULL,
	"project" varchar(255) NOT NULL,
	"tech" varchar(255) NOT NULL,
	"total_hours" numeric(10, 2) NOT NULL,
	"comment" text,
	"log_sheet_url" varchar(500) NOT NULL,
	"status" "submission_status" DEFAULT 'pending',
	"admin_comment" text,
	"reviewed_by" integer,
	"reviewed_at" timestamp,
	"resubmission_of" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "hris"."tbl_vendors" (
	"id" serial PRIMARY KEY NOT NULL,
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

CREATE TABLE IF NOT EXISTS "hris"."tbl_payment_vouchers" (
	"id" serial PRIMARY KEY NOT NULL,
	"voucher_type" "voucher_type" NOT NULL,
	"employee_id" varchar(50),
	"vendor_id" integer,
	"amount" numeric(12, 2) NOT NULL,
	"description" text NOT NULL,
	"invoice_number" varchar(100),
	"invoice_date" date,
	"due_date" date,
	"status" "voucher_status" DEFAULT 'pending',
	"attachment_url" varchar(500),
	"reviewed_by" integer,
	"reviewed_at" timestamp,
	"paid_date" date,
	"payment_reference" varchar(200),
	"notes" text,
	"created_by" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "hris"."tbl_audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"action" varchar(100) NOT NULL,
	"table_name" varchar(100),
	"record_id" integer,
	"old_values" json,
	"new_values" json,
	"ip_address" varchar(45),
	"user_agent" text,
	"created_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "hris"."tbl_employee_education" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" varchar(50) NOT NULL,
	"qualification_level" "qualification_level" NOT NULL,
	"qualification_title" varchar(255) NOT NULL,
	"awarding_institution" varchar(255) NOT NULL,
	"date_awarded" date,
	"is_ongoing" boolean DEFAULT false,
	"remarks" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "hris"."tbl_employee_work_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" varchar(50) NOT NULL,
	"organization" varchar(255) NOT NULL,
	"position_held" varchar(255) NOT NULL,
	"employment_type" "employment_type" DEFAULT 'regular' NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"remarks" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "hris"."tbl_employee_nominees" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" varchar(50) NOT NULL,
	"name_with_initials" "bytea",
	"nic" "bytea",
	"relationship" varchar(100) NOT NULL,
	"proportion_percent" numeric(5, 2) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "hris"."tbl_employee_dependents" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" varchar(50) NOT NULL,
	"full_name" "bytea",
	"nic" "bytea",
	"date_of_birth" date NOT NULL,
	"gender" "employee_sex" NOT NULL,
	"relationship" "dependent_relationship" NOT NULL,
	"mobile_number" "bytea",
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "hris"."tbl_employee_emergency_contacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" varchar(50) NOT NULL,
	"name" "bytea",
	"relationship" varchar(100) NOT NULL,
	"contact_number" "bytea",
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "hris"."tbl_employee_welfare_info" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" varchar(50) NOT NULL,
	"wedding_anniversary_date" date,
	"hobbies" text,
	"community_activities" text,
	"professional_memberships" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "tbl_employee_welfare_info_employee_id_unique" UNIQUE("employee_id")
);

CREATE TABLE IF NOT EXISTS "hris"."tbl_profile_change_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" varchar(50) NOT NULL,
	"submitted_by" integer,
	"status" "profile_change_status" DEFAULT 'pending_approval',
	"changes" json NOT NULL,
	"comments" text,
	"reviewer_id" integer,
	"reviewer_comments" text,
	"decided_at" timestamp,
	"previous_request_id" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "hris"."tbl_notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" varchar(50) NOT NULL,
	"type" varchar(100) NOT NULL,
	"title" varchar(255) NOT NULL,
	"message" text NOT NULL,
	"payload" json,
	"link" varchar(500),
	"is_read" boolean DEFAULT false,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "hris"."tbl_attachments" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_type" varchar(100) NOT NULL,
	"entity_id" integer NOT NULL,
	"file_url" varchar(500) NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"mime_type" varchar(150),
	"file_size" integer,
	"uploaded_by" integer,
	"created_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "hris"."tbl_employee_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" varchar(50) NOT NULL,
	"author_user_id" integer,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "hris"."tbl_communication_recipients" (
	"id" serial PRIMARY KEY NOT NULL,
	"communication_id" integer NOT NULL,
	"employee_id" varchar(50) NOT NULL,
	"email_sent_at" timestamp,
	"responded_at" timestamp,
	"response_text" text
);

CREATE TABLE IF NOT EXISTS "hris"."tbl_communications" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(255) NOT NULL,
	"body" text NOT NULL,
	"requires_acknowledgement" boolean DEFAULT false NOT NULL,
	"deadline_at" timestamp,
	"created_by" integer,
	"created_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "hris"."tbl_event_participants" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer NOT NULL,
	"employee_id" varchar(50) NOT NULL,
	"participated" boolean DEFAULT false NOT NULL,
	"will_participate" boolean,
	"recorded_by" integer,
	"recorded_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "hris"."tbl_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"event_date" timestamp NOT NULL,
	"location" varchar(255),
	"created_by" integer,
	"created_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "hris"."tbl_form_distributions" (
	"id" serial PRIMARY KEY NOT NULL,
	"form_id" integer NOT NULL,
	"employee_id" varchar(50) NOT NULL,
	"distributed_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "hris"."tbl_form_logic_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"form_id" integer NOT NULL,
	"target_question_id" integer NOT NULL,
	"source_question_id" integer NOT NULL,
	"comparator" "form_logic_comparator" NOT NULL,
	"comparison_value" jsonb,
	"action" "form_logic_action" DEFAULT 'show' NOT NULL,
	"combinator" "form_logic_combinator" DEFAULT 'all' NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS "hris"."tbl_form_question_options" (
	"id" serial PRIMARY KEY NOT NULL,
	"question_id" integer NOT NULL,
	"label" varchar(255) NOT NULL,
	"value" varchar(255) NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"is_other" boolean DEFAULT false NOT NULL
);

CREATE TABLE IF NOT EXISTS "hris"."tbl_form_questions" (
	"id" serial PRIMARY KEY NOT NULL,
	"form_id" integer NOT NULL,
	"section_id" integer,
	"type" "form_question_type" NOT NULL,
	"title" varchar(500) DEFAULT '' NOT NULL,
	"description" text,
	"help_text" text,
	"placeholder" varchar(500),
	"required" boolean DEFAULT false NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"default_value" jsonb
);

CREATE TABLE IF NOT EXISTS "hris"."tbl_form_response_answers" (
	"id" serial PRIMARY KEY NOT NULL,
	"response_id" integer NOT NULL,
	"question_id" integer NOT NULL,
	"value" jsonb,
	"value_text" text
);

CREATE TABLE IF NOT EXISTS "hris"."tbl_form_responses" (
	"id" serial PRIMARY KEY NOT NULL,
	"form_id" integer NOT NULL,
	"employee_id" varchar(50) NOT NULL,
	"status" "form_response_status" DEFAULT 'in_progress' NOT NULL,
	"started_at" timestamp DEFAULT now(),
	"submitted_at" timestamp,
	"completion_ms" integer
);

CREATE TABLE IF NOT EXISTS "hris"."tbl_form_sections" (
	"id" serial PRIMARY KEY NOT NULL,
	"form_id" integer NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"order_index" integer DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS "hris"."tbl_form_settings" (
	"form_id" integer PRIMARY KEY NOT NULL,
	"thank_you_message" text,
	"accept_responses" boolean DEFAULT true NOT NULL,
	"close_at" timestamp,
	"response_limit" integer,
	"allow_edit_after_submit" boolean DEFAULT false NOT NULL,
	"notify_owner_on_response" boolean DEFAULT true NOT NULL,
	"notify_respondent" boolean DEFAULT false NOT NULL
);

CREATE TABLE IF NOT EXISTS "hris"."tbl_form_theme" (
	"form_id" integer PRIMARY KEY NOT NULL,
	"primary_color" varchar(20),
	"header_image_url" varchar(500)
);

CREATE TABLE IF NOT EXISTS "hris"."tbl_forms" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"status" "form_status" DEFAULT 'draft' NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"published_at" timestamp,
	"archived_at" timestamp,
	"response_count" integer DEFAULT 0 NOT NULL,
	"last_response_at" timestamp
);

CREATE TABLE IF NOT EXISTS "hris"."tbl_work_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" varchar(50) NOT NULL,
	"work_date" date NOT NULL,
	"task_description" text NOT NULL,
	"hours_spent" numeric(5, 2) NOT NULL,
	"remarks" text,
	"is_late" boolean DEFAULT false NOT NULL,
	"deadline_at" timestamp,
	"created_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "hris"."tbl_work_log_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"is_enabled" boolean DEFAULT false NOT NULL,
	"deadline_time" varchar(5) DEFAULT '18:00' NOT NULL,
	"timezone" varchar(64) DEFAULT 'Asia/Colombo' NOT NULL,
	"updated_by" integer,
	"updated_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "hris"."tbl_group_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"employee_id" varchar(50) NOT NULL,
	"added_by" integer,
	"added_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "hris"."tbl_groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(150) NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "hris"."tbl_notices" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(255) NOT NULL,
	"message" text NOT NULL,
	"image_url" varchar(500),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "hris"."tbl_attendance" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" varchar(50) NOT NULL,
	"session_token" varchar(100) NOT NULL,
	"login_at" timestamp DEFAULT now(),
	"logout_at" timestamp,
	"last_heartbeat_at" timestamp DEFAULT now(),
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"end_reason" varchar(30),
	"ip_address" varchar(64),
	"user_agent" text,
	"browser" varchar(100),
	"os" varchar(100),
	"device_type" varchar(30),
	"timezone" varchar(64),
	"total_duration_sec" integer,
	"active_sec" integer,
	"idle_sec" integer,
	"productive_sec" integer,
	"unproductive_sec" integer,
	"is_late" boolean DEFAULT false NOT NULL,
	"is_early_logout" boolean DEFAULT false NOT NULL,
	"terminated_by_employee_id" varchar(50),
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "tbl_attendance_session_token_unique" UNIQUE("session_token")
);

CREATE TABLE IF NOT EXISTS "hris"."tbl_document_recipients" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" integer NOT NULL,
	"employee_id" varchar(50) NOT NULL
);

CREATE TABLE IF NOT EXISTS "hris"."tbl_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"target_type" varchar(20) NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

DO $$ BEGIN
 ALTER TABLE "hris"."tbl_employee" ADD CONSTRAINT "tbl_employee_employee_type_id_tbl_employee_type_id_fk" FOREIGN KEY ("employee_type_id") REFERENCES "hris"."tbl_employee_type"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "hris"."tbl_employee_pii" ADD CONSTRAINT "tbl_employee_pii_employee_id_tbl_employee_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "hris"."tbl_employee"("employee_id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "hris"."tbl_user_permissions" ADD CONSTRAINT "tbl_user_permissions_employee_id_tbl_employee_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "hris"."tbl_employee"("employee_id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "hris"."tbl_user_permissions" ADD CONSTRAINT "tbl_user_permissions_assigned_by_tbl_employee_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "hris"."tbl_employee"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "hris"."tbl_employee_leave_balance" ADD CONSTRAINT "tbl_employee_leave_balance_employee_id_tbl_employee_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "hris"."tbl_employee"("employee_id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "hris"."tbl_employee_leave_balance" ADD CONSTRAINT "tbl_employee_leave_balance_leave_type_id_tbl_leave_types_id_fk" FOREIGN KEY ("leave_type_id") REFERENCES "hris"."tbl_leave_types"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "hris"."tbl_leave_calendar" ADD CONSTRAINT "tbl_leave_calendar_created_by_tbl_employee_id_fk" FOREIGN KEY ("created_by") REFERENCES "hris"."tbl_employee"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "hris"."tbl_leave_requests" ADD CONSTRAINT "tbl_leave_requests_employee_id_tbl_employee_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "hris"."tbl_employee"("employee_id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "hris"."tbl_leave_requests" ADD CONSTRAINT "tbl_leave_requests_leave_type_id_tbl_leave_types_id_fk" FOREIGN KEY ("leave_type_id") REFERENCES "hris"."tbl_leave_types"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "hris"."tbl_employee_salary_structure" ADD CONSTRAINT "tbl_employee_salary_structure_employee_id_tbl_employee_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "hris"."tbl_employee"("employee_id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "hris"."tbl_employee_salary_structure" ADD CONSTRAINT "tbl_employee_salary_structure_component_id_tbl_salary_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "hris"."tbl_salary_components"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "hris"."tbl_monthly_salaries" ADD CONSTRAINT "tbl_monthly_salaries_employee_id_tbl_employee_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "hris"."tbl_employee"("employee_id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "hris"."tbl_monthly_salaries" ADD CONSTRAINT "tbl_monthly_salaries_generated_by_tbl_employee_id_fk" FOREIGN KEY ("generated_by") REFERENCES "hris"."tbl_employee"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "hris"."tbl_salary_slip_details" ADD CONSTRAINT "tbl_salary_slip_details_salary_id_tbl_monthly_salaries_id_fk" FOREIGN KEY ("salary_id") REFERENCES "hris"."tbl_monthly_salaries"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "hris"."tbl_salary_slip_details" ADD CONSTRAINT "tbl_salary_slip_details_component_id_tbl_salary_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "hris"."tbl_salary_components"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "hris"."tbl_facility_bookings" ADD CONSTRAINT "tbl_facility_bookings_facility_id_tbl_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "hris"."tbl_facilities"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "hris"."tbl_facility_bookings" ADD CONSTRAINT "tbl_facility_bookings_employee_id_tbl_employee_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "hris"."tbl_employee"("employee_id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "hris"."tbl_medical_insurance_claims" ADD CONSTRAINT "tbl_medical_insurance_claims_employee_id_tbl_employee_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "hris"."tbl_employee"("employee_id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "hris"."tbl_medical_insurance_claims" ADD CONSTRAINT "tbl_medical_insurance_claims_reviewed_by_tbl_employee_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "hris"."tbl_employee"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "hris"."tbl_consultant_work_submissions" ADD CONSTRAINT "tbl_consultant_work_submissions_employee_id_tbl_employee_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "hris"."tbl_employee"("employee_id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "hris"."tbl_consultant_work_submissions" ADD CONSTRAINT "tbl_consultant_work_submissions_reviewed_by_tbl_employee_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "hris"."tbl_employee"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "hris"."tbl_payment_vouchers" ADD CONSTRAINT "tbl_payment_vouchers_employee_id_tbl_employee_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "hris"."tbl_employee"("employee_id") ON DELETE set null ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "hris"."tbl_payment_vouchers" ADD CONSTRAINT "tbl_payment_vouchers_vendor_id_tbl_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "hris"."tbl_vendors"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "hris"."tbl_payment_vouchers" ADD CONSTRAINT "tbl_payment_vouchers_reviewed_by_tbl_employee_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "hris"."tbl_employee"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "hris"."tbl_payment_vouchers" ADD CONSTRAINT "tbl_payment_vouchers_created_by_tbl_employee_id_fk" FOREIGN KEY ("created_by") REFERENCES "hris"."tbl_employee"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "hris"."tbl_audit_logs" ADD CONSTRAINT "tbl_audit_logs_user_id_tbl_employee_id_fk" FOREIGN KEY ("user_id") REFERENCES "hris"."tbl_employee"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "hris"."tbl_employee_education" ADD CONSTRAINT "tbl_employee_education_employee_id_tbl_employee_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "hris"."tbl_employee"("employee_id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "hris"."tbl_employee_work_history" ADD CONSTRAINT "tbl_employee_work_history_employee_id_tbl_employee_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "hris"."tbl_employee"("employee_id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "hris"."tbl_employee_nominees" ADD CONSTRAINT "tbl_employee_nominees_employee_id_tbl_employee_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "hris"."tbl_employee"("employee_id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "hris"."tbl_employee_dependents" ADD CONSTRAINT "tbl_employee_dependents_employee_id_tbl_employee_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "hris"."tbl_employee"("employee_id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "hris"."tbl_employee_emergency_contacts" ADD CONSTRAINT "tbl_employee_emergency_contacts_employee_id_tbl_employee_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "hris"."tbl_employee"("employee_id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "hris"."tbl_employee_welfare_info" ADD CONSTRAINT "tbl_employee_welfare_info_employee_id_tbl_employee_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "hris"."tbl_employee"("employee_id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "hris"."tbl_profile_change_requests" ADD CONSTRAINT "tbl_profile_change_requests_employee_id_tbl_employee_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "hris"."tbl_employee"("employee_id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "hris"."tbl_profile_change_requests" ADD CONSTRAINT "tbl_profile_change_requests_submitted_by_tbl_employee_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "hris"."tbl_employee"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "hris"."tbl_profile_change_requests" ADD CONSTRAINT "tbl_profile_change_requests_reviewer_id_tbl_employee_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "hris"."tbl_employee"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "hris"."tbl_notifications" ADD CONSTRAINT "tbl_notifications_employee_id_tbl_employee_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "hris"."tbl_employee"("employee_id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "hris"."tbl_attachments" ADD CONSTRAINT "tbl_attachments_uploaded_by_tbl_employee_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "hris"."tbl_employee"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "hris"."tbl_employee_notes" ADD CONSTRAINT "tbl_employee_notes_employee_id_tbl_employee_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "hris"."tbl_employee"("employee_id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "hris"."tbl_employee_notes" ADD CONSTRAINT "tbl_employee_notes_author_user_id_tbl_employee_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "hris"."tbl_employee"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "hris"."tbl_communication_recipients" ADD CONSTRAINT "tbl_communication_recipients_communication_id_tbl_communications_id_fk" FOREIGN KEY ("communication_id") REFERENCES "hris"."tbl_communications"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "hris"."tbl_communication_recipients" ADD CONSTRAINT "tbl_communication_recipients_employee_id_tbl_employee_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "hris"."tbl_employee"("employee_id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "hris"."tbl_communications" ADD CONSTRAINT "tbl_communications_created_by_tbl_employee_id_fk" FOREIGN KEY ("created_by") REFERENCES "hris"."tbl_employee"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "hris"."tbl_event_participants" ADD CONSTRAINT "tbl_event_participants_event_id_tbl_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "hris"."tbl_events"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "hris"."tbl_event_participants" ADD CONSTRAINT "tbl_event_participants_employee_id_tbl_employee_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "hris"."tbl_employee"("employee_id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "hris"."tbl_event_participants" ADD CONSTRAINT "tbl_event_participants_recorded_by_tbl_employee_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "hris"."tbl_employee"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "hris"."tbl_events" ADD CONSTRAINT "tbl_events_created_by_tbl_employee_id_fk" FOREIGN KEY ("created_by") REFERENCES "hris"."tbl_employee"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "hris"."tbl_form_distributions" ADD CONSTRAINT "tbl_form_distributions_form_id_tbl_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "hris"."tbl_forms"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "hris"."tbl_form_distributions" ADD CONSTRAINT "tbl_form_distributions_employee_id_tbl_employee_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "hris"."tbl_employee"("employee_id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "hris"."tbl_form_logic_rules" ADD CONSTRAINT "tbl_form_logic_rules_form_id_tbl_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "hris"."tbl_forms"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "hris"."tbl_form_logic_rules" ADD CONSTRAINT "tbl_form_logic_rules_target_question_id_tbl_form_questions_id_fk" FOREIGN KEY ("target_question_id") REFERENCES "hris"."tbl_form_questions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "hris"."tbl_form_logic_rules" ADD CONSTRAINT "tbl_form_logic_rules_source_question_id_tbl_form_questions_id_fk" FOREIGN KEY ("source_question_id") REFERENCES "hris"."tbl_form_questions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "hris"."tbl_form_question_options" ADD CONSTRAINT "tbl_form_question_options_question_id_tbl_form_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "hris"."tbl_form_questions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "hris"."tbl_form_questions" ADD CONSTRAINT "tbl_form_questions_form_id_tbl_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "hris"."tbl_forms"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "hris"."tbl_form_questions" ADD CONSTRAINT "tbl_form_questions_section_id_tbl_form_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "hris"."tbl_form_sections"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "hris"."tbl_form_response_answers" ADD CONSTRAINT "tbl_form_response_answers_response_id_tbl_form_responses_id_fk" FOREIGN KEY ("response_id") REFERENCES "hris"."tbl_form_responses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "hris"."tbl_form_response_answers" ADD CONSTRAINT "tbl_form_response_answers_question_id_tbl_form_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "hris"."tbl_form_questions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "hris"."tbl_form_responses" ADD CONSTRAINT "tbl_form_responses_form_id_tbl_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "hris"."tbl_forms"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "hris"."tbl_form_responses" ADD CONSTRAINT "tbl_form_responses_employee_id_tbl_employee_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "hris"."tbl_employee"("employee_id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "hris"."tbl_form_sections" ADD CONSTRAINT "tbl_form_sections_form_id_tbl_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "hris"."tbl_forms"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "hris"."tbl_form_settings" ADD CONSTRAINT "tbl_form_settings_form_id_tbl_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "hris"."tbl_forms"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "hris"."tbl_form_theme" ADD CONSTRAINT "tbl_form_theme_form_id_tbl_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "hris"."tbl_forms"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "hris"."tbl_forms" ADD CONSTRAINT "tbl_forms_created_by_tbl_employee_id_fk" FOREIGN KEY ("created_by") REFERENCES "hris"."tbl_employee"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "hris"."tbl_work_logs" ADD CONSTRAINT "tbl_work_logs_employee_id_tbl_employee_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "hris"."tbl_employee"("employee_id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "hris"."tbl_work_log_settings" ADD CONSTRAINT "tbl_work_log_settings_updated_by_tbl_employee_id_fk" FOREIGN KEY ("updated_by") REFERENCES "hris"."tbl_employee"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "hris"."tbl_group_members" ADD CONSTRAINT "tbl_group_members_group_id_tbl_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "hris"."tbl_groups"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "hris"."tbl_group_members" ADD CONSTRAINT "tbl_group_members_employee_id_tbl_employee_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "hris"."tbl_employee"("employee_id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "hris"."tbl_group_members" ADD CONSTRAINT "tbl_group_members_added_by_tbl_employee_id_fk" FOREIGN KEY ("added_by") REFERENCES "hris"."tbl_employee"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "hris"."tbl_groups" ADD CONSTRAINT "tbl_groups_created_by_tbl_employee_id_fk" FOREIGN KEY ("created_by") REFERENCES "hris"."tbl_employee"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "hris"."tbl_notices" ADD CONSTRAINT "tbl_notices_created_by_tbl_employee_id_fk" FOREIGN KEY ("created_by") REFERENCES "hris"."tbl_employee"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "hris"."tbl_notices" ADD CONSTRAINT "tbl_notices_updated_by_tbl_employee_id_fk" FOREIGN KEY ("updated_by") REFERENCES "hris"."tbl_employee"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "hris"."tbl_attendance" ADD CONSTRAINT "tbl_attendance_employee_id_tbl_employee_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "hris"."tbl_employee"("employee_id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "hris"."tbl_document_recipients" ADD CONSTRAINT "tbl_document_recipients_document_id_tbl_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "hris"."tbl_documents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "hris"."tbl_document_recipients" ADD CONSTRAINT "tbl_document_recipients_employee_id_tbl_employee_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "hris"."tbl_employee"("employee_id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "hris"."tbl_documents" ADD CONSTRAINT "tbl_documents_created_by_tbl_employee_id_fk" FOREIGN KEY ("created_by") REFERENCES "hris"."tbl_employee"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "tbl_form_distributions_form_id_employee_id_idx" ON "hris"."tbl_form_distributions" USING btree ("form_id","employee_id");
CREATE UNIQUE INDEX IF NOT EXISTS "tbl_form_responses_form_id_employee_id_idx" ON "hris"."tbl_form_responses" USING btree ("form_id","employee_id");
CREATE UNIQUE INDEX IF NOT EXISTS "tbl_group_members_group_id_user_id_idx" ON "hris"."tbl_group_members" USING btree ("group_id","employee_id");
CREATE UNIQUE INDEX IF NOT EXISTS "tbl_document_recipients_document_id_employee_id_idx" ON "hris"."tbl_document_recipients" USING btree ("document_id","employee_id");

-- ============================================================================
-- Hand-written tables with no Drizzle ORM model (see header note above).
-- Source: drizzle/0013_add_attendance_tracking.sql, drizzle/0014_add_desktop_agent.sql
-- ============================================================================

-- tbl_attendance already exists (created by the ORM-generated block above).
-- These two statements add the one FK and one column the Drizzle schema
-- doesn't model, plus the four indexes that only ever existed as raw SQL
-- (drizzle-kit 0.29's pgTable builder can't express a partial index's WHERE
-- clause, so all four were kept in raw SQL for consistency rather than
-- splitting some into the TS schema and some out).

ALTER TABLE "hris"."tbl_attendance"
  ADD CONSTRAINT "tbl_attendance_terminated_by_employee_id_tbl_employee_employee_id_fk"
  FOREIGN KEY ("terminated_by_employee_id") REFERENCES "hris"."tbl_employee"("employee_id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "tbl_attendance_employee_id_status_idx"
  ON "hris"."tbl_attendance" ("employee_id", "status");
CREATE INDEX IF NOT EXISTS "tbl_attendance_status_heartbeat_idx"
  ON "hris"."tbl_attendance" ("status", "last_heartbeat_at");
CREATE INDEX IF NOT EXISTS "tbl_attendance_login_at_idx"
  ON "hris"."tbl_attendance" ("login_at");
CREATE INDEX IF NOT EXISTS "tbl_attendance_active_partial_idx"
  ON "hris"."tbl_attendance" ("employee_id", "last_heartbeat_at")
  WHERE "status" = 'active';

-- source: browser | desktop_agent - added by drizzle/0014_add_desktop_agent.sql,
-- which is not yet run against any environment (the desktop agent is unbuilt).
ALTER TABLE "hris"."tbl_attendance"
  ADD COLUMN IF NOT EXISTS "source" varchar(20) NOT NULL DEFAULT 'browser';

CREATE INDEX IF NOT EXISTS "tbl_attendance_employee_source_status_idx"
  ON "hris"."tbl_attendance" ("employee_id", "source", "status");

-- ─── Attendance settings (singleton) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS "hris"."tbl_attendance_settings" (
  "id" serial PRIMARY KEY,
  "heartbeat_grace_sec" integer NOT NULL DEFAULT 90,
  "idle_threshold_sec" integer NOT NULL DEFAULT 300,
  "disconnected_threshold_sec" integer NOT NULL DEFAULT 180,
  "abnormal_close_grace_min" integer NOT NULL DEFAULT 15,
  "allow_multiple_sessions" boolean NOT NULL DEFAULT false,
  "activity_monitoring_enabled" boolean NOT NULL DEFAULT true,
  "late_login_time" varchar(5) NOT NULL DEFAULT '09:15',
  "early_logout_time" varchar(5) NOT NULL DEFAULT '17:00',
  "timezone" varchar(64) NOT NULL DEFAULT 'Asia/Colombo',
  "activity_log_retention_days" integer NOT NULL DEFAULT 90,
  "updated_by" integer REFERENCES "hris"."tbl_employee"("id") ON DELETE SET NULL,
  "updated_at" timestamp DEFAULT now()
);

ALTER TABLE "hris"."tbl_attendance_settings"
  ADD CONSTRAINT "tbl_attendance_settings_singleton" CHECK ("id" = 1);

INSERT INTO "hris"."tbl_attendance_settings" ("id") VALUES (1)
ON CONFLICT ("id") DO NOTHING;

-- ─── Activity logs ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "hris"."tbl_employee_activity_logs" (
  "id" serial PRIMARY KEY,
  "session_id" integer NOT NULL
    REFERENCES "hris"."tbl_attendance"("id") ON DELETE CASCADE,
  "employee_id" varchar(50) NOT NULL
    REFERENCES "hris"."tbl_employee"("employee_id") ON DELETE CASCADE ON UPDATE CASCADE,
  "event_type" varchar(30) NOT NULL,
  "event_count" integer NOT NULL DEFAULT 1,
  "bucket_start" timestamp NOT NULL,
  "recorded_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "tbl_employee_activity_logs_session_id_bucket_start_idx"
  ON "hris"."tbl_employee_activity_logs" ("session_id", "bucket_start");
CREATE INDEX IF NOT EXISTS "tbl_employee_activity_logs_employee_id_bucket_start_idx"
  ON "hris"."tbl_employee_activity_logs" ("employee_id", "bucket_start");

-- ─── Idle intervals ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "hris"."tbl_employee_idle_logs" (
  "id" serial PRIMARY KEY,
  "session_id" integer NOT NULL
    REFERENCES "hris"."tbl_attendance"("id") ON DELETE CASCADE,
  "employee_id" varchar(50) NOT NULL
    REFERENCES "hris"."tbl_employee"("employee_id") ON DELETE CASCADE ON UPDATE CASCADE,
  "idle_start" timestamp NOT NULL,
  "idle_end" timestamp,
  "duration_sec" integer,
  "threshold_sec_at_capture" integer NOT NULL
);

CREATE INDEX IF NOT EXISTS "tbl_employee_idle_logs_employee_id_idle_start_idx"
  ON "hris"."tbl_employee_idle_logs" ("employee_id", "idle_start");
CREATE INDEX IF NOT EXISTS "tbl_employee_idle_logs_open_partial_idx"
  ON "hris"."tbl_employee_idle_logs" ("session_id")
  WHERE "idle_end" IS NULL;

-- ─── Daily summary ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "hris"."tbl_employee_daily_summary" (
  "id" serial PRIMARY KEY,
  "employee_id" varchar(50) NOT NULL
    REFERENCES "hris"."tbl_employee"("employee_id") ON DELETE CASCADE ON UPDATE CASCADE,
  "summary_date" date NOT NULL,
  "first_login_at" timestamp,
  "last_logout_at" timestamp,
  "total_logged_sec" integer NOT NULL DEFAULT 0,
  "active_sec" integer NOT NULL DEFAULT 0,
  "idle_sec" integer NOT NULL DEFAULT 0,
  "productive_sec" integer NOT NULL DEFAULT 0,
  "unproductive_sec" integer NOT NULL DEFAULT 0,
  "break_sec" integer NOT NULL DEFAULT 0,
  "efficiency_pct" numeric(5, 2),
  "session_count" integer NOT NULL DEFAULT 0,
  "is_late" boolean NOT NULL DEFAULT false,
  "is_early_logout" boolean NOT NULL DEFAULT false,
  "had_abnormal_logout" boolean NOT NULL DEFAULT false,
  "status" varchar(20) NOT NULL DEFAULT 'absent',
  "computed_at" timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "tbl_employee_daily_summary_employee_id_summary_date_idx"
  ON "hris"."tbl_employee_daily_summary" ("employee_id", "summary_date");
CREATE INDEX IF NOT EXISTS "tbl_employee_daily_summary_summary_date_idx"
  ON "hris"."tbl_employee_daily_summary" ("summary_date");

-- ─── Productivity rollups ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "hris"."tbl_employee_productivity_summary" (
  "id" serial PRIMARY KEY,
  "employee_id" varchar(50) NOT NULL
    REFERENCES "hris"."tbl_employee"("employee_id") ON DELETE CASCADE ON UPDATE CASCADE,
  "period_type" varchar(10) NOT NULL,
  "period_start" date NOT NULL,
  "period_end" date NOT NULL,
  "total_logged_sec" integer NOT NULL DEFAULT 0,
  "total_active_sec" integer NOT NULL DEFAULT 0,
  "total_productive_sec" integer NOT NULL DEFAULT 0,
  "total_unproductive_sec" integer NOT NULL DEFAULT 0,
  "avg_efficiency_pct" numeric(5, 2),
  "days_present" integer NOT NULL DEFAULT 0,
  "days_late" integer NOT NULL DEFAULT 0,
  "days_early_logout" integer NOT NULL DEFAULT 0,
  "computed_at" timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "tbl_employee_productivity_summary_employee_period_idx"
  ON "hris"."tbl_employee_productivity_summary" ("employee_id", "period_type", "period_start");
CREATE INDEX IF NOT EXISTS "tbl_employee_productivity_summary_period_type_start_idx"
  ON "hris"."tbl_employee_productivity_summary" ("period_type", "period_start");

-- ─── Desktop agent pairing codes ────────────────────────────────────────────
-- Not yet run against any environment (drizzle/0014_add_desktop_agent.sql -
-- the desktop agent client is unbuilt).
CREATE TABLE IF NOT EXISTS "hris"."tbl_attendance_agent_pairing_codes" (
  "id" serial PRIMARY KEY,
  "employee_id" varchar(50) NOT NULL
    REFERENCES "hris"."tbl_employee"("employee_id") ON DELETE CASCADE ON UPDATE CASCADE,
  "code_hash" varchar(64) NOT NULL UNIQUE,
  "expires_at" timestamp NOT NULL,
  "used_at" timestamp,
  "created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "tbl_attendance_agent_pairing_codes_employee_id_expires_at_idx"
  ON "hris"."tbl_attendance_agent_pairing_codes" ("employee_id", "expires_at");

-- ─── Desktop agent tokens ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "hris"."tbl_attendance_agent_tokens" (
  "id" serial PRIMARY KEY,
  "employee_id" varchar(50) NOT NULL
    REFERENCES "hris"."tbl_employee"("employee_id") ON DELETE CASCADE ON UPDATE CASCADE,
  "token_hash" varchar(64) NOT NULL UNIQUE,
  "device_name" varchar(100),
  "platform" varchar(20),
  "created_at" timestamp DEFAULT now(),
  "last_used_at" timestamp,
  "revoked_at" timestamp
);

CREATE INDEX IF NOT EXISTS "tbl_attendance_agent_tokens_employee_id_idx"
  ON "hris"."tbl_attendance_agent_tokens" ("employee_id");
CREATE INDEX IF NOT EXISTS "tbl_attendance_agent_tokens_active_partial_idx"
  ON "hris"."tbl_attendance_agent_tokens" ("token_hash")
  WHERE "revoked_at" IS NULL;

-- ============================================================================
-- Seed: initial super admin employee record (admin@gmail.com).
--
-- This is only the Postgres-side row - there is no password column anywhere
-- in this schema (auth is entirely Keycloak-delegated, see
-- drizzle/0005_remove_local_passwords.sql). "Nimshan@12" still has to be set
-- as this user's password in Keycloak separately (Admin Console -> your
-- realm -> Users -> Add User, email admin@gmail.com -> Credentials tab). On
-- first login, jwt-auth.guard.ts matches that Keycloak account to this row
-- by email and links them automatically.
--
-- email/first_name/last_name are encrypted and email_hash is a keyed HMAC -
-- computed here via pgcrypto (same AES-256-CBC + HMAC-SHA256 scheme as
-- EmployeeModel.create() in src/utils/encryption.ts) so this row is actually
-- decryptable/findable by the app, not unreadable plaintext. Installed into
-- "hris" (not "public") for the same permission reason as the rest of this
-- file, and every call is schema-qualified so it doesn't depend on
-- search_path.
--
-- Replace <PII_ENCRYPTION_KEY> below with the real value for whichever
-- environment you run this against - it MUST match what that environment's
-- running backend actually has loaded, or the row will exist but be
-- unfindable (email_hash won't match) and unreadable (email won't decrypt).
-- ============================================================================

DROP EXTENSION IF EXISTS pgcrypto;
CREATE EXTENSION pgcrypto SCHEMA hris;

DO $$
DECLARE
  pii_key      bytea := hris.digest('<PII_ENCRYPTION_KEY>', 'sha256'); -- same as getPiiKeyBuffer()
  email_plain  text  := 'admin@gmail.com';
  first_plain  text  := 'Super';
  last_plain   text  := 'Admin';
  emp_id_val   text  := 'SA001';
  iv_email     bytea := hris.gen_random_bytes(16);
  iv_first     bytea := hris.gen_random_bytes(16);
  iv_last      bytea := hris.gen_random_bytes(16);
BEGIN
  INSERT INTO "hris"."tbl_employee" (
    "employee_id", "email", "email_hash", "first_name", "last_name", "role",
    "status", "department", "position", "contact_number", "hire_date"
  ) VALUES (
    emp_id_val,
    encode(iv_email, 'hex') || ':' || encode(hris.encrypt_iv(email_plain::bytea, pii_key, iv_email, 'aes-cbc/pad:pkcs'), 'hex'),
    encode(hris.hmac(lower(trim(email_plain))::bytea, pii_key, 'sha256'), 'hex'),
    encode(iv_first, 'hex') || ':' || encode(hris.encrypt_iv(first_plain::bytea, pii_key, iv_first, 'aes-cbc/pad:pkcs'), 'hex'),
    encode(iv_last, 'hex') || ':' || encode(hris.encrypt_iv(last_plain::bytea, pii_key, iv_last, 'aes-cbc/pad:pkcs'), 'hex'),
    'super_admin',
    'active',
    'Administration',
    'Super Administrator',
    '+94700000000',
    CURRENT_DATE
  )
  ON CONFLICT ("employee_id") DO NOTHING;
END $$;


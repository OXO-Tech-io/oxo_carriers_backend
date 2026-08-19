-- ============================================================================
-- OXO Carriers - full "hris" schema teardown.
--
-- Reverses oxo_carriers_hris_schema.sql: drops every table it created, in
-- the exact reverse order they were created (dependents before what they
-- reference), then the 27 enum types those tables' columns used.
--
-- Each DROP TABLE also carries CASCADE as a safety net for any FK pointing
-- at it from a table not in this list (there shouldn't be one, since this
-- drops everything oxo_carriers_hris_schema.sql created) - CASCADE never
-- fires here if the reverse order is right and this list is run in full.
--
-- DROP TYPE has no CASCADE: a type can't be dropped while any column still
-- uses it, so if one of those fails, a table above was missed, not a type
-- dependency issue.
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

-- ============================================================================
-- Enum types (hris schema - see oxo_carriers_hris_schema.sql's header note
-- on why these live in hris rather than drizzle-kit's public default)
-- ============================================================================

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

-- The "hris" schema itself is left in place (it may still hold objects this
-- script doesn't know about). To remove it too, once it's empty:
-- DROP SCHEMA IF EXISTS "hris";

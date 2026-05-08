-- Keycloak migration
-- Run this once against your existing hris_payroll database.
--
-- Adds a keycloak_sub column to link DB users to Keycloak identities, and
-- relaxes the password column so users created via Keycloak don't need one.

ALTER TABLE users
  ADD COLUMN keycloak_sub VARCHAR(255) NULL AFTER email,
  ADD UNIQUE KEY uniq_users_keycloak_sub (keycloak_sub);

ALTER TABLE users
  MODIFY COLUMN password VARCHAR(255) NULL;

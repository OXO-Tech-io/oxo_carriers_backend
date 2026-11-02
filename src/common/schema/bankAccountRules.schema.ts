import { pgTable, serial, integer, varchar, text, boolean, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { employee } from '../../employees/employee.schema';

// OCD-598: per-bank account number rules, moved out of src/utils/bankAccountRules.ts
// so they can be updated without a code change. Created and seeded by
// src/scripts/addBankAccountRulesTables.ts.
//
// The bank is captured as free text, so a rule is resolved by matching the
// normalised name (lower-case, alphanumerics only) against `aliases`. Every
// rule is digits-only; `lengths` lists the allowed digit counts and `prefixes`
// optionally constrains the leading digits per length, keyed by length
// (e.g. Standard Chartered: { "11": ["18", "01"], "12": ["88"] }).
export const bankAccountRules = pgTable('tbl_bank_account_rules', {
    id: serial('id').primaryKey(),
    bankName: varchar('bank_name', { length: 100 }).notNull().unique(),
    aliases: text('aliases').array().notNull(),
    lengths: integer('lengths').array().notNull(),
    prefixes: jsonb('prefixes').$type<Record<string, string[]>>(),
    // Order of the bank dropdown on the Remittance step.
    displayOrder: integer('display_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    updatedBy: integer('updated_by').references(() => employee.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Bank Account Settings - a single organisation-wide row (id = 1, enforced by
// the tbl_bank_account_settings_singleton CHECK) holding the generic digit
// range applied when the entered bank matches no rule above.
export const bankAccountSettings = pgTable('tbl_bank_account_settings', {
    id: serial('id').primaryKey(),
    fallbackAccountNumberMin: integer('fallback_account_number_min').notNull().default(6),
    fallbackAccountNumberMax: integer('fallback_account_number_max').notNull().default(20),
    updatedBy: integer('updated_by').references(() => employee.id, { onDelete: 'set null' }),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const bankAccountRulesRelations = relations(bankAccountRules, ({ one }) => ({
    updater: one(employee, { fields: [bankAccountRules.updatedBy], references: [employee.id] }),
}));

export const bankAccountSettingsRelations = relations(bankAccountSettings, ({ one }) => ({
    updater: one(employee, { fields: [bankAccountSettings.updatedBy], references: [employee.id] }),
}));

export type BankAccountRuleRow = typeof bankAccountRules.$inferSelect;
export type NewBankAccountRuleRow = typeof bankAccountRules.$inferInsert;
export type BankAccountSettings = typeof bankAccountSettings.$inferSelect;
export type NewBankAccountSettings = typeof bankAccountSettings.$inferInsert;

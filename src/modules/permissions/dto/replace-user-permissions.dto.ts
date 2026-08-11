import { IsArray } from 'class-validator';

// The per-item shape (`{ key, accessLevel }`) is validated in
// PermissionsService.replaceUserPermissions, not via nested class-validator
// decorators here - the original controller produces a dynamic, per-item
// error message (e.g. `Invalid permission key: ${key}`) for invalid entries,
// which class-validator's declarative decorators can't reproduce verbatim.
// Keeping that loop in the service preserves the exact original response text.
export class ReplaceUserPermissionsDto {
  @IsArray()
  permissions!: unknown[];
}

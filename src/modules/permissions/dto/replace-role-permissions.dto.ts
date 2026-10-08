import { IsArray } from 'class-validator';

// Mirrors ReplaceUserPermissionsDto - see that file for why per-item
// validation stays in the service instead of nested class-validator decorators.
export class ReplaceRolePermissionsDto {
  @IsArray()
  permissions!: unknown[];
}

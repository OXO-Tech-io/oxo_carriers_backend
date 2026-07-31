import "reflect-metadata";
import { describe, it, expect } from "vitest";
import { ROUTE_ARGS_METADATA } from "@nestjs/common/constants";
import { Reflector } from "@nestjs/core";
import { CurrentEmployee } from "../../src/common/decorators/current-employee.decorator";
import { Public, IS_PUBLIC_KEY } from "../../src/common/decorators/public.decorator";
import { Roles, ROLES_KEY } from "../../src/common/decorators/roles.decorator";
import {
  RequirePermission,
  PERMISSION_KEY,
} from "../../src/common/decorators/require-permission.decorator";
import { UserRole } from "../../src/types";

// Standard technique for unit-testing a Nest custom param decorator's factory
// function without spinning up a full Nest testing module.
function getParamDecoratorFactory(decorator: (...args: any[]) => ParameterDecorator) {
  class TestDecorator {
    public test(@decorator() _value: unknown) {}
  }
  const args = Reflect.getMetadata(ROUTE_ARGS_METADATA, TestDecorator, "test");
  const key = Object.keys(args)[0];
  return args[key].factory;
}

describe("common decorators", () => {
  it("CurrentEmployee extracts request.employee", () => {
    const factory = getParamDecoratorFactory(CurrentEmployee);
    const employee = { userId: 1, role: UserRole.EMPLOYEE };
    const ctx: any = { switchToHttp: () => ({ getRequest: () => ({ employee }) }) };
    expect(factory(null, ctx)).toBe(employee);
  });

  it("CurrentEmployee returns undefined when the request has no employee", () => {
    const factory = getParamDecoratorFactory(CurrentEmployee);
    const ctx: any = { switchToHttp: () => ({ getRequest: () => ({}) }) };
    expect(factory(null, ctx)).toBeUndefined();
  });

  it("Public sets the isPublic metadata flag", () => {
    class Controller {
      @Public()
      handler() {}
    }
    const reflector = new Reflector();
    expect(reflector.get(IS_PUBLIC_KEY, Controller.prototype.handler)).toBe(true);
  });

  it("Roles sets the roles metadata array", () => {
    class Controller {
      @Roles(UserRole.HR_MANAGER, UserRole.SUPER_ADMIN)
      handler() {}
    }
    const reflector = new Reflector();
    expect(reflector.get(ROLES_KEY, Controller.prototype.handler)).toEqual([
      UserRole.HR_MANAGER,
      UserRole.SUPER_ADMIN,
    ]);
  });

  it("RequirePermission sets the permission key/level metadata, defaulting level to read", () => {
    class Controller {
      @RequirePermission("leaves" as any)
      handlerA() {}

      @RequirePermission("leaves" as any, "write")
      handlerB() {}
    }
    const reflector = new Reflector();
    expect(reflector.get(PERMISSION_KEY, Controller.prototype.handlerA)).toEqual({
      key: "leaves",
      level: "read",
    });
    expect(reflector.get(PERMISSION_KEY, Controller.prototype.handlerB)).toEqual({
      key: "leaves",
      level: "write",
    });
  });
});

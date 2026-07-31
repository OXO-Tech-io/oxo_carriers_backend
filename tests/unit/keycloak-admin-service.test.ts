import { describe, it, expect, vi, beforeEach } from "vitest";
import { UserRole } from "../../src/types";
// NOTE: freshService() below re-imports the module graph via
// vi.resetModules(), so any AppError thrown by it is a *different* class
// object than one statically imported here - instanceof checks would
// spuriously fail. Assert on the shape (statusCode) instead.

const jsonResponse = (body: unknown, ok = true, status = 200) => ({
  ok,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

// keycloakAdmin.service.ts caches its service-account token in module-level
// state (`_cached`), so each test needs a fresh module instance - otherwise
// a token fetched in an earlier test would be silently reused, shifting the
// expected fetch() call order in every later test.
async function freshService() {
  vi.resetModules();
  const mod = await import("../../src/modules/users/keycloakAdmin.service");
  return mod.keycloakAdminService;
}

describe("keycloakAdminService", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  const tokenResponse = () => jsonResponse({ access_token: "tok-1", expires_in: 3600 });

  describe("createUser", () => {
    it("creates a new keycloak user, assigns the role, and returns the sub", async () => {
      const keycloakAdminService = await freshService();
      fetchMock
        .mockResolvedValueOnce(tokenResponse()) // token
        .mockResolvedValueOnce(jsonResponse([])) // findUserByEmail (not found)
        .mockResolvedValueOnce(jsonResponse({}, true, 201)) // create user
        .mockResolvedValueOnce(jsonResponse([{ id: "kc-1", email: "a@b.com" }])) // re-fetch after create
        .mockResolvedValueOnce(jsonResponse([{ id: "role-1", name: UserRole.EMPLOYEE }])) // findRealmRole
        .mockResolvedValueOnce(jsonResponse({}, true, 204)); // assign role

      const sub = await keycloakAdminService.createUser({
        email: "a@b.com",
        firstName: "A",
        lastName: "B",
        password: "pw",
        role: UserRole.EMPLOYEE,
      });
      expect(sub).toBe("kc-1");
    });

    it("reuses an existing keycloak user found by email", async () => {
      const keycloakAdminService = await freshService();
      fetchMock
        .mockResolvedValueOnce(tokenResponse())
        .mockResolvedValueOnce(jsonResponse([{ id: "kc-existing", email: "a@b.com" }])) // found
        .mockResolvedValueOnce(jsonResponse([{ id: "role-1", name: UserRole.EMPLOYEE }]))
        .mockResolvedValueOnce(jsonResponse({}, true, 204));

      const sub = await keycloakAdminService.createUser({
        email: "a@b.com",
        firstName: "A",
        lastName: "B",
        password: "pw",
        role: UserRole.EMPLOYEE,
      });
      expect(sub).toBe("kc-existing");
    });

    it("throws an AppError when the realm role can't be found", async () => {
      const keycloakAdminService = await freshService();
      fetchMock
        .mockResolvedValueOnce(tokenResponse())
        .mockResolvedValueOnce(jsonResponse([{ id: "kc-existing", email: "a@b.com" }]))
        .mockResolvedValueOnce(jsonResponse([], false, 500));

      await expect(
        keycloakAdminService.createUser({
          email: "a@b.com",
          firstName: "A",
          lastName: "B",
          password: "pw",
          role: UserRole.EMPLOYEE,
        }),
      ).rejects.toMatchObject({ statusCode: 502 });
    });

    it("throws an AppError when the create call fails with a non-409 status", async () => {
      const keycloakAdminService = await freshService();
      fetchMock
        .mockResolvedValueOnce(tokenResponse())
        .mockResolvedValueOnce(jsonResponse([]))
        .mockResolvedValueOnce(jsonResponse({ error: "boom" }, false, 500));

      await expect(
        keycloakAdminService.createUser({
          email: "a@b.com",
          firstName: "A",
          lastName: "B",
          password: "pw",
          role: UserRole.EMPLOYEE,
        }),
      ).rejects.toMatchObject({ statusCode: 502 });
    });

    it("tolerates a 409 conflict by re-fetching the concurrently-created user", async () => {
      const keycloakAdminService = await freshService();
      fetchMock
        .mockResolvedValueOnce(tokenResponse())
        .mockResolvedValueOnce(jsonResponse([])) // not found initially
        .mockResolvedValueOnce(jsonResponse({}, false, 409)) // conflict on create
        .mockResolvedValueOnce(jsonResponse([{ id: "kc-conflict", email: "a@b.com" }])) // re-fetch succeeds
        .mockResolvedValueOnce(jsonResponse([{ id: "role-1", name: UserRole.EMPLOYEE }]))
        .mockResolvedValueOnce(jsonResponse({}, true, 204));

      const sub = await keycloakAdminService.createUser({
        email: "a@b.com",
        firstName: "A",
        lastName: "B",
        password: "pw",
        role: UserRole.EMPLOYEE,
      });
      expect(sub).toBe("kc-conflict");
    });
  });

  describe("deleteUser", () => {
    it("tolerates a 404 (already deleted)", async () => {
      const keycloakAdminService = await freshService();
      fetchMock.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(jsonResponse({}, false, 404));
      await expect(keycloakAdminService.deleteUser("kc-1")).resolves.toBeUndefined();
    });

    it("throws an AppError for other failures", async () => {
      const keycloakAdminService = await freshService();
      fetchMock.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(jsonResponse({}, false, 500));
      await expect(keycloakAdminService.deleteUser("kc-1")).rejects.toMatchObject({ statusCode: 502 });
    });
  });

  describe("listUsers", () => {
    it("passes default pagination params", async () => {
      const keycloakAdminService = await freshService();
      fetchMock.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(jsonResponse([{ id: "1" }]));
      const users = await keycloakAdminService.listUsers();
      expect(users).toEqual([{ id: "1" }]);
      const url = fetchMock.mock.calls[1][0] as string;
      expect(url).toContain("first=0");
      expect(url).toContain("max=200");
    });

    it("throws an AppError on failure", async () => {
      const keycloakAdminService = await freshService();
      fetchMock.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(jsonResponse({}, false, 500));
      await expect(keycloakAdminService.listUsers()).rejects.toMatchObject({ statusCode: 502 });
    });
  });

  describe("sendRequiredActionsEmail", () => {
    it("throws an AppError when keycloak rejects the request", async () => {
      const keycloakAdminService = await freshService();
      fetchMock.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(jsonResponse({}, false, 500));
      await expect(
        keycloakAdminService.sendRequiredActionsEmail("kc-1", ["VERIFY_EMAIL"]),
      ).rejects.toMatchObject({ statusCode: 502 });
    });

    it("succeeds when keycloak accepts the request", async () => {
      const keycloakAdminService = await freshService();
      fetchMock.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(jsonResponse({}, true, 204));
      await expect(
        keycloakAdminService.sendRequiredActionsEmail("kc-1", ["VERIFY_EMAIL"]),
      ).resolves.toBeUndefined();
    });
  });

  describe("updatePassword", () => {
    it("throws an AppError on failure", async () => {
      const keycloakAdminService = await freshService();
      fetchMock.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(jsonResponse({}, false, 400));
      await expect(keycloakAdminService.updatePassword("kc-1", "newpass")).rejects.toMatchObject({
        statusCode: 502,
      });
    });
  });
});

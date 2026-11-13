import { describe, it, expect, vi, beforeEach } from "vitest";

const files = new Map<string, Buffer>();
const state = { exists: true, signError: null as Error | null, writeError: null as Error | null };

vi.mock("@google-cloud/storage", () => ({
  Storage: class {
    bucket() {
      return {
        exists: async () => [state.exists],
        file: (key: string) => ({
          save: async (data: Buffer) => {
            if (state.writeError) throw state.writeError;
            files.set(key, data);
          },
          download: async () => [files.get(key)],
          delete: async () => files.delete(key),
          getSignedUrl: async () => {
            if (state.signError) throw state.signError;
            return ["https://signed.example/x"];
          },
        }),
      };
    }
  },
}));

async function load(bucket: string | undefined) {
  vi.resetModules();
  vi.doMock("../../src/config/env", () => ({ env: { GCS_BUCKET_NAME: bucket, GCS_PROJECT_ID: "proj", GCS_KEY_FILE: undefined } }));
  return import("../../src/lib/storage/gcsStorage");
}

describe("checkStorageHealth", () => {
  beforeEach(() => {
    files.clear();
    state.exists = true;
    state.signError = null;
    state.writeError = null;
  });

  it("reports an unset bucket with the deploy-variable hint", async () => {
    const { checkStorageHealth } = await load(undefined);
    const r = await checkStorageHealth();
    expect(r.ok).toBe(false);
    expect(r.steps[0]).toMatchObject({ step: "configuration", ok: false });
    expect(r.steps[0].hint).toMatch(/GCS_BUCKET_NAME/);
  });

  it("passes every step and removes its probe object", async () => {
    const { checkStorageHealth } = await load("b");
    const r = await checkStorageHealth();
    expect(r.ok).toBe(true);
    expect(r.steps.map((s) => s.step)).toEqual([
      "configuration", "bucket exists", "write object", "read object", "delete object", "sign read URL", "sign upload URL",
    ]);
    expect(files.size).toBe(0);
  });

  it("pins a signing failure to the IAM signBlob hint while storage itself works", async () => {
    state.signError = new Error("Permission 'iam.serviceAccounts.signBlob' denied on resource");
    const { checkStorageHealth } = await load("b");
    const r = await checkStorageHealth();
    expect(r.ok).toBe(false);
    expect(r.steps.filter((s) => !s.ok).map((s) => s.step)).toEqual(["sign read URL", "sign upload URL"]);
    expect(r.steps.find((s) => s.step === "write object")?.ok).toBe(true);
    expect(r.steps.at(-1)?.hint).toMatch(/serviceAccountTokenCreator/);
  });

  it("skips read/delete when the write is forbidden", async () => {
    state.writeError = new Error("403 Forbidden: caller does not have storage.objects.create");
    const { checkStorageHealth } = await load("b");
    const r = await checkStorageHealth();
    expect(r.steps.find((s) => s.step === "write object")).toMatchObject({ ok: false });
    expect(r.steps.some((s) => s.step === "read object")).toBe(false);
    expect(r.steps.find((s) => s.step === "write object")?.hint).toMatch(/objectAdmin/);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { BadRequestException, NotFoundException } from "@nestjs/common";

vi.mock("../../src/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("../../src/common/models/FileBlob", () => ({
  FileBlobModel: { persist: vi.fn() },
}));

// NoticesService.update/remove fire-and-forget cleanupStoredFile() for a
// replaced/removed image. Mocked at this boundary (rather than trying to
// stub fs.unlink + FileBlobModel.deleteByFilename, which the FileBlobModel
// mock above doesn't even provide) so NoticesService's own unit tests don't
// depend on that utility's internals - see cleanup-stored-file.test.ts for
// those.
vi.mock("../../src/common/upload/cleanup-stored-file", () => ({
  cleanupStoredFile: vi.fn().mockResolvedValue(undefined),
}));

import { db } from "../../src/db";
import { FileBlobModel } from "../../src/common/models/FileBlob";
import { cleanupStoredFile } from "../../src/common/upload/cleanup-stored-file";
import { NoticesService } from "../../src/modules/notices/notices.service";

const dbMock = db as unknown as Record<"select" | "insert" | "update" | "delete", ReturnType<typeof vi.fn>>;
const persistMock = FileBlobModel.persist as unknown as ReturnType<typeof vi.fn>;
const cleanupStoredFileMock = cleanupStoredFile as unknown as ReturnType<typeof vi.fn>;

/**
 * A drizzle query builder is "thenable" at every stage of the chain (you can
 * `await` a `.where(...)`/`.orderBy(...)` call directly, or continue on to
 * `.returning()`) - this stub reproduces just enough of that shape for
 * NoticesService's calls: chain methods return the same object, and both
 * `await`-ing the chain directly and calling `.returning()` resolve to
 * `result`.
 */
function makeQuery(result: unknown) {
  const promise = Promise.resolve(result);
  const query: any = {
    from: vi.fn(() => query),
    where: vi.fn(() => query),
    orderBy: vi.fn(() => query),
    set: vi.fn(() => query),
    values: vi.fn(() => query),
    returning: vi.fn(() => promise),
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
  };
  return query;
}

const mockSelect = (rows: unknown[]) => dbMock.select.mockReturnValue(makeQuery(rows));
const mockInsert = (row: unknown) => dbMock.insert.mockReturnValue(makeQuery([row]));
const mockUpdate = (row: unknown) => dbMock.update.mockReturnValue(makeQuery([row]));
const mockDelete = (row: unknown) => dbMock.delete.mockReturnValue(makeQuery([row]));

const baseNotice = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 1,
  title: "Title",
  message: "Message",
  imageUrl: null,
  isActive: true,
  startAt: null as Date | null,
  endAt: null as Date | null,
  createdBy: 9,
  updatedBy: 9,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
  ...overrides,
});

describe("NoticesService", () => {
  let service: NoticesService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new NoticesService();
  });

  describe("listActive (OCD-565 schedule window)", () => {
    const now = new Date("2026-06-15T12:00:00Z");

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(now);
    });

    it("excludes a notice that hasn't started yet", async () => {
      const notStarted = baseNotice({ id: 1, startAt: new Date("2026-06-16T00:00:00Z"), endAt: null });
      mockSelect([notStarted]);
      const result = await service.listActive();
      expect(result).toEqual([]);
    });

    it("excludes a notice whose window has already ended", async () => {
      const ended = baseNotice({
        id: 2,
        startAt: new Date("2026-01-01T00:00:00Z"),
        endAt: new Date("2026-06-14T00:00:00Z"),
      });
      mockSelect([ended]);
      const result = await service.listActive();
      expect(result).toEqual([]);
    });

    it("includes a notice within its window and isActive=true", async () => {
      const within = baseNotice({
        id: 3,
        isActive: true,
        startAt: new Date("2026-01-01T00:00:00Z"),
        endAt: new Date("2026-12-31T00:00:00Z"),
      });
      mockSelect([within]);
      const result = await service.listActive();
      expect(result).toEqual([within]);
    });

    it("includes a notice within its window with a null endAt (never expires)", async () => {
      const openEnded = baseNotice({
        id: 4,
        isActive: true,
        startAt: new Date("2026-01-01T00:00:00Z"),
        endAt: null,
      });
      mockSelect([openEnded]);
      const result = await service.listActive();
      expect(result).toEqual([openEnded]);
    });

    it("excludes a notice within its window but isActive=false", async () => {
      const inactive = baseNotice({
        id: 5,
        isActive: false,
        startAt: new Date("2026-01-01T00:00:00Z"),
        endAt: new Date("2026-12-31T00:00:00Z"),
      });
      mockSelect([inactive]);
      const result = await service.listActive();
      expect(result).toEqual([]);
    });

    it("mixes inclusions and exclusions from a single fetch, preserving order", async () => {
      const notStarted = baseNotice({ id: 1, startAt: new Date("2026-06-16T00:00:00Z") });
      const ended = baseNotice({ id: 2, startAt: new Date("2026-01-01T00:00:00Z"), endAt: new Date("2026-06-14T00:00:00Z") });
      const visible = baseNotice({ id: 3, startAt: new Date("2026-01-01T00:00:00Z"), endAt: new Date("2026-12-31T00:00:00Z") });
      const inactive = baseNotice({ id: 4, isActive: false, startAt: new Date("2026-01-01T00:00:00Z") });
      mockSelect([notStarted, ended, visible, inactive]);
      const result = await service.listActive();
      expect(result).toEqual([visible]);
    });
  });

  describe("listAll", () => {
    it("returns every row regardless of isActive or schedule window", async () => {
      const rows = [baseNotice({ id: 1, isActive: false }), baseNotice({ id: 2 })];
      mockSelect(rows);
      const result = await service.listAll();
      expect(result).toEqual(rows);
    });
  });

  describe("create", () => {
    it("persists startAt/endAt from the dto and defaults isActive to true", async () => {
      const created = baseNotice({ id: 10 });
      mockInsert(created);
      const result = await service.create(
        { title: "T", message: "M", startAt: "2026-01-01T00:00:00.000Z" } as any,
        9,
      );
      expect(dbMock.insert).toHaveBeenCalled();
      const valuesArg = (dbMock.insert.mock.results[0].value as any).values.mock.calls[0][0];
      expect(valuesArg.startAt).toEqual(new Date("2026-01-01T00:00:00.000Z"));
      expect(valuesArg.endAt).toBeNull();
      expect(valuesArg.isActive).toBe(true);
      expect(result).toEqual(created);
    });

    it("rejects when endAt is not after startAt", async () => {
      await expect(
        service.create(
          {
            title: "T",
            message: "M",
            startAt: "2026-01-10T00:00:00.000Z",
            endAt: "2026-01-01T00:00:00.000Z",
          } as any,
          9,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(dbMock.insert).not.toHaveBeenCalled();
    });

    it("rejects when endAt equals startAt", async () => {
      await expect(
        service.create(
          {
            title: "T",
            message: "M",
            startAt: "2026-01-10T00:00:00.000Z",
            endAt: "2026-01-10T00:00:00.000Z",
          } as any,
          9,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it("persists a durable copy of the uploaded image via FileBlobModel", async () => {
      mockInsert(baseNotice());
      const image = { filename: "img.png", mimetype: "image/png", path: "/tmp/img.png" } as any;
      persistMock.mockResolvedValue(undefined);
      await service.create({ title: "T", message: "M", startAt: "2026-01-01T00:00:00.000Z" } as any, 9, image);
      expect(persistMock).toHaveBeenCalledWith(image);
    });
  });

  describe("update", () => {
    it("updates only the supplied fields without touching startAt/endAt when neither is sent", async () => {
      // update() now fetches the existing row unconditionally (it needs the
      // current imageUrl to clean up on a replace/remove - see the method's
      // header comment), so db.select() is called even when no schedule
      // field is sent; only startAt/endAt validation is still conditional.
      mockSelect([baseNotice({ id: 7 })]);
      mockUpdate(baseNotice({ id: 7, title: "New title" }));
      const result = await service.update(7, { title: "New title" } as any, 9);
      const setArg = (dbMock.update.mock.results[0].value as any).set.mock.calls[0][0];
      expect(setArg.title).toBe("New title");
      expect(setArg.startAt).toBeUndefined();
      expect(setArg.endAt).toBeUndefined();
      expect(result).toEqual(baseNotice({ id: 7, title: "New title" }));
    });

    it("throws NotFoundException when the row doesn't exist and no schedule field changed", async () => {
      mockSelect([]);
      await expect(service.update(999, { title: "X" } as any, 9)).rejects.toThrow(NotFoundException);
      expect(dbMock.update).not.toHaveBeenCalled();
    });

    it("throws NotFoundException if the row is deleted between the existence check and the update itself", async () => {
      mockSelect([baseNotice({ id: 999 })]);
      mockUpdate(undefined);
      await expect(service.update(999, { title: "X" } as any, 9)).rejects.toThrow(NotFoundException);
    });

    it("validates endAt > startAt against the merged, persisted values when only endAt is sent", async () => {
      mockSelect([baseNotice({ id: 7, startAt: new Date("2026-06-01T00:00:00Z"), endAt: null })]);
      await expect(
        service.update(7, { endAt: "2026-01-01T00:00:00.000Z" } as any, 9),
      ).rejects.toThrow(BadRequestException);
      expect(dbMock.update).not.toHaveBeenCalled();
    });

    it("allows updating endAt alone when it's after the persisted startAt", async () => {
      mockSelect([baseNotice({ id: 7, startAt: new Date("2026-01-01T00:00:00Z"), endAt: null })]);
      mockUpdate(baseNotice({ id: 7, endAt: new Date("2026-12-31T00:00:00Z") }));
      const result = await service.update(7, { endAt: "2026-12-31T00:00:00.000Z" } as any, 9);
      expect(result).toEqual(baseNotice({ id: 7, endAt: new Date("2026-12-31T00:00:00Z") }));
    });

    it("throws NotFoundException up front when the row doesn't exist and a schedule field changed", async () => {
      mockSelect([]);
      await expect(
        service.update(999, { startAt: "2026-01-01T00:00:00.000Z" } as any, 9),
      ).rejects.toThrow(NotFoundException);
      expect(dbMock.update).not.toHaveBeenCalled();
    });

    it("clears the image when removeImage is set and no new image is uploaded", async () => {
      mockSelect([baseNotice({ id: 7, imageUrl: "/uploads/others/old.png" })]);
      mockUpdate(baseNotice({ id: 7, imageUrl: null }));
      await service.update(7, { removeImage: true } as any, 9);
      const setArg = (dbMock.update.mock.results[0].value as any).set.mock.calls[0][0];
      expect(setArg.imageUrl).toBeNull();
      expect(cleanupStoredFileMock).toHaveBeenCalledWith("/uploads/others/old.png");
    });
  });

  describe("remove", () => {
    it("deletes the row", async () => {
      mockDelete(baseNotice({ id: 3 }));
      await expect(service.remove(3)).resolves.toBeUndefined();
    });

    it("throws NotFoundException when nothing was deleted", async () => {
      mockDelete(undefined);
      await expect(service.remove(404)).rejects.toThrow(NotFoundException);
    });

    it("cleans up the stored image when the deleted notice had one", async () => {
      mockDelete(baseNotice({ id: 3, imageUrl: "/uploads/others/old.png" }));
      await service.remove(3);
      expect(cleanupStoredFileMock).toHaveBeenCalledWith("/uploads/others/old.png");
    });

    it("skips cleanup when the deleted notice had no image", async () => {
      mockDelete(baseNotice({ id: 3, imageUrl: null }));
      await service.remove(3);
      expect(cleanupStoredFileMock).not.toHaveBeenCalled();
    });
  });
});

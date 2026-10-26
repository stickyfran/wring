import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	collectContactsBackup,
	exportContactsToFile,
	importContactsFromBackup,
} from "./contacts-backup";

const addFavoriteUserMock = vi.fn();
const getFavoriteNotesMock = vi.fn();
const putFavoriteNoteMock = vi.fn();
const setConversationPinnedMock = vi.fn();
const saveTextFileMock = vi.fn();
const getOrCreateConversationsStateMock = vi.fn();
const getGridMock = vi.fn();

vi.mock("$lib/api/users/favorites", () => ({
	addFavoriteUser: (...args: unknown[]) => addFavoriteUserMock(...args),
	getFavoriteNotes: (...args: unknown[]) => getFavoriteNotesMock(...args),
	putFavoriteNote: (...args: unknown[]) => putFavoriteNoteMock(...args),
}));

vi.mock("$lib/api/messaging/conversations", () => ({
	setConversationPinned: (...args: unknown[]) =>
		setConversationPinnedMock(...args),
}));

vi.mock("$lib/chat/conversations-context.svelte", () => ({
	getOrCreateConversationsState: (...args: unknown[]) =>
		getOrCreateConversationsStateMock(...args),
}));

vi.mock("$lib/grid/grid", () => ({
	getGrid: (...args: unknown[]) => getGridMock(...args),
}));

vi.mock("$lib/util/download", () => ({
	saveTextFile: (...args: unknown[]) => saveTextFileMock(...args),
}));

describe("contacts-backup", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		getFavoriteNotesMock.mockResolvedValue([]);
		getOrCreateConversationsStateMock.mockReturnValue({
			entries: [],
		});
		getGridMock.mockResolvedValue({ items: [] });
		addFavoriteUserMock.mockResolvedValue(undefined);
		putFavoriteNoteMock.mockResolvedValue(undefined);
		setConversationPinnedMock.mockResolvedValue(undefined);
	});

	it("collects contacts from favorite notes, conversations, and grid", async () => {
		getFavoriteNotesMock.mockResolvedValue([
			{ counterpartyId: 101, notes: "Best friend", phoneNumber: "+111" },
		]);

		getOrCreateConversationsStateMock.mockReturnValue({
			entries: [
				{
					data: {
						conversationId: "1:101",
						name: "John",
						favorite: true,
						pinned: true,
						participants: [{ profileId: 1 }, { profileId: 101 }],
					},
				},
				{
					data: {
						conversationId: "1:202",
						name: "Mike",
						favorite: false,
						pinned: true,
						participants: [{ profileId: 1 }, { profileId: 202 }],
					},
				},
			],
		});

		getGridMock.mockResolvedValue({
			items: [
				{ id: 303, type: "rendered", displayName: "Sam" },
			],
		});

		const backup = await collectContactsBackup(1);

		expect(backup.version).toBe(1);
		expect(backup.contactsCount).toBe(3);
		expect(backup.contacts).toEqual([
			{
				profileId: 101,
				name: "John",
				isFavorite: true,
				isPinned: true,
				notes: "Best friend",
				phoneNumber: "+111",
			},
			{
				profileId: 202,
				name: "Mike",
				isFavorite: false,
				isPinned: true,
			},
			{
				profileId: 303,
				name: "Sam",
				isFavorite: true,
				isPinned: false,
			},
		]);
	});

	it("exports contacts to file via saveTextFile", async () => {
		getFavoriteNotesMock.mockResolvedValue([
			{ counterpartyId: 101, notes: "Friend", phoneNumber: "" },
		]);

		const res = await exportContactsToFile(1);
		expect(res.count).toBe(1);
		expect(res.filename).toMatch(/^open_contacts_backup_\d{4}-\d{2}-\d{2}\.json$/);
		expect(saveTextFileMock).toHaveBeenCalledOnce();
	});

	it("imports contacts and restores favorites, notes, and pins", async () => {
		const rawJson = JSON.stringify({
			version: 1,
			contacts: [
				{
					profileId: 501,
					name: "Alex",
					isFavorite: true,
					isPinned: true,
					notes: "Gym buddy",
					phoneNumber: "555-1234",
				},
				{
					profileId: 502,
					name: "David",
					isFavorite: false,
					isPinned: true,
				},
			],
		});

		const progressUpdates: number[] = [];
		const result = await importContactsFromBackup(rawJson, 1, (curr) => {
			progressUpdates.push(curr);
		});

		expect(progressUpdates).toEqual([1, 2]);
		expect(result.importedCount).toBe(2);
		expect(result.favoritesCount).toBe(1);
		expect(result.pinnedCount).toBe(2);

		expect(addFavoriteUserMock).toHaveBeenCalledWith({ profileId: 501 });
		expect(putFavoriteNoteMock).toHaveBeenCalledWith({
			profileId: 501,
			note: { notes: "Gym buddy", phoneNumber: "555-1234" },
		});
		expect(setConversationPinnedMock).toHaveBeenCalledWith({
			conversationId: "1:501",
			pinned: true,
		});
		expect(setConversationPinnedMock).toHaveBeenCalledWith({
			conversationId: "1:502",
			pinned: true,
		});
	});

	it("throws on invalid json or empty contacts list", async () => {
		await expect(importContactsFromBackup("invalid json", 1)).rejects.toThrow(
			"Invalid JSON file content",
		);

		await expect(
			importContactsFromBackup(JSON.stringify({ contacts: [] }), 1),
		).rejects.toThrow("No valid contacts found in the backup to import");
	});
});

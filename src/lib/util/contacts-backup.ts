import { setConversationPinned } from "$lib/api/messaging/conversations";
import {
	addFavoriteUser,
	getFavoriteNotes,
	putFavoriteNote,
} from "$lib/api/users/favorites";
import { getOrCreateConversationsState } from "$lib/chat/conversations-context.svelte";
import { getGrid } from "$lib/grid/grid";
import { saveTextFile } from "$lib/util/download";

export interface BackupContact {
	profileId: number;
	name?: string;
	isFavorite: boolean;
	isPinned: boolean;
	notes?: string;
	phoneNumber?: string;
}

export interface ContactsBackupFile {
	version: 1;
	exportedAt: string;
	exportedFromProfileId: number;
	contactsCount: number;
	contacts: BackupContact[];
}

export async function collectContactsBackup(
	ourProfileId: number,
): Promise<ContactsBackupFile> {
	const contactsMap = new Map<number, BackupContact>();

	// 1. Fetch all favorite notes from API
	try {
		const notes = await getFavoriteNotes();
		for (const note of notes) {
			const existing = contactsMap.get(note.counterpartyId);
			if (existing) {
				existing.isFavorite = true;
				if (note.notes) existing.notes = note.notes;
				if (note.phoneNumber) existing.phoneNumber = note.phoneNumber;
			} else {
				contactsMap.set(note.counterpartyId, {
					profileId: note.counterpartyId,
					isFavorite: true,
					isPinned: false,
					notes: note.notes || undefined,
					phoneNumber: note.phoneNumber || undefined,
				});
			}
		}
	} catch (error) {
		console.warn("Could not fetch favorite notes for backup:", error);
	}

	// 2. Scan conversation entries for pinned and favorite chats
	try {
		const conversations = getOrCreateConversationsState(ourProfileId);
		for (const entry of conversations.entries) {
			const isFav = Boolean(entry.data.favorite);
			const isPin = Boolean(entry.data.pinned);
			if (!isFav && !isPin) continue;

			const peer = entry.data.participants.find(
				(p) => p.profileId !== ourProfileId,
			);
			const peerId =
				peer?.profileId ??
				Number(
					entry.data.conversationId
						.split(":")
						.map(Number)
						.find((id) => id !== ourProfileId),
				);

			if (peerId && !isNaN(peerId)) {
				const existing = contactsMap.get(peerId);
				if (existing) {
					existing.isFavorite = existing.isFavorite || isFav;
					existing.isPinned = existing.isPinned || isPin;
					if (!existing.name && entry.data.name) {
						existing.name = entry.data.name;
					}
				} else {
					contactsMap.set(peerId, {
						profileId: peerId,
						name: entry.data.name || undefined,
						isFavorite: isFav,
						isPinned: isPin,
					});
				}
			}
		}
	} catch (error) {
		console.warn("Could not inspect conversations for backup:", error);
	}

	// 3. Scan grid favorites if available
	try {
		const grid = await getGrid({ favorites: true, nearbyGeoHash: "" });
		for (const item of grid.items) {
			const profileId =
				item.id ?? (item as unknown as { profileId?: number }).profileId;
			if (!profileId || profileId === ourProfileId) continue;
			const displayName =
				item.type === "rendered"
					? item.displayName || undefined
					: (item as unknown as { displayName?: string }).displayName ||
						undefined;
			const existing = contactsMap.get(profileId);
			if (existing) {
				existing.isFavorite = true;
				if (!existing.name && displayName) {
					existing.name = displayName;
				}
			} else {
				contactsMap.set(profileId, {
					profileId,
					name: displayName,
					isFavorite: true,
					isPinned: false,
				});
			}
		}
	} catch {
		// Ignore grid error if offline or unavailable
	}

	const contacts = Array.from(contactsMap.values()).sort((a, b) => {
		if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
		if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
		return (a.name || "").localeCompare(b.name || "");
	});

	return {
		version: 1,
		exportedAt: new Date().toISOString(),
		exportedFromProfileId: ourProfileId,
		contactsCount: contacts.length,
		contacts,
	};
}

export async function exportContactsToFile(
	ourProfileId: number,
): Promise<{ count: number; filename: string; json: string }> {
	const backup = await collectContactsBackup(ourProfileId);
	const dateStr = new Date().toISOString().slice(0, 10);
	const filename = `open_contacts_backup_${dateStr}.json`;
	const json = JSON.stringify(backup, null, 2);
	saveTextFile(json, filename);
	return { count: backup.contacts.length, filename, json };
}

export async function importContactsFromBackup(
	rawContent: string,
	ourProfileId: number,
	onProgress?: (current: number, total: number) => void,
): Promise<{
	importedCount: number;
	favoritesCount: number;
	pinnedCount: number;
	errorsCount: number;
}> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(rawContent);
	} catch {
		throw new Error("Invalid JSON file content");
	}

	let contactsList: BackupContact[] = [];
	if (
		parsed &&
		typeof parsed === "object" &&
		"contacts" in parsed &&
		Array.isArray((parsed as { contacts: unknown[] }).contacts)
	) {
		contactsList = (parsed as { contacts: BackupContact[] }).contacts;
	} else if (Array.isArray(parsed)) {
		contactsList = parsed as BackupContact[];
	} else {
		throw new Error("JSON does not contain a valid contacts list");
	}

	const validContacts = contactsList.filter(
		(c) =>
			c &&
			typeof c.profileId === "number" &&
			!isNaN(c.profileId) &&
			c.profileId > 0 &&
			c.profileId !== ourProfileId,
	);

	if (validContacts.length === 0) {
		throw new Error("No valid contacts found in the backup to import");
	}

	let importedCount = 0;
	let favoritesCount = 0;
	let pinnedCount = 0;
	let errorsCount = 0;

	for (let i = 0; i < validContacts.length; i++) {
		const contact = validContacts[i]!;
		onProgress?.(i + 1, validContacts.length);
		let hasSuccess = false;

		// 1. Restore favorite & note
		if (contact.isFavorite) {
			try {
				await addFavoriteUser({ profileId: contact.profileId });
				favoritesCount++;
				hasSuccess = true;
				if (contact.notes || contact.phoneNumber) {
					await putFavoriteNote({
						profileId: contact.profileId,
						note: {
							notes: contact.notes || "",
							phoneNumber: contact.phoneNumber || "",
						},
					});
				}
			} catch (e) {
				console.warn(
					`Failed to restore favorite for ${contact.profileId}:`,
					e,
				);
				errorsCount++;
			}
		}

		// 2. Restore pinned conversation
		if (contact.isPinned) {
			try {
				const [p1, p2] =
					ourProfileId < contact.profileId
						? [ourProfileId, contact.profileId]
						: [contact.profileId, ourProfileId];
				const conversationId = `${p1}:${p2}`;
				await setConversationPinned({
					conversationId,
					pinned: true,
				});
				pinnedCount++;
				hasSuccess = true;
			} catch (e) {
				// It's normal to fail pinning if no chat history exists on this account yet
				console.warn(
					`Could not pin chat for ${contact.profileId} (may require prior message):`,
					e,
				);
			}
		}

		if (hasSuccess) importedCount++;
	}

	return {
		importedCount,
		favoritesCount,
		pinnedCount,
		errorsCount,
	};
}

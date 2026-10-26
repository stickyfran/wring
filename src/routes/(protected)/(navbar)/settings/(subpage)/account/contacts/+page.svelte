<script lang="ts">
	import CheckCircleIcon from "phosphor-svelte/lib/CheckCircleIcon";
	import CopyIcon from "phosphor-svelte/lib/CopyIcon";
	import DownloadSimpleIcon from "phosphor-svelte/lib/DownloadSimpleIcon";
	import PushPinIcon from "phosphor-svelte/lib/PushPinIcon";
	import StarIcon from "phosphor-svelte/lib/StarIcon";
	import UploadSimpleIcon from "phosphor-svelte/lib/UploadSimpleIcon";
	import { onMount } from "svelte";
	import { toast } from "svelte-sonner";

	import { page } from "$app/state";
	import { Button } from "$lib/components/ui/button";
	import * as Item from "$lib/components/ui/item";
	import {
		type BackupContact,
		collectContactsBackup,
		exportContactsToFile,
		importContactsFromBackup,
	} from "$lib/util/contacts-backup";

	const ourProfileId = $derived(
		(page.data.ourProfileId as number | undefined) ?? 0,
	);

	let contacts = $state<BackupContact[]>([]);
	let loading = $state(true);
	let exporting = $state(false);
	let importing = $state(false);
	let importProgress = $state("");
	let pastedJson = $state("");
	let showPasteArea = $state(false);
	let fileInput = $state<HTMLInputElement | null>(null);

	const favoritesCount = $derived(contacts.filter((c) => c.isFavorite).length);
	const pinnedCount = $derived(contacts.filter((c) => c.isPinned).length);

	async function loadCurrentContacts() {
		if (!ourProfileId) return;
		loading = true;
		try {
			const backup = await collectContactsBackup(ourProfileId);
			contacts = backup.contacts;
		} catch (e) {
			console.error("Failed to load contacts for backup:", e);
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		void loadCurrentContacts();
	});

	async function handleExport() {
		if (!ourProfileId) return;
		exporting = true;
		try {
			const result = await exportContactsToFile(ourProfileId);
			toast.success(
				`Exported ${result.count} contacts to ${result.filename}`,
			);
		} catch (error) {
			console.error("Export failed:", error);
			toast.error("Failed to export contacts");
		} finally {
			exporting = false;
		}
	}

	async function handleCopyJson() {
		if (!ourProfileId) return;
		exporting = true;
		try {
			const backup = await collectContactsBackup(ourProfileId);
			const json = JSON.stringify(backup, null, 2);
			if (navigator.clipboard) {
				await navigator.clipboard.writeText(json);
			} else {
				const clipboard =
					await import("@tauri-apps/plugin-clipboard-manager");
				await clipboard.writeText(json);
			}
			toast.success("Contacts JSON copied to clipboard");
		} catch (error) {
			console.error("Copy failed:", error);
			toast.error("Failed to copy contacts JSON");
		} finally {
			exporting = false;
		}
	}

	async function runImport(content: string) {
		if (!ourProfileId) return;
		importing = true;
		importProgress = "Starting import...";
		try {
			const res = await importContactsFromBackup(
				content,
				ourProfileId,
				(current, total) => {
					importProgress = `Restoring contact ${current} of ${total}...`;
				},
			);
			toast.success(
				`Import complete! Restored ${res.favoritesCount} favorites and ${res.pinnedCount} pinned chats.`,
			);
			pastedJson = "";
			showPasteArea = false;
			await loadCurrentContacts();
		} catch (error: unknown) {
			console.error("Import failed:", error);
			const msg =
				error instanceof Error
					? error.message
					: "Failed to import contacts";
			toast.error(msg);
		} finally {
			importing = false;
			importProgress = "";
		}
	}

	function handleFileSelected(event: Event) {
		const target = event.target as HTMLInputElement;
		const file = target.files?.[0];
		if (!file) return;

		const reader = new FileReader();
		reader.onload = (e) => {
			const text = e.target?.result as string;
			if (text) {
				void runImport(text);
			}
		};
		reader.readAsText(file);
		target.value = "";
	}
</script>

<svelte:head>
	<title>Backup & Restore Contacts</title>
</svelte:head>

<div class="flex flex-col gap-6 p-4">
	<!-- Description card -->
	<div class="flex flex-col gap-2 rounded-xl border bg-card p-4 text-sm text-muted-foreground">
		<h2 class="text-base font-semibold text-foreground">
			Contacts Backup & Migration
		</h2>
		<p>
			Export your favorite contacts, notes, and pinned chats into a portable backup.
			If you create or switch to another account, you can import this backup to restore them all with one click.
		</p>
	</div>

	<!-- Export Section -->
	<div class="flex flex-col gap-3">
		<h3 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
			Export Contacts
		</h3>

		<Item.Root variant="outline">
			<Item.Content class="gap-1">
				<Item.Title>Current Account Contacts</Item.Title>
				<Item.Description>
					{#if loading}
						Scanning contacts...
					{:else}
						Found {contacts.length} contacts ({favoritesCount} favorites, {pinnedCount} pinned)
					{/if}
				</Item.Description>
			</Item.Content>
		</Item.Root>

		<div class="flex flex-wrap gap-2">
			<Button
				variant="default"
				class="gap-2 cursor-pointer"
				disabled={exporting || loading || contacts.length === 0}
				onclick={handleExport}
			>
				<DownloadSimpleIcon class="size-4" />
				{exporting ? "Exporting..." : "Download Backup File (.json)"}
			</Button>

			<Button
				variant="secondary"
				class="gap-2 cursor-pointer"
				disabled={exporting || loading || contacts.length === 0}
				onclick={handleCopyJson}
			>
				<CopyIcon class="size-4" />
				Copy JSON
			</Button>
		</div>
	</div>

	<!-- Import Section -->
	<div class="flex flex-col gap-3">
		<h3 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
			Import Contacts
		</h3>

		<input
			bind:this={fileInput}
			type="file"
			accept=".json,application/json"
			class="hidden"
			onchange={handleFileSelected}
		/>

		<div class="flex flex-wrap gap-2">
			<Button
				variant="secondary"
				class="gap-2 cursor-pointer"
				disabled={importing}
				onclick={() => fileInput?.click()}
			>
				<UploadSimpleIcon class="size-4" />
				Select Backup File (.json)
			</Button>

			<Button
				variant="ghost"
				class="cursor-pointer"
				disabled={importing}
				onclick={() => (showPasteArea = !showPasteArea)}
			>
				{showPasteArea ? "Hide Paste Area" : "Paste JSON Directly"}
			</Button>
		</div>

		{#if showPasteArea}
			<div class="flex flex-col gap-2 rounded-xl border p-3 bg-muted/30">
				<label for="json-paste-input" class="text-xs font-medium text-foreground">
					Paste your contacts JSON content below:
				</label>
				<textarea
					id="json-paste-input"
					bind:value={pastedJson}
					placeholder={`{\n  "contacts": [\n    { "profileId": 123456, "isFavorite": true, "isPinned": true }\n  ]\n}`}
					rows={6}
					class="w-full rounded-md border bg-background p-2 font-mono text-xs focus-visible:ring-1 focus-visible:outline-none"
				></textarea>
				<Button
					variant="default"
					disabled={importing || !pastedJson.trim()}
					onclick={() => runImport(pastedJson.trim())}
					class="self-end cursor-pointer"
				>
					Restore from Pasted JSON
				</Button>
			</div>
		{/if}

		{#if importing}
			<div class="flex items-center gap-2 text-sm text-accent">
				<div class="size-3 animate-spin rounded-full border-2 border-accent border-t-transparent"></div>
				<span>{importProgress}</span>
			</div>
		{/if}
	</div>

	<!-- Contacts List Preview -->
	{#if contacts.length > 0}
		<div class="flex flex-col gap-3 pt-2">
			<h3 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
				Contacts Included in Backup ({contacts.length})
			</h3>

			<div class="flex flex-col gap-2">
				{#each contacts as contact (contact.profileId)}
					<Item.Root variant="outline">
						<Item.Content class="gap-1 min-w-0">
							<Item.Title class="truncate">
								{contact.name || `Profile #${contact.profileId}`}
							</Item.Title>
							{#if contact.notes}
								<Item.Description class="truncate italic">
									"{contact.notes}"
								</Item.Description>
							{/if}
						</Item.Content>

						<Item.Actions class="shrink-0 gap-1.5 text-xs text-muted-foreground">
							{#if contact.isFavorite}
								<span class="flex items-center gap-0.5 rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-500 font-medium">
									<StarIcon weight="fill" class="size-3.5" />
									Fav
								</span>
							{/if}
							{#if contact.isPinned}
								<span class="flex items-center gap-0.5 rounded-full bg-accent/10 px-2 py-0.5 text-accent font-medium">
									<PushPinIcon weight="fill" class="size-3.5" />
									Pinned
								</span>
							{/if}
						</Item.Actions>
					</Item.Root>
				{/each}
			</div>
		</div>
	{/if}
</div>

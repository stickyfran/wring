<script lang="ts">
	import { onMount } from "svelte";
	import { toast } from "svelte-sonner";

	import { preferencesLoaded } from "$lib/app-data/preferences.svelte";
	import { Button } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import * as Item from "$lib/components/ui/item";
	import { Spinner } from "$lib/components/ui/spinner";
	import SwitchField from "$lib/components/ui/switch-field/SwitchField.svelte";
	import { getNtfySettings, sendTestNtfy, setNtfySettings } from "$lib/push";
	import type { NtfySettings } from "$lib/push/types";

	let settings = $state<NtfySettings>({
		enabled: false,
		server: "https://ntfy.sh",
		topic: "",
	});
	let testing = $state(false);

	onMount(() => {
		void getNtfySettings().then((s) => {
			settings = s;
		});
	});

	async function updateSettings(partial: Partial<NtfySettings>) {
		settings = { ...settings, ...partial };
		try {
			await setNtfySettings(settings);
		} catch (error) {
			console.error("Failed to save ntfy settings:", error);
			toast.error("Failed to save ntfy settings");
		}
	}

	async function testNtfy() {
		if (!settings.topic.trim()) {
			toast.error("Please enter an ntfy topic first");
			return;
		}
		testing = true;
		try {
			await sendTestNtfy(settings);
			toast.success("Test notification sent successfully to ntfy!");
		} catch (error) {
			console.error("Failed to send test notification:", error);
			toast.error(
				"Failed to send test notification. Check server URL and topic.",
			);
		} finally {
			testing = false;
		}
	}
</script>

<div class="mt-4 flex flex-col gap-2">
	<h2 class="px-1 text-sm font-semibold tracking-tight text-foreground/80">
		ntfy Push (No Google Services)
	</h2>

	<SwitchField
		title="ntfy push notifications"
		description="Receive push notifications via ntfy without Google Play Services or microG."
		disabled={!preferencesLoaded()}
		bind:checked={
			() => settings.enabled,
			(newValue: boolean) => void updateSettings({ enabled: newValue })
		}
	/>

	{#if settings.enabled}
		<Item.Root
			variant="outline"
			class="flex flex-col items-stretch gap-3 rounded-2xl p-4 border-border"
		>
			<div class="flex flex-col gap-1.5">
				<label
					for="ntfy-server"
					class="text-xs font-medium text-muted-foreground"
				>
					ntfy Server URL
				</label>
				<Input
					id="ntfy-server"
					type="url"
					placeholder="https://ntfy.sh"
					value={settings.server}
					onchange={(e) => {
						const target = e.currentTarget;
						if (target instanceof HTMLInputElement) {
							void updateSettings({
								server: target.value.trim() || "https://ntfy.sh",
							});
						}
					}}
				/>
			</div>

			<div class="flex flex-col gap-1.5">
				<label
					for="ntfy-topic"
					class="text-xs font-medium text-muted-foreground"
				>
					ntfy Topic Name
				</label>
				<Input
					id="ntfy-topic"
					type="text"
					placeholder="e.g. my_secret_topic_12345"
					value={settings.topic}
					onchange={(e) => {
						const target = e.currentTarget;
						if (target instanceof HTMLInputElement) {
							void updateSettings({ topic: target.value.trim() });
						}
					}}
				/>
				<p class="text-xs text-muted-foreground">
					Use the same topic name in your ntfy Android/Desktop app to receive alerts.
				</p>
			</div>

			<div class="flex justify-end pt-1">
				<Button
					variant="secondary"
					size="sm"
					disabled={testing || !settings.topic.trim()}
					onclick={testNtfy}
				>
					{#if testing}
						<Spinner class="me-2 size-4" />
						Sending...
					{:else}
						Send test ntfy push
					{/if}
				</Button>
			</div>
		</Item.Root>
	{/if}
</div>

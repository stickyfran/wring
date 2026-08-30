<script lang="ts">
	import CommandCenter from "$lib/components/command-center/CommandCenter.svelte";
	import { syncBackgroundServiceState } from "$lib/platform/notifications";
	import { startOnlineHeartbeat } from "$lib/presence/online-heartbeat";

	let { data, children }: import("./$types").LayoutProps = $props();

	$effect(() => startOnlineHeartbeat());
	$effect(() => {
		syncBackgroundServiceState();
	});
</script>

{@render children()}
<CommandCenter />

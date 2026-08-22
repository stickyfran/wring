declare global {
	interface Window {
		__reapplyInsets: () => unknown;
		__AndroidInsets?: {
			top(): number;
			bottom(): number;
			left(): number;
			right(): number;
			imeVisible?(): boolean;
		};
		__AndroidOnBackGesture?: () => boolean;
		__AndroidBack?: { moveTaskToBack(): void };
		__AndroidNotification?: {
			showNotification(id: number, title: string, body: string, conversationId: string): void;
			requestPermission(): void;
			startBackgroundService?(): void;
			stopBackgroundService?(): void;
		};
	}
}

export {};

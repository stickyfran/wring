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
			showNotification(
				id: number,
				title: string,
				body: string,
				conversationId: string,
			): void;
			requestPermission(): void;
			syncCredentials?(token: string, profileId: number): void;
			startBackgroundService?(): void;
			stopBackgroundService?(): void;
			requestIgnoreBatteryOptimizations?(): void;
			openNotificationSettings?(): void;
		};
		__AndroidDownload?: {
			download(url: string, filename?: string): void;
			downloadToSubdir?(
				url: string,
				filename?: string,
				subDir?: string,
			): void;
			saveTextFileToSubdir?(
				content: string,
				filename: string,
				subDir?: string,
			): void;
		};
	}
}

export {};

export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export type InstallState = {
  available: boolean;
  ios: boolean;
  standalone: boolean;
  installed: boolean;
  busy: boolean;
  message: string;
};

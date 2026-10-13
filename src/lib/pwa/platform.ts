export function isIOSDevice(navigator: Pick<Navigator, "userAgent" | "platform" | "maxTouchPoints">): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function isWindowsDevice(device: Pick<Navigator, 'userAgent' | 'platform'>): boolean {
  return !/Android|iPhone|iPad|iPod|Windows Phone/i.test(device.userAgent) &&
    (/Windows NT/i.test(device.userAgent) || /^Win/i.test(device.platform));
}

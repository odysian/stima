const HOME_ROUTE = "/";

interface CaptureLocationState {
  launchOrigin?: string;
}

interface ResolveCaptureLaunchOriginOptions {
  customerId?: string;
  draftCustomerId?: string;
  draftLaunchOrigin?: string;
  locationState: unknown;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function createCaptureLocationState(launchOrigin: string): CaptureLocationState {
  return { launchOrigin };
}

export function readCaptureLaunchOrigin(locationState: unknown): string | null {
  if (!isObject(locationState)) {
    return null;
  }

  const { launchOrigin } = locationState;
  return typeof launchOrigin === "string" && launchOrigin.length > 0 ? launchOrigin : null;
}

export function resolveCaptureLaunchOrigin({
  customerId,
  draftCustomerId,
  draftLaunchOrigin,
  locationState,
}: ResolveCaptureLaunchOriginOptions): string {
  const locationOrigin = readCaptureLaunchOrigin(locationState);
  if (locationOrigin) {
    return locationOrigin;
  }

  if (customerId && draftCustomerId === customerId && typeof draftLaunchOrigin === "string") {
    return draftLaunchOrigin;
  }

  return HOME_ROUTE;
}

export { HOME_ROUTE };

import type {
  JournalServiceErrorCode,
  JournalServiceErrorDetails,
} from "./contracts";

type JournalService = JournalServiceErrorDetails["service"];

const ERROR_DETAILS: Record<
  JournalServiceErrorCode,
  Pick<JournalServiceErrorDetails, "message" | "action" | "retryable">
> = {
  "permission-denied": {
    message: "Permission was denied.",
    action: "Allow access in Settings, then try again.",
    retryable: false,
  },
  interrupted: {
    message: "The operation was interrupted.",
    action: "Return to the app and try again.",
    retryable: true,
  },
  "low-storage": {
    message: "There is not enough device storage.",
    action: "Free some storage, then try again.",
    retryable: true,
  },
  "asset-missing": {
    message: "The requested journal asset is missing.",
    action: "Restore the asset or choose another recording.",
    retryable: false,
  },
  "asset-corrupt": {
    message: "The requested journal asset cannot be read.",
    action: "Keep the original asset and try recovery again.",
    retryable: false,
  },
  "service-unavailable": {
    message: "This service is not available on this device.",
    action: "Try again on a supported device or after an app update.",
    retryable: false,
  },
  "native-failure": {
    message: "The device service failed unexpectedly.",
    action: "Try again. If the problem continues, restart the app.",
    retryable: true,
  },
};

const CODE_ALIASES: Record<string, JournalServiceErrorCode> = {
  PERMISSION_DENIED: "permission-denied",
  INTERRUPTED: "interrupted",
  LOW_STORAGE: "low-storage",
  ASSET_MISSING: "asset-missing",
  ASSET_CORRUPT: "asset-corrupt",
  UNAVAILABLE: "service-unavailable",
  SERVICE_UNAVAILABLE: "service-unavailable",
};

export class JournalServiceError extends Error {
  readonly details: JournalServiceErrorDetails;

  constructor(details: JournalServiceErrorDetails, options?: ErrorOptions) {
    super(details.message, options);
    this.name = "JournalServiceError";
    this.details = details;
  }
}

function errorCode(error: unknown): JournalServiceErrorCode {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = String(error.code).toUpperCase().replaceAll("-", "_");
    if (CODE_ALIASES[code]) {
      return CODE_ALIASES[code];
    }
  }

  const message =
    error instanceof Error
      ? error.message.toLowerCase()
      : typeof error === "string"
        ? error.toLowerCase()
        : "";
  if (message.includes("permission") || message.includes("denied")) {
    return "permission-denied";
  }
  if (message.includes("interrupt")) {
    return "interrupted";
  }
  if (message.includes("storage") || message.includes("disk full")) {
    return "low-storage";
  }
  if (message.includes("corrupt")) {
    return "asset-corrupt";
  }
  if (message.includes("missing") || message.includes("not found")) {
    return "asset-missing";
  }
  if (message.includes("unavailable") || message.includes("not implemented")) {
    return "service-unavailable";
  }
  return "native-failure";
}

export function normalizeNativeError(
  error: unknown,
  service: JournalService,
): JournalServiceError {
  if (error instanceof JournalServiceError) {
    return error;
  }
  const code = errorCode(error);
  return new JournalServiceError(
    { code, service, ...ERROR_DETAILS[code] },
    { cause: error },
  );
}

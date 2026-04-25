import { useCallback, useEffect } from "react";

import { useAuth } from "@/features/auth/hooks/useAuth";
import {
  registerOnlineTrigger,
  runOutboxPass,
  type OutboxEngineEvent,
} from "@/features/quotes/offline/outboxEngine";
import { useToast } from "@/ui/Toast";

export function OutboxSyncCoordinator(): React.ReactElement | null {
  const { user } = useAuth();
  const { show } = useToast();

  const onEvent = useCallback((event: OutboxEngineEvent) => {
    if (event.kind === "sync_success") {
      show({
        message: "A pending capture synced to your quote draft.",
        variant: "success",
      });
      return;
    }

    if (event.kind === "sync_terminal_failure") {
      show({
        message: "A pending capture could not sync. Open it to retry or delete.",
        variant: "warning",
        durationMs: null,
      });
      return;
    }

    show({
      message: "Sign in again to resume syncing pending captures.",
      variant: "warning",
      durationMs: null,
    });
  }, [show]);

  useEffect(() => {
    if (!user?.id) {
      return;
    }

    void runOutboxPass(user.id, { onEvent, forceAfterAuth: true });
    const cleanup = registerOnlineTrigger(user.id, { onEvent });
    return cleanup;
  }, [onEvent, user?.id]);

  return null;
}

import { useState } from "react";

import { SettingsSupportContactSheet } from "@/features/settings/components/SettingsSupportContactSheet";
import {
  supportContactService,
  type SupportContactCategory,
} from "@/features/settings/services/supportContactService";
import { Button } from "@/shared/components/Button";
import { SUPPORT_CONTACT_MESSAGE_MAX_CHARS } from "@/shared/lib/inputLimits";
import { Card } from "@/ui/Card";
import { Eyebrow } from "@/ui/Eyebrow";

export function SettingsSupportCard(): React.ReactElement {
  const [isSupportSheetOpen, setIsSupportSheetOpen] = useState(false);
  const [supportCategory, setSupportCategory] = useState<SupportContactCategory>("bug");
  const [supportMessage, setSupportMessage] = useState("");
  const [supportSubmitError, setSupportSubmitError] = useState<string | null>(null);
  const [supportSubmitSuccess, setSupportSubmitSuccess] = useState<string | null>(null);
  const [isSupportSubmitting, setIsSupportSubmitting] = useState(false);

  const openSupportSheet = () => {
    setSupportSubmitError(null);
    setSupportSubmitSuccess(null);
    setIsSupportSheetOpen(true);
  };

  const closeSupportSheet = () => {
    if (isSupportSubmitting) {
      return;
    }
    setIsSupportSheetOpen(false);
    setSupportSubmitError(null);
  };

  const submitSupportMessage = async () => {
    const trimmedMessage = supportMessage.trim();
    if (trimmedMessage.length === 0) {
      setSupportSubmitError("Please enter a message.");
      setSupportSubmitSuccess(null);
      return;
    }
    if (trimmedMessage.length > SUPPORT_CONTACT_MESSAGE_MAX_CHARS) {
      setSupportSubmitError(
        `Message must be ${SUPPORT_CONTACT_MESSAGE_MAX_CHARS.toLocaleString()} characters or fewer.`,
      );
      setSupportSubmitSuccess(null);
      return;
    }

    setSupportSubmitError(null);
    setSupportSubmitSuccess(null);
    setIsSupportSubmitting(true);
    try {
      const response = await supportContactService.submit({
        category: supportCategory,
        message: trimmedMessage,
      });
      setSupportSubmitSuccess(response.message);
      setSupportMessage("");
      setSupportCategory("bug");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Message could not be sent. Please try again.";
      setSupportSubmitError(message);
    } finally {
      setIsSupportSubmitting(false);
    }
  };

  return (
    <>
      <Card className="bg-surface-container-low p-4">
        <Eyebrow>Support</Eyebrow>
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-sm text-on-surface-variant">
            Reach out directly if something breaks or needs attention.
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="shrink-0 whitespace-nowrap px-3 py-2 text-xs"
            onClick={openSupportSheet}
          >
            Contact support
          </Button>
        </div>
      </Card>

      <SettingsSupportContactSheet
        open={isSupportSheetOpen}
        category={supportCategory}
        message={supportMessage}
        isSubmitting={isSupportSubmitting}
        submitError={supportSubmitError}
        submitSuccess={supportSubmitSuccess}
        onCategoryChange={setSupportCategory}
        onMessageChange={setSupportMessage}
        onSubmit={() => void submitSupportMessage()}
        onClose={closeSupportSheet}
      />
    </>
  );
}


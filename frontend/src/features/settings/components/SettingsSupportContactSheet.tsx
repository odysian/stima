import { Button } from "@/shared/components/Button";
import { FeedbackMessage } from "@/shared/components/FeedbackMessage";
import { SUPPORT_CONTACT_MESSAGE_MAX_CHARS } from "@/shared/lib/inputLimits";
import { Select } from "@/ui/Select";
import {
  Sheet,
  SheetBody,
  SheetCloseButton,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/ui/Sheet";

import type { SupportContactCategory } from "@/features/settings/services/supportContactService";

interface SettingsSupportContactSheetProps {
  open: boolean;
  category: SupportContactCategory;
  message: string;
  isSubmitting: boolean;
  submitError: string | null;
  submitSuccess: string | null;
  onCategoryChange: (value: SupportContactCategory) => void;
  onMessageChange: (value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}

const SUPPORT_CATEGORY_OPTIONS: ReadonlyArray<{ label: string; value: SupportContactCategory }> = [
  { label: "Something is broken", value: "bug" },
  { label: "Quote quality issue", value: "quote_quality" },
  { label: "Confusing workflow", value: "confusing_workflow" },
  { label: "Security/privacy concern", value: "security_privacy" },
  { label: "Other", value: "other" },
];

export function SettingsSupportContactSheet({
  open,
  category,
  message,
  isSubmitting,
  submitError,
  submitSuccess,
  onCategoryChange,
  onMessageChange,
  onSubmit,
  onClose,
}: SettingsSupportContactSheetProps): React.ReactElement {
  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose();
        }
      }}
      size="md"
      contentProps={{
        className: "bg-surface-container-lowest",
        "aria-describedby": "support-contact-description",
      }}
    >
      <SheetHeader>
        <div>
          <SheetTitle>Contact support</SheetTitle>
          <SheetDescription id="support-contact-description">
            Tell us what happened. Please do not include sensitive customer details unless
            necessary.
          </SheetDescription>
        </div>
        <SheetCloseButton />
      </SheetHeader>

      <SheetBody className="space-y-4">
        {submitSuccess ? (
          <p
            role="status"
            className="rounded-[var(--radius-document)] border border-success/30 bg-success-container px-4 py-3 text-sm text-success"
          >
            {submitSuccess}
          </p>
        ) : null}
        {submitError ? <FeedbackMessage variant="error">{submitError}</FeedbackMessage> : null}

        <Select
          id="support-category"
          label="Category"
          value={category}
          onChange={(event) => onCategoryChange(event.target.value as SupportContactCategory)}
        >
          {SUPPORT_CATEGORY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>

        <div className="space-y-1">
          <label htmlFor="support-message" className="text-sm font-medium text-on-surface">
            Message
          </label>
          <textarea
            id="support-message"
            rows={5}
            value={message}
            maxLength={SUPPORT_CONTACT_MESSAGE_MAX_CHARS}
            onChange={(event) => onMessageChange(event.target.value)}
            className="w-full rounded-[var(--radius-document)] border border-outline-variant/30 bg-surface-container-high p-4 text-sm text-on-surface outline-none transition-all focus:border-primary focus:bg-surface-container-lowest focus:ring-2 focus:ring-focus-ring"
            placeholder="Tell us what happened."
          />
          <p className="text-xs text-on-surface-variant">
            Please avoid customer names, addresses, and other sensitive details unless required to
            explain the issue.
          </p>
        </div>
      </SheetBody>

      <SheetFooter>
        <div className="flex w-full gap-2">
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="w-full"
            onClick={onSubmit}
            isLoading={isSubmitting}
          >
            Send
          </Button>
        </div>
      </SheetFooter>
    </Sheet>
  );
}

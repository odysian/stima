import { Button } from "@/shared/components/Button";
import { ScreenFooter } from "@/shared/components/ScreenFooter";

interface CaptureScreenFooterProps {
  extractionStage: string | null;
  localStatusCopy: string | null;
  canExtract: boolean;
  isExtracting: boolean;
  onExtract: () => void;
}

export function CaptureScreenFooter(props: CaptureScreenFooterProps): React.ReactElement {
  return (
    <ScreenFooter>
      <div className="mx-auto w-full max-w-2xl">
        {!props.extractionStage && props.localStatusCopy ? (
          <p className="mb-2 text-center text-sm font-medium text-on-surface-variant">
            {props.localStatusCopy}
          </p>
        ) : null}
        {props.extractionStage ? (
          <p className="mb-2 text-center text-sm font-medium text-on-surface-variant">
            {props.extractionStage}
          </p>
        ) : null}
        <Button
          variant="primary"
          className="w-full"
          disabled={!props.canExtract}
          isLoading={props.isExtracting}
          onClick={props.onExtract}
        >
          Extract Line Items
        </Button>
      </div>
    </ScreenFooter>
  );
}

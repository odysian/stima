import { Eyebrow } from "@/ui/Eyebrow";

export function ProfileDisplaySection({
  heading,
  children,
}: {
  heading?: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <section className="space-y-2">
      {heading ? <Eyebrow>{heading}</Eyebrow> : null}
      <div className="space-y-2">{children}</div>
    </section>
  );
}

export function ProfileValueRow({
  label,
  value,
  preserveWhitespace = false,
}: {
  label: string;
  value: string;
  preserveWhitespace?: boolean;
}): React.ReactElement {
  return (
    <dl className="flex items-start gap-3">
      <dt className="w-24 shrink-0 pt-0.5">
        <Eyebrow>{label}</Eyebrow>
      </dt>
      <dd
        className={`min-w-0 text-sm text-on-surface${preserveWhitespace ? " whitespace-pre-wrap" : ""}`}
      >
        {value}
      </dd>
    </dl>
  );
}

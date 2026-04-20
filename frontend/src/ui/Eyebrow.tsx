interface EyebrowProps {
  children: React.ReactNode;
  className?: string;
}

export function Eyebrow({ children, className }: EyebrowProps): React.ReactElement {
  return (
    <p className={["text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-outline", className].filter(Boolean).join(" ")}>
      {children}
    </p>
  );
}

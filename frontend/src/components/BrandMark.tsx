interface BrandMarkProps {
  className?: string;
}

export function BrandMark({ className = "" }: BrandMarkProps) {
  const classes = ["brand-mark", className].filter(Boolean).join(" ");

  return (
    <span aria-hidden="true" className={classes}>
      <img alt="" src="/brand/cagnard-app-icon.png" />
    </span>
  );
}

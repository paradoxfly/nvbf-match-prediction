import type { ReactNode } from 'react';

export function AuthHeading({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-2">
      <h1 className="text-3xl leading-none font-black tracking-[-1px]">{title}</h1>
      {children ? <p className="text-sm text-muted-foreground">{children}</p> : null}
    </div>
  );
}

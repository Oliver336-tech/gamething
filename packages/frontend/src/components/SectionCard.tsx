import { type ReactNode } from 'react';

type SectionCardProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
};

const SectionCard = ({ title, description, actions, children }: SectionCardProps) => (
  <section className="rounded-2xl border border-slate-800/80 bg-slate-900/70 p-4 shadow-lg shadow-black/30 backdrop-blur">
    <header className="mb-3 flex items-start justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold text-slate-50">{title}</h2>
        {description ? <p className="text-sm text-slate-400">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
    <div>{children}</div>
  </section>
);

export default SectionCard;

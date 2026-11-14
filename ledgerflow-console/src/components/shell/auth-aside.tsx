/**
 * Auth-screen hero. The thesis stated up front: this is a ledger, and money is
 * conserved. A short animated tape of debit/credit entries with a system total
 * that stays fixed — the double-entry idea made visible before you even log in.
 */
const TAPE = [
  { t: 'acquiring', debit: '−₹4,20,000', credit: '+₹4,20,000' },
  { t: 'payout.batch', debit: '−₹1,15,500', credit: '+₹1,15,500' },
  { t: 'refund', debit: '−₹2,300', credit: '+₹2,300' },
  { t: 'settlement', debit: '−₹88,000', credit: '+₹88,000' },
  { t: 'fee.capture', debit: '−₹640', credit: '+₹640' },
];

export function AuthAside() {
  return (
    <aside className="relative hidden overflow-hidden border-r border-line bg-ink-800 lg:block">
      <div className="flex h-full flex-col justify-between p-12">
        <div className="flex items-center gap-2.5">
          <div className="grid h-7 w-7 place-items-center rounded-md bg-action/15 font-mono text-sm text-action">≡</div>
          <span className="font-display text-lg font-semibold tracking-tight">LedgerFlow</span>
        </div>

        <div className="max-w-md">
          <h2 className="font-display text-3xl font-semibold leading-tight tracking-tight">
            Every rupee is<br />
            <span className="text-credit">accounted</span> for.
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-fg-muted">
            A double-entry wallet ledger with idempotent transfers, an append-only
            journal, and signed webhook delivery. Nothing is created or destroyed —
            only moved.
          </p>

          <div className="mt-8 rounded-xl border border-line bg-ink-700/60 p-4">
            <div className="flex items-center justify-between border-b border-line pb-2 text-2xs uppercase tracking-wider text-fg-faint">
              <span>Journal</span>
              <span>debit / credit</span>
            </div>
            <ul className="mt-1">
              {TAPE.map((row, i) => (
                <li
                  key={row.t}
                  className="flex items-center justify-between py-1.5 text-sm animate-fade-up"
                  style={{ animationDelay: `${i * 90}ms` }}
                >
                  <span className="font-mono text-2xs text-fg-muted">{row.t}</span>
                  <span className="flex gap-4 font-mono tabular">
                    <span className="text-debit">{row.debit}</span>
                    <span className="text-credit">{row.credit}</span>
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-1 flex items-center justify-between border-t border-line pt-2.5 text-sm">
              <span className="text-2xs uppercase tracking-wider text-fg-faint">System total (Δ)</span>
              <span className="font-mono tabular font-medium text-fg">₹0.00</span>
            </div>
          </div>
        </div>

        <p className="font-mono text-2xs text-fg-faint">idempotent · append-only · reconciled</p>
      </div>
    </aside>
  );
}

const TRUST_ITEMS = [
  { icon: "\u{1F6E1}\uFE0F", text: "Transactions securisees" },
  { icon: "\u{2705}", text: "Verification anti-fake" },
  { icon: "\u{1F4E6}", text: "Suivi de remise" },
  { icon: "\u{2B50}", text: "Vendeurs notes" },
];

export function TrustBanner() {
  return (
    <div className="trust-banner" role="complementary" aria-label="Garanties marketplace">
      {TRUST_ITEMS.map((item) => (
        <div key={item.text} className="trust-item">
          <span aria-hidden="true">{item.icon}</span>
          <span>{item.text}</span>
        </div>
      ))}
    </div>
  );
}

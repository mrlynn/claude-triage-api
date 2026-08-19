import type { Product } from "@/lib/products";

/**
 * Placeholder product art. Real photography would be better and is not the
 * point — this keeps the app self-contained with no external assets and no
 * image licensing question in a repo people will fork.
 */
export default function ProductArt({
  product,
  className = "",
}: {
  product: Product;
  className?: string;
}) {
  const [a, b] = product.art;
  return (
    <div
      className={`relative overflow-hidden rounded-lg ${className}`}
      style={{ background: `linear-gradient(150deg, ${a}, ${b})` }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 200 200" className="absolute inset-0 h-full w-full opacity-25">
        <path d="M-10 150 L60 70 L100 115 L150 55 L210 150 Z" fill="#F2EDE4" />
        <circle cx="158" cy="42" r="14" fill="#F2EDE4" opacity="0.7" />
      </svg>
    </div>
  );
}

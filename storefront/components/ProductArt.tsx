import Image from "next/image";
import type { Product } from "@/lib/products";
import { gearImage } from "@/lib/gear-images";

/**
 * Product imagery.
 *
 * Real photography when we have it, keyed by product slug; the original
 * gradient placeholder when we do not. The fallback stays because a product
 * added to `lib/products.ts` without a photo should render as a deliberate
 * abstract tile rather than as a broken image — and because the gradient is
 * genuinely fine, which is why it survived this long.
 *
 * Photos are local files under `public/gear/`, so `next/image` optimises them
 * at build time and there is no third-party host in the critical path. See
 * `lib/gear-images.ts` for why they are vendored rather than hot-linked.
 */
export default function ProductArt({
  product,
  className = "",
  priority = false,
  sizes = "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw",
}: {
  product: Product;
  className?: string;
  /** Set on above-the-fold images so Next preloads rather than lazy-loads. */
  priority?: boolean;
  sizes?: string;
}) {
  const photo = gearImage(product.slug);

  if (photo) {
    return (
      <div className={`relative overflow-hidden rounded-lg bg-pine/5 ${className}`}>
        <Image
          src={photo.src}
          alt={photo.alt}
          fill
          sizes={sizes}
          priority={priority}
          className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        />
      </div>
    );
  }

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

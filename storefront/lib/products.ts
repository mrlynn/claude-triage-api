/**
 * The Northwind catalog.
 *
 * These are the same products that appear in data/orders.json in the API
 * repo, so a ticket filed here references gear the triage service can
 * actually look up. Nothing is for sale — there is no cart, no checkout, and
 * no payment path. The catalog exists so that a workshop attendee filing a
 * complaint is complaining about a specific $189 jacket with a stated
 * warranty, which is what makes the policy handbook stop being abstract.
 */
export interface Product {
  slug: string;
  name: string;
  price_usd: number;
  category: "shells" | "packs" | "bottles" | "shelter" | "layers";
  blurb: string;
  detail: string;
  specs: { label: string; value: string }[];
  final_sale?: boolean;
  /** Tailwind gradient pair used for the placeholder art. */
  art: [string, string];
}

export const PRODUCTS: Product[] = [
  {
    slug: "ridgeline-3l-shell",
    name: "Ridgeline 3L Shell Jacket",
    price_usd: 189,
    category: "shells",
    blurb: "Three-layer waterproof shell for sustained weather.",
    detail:
      "Built for days when it does not stop. A three-layer membrane, fully taped seams, and a helmet-compatible hood. Cut long at the back so it still covers when you are leaning into a climb.",
    specs: [
      { label: "Waterproofing", value: "20,000mm, fully taped" },
      { label: "Weight", value: "418g (M)" },
      { label: "Main zipper", value: "YKK AquaGuard, storm-flapped" },
      { label: "Warranty", value: "Lifetime workmanship guarantee" },
    ],
    art: ["#1F3D33", "#2F6F5E"],
  },
  {
    slug: "trailhead-30l-daypack",
    name: "Trailhead 30L Daypack",
    price_usd: 94,
    category: "packs",
    blurb: "A day pack that carries like a much better pack.",
    detail:
      "Thirty litres, a framesheet that actually transfers load to the hip belt, and a lid pocket you can find in the dark. Sized for a long day out rather than a commute.",
    specs: [
      { label: "Volume", value: "30L" },
      { label: "Weight", value: "890g" },
      { label: "Fabric", value: "420D recycled ripstop" },
      { label: "Warranty", value: "Lifetime workmanship guarantee" },
    ],
    art: ["#2F6F5E", "#5C9A86"],
  },
  {
    slug: "basecamp-bottle-32",
    name: "Basecamp Insulated Bottle 32oz",
    price_usd: 42.5,
    category: "bottles",
    blurb: "Holds temperature for a day and a night.",
    detail:
      "Double-walled stainless with a vacuum seal, a lid that does not leak in a pack, and a mouth wide enough for ice. Dishwasher safe.",
    specs: [
      { label: "Capacity", value: "32oz / 946ml" },
      { label: "Cold retention", value: "24 hours" },
      { label: "Liner", value: "18/8 stainless, unlined" },
      { label: "Warranty", value: "Lifetime workmanship guarantee" },
    ],
    art: ["#5C9A86", "#8FC3B0"],
  },
  {
    slug: "summit-expedition-tent-4p",
    name: "Summit Expedition Tent 4P",
    price_usd: 640,
    category: "shelter",
    blurb: "Four-season shelter for exposed ground.",
    detail:
      "A geodesic pole structure that holds its shape under load, a full-coverage fly, and two vestibules big enough for packs and boots. Heavy, because the alternative is worse.",
    specs: [
      { label: "Capacity", value: "4 person, 4 season" },
      { label: "Packed weight", value: "5.8kg" },
      { label: "Poles", value: "DAC Featherlite NSL, 9.5mm" },
      { label: "Warranty", value: "Lifetime workmanship guarantee" },
    ],
    art: ["#1F3D33", "#5C9A86"],
  },
  {
    slug: "merino-liner-gloves",
    name: "Merino Liner Gloves",
    price_usd: 29.4,
    category: "layers",
    blurb: "The layer you forget until you need it.",
    detail:
      "Fine-gauge merino with a conductive fingertip so you are not taking them off to read a map. Thin enough to wear under a shell mitt.",
    specs: [
      { label: "Fabric", value: "17.5 micron merino" },
      { label: "Weight", value: "38g (pair)" },
      { label: "Sizes", value: "XS to XL" },
      { label: "Warranty", value: "Lifetime workmanship guarantee" },
    ],
    art: ["#8A9A93", "#5C9A86"],
  },
  {
    slug: "ridgeline-trail-pant",
    name: "Ridgeline Trail Pant",
    price_usd: 129,
    category: "layers",
    blurb: "Softshell trousers with a gusset that works.",
    detail:
      "Wind-resistant softshell, articulated knees, and a diamond gusset so you can take a high step without the whole trouser moving with you.",
    specs: [
      { label: "Fabric", value: "Softshell, DWR treated" },
      { label: "Weight", value: "395g (32)" },
      { label: "Inseams", value: "30, 32, 34" },
      { label: "Warranty", value: "Lifetime workmanship guarantee" },
    ],
    art: ["#2F6F5E", "#8A9A93"],
  },
  {
    slug: "northwind-merino-crew",
    name: "Northwind Merino Crew",
    price_usd: 78,
    category: "layers",
    blurb: "Wear it four days. Nobody will know.",
    detail:
      "A midweight merino crew that regulates when you are working hard and does not hold odour when you are not. Flatlock seams so it sits under a pack.",
    specs: [
      { label: "Fabric", value: "220gsm merino" },
      { label: "Weight", value: "245g (M)" },
      { label: "Seams", value: "Flatlock, pack-friendly" },
      { label: "Warranty", value: "Lifetime workmanship guarantee" },
    ],
    art: ["#5C9A86", "#F2EDE4"],
  },
  {
    slug: "clearance-beanie",
    name: "Ridge Beanie",
    price_usd: 20,
    category: "layers",
    blurb: "Last season's colourway. Final sale.",
    detail:
      "Same beanie, previous season's dye lot. Marked down and marked final sale, which means it is one of the few things we cannot take back — see the returns policy below.",
    specs: [
      { label: "Fabric", value: "Merino blend" },
      { label: "Fit", value: "Cuffed, one size" },
      { label: "Returns", value: "Final sale, not returnable" },
      { label: "Warranty", value: "Lifetime workmanship guarantee" },
    ],
    final_sale: true,
    art: ["#8A9A93", "#D9642A"],
  },
];

export function getProduct(slug: string): Product | undefined {
  return PRODUCTS.find((p) => p.slug === slug);
}

export function usd(n: number): string {
  return `$${n.toFixed(2).replace(/\.00$/, "")}`;
}

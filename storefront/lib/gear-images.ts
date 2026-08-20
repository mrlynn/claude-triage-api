/**
 * Photography for the storefront, and who took it.
 *
 * VENDORED, NOT HOT-LINKED. The files live in `public/gear/` and are served by
 * this app. `ProductArt` used to be a gradient placeholder whose comment said
 * it "keeps the app self-contained with no external assets" — that concern was
 * right, and the fix is to own the bytes rather than to keep the placeholder.
 * A `<img src="https://images.unsplash.com/…">` would add a third-party
 * runtime dependency to a fictional shop, break offline, and 404 the day a
 * photographer removes a photo.
 *
 * Every image is from Unsplash. The Unsplash License permits commercial and
 * non-commercial use without permission and does not strictly require
 * attribution — but this is a repo people fork and read, and someone's work is
 * being used to make a fake company look real. Credit is cheap and it is the
 * decent default, so attribution lives in the same record as the file path and
 * renders at `/credits`.
 *
 * NOTE ON WHAT IS DEPICTED: these are generic outdoor scenes with no legible
 * brand marks, chosen deliberately. Photographs of an identifiable real
 * brand's products, presented as the catalogue of a fictional competitor,
 * would be a trademark problem regardless of the photo's licence.
 *
 * Sizes are capped at 800px on the long edge (1600 for full-bleed) and
 * re-encoded at q80 progressive. Serve what the layout needs, not what the
 * camera produced.
 */

export interface GearImage {
  /** Path under public/. */
  src: string;
  /** Describes the photo for someone who cannot see it. Never the product name. */
  alt: string;
  photographer: string;
  /** Unsplash username, without the @. */
  username: string;
  /** Unsplash photo id, so an image can be traced back to its source. */
  photoId: string;
  width: number;
  height: number;
}

export const GEAR_IMAGES: Record<string, GearImage> = {
  "hero-basecamp": {
    src: "/gear/hero-basecamp.jpg",
    alt: "A low tent pitched on a rocky shoreline at sunrise, with mist over a lake and mountains behind.",
    photographer: "Daan Weijers",
    username: "daanweijers",
    photoId: "pSaEMIiUO84",
    width: 1600,
    height: 1067,
  },
  "band-trail": {
    src: "/gear/band-trail.jpg",
    alt: "A hiker in a blue shell walking a narrow trail through autumn forest.",
    photographer: "Gantas Vaičiulėnas",
    username: "gantas",
    photoId: "Re-zztQZ_Ks",
    width: 1600,
    height: 1067,
  },
  "ridgeline-3l-shell": {
    src: "/gear/ridgeline-3l-shell.jpg",
    alt: "The back of a hooded orange and navy waterproof shell in wet forest.",
    photographer: "Andy Køgl",
    username: "thevisiter",
    photoId: "uhaYQSVCjo0",
    width: 533,
    height: 800,
  },
  "trailhead-30l-daypack": {
    src: "/gear/trailhead-30l-daypack.jpg",
    alt: "Two loaded backpacks standing in grass with mountains behind.",
    photographer: "S&B Vonlanthen",
    username: "blavon",
    photoId: "D75_5tWZDQ4",
    width: 800,
    height: 600,
  },
  "basecamp-bottle-32": {
    src: "/gear/basecamp-bottle-32.jpg",
    alt: "An insulated bottle and an enamel mug on frosted grass, mountains in the distance.",
    photographer: "Jisu Han",
    username: "makeitcount",
    photoId: "V4DEVYXwdYo",
    width: 800,
    height: 532,
  },
  "summit-expedition-tent-4p": {
    src: "/gear/summit-expedition-tent-4p.jpg",
    alt: "A red dome tent on a green slope below a snow-covered mountain range.",
    photographer: "Dino Reichmuth",
    username: "dinoreichmuth",
    photoId: "pl1mhwMctJc",
    width: 800,
    height: 533,
  },
  "merino-liner-gloves": {
    src: "/gear/merino-liner-gloves.jpg",
    alt: "A patterned knitted glove held up against falling snow.",
    photographer: "Tamara Gak",
    username: "tamara_photography",
    photoId: "qLhOOuVHDtE",
    width: 640,
    height: 800,
  },
  "ridgeline-trail-pant": {
    src: "/gear/ridgeline-trail-pant.jpg",
    alt: "A walker in red on a rocky path between bare trees.",
    photographer: "Bryan Walker",
    username: "bryanmillarwalker",
    photoId: "ystvHRDnjFE",
    width: 533,
    height: 800,
  },
  "northwind-merino-crew": {
    src: "/gear/northwind-merino-crew.jpg",
    alt: "Close view of a grey marled knit sweater and beanie outdoors.",
    photographer: "Daniel Silva Gaxiola",
    username: "_el_silver_",
    photoId: "XzUaef-Rtcg",
    width: 800,
    height: 533,
  },
  "clearance-beanie": {
    src: "/gear/clearance-beanie.jpg",
    alt: "A mustard-yellow knitted beanie pulled down, cream sweater, snow behind.",
    photographer: "Tamara Gak",
    username: "tamara_photography",
    photoId: "EyjuHdVCwpU",
    width: 716,
    height: 800,
  },
};

/** Undefined for a product with no photo — callers fall back to the gradient. */
export function gearImage(key: string): GearImage | undefined {
  return GEAR_IMAGES[key];
}

/** One row per photographer, for the credits page. */
export function credits(): { photographer: string; username: string; count: number }[] {
  const by = new Map<string, { photographer: string; username: string; count: number }>();
  for (const img of Object.values(GEAR_IMAGES)) {
    const row = by.get(img.username);
    if (row) row.count += 1;
    else by.set(img.username, { photographer: img.photographer, username: img.username, count: 1 });
  }
  return [...by.values()].sort((a, b) => a.photographer.localeCompare(b.photographer));
}

import React, { useState } from "react";

const POSTER_IMAGE = "https://images.unsplash.com/photo-1560179707-f14e90ef3623?w=600&q=80";
const MOCKUP_IMAGES = [
  { url: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=900&q=80", label: "Living Room" },
  { url: "https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?w=900&q=80", label: "Bedroom" },
  { url: "https://images.unsplash.com/photo-1493552152660-f915ab47ae9d?w=900&q=80", label: "Office" },
];

const SIZES = [
  { id: 1, label: "30×40 cm", price: "€29.00" },
  { id: 2, label: "50×70 cm", price: "€49.00" },
  { id: 3, label: "70×100 cm", price: "€79.00" },
];

function MockupLightbox({ onClose }: { onClose: () => void }) {
  const [active, setActive] = useState(0);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="relative bg-white rounded-2xl overflow-hidden max-w-4xl w-full shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 w-9 h-9 rounded-full bg-black/20 hover:bg-black/40 text-white flex items-center justify-center transition-colors text-xl leading-none"
        >
          ×
        </button>

        <div className="aspect-[16/9] bg-stone-100 overflow-hidden">
          <img
            src={MOCKUP_IMAGES[active].url}
            alt={MOCKUP_IMAGES[active].label}
            className="w-full h-full object-cover"
          />
        </div>

        <div className="p-4 flex gap-3 border-t border-stone-100">
          {MOCKUP_IMAGES.map((img, idx) => (
            <button
              key={idx}
              onClick={() => setActive(idx)}
              className={`relative rounded-lg overflow-hidden border-2 transition-all ${
                active === idx ? "border-stone-800" : "border-transparent opacity-50 hover:opacity-80"
              }`}
              style={{ width: 80, height: 56 }}
            >
              <img src={img.url} alt={img.label} className="w-full h-full object-cover" />
              <div className="absolute bottom-0 inset-x-0 bg-black/40 text-white text-[10px] text-center py-0.5 font-medium">
                {img.label}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Redesign() {
  const [selectedSize, setSelectedSize] = useState<number | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#faf9f7] font-sans">
      {lightboxOpen && <MockupLightbox onClose={() => setLightboxOpen(false)} />}

      <div className="max-w-5xl mx-auto px-6 py-8">
        <a href="#" className="inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-800 mb-6 transition-colors">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          Back to shop
        </a>

        <div className="grid grid-cols-1 md:grid-cols-[380px_1fr] gap-10 items-start">

          {/* Left: compact image + mockup button */}
          <div className="flex flex-col gap-3">
            <div className="relative rounded-xl overflow-hidden bg-stone-100 shadow-md" style={{ aspectRatio: "3/4", maxHeight: 420 }}>
              <img
                src={POSTER_IMAGE}
                alt="Barcelona Night Skyline"
                className="w-full h-full object-cover"
              />
            </div>

            <button
              onClick={() => setLightboxOpen(true)}
              className="w-full flex items-center justify-center gap-2 border border-stone-300 rounded-lg py-2.5 text-sm font-medium text-stone-700 hover:bg-stone-100 hover:border-stone-400 transition-all bg-white"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>
              </svg>
              See in a room
              <span className="text-stone-400 text-xs ml-0.5">(3 mockups)</span>
            </button>
          </div>

          {/* Right: product info */}
          <div className="flex flex-col pt-1">
            <p className="text-xs font-semibold tracking-widest uppercase text-stone-400 mb-1.5">
              Catalonia · Barcelona
            </p>
            <h1 className="font-serif text-3xl font-bold text-stone-900 leading-tight mb-2">
              Barcelona Night Skyline
            </h1>
            <p className="text-xl font-semibold text-stone-800 mb-5">From €29.00</p>

            <p className="text-stone-500 text-sm leading-relaxed mb-7">
              A stunning nighttime view of Barcelona's iconic skyline, capturing the warm glow of the city lights reflected in the Mediterranean. Perfect for lovers of art, travel, and Spanish culture.
            </p>

            <div className="mb-6">
              <p className="text-sm font-semibold text-stone-700 mb-2.5">Select size</p>
              <div className="grid grid-cols-3 gap-2.5">
                {SIZES.map((s) => {
                  const active = selectedSize === s.id;
                  return (
                    <button
                      key={s.id}
                      onClick={() => setSelectedSize(s.id)}
                      className={`flex flex-col items-start rounded-lg border-2 px-3 py-2.5 text-left transition-all ${
                        active
                          ? "border-stone-800 bg-stone-50"
                          : "border-stone-200 bg-white hover:border-stone-400"
                      }`}
                    >
                      <span className="text-xs font-semibold text-stone-700">{s.label}</span>
                      <span className={`text-sm font-bold mt-0.5 ${active ? "text-stone-900" : "text-stone-600"}`}>
                        {s.price}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <button className="w-full flex items-center justify-center gap-2 bg-stone-900 hover:bg-stone-700 text-white font-semibold text-sm rounded-xl py-3.5 transition-colors mb-3">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4zM3 6h18M16 10a4 4 0 01-8 0"/></svg>
              Add to cart
            </button>

            <div className="mt-5 pt-5 border-t border-stone-100">
              <div className="flex flex-wrap gap-1.5">
                {["Spain", "Barcelona", "Nightlife", "Architecture", "Skyline"].map(tag => (
                  <span key={tag} className="px-2.5 py-0.5 rounded-full bg-stone-100 text-stone-500 text-xs font-medium hover:bg-stone-200 cursor-pointer transition-colors">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Related posters section */}
        <div className="mt-14 pt-8 border-t border-stone-200">
          <h2 className="font-serif text-xl font-bold text-stone-800 mb-5">More from Catalonia</h2>
          <div className="grid grid-cols-4 gap-4">
            {[
              { title: "Sagrada Família", price: "€29.00", img: "https://images.unsplash.com/photo-1539037116277-4db20889f2d4?w=400&q=70" },
              { title: "Park Güell", price: "€29.00", img: "https://images.unsplash.com/photo-1583779457094-ab6f77f7bf57?w=400&q=70" },
              { title: "Las Ramblas", price: "€29.00", img: "https://images.unsplash.com/photo-1562883676-8c7feb83f09b?w=400&q=70" },
              { title: "Gothic Quarter", price: "€29.00", img: "https://images.unsplash.com/photo-1511739001486-6bfe10ce785f?w=400&q=70" },
            ].map((p) => (
              <div key={p.title} className="group cursor-pointer">
                <div className="aspect-[3/4] rounded-lg overflow-hidden bg-stone-100 mb-2 shadow-sm">
                  <img src={p.img} alt={p.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                </div>
                <p className="text-xs font-semibold text-stone-700 truncate">{p.title}</p>
                <p className="text-xs text-stone-400">{p.price}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

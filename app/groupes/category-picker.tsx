"use client";

import { CATEGORIES, FAMILIES, MAX_CATEGORIES, MIN_CATEGORIES } from "@/lib/catalog";

/**
 * Les catégories d'un groupe, choisies dans le catalogue rangé par famille.
 * Partagé entre la création d'un groupe et ses réglages : de 3 à 10, et
 * « Autre » toujours offert en plus.
 */
export default function CategoryPicker({ picked, onChange }: { picked: string[]; onChange: (p: string[]) => void }) {
  const full = picked.length >= MAX_CATEGORIES;
  const toggle = (k: string) =>
    onChange(picked.includes(k) ? picked.filter((x) => x !== k) : full ? picked : [...picked, k]);

  return (
    <>
      <p className="rg-hint">
        De {MIN_CATEGORIES} à {MAX_CATEGORIES} catégories — « Autre » s&apos;y ajoute toujours.{" "}
        <b className={"ng-count" + (picked.length >= MIN_CATEGORIES ? " ok" : "")}>{picked.length} choisie{picked.length > 1 ? "s" : ""}</b>
      </p>
      {FAMILIES.map((f) => (
        <div className="ng-family" key={f.label}>
          <h3>{f.label}</h3>
          <div className="rg-chips">
            {f.keys.map((k) => {
              const c = CATEGORIES[k];
              const on = picked.includes(k);
              return (
                <button key={k} type="button" aria-pressed={on} disabled={!on && full}
                  className={"ng-cat" + (on ? " on" : "")} style={{ "--c": c.color } as React.CSSProperties}
                  onClick={() => toggle(k)}>
                  {c.emoji} {c.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}
